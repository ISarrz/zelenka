#pragma once

#include "esp_err.h"

// Maximum time the device keeps the captive portal alive while waiting for
// the user to submit Wi-Fi creds. After this it returns to the caller so the
// caller can deep-sleep with touch-wake armed; the user re-arms provisioning
// by holding the sensor pad for TOUCH_REPROV_MS.
#define PROVISIONING_TIMEOUT_MS (5 * 60 * 1000)

// Brings up SoftAP "Zelenka-XXXX" (XXXX = last 4 hex of MAC), a tiny captive
// DNS server that returns 192.168.4.1 for everything, and an HTTP server
// hosting the provisioning form at /. POST /save writes NVS and restarts —
// in that case this function never returns. Otherwise it returns ESP_OK
// after PROVISIONING_TIMEOUT_MS so the caller can put the device to sleep.
esp_err_t provisioning_run(void);
