"""Plain-language metric definitions. Each report returns the ones it uses, and the UI shows them as sent."""

GROSS = ("Gross sales", "Item prices × quantities on completed bills, before discounts. Includes GST when catalogue prices include it.")
DISCOUNTS = ("Discounts", "Bill and item discounts given on completed bills.")
GST = ("GST", "Tax on completed bills, from each line’s saved rate and taxable value.")
SALES = ("Sales", "Completed bill totals, after discounts, GST included, on the day of the bill.")
REFUNDS = ("Refunds", "Money given back on returns, on the day of the return, from the original bill’s values.")
NET = ("Net sales", "Sales minus refunds for the same dates. Can be negative on a day with more refunds than sales.")
VOIDS = ("Voided bills", "Bills cancelled on the day they were made. Excluded from every sales figure; their stock went back.")
AVERAGE = ("Average bill", "Sales divided by completed bills.")
RECORDED = (
    "Recorded payments",
    "What staff recorded at the till. UPI and card amounts aren’t verified with a gateway, so this isn’t a settlement report.",
)
CASH_IN_DRAWER = ("Cash expected", "Cash sales minus cash refunds for the dates. Compare it with the counted drawer.")
UNITS = ("Units", "Units sold on completed bills; units returned on returns in the dates.")
TAXABLE = ("Taxable value", "Line value after discount, before GST (the value GST is charged on).")
CGST_SGST = (
    "CGST and SGST",
    "Sales are intra-state, so GST is split half and half. An odd paisa goes to SGST, as on receipts.",
)
NOT_A_RETURN = (
    "Not a GST filing",
    "An operational summary from LoomDesk’s records to review with an accountant, not a GST return.",
)
COST_VALUE = (
    "Stock at cost",
    "Units on hand × the product’s current cost price. Variants without a cost price are left out of this total.",
)
RETAIL_VALUE = ("Stock at retail", "Units on hand × each variant’s current selling price, before discounts.")
VALUATION_BASIS = (
    "Valuation basis",
    "A snapshot at today’s prices, not an accounting valuation (no FIFO or weighted average cost).",
)
LOW_STOCK = ("Low stock", "Active variants with 1 to their reorder level in stock. Out of stock means none left.")
ACTIVITY = ("Activity log", "Voids, returns, staff, PIN and settings changes, as recorded. Entries can’t be edited or deleted.")


def as_list(*items: tuple[str, str]) -> list[dict]:
    return [{"term": term, "meaning": meaning} for term, meaning in items]
