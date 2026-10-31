import { redirect } from "next/navigation";

// The crm overview now lives under Reports; this module opens on its first working page.
export default function CrmHome() {
  redirect("/crm/contacts");
}
