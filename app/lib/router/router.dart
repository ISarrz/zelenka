import 'package:zelenka/features/auth_page/view/auth_page.dart';
import 'package:zelenka/features/home_page/view/home_page.dart';
import 'package:zelenka/features/register_page/view/register_page.dart';
import 'package:zelenka/features/ble_config_page/view/ble_config_page.dart';

final routes = {
  "/home": (context) => const MyHomePage(title: "aaaa"),
  "/auth": (context) => AuthPage(),
  "/register": (context) => const RegisterPage(),
  "/ble-config": (context) => const BleConfigPage(),
};
