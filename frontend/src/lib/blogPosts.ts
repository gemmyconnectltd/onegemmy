import type { LucideIcon } from "lucide-react";
import { Package, Calculator, Layers3, Wallet } from "lucide-react";

export interface BlogPost {
  slug: string;
  image: string;
  icon: LucideIcon;
  category: string;
  readTime: string;
  title: string;
  excerpt: string;
  body: string[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "stock-count-vs-shelf",
    image: "/verticals/grocery.jpg",
    icon: Package,
    category: "Inventory",
    readTime: "4 min read",
    title: "Why your stock count and your shelf never agree — and how to fix it",
    excerpt: "If the number in your notebook and the number on the shelf are always a little off, the problem usually isn't theft or carelessness — it's timing.",
    body: [
      "If the number in your notebook and the number on the shelf are always a little off, the problem usually isn't theft or carelessness — it's timing. A sale gets rung up, but the stock count gets updated later, by hand, if at all. Every gap between the sale and the update is a chance for the two numbers to drift apart.",
      "The fix isn't stricter counting — it's removing the manual step. When a sale, a purchase receipt, or a return updates stock automatically, at the moment it happens, there's no window for drift to creep in. The count on the screen is the count on the shelf, because nothing else ever touches it.",
      "This is also why a return that doesn't put stock back is worse than no return process at all: it looks like the item vanished. A correct return has to restore inventory the same way a sale removes it — automatically, not as a follow-up task someone might forget.",
    ],
  },
  {
    slug: "vat-inclusive-vs-exclusive-pricing",
    image: "/verticals/electronics.jpg",
    icon: Calculator,
    category: "Accounting",
    readTime: "5 min read",
    title: "VAT-inclusive vs. VAT-exclusive pricing: what small shops get wrong",
    excerpt: "Most shop owners price things the way customers think about them — but the accounting side can quietly disagree, and that's where the trouble starts.",
    body: [
      "Most shop owners price things the way customers think about them: \"this costs 45,000.\" That price already includes VAT — it's VAT-inclusive. The tax isn't added on top at checkout; it's extracted from the price you already charged.",
      "The mistake happens when the accounting side treats that same price as VAT-exclusive and adds tax again — turning a 45,000 sale into a 51,864 charge that was never actually collected from anyone. The customer paid 45,000. The books should reflect exactly that, with the VAT portion (about 6,864 at 18%) recorded as tax collected, not tacked on afterward.",
      "The rule of thumb: decide once, for the whole business, whether your prices include tax or not — and make sure every screen, receipt, and report agrees. The moment one part of the system treats a price as inclusive and another treats it as exclusive, your revenue and your tax filings will quietly stop matching reality.",
    ],
  },
  {
    slug: "cost-of-three-different-apps",
    image: "/verticals/repairs.jpg",
    icon: Layers3,
    category: "Operations",
    readTime: "3 min read",
    title: "The real cost of running sales, stock, and books in three different apps",
    excerpt: "Separate tools for the register, the warehouse, and the accounts feel free — the real cost shows up later, in re-typing and in numbers that quietly stop matching.",
    body: [
      "Separate tools for the register, the warehouse, and the accounts feel free because each one is cheap or already familiar. The real cost shows up later, as the time spent re-entering the same sale three times, and the discrepancies that appear whenever one of those manual re-entries gets skipped or mistyped.",
      "Every hand-off between systems is a place for the story to change: a sale that reduced stock in one app might never have told the accounting app it happened at all. Multiply that by every sale, every day, and \"a few minutes of extra typing\" becomes a set of books nobody fully trusts.",
      "One system doesn't have to mean one giant, complicated tool. It means one place where a sale is a sale — it reduces the right stock, it appears in the right report, and it doesn't need anyone to tell the other two apps about it.",
    ],
  },
  {
    slug: "cash-mobile-money-card-bookkeeping",
    image: "/verticals/pharmacy.jpg",
    icon: Wallet,
    category: "Accounting",
    readTime: "4 min read",
    title: "Cash, mobile money, or card: what actually changes in your books",
    excerpt: "A sale is a sale, but where the money landed matters — treating every payment method the same is what makes your books stop meaning anything.",
    body: [
      "A sale is a sale, but where the money landed matters for your books. Cash in the drawer, money in a mobile wallet, and a card settlement into the bank are three different assets — and a bookkeeping system that records all of them as \"Accounts Receivable\" is quietly telling you that you're still owed money for a sale you were already paid for.",
      "Done correctly, a fully-paid cash sale increases Cash. A fully-paid mobile money sale increases the Mobile Money account. Only a sale where payment hasn't happened yet — an invoice, a tab, a delivery-on-credit — should touch Accounts Receivable.",
      "This distinction is what makes your Cash Flow statement and your bank reconciliation actually mean something. If every sale defaults to the same account regardless of how it was paid, those reports stop reflecting where your money really is.",
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
