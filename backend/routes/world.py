from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from bson import ObjectId
from datetime import datetime, timezone
import math
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/world", tags=["world"])

db = None
get_current_user = None
ptero_ws_ref = None

# HumanitZ day cycle: ~48 real minutes = 24 in-game hours
REAL_MINUTES_PER_GAME_DAY = 48
GAME_YEAR_DAYS = 120  # 4 seasons x 30 days

SEASONS = [
    {'name': 'spring', 'start_day': 1, 'end_day': 30},
    {'name': 'summer', 'start_day': 31, 'end_day': 60},
    {'name': 'autumn', 'start_day': 61, 'end_day': 90},
    {'name': 'winter', 'start_day': 91, 'end_day': 120},
]

WEATHER_TYPES = ['clear', 'cloudy', 'overcast', 'rain', 'storm', 'fog', 'snow', 'blizzard']

WEATHER_TOOLTIPS = {
    'clear': 'Visibility is excellent. Zombies rely on sight — stay low in open ground. Best conditions for scavenging.',
    'cloudy': 'Reduced sunlight slows solar panel output. Mild zombie aggression. Good foraging conditions.',
    'overcast': 'Limited visibility at range. Zombies are slightly more active. Gunfire echoes further.',
    'rain': 'Noise from rain masks footsteps, improving stealth. Visibility reduced to 150m. Wet clothes cause slow hypothermia.',
    'storm': 'Lightning risks fire. Thunder masks all sound. Extreme visibility loss. Zombies highly erratic — stay indoors.',
    'fog': 'Visibility under 50m. Extremely dangerous — zombies appear with no warning. Best avoided entirely.',
    'snow': 'Cold exposure drains stamina. Tracks visible in snow betray your position. Food spoils slower.',
    'blizzard': 'Lethal cold exposure. Zero visibility. All outdoor activity is suicide. Shelter immediately.',
}

TIME_TOOLTIPS = {
    'dawn': 'First light. Zombies begin retreating to shade. Safe window for supply runs — 30 minutes until full daylight.',
    'morning': 'Peak safety window. Lowest zombie density. Best time for scavenging, building, and overland travel.',
    'noon': 'Maximum daylight and heat. Stamina drains faster from exertion. Zombies at minimum aggression.',
    'afternoon': 'Daylight waning. Begin returning to base. Zombie patrols slowly increasing.',
    'dusk': 'Critical danger transition. Zombie aggression ramps sharply. Complete all outdoor tasks immediately.',
    'night': 'Full darkness. Zombie density and aggression at maximum. Noise attracts hordes. Travel only if desperate.',
    'midnight': 'Deepest dark. Special infected spawn. Horde events most likely. Absolute last resort for movement.',
}

SEASON_TOOLTIPS = {
    'spring': 'New growth. Foraging yields +30%. Rain frequent. Moderate temperatures. Zombie density: normal.',
    'summer': 'Long days, short nights. Heat exhaustion risk. Water consumption doubled. Crops grow fastest. Best building season.',
    'autumn': 'Harvest season — maximum food yields. Days shorten rapidly. Fog events common. Prepare winter stores now.',
    'winter': 'Survival mode. Food scarce, cold lethal without shelter. Shortest days. Zombie hordes largest. Water sources freeze.',
}


def calculate_world_time(server_uptime_ms: int, offset_hours: float = 0):
    """Calculate in-game time from server uptime."""
    real_minutes = server_uptime_ms / 60000
    game_hours_total = (real_minutes / REAL_MINUTES_PER_GAME_DAY) * 24 + offset_hours
    game_hour = game_hours_total % 24
    game_day = int(game_hours_total / 24) % GAME_YEAR_DAYS + 1

    # Time of day
    if 5 <= game_hour < 7:
        time_of_day = 'dawn'
    elif 7 <= game_hour < 11:
        time_of_day = 'morning'
    elif 11 <= game_hour < 14:
        time_of_day = 'noon'
    elif 14 <= game_hour < 17:
        time_of_day = 'afternoon'
    elif 17 <= game_hour < 20:
        time_of_day = 'dusk'
    elif 20 <= game_hour < 24 or 0 <= game_hour < 1:
        time_of_day = 'night'
    else:
        time_of_day = 'midnight'

    # Season
    season = 'spring'
    for s in SEASONS:
        if s['start_day'] <= game_day <= s['end_day']:
            season = s['name']
            break

    # Temperature estimate (Celsius)
    season_base = {'spring': 12, 'summer': 28, 'autumn': 10, 'winter': -5}
    time_mod = {'dawn': -3, 'morning': 0, 'noon': 5, 'afternoon': 3, 'dusk': -1, 'night': -6, 'midnight': -8}
    temp = season_base.get(season, 10) + time_mod.get(time_of_day, 0)

    return {
        'hour': round(game_hour, 1),
        'hour_display': f'{int(game_hour):02d}:{int((game_hour % 1) * 60):02d}',
        'time_of_day': time_of_day,
        'day': game_day,
        'season': season,
        'temperature': temp,
    }


class WorldOverrideInput(BaseModel):
    weather: Optional[str] = None
    time_offset_hours: Optional[float] = None
    custom_alert: Optional[str] = None


@router.get('/state')
async def get_world_state(request: Request):
    await get_current_user(request)

    # Get server uptime from live stats
    uptime_ms = 0
    if ptero_ws_ref and hasattr(ptero_ws_ref, 'live_stats') and ptero_ws_ref.live_stats:
        uptime_ms = ptero_ws_ref.live_stats.get('uptime', 0)

    # Get GM overrides
    overrides = await db.gm_settings.find_one({'key': 'world_overrides'}, {'_id': 0})
    ovr = overrides.get('value', {}) if overrides else {}

    offset = ovr.get('time_offset_hours', 0)
    world = calculate_world_time(uptime_ms, offset)

    # Weather — use override or auto-cycle based on time
    if ovr.get('weather'):
        weather = ovr['weather']
    else:
        # Auto-cycle weather based on game hour and season
        import hashlib
        seed = int(hashlib.md5(f"{world['day']}-{int(world['hour'] / 3)}".encode()).hexdigest()[:8], 16)
        season_weights = {
            'spring': ['clear', 'cloudy', 'rain', 'cloudy', 'clear', 'rain', 'overcast', 'fog'],
            'summer': ['clear', 'clear', 'clear', 'cloudy', 'clear', 'storm', 'clear', 'clear'],
            'autumn': ['cloudy', 'overcast', 'rain', 'fog', 'cloudy', 'rain', 'overcast', 'clear'],
            'winter': ['snow', 'cloudy', 'blizzard', 'overcast', 'snow', 'clear', 'snow', 'fog'],
        }
        options = season_weights.get(world['season'], season_weights['spring'])
        weather = options[seed % len(options)]

    # Adjust temperature for weather
    weather_temp_mod = {'clear': 2, 'cloudy': 0, 'overcast': -1, 'rain': -3, 'storm': -5, 'fog': -2, 'snow': -8, 'blizzard': -15}
    world['temperature'] += weather_temp_mod.get(weather, 0)
    world['weather'] = weather
    world['weather_tooltip'] = WEATHER_TOOLTIPS.get(weather, '')
    world['time_tooltip'] = TIME_TOOLTIPS.get(world['time_of_day'], '')
    world['season_tooltip'] = SEASON_TOOLTIPS.get(world['season'], '')
    world['custom_alert'] = ovr.get('custom_alert', '')

    # Danger level
    danger_time = {'dawn': 2, 'morning': 1, 'noon': 1, 'afternoon': 2, 'dusk': 4, 'night': 5, 'midnight': 5}
    danger_weather = {'clear': 0, 'cloudy': 0, 'overcast': 1, 'rain': 1, 'storm': 3, 'fog': 4, 'snow': 2, 'blizzard': 5}
    danger_season = {'spring': 0, 'summer': 0, 'autumn': 1, 'winter': 2}
    world['danger_level'] = min(10, danger_time.get(world['time_of_day'], 0) + danger_weather.get(weather, 0) + danger_season.get(world['season'], 0))

    return world


@router.post('/override')
async def set_world_override(data: WorldOverrideInput, request: Request):
    user = await get_current_user(request)
    if user.get('role') not in ('system_admin', 'server_admin'):
        raise HTTPException(status_code=403, detail='Admin access required')

    current = await db.gm_settings.find_one({'key': 'world_overrides'})
    ovr = current.get('value', {}) if current else {}

    if data.weather is not None:
        if data.weather == '':
            ovr.pop('weather', None)
        elif data.weather in WEATHER_TYPES:
            ovr['weather'] = data.weather
    if data.time_offset_hours is not None:
        ovr['time_offset_hours'] = data.time_offset_hours
    if data.custom_alert is not None:
        ovr['custom_alert'] = data.custom_alert.strip()

    await db.gm_settings.update_one(
        {'key': 'world_overrides'},
        {'$set': {'key': 'world_overrides', 'value': ovr}},
        upsert=True,
    )
    return {'message': 'World overrides updated', 'overrides': ovr}


def init_world_routes(database, auth_func, ws_consumer=None):
    global db, get_current_user, ptero_ws_ref
    db = database
    get_current_user = auth_func
    ptero_ws_ref = ws_consumer
    return router
