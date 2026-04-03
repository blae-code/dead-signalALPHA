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


# ==================== REPUTATION ====================
# Each pair of factions has one shared document keyed by sorted faction IDs.
# Score: -100 (hostile) to +100 (allied).  GM can manually adjust.

REPUTATION_DELTAS = {
    'alliance_signed': 25,
    'war_declared': -40,
    'non_aggression_signed': 10,
    'trade_signed': 10,
    'treaty_cancelled': -10,
    'gm_manual': 0,   # variable — set by caller
}


def _rep_key(a: str, b: str) -> str:
    return '_'.join(sorted([a, b]))


async def _adjust_reputation(faction_a: str, faction_b: str, delta: int, reason: str):
    """Add `delta` to the reputation score between two factions (clamped -100…100)."""
    key = _rep_key(faction_a, faction_b)
    now = datetime.now(timezone.utc).isoformat()
    doc = await db.faction_reputation.find_one({'pair_key': key})
    if doc:
        new_score = max(-100, min(100, doc.get('score', 0) + delta))
        history = doc.get('history', [])[-19:]  # keep last 20
        history.append({'delta': delta, 'reason': reason, 'timestamp': now})
        await db.faction_reputation.update_one(
            {'pair_key': key},
            {'$set': {'score': new_score, 'updated_at': now, 'history': history}}
        )
    else:
        score = max(-100, min(100, delta))
        await db.faction_reputation.insert_one({
            'pair_key': key,
            'faction_a_id': sorted([faction_a, faction_b])[0],
            'faction_b_id': sorted([faction_a, faction_b])[1],
            'score': score,
            'history': [{'delta': delta, 'reason': reason, 'timestamp': now}],
            'updated_at': now,
        })


@router.get('/{faction_id}/reputation')
async def get_faction_reputation(faction_id: str, request: Request):
    """Get reputation scores between this faction and all others."""
    await get_current_user(request)
    faction = await db.factions.find_one({'faction_id': faction_id, 'status': 'active'})
    if not faction:
        raise HTTPException(status_code=404, detail='Faction not found')

    reps = await db.faction_reputation.find(
        {'$or': [{'faction_a_id': faction_id}, {'faction_b_id': faction_id}]},
        {'_id': 0}
    ).to_list(100)

    # Attach faction names for readability
    other_ids = []
    for r in reps:
        other = r['faction_b_id'] if r['faction_a_id'] == faction_id else r['faction_a_id']
        other_ids.append(other)

    factions_list = await db.factions.find(
        {'faction_id': {'$in': other_ids}}, {'_id': 0, 'faction_id': 1, 'name': 1, 'tag': 1, 'color': 1}
    ).to_list(len(other_ids) + 1)
    faction_map = {f['faction_id']: f for f in factions_list}

    result = []
    for r in reps:
        other_id = r['faction_b_id'] if r['faction_a_id'] == faction_id else r['faction_a_id']
        other_info = faction_map.get(other_id, {})
        result.append({
            'other_faction_id': other_id,
            'other_faction_name': other_info.get('name', '?'),
            'other_faction_tag': other_info.get('tag', '?'),
            'other_faction_color': other_info.get('color', '#88837a'),
            'score': r['score'],
            'updated_at': r.get('updated_at'),
            'history': r.get('history', []),
        })
    result.sort(key=lambda x: x['score'], reverse=True)
    return result


class ReputationAdjustInput(BaseModel):
    faction_a_id: str
    faction_b_id: str
    delta: int   # -100 to 100
    reason: str = 'gm_adjustment'


@router.post('/reputation/adjust')
async def adjust_reputation(data: ReputationAdjustInput, request: Request):
    """GM-only: manually adjust reputation between two factions."""
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    if data.delta < -100 or data.delta > 100:
        raise HTTPException(status_code=400, detail='Delta must be between -100 and 100')
    if data.faction_a_id == data.faction_b_id:
        raise HTTPException(status_code=400, detail='Cannot set reputation with yourself')

    for fid in (data.faction_a_id, data.faction_b_id):
        if not await db.factions.find_one({'faction_id': fid, 'status': 'active'}):
            raise HTTPException(status_code=404, detail=f'Faction {fid} not found')

    reason = (data.reason or 'gm_adjustment').strip()[:100]
    await _adjust_reputation(data.faction_a_id, data.faction_b_id, data.delta, reason)
    return {'message': f'Reputation adjusted by {data.delta:+d}'}


# Auto-update reputation when treaties are resolved.
# Monkey-patch the respond_treaty and propose_treaty handlers to call _adjust_reputation.
# This is done via a thin wrapper registered after the base routes.

@router.post('/diplomacy/{treaty_id}/respond-and-rep')
async def respond_treaty_with_rep(treaty_id: str, request: Request):
    """Internal: respond to treaty AND update reputation. Supersedes /respond in client calls."""
    # Re-use existing logic by calling the actual handler
    from fastapi import Request as _Req
    body = await request.json()
    accept = bool(body.get('accept', False))
    user = await get_current_user(request)
    uid = user['_id']

    treaty = await db.diplomacy.find_one({'treaty_id': treaty_id, 'status': 'proposed'})
    if not treaty:
        raise HTTPException(status_code=404, detail='Treaty not found or not pending')

    membership = await db.faction_members.find_one(
        {'faction_id': treaty['to_faction_id'], 'user_id': uid, 'status': 'active'}
    )
    if not membership or membership['role'] not in ('leader', 'officer'):
        raise HTTPException(status_code=403, detail='Only target faction leaders/officers can respond')

    now = datetime.now(timezone.utc).isoformat()
    new_status = 'active' if accept else 'rejected'
    await db.diplomacy.update_one({'treaty_id': treaty_id}, {'$set': {'status': new_status, 'resolved_at': now}})

    if accept:
        delta_map = {'alliance': 25, 'trade': 10, 'non_aggression': 10, 'war': -40}
        delta = delta_map.get(treaty['treaty_type'], 5)
        await _adjust_reputation(treaty['from_faction_id'], treaty['to_faction_id'], delta,
                                  f'{treaty["treaty_type"]}_signed')

    return {'message': f'Treaty {"accepted" if accept else "rejected"}'}


# ==================== TERRITORY ====================

TERRITORY_TYPES = {
    'safe_house', 'supply_depot', 'outpost', 'trading_post',
    'spawn_point', 'industrial', 'residential', 'military', 'wilderness',
}
TERRITORY_STATUSES = {'unclaimed', 'controlled', 'contested', 'destroyed'}


class TerritoryInput(BaseModel):
    name: str
    territory_type: str
    location_name: str = ''
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    description: str = ''
    bonuses: List[str] = []


class TerritoryUpdate(BaseModel):
    name: Optional[str] = None
    territory_type: Optional[str] = None
    location_name: Optional[str] = None
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    description: Optional[str] = None
    bonuses: Optional[List[str]] = None
    status: Optional[str] = None
    controlled_by: Optional[str] = None   # faction_id or null to unclaim
    notes: Optional[str] = None


@router.get('/territories')
async def list_territories(request: Request, status: Optional[str] = None):
    """List all territories (visible to all authenticated users)."""
    await get_current_user(request)
    query: dict = {}
    if status:
        if status not in TERRITORY_STATUSES:
            raise HTTPException(status_code=400, detail='Invalid status')
        query['status'] = status
    territories = await db.territories.find(query, {'_id': 0}).sort('name', 1).to_list(200)
    return territories


@router.post('/territories')
async def create_territory(data: TerritoryInput, request: Request):
    """GM only: create a claimable territory."""
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')

    if data.territory_type not in TERRITORY_TYPES:
        raise HTTPException(status_code=400, detail=f'Invalid territory_type')
    name = data.name.strip()
    if not name or len(name) > 80:
        raise HTTPException(status_code=400, detail='Name required (max 80 chars)')

    bonuses = [(b.strip()[:120]) for b in (data.bonuses or [])[:10] if b.strip()]
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'territory_id': str(ObjectId()),
        'name': name,
        'territory_type': data.territory_type,
        'location_name': (data.location_name or '').strip()[:100],
        'grid_x': data.grid_x,
        'grid_y': data.grid_y,
        'description': (data.description or '').strip()[:500],
        'bonuses': bonuses,
        'status': 'unclaimed',
        'controlled_by': None,
        'controlled_by_name': None,
        'controlled_by_tag': None,
        'contested_by': None,
        'contested_by_name': None,
        'notes': '',
        'created_by': user.get('callsign', 'unknown'),
        'created_at': now,
        'updated_at': now,
    }
    await db.territories.insert_one(doc)
    doc.pop('_id', None)
    return doc


@router.patch('/territories/{territory_id}')
async def update_territory(territory_id: str, data: TerritoryUpdate, request: Request):
    """GM only: update territory details or forcibly set control."""
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')

    territory = await db.territories.find_one({'territory_id': territory_id})
    if not territory:
        raise HTTPException(status_code=404, detail='Territory not found')

    updates: dict = {'updated_at': datetime.now(timezone.utc).isoformat()}
    if data.name is not None:
        n = data.name.strip()
        if not n or len(n) > 80:
            raise HTTPException(status_code=400, detail='Invalid name')
        updates['name'] = n
    if data.territory_type is not None:
        if data.territory_type not in TERRITORY_TYPES:
            raise HTTPException(status_code=400, detail='Invalid territory_type')
        updates['territory_type'] = data.territory_type
    if data.location_name is not None:
        updates['location_name'] = data.location_name.strip()[:100]
    if data.grid_x is not None:
        updates['grid_x'] = data.grid_x
    if data.grid_y is not None:
        updates['grid_y'] = data.grid_y
    if data.description is not None:
        updates['description'] = data.description.strip()[:500]
    if data.bonuses is not None:
        updates['bonuses'] = [(b.strip()[:120]) for b in data.bonuses[:10] if b.strip()]
    if data.status is not None:
        if data.status not in TERRITORY_STATUSES:
            raise HTTPException(status_code=400, detail='Invalid status')
        updates['status'] = data.status
    if data.notes is not None:
        updates['notes'] = data.notes.strip()[:500]
    if data.controlled_by is not None:
        if data.controlled_by == '':
            # Unclaim
            updates.update({'controlled_by': None, 'controlled_by_name': None,
                            'controlled_by_tag': None, 'status': 'unclaimed'})
        else:
            faction = await db.factions.find_one({'faction_id': data.controlled_by, 'status': 'active'})
            if not faction:
                raise HTTPException(status_code=404, detail='Faction not found')
            updates.update({
                'controlled_by': data.controlled_by,
                'controlled_by_name': faction['name'],
                'controlled_by_tag': faction['tag'],
                'status': 'controlled',
                'contested_by': None,
                'contested_by_name': None,
            })
            # Update faction territory count
            old_controller = territory.get('controlled_by')
            if old_controller and old_controller != data.controlled_by:
                await db.factions.update_one({'faction_id': old_controller}, {'$inc': {'territory_count': -1}})
            if old_controller != data.controlled_by:
                await db.factions.update_one({'faction_id': data.controlled_by}, {'$inc': {'territory_count': 1}})

    await db.territories.update_one({'territory_id': territory_id}, {'$set': updates})
    return {'message': 'Territory updated'}


@router.post('/territories/{territory_id}/claim')
async def claim_territory(territory_id: str, request: Request):
    """Faction leader/officer claims an unclaimed territory."""
    user = await get_current_user(request)
    uid = user['_id']

    territory = await db.territories.find_one({'territory_id': territory_id}, {'_id': 0})
    if not territory:
        raise HTTPException(status_code=404, detail='Territory not found')
    if territory['status'] not in ('unclaimed', 'contested'):
        raise HTTPException(status_code=400, detail='Territory is already controlled')

    membership = await db.faction_members.find_one(
        {'user_id': uid, 'status': 'active', 'role': {'$in': ['leader', 'officer']}}, {'_id': 0}
    )
    if not membership:
        raise HTTPException(status_code=403, detail='Only faction leaders/officers can claim territory')

    faction = await db.factions.find_one({'faction_id': membership['faction_id'], 'status': 'active'})
    if not faction:
        raise HTTPException(status_code=404, detail='Faction not found')

    now = datetime.now(timezone.utc).isoformat()
    old_controller = territory.get('controlled_by')

    await db.territories.update_one(
        {'territory_id': territory_id},
        {'$set': {
            'controlled_by': faction['faction_id'],
            'controlled_by_name': faction['name'],
            'controlled_by_tag': faction['tag'],
            'contested_by': None,
            'contested_by_name': None,
            'status': 'controlled',
            'updated_at': now,
        }}
    )
    # Update territory counts
    if old_controller and old_controller != faction['faction_id']:
        await db.factions.update_one({'faction_id': old_controller}, {'$inc': {'territory_count': -1}})
    if old_controller != faction['faction_id']:
        await db.factions.update_one({'faction_id': faction['faction_id']}, {'$inc': {'territory_count': 1}})

    return {'message': f'[{faction["tag"]}] {faction["name"]} now controls {territory["name"]}'}


@router.post('/territories/{territory_id}/contest')
async def contest_territory(territory_id: str, request: Request):
    """Faction leader/officer contests a territory controlled by another faction."""
    user = await get_current_user(request)
    uid = user['_id']

    territory = await db.territories.find_one({'territory_id': territory_id}, {'_id': 0})
    if not territory:
        raise HTTPException(status_code=404, detail='Territory not found')
    if territory['status'] != 'controlled':
        raise HTTPException(status_code=400, detail='Can only contest controlled territory')

    membership = await db.faction_members.find_one(
        {'user_id': uid, 'status': 'active', 'role': {'$in': ['leader', 'officer']}}, {'_id': 0}
    )
    if not membership:
        raise HTTPException(status_code=403, detail='Only faction leaders/officers can contest territory')

    if membership['faction_id'] == territory.get('controlled_by'):
        raise HTTPException(status_code=400, detail='You already control this territory')

    faction = await db.factions.find_one({'faction_id': membership['faction_id'], 'status': 'active'})
    if not faction:
        raise HTTPException(status_code=404, detail='Faction not found')

    now = datetime.now(timezone.utc).isoformat()
    await db.territories.update_one(
        {'territory_id': territory_id},
        {'$set': {
            'contested_by': faction['faction_id'],
            'contested_by_name': faction['name'],
            'status': 'contested',
            'updated_at': now,
        }}
    )
    return {'message': f'{territory["name"]} is now contested by [{faction["tag"]}] {faction["name"]}'}


@router.delete('/territories/{territory_id}')
async def delete_territory(territory_id: str, request: Request):
    """GM only: remove a territory."""
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    territory = await db.territories.find_one({'territory_id': territory_id}, {'_id': 0, 'controlled_by': 1})
    if not territory:
        raise HTTPException(status_code=404, detail='Territory not found')
    if territory.get('controlled_by'):
        await db.factions.update_one({'faction_id': territory['controlled_by']}, {'$inc': {'territory_count': -1}})
    await db.territories.delete_one({'territory_id': territory_id})
    return {'message': 'Territory deleted'}


def init_faction_routes(database, auth_func):
    global db, get_current_user
    db = database
    get_current_user = auth_func
    return router
