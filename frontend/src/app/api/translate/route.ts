import { NextRequest, NextResponse } from "next/server";

// Uses Google Translate's free (unofficial) endpoint — no API key needed
export async function POST(req: NextRequest) {
  const { texts, targetLang } = await req.json() as { texts: string[]; targetLang: string };

  if (!texts?.length || !targetLang) {
    return NextResponse.json({ error: "Missing texts or targetLang" }, { status: 400 });
  }

  // Batch all texts into one request using \n separator
  const joined = texts.join("\n");
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(joined)}`;

  const res = await fetch(url);
  if (!res.ok) return NextResponse.json({ error: "Translation failed" }, { status: 502 });

  const data = await res.json();

  // Google returns nested arrays — flatten all translated segments
  const translated: string[] = (data[0] as [string, string][])
    .map((segment) => segment[0])
    .join("")
    .split("\n");

  return NextResponse.json({ translated });
}
