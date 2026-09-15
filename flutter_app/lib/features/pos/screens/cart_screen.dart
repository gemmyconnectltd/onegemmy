import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:onegemmy_pos/core/config.dart';
import 'package:onegemmy_pos/core/theme.dart';
import 'package:onegemmy_pos/core/utils/format.dart';
import 'package:onegemmy_pos/features/pos/models/cart_item.dart';
import 'package:onegemmy_pos/features/pos/models/sale_result.dart';
import 'package:onegemmy_pos/features/pos/providers/cart_provider.dart';

import 'payment_screen.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text('Cart (${cart.totalItems})'),
        actions: [
          if (cart.items.isNotEmpty)
            TextButton(
              onPressed: () => context.read<CartProvider>().clearCart(),
              child: const Text('Clear', style: TextStyle(color: Colors.red)),
            ),
        ],
      ),
      body: cart.items.isEmpty
          ? const Center(child: Text('Your cart is empty', style: TextStyle(color: Colors.black54)))
          : ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: cart.items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) => _CartRow(item: cart.items[i]),
            ),
      bottomNavigationBar: cart.items.isEmpty
          ? null
          : SafeArea(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(border: Border(top: BorderSide(color: kBorder))),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total', style: TextStyle(color: Colors.black54)),
                        Text('${AppConfig.currencySymbol} ${fmtMoney(cart.total)}',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PaymentScreen())),
                      child: const Text('Continue to payment'),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}

class _CartRow extends StatelessWidget {
  final CartItem item;
  const _CartRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final cart = context.read<CartProvider>();
    final showCashReceived = context.watch<CartProvider>().payment == PaymentMethod.cash;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: kSurface, borderRadius: BorderRadius.circular(10)),
            clipBehavior: Clip.antiAlias,
            child: item.imageUrl != null
                ? Image.network(item.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.inventory_2_outlined, color: Colors.black26))
                : const Icon(Icons.inventory_2_outlined, color: Colors.black26),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5), maxLines: 2, overflow: TextOverflow.ellipsis),
                Text('${AppConfig.currencySymbol} ${fmtMoney(item.price)} each', style: const TextStyle(color: Colors.black45, fontSize: 11.5)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _MiniField(
                      icon: Icons.percent,
                      hint: '0',
                      initialValue: item.discount > 0 ? item.discount.toStringAsFixed(0) : '',
                      onChanged: (v) => cart.updateDiscount(item.id, double.tryParse(v) ?? 0),
                    ),
                    if (showCashReceived)
                      _MiniField(
                        icon: Icons.account_balance_wallet_outlined,
                        hint: 'Received',
                        initialValue: (item.cashReceived ?? 0) > 0 ? item.cashReceived!.toStringAsFixed(0) : '',
                        onChanged: (v) => cart.updateItemCashReceived(item.id, double.tryParse(v) ?? 0),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${AppConfig.currencySymbol} ${fmtMoney(item.lineTotal)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
              const SizedBox(height: 6),
              Row(
                children: [
                  _RoundIconButton(icon: Icons.remove, onTap: () => cart.updateQty(item.id, -1)),
                  SizedBox(width: 28, child: Text('${item.qty}', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.bold))),
                  _RoundIconButton(icon: Icons.add, onTap: () => cart.updateQty(item.id, 1)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniField extends StatelessWidget {
  final IconData icon;
  final String hint;
  final String initialValue;
  final ValueChanged<String> onChanged;

  const _MiniField({required this.icon, required this.hint, required this.initialValue, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 90),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(color: kSurface, borderRadius: BorderRadius.circular(6)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: Colors.black45),
          const SizedBox(width: 3),
          Flexible(
            child: TextFormField(
              initialValue: initialValue,
              keyboardType: TextInputType.number,
              style: const TextStyle(fontSize: 11),
              decoration: InputDecoration(
                isDense: true,
                hintText: hint,
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 6),
              ),
              onChanged: onChanged,
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _RoundIconButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: kBorder)),
        child: Icon(icon, size: 14),
      ),
    );
  }
}
