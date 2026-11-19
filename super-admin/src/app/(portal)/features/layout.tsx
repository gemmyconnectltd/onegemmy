import type { ReactNode } from "react";
import { SectionLayout } from "@/components/ui/SecondaryNav";
import { ProductControlNav } from "@/components/product-control/ProductControlNav";

// Product control shell: modules, their parts, per-business access and the change log share one sidebar.
// Route protection comes from the (portal) layout above; the backend re-checks every call.
export default function ProductControlLayout({ children }: { children: ReactNode }) {
  return <SectionLayout nav={<ProductControlNav />}>{children}</SectionLayout>;
}
