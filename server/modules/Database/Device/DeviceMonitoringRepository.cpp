#include "DeviceMonitoringRepository.hpp"

#include <vector>

#include "DeviceMonitoring.hpp"

int DeviceMonitoringRepository::insert(size_t device_id, double temperature,
                                       double humidity, double hydration,
                                       double pressure, double light) {
    try {
        auto* connection = database_->getConnection();
        std::unique_ptr<sql::PreparedStatement> stmt(
            connection->prepareStatement(
                "INSERT INTO devices_monitorings (device_id, temperature, "
                "humidity, "
                "hydration, pressure, light) VALUES (?, ?, ?, ?, ?, ?)"));

        stmt->setInt(1, static_cast<int>(device_id));
        stmt->setDouble(2, temperature);
        stmt->setDouble(3, humidity);
        stmt->setDouble(4, hydration);
        stmt->setDouble(5, pressure);
        stmt->setDouble(6, light);

        stmt->executeUpdate();

        std::unique_ptr<sql::Statement> stmt2(connection->createStatement());
        std::unique_ptr<sql::ResultSet> res(
            stmt2->executeQuery("SELECT LAST_INSERT_ID()"));
        
        if (res->next()) {
            return res->getInt(1);
        }

        return -1;

    } catch (const std::exception& e) {
        return -1;
    }
}

std::vector<DeviceMonitoring> DeviceMonitoringRepository::getByDeviceId(
    size_t device_id) {
    std::vector<DeviceMonitoring> monitorings;
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT * FROM devices_monitorings WHERE device_id = ?"));
        stmt->setInt(1, static_cast<int>(device_id));
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        while (res->next()) {
            DeviceMonitoring monitoring = Constructor(res.get());
            monitorings.push_back(monitoring);
        }

    } catch (const std::exception& e) {
        return {};
    }

    return monitorings;
}

std::vector<DeviceMonitoring> DeviceMonitoringRepository::getByUserId(
    size_t user_id) {
    std::vector<DeviceMonitoring> monitorings;
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT dm.* FROM devices_monitorings dm "
                "JOIN user_devices ud ON dm.device_id = ud.device_id "
                "WHERE ud.user_id = ?"));
        stmt->setInt(1, static_cast<int>(user_id));
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        while (res->next()) {
            DeviceMonitoring monitoring = Constructor(res.get());
            monitoring.pressure = res->getDouble("pressure");

            monitorings.push_back(monitoring);
        }

    } catch (const std::exception& e) {
        return {};
    }

    return monitorings;
}

std::vector<DeviceMonitoring> DeviceMonitoringRepository::getAll() {
    std::vector<DeviceMonitoring> monitorings;
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT * FROM devices_monitorings"));
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        while (res->next()) {
            DeviceMonitoring monitoring = Constructor(res.get());

            monitoring.pressure = res->getDouble("pressure");

            monitorings.push_back(monitoring);
        }

    } catch (const std::exception& e) {
        return {};
    }

    return monitorings;
}

DeviceMonitoring DeviceMonitoringRepository::Constructor(const sql::ResultSet* info) {
    DeviceMonitoring monitoring;
    monitoring.id = info->getInt("id");
    monitoring.device_id = info->getInt("device_id");
    monitoring.timestamp = info->getString("timestamp");
    monitoring.temperature = info->getDouble("temperature");
    monitoring.humidity = info->getDouble("humidity");
    monitoring.hydration = info->getDouble("hydration");
    monitoring.pressure = info->getDouble("pressure");
    monitoring.light = info->getDouble("light");

    return monitoring;
}

std::optional<DeviceMonitoring> DeviceMonitoringRepository::getById(size_t id) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT * FROM devices_monitorings WHERE id = ?"));
        stmt->setInt(1, static_cast<int>(id));

        if (std::unique_ptr<sql::ResultSet> res(stmt->executeQuery()); res->next()) {
            DeviceMonitoring monitoring = Constructor(res.get());
            return monitoring;
        }

    } catch (const std::exception& e) {
        return std::nullopt;
    }

    return std::nullopt;
}