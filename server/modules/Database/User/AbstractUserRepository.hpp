#pragma once
#include <optional>

#include "../Device/Device.hpp"
#include "../Device/DeviceMonitoring.hpp"
#include "User.hpp"
#include "vector"
class AbstractUserRepository {
   public:
    virtual ~AbstractUserRepository() = default;

    virtual std::optional<User> getById(size_t id) = 0;
    virtual std::optional<User> getByLogin(const std::string& login) = 0;
    virtual std::optional<User> getByEmail(const std::string& email) = 0;
    virtual std::vector<User> getAll() = 0;

    virtual int insert(std::string login, std::string email,
                       std::string password) = 0;

    virtual bool existsByLogin(const std::string& login) = 0;

    virtual bool existsByEmail(const std::string& email) = 0;

    virtual void remove(User& user) = 0;
    virtual int removeById(size_t id) = 0;
    virtual std::vector<Device> getUserDevices(size_t user_id) = 0;
    virtual std::vector<DeviceMonitoring> getUserDeviceMonitorings(
        size_t user_id) = 0;
    virtual bool insertUserDevice(size_t user_id, size_t device_id) = 0;
    virtual bool userDeviceExists(size_t user_id, size_t device_id) = 0;
    virtual bool removeUserDevice(size_t user_id, size_t device_id) = 0;

   private:
};
