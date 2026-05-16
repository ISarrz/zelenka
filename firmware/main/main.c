// Zelenka sensor — entry point.
//
// Cycle (Sprint 0):
//   boot -> init NVS / I2C / ADC / LED
//        -> connect Wi-Fi (LED blue)
//        -> sample BME280 + BH1750 + soil
//        -> POST to API (LED green on success, red on failure)
//        -> light sleep CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC, repeat
//
// Captive-portal provisioning, batching, deep sleep, OTA, and the touch
// button reset all live in Sprint 2.

#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#include "http_post.h"
#include "led.h"
#include "sensors.h"
#include "wifi.h"

static const char *TAG = "zelenka";

static void init_nvs(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
}

void app_main(void) {
    init_nvs();
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    zelenka_led_init();
    zelenka_led_set(ZELENKA_LED_BOOT);

    sensors_init();

    zelenka_led_set(ZELENKA_LED_WIFI);
    if (wifi_connect_blocking() != ESP_OK) {
        zelenka_led_set(ZELENKA_LED_ERROR);
        ESP_LOGE(TAG, "no wifi, sleeping then retrying");
        vTaskDelay(pdMS_TO_TICKS(10000));
        esp_restart();
    }

    while (true) {
        sensor_reading_t r = {0};
        sensors_read(&r);
        ESP_LOGI(TAG,
                 "sample: t=%.2fC h=%.2f%% p=%.2fhPa lux=%.2f soil_raw=%d",
                 r.temperature_c, r.humidity_pct, r.pressure_hpa, r.lux,
                 r.soil_moisture_raw);

        zelenka_led_set(ZELENKA_LED_SENDING);
        esp_err_t err = http_post_measurement(&r);
        zelenka_led_set(err == ESP_OK ? ZELENKA_LED_OK : ZELENKA_LED_ERROR);

        vTaskDelay(pdMS_TO_TICKS(CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC * 1000));
    }
}
