#pragma once
#include <optional>

#include "../Database/Database.hpp"
#include "../Device/DeviceRepository.hpp"
#include "AbstractUserRepository.hpp"
#include "User.hpp"

class UserRepository : public AbstractUserRepository {
   public:
    ~UserRepository() override = default;
    explicit UserRepository(Database* database);

    std::optional<User> getById(size_t id) override;
    std::optional<User> getByLogin(const std::string& login) override;
    std::optional<User> getByEmail(const std::string& email) override;
    std::vector<User> getAll() override;

    int insert(std::string login, std::string email,
               std::string password) override;

    bool existsByLogin(const std::string& login) override;
    bool existsByEmail(const std::string& email) override;
    void remove(User& user) override;
    int removeById(size_t id) override;

    std::vector<Device> getUserDevices(size_t user_id) override;
    std::vector<DeviceMonitoring> getUserDeviceMonitorings(
        size_t user_id) override;
    bool insertUserDevice(size_t user_id, size_t device_id) override;
    bool userDeviceExists(size_t user_id, size_t device_id) override;
    bool removeUserDevice(size_t user_id, size_t device_id) override;

   private:
    static User Constructor(const sql::ResultSet* info);
    Database* database_;
};
