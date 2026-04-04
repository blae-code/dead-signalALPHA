"""
Base Planner / Blueprint System
================================
Players design base blueprints on a grid canvas, placing modules
(rooms/structures). Each module links to crafting recipes so the
system can aggregate total material requirements for the full build.
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/planner", tags=["planner"])

db = None
get_current_user = None

# ---------------------------------------------------------------------------
# Module catalog — what players can place on their base grid
# ---------------------------------------------------------------------------

MODULE_CATALOG = [
    {
        "module_type": "storage_room",
        "label": "Storage Room",
        "category": "utility",
        "size": 1,
        "description": "Secure item storage. Holds up to 20 item stacks.",
        "recipes_needed": [("Storage Crate", 2), ("Wooden Barricade", 1)],
        "color": "#c4841d",
    },
    {
        "module_type": "armory",
        "label": "Armory",
        "category": "military",
        "size": 1,
        "description": "Weapon and ammo storage with reinforced walls.",
        "recipes_needed": [("Metal Wall", 2), ("Storage Crate", 1)],
        "color": "#8b3a3a",
    },
    {
        "module_type": "med_bay",
        "label": "Med Bay",
        "category": "medical",
        "size": 1,
        "description": "Medical treatment station. Heal injuries and cure infections.",
        "recipes_needed": [("Wooden Barricade", 1)],
        "color": "#3a8b6b",
    },
    {
        "module_type": "crafting_station",
        "label": "Crafting Station",
        "category": "utility",
        "size": 1,
        "description": "Workbench for crafting items and equipment.",
        "recipes_needed": [("Storage Crate", 1)],
        "color": "#3a6b8b",
    },
    {
        "module_type": "watchtower",
        "label": "Watch Tower",
        "category": "defense",
        "size": 1,
        "description": "Elevated lookout. Extends visual range for early threat detection.",
        "recipes_needed": [("Wooden Barricade", 2), ("Metal Wall", 1)],
        "color": "#6b7a3d",
    },
    {
        "module_type": "generator_room",
        "label": "Generator Room",
        "category": "utility",
        "size": 1,
        "description": "Powers lights and equipment. Loud — attracts zombies.",
        "recipes_needed": [("Generator", 1), ("Metal Wall", 1)],
        "color": "#c4841d",
    },
    {
        "module_type": "kitchen",
        "label": "Kitchen",
        "category": "survival",
        "size": 1,
        "description": "Cook food and purify water. Essential for sustenance.",
        "recipes_needed": [("Campfire", 1), ("Rain Collector", 1)],
        "color": "#8b6b3a",
    },
    {
        "module_type": "barricade",
        "label": "Barricade Wall",
        "category": "defense",
        "size": 1,
        "description": "Wooden defensive barrier. Slows zombies.",
        "recipes_needed": [("Wooden Barricade", 2)],
        "color": "#88837a",
    },
    {
        "module_type": "metal_wall",
        "label": "Reinforced Wall",
        "category": "defense",
        "size": 1,
        "description": "Metal reinforcement. Strong zombie resistance.",
        "recipes_needed": [("Metal Wall", 2)],
        "color": "#5a5a5a",
    },
    {
        "module_type": "concrete_bunker",
        "label": "Concrete Bunker",
        "category": "defense",
        "size": 1,
        "description": "Heaviest fortification. Nearly indestructible.",
        "recipes_needed": [("Concrete Wall", 2), ("Metal Wall", 1)],
        "color": "#4a4a4a",
    },
    {
        "module_type": "sleeping_quarters",
        "label": "Sleeping Quarters",
        "category": "survival",
        "size": 1,
        "description": "Rest area for stamina recovery and save point.",
        "recipes_needed": [("Wooden Barricade", 1)],
        "color": "#5c4a3a",
    },
    {
        "module_type": "empty",
        "label": "Empty Plot",
        "category": "none",
        "size": 1,
        "description": "Reserved space for future expansion.",
        "recipes_needed": [],
        "color": "#2a2520",
    },
]

MODULE_TYPES = {m["module_type"] for m in MODULE_CATALOG}

# Crafting recipes (mirrors inventory.py)
CRAFTING_RECIPES = {
    'Wooden Barricade':    [('Wood Planks', 4), ('Nails', 6)],
    'Metal Wall':          [('Metal Sheets', 3), ('Nails', 4)],
    'Campfire':            [('Wood Planks', 2)],
    'Rain Collector':      [('Wood Planks', 3), ('Metal Sheets', 1)],
    'Splint':              [('Wood Planks', 1), ('Bandage', 1)],
    'Improvised Suppressor': [('Water Bottle', 1), ('Nails', 2)],
    'Storage Crate':       [('Wood Planks', 6), ('Nails', 8)],
    'Generator':           [('Metal Sheets', 2), ('Battery', 1), ('Fuel Can', 1)],
    'Concrete Wall':       [('Concrete Mix', 2), ('Metal Sheets', 1)],
    'Molotov Cocktail':    [('Fuel Can', 1), ('Bandage', 1)],
}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class BlueprintModule(BaseModel):
    x: int
    y: int
    module_type: str

class BlueprintInput(BaseModel):
    name: str
    grid_size: int = 8
    modules: List[BlueprintModule] = []
    notes: str = ""

class BlueprintUpdate(BaseModel):
    name: Optional[str] = None
    modules: Optional[List[BlueprintModule]] = None
    notes: Optional[str] = None


def _now():
    return datetime.now(timezone.utc).isoformat()


def _aggregate_materials(modules_list):
    """Calculate total raw materials needed for all placed modules."""
    recipe_totals = {}
    raw_totals = {}

    for mod in modules_list:
        catalog_entry = next((m for m in MODULE_CATALOG if m["module_type"] == mod["module_type"]), None)
        if not catalog_entry:
            continue
        for recipe_name, qty in catalog_entry["recipes_needed"]:
            recipe_totals[recipe_name] = recipe_totals.get(recipe_name, 0) + qty

    for recipe_name, qty in recipe_totals.items():
        ingredients = CRAFTING_RECIPES.get(recipe_name, [])
        for mat_name, per_craft in ingredients:
            raw_totals[mat_name] = raw_totals.get(mat_name, 0) + (per_craft * qty)

    return {
        "recipes": [{"name": k, "quantity": v} for k, v in sorted(recipe_totals.items())],
        "raw_materials": [{"name": k, "quantity": v} for k, v in sorted(raw_totals.items())],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/modules")
async def get_module_catalog(request: Request):
    """Get available base modules for the planner."""
    await get_current_user(request)
    return MODULE_CATALOG


@router.get("/blueprints")
async def list_blueprints(request: Request):
    """List my saved base blueprints."""
    user = await get_current_user(request)
    blueprints = await db.blueprints.find(
        {"owner_id": user["_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    return blueprints


@router.post("/blueprints")
async def create_blueprint(data: BlueprintInput, request: Request):
    """Save a new base blueprint."""
    user = await get_current_user(request)
    name = data.name.strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Blueprint name is required")

    grid_size = max(4, min(data.grid_size, 16))
    modules = []
    for m in data.modules[:256]:
        if m.module_type not in MODULE_TYPES:
            continue
        if m.module_type == "empty":
            continue
        if 0 <= m.x < grid_size and 0 <= m.y < grid_size:
            modules.append({"x": m.x, "y": m.y, "module_type": m.module_type})

    materials = _aggregate_materials(modules)
    now = _now()
    doc = {
        "blueprint_id": str(ObjectId()),
        "owner_id": user["_id"],
        "owner_callsign": user.get("callsign", "unknown"),
        "name": name,
        "grid_size": grid_size,
        "modules": modules,
        "materials": materials,
        "notes": data.notes.strip()[:500],
        "created_at": now,
        "updated_at": now,
    }
    await db.blueprints.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/blueprints/{blueprint_id}")
async def get_blueprint(blueprint_id: str, request: Request):
    """Get a specific blueprint."""
    user = await get_current_user(request)
    bp = await db.blueprints.find_one(
        {"blueprint_id": blueprint_id, "owner_id": user["_id"]}, {"_id": 0}
    )
    if not bp:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    return bp


@router.put("/blueprints/{blueprint_id}")
async def update_blueprint(blueprint_id: str, data: BlueprintUpdate, request: Request):
    """Update an existing blueprint."""
    user = await get_current_user(request)
    bp = await db.blueprints.find_one({"blueprint_id": blueprint_id, "owner_id": user["_id"]})
    if not bp:
        raise HTTPException(status_code=404, detail="Blueprint not found")

    updates = {"updated_at": _now()}
    if data.name is not None:
        name = data.name.strip()[:80]
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        updates["name"] = name
    if data.notes is not None:
        updates["notes"] = data.notes.strip()[:500]
    if data.modules is not None:
        grid_size = bp.get("grid_size", 8)
        modules = []
        for m in data.modules[:256]:
            if m.module_type not in MODULE_TYPES or m.module_type == "empty":
                continue
            if 0 <= m.x < grid_size and 0 <= m.y < grid_size:
                modules.append({"x": m.x, "y": m.y, "module_type": m.module_type})
        updates["modules"] = modules
        updates["materials"] = _aggregate_materials(modules)

    await db.blueprints.update_one(
        {"blueprint_id": blueprint_id}, {"$set": updates}
    )
    return {"message": "Blueprint updated"}


@router.delete("/blueprints/{blueprint_id}")
async def delete_blueprint(blueprint_id: str, request: Request):
    """Delete a blueprint."""
    user = await get_current_user(request)
    result = await db.blueprints.delete_one(
        {"blueprint_id": blueprint_id, "owner_id": user["_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    return {"message": "Blueprint deleted"}


@router.post("/blueprints/{blueprint_id}/calculate")
async def calculate_blueprint(blueprint_id: str, request: Request):
    """
    Cross-reference a blueprint's material requirements against
    the player's current inventory to show what's needed vs owned.
    """
    user = await get_current_user(request)
    bp = await db.blueprints.find_one(
        {"blueprint_id": blueprint_id, "owner_id": user["_id"]}, {"_id": 0}
    )
    if not bp:
        raise HTTPException(status_code=404, detail="Blueprint not found")

    inv_doc = await db.player_inventory.find_one(
        {"user_id": user["_id"]}, {"_id": 0, "items": 1}
    ) or {}
    inventory = {it["item_name"]: it["quantity"] for it in (inv_doc.get("items") or [])}

    materials = bp.get("materials", {})
    raw_mats = materials.get("raw_materials", [])

    breakdown = []
    shortfall = []
    for mat in raw_mats:
        name = mat["name"]
        needed = mat["quantity"]
        have = inventory.get(name, 0)
        short = max(0, needed - have)
        breakdown.append({
            "item": name,
            "needed": needed,
            "have": min(have, needed),
            "short": short,
        })
        if short > 0:
            shortfall.append({"item": name, "quantity": short})

    return {
        "blueprint_name": bp.get("name"),
        "module_count": len(bp.get("modules", [])),
        "recipes": materials.get("recipes", []),
        "breakdown": breakdown,
        "shortfall": shortfall,
        "can_build": len(shortfall) == 0 and len(bp.get("modules", [])) > 0,
    }


def init_planner_routes(database, auth_fn):
    global db, get_current_user
    db = database
    get_current_user = auth_fn
    return router
