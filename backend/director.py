import hashlib
import inspect
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from bson import ObjectId

logger = logging.getLogger(__name__)

INTEL_PRIORITIES = {'routine', 'priority', 'critical'}
INTEL_CATEGORIES = {'combat', 'survival', 'social', 'environment', 'operations'}
SUPPLY_PRIORITIES = {'low', 'normal', 'urgent'}
PRIORITY_ORDER = {'critical': 0, 'priority': 1, 'routine': 2}
SUPPLY_PRIORITY_ORDER = {'urgent': 0, 'normal': 1, 'low': 2}


class DeadSignalDirector:
    def __init__(
        self,
        db,
        ws_manager,
        *,
        ptero_client=None,
        narrator=None,
        world_state_getter: Optional[Callable[[], Any]] = None,
        online_players_getter: Optional[Callable[[], Any]] = None,
    ):
        self.db = db
        self.ws_manager = ws_manager
        self.ptero = ptero_client
        self.narrator = narrator
        self.world_state_getter = world_state_getter
        self.online_players_getter = online_players_getter

    async def _resolve(self, value, default):
        if value is None:
            return default
        if callable(value):
            value = value()
        if inspect.isawaitable(value):
            value = await value
        return default if value is None else value

    async def get_world_state(self) -> dict:
        world = await self._resolve(self.world_state_getter, {})
        return world if isinstance(world, dict) else {}

    async def get_online_players(self) -> list[str]:
        players = await self._resolve(self.online_players_getter, [])
        if isinstance(players, dict):
            players = players.keys()
        return [str(player).strip() for player in players if str(player).strip()]

    async def build_world_context(self) -> dict:
        world_state = await self.get_world_state()
        online_players = await self.get_online_players()
        now = datetime.now(timezone.utc).isoformat()

        hot_events = await self.db.events.find(
            {'director_priority': {'$in': ['priority', 'critical']}},
            {
                '_id': 0,
                'event_id': 1,
                'type': 1,
                'severity': 1,
                'category': 1,
                'summary': 1,
                'timestamp': 1,
                'players': 1,
                'tags': 1,
                'director_priority': 1,
            },
        ).sort('timestamp', -1).limit(8).to_list(8)

        scarcity = await self.db.resource_scarcity.find(
            {'supply_level': {'$in': ['critical', 'scarce']}},
            {'_id': 0, 'name': 1, 'category': 1, 'current_value': 1, 'multiplier': 1, 'supply_level': 1, 'trend': 1},
        ).sort('multiplier', -1).limit(6).to_list(6)

        active_missions = await self.db.missions.find(
            {'status': 'active'},
            {
                '_id': 0,
                'mission_id': 1,
                'title': 1,
                'summary': 1,
                'difficulty': 1,
                'assigned_players': 1,
                'assigned_faction': 1,
                'updated_at': 1,
            },
        ).sort('updated_at', -1).limit(6).to_list(6)

        supply_requests = await self.db.supply_requests.find(
            {'status': 'open'},
            {'_id': 0, 'request_id': 1, 'requester_callsign': 1, 'priority': 1, 'items': 1, 'notes': 1, 'created_at': 1},
        ).limit(25).to_list(25)
        supply_requests = sorted(
            supply_requests,
            key=lambda request: (
                SUPPLY_PRIORITY_ORDER.get(request.get('priority', 'normal'), 99),
                request.get('created_at', ''),
            ),
        )[:6]

        npcs = await self.db.npcs.find(
            {'status': 'active'},
            {'_id': 0, 'npc_id': 1, 'name': 1, 'role': 1, 'faction': 1, 'location_name': 1, 'spawn_type': 1},
        ).sort('updated_at', -1).limit(6).to_list(6)

        factions = await self.db.factions.find(
            {'status': 'active'},
            {'_id': 0, 'faction_id': 1, 'name': 1, 'tag': 1, 'member_count': 1, 'territory_count': 1},
        ).sort('member_count', -1).limit(6).to_list(6)

        active_intel = await self.db.intel_feed.find(
            {
                'status': 'active',
                '$or': [{'expires_at': None}, {'expires_at': {'$gt': now}}],
            },
            {
                '_id': 0,
                'intel_id': 1,
                'title': 1,
                'priority': 1,
                'category': 1,
                'created_at': 1,
                'tags': 1,
            },
        ).limit(20).to_list(20)
        active_intel = sorted(
            active_intel,
            key=lambda intel: (
                PRIORITY_ORDER.get(intel.get('priority', 'routine'), 99),
                intel.get('created_at', ''),
            ),
        )[:6]

        return {
            'generated_at': now,
            'world_state': world_state,
            'online_players': {
                'count': len(online_players),
                'names': online_players[:20],
            },
            'hot_events': hot_events,
            'scarcity_hotspots': scarcity,
            'active_missions': active_missions,
            'urgent_supply_requests': supply_requests,
            'active_npcs': npcs,
            'factions': factions,
            'active_intel': active_intel,
        }

    def _format_players(self, event: Optional[dict]) -> str:
        if not event:
            return 'Unknown'
        players = event.get('players') or []
        return ', '.join(players) if players else 'Unknown'

    def _format_value(self, value: Any, event: Optional[dict], world_state: dict) -> str:
        if value is None:
            return ''
        if not isinstance(value, str):
            return str(value)

        details = (event or {}).get('details', {})
        payload = {
            'player': self._format_players(event),
            'players': self._format_players(event),
            'event_type': (event or {}).get('type', 'unknown'),
            'event_summary': (event or {}).get('summary', (event or {}).get('raw', 'Unknown event')),
            'killer': details.get('killer', ''),
            'victim': details.get('victim', ''),
            'weather': world_state.get('weather', ''),
            'season': world_state.get('season', ''),
            'time_of_day': world_state.get('time_of_day', ''),
            'danger_level': world_state.get('danger_level', ''),
        }
        safe_payload = {key: str(val) for key, val in payload.items()}
        try:
            return value.format(**safe_payload)
        except Exception:
            return value

    async def create_intel_entry(
        self,
        *,
        title: str,
        body: str,
        category: str = 'operations',
        priority: str = 'priority',
        source: str = 'director',
        tags: Optional[list[str]] = None,
        action_items: Optional[list[str]] = None,
        event: Optional[dict] = None,
        dedupe_key: Optional[str] = None,
        expires_in_minutes: int = 90,
        world_context: Optional[dict] = None,
    ) -> Optional[dict]:
        title = (title or '').strip()[:140]
        body = (body or '').strip()[:1200]
        if not title or not body:
            return None

        if category not in INTEL_CATEGORIES:
            category = 'operations'
        if priority not in INTEL_PRIORITIES:
            priority = 'priority'

        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        if dedupe_key:
            recent_cutoff = (now - timedelta(minutes=45)).isoformat()
            duplicate = await self.db.intel_feed.find_one(
                {'dedupe_key': dedupe_key, 'created_at': {'$gte': recent_cutoff}},
                {'_id': 0, 'intel_id': 1},
            )
            if duplicate:
                return None

        if world_context is None:
            world_context = await self.build_world_context()

        try:
            expires_in_minutes = int(expires_in_minutes)
        except (TypeError, ValueError):
            expires_in_minutes = 90

        expires_at = None
        if expires_in_minutes and expires_in_minutes > 0:
            expires_at = (now + timedelta(minutes=min(expires_in_minutes, 24 * 60))).isoformat()

        doc = {
            'intel_id': str(ObjectId()),
            'title': title,
            'body': body,
            'category': category,
            'priority': priority,
            'source': source,
            'source_event_id': event.get('event_id') if event else None,
            'source_event_type': event.get('type') if event else None,
            'tags': sorted({str(tag).strip() for tag in (tags or []) if str(tag).strip()})[:20],
            'action_items': [item.strip()[:180] for item in (action_items or []) if str(item).strip()][:5],
            'created_at': now_iso,
            'expires_at': expires_at,
            'status': 'active',
            'dedupe_key': dedupe_key,
            'world_context_snapshot': world_context,
        }
        await self.db.intel_feed.insert_one(doc)
        await self.ws_manager.broadcast({'type': 'intel', 'data': doc})
        return doc

    def _default_action_items(self, event: dict, world_state: dict) -> list[str]:
        event_type = event.get('type')
        if event_type == 'horde_event':
            return ['Avoid open roads, consolidate fire lanes, and reinforce the nearest hardpoint.']
        if event_type == 'airdrop':
            return ['Secure transport, establish overwatch, and expect hostile competition at the drop zone.']
        if event_type in {'player_death', 'player_kill'}:
            return ['Confirm survivor status, recover gear fast, and watch for opportunistic movement nearby.']
        if event_type in {'weather_change', 'season_change', 'environment'}:
            weather = world_state.get('weather', '')
            if weather in {'storm', 'blizzard', 'fog', 'snow'} or world_state.get('danger_level', 0) >= 7:
                return ['Shift scavenging plans, prioritize shelter, and top off medical and fuel reserves.']
        return []

    def _event_title(self, event: dict) -> str:
        return {
            'player_death': 'Fatality Report',
            'player_kill': 'Contact Escalation',
            'horde_event': 'Horde Vector Detected',
            'airdrop': 'Supply Window Open',
            'season_change': 'Seasonal Shift',
            'weather_change': 'Weather Front Shift',
            'time_change': 'Operational Window Shift',
            'environment': 'Environmental Hazard',
            'server': 'Operations Update',
        }.get(event.get('type'), 'Field Intel')

    def _event_priority(self, event: dict, world_state: dict) -> str:
        director_priority = event.get('director_priority')
        if director_priority in INTEL_PRIORITIES:
            return director_priority
        if world_state.get('danger_level', 0) >= 8:
            return 'critical'
        if event.get('severity') in {'critical', 'high'}:
            return 'priority'
        return 'routine'

    async def maybe_issue_event_intel(self, event: dict) -> Optional[dict]:
        if not event:
            return None
        if event.get('type') in {'player_connect', 'player_disconnect', 'chat', 'unknown'}:
            return None
        if event.get('director_priority') == 'routine' and event.get('type') not in {'weather_change', 'season_change', 'environment'}:
            return None

        world_context = await self.build_world_context()
        world_state = world_context.get('world_state', {})
        priority = self._event_priority(event, world_state)
        if priority == 'routine':
            return None

        body = ''
        if self.narrator and hasattr(self.narrator, 'intel_brief'):
            body = await self.narrator.intel_brief(event, world_context)
        if not body:
            body = event.get('summary') or event.get('raw', 'Unclassified signal traffic detected.')

        tags = list(event.get('tags') or [])
        action_items = self._default_action_items(event, world_state)
        return await self.create_intel_entry(
            title=self._event_title(event),
            body=body,
            category=event.get('category', 'operations'),
            priority=priority,
            source='director_event',
            tags=tags,
            action_items=action_items,
            event=event,
            dedupe_key=event.get('dedupe_key'),
            expires_in_minutes=60 if priority == 'critical' else 90,
            world_context=world_context,
        )

    async def maybe_issue_world_intel(self, previous_world: dict, current_world: dict) -> Optional[dict]:
        previous_world = previous_world or {}
        current_world = current_world or {}
        if not current_world:
            return None
        if not previous_world:
            return None

        title = None
        body_seed = None
        priority = 'priority'

        previous_danger = previous_world.get('danger_level', 0)
        current_danger = current_world.get('danger_level', 0)
        if previous_danger < 7 <= current_danger:
            title = 'High Risk Window'
            body_seed = (
                f"Danger index now reads {current_danger}/10. "
                f"{current_world.get('time_of_day', 'Unknown conditions').title()} and {current_world.get('weather', 'clear')} weather are stacking against the field."
            )
            if current_danger >= 9:
                priority = 'critical'
        elif previous_world.get('weather') != current_world.get('weather'):
            title = 'Weather Front Shift'
            body_seed = (
                f"Weather is turning from {previous_world.get('weather', 'unknown')} to {current_world.get('weather', 'unknown')}. "
                f"Command should expect route pressure and changing scavenging windows."
            )
            if current_world.get('weather') in {'storm', 'blizzard'}:
                priority = 'critical'
        elif previous_world.get('season') != current_world.get('season'):
            title = 'Seasonal Transition'
            body_seed = (
                f"The island is rolling from {previous_world.get('season', 'unknown')} into {current_world.get('season', 'unknown')}. "
                "Supply demand and movement patterns will shift with it."
            )
        elif previous_world.get('custom_alert') != current_world.get('custom_alert') and current_world.get('custom_alert'):
            title = 'Command Alert'
            body_seed = current_world.get('custom_alert')
            priority = 'critical'

        if not title or not body_seed:
            return None

        event = {
            'type': 'world_update',
            'severity': 'high' if priority == 'critical' else 'medium',
            'summary': body_seed,
            'details': current_world,
            'category': 'environment',
            'tags': ['world', current_world.get('season', ''), current_world.get('weather', ''), current_world.get('time_of_day', '')],
        }
        world_context = await self.build_world_context()
        body = body_seed
        if self.narrator and hasattr(self.narrator, 'intel_brief'):
            body = await self.narrator.intel_brief(event, world_context)

        dedupe_key = hashlib.md5(
            f"world:{current_world.get('season')}:{current_world.get('weather')}:{current_world.get('time_of_day')}:{current_world.get('danger_level')}:{current_world.get('custom_alert', '')}".encode('utf-8')
        ).hexdigest()

        return await self.create_intel_entry(
            title=title,
            body=body,
            category='environment',
            priority=priority,
            source='director_world',
            tags=['world', current_world.get('season', ''), current_world.get('weather', ''), current_world.get('time_of_day', '')],
            action_items=self._default_action_items(event, current_world),
            event=event,
            dedupe_key=dedupe_key,
            expires_in_minutes=120,
            world_context=world_context,
        )

    async def log_action(self, action: str, details: dict, actor: str = 'TRIGGER'):
        await self.db.gm_action_log.insert_one({
            'action': action,
            'details': details,
            'actor': actor,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        })

    def _normalize_supply_items(self, params: dict, event: Optional[dict], world_state: dict) -> list[dict]:
        from routes.economy import RESOURCE_NAMES

        items = params.get('items')
        if isinstance(items, list):
            normalized = []
            for item in items[:10]:
                if not isinstance(item, dict):
                    continue
                item_name = self._format_value(item.get('item', ''), event, world_state).strip()[:80]
                qty = item.get('qty', 1)
                if item_name in RESOURCE_NAMES and isinstance(qty, int) and 1 <= qty <= 999:
                    normalized.append({'item': item_name, 'qty': qty})
            if normalized:
                return normalized

        item_name = self._format_value(params.get('item', ''), event, world_state).strip()[:80]
        qty = params.get('qty', 1)
        if item_name in RESOURCE_NAMES and isinstance(qty, int) and 1 <= qty <= 999:
            return [{'item': item_name, 'qty': qty}]
        raise ValueError('Supply request trigger requires items or item/qty params')

    async def execute_trigger_action(self, action: str, params: Optional[dict] = None, *, event: Optional[dict] = None) -> Optional[dict]:
        params = params or {}
        world_state = await self.get_world_state()
        now = datetime.now(timezone.utc).isoformat()

        if action == 'create_intel':
            title = self._format_value(params.get('title', 'Field Intel'), event, world_state).strip()
            body = self._format_value(
                params.get('body', (event or {}).get('summary', (event or {}).get('raw', 'Signal traffic detected.'))),
                event,
                world_state,
            ).strip()
            action_items = []
            raw_action_items = params.get('action_items', [])
            if isinstance(raw_action_items, str):
                raw_action_items = [item.strip() for item in raw_action_items.split('|')]
            if isinstance(raw_action_items, list):
                action_items = [self._format_value(item, event, world_state) for item in raw_action_items]
            intel = await self.create_intel_entry(
                title=title,
                body=body,
                category=params.get('category', (event or {}).get('category', 'operations')),
                priority=params.get('priority', 'priority'),
                source='trigger',
                tags=list((event or {}).get('tags', [])),
                action_items=action_items or self._default_action_items(event or {}, world_state),
                event=event,
                dedupe_key=params.get('dedupe_key') or (event or {}).get('dedupe_key'),
                expires_in_minutes=params.get('expires_in_minutes', 120),
            )
            if intel:
                await self.log_action('trigger_create_intel', {'title': intel['title'], 'intel_id': intel['intel_id']})
            return intel

        if action == 'spawn_npc':
            npc_id = str(params.get('npc_id', '')).strip()
            if not npc_id:
                raise ValueError('spawn_npc trigger requires npc_id')
            npc = await self.db.npcs.find_one({'npc_id': npc_id}, {'_id': 0})
            if not npc:
                raise ValueError('NPC not found')
            if npc.get('status') != 'active':
                raise ValueError('NPC must be active to spawn')

            location_name = self._format_value(params.get('location_name', npc.get('location_name', 'unknown location')), event, world_state).strip()[:100]
            updates = {'updated_at': now}
            if location_name and location_name != npc.get('location_name'):
                updates['location_name'] = location_name
            if 'grid_x' in params and isinstance(params.get('grid_x'), int):
                updates['grid_x'] = params['grid_x']
            if 'grid_y' in params and isinstance(params.get('grid_y'), int):
                updates['grid_y'] = params['grid_y']
            if len(updates) > 1:
                await self.db.npcs.update_one({'npc_id': npc_id}, {'$set': updates})

            if self.ptero:
                await self.ptero.send_command(f'say [NPC] {npc["name"]} has appeared at {location_name or "unknown location"}.')
            await self.db.npc_events.insert_one({
                'npc_id': npc_id,
                'npc_name': npc['name'],
                'event_type': 'spawned',
                'notes': f'Spawned via trigger at {location_name or "unknown location"}',
                'recorded_by': 'TRIGGER',
                'timestamp': now,
            })
            await self.ws_manager.broadcast({
                'type': 'npc_update',
                'data': {'action': 'spawned', 'npc_id': npc_id, 'name': npc['name'], 'location_name': location_name},
            })
            await self.log_action('trigger_spawn_npc', {'npc_id': npc_id, 'name': npc['name'], 'location_name': location_name})
            return {'npc_id': npc_id, 'name': npc['name'], 'location_name': location_name}

        if action == 'activate_mission':
            mission_id = str(params.get('mission_id', '')).strip()
            if not mission_id:
                raise ValueError('activate_mission trigger requires mission_id')
            mission = await self.db.missions.find_one({'mission_id': mission_id}, {'_id': 0})
            if not mission:
                raise ValueError('Mission not found')

            updates = {'status': 'active', 'updated_at': now}
            if not mission.get('activated_at'):
                updates['activated_at'] = now
            await self.db.missions.update_one({'mission_id': mission_id}, {'$set': updates})

            broadcast_message = self._format_value(params.get('broadcast_message', ''), event, world_state).strip()
            if not broadcast_message and mission.get('broadcast_on_activate'):
                broadcast_message = f'[MISSION] New mission active: {mission["title"]} - {mission["summary"][:100]}'
            if broadcast_message and self.ptero:
                await self.ptero.send_command(f'say {broadcast_message[:240]}')
                await self.db.gm_broadcasts.insert_one({
                    'message': broadcast_message[:240],
                    'sent_by': 'TRIGGER',
                    'timestamp': now,
                })

            await self.ws_manager.broadcast({'type': 'mission_update', 'data': {
                'action': 'status_changed',
                'mission_id': mission_id,
                'title': mission['title'],
                'status': 'active',
            }})

            if params.get('create_intel', True):
                await self.create_intel_entry(
                    title=self._format_value(params.get('intel_title', f'Mission Activated: {mission["title"]}'), event, world_state),
                    body=self._format_value(params.get('intel_body', mission.get('summary', '')), event, world_state),
                    category='operations',
                    priority=params.get('priority', 'priority'),
                    source='trigger_mission',
                    tags=['mission', mission.get('mission_type', ''), mission.get('difficulty', '')],
                    action_items=['Review the briefing, stage supplies, and move before the window closes.'],
                    dedupe_key=f'mission-active:{mission_id}',
                    expires_in_minutes=180,
                )

            await self.log_action('trigger_activate_mission', {'mission_id': mission_id, 'title': mission['title']})
            return {'mission_id': mission_id, 'title': mission['title'], 'status': 'active'}

        if action == 'create_supply_request':
            items = self._normalize_supply_items(params, event, world_state)
            priority = str(params.get('priority', 'urgent')).strip().lower()
            if priority not in SUPPLY_PRIORITIES:
                priority = 'urgent'
            notes = self._format_value(params.get('notes', ''), event, world_state).strip()[:200]
            requester_callsign = self._format_value(params.get('requester_callsign', 'Automated Director'), event, world_state).strip()[:80] or 'Automated Director'
            doc = {
                'request_id': str(ObjectId()),
                'requester_id': None,
                'requester_callsign': requester_callsign,
                'faction_id': params.get('faction_id'),
                'items': items,
                'priority': priority,
                'notes': notes,
                'status': 'open',
                'fulfilled_by': None,
                'created_at': now,
            }
            await self.db.supply_requests.insert_one(doc)
            await self.ws_manager.broadcast({'type': 'supply_request', 'data': doc})

            if params.get('create_intel', True):
                item_summary = ', '.join(f"{item['qty']}x {item['item']}" for item in items[:4])
                await self.create_intel_entry(
                    title=self._format_value(params.get('intel_title', 'Supply Request Posted'), event, world_state),
                    body=self._format_value(
                        params.get('intel_body', f'{requester_callsign} is requesting {item_summary}.'),
                        event,
                        world_state,
                    ),
                    category='survival',
                    priority='critical' if priority == 'urgent' else 'priority',
                    source='trigger_supply',
                    tags=['supply', priority],
                    action_items=['Shift inventory, broker a trade, or move a scavenging team before shortages deepen.'],
                    dedupe_key=params.get('dedupe_key'),
                    expires_in_minutes=180,
                )

            await self.log_action('trigger_create_supply_request', {'request_id': doc['request_id'], 'priority': priority, 'items': items})
            return doc

        raise ValueError(f'Unsupported trigger action: {action}')
