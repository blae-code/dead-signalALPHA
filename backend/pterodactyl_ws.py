import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timezone

import httpx
import websockets

from event_parser import normalize_event, parse_log_line

logger = logging.getLogger(__name__)


# Scarcity modifiers by world condition
SEASON_SCARCITY = {
    'winter': {'food': 1.8, 'water': 1.5, 'medical': 1.3, 'materials': 1.1, 'clothing': 1.4},
    'summer': {'water': 1.4, 'food': 0.8, 'medical': 1.0, 'materials': 0.9},
    'autumn': {'food': 0.7, 'materials': 1.0, 'medical': 1.1},
    'spring': {'food': 0.9, 'water': 0.9, 'medical': 1.0},
}
WEATHER_SCARCITY = {
    'blizzard': {'food': 1.5, 'medical': 1.6, 'clothing': 1.5, 'materials': 1.3},
    'storm': {'medical': 1.4, 'electronics': 1.3, 'ammo': 1.2},
    'snow': {'food': 1.2, 'clothing': 1.3, 'vehicle_parts': 1.2},
    'rain': {'medical': 1.1, 'food': 1.1},
    'fog': {'ammo': 1.2, 'weapons': 1.1},
}
TIME_SCARCITY = {
    'night': {'ammo': 1.3, 'weapons': 1.2, 'medical': 1.2},
    'midnight': {'ammo': 1.4, 'weapons': 1.3, 'medical': 1.3},
    'dusk': {'ammo': 1.1, 'medical': 1.1},
}

SUPPLY_THRESHOLDS = [
    (1.5, 'critical'),
    (1.25, 'scarce'),
    (0.85, 'normal'),
    (0.0, 'surplus'),
]


class PterodactylWSConsumer:
    """Connects to Pterodactyl console WebSocket, parses events, broadcasts to clients."""

    def __init__(self, db, ws_manager, *, ptero_client=None, director=None):
        self.db = db
        self.ws_manager = ws_manager
        self.ptero = ptero_client
        self.director = director
        self.base_url = os.environ.get('PTERODACTYL_URL', '').rstrip('/')
        self.api_key = os.environ.get('PTERODACTYL_API_KEY', '')
        self.server_id = os.environ.get('PTERODACTYL_SERVER_ID', '')
        self.running = False
        self.live_stats = {}
        self.server_state = 'unknown'
        self.online_players = {}  # name -> join_time
        self.console_buffer = []
        self.max_buffer = 300
        self._last_world_state = {}
        self._world_broadcast_task = None

    @property
    def configured(self):
        return bool(self.base_url and self.api_key and self.server_id)

    async def get_current_world_state(self):
        if self._last_world_state:
            return dict(self._last_world_state)
        return await self._compute_world_state()

    async def get_ws_credentials(self):
        headers = {'Authorization': f'Bearer {self.api_key}', 'Accept': 'application/json'}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f'{self.base_url}/api/client/servers/{self.server_id}/websocket',
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()['data']

    async def _broadcast_world_payload(self, world: dict, *, previous_world=None):
        await self.ws_manager.broadcast({'type': 'world_update', 'data': world})
        scarcity = await self._update_scarcity(world)
        await self.ws_manager.broadcast({'type': 'scarcity_update', 'data': scarcity})
        if self.director:
            await self.director.maybe_issue_world_intel(previous_world or {}, world)
        self._last_world_state = dict(world)
        return scarcity

    async def process_console_line(self, line: str):
        line = line.strip()
        if not line:
            return

        entry = {'line': line, 'timestamp': datetime.now(timezone.utc).isoformat()}
        self.console_buffer.append(entry)
        if len(self.console_buffer) > self.max_buffer:
            self.console_buffer = self.console_buffer[-self.max_buffer:]

        await self.ws_manager.broadcast({'type': 'console', 'data': entry})

        parsed_event = parse_log_line(line)
        if not parsed_event or parsed_event['type'] == 'unknown':
            return

        now = datetime.now(timezone.utc).isoformat()
        if parsed_event['type'] == 'player_connect':
            for player in parsed_event.get('players', []):
                self.online_players[player] = now
                await self.db.player_sessions.update_one(
                    {'name': player, 'active': True},
                    {'$set': {'name': player, 'joined_at': now, 'active': True, 'last_seen': now}},
                    upsert=True,
                )
        elif parsed_event['type'] == 'player_disconnect':
            for player in parsed_event.get('players', []):
                self.online_players.pop(player, None)
                await self.db.player_sessions.update_one(
                    {'name': player, 'active': True},
                    {'$set': {'active': False, 'left_at': now}},
                )

        world_state = await self.get_current_world_state()
        event = normalize_event(
            parsed_event,
            world_state=world_state,
            online_players=self.online_players.keys(),
        )

        if event['type'] in ('weather_change', 'season_change', 'time_change', 'environment'):
            asyncio.create_task(self._force_world_broadcast())

        await self.db.events.insert_one(event)
        event.pop('_id', None)

        await self.ws_manager.broadcast({'type': 'event', 'data': event})

        if event['severity'] in ('critical', 'high'):
            asyncio.create_task(self._auto_narrate(event))

        if self.director:
            asyncio.create_task(self.director.maybe_issue_event_intel(event))

        asyncio.create_task(self._fire_triggers(event))

    async def _force_world_broadcast(self):
        """Immediately broadcast world state when an environment event is detected."""
        try:
            previous_world = dict(self._last_world_state)
            world = await self._compute_world_state()
            await self._broadcast_world_payload(world, previous_world=previous_world)
            logger.info('Forced world broadcast after environment event')
        except Exception as e:
            logger.error(f'Forced world broadcast error: {e}')

    async def _auto_narrate(self, event):
        try:
            from ai_narrator import AINarrator

            narrator = AINarrator()
            narration = await narrator.narrate_event(event)
            now = datetime.now(timezone.utc).isoformat()
            doc = {
                'event': event,
                'narration': narration,
                'type': 'auto_narration',
                'broadcast': False,
                'timestamp': now,
            }

            setting = await self.db.gm_settings.find_one({'key': 'narrative_auto_broadcast'})
            if setting and setting.get('value'):
                try:
                    ptero = self.ptero
                    if not ptero:
                        from pterodactyl import PterodactylClient
                        ptero = PterodactylClient()
                    msg = narration[:200] + '...' if len(narration) > 200 else narration
                    await ptero.send_command(f'say [DEAD SIGNAL] {msg}')
                    doc['broadcast'] = True
                    logger.info('Auto-broadcast narration in-game')
                except Exception as broadcast_error:
                    logger.error(f'Auto-broadcast failed: {broadcast_error}')

            await self.db.narratives.insert_one(doc)
            doc.pop('_id', None)
            await self.ws_manager.broadcast({'type': 'narration', 'data': doc})
        except Exception as e:
            logger.error(f'Auto-narration failed: {e}')

    def _render_template(self, template: str, event: dict, world_state: dict) -> str:
        if not template:
            return ''
        details = event.get('details', {})
        payload = {
            'player': ', '.join(event.get('players', ['Unknown'])),
            'players': ', '.join(event.get('players', ['Unknown'])),
            'event_type': event.get('type', 'unknown'),
            'event_summary': event.get('summary', event.get('raw', 'Unknown event')),
            'killer': details.get('killer', ''),
            'victim': details.get('victim', ''),
            'weather': world_state.get('weather', ''),
            'season': world_state.get('season', ''),
            'time_of_day': world_state.get('time_of_day', ''),
            'danger_level': world_state.get('danger_level', ''),
        }
        try:
            return template.format(**{key: str(value) for key, value in payload.items()})
        except Exception:
            return template

    async def _fire_triggers(self, event):
        """Execute GM event triggers matching this event type."""
        try:
            now = datetime.now(timezone.utc)
            triggers = await self.db.gm_triggers.find({
                'trigger_event': event['type'],
                'enabled': True,
            }).to_list(20)
            world_state = event.get('world') or await self.get_current_world_state()

            for trigger in triggers:
                last_fired = trigger.get('last_fired')
                cooldown = trigger.get('cooldown_seconds', 0)
                if last_fired and cooldown > 0:
                    last_dt = datetime.fromisoformat(last_fired)
                    if (now - last_dt).total_seconds() < cooldown:
                        continue

                params = trigger.get('params', {})
                result = None
                if trigger['action'] == 'broadcast':
                    message = self._render_template(params.get('message', ''), event, world_state)
                    if message:
                        ptero = self.ptero
                        if not ptero:
                            from pterodactyl import PterodactylClient
                            ptero = PterodactylClient()
                        await ptero.send_command(f'say {message[:240]}')
                        result = {'message': message[:240]}
                elif trigger['action'] == 'command':
                    command = self._render_template(params.get('command', ''), event, world_state)
                    if command:
                        ptero = self.ptero
                        if not ptero:
                            from pterodactyl import PterodactylClient
                            ptero = PterodactylClient()
                        await ptero.send_command(command)
                        result = {'command': command}
                elif self.director:
                    result = await self.director.execute_trigger_action(trigger['action'], params, event=event)

                await self.db.gm_triggers.update_one(
                    {'trigger_id': trigger['trigger_id']},
                    {'$set': {'last_fired': now.isoformat()}, '$inc': {'fire_count': 1}},
                )

                await self.db.gm_action_log.insert_one({
                    'action': 'trigger_fired',
                    'details': {
                        'trigger_name': trigger['name'],
                        'event_type': event['type'],
                        'players': event.get('players', []),
                        'trigger_action': trigger['action'],
                        'result': result,
                    },
                    'actor': 'TRIGGER',
                    'timestamp': now.isoformat(),
                })
        except Exception as e:
            logger.error(f'Trigger execution failed: {e}')

    async def process_stats(self, stats_json: str):
        try:
            stats = json.loads(stats_json)
            stats['state'] = self.server_state
            stats['online_players'] = list(self.online_players.keys())
            stats['online_count'] = len(self.online_players)
            self.live_stats = stats
            await self.ws_manager.broadcast({'type': 'stats', 'data': stats})
        except json.JSONDecodeError:
            pass

    async def _compute_world_state(self):
        """Compute current world state from server uptime and GM overrides."""
        from routes.world import WEATHER_TOOLTIPS, SEASON_TOOLTIPS, TIME_TOOLTIPS, calculate_world_time

        uptime_ms = self.live_stats.get('uptime', 0) if self.live_stats else 0

        overrides = await self.db.gm_settings.find_one({'key': 'world_overrides'}, {'_id': 0})
        override_values = overrides.get('value', {}) if overrides else {}

        offset = override_values.get('time_offset_hours', 0)
        world = calculate_world_time(uptime_ms, offset)

        if override_values.get('weather'):
            weather = override_values['weather']
        else:
            seed = int(hashlib.md5(f"{world['day']}-{int(world['hour'] / 3)}".encode()).hexdigest()[:8], 16)
            season_weights = {
                'spring': ['clear', 'cloudy', 'rain', 'cloudy', 'clear', 'rain', 'overcast', 'fog'],
                'summer': ['clear', 'clear', 'clear', 'cloudy', 'clear', 'storm', 'clear', 'clear'],
                'autumn': ['cloudy', 'overcast', 'rain', 'fog', 'cloudy', 'rain', 'overcast', 'clear'],
                'winter': ['snow', 'cloudy', 'blizzard', 'overcast', 'snow', 'clear', 'snow', 'fog'],
            }
            options = season_weights.get(world['season'], season_weights['spring'])
            weather = options[seed % len(options)]

        weather_temp_mod = {'clear': 2, 'cloudy': 0, 'overcast': -1, 'rain': -3, 'storm': -5, 'fog': -2, 'snow': -8, 'blizzard': -15}
        world['temperature'] += weather_temp_mod.get(weather, 0)
        world['weather'] = weather
        world['weather_tooltip'] = WEATHER_TOOLTIPS.get(weather, '')
        world['time_tooltip'] = TIME_TOOLTIPS.get(world['time_of_day'], '')
        world['season_tooltip'] = SEASON_TOOLTIPS.get(world['season'], '')
        world['custom_alert'] = override_values.get('custom_alert', '')

        danger_time = {'dawn': 2, 'morning': 1, 'noon': 1, 'afternoon': 2, 'dusk': 4, 'night': 5, 'midnight': 5}
        danger_weather = {'clear': 0, 'cloudy': 0, 'overcast': 1, 'rain': 1, 'storm': 3, 'fog': 4, 'snow': 2, 'blizzard': 5}
        danger_season = {'spring': 0, 'summer': 0, 'autumn': 1, 'winter': 2}
        world['danger_level'] = min(
            10,
            danger_time.get(world['time_of_day'], 0) + danger_weather.get(weather, 0) + danger_season.get(world['season'], 0),
        )

        return world

    async def _update_scarcity(self, world_state: dict):
        """Update resource scarcity in DB based on current world conditions."""
        from routes.economy import RESOURCES

        season = world_state.get('season', 'spring')
        weather = world_state.get('weather', 'clear')
        time_of_day = world_state.get('time_of_day', 'morning')

        season_mods = SEASON_SCARCITY.get(season, {})
        weather_mods = WEATHER_SCARCITY.get(weather, {})
        time_mods = TIME_SCARCITY.get(time_of_day, {})

        scarcity_updates = []
        for resource in RESOURCES:
            category = resource['category']
            multiplier = 1.0
            multiplier *= season_mods.get(category, 1.0)
            multiplier *= weather_mods.get(category, 1.0)
            multiplier *= time_mods.get(category, 1.0)

            current_value = round(resource['base_value'] * multiplier, 1)

            supply_level = 'normal'
            for threshold, level in SUPPLY_THRESHOLDS:
                if multiplier >= threshold:
                    supply_level = level
                    break

            trend = 'stable'
            if multiplier > 1.15:
                trend = 'rising'
            elif multiplier < 0.9:
                trend = 'falling'

            scarcity_updates.append({
                'name': resource['name'],
                'category': category,
                'base_value': resource['base_value'],
                'current_value': current_value,
                'multiplier': round(multiplier, 2),
                'supply_level': supply_level,
                'trend': trend,
            })

            await self.db.resource_scarcity.update_one(
                {'name': resource['name']},
                {'$set': {
                    'name': resource['name'],
                    'category': category,
                    'base_value': resource['base_value'],
                    'current_value': current_value,
                    'multiplier': round(multiplier, 2),
                    'supply_level': supply_level,
                    'trend': trend,
                    'updated_at': datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )

        return scarcity_updates

    async def _broadcast_world_loop(self):
        """Periodically compute and broadcast world state + scarcity updates."""
        while self.running:
            try:
                world = await self._compute_world_state()
                previous_world = dict(self._last_world_state)
                changed = (
                    world.get('time_of_day') != self._last_world_state.get('time_of_day') or
                    world.get('weather') != self._last_world_state.get('weather') or
                    world.get('season') != self._last_world_state.get('season') or
                    world.get('danger_level') != self._last_world_state.get('danger_level') or
                    world.get('custom_alert') != self._last_world_state.get('custom_alert') or
                    not self._last_world_state
                )

                if changed:
                    await self._broadcast_world_payload(world, previous_world=previous_world)
                    logger.info(
                        'World state broadcast: %s/%s/%s danger=%s',
                        world["time_of_day"],
                        world["weather"],
                        world["season"],
                        world["danger_level"],
                    )
                else:
                    await self.ws_manager.broadcast({'type': 'world_update', 'data': world})

            except Exception as e:
                logger.error(f'World broadcast error: {e}')

            await asyncio.sleep(15)

    async def run(self):
        if not self.configured:
            logger.warning('Pterodactyl WS not configured - skipping live console')
            self.running = True
            self._world_broadcast_task = asyncio.create_task(self._broadcast_world_loop())
            return

        self.running = True
        self._world_broadcast_task = asyncio.create_task(self._broadcast_world_loop())

        while self.running:
            try:
                creds = await self.get_ws_credentials()
                ws_url = creds['socket']
                token = creds['token']
                logger.info(f'Connecting to Pterodactyl WS: {ws_url[:60]}...')

                async with websockets.connect(
                    ws_url, origin=self.base_url, ping_interval=30, ping_timeout=10,
                ) as ws:
                    await ws.send(json.dumps({'event': 'auth', 'args': [token]}))
                    logger.info('Pterodactyl WS authenticated')

                    refresh_at = asyncio.get_event_loop().time() + 540
                    stats_throttle = 0

                    while self.running:
                        try:
                            if asyncio.get_event_loop().time() > refresh_at:
                                new_creds = await self.get_ws_credentials()
                                await ws.send(json.dumps({'event': 'auth', 'args': [new_creds['token']]}))
                                refresh_at = asyncio.get_event_loop().time() + 540
                                logger.info('Pterodactyl WS token refreshed')

                            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                            data = json.loads(msg)
                            event_type = data.get('event', '')
                            args = data.get('args', [])

                            if event_type == 'console output' and args:
                                await self.process_console_line(args[0])
                            elif event_type == 'stats' and args:
                                now = asyncio.get_event_loop().time()
                                if now - stats_throttle > 5:
                                    await self.process_stats(args[0])
                                    stats_throttle = now
                                else:
                                    try:
                                        self.live_stats = json.loads(args[0])
                                    except json.JSONDecodeError:
                                        pass
                            elif event_type == 'status' and args:
                                self.server_state = args[0]
                                await self.ws_manager.broadcast({'type': 'status', 'data': {'state': args[0]}})
                            elif event_type == 'auth success':
                                pass

                        except asyncio.TimeoutError:
                            continue
                        except websockets.exceptions.ConnectionClosed:
                            logger.warning('Pterodactyl WS disconnected')
                            break

            except Exception as e:
                logger.error(f'Pterodactyl WS error: {e}')

            if self.running:
                logger.info('Reconnecting Pterodactyl WS in 10s...')
                await asyncio.sleep(10)

    def stop(self):
        self.running = False
        if self._world_broadcast_task:
            self._world_broadcast_task.cancel()
