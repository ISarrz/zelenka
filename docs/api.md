# External API contracts

This file documents the two places where Zelenka talks to clients we
don't control: the firmware on the ESP32-C3 sensor, and the browsers
that subscribed to Web Push. Everything else lives in TypeScript types
under `apps/api/src/routes/` and changes too fast to mirror here.

## 1. Firmware ↔ backend

### `POST /api/device/measurements`

Sensor pushes batches every ~hour (6 samples × 10-min interval). Both
single-sample and batch shapes are accepted — the device chooses based
on whether the payload is buffered (`samples` array) or fresh (top-level
sample fields).

**Auth:** `Authorization: Bearer <deviceToken>`. The token lives in the
device's NVS and was minted by `POST /api/devices` at provisioning.

**Body — batch form (preferred):**

```json
{
  "samples": [
    {
      "measuredAt": "2026-05-17T17:18:04Z",
      "temperatureC": 23.86,
      "humidityPct": 56.4,
      "pressureHpa": 992.35,
      "lux": 58.3,
      "soilMoistureRaw": 3047,
      "soilMoisturePct": null,
      "batteryRaw": 2746,
      "batteryMv": 1997
    }
  ],
  "device": {
    "firmwareVersion": "0.1.9",
    "wifiRssi": -71
  }
}
```

**Field reference:**

| Field             | Type    | Range / Notes                                                        |
| ----------------- | ------- | -------------------------------------------------------------------- |
| `measuredAt`      | string  | ISO-8601 UTC. Omit when NTP hasn't synced; API stamps server time.   |
| `temperatureC`    | number  | BME280 °C, ~−40..85. Null if sensor absent or failed.                |
| `humidityPct`     | number  | BME280 RH 0..100.                                                    |
| `pressureHpa`     | number  | BME280 hPa.                                                          |
| `lux`             | number  | BH1750 ≥ 0.                                                          |
| `soilMoistureRaw` | int     | ADC1_CH1 (GPIO1) raw 0..4095. Lower = wetter (capacitive V1.2).      |
| `soilMoisturePct` | number  | Optional pct 0..100; firmware doesn't compute it today.              |
| `batteryRaw`      | int     | ADC1_CH3 (GPIO3) raw 0..4095 (100k:100k divider on BAT+).            |
| `batteryMv`       | int     | Calibrated pin voltage in mV (eFuse curve-fit). Firmware ≥ 0.1.9.    |
| `device.firmwareVersion` | string | App-desc version, e.g. "0.1.9".                                |
| `device.wifiRssi` | int     | RSSI at POST time in dBm. Negative, typically −30 .. −90.            |

All sample fields are nullable/optional — firmware sends only what it
has. The API gracefully fills `null` for the rest.

**Batch limits:** 1..64 samples per request. Body capped at ~2 KB on the
firmware side (`BODY_MAX` in `firmware/main/http_post.c`).

**Response:** `200 { "stored": <number> }`. Errors are 400 (validation),
401 (bad token), 500 (DB).

### `GET /api/firmware/manifest.json`

Read every successful POST batch — the firmware compares `version` to
its own `esp_app_get_description()->version`, and OTA-downloads the
new bin if they differ.

**Auth:** none (manifest is public, signed by sha256).

**Response:**

```json
{
  "version": "0.1.9",
  "url": "/api/firmware/zelenka-0.1.9.bin",
  "sha256": "d60fa74c...",
  "size": 1142320
}
```

The firmware fetches `url` via HTTPS (rooted in `esp_crt_bundle`),
verifies size + sha256 before applying. Bootloader rolls back on first
failed-boot of a new image (`CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE`).

## 2. Web Push payload

Sent from `apps/api/src/lib/push.ts` to every subscribed browser. The
service worker (`apps/web/public/sw.js`) reads it and renders the
system notification.

**Shape** (TS source of truth in `lib/push.ts:PushPayload`):

```json
{
  "title": "Фикус",
  "body": "Полейте 150–200 мл тёплой воды.",
  "url":  "/devices/3524dbef-.../p/soil",
  "tag":  "<plantId>:<triggerKind>"
}
```

| Field   | Type    | Notes                                                            |
| ------- | ------- | ---------------------------------------------------------------- |
| `title` | string  | ≤ 40 chars per design doc. Plant name in title, no exclamations. |
| `body`  | string  | ≤ 100 chars. Action + numbers, not alert text.                   |
| `url`   | string? | Deep link opened on `notificationclick`. Optional.               |
| `tag`   | string? | Browser-side dedup key; same tag replaces an existing toast.     |

**Trigger taxonomy:** the 12 kinds emitted by the rule engine —

| Kind                | Source                  | Cooldown      | When                                                  |
| ------------------- | ----------------------- | ------------- | ----------------------------------------------------- |
| `soil_orange`       | `evaluatePushTriggers`  | 12h           | Soil severity transitions to `warn`.                  |
| `soil_red`          | same                    | 12h           | Soil severity transitions to `alert`.                 |
| `temp_orange`       | same                    | 12h           | Temperature transitions to `warn`.                    |
| `temp_red`          | same                    | 12h           | Temperature transitions to `alert`.                   |
| `temp_drop`         | same                    | 12h           | Temperature drops ≥ 5°C within 2h.                    |
| `light_low`         | `scanScheduledTriggers` | 24h           | 3+ days under `lux.okMin`.                            |
| `air_dry`           | same                    | 24h           | 5+ days under `humidityPct.okMin`.                    |
| `sensor_silent`     | same                    | 24h           | 24h+ since last measurement.                          |
| `onboarding_place_ok` / `_alert` | same       | once / plant  | At +48h after `Plant.identifiedAt`.                   |
| `morning_digest`    | same                    | daily         | At `User.quietHoursEndMin` in user's TZ.              |
| `battery_low_week`  | same                    | 7d            | Battery estimate in {`low`, `critical`}.              |

Cooldowns and the daily cap (3 / plant / 24h) are enforced by
`shouldSuppress()` in `lib/rules.ts`. Quiet hours mute everything; the
muted entries surface in the morning digest.

### Subscription lifecycle

- `GET  /api/push/vapid-public-key` — server's VAPID pub key, browser
  passes to `pushManager.subscribe`.
- `POST /api/push/subscribe` — body is the result of `subscription.toJSON()`.
- `POST /api/push/unsubscribe` — body `{ endpoint }`.
- `POST /api/push/test` — sends a smoke-test notification to all of the
  user's subscriptions. Used by the Settings screen.

Endpoints that return 4xx during send are deleted from
`PushSubscription` automatically — silent unsubscribe matching the
browser-side reality.
