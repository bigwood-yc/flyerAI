"""Allow-list matching — pure logic, no network."""

from flipp import stores


def test_target_stores_match():
    for name in [
        "No Frills", "FreshCo", "Food Basics", "Walmart",
        "Real Canadian Superstore", "T&T Supermarket",
        "Bestco Foodmart", "Blue Sky Supermarket", "Nations Fresh Foods",
    ]:
        assert stores.is_grocery_merchant(name), name


def test_noisy_merchants_excluded():
    # These appear under Flipp's "Groceries" tag but are not grocery stores.
    for name in ["Subway", "Costco", "Bulk Barn", "Healthy Planet"]:
        assert not stores.is_grocery_merchant(name), name


def test_matching_is_whitespace_and_case_insensitive():
    assert stores.is_grocery_merchant("  walmart  ")
    assert stores.is_grocery_merchant("FRESHCO")


def test_empty_or_none_is_not_grocery():
    assert not stores.is_grocery_merchant("")
    assert not stores.is_grocery_merchant(None)
