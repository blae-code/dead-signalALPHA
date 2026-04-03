from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gm", tags=["gamemaster"])

db = None
get_current_user = None
ptero = None


# ==================== MODELS ====================

class ScheduledTaskInput(BaseModel):
    name: str
    action: str  # restart, broadcast, command, backup
    params: dict = {}
    interval_minutes: int = 0  # 0 = one-shot
    enabled: bool = True

class ScheduledTaskUpdate(BaseModel):
    name: Optional[str] = None
    params: Optional[dict] = None
    interval_minutes: Optional[int] = None
    enabled: Optional[bool] = None

class BroadcastInput(BaseModel):
    message: str

class QuickCommandInput(BaseModel):
    command: str
    description: str = ''

class PlayerNoteInput(BaseModel):
    player_name: str
    note: str
    note_type: str = 'info'  # info, warning, ban_reason, watchlist

class PlayerActionInput(BaseModel):
    player_name: str
    action: str  # kick, ban, unban, whitelist, remove_whitelist, warn
    reason: str = ''
    duration_hours: int = 0  # 0 = permanent

class EventTriggerInput(BaseModel):
    name: str
    trigger_event: str  # player_connect, player_disconnect, player_death, horde_event, etc
    action: str  # broadcast, command
    params: dict = {}
    enabled: bool = True
    cooldown_seconds: int = 0


async def require_admin(request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


async def log_action(actor: str, action: str, details: dict):
    await db.gm_action_log.insert_one({
        'action': action,
        'details': details,
        'actor': actor,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })


# ==================== SCHEDULED TASKS ====================

@router.get('/tasks')
async def list_tasks(request: Request):
    await require_admin(request)
    tasks = await db.scheduled_tasks.find({}, {'_id': 0}).sort('created_at', -1).to_list(100)
    return tasks

@router.post('/tasks')
async def create_task(data: ScheduledTaskInput, request: Request):
    user = await require_admin(request)
    if data.action not in ('restart', 'broadcast', 'command', 'backup'):
        raise HTTPException(status_code=400, detail='Invalid action type')

    now = datetime.now(timezone.utc)
    task_id = str(ObjectId())
    next_run = now + timedelta(minutes=max(data.interval_minutes, 1)) if data.interval_minutes > 0 else now + timedelta(minutes=1)

    doc = {
        'task_id': task_id,
        'name': data.name.strip(),
        'action': data.action,
        'params': data.params,
        'interval_minutes': data.interval_minutes,
        'enabled': data.enabled,
        'next_run': next_run.isoformat(),
        'last_run': None,
        'last_error': None,
        'run_count': 0,
        'created_by': user.get('callsign', 'unknown'),
        'created_at': now.isoformat(),
    }
    await db.scheduled_tasks.insert_one(doc)
    doc.pop('_id', None)
    await log_action(user.get('callsign', '?'), 'create_task', {'task': data.name, 'action': data.action})
    return doc

@router.patch('/tasks/{task_id}')
async def update_task(task_id: str, data: ScheduledTaskUpdate, request: Request):
    user = await require_admin(request)
    updates = {}
    if data.name is not None:
        updates['name'] = data.name.strip()
    if data.params is not None:
        updates['params'] = data.params
    if data.interval_minutes is not None:
        updates['interval_minutes'] = data.interval_minutes
    if data.enabled is not None:
        updates['enabled'] = data.enabled
        if data.enabled:
            interval = data.interval_minutes if data.interval_minutes is not None else 60
            updates['next_run'] = (datetime.now(timezone.utc) + timedelta(minutes=max(interval, 1))).isoformat()

    if updates:
        await db.scheduled_tasks.update_one({'task_id': task_id}, {'$set': updates})
    await log_action(user.get('callsign', '?'), 'update_task', {'task_id': task_id})
    return {'message': 'Task updated'}

@router.delete('/tasks/{task_id}')
async def delete_task(task_id: str, request: Request):
    user = await require_admin(request)
    await db.scheduled_tasks.delete_one({'task_id': task_id})
    await log_action(user.get('callsign', '?'), 'delete_task', {'task_id': task_id})
    return {'message': 'Task deleted'}

@router.post('/tasks/{task_id}/run-now')
async def run_task_now(task_id: str, request: Request):
    user = await require_admin(request)
    now = datetime.now(timezone.utc).isoformat()
    await db.scheduled_tasks.update_one(
        {'task_id': task_id},
        {'$set': {'next_run': now}}
    )
    await log_action(user.get('callsign', '?'), 'run_task_now', {'task_id': task_id})
    return {'message': 'Task queued for immediate execution'}


# ==================== BROADCASTS ====================

@router.post('/broadcast')
async def send_broadcast(data: BroadcastInput, request: Request):
    user = await require_admin(request)
    msg = data.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail='Message cannot be empty')

    result = await ptero.send_command(f'say [DEAD SIGNAL] {msg}')
    now = datetime.now(timezone.utc).isoformat()

    await db.gm_broadcasts.insert_one({
        'message': msg,
        'sent_by': user.get('callsign', 'unknown'),
        'timestamp': now,
    })

    from server import ws_manager
    await ws_manager.broadcast({
        'type': 'gm_broadcast',
        'data': {'message': msg, 'sent_by': user.get('callsign'), 'timestamp': now}
    })

    await log_action(user.get('callsign', '?'), 'broadcast', {'message': msg})
    return {'message': 'Broadcast sent', 'result': result}

@router.get('/broadcasts')
async def list_broadcasts(request: Request, limit: int = 50):
    await require_admin(request)
    broadcasts = await db.gm_broadcasts.find({}, {'_id': 0}).sort('timestamp', -1).limit(limit).to_list(limit)
    return broadcasts


# ==================== QUICK COMMANDS ====================

@router.get('/quick-commands')
async def list_quick_commands(request: Request):
    await require_admin(request)
    cmds = await db.gm_quick_commands.find({}, {'_id': 0}).sort('created_at', -1).to_list(50)
    return cmds

@router.post('/quick-commands')
async def create_quick_command(data: QuickCommandInput, request: Request):
    user = await require_admin(request)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'cmd_id': str(ObjectId()),
        'command': data.command.strip(),
        'description': data.description.strip(),
        'created_by': user.get('callsign', 'unknown'),
        'created_at': now,
    }
    await db.gm_quick_commands.insert_one(doc)
    doc.pop('_id', None)
    return doc

@router.delete('/quick-commands/{cmd_id}')
async def delete_quick_command(cmd_id: str, request: Request):
    await require_admin(request)
    await db.gm_quick_commands.delete_one({'cmd_id': cmd_id})
    return {'message': 'Command deleted'}

@router.post('/quick-commands/{cmd_id}/execute')
async def execute_quick_command(cmd_id: str, request: Request):
    user = await require_admin(request)
    cmd = await db.gm_quick_commands.find_one({'cmd_id': cmd_id})
    if not cmd:
        raise HTTPException(status_code=404, detail='Command not found')
    result = await ptero.send_command(cmd['command'])
    await log_action(user.get('callsign', '?'), 'execute_quick_command', {'command': cmd['command']})
    return {'message': 'Command executed', 'result': result}


# ==================== PLAYER MANAGEMENT ====================

@router.get('/players')
async def list_managed_players(request: Request):
    await require_admin(request)
    players = await db.gm_players.find({}, {'_id': 0}).sort('updated_at', -1).to_list(200)
    return players

# NOTE: These specific routes MUST be defined BEFORE the parameterized route
@router.get('/players/banned')
async def list_banned(request: Request):
    await require_admin(request)
    banned = await db.gm_players.find({'status': 'banned'}, {'_id': 0}).to_list(200)
    return banned

@router.get('/players/watchlist')
async def get_watchlist(request: Request):
    await require_admin(request)
    watchlist = await db.gm_player_notes.find(
        {'note_type': 'watchlist'}, {'_id': 0}
    ).sort('timestamp', -1).to_list(100)
    return watchlist

@router.get('/players/{player_name}')
async def get_player_profile(player_name: str, request: Request):
    await require_admin(request)
    player = await db.gm_players.find_one({'player_name': player_name}, {'_id': 0})
    notes = await db.gm_player_notes.find(
        {'player_name': player_name}, {'_id': 0}
    ).sort('timestamp', -1).to_list(50)
    actions = await db.gm_action_log.find(
        {'details.player_name': player_name}, {'_id': 0}
    ).sort('timestamp', -1).to_list(50)
    sessions = await db.player_sessions.find(
        {'name': player_name}, {'_id': 0}
    ).sort('last_seen', -1).to_list(20)
    return {
        'profile': player or {'player_name': player_name, 'status': 'unknown'},
        'notes': notes,
        'actions': actions,
        'sessions': sessions,
    }

@router.post('/players/action')
async def player_action(data: PlayerActionInput, request: Request):
    user = await require_admin(request)
    name = data.player_name.strip()
    now = datetime.now(timezone.utc).isoformat()

    if data.action == 'kick':
        await ptero.send_command(f'kick {name}')
    elif data.action == 'ban':
        await ptero.send_command(f'ban {name}')
    elif data.action == 'unban':
        await ptero.send_command(f'unban {name}')
    elif data.action == 'warn':
        await ptero.send_command(f'say [WARNING] {name}: {data.reason}')
    elif data.action in ('whitelist', 'remove_whitelist'):
        pass  # Track internally

    # Update player record
    status_map = {
        'ban': 'banned', 'unban': 'active', 'kick': 'kicked',
        'whitelist': 'whitelisted', 'remove_whitelist': 'active', 'warn': None,
    }
    new_status = status_map.get(data.action)

    update_fields = {'updated_at': now}
    if new_status:
        update_fields['status'] = new_status
    if data.action == 'ban' and data.duration_hours > 0:
        update_fields['ban_expires'] = (datetime.now(timezone.utc) + timedelta(hours=data.duration_hours)).isoformat()
    if data.action == 'ban':
        update_fields['ban_reason'] = data.reason

    await db.gm_players.update_one(
        {'player_name': name},
        {'$set': update_fields, '$setOnInsert': {'player_name': name, 'created_at': now}},
        upsert=True,
    )

    # Add note
    if data.reason:
        await db.gm_player_notes.insert_one({
            'player_name': name,
            'note': data.reason,
            'note_type': 'ban_reason' if data.action == 'ban' else 'warning' if data.action == 'warn' else 'info',
            'author': user.get('callsign', 'unknown'),
            'timestamp': now,
        })

    await log_action(user.get('callsign', '?'), f'player_{data.action}', {
        'player_name': name, 'reason': data.reason, 'duration_hours': data.duration_hours,
    })
    return {'message': f'{data.action} executed on {name}'}

@router.post('/players/note')
async def add_player_note(data: PlayerNoteInput, request: Request):
    user = await require_admin(request)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        'player_name': data.player_name.strip(),
        'note': data.note.strip(),
        'note_type': data.note_type,
        'author': user.get('callsign', 'unknown'),
        'timestamp': now,
    }
    await db.gm_player_notes.insert_one(doc)
    doc.pop('_id', None)

    # Ensure player record exists
    await db.gm_players.update_one(
        {'player_name': data.player_name.strip()},
        {'$set': {'updated_at': now}, '$setOnInsert': {'player_name': data.player_name.strip(), 'status': 'active', 'created_at': now}},
        upsert=True,
    )

    await log_action(user.get('callsign', '?'), 'add_note', {'player_name': data.player_name, 'type': data.note_type})
    return doc

# ==================== EVENT TRIGGERS ====================

@router.get('/triggers')
async def list_triggers(request: Request):
    await require_admin(request)
    triggers = await db.gm_triggers.find({}, {'_id': 0}).sort('created_at', -1).to_list(50)
    return triggers

@router.post('/triggers')
async def create_trigger(data: EventTriggerInput, request: Request):
    user = await require_admin(request)
    now = datetime.now(timezone.utc).isoformat()
    trigger_id = str(ObjectId())
    doc = {
        'trigger_id': trigger_id,
        'name': data.name.strip(),
        'trigger_event': data.trigger_event,
        'action': data.action,
        'params': data.params,
        'enabled': data.enabled,
        'cooldown_seconds': data.cooldown_seconds,
        'last_fired': None,
        'fire_count': 0,
        'created_by': user.get('callsign', 'unknown'),
        'created_at': now,
    }
    await db.gm_triggers.insert_one(doc)
    doc.pop('_id', None)
    await log_action(user.get('callsign', '?'), 'create_trigger', {'name': data.name})
    return doc

@router.patch('/triggers/{trigger_id}')
async def update_trigger(trigger_id: str, request: Request):
    user = await require_admin(request)
    body = await request.json()
    allowed = {'name', 'trigger_event', 'action', 'params', 'enabled', 'cooldown_seconds'}
    updates = {k: v for k, v in body.items() if k in allowed}
    if updates:
        await db.gm_triggers.update_one({'trigger_id': trigger_id}, {'$set': updates})
    return {'message': 'Trigger updated'}

@router.delete('/triggers/{trigger_id}')
async def delete_trigger(trigger_id: str, request: Request):
    user = await require_admin(request)
    await db.gm_triggers.delete_one({'trigger_id': trigger_id})
    await log_action(user.get('callsign', '?'), 'delete_trigger', {'trigger_id': trigger_id})
    return {'message': 'Trigger deleted'}


# ==================== ACTION LOG ====================

@router.get('/log')
async def get_action_log(request: Request, limit: int = 100):
    await require_admin(request)
    log = await db.gm_action_log.find({}, {'_id': 0}).sort('timestamp', -1).limit(limit).to_list(limit)
    return log


# ==================== GM STATS ====================

@router.get('/stats')
async def gm_stats(request: Request):
    await require_admin(request)
    tasks = await db.scheduled_tasks.count_documents({'enabled': True})
    total_players = await db.gm_players.count_documents({})
    banned = await db.gm_players.count_documents({'status': 'banned'})
    triggers = await db.gm_triggers.count_documents({'enabled': True})
    broadcasts_today = await db.gm_broadcasts.count_documents({
        'timestamp': {'$gte': (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()}
    })
    actions_today = await db.gm_action_log.count_documents({
        'timestamp': {'$gte': (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()}
    })
    return {
        'active_tasks': tasks,
        'tracked_players': total_players,
        'banned_players': banned,
        'active_triggers': triggers,
        'broadcasts_24h': broadcasts_today,
        'actions_24h': actions_today,
    }


def init_gm_routes(database, auth_func, ptero_client):
    global db, get_current_user, ptero
    db = database
    get_current_user = auth_func
    ptero = ptero_client
    return router
