import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:permission_handler/permission_handler.dart';

class BleConfigPage extends StatefulWidget {
  const BleConfigPage({super.key});

  @override
  State<BleConfigPage> createState() => _BleConfigPageState();
}

class _BleConfigPageState extends State<BleConfigPage> {
  final TextEditingController _ssidController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  List<ScanResult> _scanResults = [];
  bool _isScanning = false;
  bool _isConnecting = false;
  bool _isSending = false;
  BluetoothDevice? _connectedDevice;
  StreamSubscription<List<ScanResult>>? _scanSubscription;

  static const String serviceUuid = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
  static const String characteristicUuid =
      "beb5483e-36e1-4688-b7f5-ea07361b26a8";

  @override
  void initState() {
    super.initState();
    _checkBluetoothState();
  }

  @override
  void dispose() {
    _scanSubscription?.cancel();
    _ssidController.dispose();
    _passwordController.dispose();
    _connectedDevice?.disconnect();
    super.dispose();
  }

  Future<void> _checkBluetoothState() async {
    try {
      final isSupported = await FlutterBluePlus.isSupported;
      if (!isSupported) {
        if (mounted) {
          _showMessage('Bluetooth не поддерживается на этом устройстве',
              isError: true);
        }
        return;
      }

      final state = await FlutterBluePlus.adapterState.first;
      if (state != BluetoothAdapterState.on) {
        if (mounted) {
          _showMessage('Включите Bluetooth', isError: true);
        }
      }
    } catch (e) {
      _showMessage('Ошибка проверки Bluetooth: $e', isError: true);
    }
  }

  Future<bool> _ensureScanPermissions() async {
    if (!Platform.isAndroid) {
      return true;
    }

    final statuses = await [
      Permission.bluetoothScan,
      Permission.bluetoothConnect,
      Permission.locationWhenInUse,
    ].request();

    final denied = statuses.values.any(
      (status) => status.isDenied || status.isPermanentlyDenied,
    );

    if (denied) {
      _showMessage(
        'Нужны разрешения Bluetooth и Геолокации для сканирования',
        isError: true,
      );
      return false;
    }

    return true;
  }

  Future<void> _startScan() async {
    if (_isScanning) return;

    final hasPermissions = await _ensureScanPermissions();
    if (!hasPermissions) return;

    setState(() {
      _isScanning = true;
      _scanResults.clear();
    });

    try {
      await FlutterBluePlus.startScan(timeout: const Duration(seconds: 15));

      _scanSubscription = FlutterBluePlus.scanResults.listen((results) {
        if (mounted) {
          setState(() {
            // Фильтруем устройства с любым именем (platformName или advName)
            _scanResults = results.where((r) {
              final platformName = r.device.platformName;
              final advName = r.advertisementData.advName;
              return platformName.isNotEmpty || advName.isNotEmpty;
            }).toList();
          });
        }
      });

      await Future.delayed(const Duration(seconds: 15));
      await _stopScan();
    } on PlatformException catch (e) {
      final message = (e.message ?? '').toLowerCase();
      if (message.contains('location services')) {
        _showMessage(
          'Для сканирования включите Геолокацию (GPS) на устройстве',
          isError: true,
        );
      } else {
        _showMessage('Ошибка сканирования: ${e.message}', isError: true);
      }
      await _stopScan();
    } catch (e) {
      _showMessage('Ошибка сканирования: $e', isError: true);
      await _stopScan();
    }
  }

  Future<void> _stopScan() async {
    await FlutterBluePlus.stopScan();
    setState(() {
      _isScanning = false;
    });
  }

  Future<void> _connectToDevice(BluetoothDevice device) async {
    if (_isConnecting) return;

    setState(() {
      _isConnecting = true;
    });

    try {
      await device.connect(timeout: const Duration(seconds: 15));

      // Задержка после подключения для стабилизации соединения
      await Future.delayed(const Duration(milliseconds: 500));

      // Запрос увеличения MTU для надежной передачи
      try {
        await device.requestMtu(512);
      } catch (e) {
        print('Не удалось запросить MTU: $e');
      }

      await device.discoverServices();

      // Задержка после обнаружения сервисов
      await Future.delayed(const Duration(milliseconds: 300));

      setState(() {
        _connectedDevice = device;
        _isConnecting = false;
      });

      _showMessage('Подключено к ${device.platformName}');
    } catch (e) {
      setState(() {
        _isConnecting = false;
      });
      _showMessage('Ошибка подключения: $e', isError: true);
    }
  }

  Future<void> _sendWifiCredentials() async {
    if (_connectedDevice == null) {
      _showMessage('Сначала подключитесь к устройству', isError: true);
      return;
    }

    final ssid = _ssidController.text.trim();
    final password = _passwordController.text.trim();

    if (ssid.isEmpty) {
      _showMessage('Введите SSID WiFi сети', isError: true);
      return;
    }

    setState(() {
      _isSending = true;
    });

    try {
      final services = await _connectedDevice!.discoverServices();

      BluetoothCharacteristic? targetCharacteristic;

      for (var service in services) {
        print('Найден сервис: ${service.uuid}');
        if (service.uuid.toString().toLowerCase() ==
            serviceUuid.toLowerCase()) {
          print('Найден целевой сервис!');
          for (var characteristic in service.characteristics) {
            print('Характеристика: ${characteristic.uuid}');
            if (characteristic.uuid.toString().toLowerCase() ==
                characteristicUuid.toLowerCase()) {
              targetCharacteristic = characteristic;
              print('Найдена целевая характеристика!');
              break;
            }
          }
        }
      }

      if (targetCharacteristic == null) {
        _showMessage('Характеристика не найдена', isError: true);
        setState(() {
          _isSending = false;
        });
        return;
      }

      // Формат: SSID|PASSWORD
      final credentials = '$ssid|$password';
      print('Отправка данных: $credentials');

      // Попытка записи с повторами при ошибке 133
      int maxRetries = 3;
      bool success = false;

      for (int attempt = 0; attempt < maxRetries && !success; attempt++) {
        try {
          if (attempt > 0) {
            print('Повторная попытка отправки: ${attempt + 1}/$maxRetries');
            await Future.delayed(Duration(milliseconds: 500 * attempt));
          }

          // Используем обычную запись с подтверждением (WRITE property)
          await targetCharacteristic.write(
            credentials.codeUnits,
            withoutResponse: false,
          );

          success = true;
          print('Данные успешно отправлены');
        } catch (e) {
          print('Ошибка при попытке ${attempt + 1}: $e');
          if (attempt == maxRetries - 1) {
            rethrow;
          }
        }
      }

      setState(() {
        _isSending = false;
      });

      _showMessage('Данные WiFi отправлены! ESP32 перезагружается...');

      // Отключаемся от устройства
      await Future.delayed(const Duration(seconds: 2));
      await _connectedDevice?.disconnect();

      setState(() {
        _connectedDevice = null;
      });
    } catch (e) {
      print('Ошибка при отправке: $e');
      setState(() {
        _isSending = false;
      });
      _showMessage('Ошибка отправки данных: $e', isError: true);
    }
  }

  void _showMessage(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Настройка WiFi устройства'),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Поля для ввода WiFi данных
            TextField(
              controller: _ssidController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'WiFi SSID',
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
            const SizedBox(height: 16),
            TextField(
              controller: _passwordController,
              obscureText: true,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'WiFi Password',
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
            const SizedBox(height: 24),

            // Кнопка сканирования
            ElevatedButton.icon(
              onPressed: _isScanning ? null : _startScan,
              icon: _isScanning
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.bluetooth_searching),
              label: Text(
                  _isScanning ? 'Сканирование...' : 'Сканировать устройства'),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
            ),

            const SizedBox(height: 16),

            // Статус подключения
            if (_connectedDevice != null)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, color: Colors.green),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Подключено: ${_connectedDevice!.platformName}',
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),

            const SizedBox(height: 16),

            // Кнопка отправки
            if (_connectedDevice != null)
              ElevatedButton.icon(
                onPressed: _isSending ? null : _sendWifiCredentials,
                icon: _isSending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send),
                label:
                    Text(_isSending ? 'Отправка...' : 'Отправить данные WiFi'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: Colors.orange,
                ),
              ),

            const SizedBox(height: 16),
            const Divider(color: Colors.grey),
            const SizedBox(height: 8),

            // Список найденных устройств
            Expanded(
              child: _scanResults.isEmpty
                  ? const Center(
                      child: Text(
                        'Нажмите "Сканировать устройства"\nдля поиска ESP32',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.grey),
                      ),
                    )
                  : ListView.builder(
                      itemCount: _scanResults.length,
                      itemBuilder: (context, index) {
                        final result = _scanResults[index];
                        final device = result.device;
                        final isConnected =
                            _connectedDevice?.remoteId == device.remoteId;

                        // Выбираем имя устройства (advName имеет приоритет для ESP32)
                        String deviceName =
                            result.advertisementData.advName.isNotEmpty
                                ? result.advertisementData.advName
                                : (device.platformName.isNotEmpty
                                    ? device.platformName
                                    : 'Unknown Device');

                        // Добавляем уровень сигнала
                        final rssi = result.rssi;

                        return Card(
                          color: isConnected
                              ? Colors.green.withOpacity(0.3)
                              : Colors.blueGrey[800],
                          child: ListTile(
                            leading: Icon(
                              Icons.devices,
                              color: isConnected ? Colors.green : Colors.white,
                            ),
                            title: Text(
                              deviceName,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold),
                            ),
                            subtitle: Text(
                              '${device.remoteId.toString()}\nСигнал: $rssi dBm',
                              style: const TextStyle(
                                  color: Colors.grey, fontSize: 12),
                            ),
                            isThreeLine: true,
                            trailing: isConnected
                                ? const Icon(Icons.check_circle,
                                    color: Colors.green)
                                : _isConnecting
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2),
                                      )
                                    : IconButton(
                                        icon: const Icon(Icons.link,
                                            color: Colors.blue),
                                        onPressed: () =>
                                            _connectToDevice(device),
                                      ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
