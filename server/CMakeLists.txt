cmake_minimum_required(VERSION 3.25)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Debug)
endif()

project(zelenka_server)

set(CMAKE_CXX_STANDARD 20)

add_executable(zelenka_server scripts/main.cpp
        modules/Config/Config.cpp
        modules/Config/Config.hpp
        modules/Database/Database.hpp
        modules/Database/Database/Database.cpp
        modules/Database/Database/Database.hpp
        modules/Database/User/User.hpp
        modules/Database/User/UserRepository.cpp
        modules/Database/User/UserRepository.hpp
        modules/Database/User/AbstractUserRepository.hpp
        modules/Database/Device/Device.hpp
        modules/Database/Device/DeviceMonitoring.hpp
        modules/Database/Device/AbstractDeviceRepository.hpp
        modules/Database/Device/AbstractDeviceMonitoringRepository.hpp
        modules/Database/Device/DeviceRepository.cpp
        modules/Database/Device/DeviceRepository.hpp
        modules/Database/Device/DeviceMonitoringRepository.cpp
        modules/Database/Device/DeviceMonitoringRepository.hpp
        modules/Server/Server.cpp
        modules/Server/Server.hpp
        modules/Server/Routes/Routes.hpp
        modules/Server/Routes/User/User.cpp
        modules/Server/Routes/Admin/Admin.cpp
        modules/Server/Routes/Device/Device.cpp
        modules/Server/Routes/Debug/Debug.cpp
        )

target_link_libraries(zelenka_server mysqlcppconn)