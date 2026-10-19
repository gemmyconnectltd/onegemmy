export type ReceiptPaper = "58mm" | "80mm" | "A4";

/** A separate document guarantees that the POS, modal and cart cannot enter the print tree. */
export async function printReceipt(source: HTMLElement, paper: ReceiptPaper): Promise<void> {
  const frame = document.createElement("iframe");
  frame.title = "Printable receipt";
  frame.dataset.receiptPrintFrame = "true";
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", border: "0", width: paper === "A4" ? "186mm" : `${Number.parseInt(paper) - 4}mm`, height: "1000px" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); throw new Error("The receipt print window could not be opened."); }
  try {
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title></head><body></body></html>');
    doc.close();
    doc.title = "Receipt";
    const style = doc.createElement("style");
    style.textContent = `
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:black}
      body{font:12px/1.4 Arial,sans-serif;width:${paper === "A4" ? "186mm" : `${Number.parseInt(paper) - 4}mm`}}
      .pos-receipt{width:100%;overflow:visible;height:auto;padding:2mm}
      h1{font-size:16px;margin:3px 0}h2,p{margin:3px 0}small{font-size:10px}
      .receipt-heading{text-align:center;border-bottom:1px dashed gray;padding-bottom:8px;margin-bottom:8px}
      .receipt-logo{display:block;margin:0 auto 6px;max-width:30mm;max-height:16mm;object-fit:contain}
      table{width:100%;border-collapse:collapse;table-layout:fixed}th{font-size:10px;text-align:left;border-bottom:1px solid gray}
      td,th{padding:5px 2px;vertical-align:top}th:last-child,td:last-child{width:31%;text-align:right}
      .receipt-item-name{overflow-wrap:anywhere;white-space:normal}.receipt-meta{font-size:10px;color:#333}
      .receipt-totals{border-top:1px dashed gray;padding-top:6px;margin-top:6px}
      .receipt-row{display:flex;justify-content:space-between;gap:8px;margin:3px 0;overflow-wrap:anywhere}
      .receipt-row strong{text-align:right}.receipt-grand{font-size:15px;font-weight:bold;border-top:1px solid gray;padding-top:5px}
      .receipt-footer{text-align:center;margin-top:12px;font-size:10px}tr{break-inside:avoid}thead{display:table-header-group}
      @media print{html,body,.pos-receipt{overflow:visible!important;height:auto!important;max-height:none!important}}
    `;
    doc.head.appendChild(style);
    doc.body.appendChild(source.cloneNode(true));
    await Promise.all(Array.from(doc.images).map(image => image.complete ? Promise.resolve() : Promise.race([
      new Promise<void>(resolve => { image.onload = () => resolve(); image.onerror = () => resolve(); }),
      new Promise<void>(resolve => setTimeout(resolve, 3000)),
    ])));
    await doc.fonts.ready;
    const width = paper === "A4" ? 210 : Number.parseInt(paper);
    const height = paper === "A4" ? 297 : Math.max(45, Math.min(5000, Math.ceil(doc.body.scrollHeight * 25.4 / 96) + 6));
    style.textContent += `\n@page{size:${width}mm ${height}mm;margin:${paper === "A4" ? 12 : 2}mm}`;
    win.addEventListener("afterprint", () => frame.remove(), { once: true });
    // Some browsers do not fire afterprint; leave enough time for an open print dialog.
    setTimeout(() => frame.remove(), 300000);
    win.focus();
    win.print();
  } catch (error) { frame.remove(); throw error; }
}
