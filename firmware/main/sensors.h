#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef struct {
    bool   has_bme280;
    bool   has_bh1750;
    bool   has_soil;
    bool   has_battery;
    float  temperature_c;     // BME280
    float  humidity_pct;      // BME280
    float  pressure_hpa;      // BME280
    float  lux;               // BH1750
    int    soil_moisture_raw; // ADC1_CH1 (GPIO1), raw 0..4095
    int    battery_raw;       // ADC1_CH3 (GPIO3), raw 0..4095; 1:1 divider on BAT+
} sensor_reading_t;

void sensors_init(void);
void sensors_read(sensor_reading_t *out);
