import 'package:flutter/material.dart';
import 'package:zelenka/features/home_page/widgets/monitoring_value_tile.dart';

class DeviceCard extends StatelessWidget {
  const DeviceCard({
    super.key,
    required this.serialNumber,
    required this.status,
    required this.monitorings,
    required this.onOpenChart,
    required this.onDelete,
    this.lastMonitoring,
    this.lastTimestamp,
  });

  final String serialNumber;
  final String status;
  final Map<String, dynamic>? lastMonitoring;
  final String? lastTimestamp;
  final List<Map<String, dynamic>> monitorings;
  final void Function(String title, String valueKey, String unit) onOpenChart;
  final VoidCallback onDelete;

  String _formatValue(dynamic value) {
    if (value == null) return 'N/A';
    if (value is num) {
      return value.toStringAsFixed(2);
    }
    final parsed = double.tryParse(value.toString());
    if (parsed != null) {
      return parsed.toStringAsFixed(2);
    }
    return value.toString();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.blueGrey[800],
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Устройство: $serialNumber',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .scaffoldBackgroundColor
                        .withValues(alpha: 0.95),
                    shape: BoxShape.circle,
                  ),
                  child: IconButton(
                    onPressed: onDelete,
                    icon: const Icon(Icons.delete, color: Colors.white),
                    iconSize: 16,
                    constraints: const BoxConstraints(
                      minWidth: 28,
                      minHeight: 28,
                    ),
                    padding: const EdgeInsets.all(4),
                    tooltip: 'Удалить устройство',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Статус: $status',
              style: const TextStyle(
                color: Colors.grey,
                fontSize: 14,
              ),
            ),
            if (lastTimestamp != null) ...[
              const SizedBox(height: 6),
              Text(
                'Последнее измерение: $lastTimestamp',
                style: const TextStyle(
                  color: Colors.grey,
                  fontSize: 12,
                ),
              ),
            ],
            if (lastMonitoring != null) ...[
              const SizedBox(height: 12),
              const Divider(color: Colors.grey, height: 1),
              const SizedBox(height: 12),
              const Text(
                'Последние измерения:',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: MonitoringValueTile(
                      label: 'Температура',
                      value: _formatValue(lastMonitoring!['temperature']),
                      unit: '°C',
                      onTap: () => onOpenChart(
                        'Температура',
                        'temperature',
                        '°C',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: MonitoringValueTile(
                      label: 'Влажность',
                      value: _formatValue(lastMonitoring!['humidity']),
                      unit: '%',
                      onTap: () => onOpenChart(
                        'Влажность',
                        'humidity',
                        '%',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: MonitoringValueTile(
                      label: 'Влажность почвы',
                      value: _formatValue(lastMonitoring!['hydration']),
                      unit: '%',
                      onTap: () => onOpenChart(
                        'Влажность почвы',
                        'hydration',
                        '%',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: MonitoringValueTile(
                      label: 'Давление',
                      value: _formatValue(lastMonitoring!['pressure']),
                      unit: 'hPa',
                      onTap: () => onOpenChart(
                        'Давление',
                        'pressure',
                        'hPa',
                      ),
                    ),
                  ),
                ],
              ),
            ]
          ],
        ),
      ),
    );
  }
}
