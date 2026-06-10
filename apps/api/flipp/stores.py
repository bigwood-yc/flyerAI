"""
Curated grocery merchant allow-list.

Why this exists: Flipp's own "Groceries" category tag is noisy. For postal code
L3R0B1 it returned 54+ merchants tagged Groceries, including warehouse clubs
(Costco), bulk/specialty stores (Bulk Barn), and even a quick-serve chain
(Subway). Trusting the raw tag would put non-grocery merchants into our
recommendations, so we match merchants against an explicit allow-list instead.

The list is seeded from the project's nine target stores, using the exact
merchant strings Flipp returns (observed in a live run). Extending coverage =
add a string here. Nothing else in the codebase hard-codes store names.
"""

# This service handles one category for now. Other categories would each get
# their own allow-list; the retrieval logic itself is category-agnostic.
CATEGORY = "grocery"

# Exact Flipp merchant strings for the nine target stores (lower-cased,
# whitespace-trimmed for matching). Add new stores here to widen coverage.
GROCERY_MERCHANTS = {
    "no frills",
    "freshco",
    "food basics",
    "walmart",
    "real canadian superstore",
    "t&t supermarket",
    "bestco foodmart",
    "blue sky supermarket",
    "nations fresh foods",
}


def normalize(name: str) -> str:
    """Lower-case and collapse whitespace so 'Cataldi   ' == 'cataldi'."""
    return " ".join((name or "").split()).lower()


def is_grocery_merchant(merchant: str) -> bool:
    """True if the merchant is on our curated grocery allow-list."""
    return normalize(merchant) in GROCERY_MERCHANTS
