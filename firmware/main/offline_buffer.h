// Offline overflow for the RTC-RAM batch buffer. When the device can't reach
// the API for one or more cycles, completed batches get appended here, then
// drained back when Wi-Fi recovers. Backed by SPIFFS on the `storage`
// partition (~512 KB → ~14k samples → ~99 days at the production 10-min rate).
#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "sensors.h"

// Mounts the SPIFFS partition. Formats if it isn't already.
esp_err_t offline_buffer_init(void);

// Append a batch (samples[n] + matching epoch_seconds[n]) to disk.
esp_err_t offline_buffer_append(
    const sensor_reading_t *samples,
    const int64_t *epoch_seconds,
    size_t n);

// Read up to `cap` pending records out of the file (oldest first). Returns
// the number actually filled in `*out_n`; `*out_remaining` is the number of
// records still on disk after this read so the caller knows whether to keep
// draining. Records read by this call are NOT removed yet — call
// offline_buffer_commit() once the API confirmed delivery.
esp_err_t offline_buffer_drain_read(
    sensor_reading_t *out_samples,
    int64_t *out_epochs,
    size_t cap,
    size_t *out_n,
    size_t *out_remaining);

// Remove the first `n` records from the file — call after a successful POST
// of those records.
esp_err_t offline_buffer_commit(size_t n);
