# Building forms in PESAA

Use the shared kit. Do not hand-style inputs. The pieces, all in `frontend/src/components/ui/`:

| Need | Use |
|---|---|
| A labelled field | `Field` + `Input` / `Select` / `Textarea` (`Form.tsx`). Required marker and hint are built in. |
| A group of fields | `FormSection` (`variant="card"` on a page, `"plain"` in a drawer), `FormRow` for a full-width field (`FormKit.tsx`) |
| Money | `MoneyField` (typed as plain digits, currency decimals, string value, no floating point). Helpers in `lib/moneyInput.ts` |
| Files | `FileDropzone`: click or drag, type/size checks, list with Remove, existing files in edit mode |
| Pick a record from many | `SearchSelect` (async, keyboard, loading and empty states, positioned from the field so a table can't clip it) |
| Errors | `FormErrorSummary` at the top (takes focus), plus per-field messages. Never clear the form on failure |
| Buttons | `FormActions` (Cancel left of the primary, progress, double-submit blocked, `sticky` for long forms) |
| Reason before a consequential action | `ReasonDialog` |
| Confirm | `ConfirmDialog` / `useConfirmDialog` |
| A full page | `FormPage` (breadcrumb, title, optional summary beside the form) |

## Which container
- **1 to 5 fields** (add a category, a reason): a centred `Drawer side="center"`.
- **Quick create / edit in context** (customer, supplier): a `Drawer` (right). Full screen on phones is automatic. Keep it to what a person needs now; put advanced fields in a later section.
- **Long, detailed** (expense, product, purchase): sections in a `Drawer size="xl"` or a page with `FormPage`, with a summary panel.
- **Several lines** (purchase items, sale items): a line-item table with a card layout on phones (`TableScroll mobileLayout="cards"`).
- A multi-step wizard only for genuinely staged work (onboarding), never for an ordinary form.

## Rules
1. Controls come from `Form.tsx`. Heights, radius, focus and error styles are tokens in `design-system/components.css`; do not restyle per form.
2. Show only fields that apply. A conditional field is either shown and validated, or hidden and not required (Pay later hides the payment method).
3. Validate on the client for speed and on the server for truth. Show the server's message next to the form, keep the person's data.
4. Money is a string from input to API. Use `MoneyField`.
5. One primary action per form; it shows progress and cannot be pressed twice. Use `useRef` guards for multi-step submits (see `ExpenseEditor`).
6. Drawers already warn before discarding unsaved edits; do not add a second guard.
7. Labels are real `<label>`s (use `Field`). Do not rely on colour alone for errors.
8. Test at phone width and in dark mode.

Run `node scripts/form-inventory.mjs` to see which forms still use raw inputs.
