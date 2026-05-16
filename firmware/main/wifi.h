#pragma once

#include "esp_err.h"

// STA-mode connect with creds passed in. Blocks until connected or timeout.
// Caller is responsible for esp_netif_init/event_loop and wifi_init having
// happened, but not for actually starting the driver — wifi_connect_blocking
// handles set_mode + set_config + start internally.
esp_err_t wifi_connect_blocking(const char *ssid, const char *password);
