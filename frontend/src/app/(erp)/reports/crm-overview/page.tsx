import { redirect } from "next/navigation";

// Working screens (add, edit, restock) are not reports. This address now opens the matching read-only report.
export default function Page() { redirect("/crm/contacts"); }
