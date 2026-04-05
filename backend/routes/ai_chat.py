"""
AI Chat — Conversational command center for Dead Signal.
GM mode: full RCON access, player management, data queries, mission/NPC generation.
Player mode: read-only intel, loot advice, trade analysis, world questions.
"""
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["ai-chat"])

db = None
get_current_user = None
ptero = None
ptero_ws = None
director = None
narrator = None

# ─── RCON commands the AI is allowed to generate ───
SAFE_RCON_PREFIXES = ['say ', 'broadcast ', 'servermsg ']
DESTRUCTIVE_RCON_PREFIXES = ['kick ', 'ban ', 'unban ', 'whitelist ']
POWER_ACTIONS = {'start', 'stop', 'restart', 'kill'}

GM_SYSTEM = """You are SIGINT, the AI command intelligence officer for "Dead Signal" — a military-grade companion terminal monitoring a HumanitZ zombie survival server.

You speak in a clipped, professional military radio style. You are the GM's right hand.

## YOUR CAPABILITIES
You have access to live server telemetry injected into each message. Use it to answer questions accurately.

When the GM wants you to execute a server action, respond with a special command block:
- To broadcast in-game: ```[RCON:say [DEAD SIGNAL] Your message here]```
- To kick a player: ```[RCON:kick PlayerName]```
- To ban a player: ```[RCON:ban PlayerName]```
- To run any RCON command: ```[RCON:the_command_here]```
- To change server power state: ```[POWER:restart]``` or ```[POWER:stop]``` or ```[POWER:start]```

RULES FOR COMMANDS:
- ALWAYS ask for confirmation before kick, ban, restart, stop, or kill commands. Present the command you WILL execute and ask "Confirm? (yes/no)"
- For safe commands (say, broadcast), execute immediately — include the [RCON:...] block in your response.
- NEVER fabricate data. If you don't know something, say so.
- Keep responses concise and tactical. 2-4 sentences max unless asked for detail.
- Reference the injected telemetry data to give accurate answers.
- When creating missions or NPCs via natural language, output a structured JSON block wrapped in ```json ... ``` that the system will parse.
- You can suggest RCON commands you think would help, but always explain what they do.

## FORMATTING
- Use plain text, no markdown headers or bold. Short paragraphs.
- For lists, use simple dashes.
- Reference players by their steam name or callsign when known.
- When quoting numbers, be precise — pull from the telemetry.
"""

PLAYER_SYSTEM = """You are SIGINT, the AI intelligence officer for "Dead Signal" — a companion terminal for a HumanitZ zombie survival server.

You help players survive by answering questions about the game world, current conditions, loot locations, faction politics, and trade strategy.

## YOUR CAPABILITIES
You receive live server telemetry with each message. Use it to give accurate, actionable survival advice.

RULES:
- You CANNOT execute server commands. You are read-only for players.
- Give concise, tactical advice. 2-4 sentences.
- Reference current weather, danger level, and scarcity when relevant.
- If asked about loot, reference the loot intel data provided.
- If asked about factions, reference the faction data provided.
- Stay in-world. You are a radio intelligence officer, not a chatbot.
- No markdown headers or bold formatting. Plain text, short paragraphs.
"""


class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None
    confirm_action: Optional[str] = None  # For confirming pending destructive commands


class PendingAction(BaseModel):
    action_type: str  # 'rcon' or 'power'
    command: str
    description: str


# In-memory session store for pending confirmations
_pending_confirmations: dict[str, dict] = {}


async def _gather_context(user: dict) -> str:
    """Build rich telemetry context string for the AI."""
    parts = []
    is_admin = user.get('role') in ('system_admin', 'server_admin')

    # 1. Server state
    stats = ptero_ws.live_stats if ptero_ws else {}
    state = ptero_ws.server_state if ptero_ws else 'unknown'
    parts.append(f"[SERVER] State: {state}")
    if stats:
        mem = stats.get('memory_bytes', 0)
        mem_limit = stats.get('memory_limit_bytes', 1)
        cpu = stats.get('cpu_absolute', 0)
        disk = stats.get('disk_bytes', 0)
        parts.append(f"[SERVER] CPU: {cpu:.1f}% | RAM: {mem / 1024 / 1024:.0f}MB / {mem_limit / 1024 / 1024:.0f}MB | Disk: {disk / 1024 / 1024:.0f}MB")

    # 2. Online players
    online = list(ptero_ws.online_players.keys()) if ptero_ws else []
    identities = ptero_ws.online_identities if ptero_ws else {}
    if online:
        player_lines = []
        for name in online:
            identity = identities.get(name, {})
            steam_name = identity.get('steam_name', name)
            level = identity.get('level', '?')
            clan = identity.get('clan', '')
            joined = ptero_ws.online_players.get(name, '')
            line = f"  - {steam_name} (Lv:{level})"
            if clan:
                line += f" [{clan}]"
            if joined:
                line += f" | joined: {joined[:16]}"
            player_lines.append(line)
        parts.append(f"[ONLINE PLAYERS] ({len(online)})\n" + "\n".join(player_lines))
    else:
        parts.append("[ONLINE PLAYERS] None currently online")

    # 3. World state
    world = await ptero_ws.get_current_world_state() if ptero_ws else {}
    if world:
        parts.append(
            f"[WORLD] Season: {world.get('season', '?')} | Weather: {world.get('weather', '?')} | "
            f"Time: {world.get('time_of_day', '?')} (Hour {world.get('hour', '?'):.0f}) | "
            f"Temp: {world.get('temperature', '?')}°C | Danger: {world.get('danger_level', '?')}/10 | "
            f"Day: {world.get('day', '?')}"
        )
        if world.get('custom_alert'):
            parts.append(f"[ALERT] {world['custom_alert']}")

    # 4. Recent events (last 15)
    recent_events = await db.events.find(
        {}, {'_id': 0, 'type': 1, 'summary': 1, 'players': 1, 'severity': 1, 'timestamp': 1}
    ).sort('timestamp', -1).limit(15).to_list(15)
    if recent_events:
        ev_lines = []
        for ev in recent_events:
            ts = ev.get('timestamp', '')[:16]
            ev_lines.append(f"  [{ts}] {ev.get('severity', '').upper()} {ev.get('type', '')} — {ev.get('summary', '')}")
        parts.append("[RECENT EVENTS]\n" + "\n".join(ev_lines))

    # 5. Factions
    factions = await db.factions.find({}, {'_id': 0, 'name': 1, 'tag': 1, 'members': 1, 'territories': 1}).to_list(20)
    if factions:
        f_lines = [f"  - [{f.get('tag', '?')}] {f['name']} — {len(f.get('members', []))} members, {len(f.get('territories', []))} territories" for f in factions]
        parts.append("[FACTIONS]\n" + "\n".join(f_lines))

    # 6. Economy / Scarcity
    scarcity = await db.resource_scarcity.find(
        {'supply_level': {'$in': ['critical', 'scarce']}},
        {'_id': 0, 'name': 1, 'supply_level': 1, 'multiplier': 1}
    ).to_list(20)
    if scarcity:
        s_lines = [f"  - {s['name']}: {s['supply_level']} (x{s['multiplier']})" for s in scarcity]
        parts.append("[SCARCE RESOURCES]\n" + "\n".join(s_lines))

    # 7. Active missions
    missions = await db.missions.find(
        {'status': 'active'}, {'_id': 0, 'title': 1, 'mission_type': 1, 'assigned_faction': 1, 'assigned_players': 1}
    ).to_list(10)
    if missions:
        m_lines = [f"  - {m['title']} ({m.get('mission_type', '?')}) — assigned to: {m.get('assigned_faction', '') or ', '.join(m.get('assigned_players', [])) or 'anyone'}" for m in missions]
        parts.append("[ACTIVE MISSIONS]\n" + "\n".join(m_lines))

    # 8. Active NPCs (admin only — players shouldn't see all NPC locations)
    if is_admin:
        npcs = await db.npcs.find(
            {'status': 'active'}, {'_id': 0, 'name': 1, 'role': 1, 'faction': 1, 'location_name': 1}
        ).to_list(20)
        if npcs:
            n_lines = [f"  - {n['name']} ({n.get('role', '?')}) — {n.get('faction', '?')} @ {n.get('location_name', 'unknown')}" for n in npcs]
            parts.append("[ACTIVE NPCS]\n" + "\n".join(n_lines))

        # 9. Console buffer (last 10 lines, admin only)
        if ptero_ws and ptero_ws.console_buffer:
            recent_console = ptero_ws.console_buffer[-10:]
            c_lines = [f"  {c.get('line', '')}" for c in recent_console]
            parts.append("[RECENT CONSOLE]\n" + "\n".join(c_lines))

    # 10. Loot intel (for players)
    if not is_admin:
        # Get top loot locations
        loot_locations = await db.loot_locations.find(
            {}, {'_id': 0, 'name': 1, 'grid_ref': 1, 'loot_tier': 1, 'danger_level': 1, 'notable_items': 1}
        ).to_list(10)
        if loot_locations:
            l_lines = [f"  - {loc['name']} ({loc.get('grid_ref', '?')}) — tier: {loc.get('loot_tier', '?')}, danger: {loc.get('danger_level', '?')}, items: {', '.join((loc.get('notable_items') or [])[:3])}" for loc in loot_locations]
            parts.append("[KNOWN LOOT LOCATIONS]\n" + "\n".join(l_lines))

    parts.append(f"[YOUR CALLSIGN] {user.get('callsign', 'Unknown')}")
    parts.append(f"[YOUR ROLE] {user.get('role', 'player')}")
    parts.append(f"[TIMESTAMP] {datetime.now(timezone.utc).isoformat()[:19]}Z")

    return "\n\n".join(parts)


def _extract_commands(text: str) -> tuple[str, list[dict]]:
    """Parse [RCON:...] and [POWER:...] blocks from AI response."""
    commands = []
    clean_text = text

    # Extract RCON commands
    for match in re.finditer(r'\[RCON:(.+?)\]', text):
        cmd = match.group(1).strip()
        commands.append({'type': 'rcon', 'command': cmd})
        clean_text = clean_text.replace(match.group(0), '')

    # Extract POWER commands
    for match in re.finditer(r'\[POWER:(.+?)\]', text):
        action = match.group(1).strip().lower()
        if action in POWER_ACTIONS:
            commands.append({'type': 'power', 'command': action})
        clean_text = clean_text.replace(match.group(0), '')

    # Clean up any triple-backtick wrappings around the commands
    clean_text = re.sub(r'```\s*```', '', clean_text).strip()

    return clean_text, commands


def _is_destructive(cmd: dict) -> bool:
    """Check if a command requires confirmation."""
    if cmd['type'] == 'power' and cmd['command'] in ('stop', 'restart', 'kill'):
        return True
    if cmd['type'] == 'rcon':
        lower = cmd['command'].lower()
        if any(lower.startswith(p) for p in DESTRUCTIVE_RCON_PREFIXES):
            return True
    return False


async def _execute_command(cmd: dict, actor: str) -> dict:
    """Execute a confirmed command and return result."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        if cmd['type'] == 'power':
            result = await ptero.send_power_action(cmd['command'])
            await db.gm_action_log.insert_one({
                'action': f"ai_power_{cmd['command']}",
                'details': {'command': cmd['command'], 'result': str(result)[:200]},
                'actor': f"SIGINT (via {actor})",
                'timestamp': now,
            })
            return {'success': True, 'message': f"Power action '{cmd['command']}' sent.", 'result': result}
        elif cmd['type'] == 'rcon':
            result = await ptero.send_command(cmd['command'])
            await db.gm_action_log.insert_one({
                'action': 'ai_rcon_command',
                'details': {'command': cmd['command'], 'result': str(result)[:200]},
                'actor': f"SIGINT (via {actor})",
                'timestamp': now,
            })
            return {'success': True, 'message': f"RCON executed: `{cmd['command']}`", 'result': result}
    except Exception as e:
        logger.error(f"Command execution failed: {e}")
        return {'success': False, 'message': f"Execution failed: {str(e)[:100]}"}
    return {'success': False, 'message': 'Unknown command type'}


@router.post('/chat')
async def chat(data: ChatMessage, request: Request):
    user = await get_current_user(request)
    is_admin = user.get('role') in ('system_admin', 'server_admin')
    callsign = user.get('callsign', 'Unknown')
    session_id = data.session_id or str(uuid.uuid4())

    api_key = os.environ.get('EMERGENT_LLM_KEY', '')
    if not api_key:
        raise HTTPException(status_code=503, detail='AI service not configured')

    # Handle pending confirmation
    if data.confirm_action and session_id in _pending_confirmations:
        pending = _pending_confirmations.pop(session_id)
        if data.message.strip().lower() in ('yes', 'y', 'confirm', 'affirmative', 'do it', 'execute'):
            result = await _execute_command(pending, callsign)
            return {
                'session_id': session_id,
                'response': f"Executed. {result['message']}",
                'role': 'gm' if is_admin else 'player',
                'actions_taken': [result],
                'pending_confirmation': None,
            }
        else:
            return {
                'session_id': session_id,
                'response': "Command cancelled. Standing by.",
                'role': 'gm' if is_admin else 'player',
                'actions_taken': [],
                'pending_confirmation': None,
            }

    # Build context
    context = await _gather_context(user)
    system_prompt = GM_SYSTEM if is_admin else PLAYER_SYSTEM
    full_system = f"{system_prompt}\n\n## LIVE TELEMETRY\n{context}"

    # Send to Gemini
    try:
        chat_instance = LlmChat(
            api_key=api_key,
            session_id=f"sigint-{session_id}",
            system_message=full_system,
        ).with_model("gemini", "gemini-2.5-flash")

        raw_response = await chat_instance.send_message(UserMessage(text=data.message))
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(status_code=502, detail='AI service temporarily unavailable')

    # Parse commands from response
    clean_response, commands = _extract_commands(raw_response)

    # For players, strip any commands that somehow got through
    if not is_admin:
        commands = []

    actions_taken = []
    pending = None

    for cmd in commands:
        if _is_destructive(cmd):
            # Store pending confirmation
            _pending_confirmations[session_id] = cmd
            pending = {
                'type': cmd['type'],
                'command': cmd['command'],
                'description': f"{'Power: ' if cmd['type'] == 'power' else 'RCON: '}{cmd['command']}",
            }
            break  # Only one pending at a time
        else:
            # Execute safe commands immediately
            result = await _execute_command(cmd, callsign)
            actions_taken.append(result)

    # Log the conversation
    await db.ai_chat_history.insert_one({
        'session_id': session_id,
        'callsign': callsign,
        'role': 'gm' if is_admin else 'player',
        'user_message': data.message,
        'ai_response': clean_response,
        'commands_parsed': [{'type': c['type'], 'command': c['command']} for c in commands],
        'actions_taken': actions_taken,
        'pending_confirmation': pending,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })

    return {
        'session_id': session_id,
        'response': clean_response,
        'role': 'gm' if is_admin else 'player',
        'actions_taken': actions_taken,
        'pending_confirmation': pending,
    }


@router.get('/history')
async def chat_history(request: Request, session_id: Optional[str] = None, limit: int = 50):
    user = await get_current_user(request)
    query = {'callsign': user.get('callsign', '')}
    if session_id:
        query['session_id'] = session_id
    messages = await db.ai_chat_history.find(
        query, {'_id': 0}
    ).sort('timestamp', -1).limit(min(limit, 100)).to_list(min(limit, 100))
    messages.reverse()
    return messages


@router.get('/sessions')
async def chat_sessions(request: Request, limit: int = 20):
    user = await get_current_user(request)
    pipeline = [
        {'$match': {'callsign': user.get('callsign', '')}},
        {'$sort': {'timestamp': -1}},
        {'$group': {
            '_id': '$session_id',
            'last_message': {'$first': '$user_message'},
            'last_timestamp': {'$first': '$timestamp'},
            'message_count': {'$sum': 1},
        }},
        {'$sort': {'last_timestamp': -1}},
        {'$limit': min(limit, 50)},
    ]
    sessions = await db.ai_chat_history.aggregate(pipeline).to_list(50)
    return [
        {
            'session_id': s['_id'],
            'last_message': s['last_message'][:80],
            'last_timestamp': s['last_timestamp'],
            'message_count': s['message_count'],
        }
        for s in sessions
    ]


import os


def init_ai_chat_routes(database, auth_fn, ptero_client, ptero_ws_consumer, director_instance, narrator_instance):
    global db, get_current_user, ptero, ptero_ws, director, narrator
    db = database
    get_current_user = auth_fn
    ptero = ptero_client
    ptero_ws = ptero_ws_consumer
    director = director_instance
    narrator = narrator_instance
    return router
