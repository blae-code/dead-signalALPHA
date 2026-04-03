from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/factions", tags=["factions"])

# Will be set by server.py on startup
db = None
get_current_user = None

FACTION_COLORS = [
    '#c4841d', '#6b7a3d', '#8b3a3a', '#3a6b8b', '#7a3d6b',
    '#3d7a6b', '#8b6b3a', '#4a5c3a', '#5c3a4a', '#3a4a5c',
]

# ==================== MODELS ====================

class CreateFactionInput(BaseModel):
    name: str
    tag: str
    description: str = ''
    color: str = '#c4841d'

class UpdateFactionInput(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None

class InviteInput(BaseModel):
    callsign: str

class DiplomacyInput(BaseModel):
    target_faction_id: str
    treaty_type: str  # alliance, trade, non_aggression, war

class DiplomacyResponseInput(BaseModel):
    accept: bool

# ==================== FACTION CRUD ====================

@router.get('')
async def list_factions(request: Request):
    await get_current_user(request)
    factions = await db.factions.find(
        {'status': 'active'}, {'_id': 0}
    ).sort('created_at', -1).to_list(100)
    return factions

@router.get('/my')
async def my_faction(request: Request):
    user = await get_current_user(request)
    uid = user['_id']
    membership = await db.faction_members.find_one(
        {'user_id': uid, 'status': 'active'}, {'_id': 0}
    )
    if not membership:
        return {'faction': None, 'membership': None}
    faction = await db.factions.find_one(
        {'faction_id': membership['faction_id'], 'status': 'active'}, {'_id': 0}
    )
    return {'faction': faction, 'membership': membership}

@router.post('')
async def create_faction(data: CreateFactionInput, request: Request):
    user = await get_current_user(request)
    uid = user['_id']
    callsign = user.get('callsign', 'Unknown')

    # Check not already in a faction
    existing = await db.faction_members.find_one({'user_id': uid, 'status': 'active'})
    if existing:
        raise HTTPException(status_code=400, detail='You are already in a faction. Leave first.')

    name = data.name.strip()
    tag = data.tag.strip().upper()
    if not name or len(name) < 2 or len(name) > 30:
        raise HTTPException(status_code=400, detail='Faction name must be 2-30 characters')
    if not tag or len(tag) < 2 or len(tag) > 5:
        raise HTTPException(status_code=400, detail='Faction tag must be 2-5 characters')

    # Check uniqueness
    if await db.factions.find_one({'$or': [{'name': name}, {'tag': tag}], 'status': 'active'}):
        raise HTTPException(status_code=400, detail='Faction name or tag already taken')

    if data.color not in FACTION_COLORS:
        data.color = FACTION_COLORS[0]

    faction_id = str(ObjectId())
    now = datetime.now(timezone.utc).isoformat()

    faction_doc = {
        'faction_id': faction_id,
        'name': name,
        'tag': tag,
        'description': data.description.strip()[:200],
        'color': data.color,
        'leader_id': uid,
        'leader_callsign': callsign,
        'member_count': 1,
        'territory_count': 0,
        'reputation': {},
        'status': 'active',
        'created_at': now,
    }
    await db.factions.insert_one(faction_doc)
    faction_doc.pop('_id', None)

    member_doc = {
        'faction_id': faction_id,
        'user_id': uid,
        'callsign': callsign,
        'role': 'leader',
        'status': 'active',
        'joined_at': now,
    }
    await db.faction_members.insert_one(member_doc)
    member_doc.pop('_id', None)

    logger.info(f'Faction created: [{tag}] {name} by {callsign}')
    return {'faction': faction_doc, 'membership': member_doc}

@router.get('/{faction_id}')
async def get_faction(faction_id: str, request: Request):
    await get_current_user(request)
    faction = await db.factions.find_one(
        {'faction_id': faction_id, 'status': 'active'}, {'_id': 0}
    )
    if not faction:
        raise HTTPException(status_code=404, detail='Faction not found')

    members = await db.faction_members.find(
        {'faction_id': faction_id, 'status': 'active'}, {'_id': 0}
    ).to_list(100)

    treaties = await db.diplomacy.find(
        {'$or': [{'from_faction_id': faction_id}, {'to_faction_id': faction_id}],
         'status': {'$in': ['active', 'proposed']}},
        {'_id': 0}
    ).to_list(50)

    return {'faction': faction, 'members': members, 'treaties': treaties}

@router.patch('/{faction_id}')
async def update_faction(faction_id: str, data: UpdateFactionInput, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    membership = await db.faction_members.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] not in ('leader', 'officer'):
        raise HTTPException(status_code=403, detail='Only faction leaders and officers can edit')

    updates = {}
    if data.name is not None:
        n = data.name.strip()
        if len(n) < 2 or len(n) > 30:
            raise HTTPException(status_code=400, detail='Invalid name length')
        dup = await db.factions.find_one({'name': n, 'faction_id': {'$ne': faction_id}, 'status': 'active'})
        if dup:
            raise HTTPException(status_code=400, detail='Name already taken')
        updates['name'] = n
    if data.description is not None:
        updates['description'] = data.description.strip()[:200]
    if data.color is not None and data.color in FACTION_COLORS:
        updates['color'] = data.color

    if updates:
        await db.factions.update_one({'faction_id': faction_id}, {'$set': updates})
    return {'message': 'Faction updated'}

@router.delete('/{faction_id}')
async def disband_faction(faction_id: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    faction = await db.factions.find_one({'faction_id': faction_id, 'status': 'active'})
    if not faction:
        raise HTTPException(status_code=404, detail='Faction not found')
    if faction['leader_id'] != uid and user.get('role') != 'system_admin':
        raise HTTPException(status_code=403, detail='Only the faction leader or system admin can disband')

    await db.factions.update_one({'faction_id': faction_id}, {'$set': {'status': 'disbanded'}})
    await db.faction_members.update_many(
        {'faction_id': faction_id, 'status': 'active'},
        {'$set': {'status': 'disbanded'}}
    )
    await db.diplomacy.update_many(
        {'$or': [{'from_faction_id': faction_id}, {'to_faction_id': faction_id}], 'status': 'active'},
        {'$set': {'status': 'expired'}}
    )
    return {'message': 'Faction disbanded'}

# ==================== MEMBERSHIP ====================

@router.post('/{faction_id}/invite')
async def invite_player(faction_id: str, data: InviteInput, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    membership = await db.faction_members.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] not in ('leader', 'officer'):
        raise HTTPException(status_code=403, detail='Only leaders and officers can invite')

    target = await db.users.find_one({'callsign': data.callsign.strip()})
    if not target:
        raise HTTPException(status_code=404, detail='Player not found')
    target_id = str(target['_id'])

    existing = await db.faction_members.find_one({'user_id': target_id, 'status': 'active'})
    if existing:
        raise HTTPException(status_code=400, detail='Player is already in a faction')

    pending = await db.faction_invites.find_one(
        {'faction_id': faction_id, 'user_id': target_id, 'status': 'pending'}
    )
    if pending:
        raise HTTPException(status_code=400, detail='Invite already pending')

    now = datetime.now(timezone.utc).isoformat()
    invite_doc = {
        'faction_id': faction_id,
        'user_id': target_id,
        'callsign': data.callsign.strip(),
        'invited_by': user.get('callsign', 'Unknown'),
        'status': 'pending',
        'created_at': now,
    }
    await db.faction_invites.insert_one(invite_doc)
    invite_doc.pop('_id', None)
    return {'message': f'Invite sent to {data.callsign}', 'invite': invite_doc}

@router.get('/invites/pending')
async def my_invites(request: Request):
    user = await get_current_user(request)
    uid = user['_id']
    invites = await db.faction_invites.find(
        {'user_id': uid, 'status': 'pending'}, {'_id': 0}
    ).to_list(20)
    # Batch fetch faction names
    faction_ids = list(set(inv['faction_id'] for inv in invites))
    if faction_ids:
        factions_list = await db.factions.find(
            {'faction_id': {'$in': faction_ids}}, {'_id': 0, 'faction_id': 1, 'name': 1, 'tag': 1}
        ).to_list(len(faction_ids))
        faction_map = {f['faction_id']: f for f in factions_list}
    else:
        faction_map = {}
    for inv in invites:
        f = faction_map.get(inv['faction_id'], {})
        inv['faction_name'] = f.get('name', '?')
        inv['faction_tag'] = f.get('tag', '?')
    return invites

@router.post('/invites/{faction_id}/accept')
async def accept_invite(faction_id: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    invite = await db.faction_invites.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'pending'}
    )
    if not invite:
        raise HTTPException(status_code=404, detail='No pending invite found')

    # Check not in another faction
    existing = await db.faction_members.find_one({'user_id': uid, 'status': 'active'})
    if existing:
        raise HTTPException(status_code=400, detail='Already in a faction. Leave first.')

    now = datetime.now(timezone.utc).isoformat()
    member_doc = {
        'faction_id': faction_id,
        'user_id': uid,
        'callsign': user.get('callsign', 'Unknown'),
        'role': 'member',
        'status': 'active',
        'joined_at': now,
    }
    await db.faction_members.insert_one(member_doc)
    await db.faction_invites.update_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'pending'},
        {'$set': {'status': 'accepted'}}
    )
    await db.factions.update_one({'faction_id': faction_id}, {'$inc': {'member_count': 1}})
    return {'message': 'Joined faction'}

@router.post('/invites/{faction_id}/decline')
async def decline_invite(faction_id: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']
    await db.faction_invites.update_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'pending'},
        {'$set': {'status': 'declined'}}
    )
    return {'message': 'Invite declined'}

@router.post('/{faction_id}/leave')
async def leave_faction(faction_id: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    membership = await db.faction_members.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'}
    )
    if not membership:
        raise HTTPException(status_code=404, detail='Not a member of this faction')
    if membership['role'] == 'leader':
        raise HTTPException(status_code=400, detail='Leaders must transfer leadership or disband')

    await db.faction_members.update_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'},
        {'$set': {'status': 'left'}}
    )
    await db.factions.update_one({'faction_id': faction_id}, {'$inc': {'member_count': -1}})
    return {'message': 'Left faction'}

@router.post('/{faction_id}/kick/{target_callsign}')
async def kick_member(faction_id: str, target_callsign: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    membership = await db.faction_members.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] not in ('leader', 'officer'):
        raise HTTPException(status_code=403, detail='Only leaders and officers can kick members')

    target_member = await db.faction_members.find_one(
        {'faction_id': faction_id, 'callsign': target_callsign, 'status': 'active'}
    )
    if not target_member:
        raise HTTPException(status_code=404, detail='Member not found')
    if target_member['role'] == 'leader':
        raise HTTPException(status_code=400, detail='Cannot kick the faction leader')

    await db.faction_members.update_one(
        {'faction_id': faction_id, 'callsign': target_callsign, 'status': 'active'},
        {'$set': {'status': 'kicked'}}
    )
    await db.factions.update_one({'faction_id': faction_id}, {'$inc': {'member_count': -1}})
    return {'message': f'{target_callsign} removed from faction'}

@router.post('/{faction_id}/promote/{target_callsign}')
async def promote_member(faction_id: str, target_callsign: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    membership = await db.faction_members.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] != 'leader':
        raise HTTPException(status_code=403, detail='Only leaders can promote')

    target = await db.faction_members.find_one(
        {'faction_id': faction_id, 'callsign': target_callsign, 'status': 'active'}
    )
    if not target:
        raise HTTPException(status_code=404, detail='Member not found')
    if target['role'] == 'officer':
        raise HTTPException(status_code=400, detail='Already an officer')

    await db.faction_members.update_one(
        {'faction_id': faction_id, 'callsign': target_callsign, 'status': 'active'},
        {'$set': {'role': 'officer'}}
    )
    return {'message': f'{target_callsign} promoted to officer'}

@router.post('/{faction_id}/demote/{target_callsign}')
async def demote_member(faction_id: str, target_callsign: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    membership = await db.faction_members.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] != 'leader':
        raise HTTPException(status_code=403, detail='Only leaders can demote')

    target = await db.faction_members.find_one(
        {'faction_id': faction_id, 'callsign': target_callsign, 'status': 'active'}
    )
    if not target:
        raise HTTPException(status_code=404, detail='Member not found')
    if target['role'] != 'officer':
        raise HTTPException(status_code=400, detail='Not an officer')

    await db.faction_members.update_one(
        {'faction_id': faction_id, 'callsign': target_callsign, 'status': 'active'},
        {'$set': {'role': 'member'}}
    )
    return {'message': f'{target_callsign} demoted to member'}

@router.post('/{faction_id}/transfer/{target_callsign}')
async def transfer_leadership(faction_id: str, target_callsign: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    membership = await db.faction_members.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] != 'leader':
        raise HTTPException(status_code=403, detail='Only leaders can transfer leadership')

    target = await db.faction_members.find_one(
        {'faction_id': faction_id, 'callsign': target_callsign, 'status': 'active'}
    )
    if not target:
        raise HTTPException(status_code=404, detail='Member not found')

    # Demote self, promote target
    await db.faction_members.update_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'},
        {'$set': {'role': 'officer'}}
    )
    await db.faction_members.update_one(
        {'faction_id': faction_id, 'callsign': target_callsign, 'status': 'active'},
        {'$set': {'role': 'leader'}}
    )
    await db.factions.update_one(
        {'faction_id': faction_id},
        {'$set': {'leader_id': target['user_id'], 'leader_callsign': target_callsign}}
    )
    return {'message': f'Leadership transferred to {target_callsign}'}

# ==================== DIPLOMACY ====================

@router.post('/{faction_id}/diplomacy')
async def propose_treaty(faction_id: str, data: DiplomacyInput, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    membership = await db.faction_members.find_one(
        {'faction_id': faction_id, 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] not in ('leader', 'officer'):
        raise HTTPException(status_code=403, detail='Only leaders and officers can propose treaties')

    if data.treaty_type not in ('alliance', 'trade', 'non_aggression', 'war'):
        raise HTTPException(status_code=400, detail='Invalid treaty type')

    target = await db.factions.find_one({'faction_id': data.target_faction_id, 'status': 'active'})
    if not target:
        raise HTTPException(status_code=404, detail='Target faction not found')
    if data.target_faction_id == faction_id:
        raise HTTPException(status_code=400, detail='Cannot propose treaty with yourself')

    # Check for existing active/pending treaty between these factions
    existing = await db.diplomacy.find_one({
        '$or': [
            {'from_faction_id': faction_id, 'to_faction_id': data.target_faction_id},
            {'from_faction_id': data.target_faction_id, 'to_faction_id': faction_id},
        ],
        'status': {'$in': ['active', 'proposed']},
    })
    if existing:
        raise HTTPException(status_code=400, detail='A treaty already exists between these factions')

    from_faction = await db.factions.find_one({'faction_id': faction_id}, {'_id': 0, 'name': 1, 'tag': 1})
    now = datetime.now(timezone.utc).isoformat()

    # War declarations are instant
    status = 'active' if data.treaty_type == 'war' else 'proposed'

    treaty_doc = {
        'treaty_id': str(ObjectId()),
        'from_faction_id': faction_id,
        'from_faction_name': from_faction.get('name', '?'),
        'from_faction_tag': from_faction.get('tag', '?'),
        'to_faction_id': data.target_faction_id,
        'to_faction_name': target.get('name', '?'),
        'to_faction_tag': target.get('tag', '?'),
        'treaty_type': data.treaty_type,
        'status': status,
        'proposed_by': user.get('callsign', 'Unknown'),
        'proposed_at': now,
        'resolved_at': now if status == 'active' else None,
    }
    await db.diplomacy.insert_one(treaty_doc)
    treaty_doc.pop('_id', None)
    return {'treaty': treaty_doc}

@router.get('/{faction_id}/diplomacy')
async def list_treaties(faction_id: str, request: Request):
    await get_current_user(request)
    treaties = await db.diplomacy.find(
        {'$or': [{'from_faction_id': faction_id}, {'to_faction_id': faction_id}]},
        {'_id': 0}
    ).sort('proposed_at', -1).to_list(50)
    return treaties

@router.post('/diplomacy/{treaty_id}/respond')
async def respond_treaty(treaty_id: str, data: DiplomacyResponseInput, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    treaty = await db.diplomacy.find_one({'treaty_id': treaty_id, 'status': 'proposed'})
    if not treaty:
        raise HTTPException(status_code=404, detail='Treaty not found or not pending')

    # Check user is leader/officer of target faction
    membership = await db.faction_members.find_one(
        {'faction_id': treaty['to_faction_id'], 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] not in ('leader', 'officer'):
        raise HTTPException(status_code=403, detail='Only target faction leaders/officers can respond')

    now = datetime.now(timezone.utc).isoformat()
    new_status = 'active' if data.accept else 'rejected'
    await db.diplomacy.update_one(
        {'treaty_id': treaty_id},
        {'$set': {'status': new_status, 'resolved_at': now}}
    )
    return {'message': f'Treaty {"accepted" if data.accept else "rejected"}'}

@router.post('/diplomacy/{treaty_id}/cancel')
async def cancel_treaty(treaty_id: str, request: Request):
    user = await get_current_user(request)
    uid = user['_id']

    treaty = await db.diplomacy.find_one({'treaty_id': treaty_id, 'status': {'$in': ['active', 'proposed']}})
    if not treaty:
        raise HTTPException(status_code=404, detail='Treaty not found')

    # Check user is leader/officer of either faction
    m1 = await db.faction_members.find_one(
        {'faction_id': treaty['from_faction_id'], 'user_id': uid, 'status': 'active', 'role': {'$in': ['leader', 'officer']}}
    )
    m2 = await db.faction_members.find_one(
        {'faction_id': treaty['to_faction_id'], 'user_id': uid, 'status': 'active', 'role': {'$in': ['leader', 'officer']}}
    )
    if not m1 and not m2:
        raise HTTPException(status_code=403, detail='Only faction leaders/officers can cancel treaties')

    now = datetime.now(timezone.utc).isoformat()
    await db.diplomacy.update_one(
        {'treaty_id': treaty_id},
        {'$set': {'status': 'expired', 'resolved_at': now}}
    )
    return {'message': 'Treaty cancelled'}


def init_faction_routes(database, auth_func):
    global db, get_current_user
    db = database
    get_current_user = auth_func
    return router
