#pragma once
#include "Database.hpp"
#include <cppconn/prepared_statement.h>
#include <mysql_connection.h>
#include <mysql_driver.h>
#include <nlohmann/json.hpp>
#include <memory>

class Database {
  public:
    Database();

    static int makeBackup();
    static int loadBackup();

    [[nodiscard]] sql::Connection* getConnection() const;

  private:
    sql::mysql::MySQL_Driver *driver_;
    std::unique_ptr<sql::Connection> connection_;
};
