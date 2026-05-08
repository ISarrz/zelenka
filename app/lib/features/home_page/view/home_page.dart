import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import 'package:hive_flutter/adapters.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zelenka/features/home_page/widgets/add_device_dialog.dart';
import 'package:zelenka/features/home_page/widgets/device_card.dart';
import 'package:zelenka/features/home_page/widgets/monitoring_chart_dialog.dart';
import 'package:zelenka/repositories/models/user.dart';
import 'package:zelenka/repositories/user/abstract_user_repository.dart';

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  late Future<List<Map<String, dynamic>>> devicesFuture;
  Timer? _refreshTimer;

  static const Duration _syncInterval = Duration(minutes: 5);
  static const String _devicesBoxName = 'devicesBox';
  static const String _monitoringsBoxName = 'monitoringsBox';
  static const String _devicesKey = 'devices';

  @override
  void initState() {
    super.initState();
    _loadDevices();
    _startSyncTimer();
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  void _startSyncTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(_syncInterval, (_) {
      _refreshDevices();
    });
  }

  void _loadDevices() {
    setState(() {
      devicesFuture = _fetchDevices();
    });
  }

  Future<void> _refreshDevices() async {
    final devices = await _fetchDevices();
    if (mounted) {
      setState(() {
        devicesFuture = Future.value(devices);
      });
    }
  }

  Future<List<Map<String, dynamic>>> _fetchDevices() async {
    try {
      final box = await Hive.openBox<User>('userBox');
      final currentUser = box.get('currentUser');

      if (currentUser != null) {
        final userRepository = GetIt.I.get<AbstractUserRepository>();
        final devices = await userRepository.getDevices(
          currentUser.login,
          currentUser.password,
        );

        print('Loaded ${devices.length} devices');

        // Для каждого устройства получаем последние мониторинги
        for (var device in devices) {
          final serialNumber = device['serial_number'];
          print('Device data: $device');
          if (serialNumber != null) {
            final monitorings = await userRepository.getDeviceMonitorings(
              currentUser.login,
              currentUser.password,
              serialNumber.toString(),
            );

            // Получаем последний мониторинг (обычно они отсортированы по времени)
            device['monitorings'] = monitorings;
            if (monitorings.isNotEmpty) {
              final lastMonitoring = monitorings.last;
              device['lastMonitoring'] = lastMonitoring;
              print(
                  'Added monitoring to device $serialNumber: $lastMonitoring');
            } else {
              print('No monitorings found for device $serialNumber');
            }
          } else {
            print('Serial number not found in device data');
          }
        }

        await _cacheDevices(devices);
        return devices;
      }
      return await _readCachedDevices();
    } catch (e) {
      print('Error fetching devices: $e');
      return await _readCachedDevices();
    }
  }

  Future<void> _cacheDevices(List<Map<String, dynamic>> devices) async {
    final devicesBox = await Hive.openBox(_devicesBoxName);
    final monitoringsBox = await Hive.openBox(_monitoringsBoxName);

    await devicesBox.put(_devicesKey, devices);

    for (final device in devices) {
      final serialNumber = device['serial_number']?.toString();
      final monitorings = device['monitorings'];
      if (serialNumber != null && monitorings is List) {
        await monitoringsBox.put(serialNumber, monitorings);
      }
    }
  }

  Future<List<Map<String, dynamic>>> _readCachedDevices() async {
    final devicesBox = await Hive.openBox(_devicesBoxName);
    final monitoringsBox = await Hive.openBox(_monitoringsBoxName);
    final cached = devicesBox.get(_devicesKey);

    if (cached is List) {
      final devices =
          cached.map((item) => Map<String, dynamic>.from(item as Map)).toList();

      for (final device in devices) {
        final serialNumber = device['serial_number']?.toString();
        if (serialNumber != null) {
          final cachedMonitorings = monitoringsBox.get(serialNumber);
          if (cachedMonitorings is List) {
            final monitorings = List<Map<String, dynamic>>.from(
              cachedMonitorings
                  .map((item) => Map<String, dynamic>.from(item as Map)),
            );
            device['monitorings'] = monitorings;
            if (monitorings.isNotEmpty) {
              device['lastMonitoring'] = monitorings.last;
            }
          }
        }
      }

      return devices;
    }

    return [];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: const Text('Показания устройств',
            style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold)),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        elevation: 0,
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: SizedBox.shrink(),
        ),
        flexibleSpace: const SizedBox.shrink(),
        leading: Container(
          margin: const EdgeInsets.only(left: 12),
          decoration: BoxDecoration(
            color: Theme.of(context)
                .scaffoldBackgroundColor
                .withValues(alpha: 0.95),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.black),
          ),
          child: IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (dialogContext) {
                  return AlertDialog(
                    title: const Text('Выход'),
                    content: const Text('Вы действительно хотите выйти?'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(dialogContext).pop(false),
                        child: const Text('Отмена'),
                      ),
                      TextButton(
                        onPressed: () => Navigator.of(dialogContext).pop(true),
                        child: const Text('Выйти'),
                      ),
                    ],
                  );
                },
              );

              if (confirmed != true) return;

              // Очищаем сохраненные учетные данные
              final prefs = await SharedPreferences.getInstance();
              await prefs.remove('saved_login');
              await prefs.remove('saved_password');

              // Очищаем данные пользователя из Hive
              final box = await Hive.openBox<User>('userBox');
              await box.delete('currentUser');

              if (!context.mounted) return;
              Navigator.of(context).pushReplacementNamed('/auth');
            },
          ),
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: Theme.of(context)
                  .scaffoldBackgroundColor
                  .withValues(alpha: 0.95),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.black),
            ),
            child: IconButton(
              icon: const Icon(Icons.bluetooth, color: Colors.white),
              onPressed: () {
                Navigator.of(context).pushNamed('/ble-config');
              },
              tooltip: 'Настройка WiFi устройства',
            ),
          ),
          Container(
            margin: const EdgeInsets.only(right: 12),
            decoration: BoxDecoration(
              color: Theme.of(context)
                  .scaffoldBackgroundColor
                  .withValues(alpha: 0.95),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.black),
            ),
            child: IconButton(
              icon: const Icon(Icons.add, color: Colors.white),
              onPressed: () => showAddDeviceDialog(
                context: context,
                onSuccess: _loadDevices,
              ),
            ),
          ),
        ],
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: devicesFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: CircularProgressIndicator(
                color: Colors.blue,
              ),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Text(
                'Ошибка: ${snapshot.error}',
                style: const TextStyle(color: Colors.red),
              ),
            );
          }

          final devices = snapshot.data ?? [];

          if (devices.isEmpty) {
            return RefreshIndicator(
              onRefresh: _refreshDevices,
              color: Colors.blue,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.only(
                      top: MediaQuery.of(context).size.height / 3,
                    ),
                    child: const Text(
                      'Нет добавленных устройств',
                      style: TextStyle(color: Colors.grey, fontSize: 16),
                    ),
                  ),
                ),
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: _refreshDevices,
            color: Colors.blue,
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: devices.length,
              itemBuilder: (context, index) {
                final device = devices[index];
                final serialNumber =
                    device['serial_number'] ?? device['id'] ?? 'Unknown';
                final status = device['status'] ?? 'Активно';
                final lastMonitoring =
                    device['lastMonitoring'] as Map<String, dynamic>?;
                final monitorings = (device['monitorings'] as List?)
                        ?.cast<Map<String, dynamic>>() ??
                    <Map<String, dynamic>>[];

                final lastTimestamp = lastMonitoring?['timestamp']?.toString();

                return DeviceCard(
                  serialNumber: serialNumber.toString(),
                  status: status.toString(),
                  lastMonitoring: lastMonitoring,
                  lastTimestamp: lastTimestamp,
                  monitorings: monitorings,
                  onOpenChart: (title, valueKey, unit) {
                    showMonitoringChartDialog(
                      context: context,
                      title: title,
                      monitorings: monitorings,
                      valueKey: valueKey,
                      unit: unit,
                    );
                  },
                  onDelete: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (dialogContext) {
                        return AlertDialog(
                          title: const Text('Удалить устройство?'),
                          actions: [
                            TextButton(
                              onPressed: () =>
                                  Navigator.of(dialogContext).pop(false),
                              child: const Text('Отмена'),
                            ),
                            TextButton(
                              onPressed: () =>
                                  Navigator.of(dialogContext).pop(true),
                              child: const Text('Удалить'),
                            ),
                          ],
                        );
                      },
                    );

                    if (confirmed != true) {
                      return;
                    }

                    final box = await Hive.openBox<User>('userBox');
                    final currentUser = box.get('currentUser');

                    if (currentUser == null) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Ошибка: пользователь не авторизован'),
                          backgroundColor: Colors.red,
                          duration: Duration(seconds: 2),
                        ),
                      );
                      return;
                    }

                    final userRepository =
                        GetIt.I.get<AbstractUserRepository>();
                    final response = await userRepository.removeDevice(
                      currentUser.login,
                      currentUser.password,
                      serialNumber.toString(),
                    );

                    if (!context.mounted) return;
                    final success =
                        response is Map ? response['success'] ?? false : false;
                    final message = response is Map
                        ? (response['message'] ??
                            'Ошибка при удалении устройства')
                        : 'Ошибка при удалении устройства';

                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(message),
                        backgroundColor: success ? Colors.green : Colors.red,
                        duration: const Duration(seconds: 2),
                      ),
                    );

                    if (success) {
                      _loadDevices();
                    }
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}
