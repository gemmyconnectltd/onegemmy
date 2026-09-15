/// App-wide configuration.
///
/// The Flutter app talks to the exact same FastAPI backend the web app and
/// mobile-web app already use — there is no separate API for this client.
class AppConfig {
  /// Same production backend the web app falls back to
  /// (frontend/src/lib/api/client.ts). Override at build/run time with:
  ///   flutter run --dart-define=API_BASE_URL=http://localhost:8000/api/v1
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://onegemmy.onrender.com/api/v1',
  );

  static const String appName = 'OneGemmy';
  static const String currencySymbol = 'RWF';
}
