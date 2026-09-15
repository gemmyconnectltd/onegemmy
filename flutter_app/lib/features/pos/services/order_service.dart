import 'package:onegemmy_pos/core/network/api_client.dart';
import 'package:onegemmy_pos/features/pos/models/cart_item.dart';
import 'package:onegemmy_pos/features/pos/models/sale_result.dart';

class OrderService {
  final ApiClient _client;
  OrderService(this._client);

  /// Creates a completed order on the backend. Same payload shape as
  /// frontend's completeSale() — status "Completed", order-level discount
  /// left at 0 since per-line discounts are already baked into line_total.
  Future<String> createOrder({
    required List<CartItem> items,
    required double tax,
    required PaymentMethod payment,
    String? customerId,
    String notes = '',
  }) async {
    final res = await _client.post('/tenants/sales/orders', {
      'status': 'Completed',
      'customer_id': customerId,
      'notes': 'POS — ${payment.apiValue}${notes.trim().isNotEmpty ? ' | ${notes.trim()}' : ''}',
      'discount': 0,
      'tax': tax,
      'items': items
          .map((i) => {
                'product_id': i.productId,
                'variant_id': i.variantId,
                'product_name': i.name,
                'sku': i.sku,
                'variant_attributes': i.variantAttributes,
                'unit_price': i.price,
                'quantity': i.qty,
                'discount': i.discount,
                'line_total': i.lineTotal,
              })
          .toList(),
    });
    final data = res['data'] as Map<String, dynamic>;
    return data['order_number'] as String? ?? data['id'] as String;
  }
}
