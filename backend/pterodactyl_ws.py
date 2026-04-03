import asyncio
import json
import logging
import os
import hashlib
import websockets
import httpx
from datetime import datetime, timezone
from event_parser import parse_log_line

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

    def __init__(self, db, ws_manager):
        self.db = db
        self.ws_manager = ws_manager
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

    async def get_ws_credentials(self):
        headers = {'Authorization': f'Bearer {self.api_key}', 'Accept': 'application/json'}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f'{self.base_url}/api/client/servers/{self.server_id}/websocket',
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()['data']

    async def process_console_line(self, line: str):
        line = line.strip()
        if not line:
            return

        # Buffer raw line
        entry = {'line': line, 'timestamp': datetime.now(timezone.utc).isoformat()}
        self.console_buffer.append(entry)
        if len(self.console_buffer) > self.max_buffer:
            self.console_buffer = self.console_buffer[-self.max_buffer:]

        # Broadcast raw console line
        await self.ws_manager.broadcast({'type': 'console', 'data': entry})

        # Parse
        event = parse_log_line(line)
        if not event or event['type'] == 'unknown':
            return

        # Track players
        now = datetime.now(timezone.utc).isoformat()
        if event['type'] == 'player_connect':
            for p in event.get('players', []):
                self.online_players[p] = now
                await self.db.player_sessions.update_one(
                    {'name': p, 'active': True},
                    {'$set': {'name': p, 'joined_at': now, 'active': True, 'last_seen': now}},
                    upsert=True,
                )
        elif event['type'] == 'player_disconnect':
            for p in event.get('players', []):
                self.online_players.pop(p, None)
                await self.db.player_sessions.update_one(
                    {'name': p, 'active': True},
                    {'$set': {'active': False, 'left_at': now}},
                )

        # Environment change detected — force immediate world state broadcast
        if event['type'] in ('weather_change', 'season_change', 'time_change', 'environment'):
            asyncio.create_task(self._force_world_broadcast())

        # Store event
        await self.db.events.insert_one(event)
        event.pop('_id', None)

        # Broadcast parsed event
        await self.ws_manager.broadcast({'type': 'event', 'data': event})

        # Auto-narrate high-severity events
        if event['severity'] in ('critical', 'high'):
            asyncio.create_task(self._auto_narrate(event))

        # Fire event triggers
        asyncio.create_task(self._fire_triggers(event))

    async def _force_world_broadcast(self):
        """Immediately broadcast world state when an environment event is detected."""
        try:
            world = await self._compute_world_state()
            await self.ws_manager.broadcast({'type': 'world_update', 'data': world})
            scarcity = await self._update_scarcity(world)
            await self.ws_manager.broadcast({'type': 'scarcity_update', 'data': scarcity})
            self._last_world_state = world
            logger.info(f'Forced world broadcast after environment event')
        except Exception as e:
            logger.error(f'Forced world broadcast error: {e}')


    async def _auto_narrate(self, event):
        try:
            from ai_narrator import AINarrator
            n = AINarrator()
            narration = await n.narrate_event(event)
            now = datetime.now(timezone.utc).isoformat()
            doc = {
                'event': event,
                'narration': narration,
                'type': 'auto_narration',
                'broadcast': False,
                'timestamp': now,
            }

            # Check if auto-broadcast is enabled
            setting = await self.db.gm_settings.find_one({'key': 'narrative_auto_broadcast'})
            if setting and setting.get('value'):
                # Send narration as in-game message via RCON
                try:
                    from pterodactyl import PterodactylClient
                    p = PterodactylClient()
                    # Truncate for RCON (keep under ~200 chars)
                    msg = narration[:200] + '...' if len(narration) > 200 else narration
                    await p.send_command(f'say [DEAD SIGNAL] {msg}')
                    doc['broadcast'] = True
                    logger.info(f'Auto-broadcast narration in-game')
                except Exception as be:
                    logger.error(f'Auto-broadcast failed: {be}')

            await self.db.narratives.insert_one(doc)
            doc.pop('_id', None)
            await self.ws_manager.broadcast({'type': 'narration', 'data': doc})
        except Exception as e:
            logger.error(f'Auto-narration failed: {e}')

    async def _fire_triggers(self, event):
        """Execute GM event triggers matching this event type."""
        try:
            now = datetime.now(timezone.utc)
            triggers = await self.db.gm_triggers.find({
                'trigger_event': event['type'],
                'enabled': True,
            }).to_list(20)

            for trigger in triggers:
                # Check cooldown
                last_fired = trigger.get('last_fired')
                cooldown = trigger.get('cooldown_seconds', 0)
                if last_fired and cooldown > 0:
                    last_dt = datetime.fromisoformat(last_fired)
                    if (now - last_dt).total_seconds() < cooldown:
                        continue

                # Execute trigger action
                params = trigger.get('params', {})
                if trigger['action'] == 'broadcast':
                    msg = params.get('message', '').replace('{player}', ', '.join(event.get('players', ['Unknown'])))
                    if msg:
                        from pterodactyl import PterodactylClient
                        p = PterodactylClient()
                        await p.send_command(f'say {msg}')
                elif trigger['action'] == 'command':
                    cmd = params.get('command', '').replace('{player}', ', '.join(event.get('players', ['Unknown'])))
                    if cmd:
                        from pterodactyl import PterodactylClient
                        p = PterodactylClient()
                        await p.send_command(cmd)

                # Update trigger stats
                await self.db.gm_triggers.update_one(
                    {'trigger_id': trigger['trigger_id']},
                    {'$set': {'last_fired': now.isoformat()}, '$inc': {'fire_count': 1}}
                )

                # Log
                await self.db.gm_action_log.insert_one({
                    'action': 'trigger_fired',
                    'details': {'trigger_name': trigger['name'], 'event_type': event['type'], 'players': event.get('players', [])},
                    'actor': 'TRIGGER',
                    'timestamp': now.isoformat(),
                })
        except Exception as e:
            logger.error(f'Trigger execution failed: {e}')

    async def process_stats(self, stats_json: str):
        try:
            stats = json.loads(stats_json)
            stats['state'] = self.server_state  # Include current state with stats
            self.live_stats = stats
            await self.ws_manager.broadcast({'type': 'stats', 'data': stats})
        except json.JSONDecodeError:
            pass

    async def _compute_world_state(self):
        """Compute current world state from server uptime and GM overrides."""
        from routes.world import calculate_world_time, WEATHER_TOOLTIPS, TIME_TOOLTIPS, SEASON_TOOLTIPS

        uptime_ms = self.live_stats.get('uptime', 0) if self.live_stats else 0

        overrides = await self.db.gm_settings.find_one({'key': 'world_overrides'}, {'_id': 0})
        ovr = overrides.get('value', {}) if overrides else {}

        offset = ovr.get('time_offset_hours', 0)
        world = calculate_world_time(uptime_ms, offset)

        # Weather
        if ovr.get('weather'):
            weather = ovr['weather']
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
        world['custom_alert'] = ovr.get('custom_alert', '')

        danger_time = {'dawn': 2, 'morning': 1, 'noon': 1, 'afternoon': 2, 'dusk': 4, 'night': 5, 'midnight': 5}
        danger_weather = {'clear': 0, 'cloudy': 0, 'overcast': 1, 'rain': 1, 'storm': 3, 'fog': 4, 'snow': 2, 'blizzard': 5}
        danger_season = {'spring': 0, 'summer': 0, 'autumn': 1, 'winter': 2}
        world['danger_level'] = min(10, danger_time.get(world['time_of_day'], 0) + danger_weather.get(weather, 0) + danger_season.get(world['season'], 0))

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
        for res in RESOURCES:
            cat = res['category']
            multiplier = 1.0
            multiplier *= season_mods.get(cat, 1.0)
            multiplier *= weather_mods.get(cat, 1.0)
            multiplier *= time_mods.get(cat, 1.0)

            current_value = round(res['base_value'] * multiplier, 1)

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
                'name': res['name'],
                'category': cat,
                'base_value': res['base_value'],
                'current_value': current_value,
                'multiplier': round(multiplier, 2),
                'supply_level': supply_level,
                'trend': trend,
            })

            await self.db.resource_scarcity.update_one(
                {'name': res['name']},
                {'$set': {
                    'name': res['name'],
                    'category': cat,
                    'base_value': res['base_value'],
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

                # Check if world state actually changed
                changed = (
                    world.get('time_of_day') != self._last_world_state.get('time_of_day') or
                    world.get('weather') != self._last_world_state.get('weather') or
                    world.get('season') != self._last_world_state.get('season') or
                    world.get('danger_level') != self._last_world_state.get('danger_level') or
                    world.get('custom_alert') != self._last_world_state.get('custom_alert') or
                    not self._last_world_state  # first broadcast
                )

                # Always broadcast world state (hour changes continuously)
                await self.ws_manager.broadcast({'type': 'world_update', 'data': world})

                # Only recalculate scarcity when conditions meaningfully change
                if changed:
                    scarcity = await self._update_scarcity(world)
                    await self.ws_manager.broadcast({'type': 'scarcity_update', 'data': scarcity})
                    self._last_world_state = world
                    logger.info(f'World state broadcast: {world["time_of_day"]}/{world["weather"]}/{world["season"]} danger={world["danger_level"]}')

            except Exception as e:
                logger.error(f'World broadcast error: {e}')

            await asyncio.sleep(15)

    async def run(self):
        if not self.configured:
            logger.warning('Pterodactyl WS not configured — skipping live console')
            # Still run world broadcast loop even without Pterodactyl
            self.running = True
            self._world_broadcast_task = asyncio.create_task(self._broadcast_world_loop())
            return

        self.running = True
        # Start world state broadcast loop
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

                    refresh_at = asyncio.get_event_loop().time() + 540  # 9 min
                    stats_throttle = 0

                    while self.running:
                        try:
                            # Token refresh
                            if asyncio.get_event_loop().time() > refresh_at:
                                new_creds = await self.get_ws_credentials()
                                await ws.send(json.dumps({'event': 'auth', 'args': [new_creds['token']]}))
                                refresh_at = asyncio.get_event_loop().time() + 540
                                logger.info('Pterodactyl WS token refreshed')

                            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                            data = json.loads(msg)
                            ev = data.get('event', '')
                            args = data.get('args', [])

                            if ev == 'console output' and args:
                                await self.process_console_line(args[0])
                            elif ev == 'stats' and args:
                                # Throttle stats to every 5 seconds
                                now = asyncio.get_event_loop().time()
                                if now - stats_throttle > 5:
                                    await self.process_stats(args[0])
                                    stats_throttle = now
                                else:
                                    self.live_stats = json.loads(args[0])
                            elif ev == 'status' and args:
                                self.server_state = args[0]
                                await self.ws_manager.broadcast({'type': 'status', 'data': {'state': args[0]}})
                            elif ev == 'auth success':
                                pass  # Already logged

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
