import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import 'package:zelenka/features/auth_page/bloc/auth_bloc.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:zelenka/repositories/user/abstract_user_repository.dart';

class AuthPage extends StatefulWidget {
  AuthPage({super.key});

  final authPageBlock = AuthBloc(GetIt.I<AbstractUserRepository>());

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final TextEditingController _loginController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  String? _authError;
  @override
  void initState() {
    super.initState();
    widget.authPageBlock.add(LoadAuthEvent());
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      bloc: widget.authPageBlock,
      listener: (context, state) {
        if (state is AuthStateAuthorized) {
          Navigator.of(context).pushReplacementNamed('/home');
        } else if (state is AuthStateAuthFailed) {
          setState(() {
            _authError = state.message;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(_authError!)),
          );
        }
      },
      child: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                "Авторизация",
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _loginController,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: "Логин",
                  labelStyle: const TextStyle(color: Colors.grey),
                  enabledBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: Colors.grey),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: Colors.blue),
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _passwordController,
                obscureText: true,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: "Пароль",
                  labelStyle: const TextStyle(color: Colors.grey),
                  enabledBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: Colors.grey),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderSide: const BorderSide(color: Colors.blue),
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
              const SizedBox(height: 30),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: () {
                    final login = _loginController.text.trim();
                    final password = _passwordController.text.trim();
                    widget.authPageBlock
                        .add(CheckAuthEvent(login: login, password: password));
                  },
                  child: const Text("Войти",
                      style: TextStyle(color: Color.fromARGB(255, 0, 0, 0))),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.of(context).pushNamed('/register');
                  },
                  child: const Text("Регистрация",
                      style:
                          TextStyle(color: Color.fromARGB(255, 255, 255, 255))),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
