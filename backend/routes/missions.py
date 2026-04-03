from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/missions", tags=["missions"])

db = None
get_current_user = None
ptero = None
ws_manager = None

MISSION_TYPES = {'story', 'side_quest', 'faction', 'survival', 'bounty', 'supply_run', 'escort', 'defend', 'explore'}
MISSION_STATUSES = {'draft', 'active', 'completed', 'failed', 'cancelled', 'paused'}
OBJECTIVE_TYPES = {'kill', 'collect', 'reach_location', 'survive', 'trade', 'craft', 'defend', 'escort', 'talk_to_npc', 'custom'}
REWARD_TYPES = {'item', 'faction_rep', 'narrative_unlock', 'access', 'custom'}
DIFFICULTY = {'trivial', 'easy', 'medium', 'hard', 'extreme'}


# ==================== MODELS ====================

class MissionObjective(BaseModel):
    objective_id: str = ''          # auto-generated if empty
    description: str
    objective_type: str             # kill, collect, reach_location, etc.
    target: str = ''                # what to kill/collect/reach
    quantity: int = 1
    optional: bool = False
    completed: bool = False

class MissionReward(BaseModel):
    reward_type: str                # item, faction_rep, narrative_unlock, access, custom
    description: str
    quantity: int = 1
    faction_name: str = ''         # for faction_rep rewards

class MissionStage(BaseModel):
    stage_id: str = ''             # auto-generated if empty
    title: str
    description: str
    objectives: List[MissionObjective] = []
    completed: bool = False
    order: int = 0

class MissionInput(BaseModel):
    title: str
    summary: str
    mission_type: str
    difficulty: str = 'medium'
    stages: List[MissionStage] = []
    rewards: List[MissionReward] = []
    assigned_players: List[str] = []    # player callsigns
    assigned_faction: str = ''
    linked_npc_id: str = ''             # NPC quest-giver
    deadline_hours: int = 0             # 0 = no deadline
    broadcast_on_activate: bool = True
    gm_notes: str = ''

class MissionUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    mission_type: Optional[str] = None
    difficulty: Optional[str] = None
    stages: Optional[List[MissionStage]] = None
    rewards: Optional[List[MissionReward]] = None
    assigned_players: Optional[List[str]] = None
    assigned_faction: Optional[str] = None
    linked_npc_id: Optional[str] = None
    deadline_hours: Optional[int] = None
    broadcast_on_activate: Optional[bool] = None
    gm_notes: Optional[str] = None
    status: Optional[str] = None

class MissionStatusUpdate(BaseModel):
    status: str
    broadcast_message: str = ''     # optional RCON announcement

class ObjectiveProgressUpdate(BaseModel):
    stage_id: str
    objective_id: str
    completed: bool


# ==================== HELPERS ====================

async def require_admin(request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


async def require_any_user(request: Request):
    return await get_current_user(request)


async def log_action(actor: str, action: str, details: dict):
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


def _build_stages(stages_input: List[MissionStage]) -> list:
    result = []
    for i, stage in enumerate(stages_input[:20]):
        stage_id = stage.stage_id.strip() or str(ObjectId())
        title = clean_text(stage.title, 'Stage title', max_len=100)
        desc = clean_text(stage.description, 'Stage description', max_len=1000)
        objectives = []
        for obj in stage.objectives[:20]:
            ensure_allowed(obj.objective_type, OBJECTIVE_TYPES, 'objective type')
            obj_id = obj.objective_id.strip() or str(ObjectId())
            objectives.append({
                'objective_id': obj_id,
                'description': clean_text(obj.description, 'Objective description', max_len=300),
                'objective_type': obj.objective_type,
                'target': (obj.target or '').strip()[:100],
                'quantity': max(1, min(obj.quantity, 9999)),
                'optional': obj.optional,
                'completed': obj.completed,
            })
        result.append({
            'stage_id': stage_id,
            'title': title,
            'description': desc,
            'objectives': objectives,
            'completed': stage.completed,
            'order': i,
        })
    return result


def _build_rewards(rewards_input: List[MissionReward]) -> list:
    result = []
    for r in rewards_input[:20]:
        ensure_allowed(r.reward_type, REWARD_TYPES, 'reward type')
        result.append({
            'reward_type': r.reward_type,
            'description': clean_text(r.description, 'Reward description', max_len=200),
            'quantity': max(1, min(r.quantity, 9999)),
            'faction_name': (r.faction_name or '').strip()[:80],
        })
    return result


# ==================== MISSION CRUD ====================

@router.get('')
async def list_missions(
    request: Request,
    status: Optional[str] = None,
    mission_type: Optional[str] = None,
    assigned_player: Optional[str] = None,
):
    """List all missions. Players see only active/completed. Admins see all."""
    user = await require_any_user(request)
    is_admin = user.get('role') in ('system_admin', 'server_admin')

    query: dict = {}
    if status:
        ensure_allowed(status, MISSION_STATUSES, 'status')
        query['status'] = status
    elif not is_admin:
        # Players only see published (non-draft) missions
        query['status'] = {'$in': ['active', 'completed', 'failed', 'paused']}

    if mission_type:
        ensure_allowed(mission_type, MISSION_TYPES, 'mission_type')
        query['mission_type'] = mission_type

    if assigned_player:
        query['assigned_players'] = assigned_player

    # Hide GM notes from players
    projection = {'_id': 0} if is_admin else {'_id': 0, 'gm_notes': 0}
    missions = await db.missions.find(query, projection).sort('created_at', -1).to_list(200)
    return missions


@router.get('/summary')
async def missions_summary(request: Request):
    """Mission counts by status for the GM overview."""
    await require_admin(request)
    total = await db.missions.count_documents({})
    by_status = {}
    for s in MISSION_STATUSES:
        by_status[s] = await db.missions.count_documents({'status': s})
    return {'total': total, 'by_status': by_status}


@router.get('/{mission_id}')
async def get_mission(mission_id: str, request: Request):
    """Get full mission details."""
    user = await require_any_user(request)
    is_admin = user.get('role') in ('system_admin', 'server_admin')
    projection = {'_id': 0} if is_admin else {'_id': 0, 'gm_notes': 0}

    mission = await db.missions.find_one({'mission_id': mission_id}, projection)
    if not mission:
        raise HTTPException(status_code=404, detail='Mission not found')

    # Players can only view non-draft missions
    if not is_admin and mission.get('status') == 'draft':
        raise HTTPException(status_code=404, detail='Mission not found')

    return mission


@router.post('')
async def create_mission(data: MissionInput, request: Request):
    """Create a new mission (draft by default)."""
    user = await require_admin(request)
    ensure_allowed(data.mission_type, MISSION_TYPES, 'mission_type')
    ensure_allowed(data.difficulty, DIFFICULTY, 'difficulty')
    title = clean_text(data.title, 'Mission title', max_len=120)
    summary = clean_text(data.summary, 'Mission summary', max_len=2000)

    if data.deadline_hours < 0 or data.deadline_hours > 8760:
        raise HTTPException(status_code=400, detail='Deadline must be between 0 and 8760 hours')

    # Validate assigned players (callsigns, basic sanity)
    assigned = [p.strip()[:80] for p in data.assigned_players[:50] if p.strip()]

    now = datetime.now(timezone.utc).isoformat()
    mission_id = str(ObjectId())

    doc = {
        'mission_id': mission_id,
        'title': title,
        'summary': summary,
        'mission_type': data.mission_type,
        'difficulty': data.difficulty,
        'stages': _build_stages(data.stages),
        'rewards': _build_rewards(data.rewards),
        'assigned_players': assigned,
        'assigned_faction': (data.assigned_faction or '').strip()[:80],
        'linked_npc_id': (data.linked_npc_id or '').strip(),
        'deadline_hours': data.deadline_hours,
        'broadcast_on_activate': data.broadcast_on_activate,
        'gm_notes': (data.gm_notes or '').strip()[:2000],
        'status': 'draft',
        'created_by': user.get('callsign', 'unknown'),
        'created_at': now,
        'updated_at': now,
        'activated_at': None,
        'completed_at': None,
    }
    await db.missions.insert_one(doc)
    doc.pop('_id', None)
    await log_action(user.get('callsign', '?'), 'create_mission', {'mission_id': mission_id, 'title': title})
    return doc


@router.patch('/{mission_id}')
async def update_mission(mission_id: str, data: MissionUpdate, request: Request):
    """Update mission fields (stays in current status)."""
    user = await require_admin(request)
    mission = await db.missions.find_one({'mission_id': mission_id})
    if not mission:
        raise HTTPException(status_code=404, detail='Mission not found')

    updates: dict = {'updated_at': datetime.now(timezone.utc).isoformat()}

    if data.title is not None:
        updates['title'] = clean_text(data.title, 'Mission title', max_len=120)
    if data.summary is not None:
        updates['summary'] = clean_text(data.summary, 'Mission summary', max_len=2000)
    if data.mission_type is not None:
        updates['mission_type'] = ensure_allowed(data.mission_type, MISSION_TYPES, 'mission_type')
    if data.difficulty is not None:
        updates['difficulty'] = ensure_allowed(data.difficulty, DIFFICULTY, 'difficulty')
    if data.status is not None:
        updates['status'] = ensure_allowed(data.status, MISSION_STATUSES, 'status')
    if data.stages is not None:
        updates['stages'] = _build_stages(data.stages)
    if data.rewards is not None:
        updates['rewards'] = _build_rewards(data.rewards)
    if data.assigned_players is not None:
        updates['assigned_players'] = [p.strip()[:80] for p in data.assigned_players[:50] if p.strip()]
    if data.assigned_faction is not None:
        updates['assigned_faction'] = data.assigned_faction.strip()[:80]
    if data.linked_npc_id is not None:
        updates['linked_npc_id'] = data.linked_npc_id.strip()
    if data.deadline_hours is not None:
        if data.deadline_hours < 0 or data.deadline_hours > 8760:
            raise HTTPException(status_code=400, detail='Deadline must be between 0 and 8760 hours')
        updates['deadline_hours'] = data.deadline_hours
    if data.broadcast_on_activate is not None:
        updates['broadcast_on_activate'] = data.broadcast_on_activate
    if data.gm_notes is not None:
        updates['gm_notes'] = data.gm_notes.strip()[:2000]

    await db.missions.update_one({'mission_id': mission_id}, {'$set': updates})
    await log_action(user.get('callsign', '?'), 'update_mission', {'mission_id': mission_id})
    return {'message': 'Mission updated'}


@router.post('/{mission_id}/status')
async def set_mission_status(mission_id: str, data: MissionStatusUpdate, request: Request):
    """Activate, pause, complete, fail, or cancel a mission with optional RCON broadcast."""
    user = await require_admin(request)
    ensure_allowed(data.status, MISSION_STATUSES, 'status')

    mission = await db.missions.find_one({'mission_id': mission_id}, {'_id': 0})
    if not mission:
        raise HTTPException(status_code=404, detail='Mission not found')

    now = datetime.now(timezone.utc).isoformat()
    updates: dict = {'status': data.status, 'updated_at': now}

    if data.status == 'active' and not mission.get('activated_at'):
        updates['activated_at'] = now
    if data.status in ('completed', 'failed', 'cancelled'):
        updates['completed_at'] = now

    await db.missions.update_one({'mission_id': mission_id}, {'$set': updates})

    # Broadcast message via RCON if provided or if auto-broadcast is on for activation
    broadcast_msg = (data.broadcast_message or '').strip()
    if not broadcast_msg and data.status == 'active' and mission.get('broadcast_on_activate'):
        broadcast_msg = f'[MISSION] New mission active: {mission["title"]} — {mission["summary"][:100]}'

    if broadcast_msg:
        await ptero.send_command(f'say {broadcast_msg[:240]}')
        await db.gm_broadcasts.insert_one({
            'message': broadcast_msg,
            'sent_by': user.get('callsign', 'unknown'),
            'timestamp': now,
        })

    if ws_manager:
        await ws_manager.broadcast({'type': 'mission_update', 'data': {
            'action': 'status_changed',
            'mission_id': mission_id,
            'title': mission['title'],
            'status': data.status,
        }})

    await log_action(user.get('callsign', '?'), 'mission_status_change', {
        'mission_id': mission_id, 'title': mission['title'], 'status': data.status,
    })
    return {'message': f'Mission set to {data.status}'}


@router.post('/{mission_id}/objectives')
async def update_objective_progress(mission_id: str, data: ObjectiveProgressUpdate, request: Request):
    """Mark a specific objective as complete or incomplete."""
    user = await require_admin(request)
    mission = await db.missions.find_one({'mission_id': mission_id}, {'_id': 0})
    if not mission:
        raise HTTPException(status_code=404, detail='Mission not found')

    stages = mission.get('stages', [])
    updated = False
    for stage in stages:
        if stage['stage_id'] == data.stage_id:
            for obj in stage['objectives']:
                if obj['objective_id'] == data.objective_id:
                    obj['completed'] = data.completed
                    updated = True
            # Auto-complete stage when all required objectives done
            required_done = all(o['completed'] for o in stage['objectives'] if not o.get('optional'))
            stage['completed'] = required_done
            break

    if not updated:
        raise HTTPException(status_code=404, detail='Objective not found')

    now = datetime.now(timezone.utc).isoformat()
    await db.missions.update_one({'mission_id': mission_id}, {'$set': {'stages': stages, 'updated_at': now}})
    await log_action(user.get('callsign', '?'), 'update_objective', {
        'mission_id': mission_id, 'stage_id': data.stage_id, 'objective_id': data.objective_id,
    })
    return {'message': 'Objective updated', 'stages': stages}


@router.delete('/{mission_id}')
async def delete_mission(mission_id: str, request: Request):
    """Delete a mission (only drafts and cancelled missions)."""
    user = await require_admin(request)
    mission = await db.missions.find_one({'mission_id': mission_id}, {'_id': 0, 'status': 1, 'title': 1})
    if not mission:
        raise HTTPException(status_code=404, detail='Mission not found')
    if mission['status'] not in ('draft', 'cancelled'):
        raise HTTPException(status_code=400, detail='Only draft or cancelled missions can be deleted')

    await db.missions.delete_one({'mission_id': mission_id})
    await log_action(user.get('callsign', '?'), 'delete_mission', {'mission_id': mission_id, 'title': mission['title']})
    return {'message': 'Mission deleted'}


def init_mission_routes(database, auth_func, ptero_client, ws_broadcast_manager=None):
    global db, get_current_user, ptero, ws_manager
    db = database
    get_current_user = auth_func
    ptero = ptero_client
    ws_manager = ws_broadcast_manager
    return router
