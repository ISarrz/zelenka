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

typedef struct {
    char wifi_ssid[33];
    char wifi_password[64];
    char device_token[64];
    char api_url[256];
    bool present;
} zelenka_cfg_t;

void zelenka_cfg_load(zelenka_cfg_t *out);
bool zelenka_cfg_store(const char *ssid, const char *pass, const char *token, const char *api_url);
void zelenka_cfg_wipe(void);

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
