#include <iostream>
#include <nlohmann/json.hpp>

#include "../../../Config/Config.hpp"
#include "../../../Database/Database.hpp"
#include "../Routes.hpp"
using json = nlohmann::json;


void Routes::RegisterSensorRoute(httplib::Server& svr,
                                 DeviceRepository& device_repo,
                                 DeviceMonitoringRepository& monitoring_repo) {
    svr.Post("/device/insert-monitoring", [&](const httplib::Request& req,
                                       httplib::Response& res) {
        try {
            auto data = json::parse(req.body);
            for (auto field : {"serial_number", "temperature", "humidity",
                               "hydration", "pressure", "light"}) {
                if (!data.contains(field)) {
                    res.status = 400;
                    json response;
                    response["status"] = "error";
                    response["message"] =
                        "Missing " + std::string(field) + " field";
                    res.set_content(response.dump(), "application/json");
                    return;
                }
            }

            std::string serial_number = data.at("serial_number");
            float temperature = data.at("temperature");
            float humidity = data.at("humidity");
            float hydration = data.at("hydration");
            float pressure = data.at("pressure");
            float light = data.at("light");

            auto device = device_repo.getBySerialNumber(serial_number);
            if (!device) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Device not found";
                res.set_content(response.dump(), "application/json");
                return;
            }

            int monitoring_id = monitoring_repo.insert(
                device.value().id, temperature, humidity, hydration, pressure,
                light);

            std::cout << "Данные получены и сохранены на диск:\n"
                      << "Серийный номер: " << serial_number << "\n"
                      << "Температура: " << temperature << "\n"
                      << "Влажность воздуха: " << humidity << "\n"
                      << "Влажность почвы: " << hydration << "\n"
                      << "Давление: " << pressure << "\n"
                      << "Освещенность: " << light << "\n"
                      << "ID записи мониторинга: " << monitoring_id << "\n\n";

            json response;
            response["status"] = "success";
            response["message"] = "Data received and saved successfully";
            response["data"] = {{"monitoring_id", monitoring_id}};

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
