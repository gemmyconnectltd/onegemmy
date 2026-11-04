import { redirect } from "next/navigation";

/**
 * Variants are managed from product details and the product variants drawer.
 * Keep this URL so old bookmarks and deep links land on the products list.
 */
export default function VariantsRedirect() {
  redirect("/inventory/products");
}
