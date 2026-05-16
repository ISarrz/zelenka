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
