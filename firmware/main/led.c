#include "led.h"

#include "driver/gpio.h"

// GPIO assignments per the schematic. Common-cathode RGB LED — set HIGH to
// light the channel.
#define LED_R_GPIO GPIO_NUM_8
#define LED_G_GPIO GPIO_NUM_9
#define LED_B_GPIO GPIO_NUM_10

static void write_rgb(int r, int g, int b) {
    gpio_set_level(LED_R_GPIO, r);
    gpio_set_level(LED_G_GPIO, g);
    gpio_set_level(LED_B_GPIO, b);
}

void zelenka_led_init(void) {
    gpio_config_t cfg = {
        .pin_bit_mask =
            (1ULL << LED_R_GPIO) | (1ULL << LED_G_GPIO) | (1ULL << LED_B_GPIO),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&cfg);
    write_rgb(0, 0, 0);
}

void zelenka_led_set(zelenka_led_state_t state) {
    switch (state) {
    case ZELENKA_LED_OFF:     write_rgb(0, 0, 0); break;
    case ZELENKA_LED_BOOT:    write_rgb(1, 1, 1); break;
    case ZELENKA_LED_WIFI:    write_rgb(0, 0, 1); break;
    case ZELENKA_LED_SENDING: write_rgb(1, 1, 0); break;
    case ZELENKA_LED_OK:      write_rgb(0, 1, 0); break;
    case ZELENKA_LED_ERROR:   write_rgb(1, 0, 0); break;
    }
}
