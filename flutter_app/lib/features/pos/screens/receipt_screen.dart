import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:onegemmy_pos/core/config.dart';
import 'package:onegemmy_pos/core/theme.dart';
import 'package:onegemmy_pos/core/utils/format.dart';
import 'package:onegemmy_pos/features/pos/models/sale_result.dart';
import 'package:onegemmy_pos/features/pos/providers/cart_provider.dart';

import 'pos_screen.dart';

class ReceiptScreen extends StatelessWidget {
  const ReceiptScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final sale = context.watch<CartProvider>().completedSale;
    if (sale == null) {
      return const Scaffold(body: Center(child: Text('No sale to show')));
    }

    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: false, title: const Text('Receipt')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle),
                child: const Icon(Icons.check, color: Colors.white, size: 32),
              ),
              const SizedBox(height: 14),
              const Text('Payment received', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
              Text(sale.orderNumber, style: const TextStyle(color: Colors.black45)),
              const SizedBox(height: 20),
              _dashedDivider(),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('ITEMS PURCHASED', style: TextStyle(fontSize: 10.5, letterSpacing: 0.5, color: Colors.black45, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 8),
              ...sale.items.map((i) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text('${i.name}\n${i.qty} × ${AppConfig.currencySymbol} ${fmtMoney(i.price)}',
                              style: const TextStyle(fontSize: 12.5)),
                        ),
                        Text('${AppConfig.currencySymbol} ${fmtMoney(i.lineTotal)}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      ],
                    ),
                  )),
              const SizedBox(height: 12),
              const Divider(),
              _row('Subtotal', fmtMoney(sale.subtotal)),
              _row('VAT (18%)', fmtMoney(sale.tax)),
              const SizedBox(height: 6),
              _row('Total', fmtMoney(sale.total), bold: true),
              const SizedBox(height: 6),
              _row('Paid via', sale.payment.label),
              if (sale.payment == PaymentMethod.cash && sale.cashGiven.isNotEmpty) _row('Change', fmtMoney(sale.change)),
              const SizedBox(height: 20),
              const Text('Thank you for your purchase!', style: TextStyle(color: Colors.black45, fontStyle: FontStyle.italic)),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  context.read<CartProvider>().startNewSale();
                  Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const PosScreen()), (route) => false);
                },
                child: const Text('New sale'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) {
    final style = TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.normal, fontSize: bold ? 15 : 13);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style.copyWith(color: bold ? Colors.black : Colors.black54)),
          Text(value.contains('%') || label == 'Paid via' ? value : '${AppConfig.currencySymbol} $value', style: style),
        ],
      ),
    );
  }

  Widget _dashedDivider() {
    return SizedBox(
      height: 1,
      child: LayoutBuilder(builder: (context, constraints) {
        final count = (constraints.maxWidth / 8).floor();
        return Row(
          children: List.generate(count, (_) => const Expanded(child: DecoratedBox(decoration: BoxDecoration(color: kBorder)))).expand((w) => [w, const SizedBox(width: 4)]).toList(),
        );
      }),
    );
  }
}
