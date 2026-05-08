import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:hive_flutter/adapters.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zelenka/repositories/models/user.dart';
import 'package:zelenka/repositories/user/abstract_user_repository.dart';
import 'package:zelenka/repositories/user/user_repository.dart';
import 'package:zelenka/router/router.dart';
import 'package:zelenka/theme/theme.dart';
import 'package:get_it/get_it.dart';

void setupDependencies() {
  if (!GetIt.I.isRegistered<AbstractUserRepository>()) {
    GetIt.I.registerSingleton<AbstractUserRepository>(
      UserRepository(dio: Dio()),
    );
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();

  // Регистрируем адаптер для модели User
  Hive.registerAdapter(UserAdapter());

  setupDependencies();

  // Проверяем наличие сохраненных учетных данных
  final prefs = await SharedPreferences.getInstance();
  final savedLogin = prefs.getString('saved_login');
  final savedPassword = prefs.getString('saved_password');

  String initialRoute = '/auth';

  if (savedLogin != null && savedPassword != null) {
    // Есть сохраненные учетные данные, пытаемся авторизоваться
    try {
      final userRepository = GetIt.I<AbstractUserRepository>();
      final user = await userRepository.auth(savedLogin, savedPassword);

      if (user != null) {
        // Авторизация успешна - сохраняем пользователя и переходим на главную
        final box = await Hive.openBox<User>('userBox');
        await box.put('currentUser', user);
        initialRoute = '/home';
      } else {
        // Авторизация не удалась, проверяем был ли пользователь авторизован ранее
        final box = await Hive.openBox<User>('userBox');
        final currentUser = box.get('currentUser');
        if (currentUser != null) {
          // Пользователь был авторизован ранее - переходим на главную (офлайн режим)
          initialRoute = '/home';
        }
      }
    } catch (e) {
      // Ошибка подключения (нет интернета), проверяем был ли пользователь авторизован ранее
      final box = await Hive.openBox<User>('userBox');
      final currentUser = box.get('currentUser');
      if (currentUser != null) {
        // Пользователь был авторизован ранее - переходим на главную (офлайн режим)
        initialRoute = '/home';
      }
    }
  }

  runApp(ZelenkaApp(initialRoute: initialRoute));
}

class ZelenkaApp extends StatelessWidget {
  const ZelenkaApp({super.key, required this.initialRoute});

  final String initialRoute;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Zelenka',
      theme: theme,
      routes: routes,
      initialRoute: initialRoute,
    );
  }
}
