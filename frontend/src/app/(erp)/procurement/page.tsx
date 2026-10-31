import { redirect } from "next/navigation";

// The purchases overview now lives under Reports; this module opens on its first working page.
export default function ProcurementHome() {
  redirect("/procurement/requests");
}
