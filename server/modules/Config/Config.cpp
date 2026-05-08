#include "Config.hpp"
#include <fstream>
#include <iostream>
#include <nlohmann/json.hpp>
using json = nlohmann::json;
namespace fs = std::filesystem;

void config::InitConfig(const std::filesystem::path &project_path)
{
    config_path = project_path.parent_path() / ".." / "data" / "config.json";
    yandex_key = std::getenv("YANDEX_KEY");
    yandex_secret_key = std::getenv("YANDEX_SECRET_KEY");
    database_username = std::getenv("DB_USER");
    database_password = std::getenv("DB_PASSWORD");
    secret_key = std::getenv("SECRET_KEY");
}
