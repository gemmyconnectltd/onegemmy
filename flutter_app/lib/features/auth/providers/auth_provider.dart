import 'package:flutter/foundation.dart';

import 'package:onegemmy_pos/core/network/api_client.dart';
import 'package:onegemmy_pos/features/auth/models/user.dart';
import 'package:onegemmy_pos/features/auth/services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiClient client;
  late final AuthService _authService = AuthService(client);

  AuthProvider(this.client);

  AuthUser? user;
  bool isBootstrapping = true;
  bool isLoading = false;
  String? error;

  bool get isAuthenticated => user != null;

  /// Called once at app start — a stored token doesn't carry the user's
  /// profile, so we just check whether a session exists; the first
  /// authenticated request will surface an expired/invalid token via 401.
  Future<void> bootstrap() async {
    isBootstrapping = true;
    notifyListeners();
    final hasSession = await _authService.hasStoredSession();
    // We don't have a "me" endpoint call here to keep the MVP simple —
    // if the stored token is stale, the first API call will 401 and the
    // interceptor will clear it; screens should handle that gracefully.
    isBootstrapping = false;
    _hasStoredSessionHint = hasSession;
    notifyListeners();
  }

  bool _hasStoredSessionHint = false;
  bool get hasStoredSessionHint => _hasStoredSessionHint;

  Future<bool> login({required String email, required String password, String? tenantSlug}) async {
    isLoading = true;
    error = null;
    notifyListeners();
    try {
      final tokens = await _authService.login(email: email, password: password, tenantSlug: tenantSlug);
      user = tokens.user;
      isLoading = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      error = e.status == 401 ? 'Invalid email or password' : e.detail;
      isLoading = false;
      notifyListeners();
      return false;
    } catch (_) {
      error = 'Something went wrong. Please try again.';
      isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _authService.logout();
    user = null;
    _hasStoredSessionHint = false;
    notifyListeners();
  }
}
