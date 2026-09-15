import 'package:flutter/material.dart';

/// A "label ..... value" line — used throughout the checkout and receipt
/// screens (subtotal, tax, total, paid via, change, ...). The caller passes
/// an already-formatted `value` string (usually via fmtCurrency), so this
/// widget only ever handles layout/typography, never number formatting —
/// one row implementation instead of a slightly-different copy per screen.
class MoneyRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  final Color? color;

  const MoneyRow({
    super.key,
    required this.label,
    required this.value,
    this.bold = false,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final baseStyle = TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal, fontSize: bold ? 15 : 13);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: baseStyle.copyWith(color: color ?? (bold ? Colors.black87 : Colors.black54))),
          Text(value, style: baseStyle.copyWith(color: color ?? Colors.black87)),
        ],
      ),
    );
  }
}
