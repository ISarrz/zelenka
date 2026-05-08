#include <iostream>
#include <memory>

#include "../modules/Config/Config.hpp"
#include "../modules/Database/Database.hpp"
#include "../modules/Server/Server.hpp"

void ShowHelp(const std::string& exeName) {
    std::cout << "Usage: " << exeName << " <command> [options]\n\n";
    std::cout << "Commands (required):\n";
    std::cout << "  config         Set config (required before first run)\n";
    std::cout << "  server         Start server\n\n";
    std::cout << "Options:\n";
    std::cout << "  -h, --help     Show this help message\n\n";
}

int main(int argc, char* argv[]) {
    std::string exeName = argv[0];
    if (argc == 2) {
        std::string command = argv[1];
        if (command == "-h" || command == "--help") {
            ShowHelp(exeName);
            return 0;
        }
    }

    config::InitConfig(exeName);
    auto* database = new Database();
    auto user_repo = UserRepository(database);
    for (const auto& user : user_repo.getAll()) {
        std::cout << "User: " << user.login << " (" << user.email << ") " << user.password << "\n";
    }
    Server();

    return 0;
}