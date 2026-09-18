/// App-wide configuration.
///
/// The Flutter app talks to the exact same FastAPI backend the web app and
/// mobile-web app already use — there is no separate API for this client.
class AppConfig {
  /// The backend now runs on a VPS, not Render — there's no fixed production
  /// URL to default to here, so this only covers local dev. Every real build
  /// must set API_BASE_URL explicitly:
  ///   flutter run --dart-define=API_BASE_URL=https://your-vps-host/api/v1
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8000/api/v1',
  );

  static const String appName = 'Pesaa';
  static const String currencySymbol = 'RWF';
}
