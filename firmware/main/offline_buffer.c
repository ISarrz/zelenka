#include "offline_buffer.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include "esp_log.h"
#include "esp_spiffs.h"

static const char *TAG = "offbuf";
static const char *MOUNT_POINT = "/spiffs";
static const char *PENDING_PATH = "/spiffs/pending.bin";

// File format: a packed sequence of records, one record per stored sample:
//   sensor_reading_t (binary)  +  int64_t epoch
// We append to EOF on store; on drain we slice from the head.
typedef struct __attribute__((packed)) {
    sensor_reading_t r;
    int64_t epoch;
} record_t;

esp_err_t offline_buffer_init(void) {
    esp_vfs_spiffs_conf_t cfg = {
        .base_path = MOUNT_POINT,
        .partition_label = "storage",
        .max_files = 4,
        .format_if_mount_failed = true,
    };
    esp_err_t err = esp_vfs_spiffs_register(&cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "spiffs mount failed: %s", esp_err_to_name(err));
        return err;
    }
    size_t total = 0, used = 0;
    esp_spiffs_info("storage", &total, &used);
    ESP_LOGI(TAG, "spiffs ok: %u/%u bytes used", (unsigned)used, (unsigned)total);

    // If sensor_reading_t layout changed across OTA upgrades, the pending file
    // is now mis-aligned and would deserialize garbage. Detect by file size
    // not divisible by the new record size and drop it.
    struct stat st;
    if (stat(PENDING_PATH, &st) == 0 && st.st_size > 0
        && (st.st_size % sizeof(record_t)) != 0) {
        ESP_LOGW(TAG, "pending.bin size %lld not multiple of record_t %u — "
                      "wiping (likely struct layout changed across firmware versions)",
                 (long long)st.st_size, (unsigned)sizeof(record_t));
        unlink(PENDING_PATH);
    }
    return ESP_OK;
}

esp_err_t offline_buffer_append(
    const sensor_reading_t *samples,
    const int64_t *epochs,
    size_t n
) {
    if (n == 0) return ESP_OK;
    FILE *f = fopen(PENDING_PATH, "ab");
    if (!f) {
        ESP_LOGE(TAG, "cannot open %s for append: %s", PENDING_PATH, strerror(errno));
        return ESP_FAIL;
    }
    for (size_t i = 0; i < n; i++) {
        record_t rec = { .r = samples[i], .epoch = epochs ? epochs[i] : 0 };
        if (fwrite(&rec, sizeof(rec), 1, f) != 1) {
            ESP_LOGE(TAG, "write failed");
            fclose(f);
            return ESP_FAIL;
        }
    }
    fclose(f);
    ESP_LOGI(TAG, "spilled %u records to disk", (unsigned)n);
    return ESP_OK;
}

esp_err_t offline_buffer_drain_read(
    sensor_reading_t *out_samples,
    int64_t *out_epochs,
    size_t cap,
    size_t *out_n,
    size_t *out_remaining
) {
    *out_n = 0;
    *out_remaining = 0;

    struct stat st;
    if (stat(PENDING_PATH, &st) != 0) return ESP_OK;   // no file = nothing pending
    size_t total = st.st_size / sizeof(record_t);
    if (total == 0) return ESP_OK;

    FILE *f = fopen(PENDING_PATH, "rb");
    if (!f) return ESP_FAIL;
    size_t to_read = total < cap ? total : cap;
    for (size_t i = 0; i < to_read; i++) {
        record_t rec;
        if (fread(&rec, sizeof(rec), 1, f) != 1) break;
        out_samples[i] = rec.r;
        if (out_epochs) out_epochs[i] = rec.epoch;
        (*out_n)++;
    }
    fclose(f);
    *out_remaining = total - *out_n;
    return ESP_OK;
}

esp_err_t offline_buffer_commit(size_t n) {
    if (n == 0) return ESP_OK;

    struct stat st;
    if (stat(PENDING_PATH, &st) != 0) return ESP_OK;
    size_t total = st.st_size / sizeof(record_t);
    if (n >= total) {
        // Cheaper: just truncate the whole thing.
        if (unlink(PENDING_PATH) != 0) {
            ESP_LOGW(TAG, "unlink failed: %s", strerror(errno));
        }
        return ESP_OK;
    }

    // Rewrite minus the first n records into a tmp file, then swap. SPIFFS
    // supports rename, so this is atomic enough for our purposes.
    FILE *src = fopen(PENDING_PATH, "rb");
    if (!src) return ESP_FAIL;
    fseek(src, n * sizeof(record_t), SEEK_SET);

    const char *tmp = "/spiffs/pending.tmp";
    FILE *dst = fopen(tmp, "wb");
    if (!dst) { fclose(src); return ESP_FAIL; }

    record_t rec;
    while (fread(&rec, sizeof(rec), 1, src) == 1) {
        if (fwrite(&rec, sizeof(rec), 1, dst) != 1) { fclose(src); fclose(dst); return ESP_FAIL; }
    }
    fclose(src);
    fclose(dst);

    unlink(PENDING_PATH);
    rename(tmp, PENDING_PATH);
    ESP_LOGI(TAG, "committed %u records, %u still pending",
             (unsigned)n, (unsigned)(total - n));
    return ESP_OK;
}
