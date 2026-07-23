export const siteConfig = {
  name: "OneGemmy",
  description: "All-in-one business management platform by Gemmy Connect Ltd",
  url: "https://onegemmy.com",
  company: "Gemmy Connect Ltd",
  brand: {
    primary: "#1E3A5F",
    primaryLight: "#2D5A8E",
    primaryDark: "#0F1D33",
    secondary: "#0EA5E9",
    accent: "#10B981",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
  },
  links: {
    github: "https://github.com/gemmyconnectltd/onegemmy",
    twitter: "#",
    linkedin: "#",
  },
};

export const navigation = {
  main: [
    { name: "Features", href: "#features" },
    { name: "Modules", href: "#modules" },
    { name: "Pricing", href: "#pricing" },
    { name: "About", href: "#about" },
  ],
  auth: [
    { name: "Sign In", href: "/login" },
    { name: "Get Started", href: "/register" },
  ],
  product: [
    { name: "Features", href: "#features" },
    { name: "Modules", href: "#modules" },
    { name: "Pricing", href: "#pricing" },
    { name: "Documentation", href: "/docs" },
  ],
  company: [
    { name: "About Us", href: "#about" },
    { name: "Contact", href: "/contact" },
    { name: "Careers", href: "/careers" },
    { name: "Blog", href: "/blog" },
  ],
  legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
    { name: "Security", href: "/security" },
  ],
};
