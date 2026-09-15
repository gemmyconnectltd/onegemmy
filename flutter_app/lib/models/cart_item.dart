/// Mirrors frontend/src/components/pos/types.ts CartItem — same fields,
/// same behavior, so the two clients stay conceptually in sync.
class CartItem {
  final String id;
  final String? productId;
  final String? variantId;
  final String name;
  final double price;
  int qty;
  double discount;
  double? cashReceived;
  final String? sku;
  final Map<String, String>? variantAttributes;
  final String? imageUrl;

  CartItem({
    required this.id,
    this.productId,
    this.variantId,
    required this.name,
    required this.price,
    this.qty = 1,
    this.discount = 0,
    this.cashReceived,
    this.sku,
    this.variantAttributes,
    this.imageUrl,
  });

  double get lineTotal => price * qty - discount;
}
