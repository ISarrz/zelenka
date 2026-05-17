#pragma once

#include <stdbool.h>

// TTP223 DO on GPIO10.
//
// TTP223 self-calibrates on power-up: it samples the electrode for ~1.5 s and
// bakes whatever capacitance it sees into its baseline. If the user is touching
// the pad during that window the IC inverts (touch becomes "no touch"), so the
// firmware:
//   1. waits TTP223_CAL_MS for the IC to calibrate (pad must be untouched)
//   2. arms a TOUCH_WINDOW_MS press window — set LED to a "ready" state, wait
//   3. if a press lands, measures HOLD_MS continuous before declaring intent
//
// The caller is expected to indicate the press window with the LED.
#define TOUCH_GPIO          5
#define TTP223_CAL_MS       1500
#define TOUCH_WINDOW_MS     3000
#define FACTORY_RESET_MS    3000

void touch_init(void);

// Wait for TTP223 to calibrate, then arm a press window. Returns true if the
// user touched the pad within TOUCH_WINDOW_MS and held continuously for
// FACTORY_RESET_MS — that's the factory-reset gesture.
bool touch_was_held_for_factory_reset(void);
