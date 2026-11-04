import { redirect } from "next/navigation";

/** Brands moved into Product settings. Keep this URL for bookmarks. */
export default function BrandsRedirect() {
  redirect("/inventory/products/settings?tab=brands");
}
