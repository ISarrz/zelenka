idf_component_register(
    SRCS
        "main.c"
        "wifi.c"
        "sensors.c"
        "http_post.c"
        "led.c"
    INCLUDE_DIRS "."
    REQUIRES
        nvs_flash
        esp_wifi
        esp_event
        esp_http_client
        esp_adc
        driver
        json
)
