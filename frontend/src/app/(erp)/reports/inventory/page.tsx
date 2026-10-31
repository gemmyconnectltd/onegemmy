import { redirect } from "next/navigation";

// Stock reports are part of Operations now.
export default function Page() { redirect("/reports/operations?view=stock"); }
