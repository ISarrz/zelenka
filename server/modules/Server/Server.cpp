#include "Server.hpp"

#include "Routes/Routes.hpp"
#include "../Database/Database.hpp"
#include "../Database/Device/DeviceRepository.hpp"
#include "../Database/Device/DeviceMonitoringRepository.hpp"

Server::Server() {
  auto* database = new Database();
  auto user_repo = UserRepository(database);
  auto device_repo = DeviceRepository(database);
  auto monitoring_repo = DeviceMonitoringRepository(database);

  httplib::Server svr;

  Routes::RegisterGreetingRoute(svr);
  Routes::RegisterUserRoutes(svr, user_repo, device_repo, monitoring_repo);
  Routes::RegisterSensorRoute(svr, device_repo, monitoring_repo);
  Routes::RegisterAdminRoutes(svr, user_repo, device_repo);

  const int port = 80;
  std::cout << "Сервер запущен на http://0.0.0.0:" << port << std::endl;

  if (!svr.listen("0.0.0.0", port)) {
    std::cerr << "Не удалось запустить сервер на порту " << port << std::endl;
  }
}