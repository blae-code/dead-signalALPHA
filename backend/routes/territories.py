"""
Territory Routes
================
Interactive territory map: claim, contest, and manage grid zones.
"""
import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/territories", tags=["territories"])

db = None
get_current_user = None
require_admin = None

GRID_SIZE = 16  # 16x16 grid (A-P, 1-16)


@router.get('')
async def list_territories(request: Request):
    """Get all territory claims for the map overlay."""
    await get_current_user(request)
    territories = await db.territories.find(
        {}, {'_id': 0}
    ).to_list(GRID_SIZE * GRID_SIZE)

    # Enrich with faction data
    faction_ids = list(set(t.get('faction_id') for t in territories if t.get('faction_id')))
    factions = {}
    if faction_ids:
        for f in await db.factions.find({'faction_id': {'$in': faction_ids}}, {'_id': 0}).to_list(50):
            factions[f['faction_id']] = {
                'name': f.get('name', ''),
                'tag': f.get('tag', ''),
                'color': f.get('color', '#c4841d'),
            }

    for t in territories:
        fid = t.get('faction_id')
        if fid and fid in factions:
            t['faction'] = factions[fid]

    return territories


@router.get('/markers')
async def get_markers(request: Request):
    """Get live map markers: recent events, airdrops, danger zones."""
    await get_current_user(request)

    markers = []

    # Recent combat events as danger markers
    combat = await db.events.find(
        {'type': {'$in': ['player_kill', 'player_death', 'horde_event']}},
        {'_id': 0, 'type': 1, 'summary': 1, 'timestamp': 1, 'details': 1}
    ).sort('timestamp', -1).limit(10).to_list(10)

    for ev in combat:
        markers.append({
            'type': 'danger' if ev['type'] in ('player_kill', 'horde_event') else 'death',
            'label': ev.get('summary', ev['type']),
            'timestamp': ev.get('timestamp'),
        })

    # Recent airdrops
    airdrops = await db.events.find(
        {'type': 'airdrop'},
        {'_id': 0, 'type': 1, 'summary': 1, 'timestamp': 1}
    ).sort('timestamp', -1).limit(5).to_list(5)

    for ad in airdrops:
        markers.append({
            'type': 'airdrop',
            'label': ad.get('summary', 'Supply Drop'),
            'timestamp': ad.get('timestamp'),
        })

    # Faction bases (territories marked as 'base')
    bases = await db.territories.find(
        {'zone_type': 'base'}, {'_id': 0}
    ).to_list(20)

    for b in bases:
        markers.append({
            'type': 'base',
            'label': b.get('label', 'Base'),
            'x': b.get('x'),
            'y': b.get('y'),
            'faction_id': b.get('faction_id'),
        })

    return markers


@router.post('/claim')
async def claim_territory(request: Request):
    """GM assigns a grid cell to a faction."""
    user = await require_admin(request)
    body = await request.json()

    x = body.get('x')
    y = body.get('y')
    faction_id = body.get('faction_id')
    zone_type = body.get('zone_type', 'territory')  # territory, base, outpost, contested
    label = body.get('label', '')

    if x is None or y is None or not faction_id:
        raise HTTPException(status_code=400, detail='x, y, and faction_id are required')
    if not (0 <= x < GRID_SIZE and 0 <= y < GRID_SIZE):
        raise HTTPException(status_code=400, detail=f'Coordinates must be 0-{GRID_SIZE-1}')

    faction = await db.factions.find_one({'faction_id': faction_id}, {'_id': 0})
    if not faction:
        raise HTTPException(status_code=404, detail='Faction not found')

    territory_id = f"{x}-{y}"
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.territories.find_one({'territory_id': territory_id})
    if existing:
        # Update ownership
        old_faction = existing.get('faction_id', '')
        await db.territories.update_one(
            {'territory_id': territory_id},
            {'$set': {
                'faction_id': faction_id,
                'zone_type': zone_type,
                'label': label or f"{faction.get('tag','')} Zone",
                'claimed_by': user.get('callsign', ''),
                'updated_at': now,
            }, '$push': {
                'history': {
                    'from_faction': old_faction,
                    'to_faction': faction_id,
                    'by': user.get('callsign', ''),
                    'at': now,
                }
            }}
        )
    else:
        await db.territories.insert_one({
            'territory_id': territory_id,
            'x': x,
            'y': y,
            'faction_id': faction_id,
            'zone_type': zone_type,
            'label': label or f"{faction.get('tag','')} Zone",
            'claimed_by': user.get('callsign', ''),
            'created_at': now,
            'updated_at': now,
            'history': [],
        })

    # Log the action
    await db.gm_action_log.insert_one({
        'action': 'territory_claim',
        'details': {
            'x': x, 'y': y,
            'faction': faction.get('name', ''),
            'zone_type': zone_type,
        },
        'actor': user.get('callsign', ''),
        'timestamp': now,
    })

    return {
        'message': f"Territory {chr(65+x)}{y+1} assigned to {faction.get('name','')}",
        'territory_id': territory_id,
    }


@router.delete('/claim')
async def release_territory(request: Request):
    """GM removes a territory claim."""
    user = await require_admin(request)
    body = await request.json()
    x = body.get('x')
    y = body.get('y')

    if x is None or y is None:
        raise HTTPException(status_code=400, detail='x and y are required')

    territory_id = f"{x}-{y}"
    result = await db.territories.delete_one({'territory_id': territory_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='No territory at that position')

    await db.gm_action_log.insert_one({
        'action': 'territory_release',
        'details': {'x': x, 'y': y},
        'actor': user.get('callsign', ''),
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })

    return {'message': f"Territory {chr(65+x)}{y+1} released"}


@router.get('/summary')
async def territory_summary(request: Request):
    """Overview stats for all faction territories."""
    await get_current_user(request)

    pipeline = [
        {'$group': {
            '_id': '$faction_id',
            'count': {'$sum': 1},
            'bases': {'$sum': {'$cond': [{'$eq': ['$zone_type', 'base']}, 1, 0]}},
            'outposts': {'$sum': {'$cond': [{'$eq': ['$zone_type', 'outpost']}, 1, 0]}},
        }},
    ]
    agg = await db.territories.aggregate(pipeline).to_list(50)

    # Enrich with faction names
    results = []
    for entry in agg:
        fid = entry['_id']
        faction = await db.factions.find_one({'faction_id': fid}, {'_id': 0, 'name': 1, 'tag': 1, 'color': 1})
        if faction:
            results.append({
                'faction_id': fid,
                'name': faction.get('name', ''),
                'tag': faction.get('tag', ''),
                'color': faction.get('color', '#c4841d'),
                'total': entry['count'],
                'bases': entry['bases'],
                'outposts': entry['outposts'],
                'territories': entry['count'] - entry['bases'] - entry['outposts'],
            })

    return sorted(results, key=lambda r: r['total'], reverse=True)


def init_territory_routes(database, auth_fn, admin_fn):
    global db, get_current_user, require_admin
    db = database
    get_current_user = auth_fn
    require_admin = admin_fn
    return router
