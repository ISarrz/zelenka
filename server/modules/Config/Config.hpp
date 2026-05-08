#pragma once
#include <filesystem>
#include <string>
#include <vector>

namespace config {
inline std::string config_path;
inline std::string yandex_key;
inline std::string yandex_secret_key;
inline std::string database_username;
inline std::string database_password;
inline std::string secret_key;
std::string get_config_field(const std::string &key);

void SetConfig(const std::filesystem::path &project_path);
void InitConfig(const std::filesystem::path &project_path);
} // namespace config
