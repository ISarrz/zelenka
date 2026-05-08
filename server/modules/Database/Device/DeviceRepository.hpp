#pragma once
#include "../Database/Database.hpp"
#include "AbstractDeviceRepository.hpp"

class DeviceRepository : public AbstractDeviceRepository {
   public:
    DeviceRepository(Database* database) : database_(database) {}

    int insert(const std::string& serial_number) override;
    bool existsBySerialNumber(const std::string& serial_number) override;

    std::optional<Device> getBySerialNumber(const std::string& serial_number) override;
    std::optional<Device> getById(size_t id) override;
    std::vector<Device> getAll() override;

    void remove(Device& device) override;
    int removeById(size_t id) override;
    Device Constructor(const sql::ResultSet* info);

   private:
    Database* database_;
};