// Zelenka sensor — Sprint 2 firmware.
//
// Cycle:
//   power-on  ->  touch held 3s? -> wipe NVS -> reboot
//   no cfg?   ->  SoftAP + captive portal + form  -> save NVS + reboot
//   cfg ok    ->  sample -> push to RTC-RAM batch
//                 if batch full: wifi up, NTP, POST batch, clear, sleep
//                 else:                                  sleep
//
// All inter-sample time is spent in deep sleep, so quiescent current dominates
// average power. With 6 samples/hour and ~4s awake per sample, the chip is
// awake ~24s/h ≈ 0.7%.

#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif_sntp.h"
#include "esp_sleep.h"
#include "esp_sntp.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#include "http_post.h"
#include "led.h"
#include "nvs_cfg.h"
#include "ota.h"
#include "provisioning.h"
#include "sensors.h"
#include "touch.h"
#include "wifi.h"

static const char *TAG = "zelenka";

// Samples buffered in RTC slow memory across deep sleeps.
RTC_DATA_ATTR static sensor_reading_t batch_samples[CONFIG_ZELENKA_BATCH_SIZE];
RTC_DATA_ATTR static int64_t          batch_epochs[CONFIG_ZELENKA_BATCH_SIZE];
RTC_DATA_ATTR static int              batch_count = 0;
RTC_DATA_ATTR static bool             time_synced = false;
RTC_DATA_ATTR static bool             did_initial_burst = false;

// On first power-on after provisioning we run a fast smoke test: BURST_SAMPLES
// samples spaced BURST_INTERVAL_MS apart, then push them all at once. The user
// sees real numbers on the home screen within ~70s of plugging the sensor in
// instead of waiting for the first natural batch (~hour). The RTC-RAM flag
// ensures it only happens once per power cycle, not on every deep-sleep wake.
#define BURST_SAMPLES     6
#define BURST_INTERVAL_MS 10000

static void init_nvs(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
}

static void enter_deep_sleep(int sec) {
    ESP_LOGI(TAG, "sleeping %d s (batch %d/%d)", sec, batch_count, CONFIG_ZELENKA_BATCH_SIZE);
    esp_sleep_enable_timer_wakeup((int64_t)sec * 1000000LL);
    esp_deep_sleep_start();
}

// One "logical sample" = mean of 3 raw reads ~100ms apart. Smooths out the
// usual ADC noise and the occasional I2C flake without measurable battery
// cost (extra awake time is ~200 ms).
#define SAMPLE_AVG_N 3

static void sample_averaged(sensor_reading_t *out) {
    *out = (sensor_reading_t){0};
    float t_sum = 0, h_sum = 0, p_sum = 0, lux_sum = 0;
    int   t_n = 0, h_n = 0, p_n = 0, lux_n = 0;
    long  soil_sum = 0;
    int   soil_n = 0;

    for (int i = 0; i < SAMPLE_AVG_N; i++) {
        sensor_reading_t r;
        sensors_read(&r);
        if (r.has_bme280) {
            t_sum += r.temperature_c; t_n++;
            h_sum += r.humidity_pct;  h_n++;
            p_sum += r.pressure_hpa;  p_n++;
        }
        if (r.has_bh1750) {
            lux_sum += r.lux; lux_n++;
        }
        if (r.has_soil) {
            soil_sum += r.soil_moisture_raw; soil_n++;
        }
        if (i < SAMPLE_AVG_N - 1) vTaskDelay(pdMS_TO_TICKS(100));
    }
    if (t_n   > 0) { out->temperature_c   = t_sum / t_n;
                     out->humidity_pct    = h_sum / h_n;
                     out->pressure_hpa    = p_sum / p_n;
                     out->has_bme280 = true; }
    if (lux_n > 0) { out->lux             = lux_sum / lux_n;
                     out->has_bh1750 = true; }
    if (soil_n > 0){ out->soil_moisture_raw = (int)(soil_sum / soil_n);
                     out->has_soil = true; }
}

static bool sync_ntp_blocking(void) {
    esp_sntp_config_t cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
    cfg.sync_cb = NULL;
    esp_netif_sntp_init(&cfg);
    esp_err_t err = esp_netif_sntp_sync_wait(pdMS_TO_TICKS(5000));
    esp_netif_sntp_deinit();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ntp sync timed out");
        return false;
    }
    time_t now = 0;
    time(&now);
    ESP_LOGI(TAG, "ntp synced: %lld", (long long)now);
    return now > 1700000000;
}

void app_main(void) {
    init_nvs();
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    zelenka_led_init();
    touch_init();

    // Factory reset gesture — only on a real power-on. USB resets (DTR pulse
    // from the host while debugging) and software restarts after captive-portal
    // save must NOT clear NVS, or we'd never escape provisioning.
    esp_reset_reason_t reason = esp_reset_reason();
    if (reason == ESP_RST_POWERON) {
        zelenka_led_set(ZELENKA_LED_BOOT);
        if (touch_was_held_for_factory_reset()) {
            ESP_LOGW(TAG, "factory reset: wiping NVS");
            zelenka_cfg_wipe();
            esp_restart();
        }
        // Fresh power cycle: re-run the smoke-test burst so the user can plug
        // the sensor back in and immediately see updated numbers in the PWA.
        did_initial_burst = false;
        batch_count = 0;
        time_synced = false;
    }

    zelenka_cfg_t cfg;
    zelenka_cfg_load(&cfg);

    if (!cfg.present) {
        ESP_LOGI(TAG, "no provisioning — entering SoftAP captive portal");
        zelenka_led_set(ZELENKA_LED_WIFI);
        provisioning_run();
        // provisioning_run() restarts on save; if we got here it didn't finish.
        while (true) vTaskDelay(pdMS_TO_TICKS(60000));
    }

    sensors_init();

    if (!did_initial_burst) {
        // ---- Initial smoke-test burst (~70s after power-on) -----------------
        // Stays awake, Wi-Fi up, six samples 10s apart, push the batch, then
        // hand off to normal aligned-cycle operation.
        ESP_LOGI(TAG, "initial burst: 6 samples * 10s");
        zelenka_led_set(ZELENKA_LED_WIFI);
        bool wifi_ok = (wifi_connect_blocking(cfg.wifi_ssid, cfg.wifi_password) == ESP_OK);
        if (wifi_ok && !time_synced) {
            time_synced = sync_ntp_blocking();
        }

        batch_count = 0;
        for (int i = 0; i < BURST_SAMPLES; i++) {
            sensor_reading_t r = {0};
            sample_averaged(&r);
            batch_samples[batch_count] = r;
            batch_epochs[batch_count]  = time_synced ? (int64_t)time(NULL) : 0;
            batch_count++;
            ESP_LOGI(TAG,
                     "burst %d/%d: bme=%d bh=%d soil=%d | t=%.2fC h=%.2f%% lux=%.1f soil=%d",
                     batch_count, BURST_SAMPLES,
                     r.has_bme280, r.has_bh1750, r.has_soil,
                     r.temperature_c, r.humidity_pct, r.lux, r.soil_moisture_raw);
            if (i < BURST_SAMPLES - 1) vTaskDelay(pdMS_TO_TICKS(BURST_INTERVAL_MS));
        }

        if (wifi_ok) {
            zelenka_led_set(ZELENKA_LED_SENDING);
            esp_err_t err = http_post_batch(
                cfg.api_url, cfg.device_token,
                batch_samples, batch_epochs, batch_count);
            zelenka_led_set(err == ESP_OK ? ZELENKA_LED_OK : ZELENKA_LED_ERROR);
            if (err == ESP_OK) {
                batch_count = 0;
                // First fully-successful cycle on a new OTA image — accept it.
                ota_mark_valid_if_pending();
                // Check for newer firmware. Function reboots on success.
                char base[64];
                ota_base_from_url(cfg.api_url, base, sizeof(base));
                ota_check_and_apply(base);
            }
        } else {
            ESP_LOGW(TAG, "burst: wifi unavailable, samples discarded");
            zelenka_led_set(ZELENKA_LED_ERROR);
            batch_count = 0;
        }
        did_initial_burst = true;
        vTaskDelay(pdMS_TO_TICKS(800));
    } else {
        // ---- Normal cycle: one sample per wake, batch posted when full -----
        sensor_reading_t r = {0};
        sample_averaged(&r);
        if (batch_count < CONFIG_ZELENKA_BATCH_SIZE) {
            batch_samples[batch_count] = r;
            batch_epochs[batch_count]  = time_synced ? (int64_t)time(NULL) : 0;
            batch_count++;
        }
        ESP_LOGI(TAG,
                 "sample %d/%d: bme=%d bh=%d soil=%d | t=%.2fC h=%.2f%% lux=%.1f soil=%d",
                 batch_count, CONFIG_ZELENKA_BATCH_SIZE,
                 r.has_bme280, r.has_bh1750, r.has_soil,
                 r.temperature_c, r.humidity_pct, r.lux, r.soil_moisture_raw);

        if (batch_count >= CONFIG_ZELENKA_BATCH_SIZE) {
            zelenka_led_set(ZELENKA_LED_WIFI);
            if (wifi_connect_blocking(cfg.wifi_ssid, cfg.wifi_password) == ESP_OK) {
                if (!time_synced) time_synced = sync_ntp_blocking();
                if (time_synced) {
                    int64_t now = (int64_t)time(NULL);
                    for (int i = 0; i < batch_count; i++) {
                        if (batch_epochs[i] == 0) {
                            batch_epochs[i] = now - (int64_t)(batch_count - 1 - i)
                                              * CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC;
                        }
                    }
                }
                zelenka_led_set(ZELENKA_LED_SENDING);
                esp_err_t err = http_post_batch(
                    cfg.api_url, cfg.device_token,
                    batch_samples, batch_epochs, batch_count);
                if (err == ESP_OK) {
                    batch_count = 0;
                    zelenka_led_set(ZELENKA_LED_OK);
                    ota_mark_valid_if_pending();
                    char base[64];
                    ota_base_from_url(cfg.api_url, base, sizeof(base));
                    ota_check_and_apply(base);
                } else {
                    zelenka_led_set(ZELENKA_LED_ERROR);
                }
                vTaskDelay(pdMS_TO_TICKS(600));
            } else {
                ESP_LOGW(TAG, "wifi failed, samples held for next cycle");
                zelenka_led_set(ZELENKA_LED_ERROR);
                vTaskDelay(pdMS_TO_TICKS(600));
            }
        }
    }

    // Align next wake to the next multiple of SAMPLE_INTERVAL_SEC since
    // epoch — so samples land at :00, :10, :20, … of every hour rather than
    // at whatever-offset the device happened to be provisioned at. Falls
    // back to fixed interval until time is synced.
    int sleep_sec = CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC;
    if (time_synced) {
        int64_t now = (int64_t)time(NULL);
        int64_t next = ((now / CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC) + 1)
                       * CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC;
        int64_t delta = next - now;
        if (delta < 5) delta += CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC; // never sleep <5s
        sleep_sec = (int)delta;
    }
    enter_deep_sleep(sleep_sec);
}
