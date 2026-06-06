// Zelenka sensor — Sprint 2 firmware.
//
// Cycle:
//   no cfg?           ->  SoftAP + captive portal + form -> save NVS + reboot
//   cfg + wifi ok     ->  sample -> push to RTC-RAM batch
//                         if batch full: wifi up, NTP, POST batch, clear, sleep
//                         else:                                         sleep
//   wifi failing N×   ->  wipe NVS -> reboot into SoftAP
//
// All inter-sample time is spent in deep sleep, so quiescent current dominates
// average power. With 6 samples/hour and ~4s awake per sample, the chip is
// awake ~24s/h ≈ 0.7%.

#include <inttypes.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "esp_app_desc.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif_sntp.h"
#include "esp_sleep.h"
#include "esp_sntp.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "sdkconfig.h"

#include "http_post.h"
#include "led.h"
#include "nvs_cfg.h"
#include "offline_buffer.h"
#include "ota.h"
#include "provisioning.h"
#include "sensors.h"
#include "wifi.h"

// Consecutive Wi-Fi connect failures before we conclude the stored creds are
// dead (wrong SSID/password, network gone) and drop back into provisioning.
// At normal cadence (~1 connect/h) this is ~10 hours of pain; during rapid
// setup (1 connect/10 s) it's ~100 s. Either way: user noticed, intentional.
#define WIFI_FAIL_LIMIT 10

// First-connect validation: how many times we retry brand-new (unconfirmed)
// creds back-to-back before giving up and dropping back into provisioning.
#define FIRST_CONNECT_ATTEMPTS 5

static const char *TAG = "zelenka";

// Samples buffered in RTC slow memory across deep sleeps.
RTC_DATA_ATTR static sensor_reading_t batch_samples[CONFIG_ZELENKA_BATCH_SIZE];
RTC_DATA_ATTR static int64_t          batch_epochs[CONFIG_ZELENKA_BATCH_SIZE];
RTC_DATA_ATTR static int              batch_count = 0;
RTC_DATA_ATTR static bool             time_synced = false;
RTC_DATA_ATTR static bool             did_initial_burst = false;
// Wall-clock at which the device first completed provisioning and ran its
// burst. Used to keep the device in a "rapid setup" cadence for the first
// hour so the user can see live updates while they place the sensor.
RTC_DATA_ATTR static int64_t          provisioned_at_epoch = 0;
RTC_DATA_ATTR static int              wifi_fail_streak     = 0;

// First hour after provisioning: take a sample every 10 s and POST every
// minute (batch of 6). After that, drop back to the production cadence
// (sample every CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC, batch of 6 → ~1 h).
#define RAPID_SETUP_SEC          3600
#define RAPID_SAMPLE_INTERVAL_SEC 10

static bool in_rapid_setup(void) {
    if (!time_synced || provisioned_at_epoch == 0) return false;
    int64_t now = (int64_t)time(NULL);
    return (now - provisioned_at_epoch) < RAPID_SETUP_SEC;
}

static int current_sample_interval(void) {
    return in_rapid_setup() ? RAPID_SAMPLE_INTERVAL_SEC : CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC;
}

// During the post-provisioning rapid window we POST every sample so the
// calibration UI can read live values; outside the window we collect a
// full batch and push once. Cost: a Wi-Fi reconnect per sample for one
// hour — heavy but bounded.
static int current_batch_target(void) {
    return in_rapid_setup() ? 1 : CONFIG_ZELENKA_BATCH_SIZE;
}

// On first power-on after provisioning we run a fast smoke test: BURST_SAMPLES
// samples spaced BURST_INTERVAL_MS apart, then push them all at once. The user
// sees real numbers on the home screen within ~70s of plugging the sensor in
// instead of waiting for the first natural batch (~hour). The RTC-RAM flag
// ensures it only happens once per power cycle, not on every deep-sleep wake.
#define BURST_SAMPLES     6
#define BURST_INTERVAL_MS 10000

static void init_nvs(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
}

static void enter_deep_sleep(int sec) {
    ESP_LOGI(TAG, "sleeping %d s (batch %d/%d)", sec, batch_count, CONFIG_ZELENKA_BATCH_SIZE);
    esp_sleep_enable_timer_wakeup((int64_t)sec * 1000000LL);
    esp_deep_sleep_start();
}

// Wipe stored Wi-Fi creds and reboot. The next boot will see no cfg and drop
// into the SoftAP captive portal automatically.
static void drop_to_provisioning(const char *reason) {
    ESP_LOGW(TAG, "wifi failed %d×, dropping to provisioning (%s)", wifi_fail_streak, reason);
    wifi_fail_streak = 0;
    zelenka_cfg_wipe();
    esp_restart();
}

// One "logical sample" = mean of 3 raw reads ~100ms apart. Smooths out the
// usual ADC noise and the occasional I2C flake without measurable battery
// cost (extra awake time is ~200 ms).
#define SAMPLE_AVG_N 3

static void sample_averaged(sensor_reading_t *out) {
    *out = (sensor_reading_t){0};
    float t_sum = 0, h_sum = 0, p_sum = 0, lux_sum = 0;
    int   t_n = 0, h_n = 0, p_n = 0, lux_n = 0;
    long  soil_sum = 0, battery_sum = 0, battery_mv_sum = 0;
    int   soil_n = 0, battery_n = 0, battery_mv_n = 0;

    for (int i = 0; i < SAMPLE_AVG_N; i++) {
        sensor_reading_t r;
        sensors_read(&r);
        if (r.has_bme280) {
            t_sum += r.temperature_c; t_n++;
            h_sum += r.humidity_pct;  h_n++;
            p_sum += r.pressure_hpa;  p_n++;
        }
        if (r.has_bh1750) {
            lux_sum += r.lux; lux_n++;
        }
        if (r.has_soil) {
            soil_sum += r.soil_moisture_raw; soil_n++;
        }
        if (r.has_battery) {
            battery_sum += r.battery_raw; battery_n++;
            if (r.battery_mv >= 0) { battery_mv_sum += r.battery_mv; battery_mv_n++; }
        }
        if (i < SAMPLE_AVG_N - 1) vTaskDelay(pdMS_TO_TICKS(100));
    }
    if (t_n   > 0) { out->temperature_c   = t_sum / t_n;
                     out->humidity_pct    = h_sum / h_n;
                     out->pressure_hpa    = p_sum / p_n;
                     out->has_bme280 = true; }
    if (lux_n > 0) { out->lux             = lux_sum / lux_n;
                     out->has_bh1750 = true; }
    if (soil_n > 0){ out->soil_moisture_raw = (int)(soil_sum / soil_n);
                     out->has_soil = true; }
    if (battery_n > 0) { out->battery_raw = (int)(battery_sum / battery_n);
                         out->battery_mv  = battery_mv_n > 0 ? (int)(battery_mv_sum / battery_mv_n) : -1;
                         out->has_battery = true; }
}

// Fresh device metadata (firmware version + current Wi-Fi RSSI) to bolt onto
// each POST. Wi-Fi must be up before calling. Strings/integers live in static
// storage so the returned struct stays valid for the rest of the POST cycle.
static http_post_meta_t collect_post_meta(void) {
    static char fw_version[32];
    static int  wifi_rssi;
    static zelenka_err_t          err_record;
    static http_post_last_error_t err_payload;
    const esp_app_desc_t *desc = esp_app_get_description();
    snprintf(fw_version, sizeof(fw_version), "%s", desc ? desc->version : "unknown");

    wifi_ap_record_t ap;
    const bool got_rssi = esp_wifi_sta_get_ap_info(&ap) == ESP_OK;
    if (got_rssi) wifi_rssi = ap.rssi;

    zelenka_err_load(&err_record);
    const http_post_last_error_t *err_ptr = NULL;
    if (err_record.present) {
        err_payload = (http_post_last_error_t){
            .reset_reason     = err_record.reset_reason,
            .count            = err_record.count,
            .firmware_version = err_record.fw_version,
        };
        err_ptr = &err_payload;
    }

    return (http_post_meta_t){
        .firmware_version = fw_version,
        .wifi_rssi        = got_rssi ? &wifi_rssi : NULL,
        .last_error       = err_ptr,
    };
}

// React to a pending factory reset signalled from the server. Wipes NVS and
// reboots — the next boot has no config, drops into the SoftAP captive
// portal, and the user can re-provision without ever touching the device.
static void handle_factory_reset_if_requested(bool flag) {
    if (!flag) return;
    ESP_LOGW(TAG, "server requested factory reset; wiping NVS and rebooting into provisioning");
    zelenka_cfg_wipe();
    esp_restart();
}

// Drain SPIFFS-buffered batches (oldest first) for up to a few iterations.
// Stops at first failed POST or empty buffer.
static void flush_offline_pending(const zelenka_cfg_t *cfg) {
    for (int i = 0; i < 5; i++) {
        sensor_reading_t buf[CONFIG_ZELENKA_BATCH_SIZE];
        int64_t epochs[CONFIG_ZELENKA_BATCH_SIZE];
        size_t got = 0, remaining = 0;
        if (offline_buffer_drain_read(buf, epochs, CONFIG_ZELENKA_BATCH_SIZE, &got, &remaining) != ESP_OK)
            return;
        if (got == 0) return;
        http_post_meta_t meta = collect_post_meta();
        bool factory_reset = false;
        if (http_post_batch(cfg->api_url, cfg->device_token, buf, epochs, got, &meta, &factory_reset) != ESP_OK) return;
        handle_factory_reset_if_requested(factory_reset);
        offline_buffer_commit(got);
        if (remaining == 0) return;
    }
}

static bool sync_ntp_blocking(void) {
    esp_sntp_config_t cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
    cfg.sync_cb = NULL;
    esp_netif_sntp_init(&cfg);
    esp_err_t err = esp_netif_sntp_sync_wait(pdMS_TO_TICKS(5000));
    esp_netif_sntp_deinit();
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ntp sync timed out");
        return false;
    }
    time_t now = 0;
    time(&now);
    ESP_LOGI(TAG, "ntp synced: %lld", (long long)now);
    return now > 1700000000;
}

void app_main(void) {
    init_nvs();
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    zelenka_led_init();
    zelenka_led_set(ZELENKA_LED_BOOT);

    // Crash report: if we got here from a panic / watchdog / brownout, save
    // it to a separate NVS namespace (survives cfg wipe), then wipe Wi-Fi
    // creds so we drop into SoftAP automatically. The user re-provisions;
    // the first POST after reconnect carries the saved error and clears it.
    esp_reset_reason_t reason = esp_reset_reason();
    const esp_app_desc_t *boot_desc = esp_app_get_description();
    const char *boot_fw = boot_desc ? boot_desc->version : "";
    if (reason == ESP_RST_PANIC || reason == ESP_RST_INT_WDT ||
        reason == ESP_RST_TASK_WDT || reason == ESP_RST_WDT ||
        reason == ESP_RST_BROWNOUT) {
        ESP_LOGW(TAG, "crash boot (reason=%d) — saving error, dropping to provisioning", (int)reason);
        zelenka_err_save((int)reason, boot_fw);
        zelenka_cfg_wipe();
        esp_restart();
    }

    // Fresh power cycle: reset RTC-RAM transients so the smoke-test burst
    // runs again. Soft restarts (e.g. after provisioning save) keep state.
    if (reason == ESP_RST_POWERON) {
        did_initial_burst = false;
        batch_count = 0;
        time_synced = false;
        wifi_fail_streak = 0;
    }

    zelenka_cfg_t cfg;
    zelenka_cfg_load(&cfg);

    if (!cfg.present) {
        ESP_LOGI(TAG, "no provisioning — entering SoftAP captive portal");
        // Make sure the post-provisioning boot runs the smoke-test burst (where
        // first-connect validation lives), even if RTC RAM survived a prior
        // working session (e.g. re-provision after a factory reset).
        did_initial_burst = false;
        zelenka_led_set(ZELENKA_LED_PROVISIONING);  // solid white while we wait for creds
        provisioning_run();
        // provisioning_run never returns: a successful form submit calls
        // esp_restart(); otherwise it stays in SoftAP forever.
        esp_restart();
    }

    sensors_init();
    offline_buffer_init();
    zelenka_led_set(ZELENKA_LED_OFF);  // dark during normal sampling; lights up only to connect

    // Stamp the moment we *first* have a usable wall clock — that's the
    // start of the rapid-setup window. For fresh devices this lines up with
    // first NTP sync right after provisioning; for OTA-upgraded devices
    // (whose burst already happened on older firmware) it lines up with the
    // first wake under the new code, giving them a one-time hour of fast
    // updates after the upgrade. Harmless drain compared to a fresh provision.
    if (time_synced && provisioned_at_epoch == 0) {
        provisioned_at_epoch = (int64_t)time(NULL);
        ESP_LOGI(TAG, "rapid-setup window begins (1 hour from now)");
    }

    if (!did_initial_burst) {
        // ---- Initial smoke-test burst (~70s after power-on) -----------------
        // Stays awake, Wi-Fi up, six samples 10s apart, push the batch, then
        // hand off to normal aligned-cycle operation.
        ESP_LOGI(TAG, "initial burst: 6 samples * 10s");
        zelenka_led_set(ZELENKA_LED_CONNECTING);  // blinking white while joining Wi-Fi
        bool wifi_ok = (wifi_connect_blocking(cfg.wifi_ssid, cfg.wifi_password) == ESP_OK);
        if (!wifi_ok && cfg.unconfirmed) {
            // First connection on freshly-entered creds that have never worked.
            // The user is standing by, so fail fast: retry up to
            // FIRST_CONNECT_ATTEMPTS times back-to-back (each
            // wifi_connect_blocking already does its own 5 internal retries /
            // 30 s timeout) and, if none succeed, wipe and drop straight back
            // into the captive portal so they can re-enter — instead of the
            // slow hourly streak that only gives up after ~10 h and resets on
            // every power-cycle.
            for (int attempt = 2; !wifi_ok && attempt <= FIRST_CONNECT_ATTEMPTS; attempt++) {
                ESP_LOGW(TAG, "first-connect attempt %d/%d failed; retrying", attempt - 1, FIRST_CONNECT_ATTEMPTS);
                vTaskDelay(pdMS_TO_TICKS(2000));
                wifi_ok = (wifi_connect_blocking(cfg.wifi_ssid, cfg.wifi_password) == ESP_OK);
            }
            if (!wifi_ok) drop_to_provisioning("first-connect");  // never returns
        }
        if (wifi_ok) {
            zelenka_led_set(ZELENKA_LED_CONNECTED);  // green 10 s, then off
            wifi_fail_streak = 0;
            if (cfg.unconfirmed) zelenka_cfg_mark_confirmed();  // creds proven good
            if (!time_synced) time_synced = sync_ntp_blocking();
        } else {
            if (++wifi_fail_streak >= WIFI_FAIL_LIMIT) drop_to_provisioning("burst");
        }

        batch_count = 0;
        for (int i = 0; i < BURST_SAMPLES; i++) {
            sensor_reading_t r = {0};
            sample_averaged(&r);
            batch_samples[batch_count] = r;
            batch_epochs[batch_count]  = time_synced ? (int64_t)time(NULL) : 0;
            batch_count++;
            ESP_LOGI(TAG,
                     "burst %d/%d: bme=%d bh=%d soil=%d | t=%.2fC h=%.2f%% lux=%.1f soil=%d",
                     batch_count, BURST_SAMPLES,
                     r.has_bme280, r.has_bh1750, r.has_soil,
                     r.temperature_c, r.humidity_pct, r.lux, r.soil_moisture_raw);
            if (i < BURST_SAMPLES - 1) vTaskDelay(pdMS_TO_TICKS(BURST_INTERVAL_MS));
        }

        if (wifi_ok) {
            // LED stays on the green "connected" confirmation; only a failure
            // overrides it (red). The POST runs silently underneath.
            http_post_meta_t meta = collect_post_meta();
            bool factory_reset = false;
            esp_err_t err = http_post_batch(
                cfg.api_url, cfg.device_token,
                batch_samples, batch_epochs, batch_count, &meta, &factory_reset);
            handle_factory_reset_if_requested(factory_reset);
            if (err != ESP_OK) zelenka_led_set(ZELENKA_LED_ERROR);
            if (err == ESP_OK) {
                batch_count = 0;
                zelenka_err_clear();
                flush_offline_pending(&cfg);
                ota_mark_valid_if_pending();
                char base[64];
                ota_base_from_url(cfg.api_url, base, sizeof(base));
                ota_check_and_apply(base);
            } else {
                offline_buffer_append(batch_samples, batch_epochs, batch_count);
                batch_count = 0;
            }
        } else {
            ESP_LOGW(TAG, "burst: wifi unavailable, spilling to disk");
            offline_buffer_append(batch_samples, batch_epochs, batch_count);
            batch_count = 0;
            zelenka_led_set(ZELENKA_LED_ERROR);
        }
        did_initial_burst = true;
        vTaskDelay(pdMS_TO_TICKS(800));
    } else {
        // ---- Normal cycle: one sample per wake, batch posted when full -----
        sensor_reading_t r = {0};
        sample_averaged(&r);
        if (batch_count < CONFIG_ZELENKA_BATCH_SIZE) {
            batch_samples[batch_count] = r;
            batch_epochs[batch_count]  = time_synced ? (int64_t)time(NULL) : 0;
            batch_count++;
        }
        ESP_LOGI(TAG,
                 "sample %d/%d: bme=%d bh=%d soil=%d | t=%.2fC h=%.2f%% lux=%.1f soil=%d",
                 batch_count, CONFIG_ZELENKA_BATCH_SIZE,
                 r.has_bme280, r.has_bh1750, r.has_soil,
                 r.temperature_c, r.humidity_pct, r.lux, r.soil_moisture_raw);

        if (batch_count >= current_batch_target()) {
            // No white "connecting" blink on routine sends — that ceremony is
            // only shown on the very first connect (the burst above). Here we
            // stay dark until connected, then flash green.
            if (wifi_connect_blocking(cfg.wifi_ssid, cfg.wifi_password) == ESP_OK) {
                zelenka_led_set(ZELENKA_LED_CONNECTED);  // green 10 s, then off
                wifi_fail_streak = 0;
                if (!time_synced) time_synced = sync_ntp_blocking();
                if (time_synced) {
                    int64_t now = (int64_t)time(NULL);
                    for (int i = 0; i < batch_count; i++) {
                        if (batch_epochs[i] == 0) {
                            batch_epochs[i] = now - (int64_t)(batch_count - 1 - i)
                                              * CONFIG_ZELENKA_SAMPLE_INTERVAL_SEC;
                        }
                    }
                }
                // LED stays on the green "connected" confirmation; the POST
                // runs silently underneath and only a failure overrides it (red).
                http_post_meta_t meta = collect_post_meta();
                bool factory_reset = false;
                esp_err_t err = http_post_batch(
                    cfg.api_url, cfg.device_token,
                    batch_samples, batch_epochs, batch_count, &meta, &factory_reset);
                handle_factory_reset_if_requested(factory_reset);
                if (err == ESP_OK) {
                    batch_count = 0;
                    zelenka_err_clear();
                    flush_offline_pending(&cfg);
                    ota_mark_valid_if_pending();
                    char base[64];
                    ota_base_from_url(cfg.api_url, base, sizeof(base));
                    ota_check_and_apply(base);
                } else {
                    offline_buffer_append(batch_samples, batch_epochs, batch_count);
                    batch_count = 0;
                    zelenka_led_set(ZELENKA_LED_ERROR);
                }
                vTaskDelay(pdMS_TO_TICKS(600));
            } else {
                ESP_LOGW(TAG, "wifi failed, spilling to disk");
                offline_buffer_append(batch_samples, batch_epochs, batch_count);
                batch_count = 0;
                zelenka_led_set(ZELENKA_LED_ERROR);
                vTaskDelay(pdMS_TO_TICKS(600));
                if (++wifi_fail_streak >= WIFI_FAIL_LIMIT) drop_to_provisioning("cycle");
            }
        }
    }

    // Once the burst has synced the clock on a freshly-provisioned device,
    // open the rapid-setup window now so the very next wake is on the fast
    // (10 s) cadence. Without this the stamp above is skipped (on a fresh
    // device time isn't synced until the burst's NTP runs), the device then
    // sleeps a full production interval and posts only a batch/hour — so the
    // calibration UI sees no fresh soil reading for ~an hour right after
    // setup. On OTA-upgraded devices this is a no-op (already stamped above).
    if (time_synced && provisioned_at_epoch == 0) {
        provisioned_at_epoch = (int64_t)time(NULL);
        ESP_LOGI(TAG, "rapid-setup window begins (1 hour from now)");
    }

    // Align next wake to the next multiple of the active sample interval —
    // 10 s during the post-provisioning rapid window, otherwise the
    // production cadence. Falls back to fixed interval until time is synced.
    int interval = current_sample_interval();
    int sleep_sec = interval;
    if (time_synced) {
        int64_t now = (int64_t)time(NULL);
        int64_t next = ((now / interval) + 1) * interval;
        int64_t delta = next - now;
        if (delta < 5) delta += interval; // never sleep <5s
        sleep_sec = (int)delta;
    }
    enter_deep_sleep(sleep_sec);
}
