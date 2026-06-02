#include "provisioning.h"

#include <stdio.h>
#include <string.h>
#include <sys/param.h>
#include <sys/socket.h>

#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lwip/inet.h"
#include "lwip/netdb.h"
#include "lwip/sockets.h"

#include "nvs_cfg.h"

static const char *TAG = "prov";

// ---- DNS hijack -----------------------------------------------------------

#define DNS_PORT 53

static void dns_task(void *arg) {
    (void)arg;
    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (sock < 0) { ESP_LOGE(TAG, "dns socket failed"); vTaskDelete(NULL); }
    struct sockaddr_in a = {
        .sin_family = AF_INET, .sin_port = htons(DNS_PORT), .sin_addr.s_addr = htonl(INADDR_ANY),
    };
    if (bind(sock, (struct sockaddr *)&a, sizeof(a)) < 0) {
        ESP_LOGE(TAG, "dns bind failed"); close(sock); vTaskDelete(NULL);
    }

    uint8_t buf[256];
    struct sockaddr_in client;
    socklen_t clen = sizeof(client);
    while (true) {
        int n = recvfrom(sock, buf, sizeof(buf), 0, (struct sockaddr *)&client, &clen);
        if (n < 12) continue;
        // Make a minimal answer: copy ID + flags, set as response, 1 answer, point to
        // 192.168.4.1 with TTL 60. Keep question intact.
        buf[2] = 0x81; buf[3] = 0x80;  // response, recursion available
        buf[6] = 0x00; buf[7] = 0x01;  // 1 answer
        buf[8] = 0x00; buf[9] = 0x00;
        buf[10] = 0x00; buf[11] = 0x00;

        // Find end of question (looking for terminating 0x00 then 4 type/class bytes).
        int qe = 12;
        while (qe < n && buf[qe] != 0) qe += buf[qe] + 1;
        qe += 5; // 0 + 2 type + 2 class
        if (qe + 16 > (int)sizeof(buf)) continue;

        // Answer: name pointer to offset 12, type A, class IN, TTL 60, RDLEN 4,
        // RDATA 192.168.4.1
        uint8_t *ans = buf + qe;
        ans[0] = 0xc0; ans[1] = 0x0c;
        ans[2] = 0x00; ans[3] = 0x01;
        ans[4] = 0x00; ans[5] = 0x01;
        ans[6] = 0x00; ans[7] = 0x00; ans[8] = 0x00; ans[9] = 0x3c;
        ans[10] = 0x00; ans[11] = 0x04;
        ans[12] = 192; ans[13] = 168; ans[14] = 4; ans[15] = 1;

        sendto(sock, buf, qe + 16, 0, (struct sockaddr *)&client, clen);
    }
}

// ---- HTTP captive portal --------------------------------------------------

static const char FORM_HTML[] =
    "<!doctype html><html lang='ru'><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<meta name='color-scheme' content='light dark'>"
    "<title>Zelenka — настройка</title>"
    "<style>"
    ":root{color-scheme:light dark}"
    "body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#fafafa;color:#111}"
    "h1{font-size:1.4rem;margin:0 0 4px}"
    "p{color:#666;margin:0 0 18px;font-size:.9rem}"
    "label{display:block;font-size:.85rem;margin:14px 0 4px;color:#333}"
    "input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px;font:inherit;background:#fff;color:#111}"
    "button{margin-top:20px;width:100%;padding:12px;background:#639922;color:#fff;border:0;border-radius:8px;font-weight:600;font-size:1rem}"
    "@media (prefers-color-scheme:dark){"
    "body{background:#0a0a0a;color:#fafafa}"
    "p{color:#a3a3a3}"
    "label{color:#d4d4d4}"
    "input{background:#171717;color:#fafafa;border-color:#404040}"
    "}"
    "</style></head><body>"
    "<h1>Подключение Zelenka</h1>"
    "<p>Введите Wi-Fi сети (только 2.4 ГГц) и токен растения из приложения.</p>"
    "<form method='POST' action='/save'>"
    "<label>Имя сети</label><input name='ssid' required maxlength='32' autofocus>"
    "<label>Пароль</label><input name='pass' type='password' maxlength='63'>"
    "<label>Токен растения</label><input name='token' id='token' required maxlength='63'>"
    "<button type='submit'>Сохранить</button>"
    "</form>"
    // Auto-fill the token from ?token=... in the URL — the PWA deep-links here
    // with the token already attached, so the user doesn't have to copy/paste.
    "<script>"
    "var t=new URLSearchParams(location.search).get('token');"
    "if(t){document.getElementById('token').value=t;}"
    "</script>"
    "</body></html>";

// On submit we render a page that polls the public Zelenka API; the device's
// AP is shutting down within a couple seconds, so as soon as the phone falls
// back to its remembered home Wi-Fi the health probe succeeds and we redirect
// straight into /claim?t=<token>. /claim is idempotent for the same user and
// already routes to /devices/<id>/setup, which is the "Ждём датчик" screen.
// `%s` slot is the URL-encoded device token, filled at request time.
static const char DONE_HTML_TMPL[] =
    "<!doctype html><html lang='ru'><head><meta charset='utf-8'>"
    "<meta name='color-scheme' content='light dark'>"
    "<title>Готово</title>"
    "<style>"
    ":root{color-scheme:light dark}"
    "body{font-family:system-ui;padding:32px 24px;background:#fafafa;color:#111;max-width:420px;margin:0 auto;text-align:center}"
    "h1{font-size:1.4rem;margin:0 0 12px}"
    "p{color:#666;margin:0 0 22px;line-height:1.5;font-size:.95rem}"
    ".spin{width:48px;height:48px;border:4px solid #eee;border-top-color:#639922;border-radius:50%%;margin:24px auto;animation:s 0.9s linear infinite}"
    "@keyframes s{to{transform:rotate(360deg)}}"
    "a.btn{display:inline-block;margin-top:8px;padding:12px 18px;background:#639922;color:#fff;border-radius:10px;font-weight:600;text-decoration:none;font-size:.95rem}"
    "@media (prefers-color-scheme:dark){"
    "body{background:#0a0a0a;color:#fafafa}"
    "p{color:#a3a3a3}"
    ".spin{border-color:#262626;border-top-color:#639922}"
    "}"
    "</style></head>"
    "<body>"
    "<h1>Сохранено</h1>"
    "<div class='spin'></div>"
    "<p>Переключите телефон обратно на ваш домашний Wi-Fi. Как только связь восстановится, мы сами откроем приложение.</p>"
    "<a class='btn' id='manual' href='https://zelenka-api.ru/claim?t=%s&wait=1'>Открыть вручную</a>"
    "<script>"
    "(function(){"
    "var url='https://zelenka-api.ru/claim?t=%s&wait=1';"
    "function probe(){"
    "fetch('https://zelenka-api.ru/api/healthz',{cache:'no-store'})"
    ".then(function(r){if(r.ok){location.replace(url);}else{setTimeout(probe,1500);}})"
    ".catch(function(){setTimeout(probe,1500);});"
    "}"
    "setTimeout(probe,2500);"
    "})();"
    "</script>"
    "</body></html>";

// RFC 8908/8910 — modern OSes treat this as authoritative "this is a captive
// network, the portal is at <URL>" without waiting for a probe to fail.
static void set_captive_header(httpd_req_t *req) {
    httpd_resp_set_hdr(req, "Captive-Portal", "http://192.168.4.1/");
}

static esp_err_t form_get(httpd_req_t *req) {
    set_captive_header(req);
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    return httpd_resp_send(req, FORM_HTML, HTTPD_RESP_USE_STRLEN);
}

static void url_decode_inplace(char *s) {
    char *r = s, *w = s;
    while (*r) {
        if (*r == '+') { *w++ = ' '; r++; }
        else if (*r == '%' && r[1] && r[2]) {
            char hex[3] = { r[1], r[2], 0 };
            *w++ = (char)strtol(hex, NULL, 16);
            r += 3;
        } else *w++ = *r++;
    }
    *w = '\0';
}

static bool extract_field(const char *body, const char *key, char *out, size_t cap) {
    char needle[24];
    snprintf(needle, sizeof(needle), "%s=", key);
    const char *p = strstr(body, needle);
    if (!p) return false;
    p += strlen(needle);
    const char *e = strchr(p, '&');
    size_t n = e ? (size_t)(e - p) : strlen(p);
    if (n >= cap) n = cap - 1;
    memcpy(out, p, n); out[n] = '\0';
    url_decode_inplace(out);
    return true;
}

static esp_err_t save_post(httpd_req_t *req) {
    char body[512] = {0};
    int total = 0;
    while (total < (int)sizeof(body) - 1) {
        int r = httpd_req_recv(req, body + total, sizeof(body) - 1 - total);
        if (r <= 0) break;
        total += r;
    }
    body[total] = '\0';

    char ssid[33] = {0}, pass[64] = {0}, token[64] = {0};
    extract_field(body, "ssid",  ssid,  sizeof(ssid));
    extract_field(body, "pass",  pass,  sizeof(pass));
    extract_field(body, "token", token, sizeof(token));

    if (ssid[0] == '\0' || token[0] == '\0') {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "ssid and token required");
        return ESP_OK;
    }

    if (!zelenka_cfg_store(ssid, pass, token, NULL)) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "nvs write failed");
        return ESP_OK;
    }

    // Render DONE_HTML_TMPL with the captured token spliced in twice (visible
    // fallback link + JS redirect target). Token in our flow is hex from the
    // QR claim, so no extra URL-encoding is necessary.
    static char done_buf[2048];
    int len = snprintf(done_buf, sizeof(done_buf), DONE_HTML_TMPL, token, token);
    if (len < 0 || len >= (int)sizeof(done_buf)) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "done page too big");
        return ESP_OK;
    }
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_send(req, done_buf, len);

    ESP_LOGI(TAG, "provisioned ssid=%s token=<set>; restarting in 2s", ssid);
    vTaskDelay(pdMS_TO_TICKS(2000));
    esp_restart();
    return ESP_OK;
}

// Catch-all: every non-/ GET (Apple's /hotspot-detect.html, Android's
// /generate_204, Windows' /ncsi.txt, Firefox's /canonical.html, …) gets a
// 302 to /. Empirically this triggers the OS-level captive sheet faster
// and more reliably than returning 200 + form HTML, which some probes
// classified as "internet works" depending on body parsing.
static esp_err_t catchall(httpd_req_t *req) {
    set_captive_header(req);
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "http://192.168.4.1/");
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    return httpd_resp_send(req, NULL, 0);
}

static httpd_handle_t start_http(void) {
    httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
    cfg.uri_match_fn = httpd_uri_match_wildcard;
    httpd_handle_t srv = NULL;
    if (httpd_start(&srv, &cfg) != ESP_OK) return NULL;
    httpd_uri_t u_root = { .uri = "/",      .method = HTTP_GET,  .handler = form_get  };
    httpd_uri_t u_save = { .uri = "/save",  .method = HTTP_POST, .handler = save_post };
    httpd_uri_t u_any  = { .uri = "/*",     .method = HTTP_GET,  .handler = catchall  };
    httpd_register_uri_handler(srv, &u_root);
    httpd_register_uri_handler(srv, &u_save);
    httpd_register_uri_handler(srv, &u_any);
    return srv;
}

static void on_wifi_ap_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
    (void)arg; (void)data;
    if (base != WIFI_EVENT) return;
    switch (id) {
        case WIFI_EVENT_AP_START:       ESP_LOGI(TAG, "AP started"); break;
        case WIFI_EVENT_AP_STOP:        ESP_LOGI(TAG, "AP stopped"); break;
        case WIFI_EVENT_AP_STACONNECTED: {
            wifi_event_ap_staconnected_t *e = data;
            ESP_LOGI(TAG, "client joined: %02x:%02x:%02x:%02x:%02x:%02x aid=%d",
                     e->mac[0], e->mac[1], e->mac[2], e->mac[3], e->mac[4], e->mac[5], e->aid);
            break;
        }
        case WIFI_EVENT_AP_STADISCONNECTED:
            ESP_LOGI(TAG, "client left");
            break;
    }
}

esp_err_t provisioning_run(void) {
    ESP_ERROR_CHECK(esp_netif_init());
    esp_netif_t *ap_netif = esp_netif_create_default_wifi_ap();

    wifi_init_config_t ic = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&ic));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &on_wifi_ap_event, NULL, NULL));

    uint8_t mac[6];
    esp_wifi_get_mac(WIFI_IF_AP, mac);
    wifi_config_t ap = {0};
    snprintf((char *)ap.ap.ssid, sizeof(ap.ap.ssid), "Zelenka-%02X%02X", mac[4], mac[5]);
    ap.ap.ssid_len = strlen((char *)ap.ap.ssid);
    ap.ap.channel = 1;
    ap.ap.authmode = WIFI_AUTH_OPEN;
    ap.ap.max_connection = 4;
    ap.ap.beacon_interval = 100;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap));
    ESP_ERROR_CHECK(esp_wifi_start());

    // Force DHCP to advertise the AP IP as DNS server (option 6). Without
    // this, Android/iOS won't route DNS to us → captive portal probes go to
    // the cellular interface or fail, neither pops the sheet.
    esp_netif_dhcps_stop(ap_netif);
    uint8_t opt_val = 1;  // OFFER_DNS
    esp_err_t e = esp_netif_dhcps_option(
        ap_netif, ESP_NETIF_OP_SET, ESP_NETIF_DOMAIN_NAME_SERVER, &opt_val, sizeof(opt_val));
    if (e != ESP_OK) ESP_LOGW(TAG, "dhcps option set failed: %s", esp_err_to_name(e));
    esp_netif_dhcps_start(ap_netif);

    ESP_LOGI(TAG, "SoftAP up: %s @ 192.168.4.1", ap.ap.ssid);

    xTaskCreate(dns_task, "dns_hijack", 4096, NULL, 5, NULL);
    httpd_handle_t srv = start_http();
    ESP_LOGI(TAG, "HTTP server %s", srv ? "started" : "FAILED to start");

    // Stay in SoftAP indefinitely. Successful POST /save calls esp_restart() —
    // that is the only exit. With the touch button gone, there is no other
    // way to re-arm provisioning, so a timeout would brick the device.
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(60000));
    }
    return ESP_OK;
}
