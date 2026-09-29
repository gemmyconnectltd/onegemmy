export type Theme = "light" | "dark";

/**
 * Fixed neutral base — every tenant shares these background/surface/border
 * tones. The only thing that varies per tenant is the brand accent color
 * (see `DEFAULT_BRAND_COLOR` and `brandColorPresets` below), set once in
 * Settings > Appearance and applied for everyone at that company.
 */
export type BaseTheme = {
  background: string; surface: string; card: string; border: string;
  foreground: string; muted: string;
};

export const baseThemeLight: BaseTheme = {
  background: "#ffffff", surface: "#f8f8f6", card: "#ffffff", border: "#e8e4de",
  foreground: "#2b2118", muted: "#7a7d7e",
};

export const baseThemeDark: BaseTheme = {
  background: "#0d0d0f", surface: "#151519", card: "#1c1c21", border: "#2c2c33",
  foreground: "#f1f1f4", muted: "#a0a2ab",
};

export const DEFAULT_BRAND_COLOR = "#16a34a";

export const brandColorPresets = [
  "#16a34a", "#b45309", "#1d4ed8", "#059669",
  "#7c3aed", "#0e7490", "#be123c", "#0f766e",
];

export const siteConfig = {
  name: "Pesaa",
  title: "Pesaa — ERP & Business Management Platform",
  description:
    "An all-in-one ERP platform for point of sale, inventory, accounting, and HR — built to scale from a single location to a multi-branch operation.",
  company: "Pesaa",
  url: "https://pesaa.io",
  links: {
    github: "https://github.com/gemmyconnectltd",
    linkedin: "https://linkedin.com/company/gemmyconnectltd",
  },
  colors: {
    primary: "#af9164",
    secondary: "#6f5a3a",
    accent: "#16a34a",
    success: "#10B981",
    background: "#ffffff",
    surface: "#f8f8f6",
    foreground: "#2b2118",
    muted: "#b3b6b7",
    border: "#e8e4de",
    sidebar: "#111111",
  },
};

export const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Sales", href: "/sales" },
  { name: "Products", href: "/products" },
  { name: "Inventory", href: "/inventory" },
  { name: "Expenses", href: "/expenses" },
  { name: "Customers", href: "/customers" },
  { name: "Reports", href: "/reports" },
  { name: "Settings", href: "/settings" },
];

export const expenseCategories = [
  "Rent",
  "Utilities",
  "Inventory Purchase",
  "Transport",
  "Packaging",
  "Marketing",
  "Maintenance",
  "Other",
];

// Covers every currency in active use worldwide (derived from the ISO 4217
// data bundled with the `world-countries` package, deduplicated by code and
// sorted by name), with the 6 currencies this platform originally shipped
// kept as their existing, more specific symbols (e.g. "KSh" instead of the
// ambiguous generic "Sh" three different East African currencies share)
// rather than overwritten by the generated ones. Matches the backend's
// SUPPORTED_CURRENCIES in tenants/routes/currency.py.
export const currencies = [
  { code: "AFN", symbol: "؋", name: "Afghan Afghani" },
  { code: "ALL", symbol: "L", name: "Albanian Lek" },
  { code: "DZD", symbol: "د.ج", name: "Algerian Dinar" },
  { code: "AOA", symbol: "Kz", name: "Angolan Kwanza" },
  { code: "ARS", symbol: "$", name: "Argentine Peso" },
  { code: "AMD", symbol: "֏", name: "Armenian Dram" },
  { code: "AWG", symbol: "ƒ", name: "Aruban Florin" },
  { code: "AUD", symbol: "$", name: "Australian Dollar" },
  { code: "AZN", symbol: "₼", name: "Azerbaijani Manat" },
  { code: "BSD", symbol: "$", name: "Bahamian Dollar" },
  { code: "BHD", symbol: ".د.ب", name: "Bahraini Dinar" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "BBD", symbol: "$", name: "Barbadian Dollar" },
  { code: "BYN", symbol: "Br", name: "Belarusian Ruble" },
  { code: "BZD", symbol: "$", name: "Belize Dollar" },
  { code: "BMD", symbol: "$", name: "Bermudian Dollar" },
  { code: "BTN", symbol: "Nu.", name: "Bhutanese Ngultrum" },
  { code: "BOB", symbol: "Bs.", name: "Bolivian Boliviano" },
  { code: "BAM", symbol: "KM", name: "Bosnia and Herzegovina Convertible Mark" },
  { code: "BWP", symbol: "P", name: "Botswana Pula" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "BND", symbol: "$", name: "Brunei Dollar" },
  { code: "BGN", symbol: "лв", name: "Bulgarian Lev" },
  { code: "MMK", symbol: "Ks", name: "Burmese Kyat" },
  { code: "BIF", symbol: "Fr", name: "Burundian Franc" },
  { code: "XPF", symbol: "₣", name: "CFP Franc" },
  { code: "KHR", symbol: "៛", name: "Cambodian Riel" },
  { code: "CAD", symbol: "$", name: "Canadian Dollar" },
  { code: "CVE", symbol: "Esc", name: "Cape Verdean Escudo" },
  { code: "KYD", symbol: "$", name: "Cayman Islands Dollar" },
  { code: "XAF", symbol: "Fr", name: "Central African CFA Franc" },
  { code: "CLP", symbol: "$", name: "Chilean Peso" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "COP", symbol: "$", name: "Colombian Peso" },
  { code: "KMF", symbol: "Fr", name: "Comorian Franc" },
  { code: "CDF", symbol: "FC", name: "Congolese Franc" },
  { code: "CKD", symbol: "$", name: "Cook Islands Dollar" },
  { code: "CRC", symbol: "₡", name: "Costa Rican Colón" },
  { code: "CUC", symbol: "$", name: "Cuban Convertible Peso" },
  { code: "CUP", symbol: "$", name: "Cuban Peso" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna" },
  { code: "GMD", symbol: "D", name: "Dalasi" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "MKD", symbol: "den", name: "Denar" },
  { code: "DJF", symbol: "Fr", name: "Djiboutian Franc" },
  { code: "DOP", symbol: "$", name: "Dominican Peso" },
  { code: "XCD", symbol: "$", name: "Eastern Caribbean Dollar" },
  { code: "EGP", symbol: "£", name: "Egyptian Pound" },
  { code: "ERN", symbol: "Nfk", name: "Eritrean Nakfa" },
  { code: "ETB", symbol: "Br", name: "Ethiopian Birr" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "FKP", symbol: "£", name: "Falkland Islands Pound" },
  { code: "FOK", symbol: "kr", name: "Faroese Króna" },
  { code: "FJD", symbol: "$", name: "Fijian Dollar" },
  { code: "GHS", symbol: "₵", name: "Ghanaian Cedi" },
  { code: "GIP", symbol: "£", name: "Gibraltar Pound" },
  { code: "GTQ", symbol: "Q", name: "Guatemalan Quetzal" },
  { code: "GGP", symbol: "£", name: "Guernsey Pound" },
  { code: "GNF", symbol: "Fr", name: "Guinean Franc" },
  { code: "GYD", symbol: "$", name: "Guyanese Dollar" },
  { code: "HTG", symbol: "G", name: "Haitian Gourde" },
  { code: "HNL", symbol: "L", name: "Honduran Lempira" },
  { code: "HKD", symbol: "$", name: "Hong Kong Dollar" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "ISK", symbol: "kr", name: "Icelandic Króna" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "IRR", symbol: "﷼", name: "Iranian Rial" },
  { code: "IQD", symbol: "ع.د", name: "Iraqi Dinar" },
  { code: "ILS", symbol: "₪", name: "Israeli New Shekel" },
  { code: "JMD", symbol: "$", name: "Jamaican Dollar" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "JEP", symbol: "£", name: "Jersey Pound" },
  { code: "JOD", symbol: "د.ا", name: "Jordanian Dinar" },
  { code: "KZT", symbol: "₸", name: "Kazakhstani Tenge" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "KID", symbol: "$", name: "Kiribati Dollar" },
  { code: "KWD", symbol: "د.ك", name: "Kuwaiti Dinar" },
  { code: "KGS", symbol: "с", name: "Kyrgyzstani Som" },
  { code: "LAK", symbol: "₭", name: "Lao Kip" },
  { code: "GEL", symbol: "₾", name: "Lari" },
  { code: "LBP", symbol: "ل.ل", name: "Lebanese Pound" },
  { code: "LSL", symbol: "L", name: "Lesotho Loti" },
  { code: "LRD", symbol: "$", name: "Liberian Dollar" },
  { code: "LYD", symbol: "ل.د", name: "Libyan Dinar" },
  { code: "MOP", symbol: "P", name: "Macanese Pataca" },
  { code: "MGA", symbol: "Ar", name: "Malagasy Ariary" },
  { code: "MWK", symbol: "MK", name: "Malawian Kwacha" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "MVR", symbol: ".ރ", name: "Maldivian Rufiyaa" },
  { code: "IMP", symbol: "£", name: "Manx Pound" },
  { code: "MRU", symbol: "UM", name: "Mauritanian Ouguiya" },
  { code: "MUR", symbol: "₨", name: "Mauritian Rupee" },
  { code: "MXN", symbol: "$", name: "Mexican Peso" },
  { code: "MDL", symbol: "L", name: "Moldovan Leu" },
  { code: "MNT", symbol: "₮", name: "Mongolian Tögrög" },
  { code: "MAD", symbol: "DH", name: "Moroccan Dirham" },
  { code: "MZN", symbol: "MT", name: "Mozambican Metical" },
  { code: "NAD", symbol: "$", name: "Namibian Dollar" },
  { code: "NPR", symbol: "₨", name: "Nepalese Rupee" },
  { code: "ANG", symbol: "ƒ", name: "Netherlands Antillean Guilder" },
  { code: "TWD", symbol: "$", name: "New Taiwan Dollar" },
  { code: "NZD", symbol: "$", name: "New Zealand Dollar" },
  { code: "NIO", symbol: "C$", name: "Nicaraguan Córdoba" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "KPW", symbol: "₩", name: "North Korean Won" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "OMR", symbol: "ر.ع.", name: "Omani Rial" },
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  { code: "PAB", symbol: "B/.", name: "Panamanian Balboa" },
  { code: "PGK", symbol: "K", name: "Papua New Guinean Kina" },
  { code: "PYG", symbol: "₲", name: "Paraguayan Guaraní" },
  { code: "PEN", symbol: "S/.", name: "Peruvian Sol" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
  { code: "PLN", symbol: "zł", name: "Polish Złoty" },
  { code: "GBP", symbol: "£", name: "Pound Sterling" },
  { code: "QAR", symbol: "ر.ق", name: "Qatari Riyal" },
  { code: "RON", symbol: "lei", name: "Romanian Leu" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
  { code: "RWF", symbol: "RWF", name: "Rwandan Franc" },
  { code: "SHP", symbol: "£", name: "Saint Helena Pound" },
  { code: "WST", symbol: "T", name: "Samoan Tālā" },
  { code: "SAR", symbol: "ر.س", name: "Saudi Riyal" },
  { code: "RSD", symbol: "дин.", name: "Serbian Dinar" },
  { code: "SCR", symbol: "₨", name: "Seychellois Rupee" },
  { code: "SLL", symbol: "Le", name: "Sierra Leonean Leone" },
  { code: "SGD", symbol: "$", name: "Singapore Dollar" },
  { code: "SBD", symbol: "$", name: "Solomon Islands Dollar" },
  { code: "SOS", symbol: "Sh", name: "Somali Shilling" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "SSP", symbol: "£", name: "South Sudanese Pound" },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee" },
  { code: "SDG", symbol: "PT", name: "Sudanese Pound" },
  { code: "SRD", symbol: "$", name: "Surinamese Dollar" },
  { code: "SZL", symbol: "L", name: "Swazi Lilangeni" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "CHF", symbol: "Fr.", name: "Swiss Franc" },
  { code: "SYP", symbol: "£", name: "Syrian Pound" },
  { code: "STN", symbol: "Db", name: "São Tomé and Príncipe Dobra" },
  { code: "TJS", symbol: "ЅМ", name: "Tajikistani Somoni" },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "TOP", symbol: "T$", name: "Tongan Paʻanga" },
  { code: "TTD", symbol: "$", name: "Trinidad and Tobago Dollar" },
  { code: "TND", symbol: "د.ت", name: "Tunisian Dinar" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "TMT", symbol: "m", name: "Turkmenistan Manat" },
  { code: "TVD", symbol: "$", name: "Tuvaluan Dollar" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling" },
  { code: "UAH", symbol: "₴", name: "Ukrainian Hryvnia" },
  { code: "AED", symbol: "د.إ", name: "United Arab Emirates Dirham" },
  { code: "UYU", symbol: "$", name: "Uruguayan Peso" },
  { code: "UZS", symbol: "so'm", name: "Uzbekistani Soʻm" },
  { code: "VUV", symbol: "Vt", name: "Vanuatu Vatu" },
  { code: "VES", symbol: "Bs.S.", name: "Venezuelan Bolívar Soberano" },
  { code: "VND", symbol: "₫", name: "Vietnamese Đồng" },
  { code: "XOF", symbol: "Fr", name: "West African CFA Franc" },
  { code: "YER", symbol: "﷼", name: "Yemeni Rial" },
  { code: "ZMW", symbol: "ZK", name: "Zambian Kwacha" },
  { code: "ZWB", symbol: "$", name: "Zimbabwean Bonds" },
];

// Mutable module state: the tenant's actual currency, set once by
// AppConfigProvider after it fetches the tenant record. Exported as `let`
// bindings so every importer (including fmtMoney's default parameter,
// evaluated live at call time) picks up the change without needing to
// route through React context.
export let CURRENCY = "RWF";
export let CURRENCY_SYMBOL = "RWF";

export function setActiveCurrency(code: string) {
  CURRENCY = code;
  CURRENCY_SYMBOL = currencies.find((c) => c.code === code)?.symbol ?? code;
}

/** Format a money value as full number with comma separators e.g. "RWF 1,250,000" */
export function fmtMoney(value: number | null | undefined, symbol = CURRENCY_SYMBOL): string {
  const v = Number(value ?? 0);
  if (isNaN(v)) return `${symbol} 0`;
  return `${symbol} ${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export const locales = [
  { code: "en", name: "English" },
  { code: "rw", name: "Kinyarwanda" },
  { code: "sw", name: "Kiswahili" },
] as const;

export type LocaleCode = "en" | "rw" | "sw";
