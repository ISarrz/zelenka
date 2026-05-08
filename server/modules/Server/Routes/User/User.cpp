#include <iostream>
#include <nlohmann/json.hpp>

#include "../../../Config/Config.hpp"
#include "../../../Database/Database.hpp"
#include "../Routes.hpp"
using json = nlohmann::json;

void Routes::RegisterUserRoutes(httplib::Server& svr,
                                UserRepository& user_repo,
                                DeviceRepository& device_repo,
                                DeviceMonitoringRepository& monitoring_repo) {
    svr.Post(
        "/user/register", [&](const httplib::Request& req, httplib::Response& res) {
            try {
                auto data = json::parse(req.body);

                if (!data.contains("login")) {
                    res.status = 400;
                    json response;
                    response["status"] = "error";
                    response["message"] = "Missing login field";
                    res.set_content(response.dump(), "application/json");
                    return;
                }

                if (!data.contains("email")) {
                    res.status = 400;
                    json response;
                    response["status"] = "error";
                    response["message"] = "Missing email field";
                    res.set_content(response.dump(), "application/json");
                    return;
                }

                if (!data.contains("password")) {
                    res.status = 400;
                    json response;
                    response["status"] = "error";
                    response["message"] = "Missing password field";
                    res.set_content(response.dump(), "application/json");
                    return;
                }

                std::string login = data.at("login");
                std::string email = data.at("email");
                std::string password = data.at("password");

                if (user_repo.existsByLogin(login) ||
                    user_repo.existsByEmail(email)) {
                    json error_response;
                    error_response["message"] = "User already exists";

                    res.status = 400;
                    res.set_content(error_response.dump(), "application/json");
                    return;
                }

                int user_id = user_repo.insert(login, email, password);

                json response;

                response["status"] = "success";
                response["message"] = "User registered successfully";
                response["data"] = {
                    {"id", user_id}, {"login", login}, {"email", email}, {"password", password}};

                res.status = 200;
                res.set_content(response.dump(), "application/json");

            } catch (const std::exception& e) {
                json response;

                response["status"] = "error";
                response["message"] = "Server error: " + std::string(e.what());

                res.status = 400;
                res.set_content(response.dump(), "application/json");
            }
        });

    svr.Post("/user/auth", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            auto data = json::parse(req.body);
            if (!data.contains("info")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing info field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!data.contains("password")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing password field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::string info = data.at("info");
            std::string password = data.at("password");
            std::optional<User> user;
            if (info.find('@') != std::string::npos) {
                user = user_repo.getByEmail(info);
            } else {
                user = user_repo.getByLogin(info);
            }

            if (user && user.value().password == password) {
                json response;
                response["status"] = "success";
                response["message"] = "Authentication successful";
                response["data"] = {
                    {"id", user.value().id},
                    {"login", user.value().login},
                    {"email", user.value().email},
                    {"password", user.value().password}
                };
                res.status = 200;
                res.set_content(response.dump(), "application/json");

            } else {
                json response;
                response["status"] = "error";
                response["message"] = "Authentication failed";
                res.status = 400;
                res.set_content(response.dump(), "application/json");
            }

        } catch (const std::exception& e) {
            res.status = 400;
            json response;
            response["status"] = "error";
            response["message"] = "Server error: " + std::string(e.what());
            res.set_content(response.dump(), "application/json");
        }
    });

    svr.Post("/user/get-devices", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            auto data = json::parse(req.body);

            if (!data.contains("login")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing login field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!data.contains("password")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing password field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::string login = data.at("login");
            std::string password = data.at("password");

            std::optional<User> user = user_repo.getByLogin(login);

            if (!user) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "User not found";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (user.value().password != password) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Invalid password";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::vector<Device> devices = user_repo.getUserDevices(user.value().id);

            json response;
            response["status"] = "success";
            response["message"] = "Devices retrieved successfully";
            response["data"] = devices;

            res.status = 200;
            res.set_content(response.dump(), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            json response;
            response["status"] = "error";
            response["message"] = "Server error: " + std::string(e.what());
            res.set_content(response.dump(), "application/json");
        }
    });

    svr.Post("/user/insert-device", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            auto data = json::parse(req.body);

            if (!data.contains("login")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing login field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!data.contains("password")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing password field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!data.contains("serial_number")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing serial_number field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::string login = data.at("login");
            std::string password = data.at("password");
            std::string serial_number = data.at("serial_number");

            std::optional<User> user = user_repo.getByLogin(login);

            if (!user) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "User not found";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (user.value().password != password) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Invalid password";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::optional<Device> device = device_repo.getBySerialNumber(serial_number);

            if (!device) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Device not found";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (user_repo.userDeviceExists(user.value().id, device.value().id)) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Device already added to user";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!user_repo.insertUserDevice(user.value().id, device.value().id)) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Failed to add device";
                res.set_content(response.dump(), "application/json");
                return;
            }

            json response;
            response["status"] = "success";
            response["message"] = "Device added successfully";
            response["data"] = {
                {"user_id", user.value().id},
                {"device_id", device.value().id},
                {"device_serial_number", device.value().serial_number}
            };

            res.status = 200;
            res.set_content(response.dump(), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            json response;
            response["status"] = "error";
            response["message"] = "Server error: " + std::string(e.what());
            res.set_content(response.dump(), "application/json");
        }
    });

    svr.Post("/user/remove-device", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            auto data = json::parse(req.body);

            if (!data.contains("login")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing login field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!data.contains("password")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing password field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!data.contains("serial_number")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing serial_number field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::string login = data.at("login");
            std::string password = data.at("password");
            std::string serial_number = data.at("serial_number");

            std::optional<User> user = user_repo.getByLogin(login);

            if (!user) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "User not found";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (user.value().password != password) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Invalid password";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::optional<Device> device = device_repo.getBySerialNumber(serial_number);

            if (!device) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Device not found";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!user_repo.userDeviceExists(user.value().id, device.value().id)) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Device not assigned to user";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!user_repo.removeUserDevice(user.value().id, device.value().id)) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Failed to remove device";
                res.set_content(response.dump(), "application/json");
                return;
            }

            json response;
            response["status"] = "success";
            response["message"] = "Device removed successfully";
            response["data"] = {
                {"user_id", user.value().id},
                {"device_id", device.value().id},
                {"device_serial_number", device.value().serial_number}
            };

            res.status = 200;
            res.set_content(response.dump(), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            json response;
            response["status"] = "error";
            response["message"] = "Server error: " + std::string(e.what());
            res.set_content(response.dump(), "application/json");
        }
    });

    svr.Post("/user/get-device-monitorings", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            auto data = json::parse(req.body);

            if (!data.contains("login")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing login field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!data.contains("password")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing password field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (!data.contains("serial_number")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing serial_number field";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::string login = data.at("login");
            std::string password = data.at("password");
            std::string serial_number = data.at("serial_number");

            std::optional<User> user = user_repo.getByLogin(login);

            if (!user) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "User not found";
                res.set_content(response.dump(), "application/json");
                return;
            }

            if (user.value().password != password) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Invalid password";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::optional<Device> device = device_repo.getBySerialNumber(serial_number);

            if (!device) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Device not found";
                res.set_content(response.dump(), "application/json");
                return;
            }

            std::vector<DeviceMonitoring> monitorings = monitoring_repo.getByDeviceId(device.value().id);

            json response;
            response["status"] = "success";
            response["message"] = "Device monitorings retrieved successfully";
            response["data"] = monitorings;

            res.status = 200;
            res.set_content(response.dump(), "application/json");

        } catch (const std::exception& e) {
            res.status = 400;
            json response;
            response["status"] = "error";
            response["message"] = "Server error: " + std::string(e.what());
            res.set_content(response.dump(), "application/json");
        }
    });
}