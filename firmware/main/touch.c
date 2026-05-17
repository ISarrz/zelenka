#include "touch.h"

#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "touch";

void touch_init(void) {
    gpio_config_t cfg = {
        .pin_bit_mask = 1ULL << TOUCH_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_ENABLE, // TTP223 DO floats low when not touched
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&cfg);
}

bool touch_was_held_for_factory_reset(void) {
    // Caller is responsible for waiting TTP223_CAL_MS with pad untouched
    // *before* calling this function (so the LED-prompt change lines up).
    // Here we just open the press window and measure the hold.

    int64_t window_deadline = esp_timer_get_time() + (int64_t)TOUCH_WINDOW_MS * 1000;
    while (esp_timer_get_time() < window_deadline) {
        if (gpio_get_level(TOUCH_GPIO) == 1) {
            ESP_LOGI(TAG, "touch detected in press window");
            break;
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    if (gpio_get_level(TOUCH_GPIO) == 0) {
        return false; // no press in window — normal boot
    }

    int64_t hold_deadline = esp_timer_get_time() + (int64_t)FACTORY_RESET_MS * 1000;
    while (esp_timer_get_time() < hold_deadline) {
        if (gpio_get_level(TOUCH_GPIO) == 0) {
            ESP_LOGI(TAG, "touch released early; cancelling factory reset");
            return false;
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    ESP_LOGW(TAG, "factory reset gesture held for %d ms", FACTORY_RESET_MS);
    return true;
}
