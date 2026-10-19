<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Shared UI contract

Before editing UI, read `../docs/DESIGN_SYSTEM.md` and the root `../AGENTS.md`. This app follows the same mandatory design-system rules, preserves existing shared components and uses the centralized tokens. Run `npm run design:check` and relevant validation.

## Desktop POS receipts

- Build completed-sale confirmations from `orderToSale` on the persisted API response, including its reference, payment totals and timestamp.
- Keep the confirmation compact. Use `ReceiptDocument` for full viewing and `lib/pos/printReceipt.ts` for isolated receipt-only printing (58mm/80mm/A4). Never call the POS page's `window.print()` or print the application DOM.
- Keep the existing server-generated invoice PDF download. Never replace it with a screenshot.
- Keep the Charge action visible while cart/payment content scrolls, and preserve the synchronous in-flight submission guard.
