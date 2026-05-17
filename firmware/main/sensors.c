// Sensor drivers.
//
//   BME280 — I2C, address 0x76 (default). Reads temperature, pressure,
//            humidity. Bosch compensation math straight from the datasheet
//            (rev 1.21), single-precision floats — enough for our use.
//
//   BH1750 — I2C, address 0x23. Continuous high-resolution mode. lux = raw / 1.2.
//
//   Soil V1.2 — analog. ESP32-C3 ADC1 on GPIO4. Raw value stored unmodified —
//   percent-conversion needs a two-point calibration (Sprint 2).

#include "sensors.h"

#include <string.h>

#include "driver/i2c.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "sensors";

// ---- I2C bus ---------------------------------------------------------------

#define I2C_PORT      I2C_NUM_0
#define I2C_SDA_GPIO  6
#define I2C_SCL_GPIO  7
#define I2C_FREQ_HZ   100000
#define I2C_TIMEOUT_MS 100

#define BH1750_ADDR   0x23

static uint8_t BME280_ADDR = 0x76;  // may be flipped to 0x77 by bme280_init_alt()

static esp_err_t i2c_write(uint8_t addr, const uint8_t *buf, size_t len) {
    return i2c_master_write_to_device(I2C_PORT, addr, buf, len,
                                      pdMS_TO_TICKS(I2C_TIMEOUT_MS));
}
static esp_err_t i2c_write_read(uint8_t addr, uint8_t reg, uint8_t *buf, size_t len) {
    return i2c_master_write_read_device(I2C_PORT, addr, &reg, 1, buf, len,
                                        pdMS_TO_TICKS(I2C_TIMEOUT_MS));
}

// ---- BME280 ---------------------------------------------------------------

typedef struct {
    uint16_t T1; int16_t T2, T3;
    uint16_t P1; int16_t P2, P3, P4, P5, P6, P7, P8, P9;
    uint8_t  H1; int16_t H2; uint8_t H3; int16_t H4, H5; int8_t H6;
    int32_t t_fine;
} bme280_calib_t;

static bme280_calib_t s_calib;
static bool s_bme_ok = false;

static esp_err_t bme280_write_u8(uint8_t reg, uint8_t val) {
    uint8_t buf[2] = {reg, val};
    return i2c_write(BME280_ADDR, buf, 2);
}

static esp_err_t bme280_init(void) {
    uint8_t id = 0;
    if (i2c_write_read(BME280_ADDR, 0xD0, &id, 1) != ESP_OK) return ESP_FAIL;
    if (id != 0x60 && id != 0x58) { // 0x58 = BMP280 (P/T only), 0x60 = BME280
        ESP_LOGW(TAG, "BME280 chip id 0x%02x at 0x%02x (expected 0x60)", id, BME280_ADDR);
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "BME280 found at 0x%02x (chip id 0x%02x)", BME280_ADDR, id);

    // Calibration regs 0x88..0xA1 (T+P+H1).
    uint8_t b[26];
    if (i2c_write_read(BME280_ADDR, 0x88, b, 26) != ESP_OK) return ESP_FAIL;
    s_calib.T1 = (uint16_t)(b[1] << 8 | b[0]);
    s_calib.T2 = (int16_t)(b[3] << 8 | b[2]);
    s_calib.T3 = (int16_t)(b[5] << 8 | b[4]);
    s_calib.P1 = (uint16_t)(b[7] << 8 | b[6]);
    s_calib.P2 = (int16_t)(b[9] << 8 | b[8]);
    s_calib.P3 = (int16_t)(b[11] << 8 | b[10]);
    s_calib.P4 = (int16_t)(b[13] << 8 | b[12]);
    s_calib.P5 = (int16_t)(b[15] << 8 | b[14]);
    s_calib.P6 = (int16_t)(b[17] << 8 | b[16]);
    s_calib.P7 = (int16_t)(b[19] << 8 | b[18]);
    s_calib.P8 = (int16_t)(b[21] << 8 | b[20]);
    s_calib.P9 = (int16_t)(b[23] << 8 | b[22]);
    s_calib.H1 = b[25];

    // Calibration regs 0xE1..0xE7 (H2..H6).
    uint8_t h[7];
    if (i2c_write_read(BME280_ADDR, 0xE1, h, 7) != ESP_OK) return ESP_FAIL;
    s_calib.H2 = (int16_t)(h[1] << 8 | h[0]);
    s_calib.H3 = h[2];
    s_calib.H4 = (int16_t)((h[3] << 4) | (h[4] & 0x0F));
    s_calib.H5 = (int16_t)((h[5] << 4) | (h[4] >> 4));
    s_calib.H6 = (int8_t)h[6];

    // ctrl_hum (osrs_h = 1), ctrl_meas (osrs_t=1, osrs_p=1, mode=normal),
    // config (t_sb=1000ms, filter=off).
    bme280_write_u8(0xF2, 0x01);
    bme280_write_u8(0xF4, (1 << 5) | (1 << 2) | 0x03);
    bme280_write_u8(0xF5, (0x05 << 5));

    s_bme_ok = true;
    return ESP_OK;
}

static esp_err_t bme280_init_alt(void) {
    BME280_ADDR = 0x77;
    return bme280_init();
}

static float bme280_compensate_T(int32_t adc) {
    float var1 = (((float)adc) / 16384.0f - ((float)s_calib.T1) / 1024.0f) *
                 ((float)s_calib.T2);
    float var2 = ((((float)adc) / 131072.0f - ((float)s_calib.T1) / 8192.0f) *
                  (((float)adc) / 131072.0f - ((float)s_calib.T1) / 8192.0f)) *
                 ((float)s_calib.T3);
    s_calib.t_fine = (int32_t)(var1 + var2);
    return (var1 + var2) / 5120.0f;
}

static float bme280_compensate_P(int32_t adc) {
    float var1 = ((float)s_calib.t_fine / 2.0f) - 64000.0f;
    float var2 = var1 * var1 * ((float)s_calib.P6) / 32768.0f;
    var2 = var2 + var1 * ((float)s_calib.P5) * 2.0f;
    var2 = (var2 / 4.0f) + (((float)s_calib.P4) * 65536.0f);
    var1 = (((float)s_calib.P3) * var1 * var1 / 524288.0f +
            ((float)s_calib.P2) * var1) /
           524288.0f;
    var1 = (1.0f + var1 / 32768.0f) * ((float)s_calib.P1);
    if (var1 == 0.0f) return 0;
    float p = 1048576.0f - (float)adc;
    p = (p - (var2 / 4096.0f)) * 6250.0f / var1;
    var1 = ((float)s_calib.P9) * p * p / 2147483648.0f;
    var2 = p * ((float)s_calib.P8) / 32768.0f;
    p = p + (var1 + var2 + ((float)s_calib.P7)) / 16.0f;
    return p / 100.0f; // Pa -> hPa
}

static float bme280_compensate_H(int32_t adc) {
    float h = ((float)s_calib.t_fine) - 76800.0f;
    h = (adc - (((float)s_calib.H4) * 64.0f + ((float)s_calib.H5) / 16384.0f * h)) *
        (((float)s_calib.H2) / 65536.0f *
         (1.0f + ((float)s_calib.H6) / 67108864.0f * h *
                     (1.0f + ((float)s_calib.H3) / 67108864.0f * h)));
    h = h * (1.0f - ((float)s_calib.H1) * h / 524288.0f);
    if (h > 100.0f) h = 100.0f;
    if (h < 0.0f) h = 0.0f;
    return h;
}

static esp_err_t bme280_read(float *t, float *h, float *p) {
    uint8_t b[8];
    if (i2c_write_read(BME280_ADDR, 0xF7, b, 8) != ESP_OK) return ESP_FAIL;
    int32_t adc_p = ((int32_t)b[0] << 12) | ((int32_t)b[1] << 4) | (b[2] >> 4);
    int32_t adc_t = ((int32_t)b[3] << 12) | ((int32_t)b[4] << 4) | (b[5] >> 4);
    int32_t adc_h = ((int32_t)b[6] << 8) | b[7];
    *t = bme280_compensate_T(adc_t);
    *p = bme280_compensate_P(adc_p);
    *h = bme280_compensate_H(adc_h);
    return ESP_OK;
}

// ---- BH1750 ---------------------------------------------------------------

static bool s_bh_ok = false;

static esp_err_t bh1750_init(void) {
    // 0x10 = continuous high-resolution mode (1 lx, 120 ms typical).
    uint8_t cmd = 0x10;
    if (i2c_write(BH1750_ADDR, &cmd, 1) != ESP_OK) {
        ESP_LOGW(TAG, "BH1750 not responding");
        return ESP_FAIL;
    }
    s_bh_ok = true;
    return ESP_OK;
}

static esp_err_t bh1750_read(float *lux) {
    uint8_t b[2];
    if (i2c_master_read_from_device(I2C_PORT, BH1750_ADDR, b, 2,
                                    pdMS_TO_TICKS(I2C_TIMEOUT_MS)) != ESP_OK)
        return ESP_FAIL;
    uint16_t raw = (b[0] << 8) | b[1];
    *lux = raw / 1.2f;
    return ESP_OK;
}

// ---- ADC (soil + battery) -------------------------------------------------

#define ADC_UNIT             ADC_UNIT_1
#define SOIL_ADC_CHANNEL     ADC_CHANNEL_1   // GPIO1 on ESP32-C3
#define BATTERY_ADC_CHANNEL  ADC_CHANNEL_3   // GPIO3, 1:1 divider on BAT+

static adc_oneshot_unit_handle_t s_adc;
static adc_cali_handle_t          s_cali_battery = NULL;
static bool s_soil_ok = false;
static bool s_battery_ok = false;

static esp_err_t adc_init(void) {
    adc_oneshot_unit_init_cfg_t unit_cfg = {.unit_id = ADC_UNIT};
    if (adc_oneshot_new_unit(&unit_cfg, &s_adc) != ESP_OK) return ESP_FAIL;
    adc_oneshot_chan_cfg_t ch_cfg = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    if (adc_oneshot_config_channel(s_adc, SOIL_ADC_CHANNEL, &ch_cfg) == ESP_OK)
        s_soil_ok = true;
    if (adc_oneshot_config_channel(s_adc, BATTERY_ADC_CHANNEL, &ch_cfg) == ESP_OK)
        s_battery_ok = true;
    // GPIO2 is a strapping pin (selects internal LDO voltage at reset) and
    // must NOT be configured for ADC — doing so saturates the adjacent CH3
    // sample-hold. Same precaution would apply if anyone later considers
    // GPIO8/9 (those are I2C in our design).

    // Per-chip curve-fitting calibration for the battery channel. eFuse data
    // burned at the factory + a small polynomial bring the raw→mV error from
    // roughly ±50 mV (linear approximation) down to ±10 mV. Soil only needs
    // band classification so we skip cal there.
    if (s_battery_ok) {
        adc_cali_curve_fitting_config_t cali_cfg = {
            .unit_id  = ADC_UNIT,
            .chan     = BATTERY_ADC_CHANNEL,
            .atten    = ADC_ATTEN_DB_12,
            .bitwidth = ADC_BITWIDTH_DEFAULT,
        };
        if (adc_cali_create_scheme_curve_fitting(&cali_cfg, &s_cali_battery) != ESP_OK) {
            ESP_LOGW(TAG, "battery ADC calibration unavailable; falling back to raw-only");
            s_cali_battery = NULL;
        }
    }
    return (s_soil_ok || s_battery_ok) ? ESP_OK : ESP_FAIL;
}

static int adc_read_raw(adc_channel_t ch) {
    int raw = 0;
    if (adc_oneshot_read(s_adc, ch, &raw) != ESP_OK) return -1;
    return raw;
}

static int adc_raw_to_mv(adc_cali_handle_t cali, int raw) {
    if (!cali || raw < 0) return -1;
    int mv = 0;
    if (adc_cali_raw_to_voltage(cali, raw, &mv) != ESP_OK) return -1;
    return mv;
}

// ---- Public API -----------------------------------------------------------

void sensors_debug_scan(void);

static void i2c_scan(void) {
    ESP_LOGI(TAG, "I2C scan on SDA=GPIO%d SCL=GPIO%d:", I2C_SDA_GPIO, I2C_SCL_GPIO);
    int found = 0;
    for (uint8_t addr = 1; addr < 127; addr++) {
        uint8_t dummy;
        if (i2c_master_read_from_device(I2C_PORT, addr, &dummy, 1,
                                        pdMS_TO_TICKS(30)) == ESP_OK) {
            ESP_LOGI(TAG, "  found device at 0x%02x", addr);
            found++;
        }
    }
    if (!found) ESP_LOGW(TAG, "  no devices on bus");
}

void sensors_init(void) {
    i2c_config_t cfg = {
        .mode = I2C_MODE_MASTER,
        .sda_io_num = I2C_SDA_GPIO,
        .scl_io_num = I2C_SCL_GPIO,
        .sda_pullup_en = GPIO_PULLUP_ENABLE,
        .scl_pullup_en = GPIO_PULLUP_ENABLE,
        .master.clk_speed = I2C_FREQ_HZ,
    };
    i2c_param_config(I2C_PORT, &cfg);
    i2c_driver_install(I2C_PORT, I2C_MODE_MASTER, 0, 0, 0);

    i2c_scan();

    if (bme280_init() != ESP_OK) {
        ESP_LOGW(TAG, "BME280 init failed at 0x%02x — retrying at 0x77", BME280_ADDR);
        // some boards float SDO and end up at 0x77.
        bme280_init_alt();
    }
    bh1750_init();
    adc_init();

    // BH1750 first measurement takes ~120ms in HR mode.
    vTaskDelay(pdMS_TO_TICKS(180));
}

void sensors_read(sensor_reading_t *out) {
    memset(out, 0, sizeof(*out));
    if (s_bme_ok) {
        if (bme280_read(&out->temperature_c, &out->humidity_pct,
                        &out->pressure_hpa) == ESP_OK) {
            out->has_bme280 = true;
        }
    }
    if (s_bh_ok) {
        if (bh1750_read(&out->lux) == ESP_OK) {
            out->has_bh1750 = true;
        }
    }
    if (s_soil_ok) {
        int raw = adc_read_raw(SOIL_ADC_CHANNEL);
        if (raw >= 0) {
            out->soil_moisture_raw = raw;
            out->has_soil = true;
        }
    }
    if (s_battery_ok) {
        int raw = adc_read_raw(BATTERY_ADC_CHANNEL);
        if (raw >= 0) {
            out->battery_raw = raw;
            out->battery_mv  = adc_raw_to_mv(s_cali_battery, raw);
            out->has_battery = true;
        } else {
            out->battery_mv = -1;
        }
    }
}

void sensors_debug_scan(void) {
    i2c_scan();
}
