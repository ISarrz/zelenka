#include "DeviceRepository.hpp"

#include <cppconn/prepared_statement.h>
#include <cppconn/resultset.h>

#include "Device.hpp"

int DeviceRepository::insert(const std::string& serial_number) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "INSERT INTO devices (serial_number) VALUES (?)"));
        stmt->setString(1, serial_number);
        int result = stmt->executeUpdate();

        return result;
    } catch (const std::exception& e) {
        return -1;
    }
}

Device DeviceRepository::Constructor(const sql::ResultSet* info) {
    Device device;
    device.id = info->getInt("id");
    device.serial_number = info->getString("serial_number");

    return device;
}

std::optional<Device> DeviceRepository::getBySerialNumber(
    const std::string& serial_number) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT * FROM devices WHERE serial_number = ?"));
        stmt->setString(1, serial_number);
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        if (res->next()) {
            return Constructor(res.get());
        }

    } catch (const std::exception& e) {
        return std::nullopt;
    }

    return std::nullopt;
}

std::vector<Device> DeviceRepository::getAll() {
    std::vector<Device> devices;
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT * FROM devices"));
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        while (res->next()) {
            devices.push_back(Constructor(res.get()));
        }

    } catch (const std::exception& e) {
        return {};
    }

    return devices;
}

std::optional<Device> DeviceRepository::getById(size_t id) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT * FROM devices WHERE id = ?"));
        stmt->setInt(1, static_cast<int>(id));
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        if (res->next()) {
            return Constructor(res.get());
        }

    } catch (const std::exception& e) {
        return std::nullopt;
    }

    return std::nullopt;
}

bool DeviceRepository::existsBySerialNumber(const std::string& serial_nubmer) {
    return getBySerialNumber(serial_nubmer).has_value();
}

void DeviceRepository::remove(Device& device) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "DELETE FROM devices WHERE id = ?"));
        stmt->setInt(1, static_cast<int>(device.id));
        int rowsAffected = stmt->executeUpdate();

    } catch (sql::SQLException& e) {
        std::cerr << "Ошибка при удалении: " << e.what() << std::endl;
    }
}

int DeviceRepository::removeById(size_t id) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "DELETE FROM devices WHERE id = ?"));
        stmt->setInt(1, static_cast<int>(id));
        int rowsAffected = stmt->executeUpdate();
        return rowsAffected;

    } catch (sql::SQLException& e) {
        std::cerr << "Ошибка при удалении: " << e.what() << std::endl;
        return -1;
    }
}