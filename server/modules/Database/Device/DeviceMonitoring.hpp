#pragma once
#include <cstddef>
#include <nlohmann/json.hpp>
#include <string>

class DeviceMonitoring {
   public:
    size_t id;
    size_t device_id;
    std::string timestamp;
    float temperature;
    float humidity;
    float hydration;
    float pressure;
    float light;
};

NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(DeviceMonitoring, id, device_id, timestamp,
                                   temperature, humidity, hydration, pressure,
                                   light)