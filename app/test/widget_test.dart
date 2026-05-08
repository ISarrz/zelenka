import 'package:flutter_test/flutter_test.dart';

import 'package:zelenka/main.dart';

void main() {
  testWidgets('App opens auth page', (WidgetTester tester) async {
    setupDependencies();

    await tester.pumpWidget(const ZelenkaApp(initialRoute: '/auth'));
    await tester.pumpAndSettle();

    expect(find.text('Авторизация'), findsOneWidget);
  });
}
