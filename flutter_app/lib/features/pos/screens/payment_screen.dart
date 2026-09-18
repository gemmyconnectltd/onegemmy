import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:pesaa_pos/core/config.dart';
import 'package:pesaa_pos/core/theme.dart';
import 'package:pesaa_pos/core/utils/format.dart';
import 'package:pesaa_pos/core/widgets/money_row.dart';
import 'package:pesaa_pos/core/widgets/surface_card.dart';
import 'package:pesaa_pos/features/pos/models/sale_result.dart';
import 'package:pesaa_pos/features/pos/providers/cart_provider.dart';

import 'receipt_screen.dart';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _cashController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _cashController.text = context.read<CartProvider>().cashGiven;
  }

  @override
  void dispose() {
    _cashController.dispose();
    super.dispose();
  }

  void _setCash(String v) {
    _cashController.value = TextEditingValue(text: v, selection: TextSelection.collapsed(offset: v.length));
    context.read<CartProvider>().setCashGiven(v);
  }

  Future<void> _charge() async {
    final cart = context.read<CartProvider>();
    final ok = await cart.completeSale();
    if (ok && mounted) {
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const ReceiptScreen()));
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    // Keep the field in sync if cashGiven was reset elsewhere (e.g. cart
    // changed after navigating back), without fighting user keystrokes.
    if (_cashController.text != cart.cashGiven && !_cashController.selection.isValid) {
      _cashController.text = cart.cashGiven;
    }

    final chargeDisabled = cart.saving || cart.items.isEmpty || cart.cashShort;

    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SurfaceCard(
              child: Column(
                children: [
                  MoneyRow(label: 'Subtotal (incl. VAT)', value: fmtCurrency(cart.subtotal)),
                  if (cart.discount > 0) MoneyRow(label: 'Discount', value: '-${fmtCurrency(cart.discount)}', color: Colors.green),
                  MoneyRow(label: 'VAT (18%, included)', value: fmtCurrency(cart.tax)),
                  const Divider(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('TOTAL', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                      Text(fmtCurrency(cart.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 24, color: kAccent)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: PaymentMethod.values.map((m) => Expanded(child: _PaymentMethodTile(method: m))).toList(),
            ),
            if (cart.payment == PaymentMethod.cash && cart.items.isNotEmpty) ...[
              const SizedBox(height: 16),
              SurfaceCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('CASH RECEIVED', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11, letterSpacing: 0.5)),
                        if (cart.itemsCashReceivedSum > 0 && cart.itemsCashReceivedSum.toStringAsFixed(0) != cart.cashGiven)
                          GestureDetector(
                            onTap: () => _setCash(cart.itemsCashReceivedSum.toStringAsFixed(0)),
                            child: Text('Use itemized: ${fmtCurrency(cart.itemsCashReceivedSum)}',
                                style: const TextStyle(color: kAccent, fontWeight: FontWeight.w600, fontSize: 11)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _cashController,
                      keyboardType: TextInputType.number,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      decoration: InputDecoration(
                        prefixText: '${AppConfig.currencySymbol} ',
                        hintText: fmtMoney(cart.total),
                        filled: true,
                        fillColor: Colors.white,
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: cart.cashShort ? Colors.red : kBorder, width: 2),
                        ),
                      ),
                      onChanged: _setCash,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      children: quickCashAmounts(cart.total).map((amt) {
                        return OutlinedButton(
                          onPressed: () => _setCash(amt.toStringAsFixed(0)),
                          style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6)),
                          child: Text(fmtCurrency(amt), style: const TextStyle(fontSize: 11.5)),
                        );
                      }).toList(),
                    ),
                    if (cart.cashGiven.isNotEmpty) ...[
                      const Divider(height: 24),
                      if (cart.cashShort)
                        Text('Short by ${fmtCurrency(cart.total - (double.tryParse(cart.cashGiven) ?? 0))}',
                            style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold))
                      else
                        MoneyRow(label: 'Change Due', value: fmtCurrency(cart.change), bold: true, color: Colors.green),
                    ],
                  ],
                ),
              ),
            ],
            if (cart.saleError != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.red.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10)),
                child: Text(cart.saleError!, style: const TextStyle(color: Colors.red)),
              ),
            ],
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: chargeDisabled ? null : _charge,
              child: cart.saving
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text('Charge ${fmtCurrency(cart.total)}'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentMethodTile extends StatelessWidget {
  final PaymentMethod method;
  const _PaymentMethodTile({required this.method});

  IconData get _icon => switch (method) {
        PaymentMethod.cash => Icons.payments_outlined,
        PaymentMethod.mobile => Icons.phone_iphone,
        PaymentMethod.card => Icons.credit_card,
      };

  @override
  Widget build(BuildContext context) {
    final selected = context.watch<CartProvider>().payment == method;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: GestureDetector(
        onTap: () => context.read<CartProvider>().setPayment(method),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: selected ? kAccent : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? kAccent : kBorder, width: 2),
          ),
          child: Column(
            children: [
              Icon(_icon, color: selected ? Colors.white : Colors.black87, size: 20),
              const SizedBox(height: 4),
              Text(method.label, style: TextStyle(color: selected ? Colors.white : Colors.black87, fontWeight: FontWeight.bold, fontSize: 11.5)),
            ],
          ),
        ),
      ),
    );
  }
}
