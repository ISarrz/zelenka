#pragma once

#include "esp_err.h"

// Read this device's app version from the embedded app_desc.
const char *ota_running_version(void);

// Mark the currently running image as valid (cancels pending rollback).
// Call once per power-on after a fully-successful sample+POST cycle.
void ota_mark_valid_if_pending(void);

// Pull /api/firmware/manifest.json relative to api_base_url and, if the
// manifest advertises a different version than what's currently running,
// run esp_https_ota against the manifest URL. Returns ESP_OK only after a
// successful image flash + esp_restart (so the caller never actually sees
// ESP_OK return — the chip reboots).
//
// api_base_url example: "https://zelenka-api.ru" (no trailing slash).
esp_err_t ota_check_and_apply(const char *api_base_url);

// Build base URL ("https://host") from a full POST URL like
// "https://zelenka-api.ru/api/device/measurements". Writes into out.
void ota_base_from_url(const char *full_url, char *out, size_t out_size);
