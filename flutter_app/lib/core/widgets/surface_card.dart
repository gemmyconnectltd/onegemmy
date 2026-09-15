import 'package:flutter/material.dart';

import 'package:onegemmy_pos/core/theme.dart';

/// The recurring "rounded, surface-tinted panel" container used for totals,
/// cash-received, and similar grouped-info blocks — one definition instead
/// of re-typing the same BoxDecoration in every screen that needs it.
class SurfaceCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double borderRadius;

  const SurfaceCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.borderRadius = 14,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(color: kSurface, borderRadius: BorderRadius.circular(borderRadius)),
      child: child,
    );
  }
}
