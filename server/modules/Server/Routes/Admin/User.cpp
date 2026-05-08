#include <iostream>
#include <nlohmann/json.hpp>

#include "../../../Config/Config.hpp"
#include "../../../Database/Database.hpp"
#include "../Routes.hpp"
using json = nlohmann::json;

void RegisterAdminUserRoute(httplib::Server& svr, UserRepository& user_repo) {
    svr.Post("/admin/user/get-all", [&](const httplib::Request& req,
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

            auto users = user_repo.getAll();
            json response;
            response["status"] = "success";
            response["data"] = users;

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
    svr.Post("/admin/user/remove-by-id", [&](const httplib::Request& req,
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
                response["message"] = "Missing user ID";
                res.set_content(response.dump(), "application/json");
                return;
            }

            int result = user_repo.removeById(data.at("id").get<size_t>());
            if (result == -1) {
                res.status = 400;
                json response;
                response["status"] = "error";
                response["message"] = "Failed to remove user";
                res.set_content(response.dump(), "application/json");
                return;
            }

            auto users = user_repo.getAll();
            json response;
            response["status"] = "success";
            response["message"] = "User removed successfully";

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
