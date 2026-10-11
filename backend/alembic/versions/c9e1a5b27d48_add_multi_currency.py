"""add multi-currency support

Revision ID: c9e1a5b27d48
Revises: a1c4e7d93b52
Create Date: 2026-10-07 12:00:00.000000

Makes the money domain currency-aware at the database level.

New tables
  * currencies          ISO 4217 master data (code, name, symbol, decimal places, active flag)
  * exchange_rates      append-only rate history; tenant_id NULL = platform-wide
  * platform_settings   PESAA-level key/value config (reporting_currency)

New columns (all NULLable, additive, no table rewrites)
  Orders, order payments, purchase orders, supplier bills, supplier payments, expenses, returns and
  ledger transactions gain `currency_code` (+ `exchange_rate` and `base_*` twins where they hold
  amounts). Document amounts stay in the document's own currency; `base_*` is the tenant base
  currency value at the rate frozen when the document became effective.

Backfill
  Every pre-existing row was recorded when the platform could only transact in the tenant's own
  currency, so it is stamped with THAT TENANT'S `currency` (not a blanket "RWF"), rate 1, and
  base_* = the original amount. Nothing is overwritten that already has a currency, tenants.currency
  is never touched, and rows are updated in bounded batches so hot tables are not locked for long.
  (A tenant with no currency recorded gets RWF, the model's own default and the only currency the
  platform ever transacted in before this change.)
  A NULL currency_code is still read as "tenant base, rate 1" by the application.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'c9e1a5b27d48'
down_revision: str | None = 'a1c4e7d93b52'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BATCH = 5000

CURRENCY_ROWS: list[tuple[str, str, str, int]] = [
    ('AFN', 'Afghan Afghani', '؋', 2),
    ('ALL', 'Albanian Lek', 'L', 2),
    ('DZD', 'Algerian Dinar', 'د.ج', 2),
    ('AOA', 'Angolan Kwanza', 'Kz', 2),
    ('ARS', 'Argentine Peso', '$', 2),
    ('AMD', 'Armenian Dram', '֏', 2),
    ('AWG', 'Aruban Florin', 'ƒ', 2),
    ('AUD', 'Australian Dollar', '$', 2),
    ('AZN', 'Azerbaijani Manat', '₼', 2),
    ('BSD', 'Bahamian Dollar', '$', 2),
    ('BHD', 'Bahraini Dinar', '.د.ب', 3),
    ('BDT', 'Bangladeshi Taka', '৳', 2),
    ('BBD', 'Barbadian Dollar', '$', 2),
    ('BYN', 'Belarusian Ruble', 'Br', 2),
    ('BZD', 'Belize Dollar', '$', 2),
    ('BMD', 'Bermudian Dollar', '$', 2),
    ('BTN', 'Bhutanese Ngultrum', 'Nu.', 2),
    ('BOB', 'Bolivian Boliviano', 'Bs.', 2),
    ('BAM', 'Bosnia and Herzegovina Convertible Mark', 'KM', 2),
    ('BWP', 'Botswana Pula', 'P', 2),
    ('BRL', 'Brazilian Real', 'R$', 2),
    ('BND', 'Brunei Dollar', '$', 2),
    ('BGN', 'Bulgarian Lev', 'лв', 2),
    ('MMK', 'Burmese Kyat', 'Ks', 2),
    ('BIF', 'Burundian Franc', 'Fr', 0),
    ('XPF', 'CFP Franc', '₣', 0),
    ('KHR', 'Cambodian Riel', '៛', 2),
    ('CAD', 'Canadian Dollar', '$', 2),
    ('CVE', 'Cape Verdean Escudo', 'Esc', 2),
    ('KYD', 'Cayman Islands Dollar', '$', 2),
    ('XAF', 'Central African CFA Franc', 'Fr', 0),
    ('CLP', 'Chilean Peso', '$', 0),
    ('CNY', 'Chinese Yuan', '¥', 2),
    ('COP', 'Colombian Peso', '$', 2),
    ('KMF', 'Comorian Franc', 'Fr', 0),
    ('CDF', 'Congolese Franc', 'FC', 2),
    ('CKD', 'Cook Islands Dollar', '$', 2),
    ('CRC', 'Costa Rican Colón', '₡', 2),
    ('CUC', 'Cuban Convertible Peso', '$', 2),
    ('CUP', 'Cuban Peso', '$', 2),
    ('CZK', 'Czech Koruna', 'Kč', 2),
    ('GMD', 'Dalasi', 'D', 2),
    ('DKK', 'Danish Krone', 'kr', 2),
    ('MKD', 'Denar', 'den', 2),
    ('DJF', 'Djiboutian Franc', 'Fr', 0),
    ('DOP', 'Dominican Peso', '$', 2),
    ('XCD', 'Eastern Caribbean Dollar', '$', 2),
    ('EGP', 'Egyptian Pound', '£', 2),
    ('ERN', 'Eritrean Nakfa', 'Nfk', 2),
    ('ETB', 'Ethiopian Birr', 'Br', 2),
    ('EUR', 'Euro', '€', 2),
    ('FKP', 'Falkland Islands Pound', '£', 2),
    ('FOK', 'Faroese Króna', 'kr', 2),
    ('FJD', 'Fijian Dollar', '$', 2),
    ('GHS', 'Ghanaian Cedi', '₵', 2),
    ('GIP', 'Gibraltar Pound', '£', 2),
    ('GTQ', 'Guatemalan Quetzal', 'Q', 2),
    ('GGP', 'Guernsey Pound', '£', 2),
    ('GNF', 'Guinean Franc', 'Fr', 0),
    ('GYD', 'Guyanese Dollar', '$', 2),
    ('HTG', 'Haitian Gourde', 'G', 2),
    ('HNL', 'Honduran Lempira', 'L', 2),
    ('HKD', 'Hong Kong Dollar', '$', 2),
    ('HUF', 'Hungarian Forint', 'Ft', 2),
    ('ISK', 'Icelandic Króna', 'kr', 0),
    ('INR', 'Indian Rupee', '₹', 2),
    ('IDR', 'Indonesian Rupiah', 'Rp', 2),
    ('IRR', 'Iranian Rial', '﷼', 2),
    ('IQD', 'Iraqi Dinar', 'ع.د', 3),
    ('ILS', 'Israeli New Shekel', '₪', 2),
    ('JMD', 'Jamaican Dollar', '$', 2),
    ('JPY', 'Japanese Yen', '¥', 0),
    ('JEP', 'Jersey Pound', '£', 2),
    ('JOD', 'Jordanian Dinar', 'د.ا', 3),
    ('KZT', 'Kazakhstani Tenge', '₸', 2),
    ('KES', 'Kenyan Shilling', 'KSh', 2),
    ('KID', 'Kiribati Dollar', '$', 2),
    ('KWD', 'Kuwaiti Dinar', 'د.ك', 3),
    ('KGS', 'Kyrgyzstani Som', 'с', 2),
    ('LAK', 'Lao Kip', '₭', 2),
    ('GEL', 'Lari', '₾', 2),
    ('LBP', 'Lebanese Pound', 'ل.ل', 2),
    ('LSL', 'Lesotho Loti', 'L', 2),
    ('LRD', 'Liberian Dollar', '$', 2),
    ('LYD', 'Libyan Dinar', 'ل.د', 3),
    ('MOP', 'Macanese Pataca', 'P', 2),
    ('MGA', 'Malagasy Ariary', 'Ar', 2),
    ('MWK', 'Malawian Kwacha', 'MK', 2),
    ('MYR', 'Malaysian Ringgit', 'RM', 2),
    ('MVR', 'Maldivian Rufiyaa', '.ރ', 2),
    ('IMP', 'Manx Pound', '£', 2),
    ('MRU', 'Mauritanian Ouguiya', 'UM', 2),
    ('MUR', 'Mauritian Rupee', '₨', 2),
    ('MXN', 'Mexican Peso', '$', 2),
    ('MDL', 'Moldovan Leu', 'L', 2),
    ('MNT', 'Mongolian Tögrög', '₮', 2),
    ('MAD', 'Moroccan Dirham', 'DH', 2),
    ('MZN', 'Mozambican Metical', 'MT', 2),
    ('NAD', 'Namibian Dollar', '$', 2),
    ('NPR', 'Nepalese Rupee', '₨', 2),
    ('ANG', 'Netherlands Antillean Guilder', 'ƒ', 2),
    ('TWD', 'New Taiwan Dollar', '$', 2),
    ('NZD', 'New Zealand Dollar', '$', 2),
    ('NIO', 'Nicaraguan Córdoba', 'C$', 2),
    ('NGN', 'Nigerian Naira', '₦', 2),
    ('KPW', 'North Korean Won', '₩', 2),
    ('NOK', 'Norwegian Krone', 'kr', 2),
    ('OMR', 'Omani Rial', 'ر.ع.', 3),
    ('PKR', 'Pakistani Rupee', '₨', 2),
    ('PAB', 'Panamanian Balboa', 'B/.', 2),
    ('PGK', 'Papua New Guinean Kina', 'K', 2),
    ('PYG', 'Paraguayan Guaraní', '₲', 0),
    ('PEN', 'Peruvian Sol', 'S/.', 2),
    ('PHP', 'Philippine Peso', '₱', 2),
    ('PLN', 'Polish Złoty', 'zł', 2),
    ('GBP', 'Pound Sterling', '£', 2),
    ('QAR', 'Qatari Riyal', 'ر.ق', 2),
    ('RON', 'Romanian Leu', 'lei', 2),
    ('RUB', 'Russian Ruble', '₽', 2),
    ('RWF', 'Rwandan Franc', 'RWF', 0),
    ('SHP', 'Saint Helena Pound', '£', 2),
    ('WST', 'Samoan Tālā', 'T', 2),
    ('SAR', 'Saudi Riyal', 'ر.س', 2),
    ('RSD', 'Serbian Dinar', 'дин.', 2),
    ('SCR', 'Seychellois Rupee', '₨', 2),
    ('SLL', 'Sierra Leonean Leone', 'Le', 2),
    ('SGD', 'Singapore Dollar', '$', 2),
    ('SBD', 'Solomon Islands Dollar', '$', 2),
    ('SOS', 'Somali Shilling', 'Sh', 2),
    ('ZAR', 'South African Rand', 'R', 2),
    ('KRW', 'South Korean Won', '₩', 0),
    ('SSP', 'South Sudanese Pound', '£', 2),
    ('LKR', 'Sri Lankan Rupee', 'Rs', 2),
    ('SDG', 'Sudanese Pound', 'PT', 2),
    ('SRD', 'Surinamese Dollar', '$', 2),
    ('SZL', 'Swazi Lilangeni', 'L', 2),
    ('SEK', 'Swedish Krona', 'kr', 2),
    ('CHF', 'Swiss Franc', 'Fr.', 2),
    ('SYP', 'Syrian Pound', '£', 2),
    ('STN', 'São Tomé and Príncipe Dobra', 'Db', 2),
    ('TJS', 'Tajikistani Somoni', 'ЅМ', 2),
    ('TZS', 'Tanzanian Shilling', 'TSh', 2),
    ('THB', 'Thai Baht', '฿', 2),
    ('TOP', 'Tongan Paʻanga', 'T$', 2),
    ('TTD', 'Trinidad and Tobago Dollar', '$', 2),
    ('TND', 'Tunisian Dinar', 'د.ت', 3),
    ('TRY', 'Turkish Lira', '₺', 2),
    ('TMT', 'Turkmenistan Manat', 'm', 2),
    ('TVD', 'Tuvaluan Dollar', '$', 2),
    ('USD', 'US Dollar', '$', 2),
    ('UGX', 'Ugandan Shilling', 'USh', 0),
    ('UAH', 'Ukrainian Hryvnia', '₴', 2),
    ('AED', 'United Arab Emirates Dirham', 'د.إ', 2),
    ('UYU', 'Uruguayan Peso', '$', 2),
    ('UZS', 'Uzbekistani Soʻm', "so'm", 2),
    ('VUV', 'Vanuatu Vatu', 'Vt', 0),
    ('VES', 'Venezuelan Bolívar Soberano', 'Bs.S.', 2),
    ('VND', 'Vietnamese Đồng', '₫', 0),
    ('XOF', 'West African CFA Franc', 'Fr', 0),
    ('YER', 'Yemeni Rial', '﷼', 2),
    ('ZMW', 'Zambian Kwacha', 'ZK', 2),
    ('ZWB', 'Zimbabwean Bonds', '$', 2),
]

# table, columns added: (name, type)
_RATE = sa.Numeric(20, 10)
_MONEY = sa.Numeric(14, 2)
_DOC = [("currency_code", sa.String(3)), ("exchange_rate", _RATE)]
_PAY = _DOC + [("base_amount", _MONEY), ("applied_amount", _MONEY), ("base_applied_amount", _MONEY)]

_COLUMNS: dict[str, list[tuple[str, sa.types.TypeEngine]]] = {
    "sales_orders": _DOC + [("base_subtotal", _MONEY), ("base_discount", _MONEY), ("base_tax", _MONEY), ("base_total", _MONEY)],
    "sales_order_payments": _PAY,
    "purchase_orders": _DOC + [("base_subtotal", _MONEY), ("base_discount", _MONEY), ("base_tax", _MONEY), ("base_total", _MONEY)],
    "procurement_supplier_bills": _DOC + [("base_amount", _MONEY)],
    "procurement_supplier_payments": _PAY,
    "accounting_expenses": _DOC + [("base_amount", _MONEY)],
    "sales_returns": _DOC + [("base_refund_amount", _MONEY)],
    "accounting_transactions": [("currency_code", sa.String(3))],
}

# table -> SET clause for the backfill (alias t = the table, tn = its tenant)
_BACKFILL: dict[str, str] = {
    "sales_orders": "currency_code = COALESCE(tn.currency, 'RWF'), exchange_rate = 1, base_subtotal = t.subtotal, "
                    "base_discount = t.discount, base_tax = t.tax, base_total = t.total",
    "sales_order_payments": "currency_code = COALESCE(tn.currency, 'RWF'), exchange_rate = 1, base_amount = t.amount, "
                            "applied_amount = t.amount, base_applied_amount = t.amount",
    "purchase_orders": "currency_code = COALESCE(tn.currency, 'RWF'), exchange_rate = 1, base_subtotal = t.subtotal, "
                       "base_discount = t.discount, base_tax = t.tax, base_total = t.total",
    "procurement_supplier_bills": "currency_code = COALESCE(tn.currency, 'RWF'), exchange_rate = 1, base_amount = t.amount",
    "procurement_supplier_payments": "currency_code = COALESCE(tn.currency, 'RWF'), exchange_rate = 1, base_amount = t.amount, "
                                     "applied_amount = t.amount, base_applied_amount = t.amount",
    "accounting_expenses": "currency_code = COALESCE(tn.currency, 'RWF'), exchange_rate = 1, base_amount = t.amount",
    "sales_returns": "currency_code = COALESCE(tn.currency, 'RWF'), exchange_rate = 1, base_refund_amount = t.refund_amount",
    "accounting_transactions": "currency_code = COALESCE(tn.currency, 'RWF')",
}


def upgrade() -> None:
    bind = op.get_bind()

    currencies = op.create_table(
        "currencies",
        sa.Column("code", sa.String(3), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("symbol", sa.String(10), nullable=False),
        sa.Column("decimal_places", sa.SmallInteger(), nullable=False, server_default="2"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.bulk_insert(
        currencies,
        [{"code": c, "name": n, "symbol": s, "decimal_places": d, "is_active": True} for c, n, s, d in CURRENCY_ROWS],
    )

    op.create_table(
        "exchange_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("base_currency", sa.String(3), sa.ForeignKey("currencies.code"), nullable=False),
        sa.Column("quote_currency", sa.String(3), sa.ForeignKey("currencies.code"), nullable=False),
        sa.Column("rate", _RATE, nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("source", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("rate > 0", name="ck_exchange_rates_positive"),
        sa.CheckConstraint("base_currency <> quote_currency", name="ck_exchange_rates_distinct"),
    )
    op.create_index("ix_exchange_rates_lookup", "exchange_rates", ["tenant_id", "base_currency", "quote_currency", "effective_at"])

    settings = op.create_table(
        "platform_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # PESAA has so far reported in RWF everywhere; keep that as the starting reporting currency.
    op.bulk_insert(settings, [{"key": "reporting_currency", "value": "RWF"}])

    for table, cols in _COLUMNS.items():
        for name, type_ in cols:
            op.add_column(table, sa.Column(name, type_, nullable=True))

    # Bounded batches: each statement touches at most BATCH rows that still have no currency.
    for table, set_clause in _BACKFILL.items():
        while True:
            result = bind.execute(sa.text(
                f"UPDATE {table} AS t SET {set_clause} FROM tenants tn "
                f"WHERE t.tenant_id = tn.id AND t.id IN "
                f"(SELECT id FROM {table} WHERE currency_code IS NULL LIMIT {BATCH})"
            ))
            if result.rowcount == 0:
                break


def downgrade() -> None:
    for table, cols in _COLUMNS.items():
        for name, _ in reversed(cols):
            op.drop_column(table, name)
    op.drop_table("platform_settings")
    op.drop_index("ix_exchange_rates_lookup", table_name="exchange_rates")
    op.drop_table("exchange_rates")
    op.drop_table("currencies")
