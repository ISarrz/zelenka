// Provisioned configuration in NVS namespace "zelenka". When any of these
// strings is absent, the device boots into captive-portal provisioning.
#pragma once

#include <stdbool.h>
#include <stddef.h>

#define ZELENKA_NVS_NAMESPACE "zelenka"

#define NVS_KEY_WIFI_SSID     "wifi_ssid"
#define NVS_KEY_WIFI_PASSWORD "wifi_pass"
#define NVS_KEY_DEVICE_TOKEN  "dev_token"
#define NVS_KEY_API_URL       "api_url"
// Set to 1 by zelenka_cfg_store(); the freshly-entered creds have never been
// validated against a real AP. Cleared on the first successful connect. While
// set, the first-connect path fails fast back to provisioning if the creds
// turn out to be wrong (see main.c). Absent (older NVS) → treated as confirmed.
#define NVS_KEY_UNCONFIRMED   "unconfirmed"

typedef struct {
    char wifi_ssid[33];
    char wifi_password[64];
    char device_token[64];
    char api_url[256];
    bool present;
    bool unconfirmed;   // creds stored but not yet validated by a real connect
} zelenka_cfg_t;

void zelenka_cfg_load(zelenka_cfg_t *out);
bool zelenka_cfg_store(const char *ssid, const char *pass, const char *token, const char *api_url);
void zelenka_cfg_wipe(void);
// Clear the "unconfirmed" flag after the first successful Wi-Fi connect.
void zelenka_cfg_mark_confirmed(void);

// Crash-report log lives in NVS namespace "zelenka_err" — separate from the
// cfg namespace so it survives `zelenka_cfg_wipe()`. When the device boots
// after a panic/watchdog/brownout we save the reset_reason here, wipe creds,
// drop into SoftAP. On the next successful POST after re-provisioning we
// include this record and then clear it.
#define ZELENKA_ERR_NAMESPACE "zelenka_err"
#define ZELENKA_ERR_FW_MAX    32

typedef struct {
    int  reset_reason;          // esp_reset_reason_t value
    int  count;                 // crashes since last successful upload
    char fw_version[ZELENKA_ERR_FW_MAX];
    bool present;
} zelenka_err_t;

void zelenka_err_save(int reset_reason, const char *fw_version);
void zelenka_err_load(zelenka_err_t *out);
void zelenka_err_clear(void);
