import 'package:intl/intl.dart';

import 'package:onegemmy_pos/core/config.dart';

final NumberFormat _moneyFormat = NumberFormat('#,##0', 'en_US');

/// Formats a number with thousands separators and no decimals —
/// matches the web app's fmt = (v) => v.toLocaleString().
String fmtMoney(num value) => _moneyFormat.format(value);

/// Formats a number as a full currency string, e.g. "RWF 1,234". This is
/// the one place the "symbol + amount" pattern is assembled — every screen
/// should call this instead of interpolating AppConfig.currencySymbol
/// itself, so the display format only ever needs to change here.
String fmtCurrency(num value) => '${AppConfig.currencySymbol} ${fmtMoney(value)}';

List<double> quickCashAmounts(double total) {
  final steps = [100, 500, 1000, 5000];
  final roundUps = steps.map((s) => (total / s).ceil() * s.toDouble()).where((v) => v > total).toSet().toList();
  final result = <double>{total, ...roundUps}.toList();
  result.sort();
  return result.take(4).toList();
}
