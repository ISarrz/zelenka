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

    // 1) take a sample, store in RTC buffer
    sensor_reading_t r = {0};
    sensors_read(&r);
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

    // 2) if buffer full, drain via Wi-Fi
    if (batch_count >= CONFIG_ZELENKA_BATCH_SIZE) {
        zelenka_led_set(ZELENKA_LED_WIFI);
        if (wifi_connect_blocking(cfg.wifi_ssid, cfg.wifi_password) == ESP_OK) {
            if (!time_synced) time_synced = sync_ntp_blocking();
            // Backfill any 0-epoch samples by extrapolating from the latest
            // good clock (assuming uniform interval).
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
            } else {
                // Keep buffer for next attempt. If it grew past capacity we
                // would have already stopped appending — keep the latest.
                zelenka_led_set(ZELENKA_LED_ERROR);
            }
            // Brief moment for the LED to be visible before deep sleep cuts power.
            vTaskDelay(pdMS_TO_TICKS(600));
        } else {
            ESP_LOGW(TAG, "wifi failed, samples held for next cycle");
            zelenka_led_set(ZELENKA_LED_ERROR);
            vTaskDelay(pdMS_TO_TICKS(600));
        }
    }

    enter_deep_sleep(CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC);
}
