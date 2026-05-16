// On-board RGB LED status indicator. Sprint 0: solid-color states only.
#pragma once

typedef enum {
    ZELENKA_LED_OFF,
    ZELENKA_LED_BOOT,      // white-ish — just powered up
    ZELENKA_LED_WIFI,      // blue — connecting / reconnecting
    ZELENKA_LED_SENDING,   // amber — POST in flight
    ZELENKA_LED_OK,        // green — last cycle succeeded
    ZELENKA_LED_ERROR,     // red — last cycle failed
} zelenka_led_state_t;

void zelenka_led_init(void);
void zelenka_led_set(zelenka_led_state_t state);
