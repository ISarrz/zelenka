#pragma once
#include "../Database/Database.hpp"
#include "AbstractDeviceMonitoringRepository.hpp"

class DeviceMonitoringRepository : public AbstractDeviceMonitoringRepository {
   public:
    DeviceMonitoringRepository(Database* database) : database_(database) {}

    int insert(size_t device_id, double temperature, double humidity,
               double hydration, double pressure, double light) override;

    std::vector<DeviceMonitoring> getByDeviceId(size_t device_id) override;
    std::vector<DeviceMonitoring> getByUserId(size_t user_id) override;
    std::vector<DeviceMonitoring> getAll() override;
    std::optional<DeviceMonitoring> getById(size_t id) override;

   private:
    DeviceMonitoring Constructor(const sql::ResultSet* info);
    Database* database_;
};