import 'package:pesaa_pos/core/network/api_client.dart';
import 'package:pesaa_pos/features/auth/models/user.dart';

class AuthService {
  final ApiClient _client;
  AuthService(this._client);

  Future<AuthTokens> login({required String email, required String password, String? tenantSlug}) async {
    final res = await _client.post('/auth/login', {
      'email': email,
      'password': password,
      if (tenantSlug != null && tenantSlug.isNotEmpty) 'tenant_slug': tenantSlug,
    });
    final tokens = AuthTokens.fromJson(res['data'] as Map<String, dynamic>);
    await _client.setTokens(accessToken: tokens.accessToken, refreshToken: tokens.refreshToken);
    return tokens;
  }

  Future<void> logout() => _client.clearTokens();

  Future<bool> hasStoredSession() async => (await _client.getToken()) != null;
}
