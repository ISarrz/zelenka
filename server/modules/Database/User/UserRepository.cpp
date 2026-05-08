#include "UserRepository.hpp"

UserRepository::UserRepository(Database* database) { database_ = database; }

std::optional<User> UserRepository::getById(const size_t user_id) {
    sql::Connection* con = database_->getConnection();

    const std::unique_ptr<sql::PreparedStatement> pstmt(
        con->prepareStatement("SELECT * FROM users WHERE id = ?"));

    pstmt->setInt(1, user_id);
    const std::unique_ptr<sql::ResultSet> res(pstmt->executeQuery());

    if (res->next()) {
        return Constructor(res.get());
    }

    return std::nullopt;
}

std::optional<User> UserRepository::getByLogin(const std::string& login) {
    sql::Connection* con = database_->getConnection();

    const std::unique_ptr<sql::PreparedStatement> pstmt(
        con->prepareStatement("SELECT * FROM users WHERE login = ?"));

    pstmt->setString(1, login);
    const std::unique_ptr<sql::ResultSet> res(pstmt->executeQuery());

    if (res->next()) {
        return Constructor(res.get());
    }

    return std::nullopt;
}

std::optional<User> UserRepository::getByEmail(const std::string& email) {
    const std::unique_ptr<sql::PreparedStatement> pstmt(
        database_->getConnection()->prepareStatement(
            "SELECT * FROM users WHERE email = ?"));

    pstmt->setString(1, email);
    const std::unique_ptr<sql::ResultSet> res(pstmt->executeQuery());

    if (res->next()) {
        return Constructor(res.get());
    }

    return std::nullopt;
}
std::vector<User> UserRepository::getAll() {
    const std::unique_ptr<sql::PreparedStatement> pstmt(
        database_->getConnection()->prepareStatement("SELECT * FROM users"));

    const std::unique_ptr<sql::ResultSet> res(pstmt->executeQuery());

    std::vector<User> users;
    while (res->next()) {
        users.push_back(Constructor(res.get()));
    }

    return users;
}
int UserRepository::insert(std::string login, std::string email,
                           std::string password) {
    try {
        std::unique_ptr<sql::PreparedStatement> pstmt(
            database_->getConnection()->prepareStatement(
                "INSERT INTO users (login, email, password) VALUES (?, "
                "?, ?)"));

        pstmt->setString(1, login);
        pstmt->setString(2, email);
        pstmt->setString(3, password);

        pstmt->executeUpdate();

        std::unique_ptr<sql::Statement> stmt(
            database_->getConnection()->createStatement());
        std::unique_ptr<sql::ResultSet> res(
            stmt->executeQuery("SELECT LAST_INSERT_ID()"));

        uint64_t lastId = -1;
        if (res->next()) {
            lastId = res->getUInt64(1);
        }
        return lastId;

    } catch (sql::SQLException& e) {
        return -1;
    }
    return -1;
}
void UserRepository::remove(User& user) {
    try {
        std::unique_ptr<sql::PreparedStatement> pstmt(
            database_->getConnection()->prepareStatement(
                "DELETE FROM users WHERE id = ?"));

        pstmt->setInt(1, user.id);

        int rowsAffected = pstmt->executeUpdate();

    } catch (sql::SQLException& e) {
        std::cerr << "Ошибка при удалении: " << e.what() << std::endl;
    }
}
int UserRepository::removeById(size_t id) {
    try {
        std::unique_ptr<sql::PreparedStatement> pstmt(
            database_->getConnection()->prepareStatement(
                "DELETE FROM users WHERE id = ?"));

        pstmt->setInt(1, static_cast<int>(id));

        int rowsAffected = pstmt->executeUpdate();
        return rowsAffected;
    } catch (const std::exception& e) {
        std::cerr << "Ошибка при удалении: " << e.what() << std::endl;
        return -1;
    }
}
User UserRepository::Constructor(const sql::ResultSet* info) {
    User user;
    user.id = info->getInt("id");
    user.login = info->getString("login");
    user.email = info->getString("email");
    user.password = info->getString("password");

    return user;
}

bool UserRepository::existsByLogin(const std::string& login) {
    return getByLogin(login).has_value();
}

bool UserRepository::existsByEmail(const std::string& email) {
    return getByEmail(email).has_value();
}

std::vector<Device> UserRepository::getUserDevices(size_t user_id) {
    std::vector<Device> devices;
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT d.* FROM devices d "
                "JOIN user_devices ud ON d.id = ud.device_id "
                "WHERE ud.user_id = ?"));
        stmt->setInt(1, static_cast<int>(user_id));
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        while (res->next()) {
            Device device;
            device.id = res->getInt("id");
            device.serial_number = res->getString("serial_number");
            devices.push_back(device);
        }

    } catch (const std::exception& e) {
        return {};
    }

    return devices;
}

std::vector<DeviceMonitoring> UserRepository::getUserDeviceMonitorings(
    size_t user_id) {
    std::vector<DeviceMonitoring> monitorings;
    try {
        DeviceRepository deviceRepo(database_);

        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT dm.* FROM device_monitorings dm "
                "JOIN user_devices ud ON dm.device_id = ud.device_id "
                "WHERE ud.user_id = ?"));
        stmt->setInt(1, static_cast<int>(user_id));
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        while (res->next()) {
            size_t device_id = res->getInt("device_id");
            auto device = deviceRepo.getById(device_id);

            if (!device.has_value()) {
                continue;
            }

            DeviceMonitoring monitoring;
            monitoring.id = res->getInt("id");
            monitoring.device_id = device_id;
            monitoring.temperature = res->getDouble("temperature");
            monitoring.humidity = res->getDouble("humidity");
            monitoring.hydration = res->getDouble("hydration");
            monitoring.pressure = res->getDouble("pressure");
            monitorings.push_back(monitoring);
        }

    } catch (const std::exception& e) {
        return {};
    }

    return monitorings;
}

bool UserRepository::userDeviceExists(size_t user_id, size_t device_id) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "SELECT 1 FROM user_devices WHERE user_id = ? AND device_id = ?"));
        stmt->setInt(1, static_cast<int>(user_id));
        stmt->setInt(2, static_cast<int>(device_id));
        std::unique_ptr<sql::ResultSet> res(stmt->executeQuery());

        return res->next();
    } catch (const std::exception& e) {
        return false;
    }
}

bool UserRepository::insertUserDevice(size_t user_id, size_t device_id) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "INSERT INTO user_devices (user_id, device_id) VALUES (?, ?)"));
        stmt->setInt(1, static_cast<int>(user_id));
        stmt->setInt(2, static_cast<int>(device_id));
        stmt->executeUpdate();

        return true;
    } catch (const std::exception& e) {
        return false;
    }
}

bool UserRepository::removeUserDevice(size_t user_id, size_t device_id) {
    try {
        std::unique_ptr<sql::PreparedStatement> stmt(
            database_->getConnection()->prepareStatement(
                "DELETE FROM user_devices WHERE user_id = ? AND device_id = ?"));
        stmt->setInt(1, static_cast<int>(user_id));
        stmt->setInt(2, static_cast<int>(device_id));

        int rows_affected = stmt->executeUpdate();
        return rows_affected > 0;
    } catch (const std::exception& e) {
        return false;
    }
}