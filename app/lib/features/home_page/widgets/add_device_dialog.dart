import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import 'package:hive_flutter/adapters.dart';
import 'package:zelenka/repositories/models/user.dart';
import 'package:zelenka/repositories/user/abstract_user_repository.dart';

Future<void> showAddDeviceDialog({
  required BuildContext context,
  required VoidCallback onSuccess,
}) async {
  final TextEditingController serialController = TextEditingController();

  await showDialog(
    context: context,
    builder: (BuildContext context) {
      return StatefulBuilder(
        builder: (BuildContext context, StateSetter setState) {
          bool isLoading = false;

          return AlertDialog(
            backgroundColor: Colors.blueGrey[900],
            title: const Text(
              'Добавить устройство',
              style:
                  TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
            content: isLoading
                ? const SizedBox(
                    width: 100,
                    height: 50,
                    child: Center(
                      child: CircularProgressIndicator(
                        color: Colors.blue,
                      ),
                    ),
                  )
                : TextField(
                    controller: serialController,
                    enabled: !isLoading,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'Серийный номер',
                      labelStyle: const TextStyle(color: Colors.grey),
                      enabledBorder: OutlineInputBorder(
                        borderSide: const BorderSide(color: Colors.grey),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderSide: const BorderSide(color: Colors.blue),
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
            actions: [
              TextButton(
                onPressed: isLoading
                    ? null
                    : () {
                        Navigator.of(context).pop();
                      },
                child: const Text(
                  'Отмена',
                  style: TextStyle(color: Colors.grey),
                ),
              ),
              ElevatedButton(
                onPressed: isLoading
                    ? null
                    : () async {
                        final serialNumber = serialController.text.trim();
                        if (serialNumber.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content:
                                  Text('Пожалуйста, введите серийный номер'),
                              backgroundColor: Colors.orange,
                              duration: Duration(seconds: 2),
                            ),
                          );
                          return;
                        }

                        setState(() {
                          isLoading = true;
                        });

                        try {
                          final box = await Hive.openBox<User>('userBox');
                          final currentUser = box.get('currentUser');

                          if (currentUser != null) {
                            final userRepository =
                                GetIt.I.get<AbstractUserRepository>();

                            final response = await userRepository.insertDevice(
                              currentUser.login,
                              currentUser.password,
                              serialNumber,
                            );

                            Navigator.of(context).pop();

                            final success = response is Map
                                ? response['success'] ?? false
                                : false;
                            final message = response is Map
                                ? (response['message'] ??
                                    'Ошибка при добавлении устройства')
                                : 'Ошибка при добавлении устройства';

                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(message),
                                backgroundColor:
                                    success ? Colors.green : Colors.red,
                                duration: const Duration(seconds: 2),
                              ),
                            );

                            if (success) {
                              onSuccess();
                            }
                          } else {
                            Navigator.of(context).pop();
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content:
                                    Text('Ошибка: пользователь не авторизован'),
                                backgroundColor: Colors.red,
                                duration: Duration(seconds: 2),
                              ),
                            );
                          }
                        } catch (e) {
                          Navigator.of(context).pop();
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('Ошибка: ${e.toString()}'),
                              backgroundColor: Colors.red,
                              duration: const Duration(seconds: 2),
                            ),
                          );
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                ),
                child: const Text(
                  'Добавить',
                  style: TextStyle(color: Colors.white),
                ),
              ),
            ],
          );
        },
      );
    },
  );

  Future.delayed(const Duration(milliseconds: 100), () {
    serialController.dispose();
  });
}
