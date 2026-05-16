#pragma once

#include <stddef.h>
#include "esp_err.h"
#include "sensors.h"

// POST a batch of readings as {"samples":[...]}. The caller passes API URL,
// device token, and the buffered samples (in order they were taken).
esp_err_t http_post_batch(
    const char *api_url,
    const char *device_token,
    const sensor_reading_t *samples,
    const int64_t *epoch_seconds,   // matching len; 0 means "no time"
    size_t n);
