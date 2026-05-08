#pragma once
#include <optional>
#include <vector>

#include "DeviceMonitoring.hpp"

class AbstractDeviceMonitoringRepository {
   public:
    virtual ~AbstractDeviceMonitoringRepository() = default;

    virtual int insert(size_t device_id, double temperature, double humidity,
                       double hydration, double pressure,
                       double light) = 0;

    virtual std::vector<DeviceMonitoring> getByDeviceId(size_t device_id) = 0;
    virtual std::vector<DeviceMonitoring> getByUserId(size_t user_id) = 0;
    virtual std::vector<DeviceMonitoring> getAll() = 0;
    virtual std::optional<DeviceMonitoring> getById(size_t id) = 0;
};