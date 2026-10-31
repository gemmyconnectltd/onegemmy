import { redirect } from "next/navigation";

// Finance reports are one page now.
export default function Page() { redirect("/reports/finance"); }
