#pragma once
#include <cstddef>
#include <nlohmann/json.hpp>
#include <string>

class Device {
   public:
    size_t id;
    std::string serial_number;
};

NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(Device, id, serial_number)