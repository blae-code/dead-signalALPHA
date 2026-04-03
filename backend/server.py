from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, List
import json
import asyncio

from pterodactyl import PterodactylClient
from event_parser import parse_log_line
from ai_narrator import AINarrator
from pterodactyl_ws import PterodactylWSConsumer

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB
mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

# Services
ptero = PterodactylClient()
narrator = AINarrator()

# App
app = FastAPI(title="Dead Signal API")
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"

# ==================== CORS ====================
frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, 'http://localhost:3000'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== AUTH HELPERS ====================

import secrets
import string

KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

def get_jwt_secret():
    return os.environ.get('JWT_SECRET', 'fallback-secret-change-me')

def hash_key(raw: str) -> str:
    return bcrypt.hashpw(raw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_key(raw: str, hashed: str) -> bool:
    return bcrypt.checkpw(raw.encode('utf-8'), hashed.encode('utf-8'))

def generate_auth_key() -> str:
    groups = [''.join(secrets.choice(KEY_CHARS) for _ in range(4)) for _ in range(4)]
    return f'DS-{"-".join(groups)}'

def create_access_token(user_id: str, callsign: str, role: str) -> str:
    return pyjwt.encode(
        {'sub': user_id, 'callsign': callsign, 'role': role,
         'exp': datetime.now(timezone.utc) + timedelta(hours=12), 'type': 'access'},
        get_jwt_secret(), algorithm=JWT_ALGORITHM
    )

def create_refresh_token(user_id: str) -> str:
    return pyjwt.encode(
        {'sub': user_id, 'exp': datetime.now(timezone.utc) + timedelta(days=30), 'type': 'refresh'},
        get_jwt_secret(), algorithm=JWT_ALGORITHM
    )

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get('access_token')
    if not token:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail='Not authenticated')
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get('type') != 'access':
            raise HTTPException(status_code=401, detail='Invalid token type')
        user = await db.users.find_one({'_id': ObjectId(payload['sub'])})
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        if user.get('status') != 'active':
            raise HTTPException(status_code=403, detail=f'Account {user.get("status", "inactive")}')
        user['_id'] = str(user['_id'])
        user.pop('auth_key_hash', None)
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expired')
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid token')

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie(key='access_token', value=access, httponly=True, secure=False, samesite='lax', max_age=43200, path='/')
    response.set_cookie(key='refresh_token', value=refresh, httponly=True, secure=False, samesite='lax', max_age=2592000, path='/')

# ==================== PYDANTIC MODELS ====================

class SetupInput(BaseModel):
    callsign: str
    setup_secret: str

class LoginInput(BaseModel):
    callsign: str
    auth_key: str

class GenerateKeyInput(BaseModel):
    callsign: str
    role: str = 'player'

class PowerAction(BaseModel):
    signal: str

class CommandInput(BaseModel):
    command: str

class NarrateInput(BaseModel):
    event: dict

class EventInput(BaseModel):
    raw: str

# ==================== AUTH ROUTES ====================

@api_router.get('/auth/setup-status')
async def setup_status():
    """Check if first-time setup is needed."""
    admin = await db.users.find_one({'role': 'system_admin'})
    return {'setup_required': admin is None}

@api_router.post('/auth/setup')
async def setup(data: SetupInput, response: Response):
    """First-time setup: creates system admin and returns auth key."""
    admin = await db.users.find_one({'role': 'system_admin'})
    if admin:
        raise HTTPException(status_code=400, detail='System already initialized. Setup is locked.')

    expected = os.environ.get('SETUP_SECRET', '')
    if not expected or data.setup_secret != expected:
        raise HTTPException(status_code=403, detail='Invalid setup secret')

    callsign = data.callsign.strip()
    if not callsign or len(callsign) < 2:
        raise HTTPException(status_code=400, detail='Callsign must be at least 2 characters')

    raw_key = generate_auth_key()
    doc = {
        'callsign': callsign,
        'auth_key_hash': hash_key(raw_key),
        'role': 'system_admin',
        'status': 'active',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': 'SYSTEM',
        'last_login': None,
    }
    result = await db.users.insert_one(doc)
    uid = str(result.inserted_id)

    at = create_access_token(uid, callsign, 'system_admin')
    rt = create_refresh_token(uid)
    set_auth_cookies(response, at, rt)

    # Write test credentials
    _write_credentials(callsign, raw_key, 'system_admin')

    logger.info(f'System admin created: {callsign}')
    return {
        'id': uid,
        'callsign': callsign,
        'role': 'system_admin',
        'auth_key': raw_key,
        'message': 'SAVE THIS KEY. It will not be shown again.',
        'token': at,
    }

@api_router.post('/auth/login')
async def login(data: LoginInput, request: Request, response: Response):
    callsign = data.callsign.strip()
    ident = f"{request.client.host}:{callsign}"

    attempts = await db.login_attempts.find_one({'identifier': ident})
    if attempts and attempts.get('count', 0) >= 5:
        lu = attempts.get('locked_until', '')
        if lu and datetime.now(timezone.utc).isoformat() < lu:
            raise HTTPException(status_code=429, detail='Too many attempts. Try again in 15 minutes.')

    user = await db.users.find_one({'callsign': callsign})
    if not user or not verify_key(data.auth_key, user.get('auth_key_hash', '')):
        await db.login_attempts.update_one(
            {'identifier': ident},
            {'$inc': {'count': 1}, '$set': {'locked_until': (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail='Invalid callsign or auth key')

    if user.get('status') != 'active':
        raise HTTPException(status_code=403, detail=f'Account {user.get("status", "inactive")}. Contact your system admin.')

    await db.login_attempts.delete_one({'identifier': ident})
    await db.users.update_one({'_id': user['_id']}, {'$set': {'last_login': datetime.now(timezone.utc).isoformat()}})

    uid = str(user['_id'])
    role = user.get('role', 'player')
    at = create_access_token(uid, callsign, role)
    rt = create_refresh_token(uid)
    set_auth_cookies(response, at, rt)
    return {'id': uid, 'callsign': callsign, 'role': role, 'token': at}

@api_router.post('/auth/logout')
async def logout(response: Response):
    response.delete_cookie('access_token', path='/')
    response.delete_cookie('refresh_token', path='/')
    return {'message': 'Logged out'}

@api_router.get('/auth/me')
async def get_me(request: Request):
    return await get_current_user(request)

@api_router.post('/auth/refresh')
async def refresh(request: Request, response: Response):
    token = request.cookies.get('refresh_token')
    if not token:
        raise HTTPException(status_code=401, detail='No refresh token')
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get('type') != 'refresh':
            raise HTTPException(status_code=401, detail='Invalid token type')
        user = await db.users.find_one({'_id': ObjectId(payload['sub'])})
        if not user:
            raise HTTPException(status_code=401, detail='User not found')
        if user.get('status') != 'active':
            raise HTTPException(status_code=403, detail='Account not active')
        uid = str(user['_id'])
        at = create_access_token(uid, user['callsign'], user.get('role', 'player'))
        set_auth_cookies(response, at, create_refresh_token(uid))
        return {'message': 'Refreshed', 'token': at}
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Refresh token expired')
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail='Invalid refresh token')

# ==================== ADMIN KEY MANAGEMENT ====================

@api_router.get('/admin/keys')
async def list_keys(request: Request):
    user = await get_current_user(request)
    if user.get('role') != 'system_admin':
        raise HTTPException(status_code=403, detail='System admin access required')
    users = await db.users.find({}, {'auth_key_hash': 0}).sort('created_at', -1).to_list(500)
    for u in users:
        u['_id'] = str(u['_id'])
    return users

@api_router.post('/admin/keys')
async def generate_key(data: GenerateKeyInput, request: Request, response: Response):
    user = await get_current_user(request)
    if user.get('role') != 'system_admin':
        raise HTTPException(status_code=403, detail='System admin access required')

    callsign = data.callsign.strip()
    if not callsign or len(callsign) < 2:
        raise HTTPException(status_code=400, detail='Callsign must be at least 2 characters')
    if data.role not in ('system_admin', 'server_admin', 'player'):
        raise HTTPException(status_code=400, detail='Invalid role')

    existing = await db.users.find_one({'callsign': callsign})
    if existing:
        raise HTTPException(status_code=400, detail=f'Callsign "{callsign}" already taken')

    raw_key = generate_auth_key()
    doc = {
        'callsign': callsign,
        'auth_key_hash': hash_key(raw_key),
        'role': data.role,
        'status': 'active',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'created_by': user.get('callsign', 'unknown'),
        'last_login': None,
    }
    result = await db.users.insert_one(doc)
    return {
        'id': str(result.inserted_id),
        'callsign': callsign,
        'role': data.role,
        'auth_key': raw_key,
        'message': 'Key generated. Share it securely — it cannot be recovered.',
    }

@api_router.post('/admin/keys/{user_id}/reissue')
async def reissue_key(user_id: str, request: Request):
    user = await get_current_user(request)
    if user.get('role') != 'system_admin':
        raise HTTPException(status_code=403, detail='System admin access required')

    target = await db.users.find_one({'_id': ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail='User not found')

    raw_key = generate_auth_key()
    await db.users.update_one(
        {'_id': ObjectId(user_id)},
        {'$set': {'auth_key_hash': hash_key(raw_key), 'status': 'active'}},
    )
    return {
        'callsign': target['callsign'],
        'auth_key': raw_key,
        'message': 'New key issued. Previous key is now invalid.',
    }

@api_router.post('/admin/keys/{user_id}/suspend')
async def suspend_key(user_id: str, request: Request):
    user = await get_current_user(request)
    if user.get('role') != 'system_admin':
        raise HTTPException(status_code=403, detail='System admin access required')
    if user_id == user.get('_id'):
        raise HTTPException(status_code=400, detail='Cannot suspend your own account')
    await db.users.update_one({'_id': ObjectId(user_id)}, {'$set': {'status': 'suspended'}})
    return {'message': 'Key suspended'}

@api_router.post('/admin/keys/{user_id}/activate')
async def activate_key(user_id: str, request: Request):
    user = await get_current_user(request)
    if user.get('role') != 'system_admin':
        raise HTTPException(status_code=403, detail='System admin access required')
    await db.users.update_one({'_id': ObjectId(user_id)}, {'$set': {'status': 'active'}})
    return {'message': 'Key activated'}

@api_router.post('/admin/keys/{user_id}/revoke')
async def revoke_key(user_id: str, request: Request):
    user = await get_current_user(request)
    if user.get('role') != 'system_admin':
        raise HTTPException(status_code=403, detail='System admin access required')
    if user_id == user.get('_id'):
        raise HTTPException(status_code=400, detail='Cannot revoke your own account')
    await db.users.update_one({'_id': ObjectId(user_id)}, {'$set': {'status': 'revoked'}})
    return {'message': 'Key permanently revoked'}

@api_router.delete('/admin/keys/{user_id}')
async def delete_key(user_id: str, request: Request):
    user = await get_current_user(request)
    if user.get('role') != 'system_admin':
        raise HTTPException(status_code=403, detail='System admin access required')
    if user_id == user.get('_id'):
        raise HTTPException(status_code=400, detail='Cannot delete your own account')
    await db.users.delete_one({'_id': ObjectId(user_id)})
    return {'message': 'User deleted'}

# ==================== SERVER ROUTES ====================

@api_router.get('/server/status')
async def server_status(request: Request):
    await get_current_user(request)
    details = await ptero.get_server_details()
    resources = await ptero.get_resources()
    return {'details': details, 'resources': resources, 'configured': ptero.configured}

@api_router.post('/server/power')
async def server_power(data: PowerAction, request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    if data.signal not in ('start', 'stop', 'restart', 'kill'):
        raise HTTPException(status_code=400, detail='Invalid power signal')
    return await ptero.send_power_action(data.signal)

@api_router.post('/server/command')
async def send_command(data: CommandInput, request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    result = await ptero.send_command(data.command)
    await db.command_log.insert_one({
        'command': data.command,
        'user_id': user.get('_id', ''),
        'user_name': user.get('name', ''),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'result': 'success' if result.get('success') else 'error',
    })
    return result

@api_router.get('/server/files')
async def list_files(request: Request, directory: str = '/'):
    await get_current_user(request)
    return await ptero.list_files(directory)

@api_router.get('/server/files/contents')
async def get_file(request: Request, file: str = ''):
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    return await ptero.get_file_contents(file)

@api_router.get('/server/backups')
async def list_backups(request: Request):
    await get_current_user(request)
    return await ptero.list_backups()

@api_router.post('/server/backups')
async def create_backup(request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')
    return await ptero.create_backup()

# ==================== EVENT ROUTES ====================

@api_router.get('/events')
async def get_events(request: Request, limit: int = 50, event_type: Optional[str] = None):
    await get_current_user(request)
    query = {}
    if event_type:
        query['type'] = event_type
    events = await db.events.find(query, {'_id': 0}).sort('timestamp', -1).limit(limit).to_list(limit)
    return events

@api_router.post('/events')
async def add_event(data: EventInput, request: Request):
    await get_current_user(request)
    parsed = parse_log_line(data.raw)
    if parsed:
        result = await db.events.insert_one(parsed)
        # Remove _id for JSON serialization
        parsed.pop('_id', None)
        # Broadcast to websocket clients
        await ws_manager.broadcast({'type': 'event', 'data': parsed})
        return parsed
    return {'message': 'Could not parse log line'}

@api_router.get('/events/stats')
async def event_stats(request: Request):
    await get_current_user(request)
    pipeline = [
        {'$group': {'_id': '$type', 'count': {'$sum': 1}}},
        {'$sort': {'count': -1}},
    ]
    stats = await db.events.aggregate(pipeline).to_list(100)
    return [{'type': s['_id'], 'count': s['count']} for s in stats]

# ==================== NARRATIVE ROUTES ====================

@api_router.post('/narrative/narrate')
async def narrate(data: NarrateInput, request: Request):
    await get_current_user(request)
    narration = await narrator.narrate_event(data.event)
    await db.narratives.insert_one({
        'event': data.event,
        'narration': narration,
        'type': 'narration',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })
    return {'narration': narration}

@api_router.post('/narrative/radio-report')
async def radio_report(request: Request):
    await get_current_user(request)
    events = await db.events.find({}, {'_id': 0}).sort('timestamp', -1).limit(20).to_list(20)
    report = await narrator.radio_report(events)
    await db.narratives.insert_one({
        'narration': report,
        'type': 'radio_report',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })
    return {'report': report}

@api_router.post('/narrative/ambient')
async def ambient(request: Request, time_of_day: str = 'dawn'):
    await get_current_user(request)
    resources = await ptero.get_resources()
    dispatch = await narrator.ambient_dispatch(time_of_day, {'resources': resources})
    await db.narratives.insert_one({
        'narration': dispatch,
        'type': 'ambient',
        'time_of_day': time_of_day,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })
    return {'dispatch': dispatch, 'time_of_day': time_of_day}

@api_router.get('/narrative/history')
async def narrative_history(request: Request, limit: int = 20):
    await get_current_user(request)
    narrs = await db.narratives.find({}, {'_id': 0}).sort('timestamp', -1).limit(limit).to_list(limit)
    return narrs

# ==================== WEBSOCKET ====================

class ConnectionManager:
    def __init__(self):
        self.active: list = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

ws_manager = ConnectionManager()

# Pterodactyl WebSocket consumer (uses ws_manager for broadcasting)
ptero_ws = PterodactylWSConsumer(db, ws_manager)

@app.websocket('/api/ws/feed')
async def ws_feed(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

# ==================== LIVE DATA ROUTES ====================

@api_router.get('/players')
async def get_players(request: Request):
    await get_current_user(request)
    players = []
    for name, joined in ptero_ws.online_players.items():
        players.append({'name': name, 'joined_at': joined})
    # Also get recent sessions from DB
    recent = await db.player_sessions.find(
        {}, {'_id': 0}
    ).sort('last_seen', -1).limit(50).to_list(50)
    return {
        'online': players,
        'online_count': len(players),
        'recent_sessions': recent,
    }

@api_router.get('/server/live-stats')
async def live_stats(request: Request):
    await get_current_user(request)
    return {
        'stats': ptero_ws.live_stats,
        'state': ptero_ws.server_state,
        'online_players': list(ptero_ws.online_players.keys()),
        'ws_connected': ptero_ws.running,
    }

@api_router.get('/server/console-log')
async def console_log(request: Request, limit: int = 100):
    await get_current_user(request)
    return ptero_ws.console_buffer[-limit:]

# ==================== STARTUP ====================

def _write_credentials(callsign, raw_key, role):
    os.makedirs('/app/memory', exist_ok=True)
    with open('/app/memory/test_credentials.md', 'w') as f:
        f.write('# Dead Signal Test Credentials\n\n')
        f.write(f'## System Admin\n- Callsign: {callsign}\n- Auth Key: {raw_key}\n- Role: {role}\n\n')
        f.write('## Auth Flow\n- GET /api/auth/setup-status — check if setup needed\n')
        f.write('- POST /api/auth/setup — first-time setup (callsign + setup_secret)\n')
        f.write('- POST /api/auth/login — login (callsign + auth_key)\n')
        f.write('- POST /api/auth/logout\n- GET /api/auth/me\n- POST /api/auth/refresh\n\n')
        f.write(f'## Setup Secret (env): {os.environ.get("SETUP_SECRET", "")}\n')

@app.on_event('startup')
async def startup():
    # Drop old email-based index if exists, create callsign index
    try:
        await db.users.drop_index('email_1')
    except Exception:
        pass
    await db.users.create_index('callsign', unique=True)
    await db.login_attempts.create_index('identifier')
    await db.events.create_index([('timestamp', -1)])
    await db.events.create_index('type')
    await db.narratives.create_index([('timestamp', -1)])
    await db.player_sessions.create_index('name')
    await db.player_sessions.create_index([('last_seen', -1)])

    # Check if setup is needed
    admin = await db.users.find_one({'role': 'system_admin'})
    if admin:
        logger.info(f'System admin exists: {admin.get("callsign")}')
        _write_credentials(admin.get('callsign', '?'), '[HIDDEN - already issued]', 'system_admin')
    else:
        logger.info('No system admin found — setup required at /api/auth/setup')
        os.makedirs('/app/memory', exist_ok=True)
        with open('/app/memory/test_credentials.md', 'w') as f:
            f.write('# Dead Signal Test Credentials\n\n')
            f.write('## SETUP REQUIRED\n')
            f.write(f'- Setup Secret: {os.environ.get("SETUP_SECRET", "")}\n')
            f.write('- POST /api/auth/setup with {callsign, setup_secret}\n')

    asyncio.create_task(ptero_ws.run())
    logger.info('Dead Signal backend online — Pterodactyl WS consumer started')

@app.on_event('shutdown')
async def shutdown():
    ptero_ws.stop()
    mongo_client.close()

app.include_router(api_router)
