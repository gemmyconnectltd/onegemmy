// Shared plan data for the marketing site (homepage teaser + the dedicated
// /pricing page). No numeric prices here on purpose — pricing isn't finalized
// / is quote-based today, so we show what's actually true (feature scope per
// tier) rather than fabricating figures. Keep this the single source so the
// homepage and /pricing never drift out of sync.

export interface Plan {
  title: string;
  subtitle: string;
  featured: boolean;
  features: string[];
}

export const plans: Plan[] = [
  {
    title: "Free",
    subtitle: "Essential tools for single-location businesses",
    featured: false,
    features: ["Core dashboard", "Up to 2 users", "Core business modules", "No credit card required"],
  },
  {
    title: "Starter",
    subtitle: "For growing teams ready to scale operations",
    featured: false,
    features: ["All Free features", "Up to 10 users", "Inventory & sales management"],
  },
  {
    title: "Professional",
    subtitle: "Full platform access for scaling businesses",
    featured: true,
    features: ["All Starter features", "Unlimited users", "HR & accounting suite"],
  },
  {
    title: "Enterprise",
    subtitle: "Custom deployment for multi-branch operations",
    featured: false,
    features: ["All Professional features", "Custom integrations", "Priority support"],
  },
];
