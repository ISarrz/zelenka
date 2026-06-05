// On-board RGB LED status indicator. Discrete common-cathode RGB on GPIO 8/9/10
// (R/G/B), active-high: driving a channel HIGH lights it. White = all three on,
// green = G only.
#pragma once

typedef enum {
    ZELENKA_LED_OFF,
    ZELENKA_LED_BOOT,          // solid white — just powered up
    ZELENKA_LED_PROVISIONING,  // solid white — captive portal, waiting for creds
    ZELENKA_LED_CONNECTING,    // blinking white — joining Wi-Fi
    ZELENKA_LED_CONNECTED,     // solid green for 10 s, then off — Wi-Fi up
    ZELENKA_LED_SENDING,       // amber fast blink — POST in flight
    ZELENKA_LED_OK,            // single green flash — cycle succeeded
    ZELENKA_LED_ERROR,         // red — cycle failed
} zelenka_led_state_t;

void zelenka_led_init(void);
void zelenka_led_set(zelenka_led_state_t state);
