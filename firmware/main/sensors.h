#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool   has_bme280;
    bool   has_bh1750;
    bool   has_soil;
    float  temperature_c;     // BME280
    float  humidity_pct;      // BME280
    float  pressure_hpa;      // BME280
    float  lux;               // BH1750
    int    soil_moisture_raw; // raw ADC value, 0..4095; Sprint 0 no calibration
} sensor_reading_t;

void sensors_init(void);
void sensors_read(sensor_reading_t *out);
