part of "auth_bloc.dart";

class AuthState {}

class AuthInitial extends AuthState {}

class AuthStateAuthorized extends AuthState {}

class AuthStateAuthFailed extends AuthState {
  AuthStateAuthFailed(this.message);

  final String message;
}
