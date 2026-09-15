import 'cart_item.dart';

enum PaymentMethod { cash, mobile, card }

extension PaymentMethodLabel on PaymentMethod {
  String get label {
    switch (this) {
      case PaymentMethod.cash:
        return 'Cash';
      case PaymentMethod.mobile:
        return 'Mobile';
      case PaymentMethod.card:
        return 'Card';
    }
  }

  String get apiValue => name;
}

/// Mirrors frontend/src/components/pos/types.ts SaleResult — the receipt data
/// for a completed sale.
class SaleResult {
  final String orderId;
  final String orderNumber;
  final PaymentMethod payment;
  final String customerName;
  final String notes;
  final List<CartItem> items;
  final double subtotal;
  final double discount;
  final double tax;
  final double total;
  final String cashGiven;
  final double change;
  final DateTime timestamp;

  SaleResult({
    required this.orderId,
    required this.orderNumber,
    required this.payment,
    required this.customerName,
    required this.notes,
    required this.items,
    required this.subtotal,
    required this.discount,
    required this.tax,
    required this.total,
    required this.cashGiven,
    required this.change,
    required this.timestamp,
  });
}
