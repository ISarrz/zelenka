#include "led.h"

#include <stdatomic.h>

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// The external RGB module on GPIO 8/9/10 is dead on the current rev. The
// on-board surface-mount status LED of the ESP32-C3 Super Mini sits on the
// same GPIO8 line, active-low (chip writes LOW = LED lit). We drive GPIO8
// directly with per-state blink patterns, independent of the colour scheme.
// GPIO9/10 stay HIGH so they don't bleed into a future healthy RGB module.
#define STATUS_LED_GPIO   GPIO_NUM_8
#define LED_G_GPIO        GPIO_NUM_9
#define LED_B_GPIO        GPIO_NUM_10

static _Atomic int s_state = ZELENKA_LED_OFF;

static inline void status_led(bool on) {
    // active-low: LOW = lit.
    gpio_set_level(STATUS_LED_GPIO, on ? 0 : 1);
}

// Pattern table — true means LED lit at this phase (ms within the period).
static bool pattern_on(zelenka_led_state_t s, int phase_ms) {
    switch (s) {
    case ZELENKA_LED_OFF:     return false;
    case ZELENKA_LED_BOOT:    return true;                            // solid
    case ZELENKA_LED_WIFI:    return (phase_ms / 500) % 2 == 0;       // 1 Hz blink
    case ZELENKA_LED_SENDING: return (phase_ms / 100) % 2 == 0;       // 5 Hz fast blink
    case ZELENKA_LED_OK:      return phase_ms < 250;                  // single short flash per period
    case ZELENKA_LED_ERROR:                                           // 3 quick blinks, then pause
        if (phase_ms < 600) return (phase_ms / 100) % 2 == 0;
        return false;
    }
    return false;
}

static int period_ms(zelenka_led_state_t s) {
    switch (s) {
    case ZELENKA_LED_OK:      return 2000;
    case ZELENKA_LED_ERROR:   return 1600;
    default:                  return 1000;
    }
}

static void blinker_task(void *arg) {
    (void)arg;
    int phase = 0;
    zelenka_led_state_t last = ZELENKA_LED_OFF;
    while (1) {
        zelenka_led_state_t s = (zelenka_led_state_t)atomic_load(&s_state);
        if (s != last) {
            phase = 0;
            last = s;
        }
        status_led(pattern_on(s, phase));
        vTaskDelay(pdMS_TO_TICKS(20));
        phase = (phase + 20) % period_ms(s);
    }
}

void zelenka_led_init(void) {
    gpio_config_t cfg = {
        .pin_bit_mask =
            (1ULL << STATUS_LED_GPIO) | (1ULL << LED_G_GPIO) | (1ULL << LED_B_GPIO),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&cfg);
    status_led(false);
    gpio_set_level(LED_G_GPIO, 1);  // CA off
    gpio_set_level(LED_B_GPIO, 1);  // CA off
    xTaskCreate(blinker_task, "led_blink", 2048, NULL, 5, NULL);
}

void zelenka_led_set(zelenka_led_state_t state) {
    atomic_store(&s_state, (int)state);
}
