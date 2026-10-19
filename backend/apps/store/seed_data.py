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

# Free-to-use Unsplash photos used by the prototype. P-1008 is omitted on purpose: the
# prototype reused P-1003's photo for it, so it shows the neutral placeholder until a
# distinct photo is supplied (drop it in backend/seed/photos/P-1008.jpg).
PHOTO_URLS = {
    "P-1001": "https://images.unsplash.com/photo-1651761179569-4ba2aa054997?auto=format&fit=max&w=760&q=85",
    "P-1002": "https://images.unsplash.com/photo-1715268724067-815084f10571?auto=format&fit=max&w=760&q=85",
    "P-1003": "https://images.unsplash.com/photo-1714143136372-ddaf8b606da7?auto=format&fit=max&w=760&q=85",
    "P-1004": "https://images.unsplash.com/photo-1665002556081-5c476292d1aa?auto=format&fit=max&w=760&q=85",
    "P-1005": "https://images.unsplash.com/photo-1766727923581-d4df2f4e9308?auto=format&fit=max&w=760&q=85",
    "P-1006": "https://images.unsplash.com/photo-1780480999314-b82a1f2f9de6?auto=format&fit=max&w=760&q=85",
    "P-1007": "https://images.unsplash.com/photo-1717127491253-5ecd4536447e?auto=format&fit=max&w=760&q=85",
    "P-1009": "https://images.unsplash.com/photo-1602185335134-2d072c07703c?auto=format&fit=max&w=760&q=85",
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
