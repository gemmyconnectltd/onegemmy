import 'package:flutter/foundation.dart';

import 'package:pesaa_pos/core/network/api_client.dart';
import 'package:pesaa_pos/features/pos/models/cart_item.dart';
import 'package:pesaa_pos/features/pos/models/product.dart';
import 'package:pesaa_pos/features/pos/models/sale_result.dart';
import 'package:pesaa_pos/features/pos/services/order_service.dart';

const double kTaxRate = 0.18;

/// Mirrors frontend/src/components/mobile/MobilePosProvider.tsx — same cart
/// math, same payment/cash-received behavior (including the fix that resets
/// a stale Cash Received amount whenever the cart total changes).
class CartProvider extends ChangeNotifier {
  final OrderService orderService;
  CartProvider(ApiClient client) : orderService = OrderService(client);

  final List<CartItem> items = [];
  String? customerId;
  String customerName = '';
  String notes = '';
  PaymentMethod payment = PaymentMethod.cash;
  String cashGiven = '';
  bool saving = false;
  String? saleError;
  SaleResult? completedSale;

  double get subtotal => items.fold(0, (s, i) => s + i.price * i.qty);
  double get discount => items.fold(0, (s, i) => s + i.discount);
  double get gross => subtotal - discount;
  double get taxable => (gross / (1 + kTaxRate)).roundToDouble();
  double get tax => gross - taxable;
  double get total => gross;
  double get change => cashGiven.isNotEmpty ? (double.tryParse(cashGiven) ?? 0) - total : 0;
  bool get cashShort =>
      payment == PaymentMethod.cash && cashGiven.isNotEmpty && (double.tryParse(cashGiven) ?? 0) < total;
  double get itemsCashReceivedSum => items.fold(0, (s, i) => s + (i.cashReceived ?? 0));
  int get totalItems => items.fold(0, (s, i) => s + i.qty);

  void addProduct(Product p) {
    if (p.isOutOfStock) return;
    final existing = items.where((i) => i.id == p.id).firstOrNull;
    if (existing != null) {
      existing.qty += 1;
    } else {
      items.add(CartItem(
        id: p.id,
        productId: p.id,
        name: p.name,
        price: p.price,
        sku: p.sku,
        imageUrl: p.imageUrl,
      ));
    }
    cashGiven = '';
    notifyListeners();
  }

  void addVariant(Product p, ProductVariant v) {
    if (v.stock <= 0) return;
    final id = '${p.id}::${v.id}';
    final existing = items.where((i) => i.id == id).firstOrNull;
    if (existing != null) {
      existing.qty += 1;
    } else {
      items.add(CartItem(
        id: id,
        productId: p.id,
        variantId: v.id,
        name: p.name,
        price: v.price,
        sku: v.sku ?? p.sku,
        variantAttributes: v.attributes,
        imageUrl: p.imageUrl,
      ));
    }
    cashGiven = '';
    notifyListeners();
  }

  void updateQty(String id, int delta) {
    final item = items.where((i) => i.id == id).firstOrNull;
    if (item == null) return;
    item.qty = (item.qty + delta).clamp(0, 1 << 30);
    if (item.qty == 0) items.removeWhere((i) => i.id == id);
    cashGiven = '';
    notifyListeners();
  }

  void updateDiscount(String id, double discount) {
    final item = items.where((i) => i.id == id).firstOrNull;
    if (item == null) return;
    item.discount = discount < 0 ? 0 : discount;
    cashGiven = '';
    notifyListeners();
  }

  void updateItemCashReceived(String id, double value) {
    final item = items.where((i) => i.id == id).firstOrNull;
    if (item == null) return;
    item.cashReceived = value < 0 ? 0 : value;
    notifyListeners();
  }

  void removeItem(String id) {
    items.removeWhere((i) => i.id == id);
    cashGiven = '';
    notifyListeners();
  }

  void setPayment(PaymentMethod m) {
    payment = m;
    cashGiven = '';
    notifyListeners();
  }

  void setCashGiven(String v) {
    cashGiven = v;
    notifyListeners();
  }

  void setCustomer(String? id, String name) {
    customerId = id;
    customerName = name;
    notifyListeners();
  }

  void setNotes(String v) {
    notes = v;
    notifyListeners();
  }

  void clearCart() {
    items.clear();
    customerId = null;
    customerName = '';
    notes = '';
    cashGiven = '';
    saleError = null;
    notifyListeners();
  }

  Future<bool> completeSale() async {
    if (saving || items.isEmpty) return false;
    saving = true;
    saleError = null;
    notifyListeners();
    final changeAmt = cashGiven.isNotEmpty ? (double.tryParse(cashGiven) ?? 0) - total : 0.0;
    try {
      final orderNumber = await orderService.createOrder(
        items: items,
        tax: tax,
        payment: payment,
        customerId: customerId,
        notes: notes,
      );
      completedSale = SaleResult(
        orderId: orderNumber,
        orderNumber: orderNumber,
        payment: payment,
        customerName: customerName.trim(),
        notes: notes,
        items: List.of(items),
        subtotal: subtotal,
        discount: discount,
        tax: tax,
        total: total,
        cashGiven: cashGiven,
        change: changeAmt < 0 ? 0 : changeAmt,
        timestamp: DateTime.now(),
      );
      clearCart();
      saving = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      saleError = e.detail;
      saving = false;
      notifyListeners();
      return false;
    } catch (_) {
      saleError = 'Failed to save sale. Please try again.';
      saving = false;
      notifyListeners();
      return false;
    }
  }

  void startNewSale() {
    completedSale = null;
    payment = PaymentMethod.cash;
    cashGiven = '';
    notifyListeners();
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
