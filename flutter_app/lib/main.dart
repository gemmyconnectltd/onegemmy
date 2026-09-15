import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/config.dart';
import 'core/network/api_client.dart';
import 'core/theme.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/pos/providers/cart_provider.dart';
import 'features/pos/screens/pos_screen.dart';

void main() {
  final apiClient = ApiClient();
  runApp(OneGemmyApp(apiClient: apiClient));
}

class OneGemmyApp extends StatelessWidget {
  final ApiClient apiClient;
  const OneGemmyApp({super.key, required this.apiClient});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider(apiClient)..bootstrap()),
        ChangeNotifierProvider(create: (_) => CartProvider(apiClient)),
      ],
      child: MaterialApp(
        title: AppConfig.appName,
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: const _AppGate(),
      ),
    );
  }
}

/// Decides between the splash/loading state, login, and the POS home based
/// on auth state — a stored token is trusted optimistically; if it's stale,
/// the first API call 401s and ApiClient clears it, so screens should route
/// back to login on that condition (kept simple for the MVP).
class _AppGate extends StatelessWidget {
  const _AppGate();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    if (auth.isBootstrapping) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (auth.isAuthenticated || auth.hasStoredSessionHint) {
      return const PosScreen();
    }
    return const LoginScreen();
  }
}
