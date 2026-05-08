#pragma once
#include <string>
#include <nlohmann/json.hpp>

class User {
   public:
    size_t id;
    std::string login;
    std::string email;
    std::string password;
};

NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(User, id, login, email, password)