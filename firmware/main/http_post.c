#include "http_post.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"

static const char *TAG = "http";

#define BODY_MAX 2048

static int format_sample_json(char *buf, size_t cap, const sensor_reading_t *r, int64_t epoch_s) {
    size_t off = 0;
    bool first = true;
    off += snprintf(buf + off, cap - off, "{");

    if (epoch_s > 0) {
        char iso[32];
        struct tm tm;
        time_t t = (time_t)epoch_s;
        gmtime_r(&t, &tm);
        strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &tm);
        off += snprintf(buf + off, cap - off, "\"measuredAt\":\"%s\"", iso);
        first = false;
    }
    if (r->has_bme280) {
        off += snprintf(buf + off, cap - off,
                        "%s\"temperatureC\":%.3f,\"humidityPct\":%.3f,\"pressureHpa\":%.3f",
                        first ? "" : ",", r->temperature_c, r->humidity_pct, r->pressure_hpa);
        first = false;
    }
    if (r->has_bh1750) {
        off += snprintf(buf + off, cap - off, "%s\"lux\":%.3f", first ? "" : ",", r->lux);
        first = false;
    }
    if (r->has_soil) {
        off += snprintf(buf + off, cap - off, "%s\"soilMoistureRaw\":%d",
                        first ? "" : ",", r->soil_moisture_raw);
    }
    off += snprintf(buf + off, cap - off, "}");
    return (int)off;
}

esp_err_t http_post_batch(
    const char *api_url,
    const char *device_token,
    const sensor_reading_t *samples,
    const int64_t *epoch_seconds,
    size_t n
) {
    if (n == 0 || !device_token || !device_token[0]) return ESP_ERR_INVALID_ARG;

    char *body = malloc(BODY_MAX);
    if (!body) return ESP_ERR_NO_MEM;

    size_t off = 0;
    off += snprintf(body + off, BODY_MAX - off, "{\"samples\":[");
    for (size_t i = 0; i < n; i++) {
        if (i) off += snprintf(body + off, BODY_MAX - off, ",");
        off += format_sample_json(body + off, BODY_MAX - off, &samples[i],
                                  epoch_seconds ? epoch_seconds[i] : 0);
        if (off >= BODY_MAX - 16) break;
    }
    off += snprintf(body + off, BODY_MAX - off, "]}");

    char auth[128];
    snprintf(auth, sizeof(auth), "Bearer %s", device_token);

    esp_http_client_config_t cfg = {
        .url = api_url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t cli = esp_http_client_init(&cfg);
    esp_http_client_set_header(cli, "Content-Type", "application/json");
    esp_http_client_set_header(cli, "Authorization", auth);
    esp_http_client_set_post_field(cli, body, off);

    esp_err_t err = esp_http_client_perform(cli);
    int status = esp_http_client_get_status_code(cli);
    if (err == ESP_OK && status >= 200 && status < 300) {
        ESP_LOGI(TAG, "posted batch (%zu samples, %d)", n, status);
    } else {
        ESP_LOGE(TAG, "post failed: err=%s status=%d body=%.*s",
                 esp_err_to_name(err), status, (int)off, body);
        err = ESP_FAIL;
    }
    esp_http_client_cleanup(cli);
    free(body);
    return err;
}
