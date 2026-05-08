import 'package:zelenka/repositories/models/user.dart';

abstract class AbstractUserRepository {
  Future<User> getUserById();

  Future<User?> auth(String login, String password);

  Future<dynamic> register(String login, String email, String password);

  Future<dynamic> insertDevice(
      String login, String password, String serialNumber);

  Future<List<Map<String, dynamic>>> getDevices(String login, String password);

  Future<List<Map<String, dynamic>>> getDeviceMonitorings(
      String login, String password, String deviceId);

  Future<dynamic> removeDevice(
      String login, String password, String serialNumber);
}
