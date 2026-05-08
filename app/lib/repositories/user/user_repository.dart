import 'package:dio/dio.dart';
import 'package:zelenka/repositories/models/user.dart';
import 'package:zelenka/repositories/user/abstract_user_repository.dart';

class UserRepository implements AbstractUserRepository {
  final Dio dio;

  UserRepository({required this.dio});
  @override
  Future<User> getUserById() async {
    final response = await dio.get("http");
    final data = response.data;
    User(
        id: data["id"],
        login: data["login"],
        email: data["email"],
        password: data["password"]);
    return data;
  }

  @override
  Future<User?> auth(String login, String password) async {
    final response = await dio.post(
      'http://zelenka-api.ru/user/auth',
      data: {
        'info': login,
        'password': password,
      },
      options: Options(
        headers: {'Content-Type': 'application/json'},
      ),
    );
    if (response.statusCode == 200 && response.data != null) {
      final userData = response.data['data'] as Map<String, dynamic>;
      return User.fromJson(userData);
    }
    return null;
  }

  @override
  Future<dynamic> register(String login, String email, String password) async {
    try {
      final response = await dio.post(
        'http://zelenka-api.ru/user/register',
        data: {
          'login': login,
          'email': email,
          'password': password,
        },
        options: Options(
          headers: {'Content-Type': 'application/json'},
        ),
      );
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': 'Регистрация успешна',
        };
      } else {
        return {
          'success': false,
          'message': response.data['message'] ?? 'Ошибка регистрации',
        };
      }
    } on DioException catch (e) {
      final isNoInternet = e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.response == null;
      return {
        'success': false,
        'message': isNoInternet ? 'Нет интернета' : 'Ошибка сети или сервера',
      };
    } catch (e) {
      return {
        'success': false,
        'message': 'Ошибка сети или сервера',
      };
    }
  }

  @override
  Future<dynamic> insertDevice(
      String login, String password, String serialNumber) async {
    try {
      final response = await dio.post(
        'http://zelenka-api.ru/user/insert-device',
        data: {
          'login': login,
          'password': password,
          'serial_number': serialNumber,
        },
        options: Options(
          headers: {'Content-Type': 'application/json'},
        ),
      );

      if (response.statusCode == 200) {
        final success = response.data['success'] ?? true;
        final message =
            response.data['message'] ?? 'Устройство успешно добавлено';
        return {
          'success': success,
          'message': message,
        };
      } else {
        return {
          'success': false,
          'message':
              response.data['message'] ?? 'Ошибка при добавлении устройства',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': e.toString(),
      };
    }
  }

  @override
  Future<List<Map<String, dynamic>>> getDevices(
      String login, String password) async {
    try {
      final response = await dio.post(
        'http://zelenka-api.ru/user/get-devices',
        data: {
          'login': login,
          'password': password,
        },
        options: Options(
          headers: {'Content-Type': 'application/json'},
        ),
      );

      if (response.statusCode == 200 && response.data != null) {
        final devicesList = response.data['data'] as List?;
        if (devicesList != null) {
          return List<Map<String, dynamic>>.from(devicesList);
        }
        return [];
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  @override
  Future<List<Map<String, dynamic>>> getDeviceMonitorings(
      String login, String password, String deviceId) async {
    try {
      print('Fetching monitorings for device: $deviceId');
      final response = await dio.post(
        'http://zelenka-api.ru/user/get-device-monitorings',
        data: {
          'login': login,
          'password': password,
          'serial_number': deviceId,
        },
        options: Options(
          headers: {'Content-Type': 'application/json'},
        ),
      );

      print('Monitoring response: ${response.statusCode} - ${response.data}');

      if (response.statusCode == 200 && response.data != null) {
        final monitoringsList = response.data['data'] as List?;
        if (monitoringsList != null) {
          print(
              'Got ${monitoringsList.length} monitorings for device $deviceId');
          return List<Map<String, dynamic>>.from(monitoringsList);
        }
        return [];
      }
      return [];
    } catch (e) {
      print('Error fetching monitorings for device $deviceId: $e');
      return [];
    }
  }

  @override
  Future<dynamic> removeDevice(
      String login, String password, String serialNumber) async {
    try {
      final response = await dio.post(
        'http://zelenka-api.ru/user/remove-device',
        data: {
          'login': login,
          'password': password,
          'serial_number': serialNumber,
        },
        options: Options(
          headers: {'Content-Type': 'application/json'},
        ),
      );

      if (response.statusCode == 200) {
        final success = response.data['success'] ?? true;
        final message =
            response.data['message'] ?? 'Устройство успешно удалено';
        return {
          'success': success,
          'message': message,
        };
      } else {
        return {
          'success': false,
          'message':
              response.data['message'] ?? 'Ошибка при удалении устройства',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': e.toString(),
      };
    }
  }
}
