#include "led.h"

#include <stdatomic.h>

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// External RGB module sits on GPIO 8/9/10 with common-anode wiring (LOW = lit).
// The on-board status LED of most ESP32-C3 Super Mini boards is also tied to
// GPIO8, active-low — so the R channel doubles as a single-LED status output
// when the external RGB is missing or dead.
//
// To make the on-board LED carry usable state info on its own, we run a
// background blinker task: each state has a distinct pattern (solid, slow,
// fast, pulses) instead of a single steady colour. The task reads the current
// state atomically; zelenka_led_set just stores the new state and returns.
#define LED_R_GPIO GPIO_NUM_8
#define LED_G_GPIO GPIO_NUM_9
#define LED_B_GPIO GPIO_NUM_10

// Common-anode: LOW lights the channel.
static inline void rgb(int r, int g, int b) {
    gpio_set_level(LED_R_GPIO, r ? 0 : 1);
    gpio_set_level(LED_G_GPIO, g ? 0 : 1);
    gpio_set_level(LED_B_GPIO, b ? 0 : 1);
}

static _Atomic int s_state = ZELENKA_LED_OFF;

static void apply_color(zelenka_led_state_t s, bool on) {
    if (!on) { rgb(0, 0, 0); return; }
    switch (s) {
    case ZELENKA_LED_OFF:     rgb(0, 0, 0); break;
    case ZELENKA_LED_BOOT:    rgb(1, 1, 1); break;  // white
    case ZELENKA_LED_WIFI:    rgb(0, 0, 1); break;  // blue
    case ZELENKA_LED_SENDING: rgb(1, 1, 0); break;  // yellow
    case ZELENKA_LED_OK:      rgb(0, 1, 0); break;  // green
    case ZELENKA_LED_ERROR:   rgb(1, 0, 0); break;  // red
    }
}

// Blink patterns are state-specific. The "phase_ms" counter wraps every period
// and decides whether the LED is on.
static bool pattern_on(zelenka_led_state_t s, int phase_ms) {
    switch (s) {
    case ZELENKA_LED_OFF:     return false;
    case ZELENKA_LED_BOOT:    return true;                            // solid
    case ZELENKA_LED_WIFI:    return (phase_ms / 500) % 2 == 0;       // 1 Hz blink
    case ZELENKA_LED_SENDING: return (phase_ms / 100) % 2 == 0;       // 5 Hz fast blink
    case ZELENKA_LED_OK:      return phase_ms < 250;                  // brief flash
    case ZELENKA_LED_ERROR:   // 3 quick blinks then 1 s pause
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
        apply_color(s, pattern_on(s, phase));
        vTaskDelay(pdMS_TO_TICKS(20));
        phase = (phase + 20) % period_ms(s);
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
    rgb(0, 0, 0);
    xTaskCreate(blinker_task, "led_blink", 2048, NULL, 5, NULL);
}

void zelenka_led_set(zelenka_led_state_t state) {
    atomic_store(&s_state, (int)state);
}
