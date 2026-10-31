import { redirect } from "next/navigation";

// Sales analytics is part of Reports now.
export default function Page() { redirect("/reports/sales"); }
