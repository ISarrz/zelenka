import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';

void showMonitoringChartDialog({
  required BuildContext context,
  required String title,
  required List<Map<String, dynamic>> monitorings,
  required String valueKey,
  required String unit,
}) {
  if (monitorings.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Нет данных для графика'),
        backgroundColor: Colors.orange,
        duration: Duration(seconds: 2),
      ),
    );
    return;
  }

  final spots = <FlSpot>[];
  for (var i = 0; i < monitorings.length; i++) {
    final raw = monitorings[i][valueKey];
    final value = raw is num ? raw.toDouble() : double.tryParse('$raw');
    if (value != null) {
      spots.add(FlSpot(i.toDouble(), value));
    }
  }

  if (spots.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Нет данных для графика'),
        backgroundColor: Colors.orange,
        duration: Duration(seconds: 2),
      ),
    );
    return;
  }

  double minY = spots.first.y;
  double maxY = spots.first.y;
  for (final spot in spots) {
    if (spot.y < minY) minY = spot.y;
    if (spot.y > maxY) maxY = spot.y;
  }
  if (minY == maxY) {
    minY -= 1;
    maxY += 1;
  }

  String formatTimestamp(String? timestamp) {
    if (timestamp == null) return 'Нет данных';
    try {
      final date = DateTime.parse(timestamp);
      return DateFormat('dd.MM.yyyy HH:mm').format(date);
    } catch (e) {
      return timestamp;
    }
  }

  showDialog(
    context: context,
    builder: (context) {
      return AlertDialog(
        backgroundColor: Colors.blueGrey[900],
        title: SizedBox(
          width: double.infinity,
          child: Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white),
          ),
        ),
        content: SizedBox(
          width: double.maxFinite,
          height: 260,
          child: LineChart(
            LineChartData(
              gridData: const FlGridData(show: true),
              titlesData: FlTitlesData(
                leftTitles: AxisTitles(
                  axisNameWidget: Center(
                    child: RotatedBox(
                      quarterTurns: 3,
                      child: Text(
                        unit,
                        style:
                            const TextStyle(color: Colors.grey, fontSize: 12),
                      ),
                    ),
                  ),
                  axisNameSize: 28,
                  sideTitles: const SideTitles(
                    showTitles: true,
                    reservedSize: 48,
                  ),
                ),
                bottomTitles:
                    const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                topTitles:
                    const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles:
                    const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              ),
              borderData: FlBorderData(show: true),
              minX: spots.first.x,
              maxX: spots.last.x,
              minY: minY,
              maxY: maxY,
              lineTouchData: LineTouchData(
                enabled: true,
                touchTooltipData: LineTouchTooltipData(
                  getTooltipItems: (List<LineBarSpot> touchedSpots) {
                    return touchedSpots.map((LineBarSpot touchedSpot) {
                      final index = touchedSpot.x.toInt();
                      final timestamp = index >= 0 && index < monitorings.length
                          ? monitorings[index]['timestamp']?.toString()
                          : null;
                      final formattedTime = formatTimestamp(timestamp);
                      final value = touchedSpot.y.toStringAsFixed(2);

                      return LineTooltipItem(
                        '$value $unit\n$formattedTime',
                        const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      );
                    }).toList();
                  },
                  tooltipPadding: const EdgeInsets.all(8),
                  getTooltipColor: (LineBarSpot spot) =>
                      Colors.blueGrey.shade800,
                ),
              ),
              lineBarsData: [
                LineChartBarData(
                  spots: spots,
                  isCurved: true,
                  color: Colors.orange,
                  barWidth: 3,
                  dotData: const FlDotData(show: true),
                  belowBarData: BarAreaData(
                    show: true,
                    color: Colors.orange.withValues(alpha: 0.15),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: const [],
      );
    },
  );
}
