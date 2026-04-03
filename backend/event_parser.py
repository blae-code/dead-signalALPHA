import re
from datetime import datetime, timezone
from typing import Optional


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
        re.compile(r'(.+?)\s+(?:died|was killed|was slain|has died)', re.IGNORECASE),
    ],
    'player_kill': [
        re.compile(r'(.+?)\s+killed\s+(.+)', re.IGNORECASE),
    ],
    'horde_event': [
        re.compile(r'(?:horde|zombie\s*wave|swarm)\s+(?:incoming|started|spawned|approaching)', re.IGNORECASE),
        re.compile(r'(?:a\s+)?horde\s+(?:of|has)', re.IGNORECASE),
    ],
    'airdrop': [
        re.compile(r'(?:airdrop|supply\s*drop|care\s*package)\s+(?:incoming|spawned|landed|deployed)', re.IGNORECASE),
    ],
    'season_change': [
        re.compile(r'(?:season|weather)\s+(?:changed?|transition|now)\s+(?:to\s+)?(\w+)', re.IGNORECASE),
    ],
    'weather_change': [
        re.compile(r'weather\s+(?:changed?|set|switched|turned)\s+(?:to\s+)?(\w+)', re.IGNORECASE),
        re.compile(r'(?:it\s+)?(?:started?|began?|stopped?)\s+(raining|snowing|storming|clearing)', re.IGNORECASE),
        re.compile(r'(?:rain|snow|storm|fog|blizzard)\s+(?:started|stopped|ended|cleared)', re.IGNORECASE),
    ],
    'time_change': [
        re.compile(r'(?:time|day)\s+(?:set|changed?|advanced?)\s+(?:to\s+)?(\d+)', re.IGNORECASE),
        re.compile(r'(?:dawn|dusk|night|morning|noon|midnight)\s+(?:has\s+)?(?:arrived|fallen|begun|broken)', re.IGNORECASE),
        re.compile(r'day\s+(\d+)\s+(?:has\s+)?(?:started|begun|dawned)', re.IGNORECASE),
    ],
    'environment': [
        re.compile(r'(?:temperature|temp)\s+(?:dropped?|rose|fell|changed?)\s+(?:to\s+)?(-?\d+)', re.IGNORECASE),
        re.compile(r'(?:visibility|wind)\s+(?:changed?|set|dropped?|increased?)', re.IGNORECASE),
    ],
    'chat': [
        re.compile(r'\[(?:Chat|Global|All)\]\s*(.+?):\s*(.+)', re.IGNORECASE),
    ],
    'server': [
        re.compile(r'(?:Server|World)\s+(?:saved?|saving|autosave)', re.IGNORECASE),
        re.compile(r'(?:Server)\s+(?:started|stopped|restarted)', re.IGNORECASE),
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
    'environment': 'low',
    'chat': 'low',
    'server': 'medium',
    'unknown': 'low',
}


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
                    if len(groups) > 1:
                        event['details']['cause'] = groups[1]
                elif event_type == 'player_kill':
                    event['players'] = list(groups[:2])
                    if len(groups) >= 2:
                        event['details']['killer'] = groups[0]
                        event['details']['victim'] = groups[1]
                elif event_type == 'chat' and len(groups) >= 2:
                    event['players'] = [groups[0]]
                    event['details']['message'] = groups[1]
                elif event_type == 'season_change' and groups:
                    event['details']['season'] = groups[0]
                elif event_type == 'weather_change' and groups:
                    event['details']['weather'] = groups[0]
                elif event_type == 'time_change' and groups:
                    event['details']['time'] = groups[0]
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
