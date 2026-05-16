# Top-level CMake for the Zelenka sensor firmware (ESP32-C3 Super Mini).
# Build with the standard ESP-IDF workflow:
#   . ~/esp/esp-idf/export.sh
#   idf.py set-target esp32c3
#   idf.py menuconfig          # set Wi-Fi creds, API URL, device token under "Zelenka"
#   idf.py build flash monitor
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(zelenka_firmware)
