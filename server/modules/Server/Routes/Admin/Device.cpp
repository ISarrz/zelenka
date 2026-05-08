#include <iostream>
#include <nlohmann/json.hpp>

#include "../../../Config/Config.hpp"
#include "../../../Database/Database.hpp"
#include "../Routes.hpp"
using json = nlohmann::json;

void RegisterAdminDeviceRoute(httplib::Server& svr,
                              DeviceRepository& device_repo) {
    svr.Post("/admin/device/get-all", [&](const httplib::Request& req,
                                          httplib::Response& res) {
        try {
            auto data = json::parse(req.body);
            if (!data.contains("secret_key") ||
                data.at("secret_key") != config::secret_key) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Permission denied";
                res.set_content(response.dump(), "application/json");
                return;
            }

            auto devices = device_repo.getAll();
            json response;
            response["status"] = "success";
            response["data"] = devices;

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

    svr.Post("/admin/device/remove-by-id", [&](const httplib::Request& req,
                                               httplib::Response& res) {
        try {
            auto data = json::parse(req.body);
            if (!data.contains("secret_key") ||
                data.at("secret_key") != config::secret_key) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Permission denied";
                res.set_content(response.dump(), "application/json");
                return;
            }
            if (!data.contains("id")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing device ID";
                res.set_content(response.dump(), "application/json");
                return;
            }

            int result = device_repo.removeById(data.at("id").get<size_t>());
            if (result == -1) {
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

    svr.Post("/admin/device/insert", [&](const httplib::Request& req,
                                         httplib::Response& res) {
        try {
            auto data = json::parse(req.body);
            if (!data.contains("secret_key") ||
                data.at("secret_key") != config::secret_key) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Permission denied";
                res.set_content(response.dump(), "application/json");
                return;
            }
            if (!data.contains("serial_number")) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Missing serial number";
                res.set_content(response.dump(), "application/json");
                return;
            }
            int result =
                device_repo.insert(data.at("serial_number").get<std::string>());
            if (result == -1) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Failed to insert device";
                res.set_content(response.dump(), "application/json");
                return;
            }
            auto devices = device_repo.getById(result);
            if (!devices.has_value()) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Failed to retrieve inserted device";
                res.set_content(response.dump(), "application/json");
                return;
            }
            json response;
            response["status"] = "success";
            response["data"] = devices.value();

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
}