import asyncio
import json
import logging
import os
import websockets
import httpx
from datetime import datetime, timezone
from event_parser import parse_log_line

logger = logging.getLogger(__name__)


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

    async def _auto_narrate(self, event):
        try:
            from ai_narrator import AINarrator
            n = AINarrator()
            narration = await n.narrate_event(event)
            doc = {
                'event': event,
                'narration': narration,
                'type': 'auto_narration',
                'timestamp': datetime.now(timezone.utc).isoformat(),
            }
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

    async def run(self):
        if not self.configured:
            logger.warning('Pterodactyl WS not configured — skipping live console')
            return

        self.running = True
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
