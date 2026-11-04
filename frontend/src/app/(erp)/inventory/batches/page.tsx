import { redirect } from "next/navigation";

/** Batches live under the Stock workspace. */
export default function BatchesRedirect() {
  redirect("/inventory/stock?tab=batches");
}