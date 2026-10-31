import { redirect } from "next/navigation";

// The manufacturing overview now lives under Reports; this module opens on its first working page.
export default function ManufacturingHome() {
  redirect("/manufacturing/work-orders");
}
