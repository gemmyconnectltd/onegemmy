import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'package:onegemmy_pos/core/config.dart';

/// Thrown for any non-2xx response. Mirrors the {status, detail} shape the
/// web app throws in frontend/src/lib/api/client.ts, so error messages read
/// the same on both clients.
class ApiException implements Exception {
  final int status;
  final String detail;
  ApiException(this.status, this.detail);

  @override
  String toString() => detail;
}

/// Thin HTTP client wrapping the same FastAPI backend the web app talks to —
/// same base URL, same bearer-token auth, same auto-refresh-on-401 behavior.
class ApiClient {
  static const _tokenKey = 'onegemmy_token';
  static const _refreshTokenKey = 'onegemmy_refresh_token';

  final http.Client _http = http.Client();
  Future<String?>? _refreshInFlight;

  Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<String?> getRefreshToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_refreshTokenKey);
  }

  Future<void> setTokens({required String accessToken, required String refreshToken}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, accessToken);
    await prefs.setString(_refreshTokenKey, refreshToken);
  }

  Future<void> clearTokens() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_refreshTokenKey);
  }

  Future<String?> _tryRefresh() {
    // Deduplicate concurrent refresh attempts, same as the web client.
    return _refreshInFlight ??= _doRefresh().whenComplete(() => _refreshInFlight = null);
  }

  Future<String?> _doRefresh() async {
    final refreshToken = await getRefreshToken();
    if (refreshToken == null) return null;
    try {
      final res = await _http
          .post(
            Uri.parse('${AppConfig.apiBaseUrl}/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refresh_token': refreshToken}),
          )
          .timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) return null;
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      final data = body['data'] as Map<String, dynamic>?;
      final newAccess = data?['access_token'] as String?;
      final newRefresh = data?['refresh_token'] as String?;
      if (newAccess != null && newRefresh != null) {
        await setTokens(accessToken: newAccess, refreshToken: newRefresh);
        return newAccess;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool retryOn401 = true,
  }) async {
    final token = await getToken();
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
    final encodedBody = body != null ? jsonEncode(body) : null;

    late http.Response res;
    try {
      res = await _request(method, uri, headers, encodedBody).timeout(const Duration(seconds: 60));
    } on TimeoutException {
      throw ApiException(0, "Can't reach the server. Check your connection and try again.");
    } catch (_) {
      throw ApiException(0, "Can't reach the server. Check your connection and try again.");
    }

    if (res.statusCode == 401 && retryOn401) {
      final newToken = await _tryRefresh();
      if (newToken != null) {
        return _send(method, path, body: body, retryOn401: false);
      }
      await clearTokens();
      throw ApiException(401, 'Session expired');
    }

    final decoded = res.body.isNotEmpty ? jsonDecode(res.body) as Map<String, dynamic> : <String, dynamic>{};

    if (res.statusCode < 200 || res.statusCode >= 300) {
      final detailRaw = decoded['detail'] ?? decoded['message'] ?? res.reasonPhrase ?? 'Request failed';
      final detail = detailRaw is List
          ? detailRaw.map((e) => e is Map ? e['msg'] : e).join(', ')
          : detailRaw.toString();
      throw ApiException(res.statusCode, detail);
    }

    return decoded;
  }

  Future<http.Response> _request(String method, Uri uri, Map<String, String> headers, String? body) {
    switch (method) {
      case 'GET':
        return _http.get(uri, headers: headers);
      case 'POST':
        return _http.post(uri, headers: headers, body: body);
      case 'PATCH':
        return _http.patch(uri, headers: headers, body: body);
      case 'DELETE':
        return _http.delete(uri, headers: headers);
      default:
        throw ArgumentError('Unsupported method $method');
    }
  }

  Future<Map<String, dynamic>> get(String path) => _send('GET', path);
  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) => _send('POST', path, body: body);
  Future<Map<String, dynamic>> patch(String path, [Map<String, dynamic>? body]) => _send('PATCH', path, body: body);
  Future<Map<String, dynamic>> delete(String path) => _send('DELETE', path);
}
