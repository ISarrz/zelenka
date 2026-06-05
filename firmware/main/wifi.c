#include "wifi.h"

#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

static const char *TAG = "wifi";

#define BIT_CONNECTED BIT0
#define BIT_FAILED    BIT1

static EventGroupHandle_t s_events;
static int s_retries = 0;

static void on_event(void *arg, esp_event_base_t base, int32_t id, void *data) {
    (void)arg; (void)data;
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t *e = (wifi_event_sta_disconnected_t *)data;
        int reason = e ? e->reason : -1;
        int rssi = e ? e->rssi : 0;
        if (s_retries++ < 5) {
            ESP_LOGW(TAG, "disconnected (reason %d, rssi %d), retry %d", reason, rssi, s_retries);
            esp_wifi_connect();
        } else {
            ESP_LOGE(TAG, "giving up after disconnect (last reason %d, rssi %d)", reason, rssi);
            xEventGroupSetBits(s_events, BIT_FAILED);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        // Some routers hand out a DNS server that doesn't actually resolve
        // (seen on MGTS GPON: getaddrinfo() fails even though the uplink is
        // fine). Force public resolvers so NTP and the HTTPS POST can always
        // turn zelenka-api.ru / pool.ntp.org into an address.
        esp_netif_t *sta = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
        if (sta) {
            esp_netif_dns_info_t d = {0};
            d.ip.type = ESP_IPADDR_TYPE_V4;
            d.ip.u_addr.ip4.addr = esp_ip4addr_aton("1.1.1.1");
            esp_netif_set_dns_info(sta, ESP_NETIF_DNS_MAIN, &d);
            d.ip.u_addr.ip4.addr = esp_ip4addr_aton("8.8.8.8");
            esp_netif_set_dns_info(sta, ESP_NETIF_DNS_BACKUP, &d);
        }
        s_retries = 0;
        xEventGroupSetBits(s_events, BIT_CONNECTED);
    }
}

esp_err_t wifi_connect_blocking(const char *ssid, const char *password) {
    s_events = xEventGroupCreate();

    static bool netif_inited = false;
    if (!netif_inited) {
        ESP_ERROR_CHECK(esp_netif_init());
        esp_netif_create_default_wifi_sta();
        wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
        ESP_ERROR_CHECK(esp_wifi_init(&cfg));
        netif_inited = true;
    }

    static bool handlers_registered = false;
    if (!handlers_registered) {
        ESP_ERROR_CHECK(esp_event_handler_instance_register(
            WIFI_EVENT, ESP_EVENT_ANY_ID, &on_event, NULL, NULL));
        ESP_ERROR_CHECK(esp_event_handler_instance_register(
            IP_EVENT, IP_EVENT_STA_GOT_IP, &on_event, NULL, NULL));
        handlers_registered = true;
    }

    wifi_config_t wc = {0};
    strncpy((char *)wc.sta.ssid, ssid, sizeof(wc.sta.ssid) - 1);
    if (password) strncpy((char *)wc.sta.password, password, sizeof(wc.sta.password) - 1);
    wc.sta.threshold.authmode = WIFI_AUTH_OPEN;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wc));
    ESP_ERROR_CHECK(esp_wifi_start());

    EventBits_t bits = xEventGroupWaitBits(
        s_events, BIT_CONNECTED | BIT_FAILED, pdFALSE, pdFALSE, pdMS_TO_TICKS(30000));

    if (bits & BIT_CONNECTED) {
        ESP_LOGI(TAG, "connected to %s", ssid);
        return ESP_OK;
    }
    ESP_LOGE(TAG, "wifi connect failed");
    return ESP_FAIL;
}
