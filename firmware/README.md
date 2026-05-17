# firmware/

ESP-IDF project for the Zelenka sensor (ESP32-C3 Super Mini + BME280 + BH1750
+ capacitive soil V1.2 + RGB LED + capacitive touch button).

## What Sprint 0 ships

Boot → I2C/ADC/LED init → Wi-Fi (STA, creds from menuconfig) → loop:
sample → POST to API → sleep 30 s. RGB LED reports state. No deep sleep,
no buffer, no captive portal, no battery reading, no OTA — those land in
Sprint 2.

## Pin assignments

| Pin                 | GPIO | Notes                          |
| ------------------- | ---- | ------------------------------ |
| I2C SDA             | 8    | BME280 + BH1750 (shared bus)   |
| I2C SCL             | 9    | BME280 + BH1750 (shared bus)   |
| Soil moisture (ADC) | 1    | ADC1_CH1, atten 12 dB          |
| LED R               | 5    | common-cathode RGB             |
| LED G               | 6    | common-cathode RGB             |
| LED B               | 7    | common-cathode RGB             |
| Touch button DO     | 10   | TTP223 DO; unused in Sprint 0  |

If your board wires the LED or touch differently, change the `#define`s in
`main/led.c` (and later `main/touch.c`).

## Build & flash

```bash
. ~/esp/esp-idf/export.sh
cd firmware/
idf.py set-target esp32c3
idf.py menuconfig    # → Zelenka submenu — set SSID, password, API URL, device token
idf.py build flash monitor
```

Get the **device token** from the PWA: open <http://localhost/>, log in
via magic link, the auto-created device card shows the token. Paste it
into `CONFIG_ZELENKA_DEVICE_TOKEN`.

Set `CONFIG_ZELENKA_API_URL` to your dev machine's LAN IP, e.g.
`http://192.168.1.42/api/device/measurements`. Caddy is on port 80.

The sensor's LED tells you what's happening:

| Color  | Meaning                       |
| ------ | ----------------------------- |
| white  | just booted                   |
| blue   | connecting to Wi-Fi           |
| amber  | POST in flight                |
| green  | last cycle succeeded          |
| red    | last cycle failed (any reason)|
