import { redirect } from "next/navigation";

// Stock reports live under Business reports → Stock.
export default function Page() { redirect("/reports/stock"); }
