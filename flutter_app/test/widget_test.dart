// Basic smoke test — confirms the app boots to the login screen when there's
// no stored session, without hitting the real network.

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:pesaa_pos/core/network/api_client.dart';
import 'package:pesaa_pos/main.dart';

void main() {
  testWidgets('Shows the login screen on a fresh install', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(PesaaApp(apiClient: ApiClient()));
    // Let the async bootstrap() (SharedPreferences lookup) resolve without
    // pumpAndSettle, which never settles while the loading spinner animates.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
  });
}
