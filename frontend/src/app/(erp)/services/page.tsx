import { redirect } from "next/navigation";

// The services overview now lives under Reports; this module opens on its first working page.
export default function ServicesHome() {
  redirect("/services/appointments");
}
