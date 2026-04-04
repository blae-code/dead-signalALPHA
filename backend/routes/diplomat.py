"""
Diplomat Routes
===============
AI-powered diplomatic intelligence endpoints.
"""
import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/diplomat", tags=["diplomat"])

db = None
get_current_user = None
require_admin = None
diplomat_ai = None


@router.get('/analysis')
async def get_diplomatic_analysis(request: Request):
    """Full AI strategic assessment of all factions."""
    await require_admin(request)

    # Gather faction data
    factions_raw = await db.factions.find({'status': 'active'}, {'_id': 0}).to_list(50)
    factions = []
    for f in factions_raw:
        fid = f.get('faction_id', '')
        members = await db.faction_members.count_documents({'faction_id': fid, 'status': 'active'})
        territories = await db.territories.count_documents({'faction_id': fid})
        raw_rep = f.get('reputation', 0)
        factions.append({
            **f,
            'member_count': members,
            'territory_count': territories,
            'reputation': raw_rep if isinstance(raw_rep, (int, float)) else 0,
            'leader': f.get('leader_callsign', 'Unknown'),
        })

    # Gather treaties
    treaties = await db.diplomacy.find(
        {'status': {'$in': ['active', 'proposed']}}, {'_id': 0}
    ).sort('created_at', -1).to_list(50)

    # Enrich treaty names
    faction_names = {f.get('faction_id'): f.get('name', '?') for f in factions}
    for t in treaties:
        t['from_name'] = faction_names.get(t.get('from_faction_id'), '?')
        t['to_name'] = faction_names.get(t.get('to_faction_id'), '?')

    # Recent events
    recent_events = await db.events.find(
        {'type': {'$in': ['player_kill', 'player_death', 'horde_event', 'airdrop']}},
        {'_id': 0, 'type': 1, 'summary': 1, 'players': 1, 'timestamp': 1}
    ).sort('timestamp', -1).limit(20).to_list(20)

    analysis = await diplomat_ai.analyse_factions(factions, treaties, recent_events)

    return {
        'analysis': analysis,
        'faction_count': len(factions),
        'treaty_count': len(treaties),
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }


@router.get('/reputation-matrix')
async def get_reputation_matrix(request: Request):
    """Compute the reputation matrix between all faction pairs."""
    await require_admin(request)

    factions_raw = await db.factions.find({'status': 'active'}, {'_id': 0}).to_list(50)
    factions = []
    for f in factions_raw:
        fid = f.get('faction_id', '')
        members = await db.faction_members.count_documents({'faction_id': fid, 'status': 'active'})
        member_docs = await db.faction_members.find(
            {'faction_id': fid, 'status': 'active'}, {'_id': 0, 'callsign': 1}
        ).to_list(100)
        member_names = [m.get('callsign', '') for m in member_docs]
        territories = await db.territories.count_documents({'faction_id': fid})
        raw_rep = f.get('reputation', 0)
        factions.append({
            **f,
            'member_count': members,
            'member_names': member_names,
            'territory_count': territories,
            'reputation': raw_rep if isinstance(raw_rep, (int, float)) else 0,
        })

    treaties = await db.diplomacy.find({}, {'_id': 0}).to_list(200)

    combat_events = await db.events.find(
        {'type': 'player_kill'},
        {'_id': 0, 'players': 1, 'details': 1}
    ).sort('timestamp', -1).limit(100).to_list(100)

    matrix = await diplomat_ai.compute_reputation_matrix(factions, treaties, combat_events)

    return {
        'matrix': matrix,
        'factions': [{'name': f.get('name'), 'tag': f.get('tag'), 'faction_id': f.get('faction_id')} for f in factions],
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }


@router.post('/recommend')
async def recommend_treaty(request: Request):
    """Get AI recommendation for a treaty between two factions."""
    await require_admin(request)
    body = await request.json()
    faction_a_id = body.get('faction_a_id', '')
    faction_b_id = body.get('faction_b_id', '')

    if not faction_a_id or not faction_b_id:
        raise HTTPException(status_code=400, detail='Both faction_a_id and faction_b_id are required')

    fa_raw = await db.factions.find_one({'faction_id': faction_a_id}, {'_id': 0})
    fb_raw = await db.factions.find_one({'faction_id': faction_b_id}, {'_id': 0})
    if not fa_raw or not fb_raw:
        raise HTTPException(status_code=404, detail='One or both factions not found')

    # Enrich
    for f in [fa_raw, fb_raw]:
        fid = f.get('faction_id', '')
        f['member_count'] = await db.faction_members.count_documents({'faction_id': fid, 'status': 'active'})
        f['territory_count'] = await db.territories.count_documents({'faction_id': fid})
        raw_rep = f.get('reputation', 0)
        f['reputation'] = raw_rep if isinstance(raw_rep, (int, float)) else 0

    # Context
    existing = await db.diplomacy.find_one({
        '$or': [
            {'from_faction_id': faction_a_id, 'to_faction_id': faction_b_id, 'status': 'active'},
            {'from_faction_id': faction_b_id, 'to_faction_id': faction_a_id, 'status': 'active'},
        ]
    }, {'_id': 0})

    conflicts = await db.events.count_documents({
        'type': 'player_kill',
        'timestamp': {'$gte': (datetime.now(timezone.utc)).isoformat()[:10]},
    })

    power_a = fa_raw['member_count'] + fa_raw['territory_count'] * 2
    power_b = fb_raw['member_count'] + fb_raw['territory_count'] * 2
    ratio = f"{power_a}:{power_b}" if power_b > 0 else f"{power_a}:0"

    context = {
        'existing_treaty': f"{existing['treaty_type']} ({existing['status']})" if existing else 'none',
        'recent_conflicts': f'{conflicts} kills in last 24h',
        'power_ratio': ratio,
    }

    recommendation = await diplomat_ai.recommend_treaty(fa_raw, fb_raw, context)

    return {
        'recommendation': recommendation,
        'faction_a': fa_raw.get('name'),
        'faction_b': fb_raw.get('name'),
        'context': context,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }


def init_diplomat_routes(database, auth_fn, admin_fn, ai):
    global db, get_current_user, require_admin, diplomat_ai
    db = database
    get_current_user = auth_fn
    require_admin = admin_fn
    diplomat_ai = ai
    return router
