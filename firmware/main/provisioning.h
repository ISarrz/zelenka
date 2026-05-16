#pragma once

#include "esp_err.h"

// Brings up SoftAP "Zelenka-XXXX" (XXXX = last 4 hex of MAC), a tiny captive
// DNS server that returns 192.168.4.1 for everything, and an HTTP server
// hosting the provisioning form at /. POST /save writes NVS and restarts.
// Blocks the calling task indefinitely (the restart will exit the function).
esp_err_t provisioning_run(void);
