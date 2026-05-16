#include "http_post.h"

#include <stdio.h>
#include <string.h>

#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "sdkconfig.h"

static const char *TAG = "http";

// Largest body we'll emit. Keep generous — measurement JSON is well under 256.
#define BODY_MAX 384

static int append_float(char *buf, size_t cap, size_t off, const char *key,
                        float val, bool present, bool first) {
    if (!present) return off;
    return off + snprintf(buf + off, cap - off, "%s\"%s\":%.3f",
                          first ? "" : ",", key, val);
}

esp_err_t http_post_measurement(const sensor_reading_t *r) {
    if (strlen(CONFIG_ZELENKA_DEVICE_TOKEN) == 0) {
        ESP_LOGE(TAG, "device token not configured");
        return ESP_ERR_INVALID_STATE;
    }

    char body[BODY_MAX];
    size_t off = 0;
    bool first = true;
    off += snprintf(body + off, sizeof(body) - off, "{");

    if (r->has_bme280) {
        off = append_float(body, sizeof(body), off, "temperatureC",
                           r->temperature_c, true, first); first = false;
        off = append_float(body, sizeof(body), off, "humidityPct",
                           r->humidity_pct, true, first);
        off = append_float(body, sizeof(body), off, "pressureHpa",
                           r->pressure_hpa, true, first);
    }
    if (r->has_bh1750) {
        off = append_float(body, sizeof(body), off, "lux", r->lux, true, first);
        first = false;
    }
    if (r->has_soil) {
        off += snprintf(body + off, sizeof(body) - off,
                        "%s\"soilMoistureRaw\":%d", first ? "" : ",",
                        r->soil_moisture_raw);
        first = false;
    }
    off += snprintf(body + off, sizeof(body) - off, "}");

    char auth_header[160];
    snprintf(auth_header, sizeof(auth_header), "Bearer %s",
             CONFIG_ZELENKA_DEVICE_TOKEN);

    esp_http_client_config_t cfg = {
        .url = CONFIG_ZELENKA_API_URL,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 5000,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t cli = esp_http_client_init(&cfg);
    esp_http_client_set_header(cli, "Content-Type", "application/json");
    esp_http_client_set_header(cli, "Authorization", auth_header);
    esp_http_client_set_post_field(cli, body, off);

    esp_err_t err = esp_http_client_perform(cli);
    int status = esp_http_client_get_status_code(cli);
    if (err == ESP_OK && status >= 200 && status < 300) {
        ESP_LOGI(TAG, "posted ok (%d)", status);
    } else {
        ESP_LOGE(TAG, "post failed: err=%s status=%d", esp_err_to_name(err), status);
        err = ESP_FAIL;
    }
    esp_http_client_cleanup(cli);
    return err;
}
