from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/economy", tags=["economy"])

db = None
get_current_user = None

# HumanitZ resource categories
CATEGORIES = ['weapons', 'ammo', 'food', 'water', 'medical', 'materials', 'tools', 'clothing', 'electronics', 'vehicle_parts', 'misc']

RESOURCES = [
    {'name': 'Canned Food', 'category': 'food', 'rarity': 'common', 'base_value': 5, 'icon': 'drumstick', 'desc': 'Non-perishable food. 25% hunger restored.'},
    {'name': 'Fresh Meat', 'category': 'food', 'rarity': 'common', 'base_value': 8, 'icon': 'drumstick', 'desc': 'Must be cooked. Spoils in 2 days. 50% hunger restored.'},
    {'name': 'MRE', 'category': 'food', 'rarity': 'rare', 'base_value': 20, 'icon': 'drumstick', 'desc': 'Military ration. Full hunger restore. Never spoils.'},
    {'name': 'Water Bottle', 'category': 'water', 'rarity': 'common', 'base_value': 3, 'icon': 'droplet', 'desc': 'Clean drinking water. 50% thirst restored.'},
    {'name': 'Water Purifier', 'category': 'water', 'rarity': 'rare', 'base_value': 30, 'icon': 'droplet', 'desc': 'Converts dirty water. Infinite uses. Critical for winter.'},
    {'name': '9mm Ammo', 'category': 'ammo', 'rarity': 'common', 'base_value': 2, 'icon': 'crosshair', 'desc': 'Standard pistol ammunition. Found in police stations.'},
    {'name': '5.56 Ammo', 'category': 'ammo', 'rarity': 'uncommon', 'base_value': 5, 'icon': 'crosshair', 'desc': 'Assault rifle rounds. Military bases only.'},
    {'name': '12ga Shells', 'category': 'ammo', 'rarity': 'common', 'base_value': 4, 'icon': 'crosshair', 'desc': 'Shotgun shells. Devastating close range.'},
    {'name': 'Bandage', 'category': 'medical', 'rarity': 'common', 'base_value': 3, 'icon': 'heart-pulse', 'desc': 'Stops bleeding. 10% health restored.'},
    {'name': 'First Aid Kit', 'category': 'medical', 'rarity': 'uncommon', 'base_value': 15, 'icon': 'heart-pulse', 'desc': 'Full medical treatment. 60% health restored.'},
    {'name': 'Antibiotics', 'category': 'medical', 'rarity': 'rare', 'base_value': 25, 'icon': 'heart-pulse', 'desc': 'Cures infection. Only found in hospitals. Critical.'},
    {'name': 'Painkillers', 'category': 'medical', 'rarity': 'uncommon', 'base_value': 10, 'icon': 'heart-pulse', 'desc': 'Reduces pain, restores stamina. Addictive.'},
    {'name': 'Wood Planks', 'category': 'materials', 'rarity': 'common', 'base_value': 1, 'icon': 'hammer', 'desc': 'Basic building material. Chop trees or find in lumber yards.'},
    {'name': 'Metal Sheets', 'category': 'materials', 'rarity': 'uncommon', 'base_value': 8, 'icon': 'hammer', 'desc': 'Reinforced building material. Essential for secure bases.'},
    {'name': 'Nails', 'category': 'materials', 'rarity': 'common', 'base_value': 1, 'icon': 'hammer', 'desc': 'Required for all wooden construction.'},
    {'name': 'Concrete Mix', 'category': 'materials', 'rarity': 'rare', 'base_value': 15, 'icon': 'hammer', 'desc': 'Strongest building material. Found at construction sites.'},
    {'name': 'Pistol', 'category': 'weapons', 'rarity': 'uncommon', 'base_value': 20, 'icon': 'target', 'desc': 'Reliable sidearm. Low damage, quiet with suppressor.'},
    {'name': 'Shotgun', 'category': 'weapons', 'rarity': 'uncommon', 'base_value': 30, 'icon': 'target', 'desc': 'Devastating close range. Very loud. Attracts hordes.'},
    {'name': 'Assault Rifle', 'category': 'weapons', 'rarity': 'rare', 'base_value': 60, 'icon': 'target', 'desc': 'Military weapon. Full auto. Extremely loud.'},
    {'name': 'Melee Weapon', 'category': 'weapons', 'rarity': 'common', 'base_value': 5, 'icon': 'target', 'desc': 'Bat, axe, machete. Silent. Durability varies.'},
    {'name': 'Battery', 'category': 'electronics', 'rarity': 'uncommon', 'base_value': 10, 'icon': 'zap', 'desc': 'Powers flashlights, radios, vehicles. Rechargeable.'},
    {'name': 'Fuel Can', 'category': 'vehicle_parts', 'rarity': 'uncommon', 'base_value': 12, 'icon': 'fuel', 'desc': 'Vehicle fuel. Also useful for generators and fire starting.'},
    {'name': 'Tire', 'category': 'vehicle_parts', 'rarity': 'uncommon', 'base_value': 8, 'icon': 'circle', 'desc': 'Vehicle repair part. Found at garages and highways.'},
    {'name': 'Backpack', 'category': 'clothing', 'rarity': 'uncommon', 'base_value': 15, 'icon': 'package', 'desc': 'Increases carry capacity. Essential for long scavenging runs.'},
    {'name': 'Toolbox', 'category': 'tools', 'rarity': 'uncommon', 'base_value': 12, 'icon': 'wrench', 'desc': 'Required for vehicle repairs and advanced crafting.'},
]

CRAFTING_RECIPES = [
    {'name': 'Wooden Barricade', 'category': 'building', 'ingredients': [{'item': 'Wood Planks', 'qty': 4}, {'item': 'Nails', 'qty': 6}], 'result': 'Wooden Barricade', 'result_qty': 1, 'difficulty': 'easy', 'desc': 'Basic door/window blockade. Slows zombies.'},
    {'name': 'Metal Wall', 'category': 'building', 'ingredients': [{'item': 'Metal Sheets', 'qty': 3}, {'item': 'Nails', 'qty': 4}], 'result': 'Metal Wall', 'result_qty': 1, 'difficulty': 'medium', 'desc': 'Strong wall segment. Resists zombie attacks.'},
    {'name': 'Campfire', 'category': 'survival', 'ingredients': [{'item': 'Wood Planks', 'qty': 2}], 'result': 'Campfire', 'result_qty': 1, 'difficulty': 'easy', 'desc': 'Cook food, purify water, warmth. Attracts zombies at night.'},
    {'name': 'Rain Collector', 'category': 'survival', 'ingredients': [{'item': 'Wood Planks', 'qty': 3}, {'item': 'Metal Sheets', 'qty': 1}], 'result': 'Rain Collector', 'result_qty': 1, 'difficulty': 'easy', 'desc': 'Passive water collection. Essential in any base.'},
    {'name': 'Splint', 'category': 'medical', 'ingredients': [{'item': 'Wood Planks', 'qty': 1}, {'item': 'Bandage', 'qty': 1}], 'result': 'Splint', 'result_qty': 1, 'difficulty': 'easy', 'desc': 'Fixes broken bones. Required for leg fractures.'},
    {'name': 'Improvised Suppressor', 'category': 'weapons', 'ingredients': [{'item': 'Water Bottle', 'qty': 1}, {'item': 'Nails', 'qty': 2}], 'result': 'Improvised Suppressor', 'result_qty': 1, 'difficulty': 'medium', 'desc': 'Reduces gun noise by 70%. Degrades after 30 shots.'},
    {'name': 'Storage Crate', 'category': 'building', 'ingredients': [{'item': 'Wood Planks', 'qty': 6}, {'item': 'Nails', 'qty': 8}], 'result': 'Storage Crate', 'result_qty': 1, 'difficulty': 'easy', 'desc': 'Persistent storage. 20 slots. Place in base.'},
    {'name': 'Generator', 'category': 'electronics', 'ingredients': [{'item': 'Metal Sheets', 'qty': 2}, {'item': 'Battery', 'qty': 1}, {'item': 'Fuel Can', 'qty': 1}], 'result': 'Generator', 'result_qty': 1, 'difficulty': 'hard', 'desc': 'Powers lights and appliances. Very loud — attracts zombies.'},
    {'name': 'Concrete Wall', 'category': 'building', 'ingredients': [{'item': 'Concrete Mix', 'qty': 2}, {'item': 'Metal Sheets', 'qty': 1}], 'result': 'Concrete Wall', 'result_qty': 1, 'difficulty': 'hard', 'desc': 'Strongest structure. Zombie-proof when intact.'},
    {'name': 'Molotov Cocktail', 'category': 'weapons', 'ingredients': [{'item': 'Fuel Can', 'qty': 1}, {'item': 'Bandage', 'qty': 1}], 'result': 'Molotov Cocktail', 'result_qty': 2, 'difficulty': 'easy', 'desc': 'Area denial weapon. Sets zombies on fire. Risk of spreading.'},
]

RESOURCE_NAMES = {resource['name'] for resource in RESOURCES}
ALLOWED_TRADE_ACTIONS = {'claim', 'complete', 'cancel'}
ALLOWED_PRIORITIES = {'low', 'normal', 'urgent'}


class TradePostInput(BaseModel):
    offering: List[dict]    # [{item, qty}]
    requesting: List[dict]  # [{item, qty}]
    notes: str = ''

class TradeResponseInput(BaseModel):
    action: str  # claim, complete, cancel

class SupplyRequestInput(BaseModel):
    items: List[dict]  # [{item, qty}]
    priority: str = 'normal'  # low, normal, urgent
    notes: str = ''


def normalize_trade_items(items: List[dict], field_name: str) -> List[dict]:
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail=f'{field_name} must be a list')

    normalized = {}
    for entry in items:
        if not isinstance(entry, dict):
            raise HTTPException(status_code=400, detail=f'Each {field_name} entry must be an object')
        item_name = str(entry.get('item', '')).strip()
        qty = entry.get('qty')

        if item_name not in RESOURCE_NAMES:
            raise HTTPException(status_code=400, detail=f'Invalid resource in {field_name}: {item_name or "unknown"}')
        if not isinstance(qty, int) or qty < 1 or qty > 999:
            raise HTTPException(status_code=400, detail=f'Quantity for {item_name} must be an integer between 1 and 999')

        normalized[item_name] = normalized.get(item_name, 0) + qty

    return [{'item': item, 'qty': qty} for item, qty in normalized.items()]


# ==================== RESOURCES ====================

@router.get('/resources')
async def list_resources(request: Request):
    await get_current_user(request)
    # Return resource catalog with current scarcity values
    scarcity = {}
    docs = await db.resource_scarcity.find({}, {'_id': 0}).to_list(100)
    for d in docs:
        scarcity[d['name']] = d

    result = []
    for r in RESOURCES:
        s = scarcity.get(r['name'], {})
        result.append({
            **r,
            'current_value': s.get('current_value', r['base_value']),
            'supply_level': s.get('supply_level', 'normal'),
            'trend': s.get('trend', 'stable'),
        })
    return result

@router.get('/recipes')
async def list_recipes(request: Request):
    await get_current_user(request)
    return CRAFTING_RECIPES


# ==================== TRADE BOARD ====================

@router.get('/trades')
async def list_trades(request: Request):
    await get_current_user(request)
    trades = await db.trades.find(
        {'status': {'$in': ['open', 'claimed']}}, {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return trades

@router.get('/trades/history')
async def trade_history(request: Request, limit: int = 50):
    await get_current_user(request)
    trades = await db.trades.find({}, {'_id': 0}).sort('created_at', -1).limit(limit).to_list(limit)
    return trades

@router.post('/trades')
async def create_trade(data: TradePostInput, request: Request):
    user = await get_current_user(request)
    uid = user['_id']
    now = datetime.now(timezone.utc).isoformat()

    offering = normalize_trade_items(data.offering, 'offering')
    requesting = normalize_trade_items(data.requesting, 'requesting')
    if not offering and not requesting:
        raise HTTPException(status_code=400, detail='Must offer or request something')

    # Get faction info
    membership = await db.faction_members.find_one({'user_id': uid, 'status': 'active'}, {'_id': 0})

    doc = {
        'trade_id': str(ObjectId()),
        'poster_id': uid,
        'poster_callsign': user.get('callsign', 'Unknown'),
        'poster_faction': membership.get('faction_id') if membership else None,
        'poster_faction_tag': None,
        'offering': offering,
        'requesting': requesting,
        'notes': data.notes.strip()[:200],
        'status': 'open',
        'claimed_by': None,
        'claimed_at': None,
        'created_at': now,
    }

    if membership and membership.get('faction_id'):
        faction = await db.factions.find_one({'faction_id': membership['faction_id']}, {'_id': 0, 'tag': 1})
        doc['poster_faction_tag'] = faction.get('tag') if faction else None

    await db.trades.insert_one(doc)
    doc.pop('_id', None)
    return doc

@router.post('/trades/{trade_id}/respond')
async def respond_trade(trade_id: str, data: TradeResponseInput, request: Request):
    user = await get_current_user(request)
    uid = user['_id']
    now = datetime.now(timezone.utc).isoformat()
    if data.action not in ALLOWED_TRADE_ACTIONS:
        raise HTTPException(status_code=400, detail='Invalid trade action')

    trade = await db.trades.find_one({'trade_id': trade_id})
    if not trade:
        raise HTTPException(status_code=404, detail='Trade not found')

    if data.action == 'claim':
        if trade['status'] != 'open':
            raise HTTPException(status_code=400, detail='Trade not available')
        if trade['poster_id'] == uid:
            raise HTTPException(status_code=400, detail='Cannot claim your own trade')
        await db.trades.update_one(
            {'trade_id': trade_id},
            {'$set': {'status': 'claimed', 'claimed_by': user.get('callsign', 'Unknown'), 'claimed_at': now}}
        )
        return {'message': 'Trade claimed'}
    elif data.action == 'complete':
        if trade['status'] != 'claimed':
            raise HTTPException(status_code=400, detail='Only claimed trades can be completed')
        if trade['poster_id'] != uid and trade.get('claimed_by') != user.get('callsign'):
            raise HTTPException(status_code=403, detail='Only trade parties can complete')
        await db.trades.update_one(
            {'trade_id': trade_id},
            {'$set': {'status': 'completed', 'completed_at': now}}
        )
        return {'message': 'Trade completed'}
    elif data.action == 'cancel':
        if trade['status'] not in {'open', 'claimed'}:
            raise HTTPException(status_code=400, detail='Trade can no longer be cancelled')
        if trade['poster_id'] != uid:
            raise HTTPException(status_code=403, detail='Only poster can cancel')
        await db.trades.update_one(
            {'trade_id': trade_id},
            {'$set': {'status': 'cancelled'}}
        )
        return {'message': 'Trade cancelled'}


# ==================== SUPPLY REQUESTS ====================

@router.get('/supply-requests')
async def list_supply_requests(request: Request):
    await get_current_user(request)
    reqs = await db.supply_requests.find(
        {'status': 'open'}, {'_id': 0}
    ).sort('created_at', -1).to_list(50)
    return reqs

@router.post('/supply-requests')
async def create_supply_request(data: SupplyRequestInput, request: Request):
    user = await get_current_user(request)
    uid = user['_id']
    now = datetime.now(timezone.utc).isoformat()
    if data.priority not in ALLOWED_PRIORITIES:
        raise HTTPException(status_code=400, detail='Invalid priority')
    items = normalize_trade_items(data.items, 'items')
    if not items:
        raise HTTPException(status_code=400, detail='At least one requested item is required')

    membership = await db.faction_members.find_one({'user_id': uid, 'status': 'active'}, {'_id': 0})

    doc = {
        'request_id': str(ObjectId()),
        'requester_id': uid,
        'requester_callsign': user.get('callsign', 'Unknown'),
        'faction_id': membership.get('faction_id') if membership else None,
        'items': items,
        'priority': data.priority,
        'notes': data.notes.strip()[:200],
        'status': 'open',
        'fulfilled_by': None,
        'created_at': now,
    }
    await db.supply_requests.insert_one(doc)
    doc.pop('_id', None)
    return doc

@router.post('/supply-requests/{request_id}/fulfill')
async def fulfill_supply_request(request_id: str, request: Request):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc).isoformat()
    result = await db.supply_requests.update_one(
        {'request_id': request_id, 'status': 'open'},
        {'$set': {'status': 'fulfilled', 'fulfilled_by': user.get('callsign', 'Unknown'), 'fulfilled_at': now}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Open supply request not found')
    return {'message': 'Request fulfilled'}


# ==================== SCARCITY INDEX ====================

@router.get('/scarcity')
async def get_scarcity_index(request: Request):
    await get_current_user(request)
    docs = await db.resource_scarcity.find({}, {'_id': 0}).to_list(100)
    return docs


def init_economy_routes(database, auth_func):
    global db, get_current_user
    db = database
    get_current_user = auth_func
    return router
