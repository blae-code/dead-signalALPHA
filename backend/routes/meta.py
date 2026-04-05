"""
Meta Options API
================
Single endpoint aggregating canonical lists for frontend dropdowns.
Eliminates hardcoded option arrays and free-text guessing.
"""
import logging
from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meta", tags=["meta"])

db = None
get_current_user = None

# Static canonical lists (mirrors existing backend constants)
MISSION_TYPES = ['story', 'side_quest', 'faction', 'survival', 'bounty', 'supply_run', 'escort', 'defend', 'explore']
MISSION_STATUSES = ['draft', 'active', 'completed', 'failed', 'cancelled', 'paused']
OBJECTIVE_TYPES = ['kill', 'collect', 'reach_location', 'survive', 'trade', 'craft', 'defend', 'escort', 'talk_to_npc', 'custom']
REWARD_TYPES = ['item', 'faction_rep', 'narrative_unlock', 'access', 'custom']
DIFFICULTY_LEVELS = ['trivial', 'easy', 'medium', 'hard', 'extreme']
NPC_ROLES = ['trader', 'quest_giver', 'ally', 'neutral', 'enemy', 'survivor', 'medic', 'mechanic', 'informant']
NPC_FACTIONS_STATIC = ['independent', 'military', 'bandit', 'survivor', 'trader_guild', 'unknown']
NPC_STATUSES = ['active', 'inactive', 'dead', 'missing']
SPAWN_TYPES = ['fixed', 'roaming', 'event']
DIALOGUE_TRIGGERS = ['greeting', 'trade', 'quest', 'warn', 'idle', 'combat', 'death']
EVENT_TYPES = ['horde', 'airdrop', 'npc_spawn', 'weather', 'custom']
TRIGGER_EVENTS = ['player_connect', 'player_disconnect', 'player_death', 'player_kill', 'horde_event', 'airdrop', 'season_change', 'weather_change', 'time_change', 'environment', 'chat', 'server']
TRIGGER_ACTIONS = ['broadcast', 'command', 'create_intel', 'activate_mission', 'spawn_npc', 'create_supply_request']

RESOURCE_LIST = [
    'Canned Food', 'Fresh Meat', 'MRE', 'Water Bottle', 'Water Purifier',
    '9mm Ammo', '5.56 Ammo', '12ga Shells', 'Bandage', 'First Aid Kit',
    'Antibiotics', 'Painkillers', 'Wood Planks', 'Metal Sheets', 'Nails',
    'Concrete Mix', 'Pistol', 'Shotgun', 'Assault Rifle', 'Melee Weapon',
    'Battery', 'Fuel Can', 'Tire', 'Backpack', 'Toolbox',
    'Wooden Barricade', 'Metal Wall', 'Campfire', 'Rain Collector', 'Splint',
    'Improvised Suppressor', 'Storage Crate', 'Generator', 'Concrete Wall', 'Molotov Cocktail',
]

GRID_LABELS = [f"{chr(65+r)}{c+1}" for r in range(16) for c in range(16)]


@router.get('/options')
async def get_options(request: Request):
    """Aggregated canonical options for all frontend dropdowns."""
    await get_current_user(request)

    # Parallel DB queries for live data
    factions_cursor = db.factions.find({}, {'_id': 0, 'faction_id': 1, 'name': 1, 'tag': 1, 'color': 1})
    npcs_cursor = db.npcs.find({}, {'_id': 0, 'npc_id': 1, 'name': 1, 'role': 1, 'status': 1})
    missions_cursor = db.missions.find({}, {'_id': 0, 'mission_id': 1, 'title': 1, 'status': 1, 'mission_type': 1})
    users_cursor = db.users.find({}, {'_id': 0, 'callsign': 1, 'role': 1})
    territories_cursor = db.territories.find({'label': {'$exists': True}}, {'_id': 0, 'grid_x': 1, 'grid_y': 1, 'label': 1, 'faction_id': 1})

    factions = await factions_cursor.to_list(200)
    npcs = await npcs_cursor.to_list(500)
    missions = await missions_cursor.to_list(500)
    users = await users_cursor.to_list(500)
    territories = await territories_cursor.to_list(300)

    # Build location names from territories that have labels
    territory_locations = []
    for t in territories:
        grid_ref = f"{chr(65 + t.get('grid_x', 0))}{t.get('grid_y', 0) + 1}"
        label = t.get('label', '')
        if label:
            territory_locations.append({'grid_ref': grid_ref, 'label': label})

    # Player callsigns
    callsigns = [u['callsign'] for u in users if u.get('callsign')]

    return {
        'factions': factions,
        'npcs': [{'npc_id': n['npc_id'], 'name': n['name'], 'role': n.get('role', ''), 'status': n.get('status', '')} for n in npcs],
        'missions': [{'mission_id': m['mission_id'], 'title': m['title'], 'status': m.get('status', ''), 'mission_type': m.get('mission_type', '')} for m in missions],
        'callsigns': callsigns,
        'territory_locations': territory_locations,
        'grid_labels': GRID_LABELS[:50],
        'resources': sorted(RESOURCE_LIST),
        'enums': {
            'mission_types': MISSION_TYPES,
            'mission_statuses': MISSION_STATUSES,
            'objective_types': OBJECTIVE_TYPES,
            'reward_types': REWARD_TYPES,
            'difficulty_levels': DIFFICULTY_LEVELS,
            'npc_roles': NPC_ROLES,
            'npc_factions': NPC_FACTIONS_STATIC,
            'npc_statuses': NPC_STATUSES,
            'spawn_types': SPAWN_TYPES,
            'dialogue_triggers': DIALOGUE_TRIGGERS,
            'event_types': EVENT_TYPES,
            'trigger_events': TRIGGER_EVENTS,
            'trigger_actions': TRIGGER_ACTIONS,
        },
    }


def init_meta_routes(database, auth_fn):
    global db, get_current_user
    db = database
    get_current_user = auth_fn
    return router
