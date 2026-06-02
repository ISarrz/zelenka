#include "http_post.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"

static const char *TAG = "http";

#define BODY_MAX 2048
#define RESP_MAX 256

// Captures up to RESP_MAX-1 bytes of the response body into user_data, which
// the caller pre-zeros. Used to look for `pendingFactoryReset:true` in the
// JSON reply without bringing in a full parser.
static esp_err_t capture_response(esp_http_client_event_t *evt) {
    if (evt->event_id == HTTP_EVENT_ON_DATA && evt->user_data) {
        char *buf = (char *)evt->user_data;
        size_t cur = strlen(buf);
        size_t room = (cur >= RESP_MAX - 1) ? 0 : (RESP_MAX - 1 - cur);
        size_t copy = (size_t)evt->data_len < room ? (size_t)evt->data_len : room;
        if (copy > 0) {
            memcpy(buf + cur, evt->data, copy);
            buf[cur + copy] = 0;
        }
    }
    return ESP_OK;
}

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
        first = false;
    }
    if (r->has_battery) {
        off += snprintf(buf + off, cap - off, "%s\"batteryRaw\":%d",
                        first ? "" : ",", r->battery_raw);
        first = false;
        if (r->battery_mv >= 0) {
            off += snprintf(buf + off, cap - off, ",\"batteryMv\":%d", r->battery_mv);
        }
    }
    off += snprintf(buf + off, cap - off, "}");
    return (int)off;
}

esp_err_t http_post_batch(
    const char *api_url,
    const char *device_token,
    const sensor_reading_t *samples,
    const int64_t *epoch_seconds,
    size_t n,
    const http_post_meta_t *meta,
    bool *out_factory_reset
) {
    if (n == 0 || !device_token || !device_token[0]) return ESP_ERR_INVALID_ARG;
    if (out_factory_reset) *out_factory_reset = false;

    char *body = malloc(BODY_MAX);
    if (!body) return ESP_ERR_NO_MEM;
    char resp_buf[RESP_MAX] = {0};

    size_t off = 0;
    off += snprintf(body + off, BODY_MAX - off, "{\"samples\":[");
    for (size_t i = 0; i < n; i++) {
        if (i) off += snprintf(body + off, BODY_MAX - off, ",");
        off += format_sample_json(body + off, BODY_MAX - off, &samples[i],
                                  epoch_seconds ? epoch_seconds[i] : 0);
        if (off >= BODY_MAX - 16) break;
    }
    off += snprintf(body + off, BODY_MAX - off, "]");
    if (meta && (meta->firmware_version || meta->wifi_rssi)) {
        off += snprintf(body + off, BODY_MAX - off, ",\"device\":{");
        bool first = true;
        if (meta->firmware_version) {
            off += snprintf(body + off, BODY_MAX - off,
                            "\"firmwareVersion\":\"%s\"", meta->firmware_version);
            first = false;
        }
        if (meta->wifi_rssi) {
            off += snprintf(body + off, BODY_MAX - off,
                            "%s\"wifiRssi\":%d", first ? "" : ",", *meta->wifi_rssi);
        }
        off += snprintf(body + off, BODY_MAX - off, "}");
    }
    if (meta && meta->last_error) {
        const http_post_last_error_t *e = meta->last_error;
        off += snprintf(body + off, BODY_MAX - off,
                        ",\"lastError\":{\"resetReason\":%d,\"count\":%d",
                        e->reset_reason, e->count);
        if (e->firmware_version && e->firmware_version[0]) {
            off += snprintf(body + off, BODY_MAX - off,
                            ",\"firmwareVersion\":\"%s\"", e->firmware_version);
        }
        off += snprintf(body + off, BODY_MAX - off, "}");
    }
    off += snprintf(body + off, BODY_MAX - off, "}");

    char auth[128];
    snprintf(auth, sizeof(auth), "Bearer %s", device_token);

    esp_http_client_config_t cfg = {
        .url = api_url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = capture_response,
        .user_data = resp_buf,
    };
    esp_http_client_handle_t cli = esp_http_client_init(&cfg);
    esp_http_client_set_header(cli, "Content-Type", "application/json");
    esp_http_client_set_header(cli, "Authorization", auth);
    esp_http_client_set_post_field(cli, body, off);

    esp_err_t err = esp_http_client_perform(cli);
    int status = esp_http_client_get_status_code(cli);
    if (err == ESP_OK && status >= 200 && status < 300) {
        ESP_LOGI(TAG, "posted batch (%zu samples, %d)", n, status);
        // Substring match avoids pulling cJSON in for one flag. Server emits
        // the JSON exactly as "pendingFactoryReset":true with no whitespace
        // (fast-json-stringify default in fastify) — if that ever changes we'd
        // need a real parser.
        if (out_factory_reset && strstr(resp_buf, "\"pendingFactoryReset\":true")) {
            *out_factory_reset = true;
        }
    } else {
        ESP_LOGE(TAG, "post failed: err=%s status=%d body=%.*s",
                 esp_err_to_name(err), status, (int)off, body);
        err = ESP_FAIL;
    }
    esp_http_client_cleanup(cli);
    free(body);
    return err;
}
