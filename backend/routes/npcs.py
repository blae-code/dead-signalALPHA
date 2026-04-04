from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/npcs", tags=["npcs"])

db = None
get_current_user = None
ptero = None
ws_manager = None

NPC_ROLES = {'trader', 'quest_giver', 'enemy', 'ally', 'neutral', 'survivor', 'medic', 'mechanic', 'informant'}
NPC_FACTIONS = {'independent', 'military', 'bandit', 'survivor', 'trader_guild', 'unknown'}
NPC_STATUSES = {'active', 'inactive', 'dead', 'missing'}
SPAWN_TYPES = {'fixed', 'roaming', 'event'}


# ==================== MODELS ====================

class NPCInventoryItem(BaseModel):
    item_name: str
    quantity: int = 1
    tradeable: bool = True

class DialogueLine(BaseModel):
    trigger: str  # greeting, trade, quest, warn, idle
    line: str

class NPCInput(BaseModel):
    name: str
    role: str
    faction: str = 'independent'
    description: str = ''
    location_name: str = ''       # Named location (e.g. "Riverside Mall")
    grid_x: Optional[int] = None  # Grid coordinate X
    grid_y: Optional[int] = None  # Grid coordinate Y
    spawn_type: str = 'fixed'
    inventory: List[NPCInventoryItem] = []
    dialogue: List[DialogueLine] = []
    notes: str = ''
    hostile: bool = False
    health: int = 100

class NPCUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    faction: Optional[str] = None
    description: Optional[str] = None
    location_name: Optional[str] = None
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    spawn_type: Optional[str] = None
    inventory: Optional[List[NPCInventoryItem]] = None
    dialogue: Optional[List[DialogueLine]] = None
    notes: Optional[str] = None
    hostile: Optional[bool] = None
    health: Optional[int] = None
    status: Optional[str] = None

class NPCStatusUpdate(BaseModel):
    status: str  # active, inactive, dead, missing
    notes: str = ''


# ==================== HELPERS ====================

async def require_admin(request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


async def log_npc_action(actor: str, action: str, details: dict):
    await db.gm_action_log.insert_one({
        'action': action,
        'details': details,
        'actor': actor,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })


def clean_text(value: str, field_name: str, *, min_len: int = 1, max_len: int = 200) -> str:
    cleaned = (value or '').strip()
    if len(cleaned) < min_len:
        raise HTTPException(status_code=400, detail=f'{field_name} is required')
    if len(cleaned) > max_len:
        raise HTTPException(status_code=400, detail=f'{field_name} must be {max_len} characters or fewer')
    return cleaned


def ensure_allowed(value: str, allowed: set, field_name: str) -> str:
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f'Invalid {field_name}: must be one of {sorted(allowed)}')
    return value


# ==================== NPC CRUD ====================

@router.get('')
async def list_npcs(request: Request, status: Optional[str] = None, role: Optional[str] = None):
    """List all NPCs, optionally filtered by status or role."""
    await require_admin(request)
    query: dict = {}
    if status:
        ensure_allowed(status, NPC_STATUSES, 'status')
        query['status'] = status
    if role:
        ensure_allowed(role, NPC_ROLES, 'role')
        query['role'] = role
    npcs = await db.npcs.find(query, {'_id': 0}).sort('created_at', -1).to_list(200)
    return npcs


@router.get('/summary')
async def npc_summary(request: Request):
    """Count NPCs by status and role for the GM overview."""
    await require_admin(request)
    total = await db.npcs.count_documents({})
    by_status = {}
    for s in NPC_STATUSES:
        by_status[s] = await db.npcs.count_documents({'status': s})
    by_role = {}
    for r in NPC_ROLES:
        count = await db.npcs.count_documents({'role': r})
        if count:
            by_role[r] = count
    return {'total': total, 'by_status': by_status, 'by_role': by_role}


@router.get('/{npc_id}')
async def get_npc(npc_id: str, request: Request):
    """Get a single NPC by ID."""
    await require_admin(request)
    npc = await db.npcs.find_one({'npc_id': npc_id}, {'_id': 0})
    if not npc:
        raise HTTPException(status_code=404, detail='NPC not found')
    # Fetch event log entries referencing this NPC
    history = await db.npc_events.find(
        {'npc_id': npc_id}, {'_id': 0}
    ).sort('timestamp', -1).to_list(50)
    return {**npc, 'history': history}


@router.post('')
async def create_npc(data: NPCInput, request: Request):
    """Create a new NPC."""
    user = await require_admin(request)
    ensure_allowed(data.role, NPC_ROLES, 'role')
    ensure_allowed(data.faction, NPC_FACTIONS, 'faction')
    ensure_allowed(data.spawn_type, SPAWN_TYPES, 'spawn_type')
    name = clean_text(data.name, 'NPC name', max_len=80)

    if data.health < 1 or data.health > 10000:
        raise HTTPException(status_code=400, detail='Health must be between 1 and 10000')

    # Validate inventory items
    inventory = []
    for item in data.inventory[:50]:
        item_name = clean_text(item.item_name, 'Item name', max_len=80)
        if item.quantity < 0 or item.quantity > 9999:
            raise HTTPException(status_code=400, detail='Item quantity must be between 0 and 9999')
        inventory.append({'item_name': item_name, 'quantity': item.quantity, 'tradeable': item.tradeable})

    # Validate dialogue lines
    ALLOWED_TRIGGERS = {'greeting', 'trade', 'quest', 'warn', 'idle', 'combat', 'death'}
    dialogue = []
    for d in data.dialogue[:20]:
        trigger = ensure_allowed(d.trigger, ALLOWED_TRIGGERS, 'dialogue trigger')
        line = clean_text(d.line, 'Dialogue line', max_len=500)
        dialogue.append({'trigger': trigger, 'line': line})

    now = datetime.now(timezone.utc).isoformat()
    npc_id = str(ObjectId())

    doc = {
        'npc_id': npc_id,
        'name': name,
        'role': data.role,
        'faction': data.faction,
        'description': (data.description or '').strip()[:500],
        'location_name': (data.location_name or '').strip()[:100],
        'grid_x': data.grid_x,
        'grid_y': data.grid_y,
        'spawn_type': data.spawn_type,
        'inventory': inventory,
        'dialogue': dialogue,
        'notes': (data.notes or '').strip()[:1000],
        'hostile': data.hostile,
        'health': data.health,
        'status': 'active',
        'created_by': user.get('callsign', 'unknown'),
        'created_at': now,
        'updated_at': now,
    }
    await db.npcs.insert_one(doc)
    doc.pop('_id', None)

    await log_npc_action(user.get('callsign', '?'), 'create_npc', {'npc_id': npc_id, 'name': name})
    if ws_manager:
        await ws_manager.broadcast({'type': 'npc_update', 'data': {'action': 'created', 'npc_id': npc_id, 'name': name}})
    return doc


@router.patch('/{npc_id}')
async def update_npc(npc_id: str, data: NPCUpdate, request: Request):
    """Update NPC fields."""
    user = await require_admin(request)
    npc = await db.npcs.find_one({'npc_id': npc_id})
    if not npc:
        raise HTTPException(status_code=404, detail='NPC not found')

    updates: dict = {'updated_at': datetime.now(timezone.utc).isoformat()}

    if data.name is not None:
        updates['name'] = clean_text(data.name, 'NPC name', max_len=80)
    if data.role is not None:
        updates['role'] = ensure_allowed(data.role, NPC_ROLES, 'role')
    if data.faction is not None:
        updates['faction'] = ensure_allowed(data.faction, NPC_FACTIONS, 'faction')
    if data.spawn_type is not None:
        updates['spawn_type'] = ensure_allowed(data.spawn_type, SPAWN_TYPES, 'spawn_type')
    if data.status is not None:
        updates['status'] = ensure_allowed(data.status, NPC_STATUSES, 'status')
    if data.description is not None:
        updates['description'] = data.description.strip()[:500]
    if data.location_name is not None:
        updates['location_name'] = data.location_name.strip()[:100]
    if data.grid_x is not None:
        updates['grid_x'] = data.grid_x
    if data.grid_y is not None:
        updates['grid_y'] = data.grid_y
    if data.notes is not None:
        updates['notes'] = data.notes.strip()[:1000]
    if data.hostile is not None:
        updates['hostile'] = data.hostile
    if data.health is not None:
        if data.health < 1 or data.health > 10000:
            raise HTTPException(status_code=400, detail='Health must be between 1 and 10000')
        updates['health'] = data.health
    if data.inventory is not None:
        inventory = []
        for item in data.inventory[:50]:
            item_name = clean_text(item.item_name, 'Item name', max_len=80)
            if item.quantity < 0 or item.quantity > 9999:
                raise HTTPException(status_code=400, detail='Item quantity must be between 0 and 9999')
            inventory.append({'item_name': item_name, 'quantity': item.quantity, 'tradeable': item.tradeable})
        updates['inventory'] = inventory
    if data.dialogue is not None:
        ALLOWED_TRIGGERS = {'greeting', 'trade', 'quest', 'warn', 'idle', 'combat', 'death'}
        dialogue = []
        for d in data.dialogue[:20]:
            trigger = ensure_allowed(d.trigger, ALLOWED_TRIGGERS, 'dialogue trigger')
            line = clean_text(d.line, 'Dialogue line', max_len=500)
            dialogue.append({'trigger': trigger, 'line': line})
        updates['dialogue'] = dialogue

    await db.npcs.update_one({'npc_id': npc_id}, {'$set': updates})
    await log_npc_action(user.get('callsign', '?'), 'update_npc', {'npc_id': npc_id})
    return {'message': 'NPC updated'}


@router.post('/{npc_id}/status')
async def set_npc_status(npc_id: str, data: NPCStatusUpdate, request: Request):
    """Quickly update NPC status (active/inactive/dead/missing) and log it."""
    user = await require_admin(request)
    ensure_allowed(data.status, NPC_STATUSES, 'status')

    npc = await db.npcs.find_one({'npc_id': npc_id}, {'_id': 0, 'name': 1})
    if not npc:
        raise HTTPException(status_code=404, detail='NPC not found')

    now = datetime.now(timezone.utc).isoformat()
    await db.npcs.update_one(
        {'npc_id': npc_id},
        {'$set': {'status': data.status, 'updated_at': now}}
    )

    # Log the status change event
    await db.npc_events.insert_one({
        'npc_id': npc_id,
        'npc_name': npc['name'],
        'event_type': 'status_change',
        'new_status': data.status,
        'notes': (data.notes or '').strip()[:300],
        'recorded_by': user.get('callsign', 'unknown'),
        'timestamp': now,
    })

    await log_npc_action(user.get('callsign', '?'), 'npc_status_change', {
        'npc_id': npc_id, 'name': npc['name'], 'status': data.status
    })

    if ws_manager:
        await ws_manager.broadcast({'type': 'npc_update', 'data': {
            'action': 'status_changed', 'npc_id': npc_id,
            'name': npc['name'], 'status': data.status,
        }})
    return {'message': f'NPC status set to {data.status}'}


@router.post('/{npc_id}/spawn')
async def spawn_npc(npc_id: str, request: Request):
    """Broadcast the NPC's spawn command via RCON (placeholder — customize to game)."""
    user = await require_admin(request)
    npc = await db.npcs.find_one({'npc_id': npc_id}, {'_id': 0})
    if not npc:
        raise HTTPException(status_code=404, detail='NPC not found')
    if npc.get('status') != 'active':
        raise HTTPException(status_code=400, detail='NPC must be active to spawn')

    loc = npc.get('location_name', 'unknown location')
    cmd = f'say [NPC] {npc["name"]} has appeared at {loc}.'
    await ptero.send_command(cmd)

    now = datetime.now(timezone.utc).isoformat()
    await db.npc_events.insert_one({
        'npc_id': npc_id,
        'npc_name': npc['name'],
        'event_type': 'spawned',
        'notes': f'Spawned at {loc}',
        'recorded_by': user.get('callsign', 'unknown'),
        'timestamp': now,
    })

    await log_npc_action(user.get('callsign', '?'), 'spawn_npc', {'npc_id': npc_id, 'name': npc['name']})
    return {'message': f'Spawn broadcast sent for {npc["name"]}'}


@router.delete('/{npc_id}')
async def delete_npc(npc_id: str, request: Request):
    """Permanently delete an NPC and its event log."""
    user = await require_admin(request)
    result = await db.npcs.delete_one({'npc_id': npc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='NPC not found')
    await db.npc_events.delete_many({'npc_id': npc_id})
    await log_npc_action(user.get('callsign', '?'), 'delete_npc', {'npc_id': npc_id})
    return {'message': 'NPC deleted'}


# ==================== NPC DIRECTOR ====================
#
# The NPC Director is an AI-assisted tool that gives the GM a live view of
# "active" NPCs and lets them send narrative commands or link NPCs to missions.
#
# Collections:
#   npcs          — existing NPC docs
#   npc_events    — existing event log
#   missions      — { mission_id, title, status, assigned_npc_id?, ... }
#
# WebSocket broadcast on director commands:
#   { type: "npc_director_event", data: { npc_id, npc_name, command, timestamp } }

class DirectorCommandInput(BaseModel):
    """Freeform GM directive for an NPC — broadcast in-world and logged."""
    command: str           # e.g. "Move to Grid C7 and engage hostiles"
    rcon_say: bool = True  # Whether to also send an RCON say announcement

class MissionLinkInput(BaseModel):
    mission_id: str


@router.get('/director/active')
async def list_director_active(request: Request):
    """
    Return all active NPCs sorted by last event time, for the NPC Director panel.
    Includes the most recent npc_event for each NPC as `last_event`.
    """
    await require_admin(request)

    npcs = await db.npcs.find({'status': 'active'}, {'_id': 0}).sort('updated_at', -1).to_list(100)

    result = []
    for npc in npcs:
        nid = npc.get('npc_id')
        last_evt = await db.npc_events.find_one(
            {'npc_id': nid}, {'_id': 0},
            sort=[('timestamp', -1)],
        )
        # Fetch linked mission title if any
        mission_title = None
        if npc.get('linked_mission_id'):
            m = await db.missions.find_one(
                {'mission_id': npc['linked_mission_id']}, {'_id': 0, 'title': 1}
            )
            mission_title = (m or {}).get('title')

        result.append({
            **npc,
            'last_event':    last_evt,
            'mission_title': mission_title,
        })

    return result


@router.get('/{npc_id}/director')
async def get_npc_director(npc_id: str, request: Request):
    """Full director view for a single NPC: profile + last 20 events + linked mission."""
    await require_admin(request)

    npc = await db.npcs.find_one({'npc_id': npc_id}, {'_id': 0})
    if not npc:
        raise HTTPException(status_code=404, detail='NPC not found')

    events = await db.npc_events.find(
        {'npc_id': npc_id}, {'_id': 0}
    ).sort('timestamp', -1).to_list(20)

    mission = None
    if npc.get('linked_mission_id'):
        mission = await db.missions.find_one(
            {'mission_id': npc['linked_mission_id']}, {'_id': 0}
        )

    return {'npc': npc, 'events': events, 'linked_mission': mission}


@router.post('/{npc_id}/director/command')
async def director_command(npc_id: str, data: DirectorCommandInput, request: Request):
    """
    Issue a narrative command to an NPC.
    Logs the command in npc_events. If rcon_say is True, announces it in-game.

    TODO: Optionally wire to the AI narrator to auto-generate in-character
    dialogue for the NPC based on the command text.
    """
    user = await require_admin(request)

    command_text = (data.command or '').strip()[:300]
    if not command_text:
        raise HTTPException(status_code=400, detail='command is required')

    npc = await db.npcs.find_one({'npc_id': npc_id}, {'_id': 0, 'name': 1, 'status': 1})
    if not npc:
        raise HTTPException(status_code=404, detail='NPC not found')

    now = datetime.now(timezone.utc).isoformat()

    await db.npc_events.insert_one({
        'npc_id':      npc_id,
        'npc_name':    npc['name'],
        'event_type':  'director_command',
        'notes':       command_text,
        'recorded_by': user.get('callsign', 'unknown'),
        'timestamp':   now,
    })

    if data.rcon_say and ptero:
        safe_cmd = command_text.replace('\n', ' ')[:200]
        try:
            await ptero.send_command(f'say [NPC:{npc["name"]}] {safe_cmd}')
        except Exception as e:
            logger.error('Director RCON say failed: %s', e)

    if ws_manager:
        await ws_manager.broadcast({
            'type': 'npc_director_event',
            'data': {
                'npc_id':   npc_id,
                'npc_name': npc['name'],
                'command':  command_text,
                'issued_by': user.get('callsign'),
                'timestamp': now,
            },
        })

    await log_npc_action(user.get('callsign', '?'), 'director_command', {
        'npc_id': npc_id, 'name': npc['name'], 'command': command_text,
    })
    return {'message': 'Command issued', 'npc': npc['name'], 'command': command_text}


@router.post('/{npc_id}/director/link-mission')
async def link_mission(npc_id: str, data: MissionLinkInput, request: Request):
    """
    Associate an NPC with a mission. Updates npcs.linked_mission_id.
    Pass mission_id="" to unlink.
    """
    await require_admin(request)

    npc = await db.npcs.find_one({'npc_id': npc_id}, {'_id': 0, 'name': 1})
    if not npc:
        raise HTTPException(status_code=404, detail='NPC not found')

    mission_id = (data.mission_id or '').strip()

    if mission_id:
        mission = await db.missions.find_one({'mission_id': mission_id}, {'_id': 0, 'title': 1})
        if not mission:
            raise HTTPException(status_code=404, detail='Mission not found')
    else:
        mission = None

    now = datetime.now(timezone.utc).isoformat()
    await db.npcs.update_one(
        {'npc_id': npc_id},
        {'$set': {'linked_mission_id': mission_id or None, 'updated_at': now}},
    )

    await log_npc_action(
        'gm', 'link_mission',
        {'npc_id': npc_id, 'name': npc['name'], 'mission_id': mission_id},
    )
    return {
        'message': 'Mission linked' if mission_id else 'Mission unlinked',
        'npc': npc['name'],
        'mission': (mission or {}).get('title'),
    }


def init_npc_routes(database, auth_func, ptero_client, ws_broadcast_manager=None):
    global db, get_current_user, ptero, ws_manager
    db = database
    get_current_user = auth_func
    ptero = ptero_client
    ws_manager = ws_broadcast_manager
    return router
