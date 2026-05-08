#pragma once
#include <string>
#include <optional>
#include "Device.hpp"
#include <vector>

class AbstractDeviceRepository {
   public:
    virtual ~AbstractDeviceRepository() = default;

    virtual int insert(const std::string& serial_number) = 0;
    virtual bool existsBySerialNumber(const std::string& serial_number) = 0;

    virtual std::vector<Device> getAll() = 0;
    virtual std::optional<Device> getBySerialNumber(const std::string& serial_number) = 0;
    virtual std::optional<Device> getById(size_t id) = 0;

    virtual int removeById(size_t id) = 0;
    virtual void remove(Device& device) = 0;
};