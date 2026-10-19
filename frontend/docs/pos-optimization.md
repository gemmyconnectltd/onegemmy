# Desktop POS optimization and receipt printing

The existing `/pos` workspace, API mutations and payment service remain in place. The catalog uses compact cards and a horizontal category row; the cart occupies a clamped 27% width on desktop. Its item list and payment details scroll independently while Charge stays visible. Smaller screens use the existing shared Drawer for checkout.

Completed-sale confirmations now use `orderToSale(created.data)`, preserving the saved order reference, timestamp, totals, paid amount, outstanding balance and change. A synchronous in-flight guard rejects repeated clicks before React can render the pending state. Cart quantities respect the loaded product/variant stock; backend validation remains authoritative. Held sales retain customer and payment context.

`ReceiptDocument` is the shared full receipt for viewing and printing. `printReceipt` clones only this article into a separate iframe document, with dedicated physical-page CSS for 58mm, 80mm and A4. It never prints the parent application. Thermal page height follows receipt content; long A4 receipts paginate with repeating table headers. The existing backend PDF endpoint remains the download source and produces its existing branded A4 invoice/payment document.

## Verification (2026-10-19)

- Frontend type check, changed-file ESLint, design-system validation and isolated production build passed.
- Node regression suite: persisted order/payment mapping and receipt document isolation for all three paper sizes, plus existing frontend tests.
- Chrome against the isolated production build, with API fixtures (not real payments): 1366×768 workspace, mobile checkout, barcode/SKU entry, variant selection, quantity caps, removal, held/resumed sales, cash/card/mobile selection, partial-credit required fields, double-click guard, failed-sale cart retention, confirmation, View Receipt and New Sale.
- Print output was captured from the real isolated receipt document and rendered as 58mm, 80mm and A4 PDFs. It contains the saved receipt reference and excludes navigation, catalog, cart, confirmation and buttons. The 58mm output was visually inspected.
- Backend payment/debt regression selection: 1 passed, 32 skipped because the local database was unavailable. No backend changes were made.

## Limits

Native printer dialogs and physical thermal printers were not exercised. Live persisted payment processing, inventory effects and the server PDF download were not revalidated while the backend was offline. Browser receipt tests used explicit synthetic fixtures; no mock data is shipped in production. Existing desktop POS exposes cash, card and mobile payment methods; it has no mixed-tender UI to validate. Desktop receipt-footer/fiscal/printer preference configuration is not exposed by the current tenant API, so this change does not invent fiscal identifiers or save a printer preference. Paper size is selected in the confirmation. Existing backend fiscal integrations are unchanged.
