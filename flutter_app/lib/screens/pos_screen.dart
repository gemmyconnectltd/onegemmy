import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../models/product.dart';
import '../services/product_service.dart';
import '../state/auth_provider.dart';
import '../state/cart_provider.dart';
import '../theme.dart';
import '../utils/format.dart';
import 'cart_screen.dart';

class PosScreen extends StatefulWidget {
  const PosScreen({super.key});

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  late final ProductService _productService;
  List<Product> _products = [];
  bool _loading = true;
  String? _error;
  String _search = '';
  String _category = 'All';

  @override
  void initState() {
    super.initState();
    _productService = ProductService(context.read<AuthProvider>().client);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final products = await _productService.listProducts();
      setState(() {
        _products = products;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Could not load products. Pull down to retry.';
        _loading = false;
      });
    }
  }

  List<String> get _categories {
    final set = <String>{'All'};
    for (final p in _products) {
      set.add(p.categoryName);
    }
    return set.toList();
  }

  List<Product> get _filtered {
    return _products.where((p) {
      final matchesCategory = _category == 'All' || p.categoryName == _category;
      final q = _search.toLowerCase();
      final matchesSearch = q.isEmpty || p.name.toLowerCase().contains(q) || (p.sku ?? '').toLowerCase().contains(q);
      return matchesCategory && matchesSearch;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Point of Sale'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () async {
              await context.read<AuthProvider>().logout();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search products or SKU…',
                prefixIcon: Icon(Icons.search, size: 20),
              ),
              onChanged: (v) => setState(() => _search = v),
            ),
          ),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: _categories.map((c) {
                final selected = c == _category;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(c),
                    selected: selected,
                    onSelected: (_) => setState(() => _category = c),
                    selectedColor: kAccent,
                    labelStyle: TextStyle(color: selected ? Colors.white : Colors.black87, fontWeight: FontWeight.w600),
                    backgroundColor: kSurface,
                    side: BorderSide(color: selected ? kAccent : kBorder),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(child: _buildBody()),
        ],
      ),
      bottomNavigationBar: cart.items.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CartScreen())),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(8)),
                        child: Text('${cart.totalItems}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ),
                      const SizedBox(width: 10),
                      const Text('View cart', style: TextStyle(fontWeight: FontWeight.bold)),
                      const Spacer(),
                      Text('${AppConfig.currencySymbol} ${fmtMoney(cart.total)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),
            ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }
    final products = _filtered;
    if (products.isEmpty) {
      return const Center(child: Text('No products found', style: TextStyle(color: Colors.black54)));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: GridView.builder(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 0.72,
        ),
        itemCount: products.length,
        itemBuilder: (context, i) => _ProductCard(product: products[i]),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  final Product product;
  const _ProductCard({required this.product});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    final inCartQty = cart.items.where((i) => i.productId == product.id && i.variantId == null).fold<int>(0, (s, i) => s + i.qty);
    final outOfStock = product.isOutOfStock;

    return GestureDetector(
      onTap: outOfStock
          ? null
          : () {
              if (product.hasVariants && product.variants.isNotEmpty) {
                _showVariantPicker(context, product);
              } else {
                context.read<CartProvider>().addProduct(product);
              }
            },
      child: Opacity(
        opacity: outOfStock ? 0.45 : 1,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: inCartQty > 0 ? kAccent : kBorder, width: inCartQty > 0 ? 2 : 1),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    product.imageUrl != null
                        ? Image.network(product.imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => _placeholder())
                        : _placeholder(),
                    if (inCartQty > 0)
                      Positioned(
                        top: 6,
                        right: 6,
                        child: Container(
                          width: 22,
                          height: 22,
                          alignment: Alignment.center,
                          decoration: const BoxDecoration(color: kAccent, shape: BoxShape.circle),
                          child: Text('$inCartQty', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                        ),
                      ),
                    if (outOfStock)
                      Positioned.fill(
                        child: Container(
                          color: Colors.black.withValues(alpha: 0.35),
                          alignment: Alignment.center,
                          child: const Text('Out of stock', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
                    const SizedBox(height: 3),
                    Text('${AppConfig.currencySymbol} ${fmtMoney(product.price)}', style: const TextStyle(color: kAccent, fontWeight: FontWeight.bold, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _placeholder() => Container(
        color: kSurface,
        alignment: Alignment.center,
        child: const Icon(Icons.inventory_2_outlined, color: Colors.black26, size: 28),
      );

  void _showVariantPicker(BuildContext context, Product product) {
    final cart = context.read<CartProvider>();
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(product.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 12),
              ...product.variants.map((v) {
                final out = v.stock <= 0;
                return ListTile(
                  enabled: !out,
                  title: Text(v.label),
                  subtitle: Text(out ? 'Out of stock' : '${v.stock} left'),
                  trailing: Text('${AppConfig.currencySymbol} ${fmtMoney(v.price)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                  onTap: out
                      ? null
                      : () {
                          cart.addVariant(product, v);
                          Navigator.pop(ctx);
                        },
                );
              }),
            ],
          ),
        ),
      ),
    );
  }
}
