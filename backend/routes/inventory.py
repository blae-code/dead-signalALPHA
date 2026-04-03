from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

db = None
get_current_user = None

# ---------------------------------------------------------------------------
# Shared constants (mirrors economy.py — avoids circular import)
# ---------------------------------------------------------------------------
RESOURCE_NAMES = {
    'Canned Food', 'Fresh Meat', 'MRE', 'Water Bottle', 'Water Purifier',
    '9mm Ammo', '5.56 Ammo', '12ga Shells', 'Bandage', 'First Aid Kit',
    'Antibiotics', 'Painkillers', 'Wood Planks', 'Metal Sheets', 'Nails',
    'Concrete Mix', 'Pistol', 'Shotgun', 'Assault Rifle', 'Melee Weapon',
    'Battery', 'Fuel Can', 'Tire', 'Backpack', 'Toolbox',
    # crafting outputs
    'Wooden Barricade', 'Metal Wall', 'Campfire', 'Rain Collector', 'Splint',
    'Improvised Suppressor', 'Storage Crate', 'Generator', 'Concrete Wall',
    'Molotov Cocktail',
}

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

CACHE_VISIBILITIES = {'private', 'faction', 'public'}
CACHE_STATUSES = {'active', 'raided', 'unknown', 'emptied'}
BASE_TYPES = {'personal', 'faction', 'outpost', 'safe_house'}
BASE_STATUSES = {'active', 'under_construction', 'abandoned', 'destroyed'}
BASE_VISIBILITIES = {'private', 'faction', 'public'}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class InventoryItem(BaseModel):
    item_name: str
    quantity: int
    notes: str = ''   # e.g. "at main base", "on me"

class InventoryUpdate(BaseModel):
    items: List[InventoryItem]

class CacheItem(BaseModel):
    item_name: str        # free-text — caches can hold anything
    quantity: int = 1

class CacheInput(BaseModel):
    name: str
    location_name: str = ''
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    visibility: str = 'private'   # private, faction, public
    contents: List[CacheItem] = []
    status: str = 'active'
    notes: str = ''

class CacheUpdate(BaseModel):
    name: Optional[str] = None
    location_name: Optional[str] = None
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    visibility: Optional[str] = None
    contents: Optional[List[CacheItem]] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class BaseRoom(BaseModel):
    name: str
    description: str = ''

class BaseStorageItem(BaseModel):
    item_name: str
    quantity: int = 1

class BaseInput(BaseModel):
    name: str
    base_type: str = 'personal'   # personal, faction, outpost, safe_house
    visibility: str = 'private'
    location_name: str = ''
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    rooms: List[BaseRoom] = []
    storage: List[BaseStorageItem] = []
    defenses: List[str] = []       # free-text list: "metal wall north", "barbed wire perimeter"
    status: str = 'active'
    notes: str = ''

class BaseUpdate(BaseModel):
    name: Optional[str] = None
    base_type: Optional[str] = None
    visibility: Optional[str] = None
    location_name: Optional[str] = None
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    rooms: Optional[List[BaseRoom]] = None
    storage: Optional[List[BaseStorageItem]] = None
    defenses: Optional[List[str]] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class CraftingQueueItem(BaseModel):
    recipe_name: str
    quantity: int = 1

class CraftingQueueUpdate(BaseModel):
    items: List[CraftingQueueItem]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_user(request: Request):
    return await get_current_user(request)


def _clean(value: str, field: str, *, min_len=1, max_len=100) -> str:
    v = (value or '').strip()
    if len(v) < min_len:
        raise HTTPException(status_code=400, detail=f'{field} is required')
    if len(v) > max_len:
        raise HTTPException(status_code=400, detail=f'{field} max {max_len} chars')
    return v


def _ensure(value: str, allowed: set, field: str) -> str:
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f'Invalid {field}')
    return value


async def _my_faction_id(user_id: str) -> Optional[str]:
    m = await db.faction_members.find_one({'user_id': user_id, 'status': 'active'}, {'_id': 0, 'faction_id': 1})
    return m['faction_id'] if m else None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_contents(items: List[CacheItem]) -> list:
    seen: dict = {}
    for it in items[:100]:
        name = (it.item_name or '').strip()[:80]
        if not name:
            continue
        qty = max(0, min(int(it.quantity), 9999))
        seen[name] = seen.get(name, 0) + qty
    return [{'item_name': k, 'quantity': v} for k, v in seen.items() if v > 0]


def _build_storage(items: List[BaseStorageItem]) -> list:
    seen: dict = {}
    for it in items[:200]:
        name = (it.item_name or '').strip()[:80]
        if not name:
            continue
        qty = max(0, min(int(it.quantity), 99999))
        seen[name] = seen.get(name, 0) + qty
    return [{'item_name': k, 'quantity': v} for k, v in seen.items() if v > 0]


# ---------------------------------------------------------------------------
# PERSONAL INVENTORY
# ---------------------------------------------------------------------------

@router.get('/items')
async def get_inventory(request: Request):
    """Get my tracked personal inventory."""
    user = await _get_user(request)
    doc = await db.player_inventory.find_one({'user_id': user['_id']}, {'_id': 0})
    if not doc:
        return {'user_id': user['_id'], 'callsign': user.get('callsign'), 'items': [], 'updated_at': None}
    return doc


@router.put('/items')
async def set_inventory(data: InventoryUpdate, request: Request):
    """Replace my full inventory snapshot."""
    user = await _get_user(request)
    now = _now()
    # Deduplicate and validate
    seen: dict = {}
    for it in data.items[:200]:
        name = (it.item_name or '').strip()
        if not name:
            continue
        if name not in RESOURCE_NAMES:
            raise HTTPException(status_code=400, detail=f'Unknown item: {name}')
        qty = max(0, min(int(it.quantity), 99999))
        seen[name] = {'item_name': name, 'quantity': qty, 'notes': (it.notes or '').strip()[:100]}
    items = [v for v in seen.values() if v['quantity'] > 0]

    await db.player_inventory.update_one(
        {'user_id': user['_id']},
        {'$set': {'callsign': user.get('callsign'), 'items': items, 'updated_at': now}},
        upsert=True,
    )
    return {'message': 'Inventory saved', 'item_count': len(items), 'updated_at': now}


@router.patch('/items')
async def adjust_inventory(data: InventoryUpdate, request: Request):
    """
    Merge-update inventory: positive qty adds/sets, zero qty removes the item.
    Items not mentioned are left unchanged.
    """
    user = await _get_user(request)
    now = _now()

    existing = await db.player_inventory.find_one({'user_id': user['_id']}, {'_id': 0, 'items': 1}) or {}
    current: dict = {it['item_name']: it for it in (existing.get('items') or [])}

    for it in data.items[:200]:
        name = (it.item_name or '').strip()
        if not name:
            continue
        if name not in RESOURCE_NAMES:
            raise HTTPException(status_code=400, detail=f'Unknown item: {name}')
        qty = max(0, min(int(it.quantity), 99999))
        if qty == 0:
            current.pop(name, None)
        else:
            current[name] = {'item_name': name, 'quantity': qty, 'notes': (it.notes or '').strip()[:100]}

    items = list(current.values())
    await db.player_inventory.update_one(
        {'user_id': user['_id']},
        {'$set': {'callsign': user.get('callsign'), 'items': items, 'updated_at': now}},
        upsert=True,
    )
    return {'message': 'Inventory updated', 'item_count': len(items)}


# ---------------------------------------------------------------------------
# CACHES
# ---------------------------------------------------------------------------

@router.get('/caches')
async def list_caches(request: Request):
    """List caches I own plus faction-shared caches visible to me."""
    user = await _get_user(request)
    uid = user['_id']
    faction_id = await _my_faction_id(uid)

    or_clauses: list = [{'owner_id': uid}]
    if faction_id:
        or_clauses.append({'faction_id': faction_id, 'visibility': 'faction'})
    or_clauses.append({'visibility': 'public'})

    caches = await db.caches.find(
        {'$or': or_clauses}, {'_id': 0}
    ).sort('updated_at', -1).to_list(200)
    return caches


@router.post('/caches')
async def create_cache(data: CacheInput, request: Request):
    """Create a new supply cache."""
    user = await _get_user(request)
    uid = user['_id']
    _ensure(data.visibility, CACHE_VISIBILITIES, 'visibility')
    _ensure(data.status, CACHE_STATUSES, 'status')
    name = _clean(data.name, 'Cache name', max_len=80)

    faction_id = await _my_faction_id(uid) if data.visibility == 'faction' else None

    now = _now()
    doc = {
        'cache_id': str(ObjectId()),
        'name': name,
        'owner_id': uid,
        'owner_callsign': user.get('callsign', 'unknown'),
        'faction_id': faction_id,
        'visibility': data.visibility,
        'location_name': (data.location_name or '').strip()[:100],
        'grid_x': data.grid_x,
        'grid_y': data.grid_y,
        'contents': _build_contents(data.contents),
        'status': data.status,
        'notes': (data.notes or '').strip()[:500],
        'created_at': now,
        'updated_at': now,
    }
    await db.caches.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.get('/caches/{cache_id}')
async def get_cache(cache_id: str, request: Request):
    user = await _get_user(request)
    uid = user['_id']
    cache = await db.caches.find_one({'cache_id': cache_id}, {'_id': 0})
    if not cache:
        raise HTTPException(status_code=404, detail='Cache not found')
    # Access check
    faction_id = await _my_faction_id(uid)
    is_owner = cache['owner_id'] == uid
    is_faction_visible = cache.get('visibility') == 'faction' and faction_id and cache.get('faction_id') == faction_id
    is_public = cache.get('visibility') == 'public'
    if not (is_owner or is_faction_visible or is_public):
        raise HTTPException(status_code=403, detail='Access denied')
    return cache


@router.patch('/caches/{cache_id}')
async def update_cache(cache_id: str, data: CacheUpdate, request: Request):
    user = await _get_user(request)
    uid = user['_id']
    cache = await db.caches.find_one({'cache_id': cache_id})
    if not cache:
        raise HTTPException(status_code=404, detail='Cache not found')
    if cache['owner_id'] != uid:
        raise HTTPException(status_code=403, detail='Only cache owner can edit')

    updates: dict = {'updated_at': _now()}
    if data.name is not None:
        updates['name'] = _clean(data.name, 'Cache name', max_len=80)
    if data.location_name is not None:
        updates['location_name'] = data.location_name.strip()[:100]
    if data.grid_x is not None:
        updates['grid_x'] = data.grid_x
    if data.grid_y is not None:
        updates['grid_y'] = data.grid_y
    if data.visibility is not None:
        _ensure(data.visibility, CACHE_VISIBILITIES, 'visibility')
        updates['visibility'] = data.visibility
        if data.visibility == 'faction':
            updates['faction_id'] = await _my_faction_id(uid)
        else:
            updates['faction_id'] = None
    if data.contents is not None:
        updates['contents'] = _build_contents(data.contents)
    if data.status is not None:
        _ensure(data.status, CACHE_STATUSES, 'status')
        updates['status'] = data.status
    if data.notes is not None:
        updates['notes'] = data.notes.strip()[:500]

    await db.caches.update_one({'cache_id': cache_id}, {'$set': updates})
    return {'message': 'Cache updated'}


@router.delete('/caches/{cache_id}')
async def delete_cache(cache_id: str, request: Request):
    user = await _get_user(request)
    cache = await db.caches.find_one({'cache_id': cache_id}, {'_id': 0, 'owner_id': 1})
    if not cache:
        raise HTTPException(status_code=404, detail='Cache not found')
    if cache['owner_id'] != user['_id']:
        raise HTTPException(status_code=403, detail='Only cache owner can delete')
    await db.caches.delete_one({'cache_id': cache_id})
    return {'message': 'Cache deleted'}


# ---------------------------------------------------------------------------
# BASES
# ---------------------------------------------------------------------------

@router.get('/bases')
async def list_bases(request: Request):
    """List my bases and faction bases I have access to."""
    user = await _get_user(request)
    uid = user['_id']
    faction_id = await _my_faction_id(uid)

    or_clauses: list = [{'owner_id': uid}]
    if faction_id:
        or_clauses.append({'faction_id': faction_id, 'visibility': {'$in': ['faction', 'public']}})
    or_clauses.append({'visibility': 'public'})

    bases = await db.bases.find(
        {'$or': or_clauses}, {'_id': 0}
    ).sort('updated_at', -1).to_list(100)
    return bases


@router.post('/bases')
async def create_base(data: BaseInput, request: Request):
    """Establish a new base."""
    user = await _get_user(request)
    uid = user['_id']
    _ensure(data.base_type, BASE_TYPES, 'base_type')
    _ensure(data.visibility, BASE_VISIBILITIES, 'visibility')
    _ensure(data.status, BASE_STATUSES, 'status')
    name = _clean(data.name, 'Base name', max_len=80)

    faction_id = await _my_faction_id(uid) if data.base_type in ('faction', 'outpost') else None

    rooms = [
        {'name': _clean(r.name, 'Room name', max_len=60), 'description': (r.description or '').strip()[:200]}
        for r in data.rooms[:20]
    ]
    defenses = [(d.strip()[:100]) for d in data.defenses[:50] if d.strip()]

    now = _now()
    doc = {
        'base_id': str(ObjectId()),
        'name': name,
        'owner_id': uid,
        'owner_callsign': user.get('callsign', 'unknown'),
        'faction_id': faction_id,
        'base_type': data.base_type,
        'visibility': data.visibility,
        'location_name': (data.location_name or '').strip()[:100],
        'grid_x': data.grid_x,
        'grid_y': data.grid_y,
        'rooms': rooms,
        'storage': _build_storage(data.storage),
        'defenses': defenses,
        'status': data.status,
        'notes': (data.notes or '').strip()[:1000],
        'created_at': now,
        'updated_at': now,
    }
    await db.bases.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.get('/bases/{base_id}')
async def get_base(base_id: str, request: Request):
    user = await _get_user(request)
    uid = user['_id']
    base = await db.bases.find_one({'base_id': base_id}, {'_id': 0})
    if not base:
        raise HTTPException(status_code=404, detail='Base not found')
    faction_id = await _my_faction_id(uid)
    is_owner = base['owner_id'] == uid
    is_faction = base.get('visibility') in ('faction', 'public') and faction_id and base.get('faction_id') == faction_id
    is_public = base.get('visibility') == 'public'
    if not (is_owner or is_faction or is_public):
        raise HTTPException(status_code=403, detail='Access denied')
    return base


@router.patch('/bases/{base_id}')
async def update_base(base_id: str, data: BaseUpdate, request: Request):
    user = await _get_user(request)
    uid = user['_id']
    base = await db.bases.find_one({'base_id': base_id})
    if not base:
        raise HTTPException(status_code=404, detail='Base not found')
    if base['owner_id'] != uid:
        raise HTTPException(status_code=403, detail='Only base owner can edit')

    updates: dict = {'updated_at': _now()}
    if data.name is not None:
        updates['name'] = _clean(data.name, 'Base name', max_len=80)
    if data.base_type is not None:
        updates['base_type'] = _ensure(data.base_type, BASE_TYPES, 'base_type')
    if data.visibility is not None:
        updates['visibility'] = _ensure(data.visibility, BASE_VISIBILITIES, 'visibility')
    if data.location_name is not None:
        updates['location_name'] = data.location_name.strip()[:100]
    if data.grid_x is not None:
        updates['grid_x'] = data.grid_x
    if data.grid_y is not None:
        updates['grid_y'] = data.grid_y
    if data.rooms is not None:
        updates['rooms'] = [
            {'name': _clean(r.name, 'Room name', max_len=60), 'description': (r.description or '').strip()[:200]}
            for r in data.rooms[:20]
        ]
    if data.storage is not None:
        updates['storage'] = _build_storage(data.storage)
    if data.defenses is not None:
        updates['defenses'] = [(d.strip()[:100]) for d in data.defenses[:50] if d.strip()]
    if data.status is not None:
        updates['status'] = _ensure(data.status, BASE_STATUSES, 'status')
    if data.notes is not None:
        updates['notes'] = data.notes.strip()[:1000]

    await db.bases.update_one({'base_id': base_id}, {'$set': updates})
    return {'message': 'Base updated'}


@router.delete('/bases/{base_id}')
async def delete_base(base_id: str, request: Request):
    user = await _get_user(request)
    base = await db.bases.find_one({'base_id': base_id}, {'_id': 0, 'owner_id': 1})
    if not base:
        raise HTTPException(status_code=404, detail='Base not found')
    if base['owner_id'] != user['_id']:
        raise HTTPException(status_code=403, detail='Only base owner can delete')
    await db.bases.delete_one({'base_id': base_id})
    return {'message': 'Base deleted'}


# ---------------------------------------------------------------------------
# CRAFTING QUEUE
# ---------------------------------------------------------------------------

@router.get('/crafting-queue')
async def get_crafting_queue(request: Request):
    """Get my crafting queue."""
    user = await _get_user(request)
    doc = await db.crafting_queues.find_one({'user_id': user['_id']}, {'_id': 0})
    if not doc:
        return {'items': [], 'updated_at': None}
    return doc


@router.put('/crafting-queue')
async def set_crafting_queue(data: CraftingQueueUpdate, request: Request):
    """Replace crafting queue."""
    user = await _get_user(request)
    now = _now()
    items = []
    for it in data.items[:50]:
        name = (it.recipe_name or '').strip()
        if name not in CRAFTING_RECIPES:
            raise HTTPException(status_code=400, detail=f'Unknown recipe: {name}')
        qty = max(1, min(int(it.quantity), 999))
        items.append({'recipe_name': name, 'quantity': qty})
    await db.crafting_queues.update_one(
        {'user_id': user['_id']},
        {'$set': {'callsign': user.get('callsign'), 'items': items, 'updated_at': now}},
        upsert=True,
    )
    return {'message': 'Queue saved', 'items': items}


@router.post('/crafting-queue/calculate')
async def calculate_crafting(request: Request):
    """
    Cross-reference crafting queue against personal inventory.
    Returns total ingredients needed, what you already have, and the shortfall.
    Also returns which recipes you can currently craft with your inventory alone.
    """
    user = await _get_user(request)

    # Load queue
    queue_doc = await db.crafting_queues.find_one({'user_id': user['_id']}, {'_id': 0, 'items': 1}) or {}
    queue_items = queue_doc.get('items', [])

    # Load inventory
    inv_doc = await db.player_inventory.find_one({'user_id': user['_id']}, {'_id': 0, 'items': 1}) or {}
    inventory: dict = {it['item_name']: it['quantity'] for it in (inv_doc.get('items') or [])}

    # Aggregate total ingredients needed across all queue items
    needed: dict = {}
    queue_detail = []
    for qi in queue_items:
        name = qi['recipe_name']
        qty = qi['quantity']
        recipe = CRAFTING_RECIPES.get(name)
        if not recipe:
            continue
        ingredients = []
        for ingredient, per_craft in recipe:
            total = per_craft * qty
            needed[ingredient] = needed.get(ingredient, 0) + total
            have = min(inventory.get(ingredient, 0), total)
            ingredients.append({
                'item': ingredient,
                'needed': total,
                'have': have,
                'short': max(0, total - have),
            })
        queue_detail.append({'recipe_name': name, 'quantity': qty, 'ingredients': ingredients})

    # Build totals
    shortfall = []
    total_needed = []
    total_have = []
    for item, amount in needed.items():
        have = min(inventory.get(item, 0), amount)
        total_needed.append({'item': item, 'quantity': amount})
        total_have.append({'item': item, 'quantity': have})
        short = amount - have
        if short > 0:
            shortfall.append({'item': item, 'quantity': short})

    # What can you craft right now (ignoring queue)?
    craftable = []
    for recipe_name, recipe in CRAFTING_RECIPES.items():
        max_craft = None
        for ingredient, per_craft in recipe:
            have = inventory.get(ingredient, 0)
            possible = have // per_craft
            if max_craft is None or possible < max_craft:
                max_craft = possible
        if (max_craft or 0) > 0:
            craftable.append({'recipe_name': recipe_name, 'max_quantity': max_craft})
    craftable.sort(key=lambda x: x['max_quantity'], reverse=True)

    return {
        'queue_detail': queue_detail,
        'total_needed': total_needed,
        'total_have': total_have,
        'shortfall': shortfall,
        'can_complete_queue': len(shortfall) == 0 and len(queue_items) > 0,
        'craftable_now': craftable,
    }


def init_inventory_routes(database, auth_func):
    global db, get_current_user
    db = database
    get_current_user = auth_func
    return router
