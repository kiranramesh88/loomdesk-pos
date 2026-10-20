"""Demo data mirrored from reference/loomdesk-ui-reference.html, reshaped for the real data model.

Prices are in rupees here and converted to paise by the seed command.
"""

TAX_RULES = [
    # GST rationalisation effective 22 Sep 2025: garments and textile made-ups are 5% up to
    # ₹2,500 per piece and 18% above. Demo defaults only — confirm with the store's accountant.
    {"name": "Garments & made-ups (5% / 18% above ₹2,500)", "kind": "price_band",
     "threshold_paise": 2_500_00, "lower_rate_bp": 500, "upper_rate_bp": 1800},
    # Placeholder until the actual HSN for each accessory is confirmed.
    {"name": "Standard 18%", "kind": "flat", "flat_rate_bp": 1800},
]

GARMENTS = TAX_RULES[0]["name"]
STANDARD = TAX_RULES[1]["name"]

CATEGORIES = [
    # name, HSN, tax rule
    ("Shirts", "6205", GARMENTS),
    ("Kurtas", "6211", GARMENTS),
    ("Bottomwear", "6203", GARMENTS),
    ("Dresses", "6204", GARMENTS),
    ("Home linen", "6302", GARMENTS),
    ("Accessories", "4202", STANDARD),
]

# code, name, category, SKU prefix, price, cost, total stock, reorder threshold, sizes, colours
PRODUCTS = [
    ("P-1001", "Classic Cotton Shirt", "Shirts", "SH-CT-001", 1199, 620, 26, 8, ["S", "M", "L", "XL"], ["Blue", "White", "Black"]),
    ("P-1002", "Everyday Linen Kurta", "Kurtas", "KU-LN-014", 1490, 790, 7, 8, ["M", "L", "XL"], ["Sage", "Ivory", "Blue"]),
    ("P-1003", "Straight Fit Denim", "Bottomwear", "DN-SF-042", 1899, 1020, 18, 6, ["28", "30", "32", "34"], ["Indigo", "Black"]),
    ("P-1004", "Floral Midi Dress", "Dresses", "DR-FL-008", 2290, 1180, 5, 6, ["S", "M", "L"], ["Rose", "Navy"]),
    ("P-1005", "Soft Cotton Towel", "Home linen", "HL-TW-002", 449, 210, 42, 12, ["Standard"], ["Ivory", "Grey", "Sage"]),
    ("P-1006", "Canvas Everyday Tote", "Accessories", "AC-TT-019", 599, 260, 3, 5, ["One size"], ["Sand", "Olive"]),
    ("P-1007", "Relaxed Fit Tee", "Shirts", "TS-RF-031", 799, 390, 34, 10, ["S", "M", "L", "XL"], ["Lilac", "White", "Black"]),
    ("P-1008", "Classic Chino", "Bottomwear", "CH-CL-015", 1599, 840, 11, 6, ["30", "32", "34", "36"], ["Khaki", "Navy"]),
    ("P-1009", "Embroidered Kurti", "Kurtas", "KU-EM-021", 1790, 930, 16, 7, ["S", "M", "L", "XL"], ["Coral", "Blue"]),
]

# Product photos, free to use under the Unsplash License (https://unsplash.com/license). Each one shows
# the product it's assigned to; the prototype's originals showed a T-shirt for the shirt, polos for the
# kurta, a ghost costume for the dress and a blazer for the kurti, and reused the denim photo for the chino.
# The photo pages are listed so the source and photographer can be checked.
_UNSPLASH = "https://images.unsplash.com/photo-{}?auto=format&fit=max&w=760&q=85"
PHOTO_URLS = {
    # unsplash.com/photos/hMMXhKSZk7k — white button-up shirt on a hanger (Nimble Made)
    "P-1001": _UNSPLASH.format("1603252109303-2751441dd157"),
    # unsplash.com/photos/sLRFg-VC2FY — blue kurta
    "P-1002": _UNSPLASH.format("1770359993283-a2c2f386584e"),
    "P-1003": _UNSPLASH.format("1714143136372-ddaf8b606da7"),
    # unsplash.com/photos/cRpcTf0VfuE — floral midi sundress
    "P-1004": _UNSPLASH.format("1762154057377-cc9d3dd6900c"),
    "P-1005": _UNSPLASH.format("1766727923581-d4df2f4e9308"),
    "P-1006": _UNSPLASH.format("1780480999314-b82a1f2f9de6"),
    # The plain white tee the prototype used for the shirt.
    "P-1007": _UNSPLASH.format("1651761179569-4ba2aa054997"),
    # unsplash.com/photos/O2g79zAqJX8 — beige chinos
    "P-1008": _UNSPLASH.format("1788380944948-f5fe4a3b3a13"),
    # unsplash.com/photos/e_Ha_TxDlG0 — kurti with an embroidered neckline, on a mannequin
    "P-1009": _UNSPLASH.format("1760287363878-1a09af715b80"),
}

# full name, email, role, approval PIN (Senior cashier/Admin only)
STAFF = [
    ("Kiran Ramesh", "kiran@loomlinen.demo", "admin", "1357"),
    ("Devika R.", "devika@loomlinen.demo", "admin", "2468"),
    ("Rahul Krishnan", "rahul@loomlinen.demo", "senior_cashier", "4826"),
    ("Anjali Prakash", "anjali@loomlinen.demo", "cashier", None),
    ("Fathima N.", "fathima@loomlinen.demo", "cashier", None),
]

SUPPLIERS = [
    ("Malabar Textile House", "Apparel & fabric", "+91 98765 12001", "orders@malabartextile.demo"),
    ("Cotton Collective", "Cotton basics", "+91 98765 12002", "hello@cottoncollective.demo"),
    ("Urban Stitch Distributors", "Denim & bottoms", "+91 98765 12003", "sales@urbanstitch.demo"),
    ("The Linen Room", "Linen garments", "+91 98765 12004", "care@linenroom.demo"),
]

CUSTOMERS = [
    ("Aparna Menon", "+91 98765 43210"),
    ("Nikhil Das", "+91 98765 43211"),
    ("Meera S.", "+91 98765 43212"),
]
