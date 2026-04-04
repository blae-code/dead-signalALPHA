"""
Loot Intelligence System
========================
Maps items to probable scavenging locations/POIs in HumanitZ.
Provides actionable intel for players seeking specific resources.
"""

from fastapi import APIRouter, Request, HTTPException
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/loot-intel", tags=["loot-intel"])

db = None
get_current_user = None

# ---------------------------------------------------------------------------
# HumanitZ Loot Intelligence Database
# Each item maps to locations where it can commonly be found,
# with a probability tier (high/medium/low) for each location.
# ---------------------------------------------------------------------------

LOCATION_DATABASE = {
    # --- POI Definitions ---
    "Hospital": {"type": "medical", "danger": "high", "description": "Medical supplies, antibiotics, first aid. Heavy zombie presence."},
    "Pharmacy": {"type": "medical", "danger": "medium", "description": "Painkillers, bandages, basic meds. Usually in towns."},
    "Military Base": {"type": "military", "danger": "very_high", "description": "Top-tier weapons, ammo, MREs. Extremely dangerous."},
    "Police Station": {"type": "military", "danger": "high", "description": "Pistols, 9mm ammo, body armor. Moderate zombie density."},
    "Fire Station": {"type": "utility", "danger": "medium", "description": "Axes, first aid, fuel cans. Good early-game loot."},
    "Gas Station": {"type": "utility", "danger": "low", "description": "Fuel, snacks, basic tools. Low risk scavenging."},
    "Supermarket": {"type": "food", "danger": "medium", "description": "Canned food, water, backpacks. Often contested."},
    "Farm": {"type": "food", "danger": "low", "description": "Fresh food, wood, basic tools. Safe but limited loot."},
    "Hardware Store": {"type": "construction", "danger": "medium", "description": "Nails, tools, metal sheets. Essential for base building."},
    "Lumber Yard": {"type": "construction", "danger": "low", "description": "Wood planks, nails, axes. Usually on outskirts."},
    "Construction Site": {"type": "construction", "danger": "medium", "description": "Concrete mix, metal sheets, toolboxes. High material yield."},
    "Industrial Warehouse": {"type": "construction", "danger": "medium", "description": "Bulk materials, metal, batteries. Large buildings."},
    "Residential House": {"type": "residential", "danger": "low", "description": "Basic supplies, food, melee weapons. Everywhere."},
    "Garage / Auto Shop": {"type": "vehicle", "danger": "low", "description": "Tires, fuel, toolboxes, batteries. Vehicle repair."},
    "Hunting Cabin": {"type": "wilderness", "danger": "low", "description": "Shotguns, shells, fresh meat, backpacks. Remote."},
    "Campsite": {"type": "wilderness", "danger": "low", "description": "Basic survival gear, wood, bandages. Wilderness areas."},
    "School": {"type": "residential", "danger": "medium", "description": "Backpacks, melee weapons, basic supplies."},
    "Gun Store": {"type": "military", "danger": "high", "description": "Weapons, ammo variety. Rare POI, always contested."},
    "Medical Tent": {"type": "medical", "danger": "medium", "description": "Field medical supplies. Near crash sites or camps."},
    "Crashed Helicopter": {"type": "military", "danger": "high", "description": "Rare military gear, MREs, 5.56 ammo. Random spawn."},
    "Forest / Wilderness": {"type": "wilderness", "danger": "low", "description": "Wood from trees, wild game. Infinite wood source."},
}

# Item -> [(location, probability)]
# probability: "high" (very common here), "medium" (decent chance), "low" (rare find)
ITEM_LOCATIONS = {
    "Canned Food": [
        ("Supermarket", "high"), ("Residential House", "medium"), ("Gas Station", "medium"),
        ("Farm", "low"), ("Campsite", "low"),
    ],
    "Fresh Meat": [
        ("Hunting Cabin", "high"), ("Farm", "high"), ("Forest / Wilderness", "medium"),
    ],
    "MRE": [
        ("Military Base", "high"), ("Crashed Helicopter", "high"), ("Police Station", "low"),
    ],
    "Water Bottle": [
        ("Supermarket", "high"), ("Gas Station", "medium"), ("Residential House", "medium"),
        ("Campsite", "medium"), ("Pharmacy", "low"),
    ],
    "Water Purifier": [
        ("Hardware Store", "medium"), ("Industrial Warehouse", "low"), ("Campsite", "low"),
    ],
    "9mm Ammo": [
        ("Police Station", "high"), ("Gun Store", "high"), ("Military Base", "medium"),
        ("Residential House", "low"),
    ],
    "5.56 Ammo": [
        ("Military Base", "high"), ("Crashed Helicopter", "high"), ("Gun Store", "medium"),
    ],
    "12ga Shells": [
        ("Hunting Cabin", "high"), ("Gun Store", "high"), ("Police Station", "medium"),
        ("Farm", "low"),
    ],
    "Bandage": [
        ("Pharmacy", "high"), ("Hospital", "high"), ("Medical Tent", "high"),
        ("Residential House", "medium"), ("Campsite", "medium"),
    ],
    "First Aid Kit": [
        ("Hospital", "high"), ("Medical Tent", "high"), ("Pharmacy", "medium"),
        ("Fire Station", "medium"), ("Military Base", "low"),
    ],
    "Antibiotics": [
        ("Hospital", "high"), ("Medical Tent", "medium"), ("Pharmacy", "medium"),
    ],
    "Painkillers": [
        ("Pharmacy", "high"), ("Hospital", "medium"), ("Residential House", "low"),
        ("Medical Tent", "medium"),
    ],
    "Wood Planks": [
        ("Lumber Yard", "high"), ("Forest / Wilderness", "high"),
        ("Construction Site", "medium"), ("Farm", "medium"), ("Hardware Store", "medium"),
    ],
    "Metal Sheets": [
        ("Industrial Warehouse", "high"), ("Construction Site", "high"),
        ("Hardware Store", "medium"), ("Garage / Auto Shop", "low"),
    ],
    "Nails": [
        ("Hardware Store", "high"), ("Lumber Yard", "high"),
        ("Construction Site", "medium"), ("Residential House", "low"),
    ],
    "Concrete Mix": [
        ("Construction Site", "high"), ("Industrial Warehouse", "medium"),
        ("Hardware Store", "medium"),
    ],
    "Pistol": [
        ("Police Station", "high"), ("Gun Store", "high"),
        ("Military Base", "medium"), ("Residential House", "low"),
    ],
    "Shotgun": [
        ("Hunting Cabin", "high"), ("Gun Store", "high"),
        ("Police Station", "medium"), ("Farm", "low"),
    ],
    "Assault Rifle": [
        ("Military Base", "high"), ("Crashed Helicopter", "high"),
        ("Gun Store", "medium"),
    ],
    "Melee Weapon": [
        ("Residential House", "high"), ("School", "high"),
        ("Hardware Store", "medium"), ("Fire Station", "medium"), ("Farm", "medium"),
    ],
    "Battery": [
        ("Industrial Warehouse", "high"), ("Garage / Auto Shop", "high"),
        ("Hardware Store", "medium"), ("Gas Station", "low"),
    ],
    "Fuel Can": [
        ("Gas Station", "high"), ("Garage / Auto Shop", "high"),
        ("Fire Station", "medium"), ("Industrial Warehouse", "low"),
    ],
    "Tire": [
        ("Garage / Auto Shop", "high"), ("Gas Station", "medium"),
        ("Industrial Warehouse", "medium"),
    ],
    "Backpack": [
        ("School", "high"), ("Supermarket", "medium"), ("Campsite", "medium"),
        ("Hunting Cabin", "medium"), ("Residential House", "low"),
    ],
    "Toolbox": [
        ("Hardware Store", "high"), ("Garage / Auto Shop", "high"),
        ("Construction Site", "medium"), ("Industrial Warehouse", "medium"),
        ("Fire Station", "low"),
    ],
}

# Common OCR alias mappings for misspellings
OCR_ALIASES = {
    "wod planks": "Wood Planks",
    "wood plank": "Wood Planks",
    "woodplanks": "Wood Planks",
    "metl sheets": "Metal Sheets",
    "metal sheet": "Metal Sheets",
    "metalsheets": "Metal Sheets",
    "caned food": "Canned Food",
    "canned foods": "Canned Food",
    "cannedfood": "Canned Food",
    "water botl": "Water Bottle",
    "waterbottle": "Water Bottle",
    "water bottles": "Water Bottle",
    "frstaid kit": "First Aid Kit",
    "first aid": "First Aid Kit",
    "firstaidkit": "First Aid Kit",
    "first aidkit": "First Aid Kit",
    "bandages": "Bandage",
    "bandge": "Bandage",
    "antibiotic": "Antibiotics",
    "anti biotics": "Antibiotics",
    "painkiller": "Painkillers",
    "pain killers": "Painkillers",
    "9mm": "9mm Ammo",
    "9mm ammos": "9mm Ammo",
    "556 ammo": "5.56 Ammo",
    "5.56ammo": "5.56 Ammo",
    "12ga": "12ga Shells",
    "12 gauge": "12ga Shells",
    "shotgun shells": "12ga Shells",
    "nals": "Nails",
    "nail": "Nails",
    "concrete": "Concrete Mix",
    "concretemix": "Concrete Mix",
    "fuel": "Fuel Can",
    "fuelcan": "Fuel Can",
    "asault rifle": "Assault Rifle",
    "assault rifl": "Assault Rifle",
    "melee": "Melee Weapon",
    "bat": "Melee Weapon",
    "axe": "Melee Weapon",
    "machete": "Melee Weapon",
    "tires": "Tire",
    "backpacks": "Backpack",
    "back pack": "Backpack",
    "toolboxes": "Toolbox",
    "tool box": "Toolbox",
    "batteries": "Battery",
    "battry": "Battery",
    "mre": "MRE",
    "mres": "MRE",
    "fresh meat": "Fresh Meat",
    "freshmeat": "Fresh Meat",
    "water purifier": "Water Purifier",
    "waterpurifier": "Water Purifier",
    "pistols": "Pistol",
    "shotguns": "Shotgun",
    "generators": "Generator",
    "gen": "Generator",
    "molotov": "Molotov Cocktail",
    "molotov cocktails": "Molotov Cocktail",
    "storage crates": "Storage Crate",
    "wooden barricades": "Wooden Barricade",
    "metal walls": "Metal Wall",
    "campfires": "Campfire",
    "camp fire": "Campfire",
    "rain collectors": "Rain Collector",
    "raincollector": "Rain Collector",
    "splints": "Splint",
    "improvised suppressor": "Improvised Suppressor",
    "suppressor": "Improvised Suppressor",
    "concrete walls": "Concrete Wall",
}

KNOWN_ITEMS = set(ITEM_LOCATIONS.keys()) | {
    'Wooden Barricade', 'Metal Wall', 'Campfire', 'Rain Collector', 'Splint',
    'Improvised Suppressor', 'Storage Crate', 'Generator', 'Concrete Wall',
    'Molotov Cocktail',
}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/locations")
async def get_all_locations(request: Request):
    """Get the full location database."""
    await get_current_user(request)
    return {
        "locations": {k: v for k, v in LOCATION_DATABASE.items()},
        "count": len(LOCATION_DATABASE),
    }


@router.get("/items")
async def get_all_item_intel(request: Request):
    """Get loot intel for all items."""
    await get_current_user(request)
    result = []
    for item_name, locations in ITEM_LOCATIONS.items():
        result.append({
            "item_name": item_name,
            "locations": [
                {
                    "name": loc,
                    "probability": prob,
                    "info": LOCATION_DATABASE.get(loc, {}),
                }
                for loc, prob in locations
            ],
        })
    return result


@router.get("/items/{item_name}")
async def get_item_intel(item_name: str, request: Request):
    """Get loot intel for a specific item."""
    await get_current_user(request)
    locations = ITEM_LOCATIONS.get(item_name)
    if not locations:
        raise HTTPException(status_code=404, detail=f"No loot intel for '{item_name}'")
    return {
        "item_name": item_name,
        "locations": [
            {
                "name": loc,
                "probability": prob,
                "info": LOCATION_DATABASE.get(loc, {}),
            }
            for loc, prob in locations
        ],
    }


@router.post("/resolve-aliases")
async def resolve_aliases(request: Request):
    """
    Given a list of OCR-extracted item names, resolve aliases and
    flag unknown items. Returns corrected names + confidence.
    """
    await get_current_user(request)
    body = await request.json()
    items = body.get("items", [])

    results = []
    for entry in items[:200]:
        raw_name = str(entry.get("name", "")).strip()
        quantity = entry.get("quantity", 1)

        if not raw_name:
            continue

        # Direct match
        if raw_name in KNOWN_ITEMS:
            results.append({
                "original": raw_name,
                "resolved": raw_name,
                "quantity": quantity,
                "confidence": "exact",
                "has_intel": raw_name in ITEM_LOCATIONS,
            })
            continue

        # Alias match (case-insensitive)
        lower = raw_name.lower().strip()
        alias_match = OCR_ALIASES.get(lower)
        if alias_match:
            results.append({
                "original": raw_name,
                "resolved": alias_match,
                "quantity": quantity,
                "confidence": "alias",
                "has_intel": alias_match in ITEM_LOCATIONS,
            })
            continue

        # Fuzzy: check if any known item starts with or contains the text
        partial = None
        for known in KNOWN_ITEMS:
            if known.lower().startswith(lower) or lower in known.lower():
                partial = known
                break

        if partial:
            results.append({
                "original": raw_name,
                "resolved": partial,
                "quantity": quantity,
                "confidence": "partial",
                "has_intel": partial in ITEM_LOCATIONS,
            })
        else:
            results.append({
                "original": raw_name,
                "resolved": raw_name,
                "quantity": quantity,
                "confidence": "unknown",
                "has_intel": False,
            })

    return {"items": results}


@router.post("/shortfall-intel")
async def shortfall_intel(request: Request):
    """
    Given a list of items with quantities (shortfall from crafting),
    return where to find each missing item.
    """
    await get_current_user(request)
    body = await request.json()
    items = body.get("items", [])

    results = []
    for entry in items[:50]:
        item_name = str(entry.get("item", entry.get("item_name", ""))).strip()
        quantity = entry.get("quantity", 1)
        locations = ITEM_LOCATIONS.get(item_name, [])
        results.append({
            "item_name": item_name,
            "quantity_needed": quantity,
            "locations": [
                {
                    "name": loc,
                    "probability": prob,
                    "danger": LOCATION_DATABASE.get(loc, {}).get("danger", "unknown"),
                    "type": LOCATION_DATABASE.get(loc, {}).get("type", "unknown"),
                }
                for loc, prob in locations
            ],
        })

    return {"intel": results}


def init_loot_intel_routes(database, auth_fn):
    global db, get_current_user
    db = database
    get_current_user = auth_fn
    return router
