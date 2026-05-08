#include <iostream>
#include <nlohmann/json.hpp>

#include "../../../Config/Config.hpp"
#include "../../../Database/Database.hpp"
#include "../Routes.hpp"
#include "User.cpp"
#include "Device.cpp"
using json = nlohmann::json;

void Routes::RegisterAdminRoutes(httplib::Server& svr, UserRepository& user_repo, DeviceRepository& device_repo) {
    RegisterAdminUserRoute(svr, user_repo);
    RegisterAdminDeviceRoute(svr, device_repo);
}
