#pragma once

#include <stdbool.h>

// TTP223 DO on GPIO10. After init, check `touch_was_held_for_factory_reset()`
// at app start — returns true if the user held the pad for ≥ FACTORY_RESET_MS
// from boot, in which case the caller wipes NVS and reboots into provisioning.
#define TOUCH_GPIO          10
#define FACTORY_RESET_MS    3000

void touch_init(void);
bool touch_was_held_for_factory_reset(void);
