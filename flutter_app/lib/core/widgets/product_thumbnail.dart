import 'package:flutter/material.dart';

import 'package:pesaa_pos/core/theme.dart';

/// A product image with a consistent rounded frame, falling back to a
/// placeholder icon when there's no image or the network load fails.
/// Used anywhere a product thumbnail appears (product grid, cart rows, …)
/// so that image-loading/fallback logic is written exactly once.
///
/// Pass [size] for a fixed square thumbnail (cart rows); omit it to have
/// the image fill whatever space its parent gives it (e.g. inside an
/// Expanded/Stack in a product grid card).
class ProductThumbnail extends StatelessWidget {
  final String? imageUrl;
  final double? size;
  final double borderRadius;
  final IconData placeholderIcon;
  final double? iconSize;

  const ProductThumbnail({
    super.key,
    required this.imageUrl,
    this.size,
    this.borderRadius = 10,
    this.placeholderIcon = Icons.inventory_2_outlined,
    this.iconSize,
  });

  @override
  Widget build(BuildContext context) {
    final content = imageUrl != null
        ? Image.network(imageUrl!, fit: BoxFit.cover, errorBuilder: (_, _, _) => _placeholder())
        : _placeholder();

    if (size == null) {
      return ClipRRect(borderRadius: BorderRadius.circular(borderRadius), child: content);
    }
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: kSurface, borderRadius: BorderRadius.circular(borderRadius)),
      clipBehavior: Clip.antiAlias,
      child: content,
    );
  }

  Widget _placeholder() => Container(
        color: kSurface,
        alignment: Alignment.center,
        child: Icon(placeholderIcon, color: Colors.black26, size: iconSize ?? (size != null ? size! * 0.5 : 28)),
      );
}
