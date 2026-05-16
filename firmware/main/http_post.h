#pragma once

#include "esp_err.h"
#include "sensors.h"

// POSTs the reading to the API as a single-sample body (the server accepts
// either a single sample or {"samples":[...]}).
esp_err_t http_post_measurement(const sensor_reading_t *r);
