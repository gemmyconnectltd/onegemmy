import { redirect } from "next/navigation";

/** Serial registry lives under the Stock workspace. */
export default function SerialsRedirect() {
  redirect("/inventory/stock?tab=serials");
}
