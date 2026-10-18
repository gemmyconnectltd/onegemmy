// Safe rich text for templates and messages. Content is stored as plain Markdown-style text and turned into React
// elements here: there is no innerHTML anywhere, so pasted markup can never run. Only http(s) and mailto links are
// rendered as links.
import type { ReactNode } from "react";

export interface TemplateVariable {
  key: string;
  label: string;
  sample: string;
}

export const SUPPORTED_VARIABLES: TemplateVariable[] = [
  { key: "customer_name", label: "Customer name", sample: "Aline Uwase" },
  { key: "business_name", label: "Business name", sample: "Kigali Fresh Market" },
  { key: "plan_name", label: "Plan name", sample: "Professional" },
  { key: "support_agent", label: "Support agent", sample: "Grace Mukamana" },
  { key: "current_date", label: "Current date", sample: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) },
];

const KNOWN = new Set(SUPPORTED_VARIABLES.map((v) => v.key));
const VAR_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Variables used in a text that aren't in the supported list (shown as a warning in the editors). */
export function unknownVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) if (!KNOWN.has(m[1].toLowerCase())) out.add(m[1]);
  return [...out];
}

export function usedVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

/** Replace supported {{variables}} with sample values (unknown ones are left visible). */
export function fillVariables(text: string, values: Record<string, string> = {}): string {
  return text.replace(VAR_RE, (whole, key: string) => {
    const k = key.toLowerCase();
    if (values[k] !== undefined) return values[k];
    const v = SUPPORTED_VARIABLES.find((x) => x.key === k);
    return v ? v.sample : whole;
  });
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // bold, italic, link, leftover {{unknown}} variable
  const re = /(\*\*[^*]+\*\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\)|\{\{\s*[a-z0-9_]+\s*\}\})/gi;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) nodes.push(<strong key={k} className="font-semibold">{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith("_")) nodes.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    else if (tok.startsWith("[")) {
      const [, label, url] = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok) ?? [];
      if (url && SAFE_URL.test(url)) nodes.push(<a key={k} href={url} target="_blank" rel="noopener noreferrer" className="text-accent underline">{label}</a>);
      else nodes.push(label ?? tok);
    } else nodes.push(<span key={k} className="rounded bg-amber-500/15 px-1 text-amber-700 dark:text-amber-400" title="Unknown variable">{tok}</span>);
    last = idx + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Markdown-lite → React: paragraphs, **bold**, _italic_, [links](https://…), "- " and "1. " lists. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(<ul key={key++} className="my-1.5 list-disc space-y-0.5 pl-5">{items.map((t, n) => <li key={n}>{inline(t, `u${key}-${n}`)}</li>)}</ul>);
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(<ol key={key++} className="my-1.5 list-decimal space-y-0.5 pl-5">{items.map((t, n) => <li key={n}>{inline(t, `o${key}-${n}`)}</li>)}</ol>);
    } else if (line.trim() === "") {
      i++;
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={key++} className="my-1.5 first:mt-0 last:mb-0">{para.map((t, n) => <span key={n}>{n > 0 && <br />}{inline(t, `p${key}-${n}`)}</span>)}</p>);
    }
  }
  return <div className={className}>{blocks}</div>;
}

/** WhatsApp-style inline formatting: *bold*, _italic_, ~strike~ and line breaks. */
export function WhatsAppText({ text }: { text: string }) {
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  return (
    <>
      {text.split("\n").map((line, n) => {
        const parts: ReactNode[] = [];
        let last = 0;
        let i = 0;
        for (const m of line.matchAll(re)) {
          const idx = m.index ?? 0;
          if (idx > last) parts.push(line.slice(last, idx));
          const t = m[0];
          const k = `${n}-${i++}`;
          parts.push(t[0] === "*" ? <strong key={k}>{t.slice(1, -1)}</strong> : t[0] === "_" ? <em key={k}>{t.slice(1, -1)}</em> : <s key={k}>{t.slice(1, -1)}</s>);
          last = idx + t.length;
        }
        if (last < line.length) parts.push(line.slice(last));
        return <span key={n}>{n > 0 && <br />}{parts}</span>;
      })}
    </>
  );
}
