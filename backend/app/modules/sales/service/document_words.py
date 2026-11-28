"""What a sale's documents are called. The title always matches the number's prefix, and one sale has one number on every
document:

- INV- numbers are invoices: "INVOICE", "Invoice no. INV-0017", "Invoice date".
- ORD- numbers are orders (sales completed at the POS, and older sales): "ORDER", "Order no. ORD-0097", "Order date".
- SO- numbers are sales orders (saved before they were completed): "SALES ORDER", "Sales order no. SO-0012", "Order date".
- The till receipt is "RECEIPT", "Receipt for invoice INV-0017", on the same number.
"""
from app.core.filenames import _clean


def sale_document(number: str) -> tuple[str, str]:
    """(Title, date label) for the A4 document of the sale with this number."""
    n = (number or "").upper()
    if n.startswith("SO-"):
        return "Sales order", "Order date"
    if n.startswith("ORD-"):
        return "Order", "Order date"
    return "Invoice", "Invoice date"


def receipt_for(number: str) -> str:
    return f"Receipt for {sale_document(number)[0].lower()} {number}"


def file_name(title: str, number: str, ext: str = "pdf") -> str:
    """"Invoice INV-0017.pdf", "Receipt INV-0017.pdf", "Sales order SO-0012.pdf"."""
    return f"{title} {_clean(number) or 'document'}.{ext}"
