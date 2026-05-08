import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:hive/hive.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zelenka/repositories/models/user.dart';
import 'package:zelenka/repositories/user/abstract_user_repository.dart';

part "auth_state.dart";
part "auth_event.dart";

class CheckAuthEvent extends AuthEvent {
  CheckAuthEvent({required this.login, required this.password});
  final String login;
  final String password;
}

class AuthBloc extends Bloc<AuthEvent, AuthState> {
  AuthBloc(this.userRepository) : super(AuthInitial()) {
    on<LoadAuthEvent>((event, emit) {});
    on<CheckAuthEvent>((event, emit) async {
      try {
        final user = await userRepository.auth(event.login, event.password);
        if (user != null) {
          // Сохраняем данные пользователя в Hive
          final box = await Hive.openBox<User>('userBox');
          await box.put('currentUser', user);

          // Сохраняем логин и пароль для автоматической авторизации
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('saved_login', event.login);
          await prefs.setString('saved_password', event.password);

          emit(AuthStateAuthorized());
        } else {
          emit(AuthStateAuthFailed('Неверный логин или пароль'));
        }
      } on DioException catch (e) {
        final isNoInternet = e.type == DioExceptionType.connectionError ||
            e.type == DioExceptionType.connectionTimeout ||
            e.response == null;
        emit(AuthStateAuthFailed(
            isNoInternet ? 'Нет интернета' : 'Ошибка авторизации'));
      } catch (e) {
        emit(AuthStateAuthFailed('Ошибка авторизации'));
      }
    });
  }
  final AbstractUserRepository userRepository;
}
