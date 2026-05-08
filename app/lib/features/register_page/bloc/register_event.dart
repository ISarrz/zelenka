part of 'register_bloc.dart';

abstract class RegisterEvent {}

class RegisterSubmitEvent extends RegisterEvent {
  final String login;
  final String email;
  final String password;
  RegisterSubmitEvent(this.login, this.email, this.password);
}
