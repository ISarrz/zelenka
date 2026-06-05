#include "led.h"

#include <stdatomic.h>

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// Discrete common-cathode RGB on GPIO 8/9/10. The common pin sits at GND, so a
// channel lights when its GPIO is driven HIGH (active-high). White = all three
// HIGH, green = G only.
#define LED_R_GPIO        GPIO_NUM_8
#define LED_G_GPIO        GPIO_NUM_9
#define LED_B_GPIO        GPIO_NUM_10

// How long the green "connected" confirmation stays lit before going dark.
#define CONNECTED_HOLD_MS 10000

static _Atomic int s_state = ZELENKA_LED_OFF;

typedef struct { bool r, g, b; } rgb_t;

// active-high: HIGH = channel lit.
static inline void rgb_write(rgb_t c) {
    gpio_set_level(LED_R_GPIO, c.r ? 1 : 0);
    gpio_set_level(LED_G_GPIO, c.g ? 1 : 0);
    gpio_set_level(LED_B_GPIO, c.b ? 1 : 0);
}

// Desired colour for a state at a given phase within its period, plus the
// total elapsed time in this state (for one-shot timed patterns).
static rgb_t pattern_rgb(zelenka_led_state_t s, int phase_ms, int elapsed_ms) {
    const rgb_t OFF = {0, 0, 0}, WHITE = {1, 1, 1}, GREEN = {0, 1, 0},
                AMBER = {1, 1, 0}, RED = {1, 0, 0};
    switch (s) {
    case ZELENKA_LED_OFF:          return OFF;
    case ZELENKA_LED_BOOT:         return WHITE;                              // solid
    case ZELENKA_LED_PROVISIONING: return WHITE;                             // solid
    case ZELENKA_LED_CONNECTING:                                            // 1 Hz white blink
        return ((phase_ms / 500) % 2 == 0) ? WHITE : OFF;
    case ZELENKA_LED_CONNECTED:                                             // green 10 s, then off
        return (elapsed_ms < CONNECTED_HOLD_MS) ? GREEN : OFF;
    case ZELENKA_LED_SENDING:                                               // 5 Hz amber blink
        return ((phase_ms / 100) % 2 == 0) ? AMBER : OFF;
    case ZELENKA_LED_OK:                                                    // single green flash
        return (phase_ms < 250) ? GREEN : OFF;
    case ZELENKA_LED_ERROR:                                                 // 3 red blinks, then pause
        if (phase_ms < 600) return ((phase_ms / 100) % 2 == 0) ? RED : OFF;
        return OFF;
    }
    return OFF;
}

static int period_ms(zelenka_led_state_t s) {
    switch (s) {
    case ZELENKA_LED_OK:    return 2000;
    case ZELENKA_LED_ERROR: return 1600;
    default:                return 1000;
    }
}

static void blinker_task(void *arg) {
    (void)arg;
    int phase = 0, elapsed = 0;
    zelenka_led_state_t last = ZELENKA_LED_OFF;
    while (1) {
        zelenka_led_state_t s = (zelenka_led_state_t)atomic_load(&s_state);
        if (s != last) {
            phase = 0;
            elapsed = 0;
            last = s;
        }
        rgb_write(pattern_rgb(s, phase, elapsed));
        vTaskDelay(pdMS_TO_TICKS(20));
        phase = (phase + 20) % period_ms(s);
        if (elapsed < 1000000) elapsed += 20;  // saturate, never wraps within a state
    }
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
    rgb_write((rgb_t){0, 0, 0});  // all off
    xTaskCreate(blinker_task, "led_blink", 2048, NULL, 5, NULL);
}

void zelenka_led_set(zelenka_led_state_t state) {
    atomic_store(&s_state, (int)state);
}
