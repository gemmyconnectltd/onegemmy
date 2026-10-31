import { redirect } from "next/navigation";

// The people list and its access view are one page now: People.
export default function AccessRedirect() {
  redirect("/settings/users");
}
