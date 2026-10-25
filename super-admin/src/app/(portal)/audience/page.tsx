import { redirect } from "next/navigation";

// Audience moved into the Marketing Hub; keep old links and bookmarks working.
export default function AudienceRedirect() {
  redirect("/marketing/audience");
}
