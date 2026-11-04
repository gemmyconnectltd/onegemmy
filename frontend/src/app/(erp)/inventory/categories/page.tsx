import { redirect } from "next/navigation";

/** Categories moved into Product settings. Keep this URL for bookmarks. */
export default function CategoriesRedirect() {
  redirect("/inventory/products/settings?tab=categories");
}
