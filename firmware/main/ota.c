#include "ota.h"

#include <string.h>

#include "esp_app_desc.h"
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_https_ota.h"
#include "esp_log.h"
#include "esp_ota_ops.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "ota";

const char *ota_running_version(void) {
    const esp_app_desc_t *d = esp_app_get_description();
    return d ? d->version : "?";
}

void ota_mark_valid_if_pending(void) {
    const esp_partition_t *running = esp_ota_get_running_partition();
    esp_ota_img_states_t state;
    if (running && esp_ota_get_state_partition(running, &state) == ESP_OK) {
        if (state == ESP_OTA_IMG_PENDING_VERIFY) {
            ESP_LOGI(TAG, "marking image %s valid", running->label);
            esp_ota_mark_app_valid_cancel_rollback();
        }
    }
}

void ota_base_from_url(const char *full_url, char *out, size_t out_size) {
    // full_url like "https://host/api/foo"; we want "https://host".
    out[0] = '\0';
    const char *scheme_end = strstr(full_url, "://");
    if (!scheme_end) return;
    const char *slash = strchr(scheme_end + 3, '/');
    size_t n = slash ? (size_t)(slash - full_url) : strlen(full_url);
    if (n >= out_size) n = out_size - 1;
    memcpy(out, full_url, n);
    out[n] = '\0';
}

// Tiny "find a key" JSON helper — we only need two string fields (version,
// url) out of the manifest, and pulling in a full JSON parser for that costs
// firmware bytes we'd rather spend on the OTA bundle itself.
static bool json_find_string(const char *body, const char *key, char *out, size_t cap) {
    char needle[40];
    snprintf(needle, sizeof(needle), "\"%s\"", key);
    const char *p = strstr(body, needle);
    if (!p) return false;
    p = strchr(p + strlen(needle), '"');
    if (!p) return false;
    p++; // first char of value
    const char *e = strchr(p, '"');
    if (!e) return false;
    size_t n = (size_t)(e - p);
    if (n >= cap) n = cap - 1;
    memcpy(out, p, n);
    out[n] = '\0';
    return true;
}

static esp_err_t fetch_manifest(const char *base, char *body, size_t cap) {
    char url[192];
    snprintf(url, sizeof(url), "%s/api/firmware/manifest.json", base);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 5000,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t cli = esp_http_client_init(&cfg);
    esp_err_t err = esp_http_client_open(cli, 0);
    if (err != ESP_OK) { esp_http_client_cleanup(cli); return err; }

    int content_length = esp_http_client_fetch_headers(cli);
    int status = esp_http_client_get_status_code(cli);
    if (status != 200) {
        ESP_LOGW(TAG, "manifest status %d", status);
        esp_http_client_close(cli);
        esp_http_client_cleanup(cli);
        return ESP_FAIL;
    }
    int total = 0, r;
    size_t need = content_length > 0 ? (size_t)content_length : cap - 1;
    if (need >= cap) need = cap - 1;
    while (total < (int)need && (r = esp_http_client_read(cli, body + total, need - total)) > 0) {
        total += r;
    }
    body[total] = '\0';
    esp_http_client_close(cli);
    esp_http_client_cleanup(cli);
    return ESP_OK;
}

esp_err_t ota_check_and_apply(const char *base) {
    char manifest[512];
    if (fetch_manifest(base, manifest, sizeof(manifest)) != ESP_OK) {
        ESP_LOGW(TAG, "manifest fetch failed");
        return ESP_FAIL;
    }

    char remote_version[32] = {0};
    char remote_url[192] = {0};
    if (!json_find_string(manifest, "version", remote_version, sizeof(remote_version)) ||
        !json_find_string(manifest, "url", remote_url, sizeof(remote_url))) {
        ESP_LOGW(TAG, "manifest missing version/url");
        return ESP_FAIL;
    }

    const char *running = ota_running_version();
    if (strcmp(running, remote_version) == 0) {
        ESP_LOGI(TAG, "running %s; manifest matches, nothing to do", running);
        return ESP_OK;
    }
    ESP_LOGI(TAG, "running %s, available %s — applying OTA", running, remote_version);

    char full_url[256];
    if (remote_url[0] == 'h') {
        // absolute URL
        snprintf(full_url, sizeof(full_url), "%s", remote_url);
    } else {
        snprintf(full_url, sizeof(full_url), "%s%s", base, remote_url);
    }

    esp_http_client_config_t http_cfg = {
        .url = full_url,
        .timeout_ms = 30000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .keep_alive_enable = true,
    };
    esp_https_ota_config_t ota_cfg = { .http_config = &http_cfg };
    esp_err_t err = esp_https_ota(&ota_cfg);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "OTA finished, rebooting");
        vTaskDelay(pdMS_TO_TICKS(500));
        esp_restart();
    } else {
        ESP_LOGE(TAG, "OTA failed: %s", esp_err_to_name(err));
    }
    return err;
}
