#include "nvs_cfg.h"

#include <stdint.h>
#include <string.h>

#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

static const char *TAG = "cfg";

static bool load_str(nvs_handle_t h, const char *key, char *out, size_t cap) {
    size_t need = cap;
    if (nvs_get_str(h, key, out, &need) != ESP_OK) {
        out[0] = '\0';
        return false;
    }
    return strlen(out) > 0;
}

void zelenka_cfg_load(zelenka_cfg_t *out) {
    memset(out, 0, sizeof(*out));
    nvs_handle_t h;
    if (nvs_open(ZELENKA_NVS_NAMESPACE, NVS_READONLY, &h) != ESP_OK) {
        ESP_LOGI(TAG, "no NVS namespace yet — provisioning needed");
        return;
    }
    bool ok = true;
    ok &= load_str(h, NVS_KEY_WIFI_SSID,     out->wifi_ssid,     sizeof(out->wifi_ssid));
    load_str(h, NVS_KEY_WIFI_PASSWORD, out->wifi_password, sizeof(out->wifi_password));
    ok &= load_str(h, NVS_KEY_DEVICE_TOKEN,  out->device_token,  sizeof(out->device_token));
    if (!load_str(h, NVS_KEY_API_URL, out->api_url, sizeof(out->api_url))) {
        strncpy(out->api_url, CONFIG_ZELENKA_API_URL, sizeof(out->api_url) - 1);
    }
    nvs_close(h);
    out->present = ok;
    ESP_LOGI(TAG, "cfg load: ssid=%s token=%s url=%s present=%d",
             out->wifi_ssid, out->device_token[0] ? "<set>" : "<missing>",
             out->api_url, out->present);
}

bool zelenka_cfg_store(const char *ssid, const char *pass, const char *token, const char *api_url) {
    nvs_handle_t h;
    if (nvs_open(ZELENKA_NVS_NAMESPACE, NVS_READWRITE, &h) != ESP_OK) return false;
    bool ok = true;
    if (nvs_set_str(h, NVS_KEY_WIFI_SSID,     ssid)  != ESP_OK) ok = false;
    if (nvs_set_str(h, NVS_KEY_WIFI_PASSWORD, pass ? pass : "") != ESP_OK) ok = false;
    if (nvs_set_str(h, NVS_KEY_DEVICE_TOKEN,  token) != ESP_OK) ok = false;
    if (api_url && api_url[0]) {
        if (nvs_set_str(h, NVS_KEY_API_URL, api_url) != ESP_OK) ok = false;
    }
    if (nvs_commit(h) != ESP_OK) ok = false;
    nvs_close(h);
    return ok;
}

void zelenka_cfg_wipe(void) {
    nvs_handle_t h;
    if (nvs_open(ZELENKA_NVS_NAMESPACE, NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_all(h);
        nvs_commit(h);
        nvs_close(h);
    }
}

void zelenka_err_save(int reset_reason, const char *fw_version) {
    nvs_handle_t h;
    if (nvs_open(ZELENKA_ERR_NAMESPACE, NVS_READWRITE, &h) != ESP_OK) return;
    int32_t count = 0;
    nvs_get_i32(h, "count", &count);
    nvs_set_i32(h, "reason", (int32_t)reset_reason);
    nvs_set_i32(h, "count", count + 1);
    nvs_set_str(h, "fw", fw_version ? fw_version : "");
    nvs_commit(h);
    nvs_close(h);
    ESP_LOGW(TAG, "err saved: reason=%d count=%d fw=%s",
             reset_reason, (int)(count + 1), fw_version ? fw_version : "");
}

void zelenka_err_load(zelenka_err_t *out) {
    memset(out, 0, sizeof(*out));
    nvs_handle_t h;
    if (nvs_open(ZELENKA_ERR_NAMESPACE, NVS_READONLY, &h) != ESP_OK) return;
    int32_t reason = 0, count = 0;
    if (nvs_get_i32(h, "reason", &reason) == ESP_OK && nvs_get_i32(h, "count", &count) == ESP_OK && count > 0) {
        out->reset_reason = (int)reason;
        out->count = (int)count;
        size_t need = sizeof(out->fw_version);
        nvs_get_str(h, "fw", out->fw_version, &need);
        out->present = true;
    }
    nvs_close(h);
}

void zelenka_err_clear(void) {
    nvs_handle_t h;
    if (nvs_open(ZELENKA_ERR_NAMESPACE, NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_all(h);
        nvs_commit(h);
        nvs_close(h);
    }
}
