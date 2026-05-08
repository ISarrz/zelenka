#include "Database.hpp"
#include "../../Config/Config.hpp"
#include <chrono>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <cppconn/prepared_statement.h>
#include <mysql_connection.h>
#include <mysql_driver.h>
#include <nlohmann/json.hpp>
#include <sstream>
#include <string>

Database::Database()
{
    driver_ = sql::mysql::get_mysql_driver_instance();

    const char *env_host = std::getenv("DB_HOST");
    std::string host = env_host ? env_host : "127.0.0.1";

    std::string url = "tcp://" + host + ":3306";

    connection_.reset(driver_->connect(host,
                                       config::database_username,
                                       config::database_password));
    sql::Statement *stmt = connection_->createStatement();

    // stmt->execute("CREATE DATABASE IF NOT EXISTS zelenka");

    connection_->setSchema(std::getenv("DB_NAME"));

    stmt->execute("CREATE TABLE IF NOT EXISTS users ("
                  "id INT AUTO_INCREMENT PRIMARY KEY,"
                  "login VARCHAR(50) NOT NULL,"
                  "email VARCHAR(100),"
                  "password VARCHAR(255) NOT NULL)");

    stmt->execute("CREATE TABLE IF NOT EXISTS devices ("
                  "id INT AUTO_INCREMENT PRIMARY KEY,"
                  "serial_number VARCHAR(100) UNIQUE NOT NULL)");

    stmt->execute(
        "CREATE TABLE IF NOT EXISTS user_devices ("
        "id INT AUTO_INCREMENT PRIMARY KEY,"
        "name VARCHAR(100),"
        "user_id INT,"
        "device_id INT,"
        "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,"
        "FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE "
        "CASCADE)");

    stmt->execute("CREATE TABLE IF NOT EXISTS devices_monitorings ("
                  "id INT AUTO_INCREMENT PRIMARY KEY,"
                  "device_id INT,"
                  "timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"
                  "temperature DOUBLE DEFAULT 0,"
                  "humidity DOUBLE DEFAULT 0,"
                  "hydration DOUBLE DEFAULT 0,"
                  "pressure DOUBLE DEFAULT 0,"
                  "light DOUBLE DEFAULT 0,"
                  "FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE "
                  "CASCADE)");

    delete stmt;
}

sql::Connection *Database::getConnection() const { return connection_.get(); }

int Database::makeBackup()
{
    const std::string backup_dir = "./backups";

    if (!std::filesystem::exists(backup_dir))
    {
        std::filesystem::create_directories(backup_dir);
    }

    const auto now = std::chrono::system_clock::now();
    const auto in_time_t = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&in_time_t), "%H-%M-%S_%d-%m-%Y");

    const std::string file_name = "backup_" + ss.str() + ".sql";
    const std::string full_path = backup_dir + "/" + file_name;

    std::cout << "Бэкап " << file_name << std::endl;

    std::string dump_cmd = "MYSQL_PWD='" + config::database_password + "' "
                                                                       "mysqldump -u " +
                           config::database_username + " " +
                           "zelenka" + " > " + full_path;

    if (std::system(dump_cmd.c_str()) != 0)
    {
        std::cerr << "Ошибка: Не удалось создать дамп базы данных." << std::endl;

        return 1;
    }

    std::stringstream upload_ss;
    upload_ss << "AWS_ACCESS_KEY_ID=" << config::yandex_key << " "
              << "AWS_SECRET_ACCESS_KEY=" << config::yandex_secret_key << " "
              << "aws --endpoint-url=https://storage.yandexcloud.net "
              << "s3 cp " << full_path << " s3://" << "zelenka" << "/" << file_name;

    std::cout << "Загрузка" << std::endl;

    if (std::system(upload_ss.str().c_str()) == 0)
    {
        std::cout << "Успешно загружено" << std::endl;

        std::error_code ec;
        if (std::filesystem::remove(full_path, ec))
        {
            std::cout << "Локальный файл удален" << std::endl;
        }
        else
        {
            std::cerr << "Не удалось удалить файл" << ec.message() << std::endl;
        }

        return 0;
    }

    std::cerr << "Ошибка: Не удалось загрузить бэкап" << std::endl;

    return 1;
}