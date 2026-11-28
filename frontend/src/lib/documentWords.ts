/** What a sale's documents are called (mirrors backend app/modules/sales/service/document_words.py). The title always matches
 *  the number's prefix and one sale has one number on every document:
 *  INV- → "INVOICE", "Invoice no.", "Invoice date"; ORD- (sales completed at the POS, and older sales) → "ORDER", "Order no.",
 *  "Order date"; SO- (saved before it was completed) → "SALES ORDER",
 *  "Sales order no.", "Order date"; the till receipt → "RECEIPT", "Receipt for invoice INV-0017". */
export function saleDocument(number: string): { title: "Invoice" | "Order" | "Sales order"; dateLabel: string } {
  const n = (number ?? "").toUpperCase();
  if (n.startsWith("SO-")) return { title: "Sales order", dateLabel: "Order date" };
  if (n.startsWith("ORD-")) return { title: "Order", dateLabel: "Order date" };
  return { title: "Invoice", dateLabel: "Invoice date" };
}

export const receiptFor = (number: string) => `Receipt for ${saleDocument(number).title.toLowerCase()} ${number}`;

/** "Invoice INV-0017.pdf", "Receipt INV-0017.pdf", "Sales order SO-0012.pdf". */
export const documentFileName = (title: string, number: string) => `${title} ${number.replace(/[\\/:*?"<>|]+/g, "-")}.pdf`;
