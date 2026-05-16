#pragma once

#include "esp_err.h"

// Bring up Wi-Fi in STA mode using the SSID/password from menuconfig. Blocks
// until either CONNECTED or AUTH_FAIL/timeout. Sprint 0 only — Sprint 2 will
// replace with provisioning via captive portal.
esp_err_t wifi_connect_blocking(void);
