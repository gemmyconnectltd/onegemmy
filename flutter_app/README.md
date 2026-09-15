# OneGemmy POS (Flutter)

Native mobile point-of-sale app for iOS and Android — a Flutter client for
the same backend the web app (`../frontend`) and mobile-web PWA (`../mobile`)
already use. There is no separate API for this app; it talks to the existing
FastAPI backend directly.

## Current scope (MVP)

- Login (email + password, JWT with auto-refresh)
- Product browsing (search, category filter, variant picker)
- Cart (quantity, per-line discount, per-line cash received)
- Checkout (Cash / Mobile / Card, cash-received entry with quick amounts,
  change calculation, itemized-cash-to-total helper — mirrors the same
  behavior as the web POS)
- Receipt screen

Not yet built: inventory management, sales history, reports, HR, accounting,
and the other back-office modules the web app has. This is a deliberate
starting scope — see the project conversation for how to extend it.

## Setup

Requires the [Flutter SDK](https://docs.flutter.dev/get-started/install)
(this project was built against Flutter 3.47, Dart 3.13).

```bash
cd flutter_app
flutter pub get
flutter run          # picks a connected device/simulator
```

### Pointing at a different backend

By default the app talks to production
(`https://onegemmy.onrender.com/api/v1`, the same fallback the web app uses).
To point at a local backend instead:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:8000/api/v1
```

On a physical Android device or emulator, `localhost` refers to the device
itself, not your computer — use `http://10.0.2.2:8000/api/v1` for the
Android emulator, or your machine's LAN IP for a physical device.

## Project layout

```
lib/
  config.dart           # API base URL, app constants
  theme.dart             # Brand colors (matches the web app's accent)
  models/                 # Plain Dart data classes for API responses
  services/                # HTTP client + per-resource API wrappers
  state/                    # ChangeNotifier providers (auth, cart)
  screens/                   # One file per screen
```

`lib/state/cart_provider.dart` mirrors
`frontend/src/components/mobile/MobilePosProvider.tsx` closely on purpose —
same cart math, same payment/cash-received behavior — so the two clients
don't drift apart in how they calculate totals, change, and shortfalls.

## Building for release

```bash
flutter build apk --release       # Android
flutter build ios --release       # iOS (requires a Mac + Apple Developer account to sign/ship)
```
