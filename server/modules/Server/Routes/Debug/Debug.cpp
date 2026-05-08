#include <iostream>
#include <nlohmann/json.hpp>

#include "../../../Config/Config.hpp"
#include "../../../Database/Database.hpp"
#include "../Routes.hpp"
using json = nlohmann::json;

void Routes::RegisterGreetingRoute(httplib::Server& svr) {
    svr.Get("/hi", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("Hello World!", "text/plain");
    });
}


