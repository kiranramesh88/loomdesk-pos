"""GST state codes and GSTIN checks for the store's own details.

A GSTIN is 15 characters: the two-digit state code, the 10-character PAN, an entity number, `Z`, and a
check character (a base-36 Luhn-style checksum over the first 14).
"""

import re

# GST state and union-territory codes (the first two digits of a GSTIN).
STATE_CODES: dict[str, str] = {
    "Jammu and Kashmir": "01",
    "Himachal Pradesh": "02",
    "Punjab": "03",
    "Chandigarh": "04",
    "Uttarakhand": "05",
    "Haryana": "06",
    "Delhi": "07",
    "Rajasthan": "08",
    "Uttar Pradesh": "09",
    "Bihar": "10",
    "Sikkim": "11",
    "Arunachal Pradesh": "12",
    "Nagaland": "13",
    "Manipur": "14",
    "Mizoram": "15",
    "Tripura": "16",
    "Meghalaya": "17",
    "Assam": "18",
    "West Bengal": "19",
    "Jharkhand": "20",
    "Odisha": "21",
    "Chhattisgarh": "22",
    "Madhya Pradesh": "23",
    "Gujarat": "24",
    "Dadra and Nagar Haveli and Daman and Diu": "26",
    "Maharashtra": "27",
    "Karnataka": "29",
    "Goa": "30",
    "Lakshadweep": "31",
    "Kerala": "32",
    "Tamil Nadu": "33",
    "Puducherry": "34",
    "Andaman and Nicobar Islands": "35",
    "Telangana": "36",
    "Andhra Pradesh": "37",
    "Ladakh": "38",
}

STATES = sorted(STATE_CODES)

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_SHAPE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


def check_character(first14: str) -> str:
    total = 0
    for index, char in enumerate(first14):
        product = _ALPHABET.index(char) * (2 if index % 2 else 1)
        total += product // 36 + product % 36
    return _ALPHABET[(36 - total % 36) % 36]


def gstin_problem(gstin: str, state: str) -> str | None:
    """Why `gstin` can't be the store's GSTIN in `state`, or None if it can."""
    if not _SHAPE.match(gstin):
        return "A GSTIN is 15 characters, e.g. 32AAAAA0000A1ZB: state code, PAN, entity number, Z and a check character."
    if check_character(gstin[:14]) != gstin[14]:
        return "This GSTIN’s last character doesn’t match the rest. Check it against the registration certificate."
    code = STATE_CODES.get(state)
    if code and gstin[:2] != code:
        return f"A GSTIN registered in {state} starts with {code}."
    return None
