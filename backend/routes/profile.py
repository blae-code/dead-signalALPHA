"""
Profile & Steam Linking Routes
===============================
Allows users to link their app account to their in-game Steam identity.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from event_parser import parse_player_identity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/profile", tags=["profile"])

db = None
get_current_user = None
require_admin = None


class SteamLinkInput(BaseModel):
    steam_name: Optional[str] = None
    steam_id: Optional[str] = None


@router.get('/me')
async def get_profile(request: Request):
    """Get full profile including steam link."""
    user = await get_current_user(request)
    doc = await db.users.find_one(
        {'email': user['email']},
        {'_id': 0, 'password_hash': 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail='User not found')
    return doc


@router.post('/link-steam')
async def link_steam(data: SteamLinkInput, request: Request):
    """Link current user to a Steam identity."""
    user = await get_current_user(request)

    if not data.steam_name and not data.steam_id:
        raise HTTPException(status_code=400, detail='Provide steam_name or steam_id')

    update = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if data.steam_name:
        update['steam_name'] = data.steam_name.strip()
    if data.steam_id:
        sid = data.steam_id.strip()
        if not sid.isdigit() or len(sid) != 17:
            raise HTTPException(status_code=400, detail='SteamID must be a 17-digit number')
        update['steam_id'] = sid

    # Check for conflicts
    conflict_query = []
    if data.steam_name:
        conflict_query.append({'steam_name': update['steam_name'], 'email': {'$ne': user['email']}})
    if data.steam_id:
        conflict_query.append({'steam_id': update.get('steam_id'), 'email': {'$ne': user['email']}})

    if conflict_query:
        conflict = await db.users.find_one({'$or': conflict_query})
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=f'Steam identity already linked to {conflict.get("callsign", "another user")}',
            )

    await db.users.update_one({'email': user['email']}, {'$set': update})

    logger.info(f'Steam linked: {user["callsign"]} -> {data.steam_name or data.steam_id}')

    return {
        'message': f'Steam identity linked to {user["callsign"]}',
        'steam_name': update.get('steam_name', user.get('steam_name')),
        'steam_id': update.get('steam_id', user.get('steam_id')),
    }


@router.delete('/link-steam')
async def unlink_steam(request: Request):
    """Remove steam link from current user."""
    user = await get_current_user(request)
    await db.users.update_one(
        {'email': user['email']},
        {'$unset': {'steam_name': '', 'steam_id': '', 'game_uid': ''}},
    )
    return {'message': 'Steam identity unlinked'}


@router.get('/resolve-players')
async def resolve_online_players(request: Request):
    """Resolve raw game player names to app users."""
    await get_current_user(request)

    # Get all users with steam links
    linked = await db.users.find(
        {'$or': [{'steam_name': {'$exists': True}}, {'steam_id': {'$exists': True}}]},
        {'_id': 0, 'callsign': 1, 'steam_name': 1, 'steam_id': 1, 'role': 1, 'email': 1},
    ).to_list(200)

    return {
        'linked_users': [
            {
                'callsign': u.get('callsign'),
                'steam_name': u.get('steam_name'),
                'steam_id': u.get('steam_id'),
                'role': u.get('role'),
            }
            for u in linked
        ],
    }


@router.get('/available-players')
async def get_available_players(request: Request):
    """List all known game players (from session logs) that can be linked."""
    await get_current_user(request)

    # Get unique player names from sessions
    pipeline = [
        {'$group': {'_id': '$name', 'last_seen': {'$max': '$last_seen'}, 'count': {'$sum': 1}}},
        {'$sort': {'last_seen': -1}},
        {'$limit': 50},
    ]
    sessions = await db.player_sessions.aggregate(pipeline).to_list(50)

    players = []
    for s in sessions:
        raw_name = s.get('_id', '')
        identity = parse_player_identity(raw_name)
        # Check if already linked
        linked_to = None
        if identity.get('steam_id'):
            linked_user = await db.users.find_one({'steam_id': identity['steam_id']}, {'_id': 0, 'callsign': 1})
            if linked_user:
                linked_to = linked_user['callsign']
        elif identity.get('steam_name'):
            linked_user = await db.users.find_one({'steam_name': identity['steam_name']}, {'_id': 0, 'callsign': 1})
            if linked_user:
                linked_to = linked_user['callsign']

        players.append({
            **identity,
            'sessions': s.get('count', 0),
            'last_seen': s.get('last_seen'),
            'linked_to': linked_to,
        })

    return players


def init_profile_routes(database, auth_fn, admin_fn):
    global db, get_current_user, require_admin
    db = database
    get_current_user = auth_fn
    require_admin = admin_fn
    return router
