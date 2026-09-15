class ProductVariant {
  final String id;
  final String? sku;
  final Map<String, String> attributes;
  final double price;
  final int stock;

  ProductVariant({
    required this.id,
    required this.sku,
    required this.attributes,
    required this.price,
    required this.stock,
  });

  factory ProductVariant.fromJson(Map<String, dynamic> json) {
    return ProductVariant(
      id: json['id'] as String,
      sku: json['sku'] as String?,
      attributes: Map<String, String>.from(
        (json['attributes'] as Map?)?.map((k, v) => MapEntry(k.toString(), v.toString())) ?? {},
      ),
      price: (json['price'] as num).toDouble(),
      stock: (json['stock'] as num).toInt(),
    );
  }

  String get label => attributes.entries.map((e) => '${e.key}: ${e.value}').join(' · ');
}

class Product {
  final String id;
  final String name;
  final String? sku;
  final String? imageUrl;
  final double price;
  final int stock;
  final bool hasVariants;
  final String categoryName;
  final List<ProductVariant> variants;

  Product({
    required this.id,
    required this.name,
    required this.sku,
    required this.imageUrl,
    required this.price,
    required this.stock,
    required this.hasVariants,
    required this.categoryName,
    required this.variants,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    final variantsJson = json['variants'] as List<dynamic>? ?? [];
    return Product(
      id: json['id'] as String,
      name: json['name'] as String,
      sku: json['sku'] as String?,
      imageUrl: json['image_url'] as String?,
      price: (json['price'] as num).toDouble(),
      stock: (json['stock'] as num).toInt(),
      hasVariants: json['has_variants'] as bool? ?? false,
      categoryName: (json['category'] as Map<String, dynamic>?)?['name'] as String? ?? 'Uncategorized',
      variants: variantsJson.map((v) => ProductVariant.fromJson(v as Map<String, dynamic>)).toList(),
    );
  }

  bool get isOutOfStock => !hasVariants && stock <= 0;
}
