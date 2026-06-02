#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "sensors.h"

// Optional crash report attached to the next batch after the device
// re-provisions following a panic/watchdog/brownout. Cleared from NVS once
// the POST returns 2xx.
typedef struct {
    int         reset_reason;      // esp_reset_reason_t
    int         count;             // crashes since last upload
    const char *firmware_version;  // version that crashed; may be NULL
} http_post_last_error_t;

// Optional device-level metadata sent alongside the batch — firmware version
// and Wi-Fi signal at POST time. Pointers so the caller can omit either.
typedef struct {
    const char                   *firmware_version; // e.g. "0.1.5"; may be NULL
    const int                    *wifi_rssi;        // dBm, e.g. -52; may be NULL
    const http_post_last_error_t *last_error;       // NULL if none pending
} http_post_meta_t;

// POST a batch of readings as {"samples":[...], "device":{...}}. The caller
// passes API URL, device token, the buffered samples (in order they were
// taken), and optional device metadata. If `out_factory_reset` is non-NULL
// and the server's response body indicates a pending factory reset, the
// pointed-to bool is set to true — the caller is expected to wipe NVS and
// reboot into provisioning.
esp_err_t http_post_batch(
    const char *api_url,
    const char *device_token,
    const sensor_reading_t *samples,
    const int64_t *epoch_seconds,   // matching len; 0 means "no time"
    size_t n,
    const http_post_meta_t *meta,   // may be NULL
    bool *out_factory_reset);       // may be NULL
