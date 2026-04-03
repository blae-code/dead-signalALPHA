import hashlib
import re
from datetime import datetime, timezone
from typing import Iterable, Optional


PATTERNS = {
    'player_connect': [
        re.compile(r'(?:Player|User)\s+["\']?(.+?)["\']?\s+(?:connected|joined|logged in)', re.IGNORECASE),
        re.compile(r'(.+?)\s+has\s+(?:connected|joined)\s+the\s+server', re.IGNORECASE),
        re.compile(r'Login:\s+(.+)', re.IGNORECASE),
    ],
    'player_disconnect': [
        re.compile(r'(?:Player|User)\s+["\']?(.+?)["\']?\s+(?:disconnected|left|logged out)', re.IGNORECASE),
        re.compile(r'(.+?)\s+has\s+(?:disconnected|left)\s+the\s+server', re.IGNORECASE),
        re.compile(r'Logout:\s+(.+)', re.IGNORECASE),
    ],
    'player_death': [
        re.compile(r'(.+?)\s+(?:died|was killed|was slain|has died)(?:\s+(?:by|from)\s+(.+))?', re.IGNORECASE),
    ],
    'player_kill': [
        re.compile(r'(.+?)\s+killed\s+(.+?)(?:\s+with\s+(.+))?$', re.IGNORECASE),
    ],
    'horde_event': [
        re.compile(r'(?:horde|zombie\s*wave|swarm)\s+(?:incoming|started|spawned|approaching)', re.IGNORECASE),
        re.compile(r'(?:a\s+)?horde\s+(?:of|has)', re.IGNORECASE),
        re.compile(r'(?:massive|large)\s+(?:infected|zombie)\s+(?:movement|cluster)', re.IGNORECASE),
    ],
    'airdrop': [
        re.compile(r'(?:airdrop|supply\s*drop|care\s*package)\s+(?:incoming|spawned|landed|deployed)', re.IGNORECASE),
        re.compile(r'(?:crate|drop)\s+(?:has\s+)?(?:landed|deployed)', re.IGNORECASE),
    ],
    'season_change': [
        re.compile(r'(?:season)\s+(?:changed?|transition|now)\s+(?:to\s+)?(\w+)', re.IGNORECASE),
    ],
    'weather_change': [
        re.compile(r'weather\s+(?:changed?|set|switched|turned)\s+(?:to\s+)?(\w+)', re.IGNORECASE),
        re.compile(r'(?:it\s+)?(?:started?|began?|stopped?)\s+(raining|snowing|storming|clearing)', re.IGNORECASE),
        re.compile(r'(rain|snow|storm|fog|blizzard)\s+(?:started|stopped|ended|cleared)', re.IGNORECASE),
    ],
    'time_change': [
        re.compile(r'(?:time|day)\s+(?:set|changed?|advanced?)\s+(?:to\s+)?(\d+)', re.IGNORECASE),
        re.compile(r'(dawn|dusk|night|morning|noon|midnight)\s+(?:has\s+)?(?:arrived|fallen|begun|broken)', re.IGNORECASE),
        re.compile(r'day\s+(\d+)\s+(?:has\s+)?(?:started|begun|dawned)', re.IGNORECASE),
    ],
    'environment': [
        re.compile(r'(?:temperature|temp)\s+(?:dropped?|rose|fell|changed?)\s+(?:to\s+)?(-?\d+)', re.IGNORECASE),
        re.compile(r'(?:visibility|wind|radiation|infection)\s+(?:changed?|set|dropped?|increased?)', re.IGNORECASE),
    ],
    'chat': [
        re.compile(r'\[(?:Chat|Global|All)\]\s*(.+?):\s*(.+)', re.IGNORECASE),
    ],
    'server': [
        re.compile(r'(?:Server|World)\s+(?:saved?|saving|autosave)', re.IGNORECASE),
        re.compile(r'(?:Server)\s+(?:started|stopped|restarted)', re.IGNORECASE),
        re.compile(r'(?:maintenance|shutdown|restart)\s+(?:scheduled|initiated)', re.IGNORECASE),
    ],
}

SEVERITY_MAP = {
    'player_connect': 'info',
    'player_disconnect': 'info',
    'player_death': 'high',
    'player_kill': 'critical',
    'horde_event': 'critical',
    'airdrop': 'high',
    'season_change': 'medium',
    'weather_change': 'medium',
    'time_change': 'low',
    'environment': 'medium',
    'chat': 'low',
    'server': 'medium',
    'unknown': 'low',
}

CATEGORY_MAP = {
    'player_connect': 'social',
    'player_disconnect': 'social',
    'player_death': 'combat',
    'player_kill': 'combat',
    'horde_event': 'combat',
    'airdrop': 'survival',
    'season_change': 'environment',
    'weather_change': 'environment',
    'time_change': 'environment',
    'environment': 'environment',
    'chat': 'social',
    'server': 'operations',
    'unknown': 'operations',
}

DIRECTOR_PRIORITY_MAP = {
    'critical': 'critical',
    'high': 'priority',
    'medium': 'priority',
    'low': 'routine',
    'info': 'routine',
}

KEYWORD_TAGS = {
    'raid': {'raid', 'base', 'breach', 'assault'},
    'supply': {'supply', 'crate', 'drop', 'cache', 'loot'},
    'mobility': {'vehicle', 'fuel', 'engine', 'convoy'},
    'medical': {'medic', 'bandage', 'blood', 'infection', 'antibiotic'},
    'combat': {'kill', 'firefight', 'shot', 'hostile', 'zombie', 'infected', 'horde'},
}


def _clean_players(players: Iterable[str]) -> list[str]:
    cleaned = []
    for player in players:
        value = str(player).strip().strip('"').strip("'")
        if value:
            cleaned.append(value)
    return cleaned[:5]


def _build_summary(event: dict) -> str:
    players = event.get('players', [])
    details = event.get('details', {})
    event_type = event.get('type', 'unknown')

    if event_type == 'player_connect' and players:
        return f'{players[0]} came online.'
    if event_type == 'player_disconnect' and players:
        return f'{players[0]} dropped from the server.'
    if event_type == 'player_death' and players:
        cause = details.get('cause')
        return f'{players[0]} was lost to {cause}.' if cause else f'{players[0]} was killed.'
    if event_type == 'player_kill' and len(players) >= 2:
        weapon = details.get('weapon')
        return f'{players[0]} killed {players[1]} with {weapon}.' if weapon else f'{players[0]} killed {players[1]}.'
    if event_type == 'horde_event':
        return 'A horde has been detected on the island.'
    if event_type == 'airdrop':
        return 'A supply drop opportunity has opened.'
    if event_type == 'season_change':
        return f'Season conditions shifted to {details.get("season", "unknown")}.'
    if event_type == 'weather_change':
        return f'Weather changed to {details.get("weather", "unknown")}.'
    if event_type == 'time_change':
        return f'The operational window shifted to {details.get("time", "a new phase")}.'
    if event_type == 'environment':
        value = details.get('value')
        return f'Environmental conditions changed{f" to {value}" if value else ""}.'
    if event_type == 'chat' and players:
        message = details.get('message', '')
        clipped = message[:90] + '...' if len(message) > 90 else message
        return f'{players[0]} transmitted: {clipped}'
    if event_type == 'server':
        return 'Server operations shifted state.'
    return event.get('raw', 'Unknown signal traffic detected.')


def _build_tags(event: dict) -> list[str]:
    tags = {event.get('type', 'unknown'), event.get('severity', 'low'), CATEGORY_MAP.get(event.get('type', 'unknown'), 'operations')}
    details = event.get('details', {})
    for field in ('season', 'weather', 'time'):
        value = details.get(field)
        if value:
            tags.add(str(value).strip().lower())

    raw = event.get('raw', '').lower()
    for tag, keywords in KEYWORD_TAGS.items():
        if any(keyword in raw for keyword in keywords):
            tags.add(tag)

    players = event.get('players', [])
    if players:
        tags.add('player_activity')
    if len(players) > 1:
        tags.add('multi_actor')

    return sorted(tag for tag in tags if tag)


def normalize_event(event: dict, *, world_state: Optional[dict] = None, online_players: Optional[Iterable[str]] = None) -> dict:
    normalized = {
        **event,
        'players': _clean_players(event.get('players', [])),
        'details': dict(event.get('details', {})),
    }
    normalized['category'] = CATEGORY_MAP.get(normalized.get('type', 'unknown'), 'operations')
    normalized['summary'] = _build_summary(normalized)
    normalized['tags'] = _build_tags(normalized)
    normalized['director_priority'] = DIRECTOR_PRIORITY_MAP.get(normalized.get('severity', 'low'), 'routine')

    if normalized.get('type') == 'weather_change':
        weather = normalized['details'].get('weather', '').lower()
        if weather in {'storm', 'blizzard', 'fog'}:
            normalized['director_priority'] = 'critical' if weather in {'storm', 'blizzard'} else 'priority'
    if normalized.get('type') == 'environment':
        normalized['director_priority'] = 'priority'
    if normalized.get('type') in {'player_connect', 'player_disconnect', 'chat'}:
        normalized['director_priority'] = 'routine'

    raw = normalized.get('raw', '')
    fingerprint = f"{normalized.get('timestamp', '')}|{normalized.get('type', 'unknown')}|{raw}"
    normalized['event_id'] = hashlib.md5(fingerprint.encode('utf-8')).hexdigest()

    dedupe_source = '|'.join([
        normalized.get('type', 'unknown'),
        ','.join(normalized.get('players', [])),
        normalized.get('summary', ''),
        normalized['details'].get('season', ''),
        normalized['details'].get('weather', ''),
        normalized['details'].get('time', ''),
    ])
    normalized['dedupe_key'] = hashlib.md5(dedupe_source.encode('utf-8')).hexdigest()

    if online_players is not None:
        normalized['online_player_count'] = len(list(online_players))

    if world_state:
        normalized['world'] = {
            'season': world_state.get('season'),
            'weather': world_state.get('weather'),
            'time_of_day': world_state.get('time_of_day'),
            'temperature': world_state.get('temperature'),
            'danger_level': world_state.get('danger_level'),
            'custom_alert': world_state.get('custom_alert'),
        }
        if world_state.get('danger_level', 0) >= 8 and normalized['director_priority'] == 'priority':
            normalized['director_priority'] = 'critical'

    return normalized


def parse_log_line(line: str) -> Optional[dict]:
    line = line.strip()
    if not line:
        return None

    for event_type, patterns in PATTERNS.items():
        for pattern in patterns:
            match = pattern.search(line)
            if match:
                groups = match.groups()
                event = {
                    'type': event_type,
                    'severity': SEVERITY_MAP.get(event_type, 'low'),
                    'raw': line,
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'players': [],
                    'details': {},
                }

                if event_type in ('player_connect', 'player_disconnect'):
                    event['players'] = [groups[0]] if groups else []
                elif event_type == 'player_death':
                    event['players'] = [groups[0]] if groups else []
                    if len(groups) > 1 and groups[1]:
                        event['details']['cause'] = groups[1]
                elif event_type == 'player_kill':
                    event['players'] = list(groups[:2])
                    if len(groups) >= 2:
                        event['details']['killer'] = groups[0]
                        event['details']['victim'] = groups[1]
                    if len(groups) >= 3 and groups[2]:
                        event['details']['weapon'] = groups[2]
                elif event_type == 'chat' and len(groups) >= 2:
                    event['players'] = [groups[0]]
                    event['details']['message'] = groups[1]
                elif event_type == 'season_change' and groups:
                    event['details']['season'] = groups[0].lower()
                elif event_type == 'weather_change' and groups:
                    weather = groups[0].lower()
                    event['details']['weather'] = {
                        'raining': 'rain',
                        'snowing': 'snow',
                        'storming': 'storm',
                        'clearing': 'clear',
                    }.get(weather, weather)
                elif event_type == 'time_change' and groups:
                    event['details']['time'] = groups[0].lower()
                elif event_type == 'environment' and groups:
                    event['details']['value'] = groups[0]

                return event

    return {
        'type': 'unknown',
        'severity': 'low',
        'raw': line,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'players': [],
        'details': {},
    }
