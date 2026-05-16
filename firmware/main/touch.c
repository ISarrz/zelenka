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
    // Touch pads aren't reliable in the first ~20ms after boot — give the
    // sensor IC time to stabilise before sampling.
    vTaskDelay(pdMS_TO_TICKS(50));

    int64_t deadline = esp_timer_get_time() + (int64_t)FACTORY_RESET_MS * 1000;
    while (esp_timer_get_time() < deadline) {
        if (gpio_get_level(TOUCH_GPIO) == 0) return false; // released early
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    ESP_LOGW(TAG, "factory reset gesture held for %d ms", FACTORY_RESET_MS);
    return true;
}
