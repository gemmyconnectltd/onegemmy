// The import engine's pure parts: recognising a client's own column headings, finding the heading row, grouping
// problems across rows and spotting rows repeated inside the file. No imports, so it can be tested on its own.

/** A field PESAA imports, as the review table and the column matcher see it. */
export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  align?: "left" | "right";
  /** Other headings that mean this field in clients' own files ("Buying Price" for cost). */
  aliases?: string[];
  /** Holds an amount or quantity: missing values can be filled with 0 in one action. */
  numeric?: boolean;
  /** Two rows in the same file must not share this value (SKU, email). */
  unique?: boolean;
}

/** How a file column was matched to a field: by its exact name, by a likely name (to check), by Pesaa AI (to check),
 *  by the person, or not at all. */
export type MatchConfidence = "exact" | "likely" | "ai" | "manual" | "none";
export interface ColumnMatch { field: string; confidence: MatchConfidence }

export const norm = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Headings traders commonly use, per field key. A heading may mean different fields in different imports ("Ref"); the
 *  import's own field order breaks ties. */
const SYNONYMS: Record<string, string[]> = {
  name: ["productname", "itemname", "item", "product", "itemdescription", "productdescription", "description", "designation", "article", "goods",
    "customername", "clientname", "client", "fullname", "names", "suppliername", "vendor", "vendorname", "company", "companyname", "businessname", "accountname"],
  sku: ["itemcode", "productcode", "code", "ref", "reference", "partnumber", "partno", "articlecode", "skucode", "itemno", "itemnumber", "productid", "itemid", "stockcode"],
  barcode: ["ean", "upc", "gtin", "ean13", "barcodenumber", "barcodeno"],
  cost: ["buyingprice", "costprice", "purchaseprice", "unitcost", "buyprice", "buying", "purchasecost", "landedcost", "prixdachat", "bp", "costperunit"],
  price: ["sellingprice", "retailprice", "saleprice", "salesprice", "sellprice", "unitprice", "mrp", "retail", "prixdevente", "sp", "priceperunit"],
  stock: ["qty", "quantity", "stockquantity", "onhand", "qtyonhand", "instock", "stocklevel", "openingstock", "available", "quantityinstock", "stockqty", "currentstock", "units", "pcs"],
  minstock: ["minimumstock", "reorderlevel", "reorderpoint", "minqty", "minimumquantity", "minlevel", "safetystock", "alertquantity", "lowstock", "minimum", "min", "reorderqty"],
  category: ["productgroup", "itemgroup", "group", "department", "family", "productcategory", "itemcategory"],
  subcategory: ["subgroup", "subcat", "subfamily"],
  brand: ["make", "manufacturer", "brandname", "marque"],
  unit: ["uom", "unitofmeasure", "measure", "unitname", "units"],
  batchnumber: ["batch", "lot", "lotnumber", "lotno", "batchno"],
  expirydate: ["expiry", "expiration", "expirationdate", "exp", "expdate", "bestbefore", "useby"],
  manufactureddate: ["mfg", "mfgdate", "manufacturedate", "manufacturingdate", "productiondate", "mfd"],
  imageurl: ["image", "picture", "photo", "pictureurl", "imagelink", "photourl", "picturelink", "img"],
  email: ["emailaddress", "mail", "emailid"],
  phone: ["phonenumber", "telephone", "tel", "mobile", "mobilenumber", "cell", "cellphone", "contact", "contactnumber", "msisdn", "whatsapp", "phoneno", "telno"],
  address: ["location", "city", "district", "town", "physicaladdress", "street", "area"],
  customertype: ["type", "clienttype", "segment", "customercategory"],
  tin: ["taxid", "vatnumber", "tinnumber", "taxnumber", "vatno", "tinno"],
  orderreference: ["invoice", "invoiceno", "invoicenumber", "receipt", "receiptno", "receiptnumber", "ref", "reference", "salesref", "saleref", "orderno", "ordernumber", "salenumber"],
  customer: ["client", "customername", "buyer", "clientname", "soldto"],
  orderedat: ["date", "saledate", "orderdate", "invoicedate", "transactiondate", "salesdate"],
  paymentmethod: ["payment", "paymentmode", "paidby", "method", "paymenttype", "modeofpayment"],
  notes: ["note", "remarks", "remark", "comment", "comments", "memo"],
  quantity: ["qty", "units", "pcs", "pieces", "count", "qtysold"],
  unitprice: ["price", "rate", "sellingprice", "priceperunit", "unitcost"],
  title: ["description", "expense", "item", "details", "particulars", "narration", "purpose", "expensename"],
  amount: ["total", "value", "cost", "sum", "amountpaid", "totalamount", "amountrwf"],
  expensedate: ["date", "paiddate", "datepaid", "transactiondate", "paymentdate"],
  code: ["accountcode", "accountno", "accountnumber", "glcode", "ledgercode"],
  type: ["accounttype", "class", "accountclass"],
  normalbalance: ["drcr", "balance", "nature", "side"],
};

/** How well a heading names a field: 100 its own name, 90 a known synonym, 60 a likely partial match, 0 none. */
export function headingScore(heading: string, field: ImportField): number {
  const h = norm(heading);
  if (!h) return 0;
  const own = [norm(field.key), norm(field.label)];
  if (own.includes(h)) return 100;
  const known = [...(SYNONYMS[field.key] ?? []), ...(field.aliases ?? []).map(norm)];
  if (known.includes(h)) return 90;
  // "Selling Price (RWF)" or "Qty in stock": a known name inside a longer heading. Short names (min, exp) must match exactly.
  // A heading that is most of a known name also counts ("Qty on han"), but "Date" alone is not "Expiry date".
  if ([...own, ...known].some((n) => n.length >= 4 && (h.includes(n) || (h.length >= 5 && h.length >= n.length * 0.6 && n.includes(h))))) return 60;
  return 0;
}

/** The best field for each heading, each field used once. Strongest matches win first, then the heading and field order. */
export function autoMap(headings: string[], fields: ImportField[]): ColumnMatch[] {
  const pairs: { h: number; f: number; score: number }[] = [];
  headings.forEach((heading, h) => fields.forEach((field, f) => {
    const score = headingScore(heading, field);
    if (score >= 60) pairs.push({ h, f, score });
  }));
  pairs.sort((a, b) => b.score - a.score || a.h - b.h || a.f - b.f);
  const out: ColumnMatch[] = headings.map(() => ({ field: "", confidence: "none" }));
  const taken = new Set<number>();
  for (const { h, f, score } of pairs) {
    if (out[h].field || taken.has(f)) continue;
    out[h] = { field: fields[f].key, confidence: score >= 90 ? "exact" : "likely" };
    taken.add(f);
  }
  return out;
}

/** The row holding the headings, among the first ten: files often start with a title, a date or the shop's name.
 *  The row that names the most fields wins; with none recognised, the first row. */
export function detectHeaderRow(grid: string[][], fields: ImportField[]): number {
  let best = 0, bestScore = 0;
  for (let i = 0; i < Math.min(10, grid.length - 1); i++) {
    const cells = grid[i].map((c) => String(c ?? "").trim()).filter(Boolean);
    const matches = autoMap(grid[i], fields);
    const score = matches.reduce((sum, m) => sum + (m.confidence === "exact" ? 3 : m.confidence === "likely" ? 1 : 0), 0)
      + cells.filter((c) => !/^[-\d.,\s]+$/.test(c)).length * 0.01;
    if (score > bestScore + 0.5) { best = i; bestScore = score; }
  }
  return best;
}

/** A row's values by field key, from the file's columns as matched, with the person's edits on top. */
export function rowValues(source: string[], mapping: ColumnMatch[], edits?: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {};
  mapping.forEach((m, i) => { if (m.field) values[m.field] = String(source[i] ?? "").trim(); });
  return edits ? { ...values, ...edits } : values;
}

/** Rows that repeat an earlier row's unique value in the same file: {row id: "Same SKU as row 4"}. Blank values never clash. */
export function inFileDuplicates(rows: { id: number; label: number; values: Record<string, string> }[], fields: ImportField[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const field of fields.filter((f) => f.unique)) {
    const first = new Map<string, number>();
    for (const row of rows) {
      const value = norm(row.values[field.key]);
      if (!value) continue;
      const seen = first.get(value);
      if (seen === undefined) first.set(value, row.label);
      else if (!out.has(row.id)) out.set(row.id, `Same ${field.label} as row ${seen}`);
    }
  }
  return out;
}

export interface IssueLike { column?: string; message: string; summary?: string; level?: "error" | "warning" }

/** One problem shared by many rows ("missing Min Stock" on 91 rows), so it is shown and fixed once. Errors first, then most rows. */
export interface IssueGroup { key: string; column?: string; label: string; level: "error" | "warning"; ids: number[]; example: string }

export function groupIssues(rows: { id: number; issues: IssueLike[] }[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const row of rows) {
    for (const issue of row.issues) {
      const level = issue.level ?? "error";
      const label = issue.summary ?? issue.message;
      const key = `${level}|${issue.column ?? ""}|${label}`;
      const group = groups.get(key) ?? { key, column: issue.column, label, level, ids: [], example: issue.message };
      if (group.ids.at(-1) !== row.id) group.ids.push(row.id);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1) || b.ids.length - a.ids.length || a.label.localeCompare(b.label));
}

/** "91 products are missing Min Stock" — a group's sentence for people, not a code. */
export function groupSentence(group: IssueGroup, noun: string): string {
  const n = group.ids.length;
  const subject = `${n} ${noun}${n === 1 ? "" : "s"}`;
  const missing = /^missing (.+)$/i.exec(group.label);
  if (missing) return `${subject} ${n === 1 ? "is" : "are"} missing ${missing[1]}`;
  const invalid = /^(invalid|negative) (.+)$/i.exec(group.label);
  if (invalid) return `${subject}: ${invalid[1] === "negative" ? "negative" : "unreadable"} ${invalid[2]}`;
  return `${subject}: ${group.label}`;
}
