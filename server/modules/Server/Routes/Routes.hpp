#pragma once

#include "../../../httplib.h"
#include "../../Database/Database.hpp"
#include "../../Database/Device/DeviceRepository.hpp"
#include "../../Database/Device/DeviceMonitoringRepository.hpp"

class Routes {
 public:
  static void RegisterGreetingRoute(httplib::Server& svr);
  static void RegisterUserRoutes(httplib::Server& svr, UserRepository& user_repo, DeviceRepository& device_repo, DeviceMonitoringRepository& monitoring_repo);
  static void RegisterSensorRoute(httplib::Server& svr, DeviceRepository& device_repo, DeviceMonitoringRepository& monitoring_repo);
  static void RegisterAdminRoutes(httplib::Server& svr, UserRepository& user_repo, DeviceRepository& device_repo);
};
