import { redirect } from "next/navigation";

/** Units moved into Product settings. Keep this URL for bookmarks. */
export default function UnitsRedirect() {
  redirect("/inventory/products/settings?tab=units");
}
