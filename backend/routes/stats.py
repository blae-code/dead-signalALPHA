"""
Player Stats
============
Personal and leaderboard statistics derived from event history and session logs.

All stats are computed at query time from existing collections — no separate stats
collection is maintained. If performance becomes an issue, add a nightly
aggregation job that caches results in a `player_stats_cache` collection.

Endpoints:
  GET /api/stats/me               — current user's personal stats
  GET /api/stats/leaderboard      — top players (kills, playtime, kd)
  GET /api/stats/history?days=7   — recent event activity timeline for current user

Stats shape (GET /api/stats/me):
  {
    callsign:              str
    faction_name:          str | null
    faction_tag:           str | null
    kill_count:            int   (events where type=player_kill AND killer=callsign)
    death_count:           int   (events where type=player_death AND player=callsign)
    kd_ratio:              float (kill_count / max(death_count, 1))
    total_sessions:        int
    total_playtime_hours:  float
    longest_session_hours: float
    first_seen:            ISO8601 | null
    last_seen:             ISO8601 | null
    events_logged:         int   (events authored by this user via POST /events)
    items_in_inventory:    int   (current inventory item type count)
  }

Leaderboard shape (GET /api/stats/leaderboard):
  {
    by_kills:    [ { rank, callsign, faction_tag, kill_count, kd_ratio } ]
    by_playtime: [ { rank, callsign, faction_tag, total_playtime_hours } ]
    by_kd:       [ { rank, callsign, faction_tag, kd_ratio, kill_count } ]
  }
"""

from fastapi import APIRouter, Request, HTTPException
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stats", tags=["stats"])

db = None
get_current_user = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _session_stats(callsign: str) -> dict:
    """
    Aggregate session stats for a callsign from player_sessions collection.

    TODO: player_sessions documents have fields: name, joined_at, last_seen.
          Compute total_playtime by summing (last_seen - joined_at) per session.
          Currently each login creates/updates a single doc per player name,
          so this is approximate. Switch to append-log sessions for accuracy.
    """
    sessions = await db.player_sessions.find(
        {"name": callsign}, {"_id": 0}
    ).to_list(1000)

    total_sessions = len(sessions)
    total_hours = 0.0
    longest_hours = 0.0
    first_seen = None
    last_seen = None

    # TODO: implement duration calculation from joined_at / last_seen timestamps
    # For now return raw counts; full implementation should parse ISO timestamps
    # and compute timedeltas.

    for s in sessions:
        if s.get("joined_at") and (first_seen is None or s["joined_at"] < first_seen):
            first_seen = s["joined_at"]
        if s.get("last_seen") and (last_seen is None or s["last_seen"] > last_seen):
            last_seen = s["last_seen"]

    return {
        "total_sessions":        total_sessions,
        "total_playtime_hours":  round(total_hours, 2),
        "longest_session_hours": round(longest_hours, 2),
        "first_seen":            first_seen,
        "last_seen":             last_seen,
    }


async def _combat_stats(callsign: str) -> dict:
    """
    Derive kill/death counts from events collection.

    TODO: The events collection stores details.killer and details.victim for
          player_kill / player_death events. Query both and count.
          Event doc shape: { type, details: { killer, victim, cause, weapon }, players }
    """
    # TODO: implement MongoDB aggregation pipeline
    # kills  = await db.events.count_documents({"type": "player_kill",  "details.killer": callsign})
    # deaths = await db.events.count_documents({"type": "player_death", "details.victim": callsign})
    kills = 0   # placeholder
    deaths = 0  # placeholder

    return {
        "kill_count":  kills,
        "death_count": deaths,
        "kd_ratio":    round(kills / max(deaths, 1), 2),
    }


async def _faction_info(user_id: str) -> dict:
    """Return faction name/tag for the user, or nulls."""
    membership = await db.faction_members.find_one(
        {"user_id": user_id, "status": "active"}, {"_id": 0, "faction_id": 1}
    )
    if not membership:
        return {"faction_name": None, "faction_tag": None}

    faction = await db.factions.find_one(
        {"faction_id": membership["faction_id"]}, {"_id": 0, "name": 1, "tag": 1}
    )
    if not faction:
        return {"faction_name": None, "faction_tag": None}

    return {"faction_name": faction.get("name"), "faction_tag": faction.get("tag")}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/me")
async def my_stats(request: Request):
    """Return comprehensive personal stats for the authenticated user."""
    user = await get_current_user(request)
    callsign = user.get("callsign", "")
    uid = user["_id"]

    session_data  = await _session_stats(callsign)
    combat_data   = await _combat_stats(callsign)
    faction_data  = await _faction_info(uid)

    # Inventory item type count
    inv = await db.player_inventory.find_one({"user_id": uid}, {"_id": 0, "items": 1})
    items_count = len(inv.get("items", [])) if inv else 0

    return {
        "callsign":           callsign,
        **faction_data,
        **combat_data,
        **session_data,
        "events_logged":      0,   # TODO: count events where author_id == uid
        "items_in_inventory": items_count,
    }


@router.get("/leaderboard")
async def leaderboard(request: Request, limit: int = 10):
    """
    Return top players by kills, playtime, and K/D ratio.

    TODO: This currently returns placeholder structure. Implement by:
    1. Aggregating player_sessions for playtime per callsign
    2. Aggregating events for kills/deaths per callsign
    3. Joining with faction_members for faction tags
    4. Sorting and ranking each category

    Consider caching results with a short TTL (60s) or a background job.
    """
    await get_current_user(request)

    # TODO: implement aggregation pipelines
    # Example pipeline for kills:
    # pipeline = [
    #   { "$match": { "type": "player_kill" } },
    #   { "$group": { "_id": "$details.killer", "kill_count": { "$sum": 1 } } },
    #   { "$sort": { "kill_count": -1 } },
    #   { "$limit": limit },
    # ]
    # kills_data = await db.events.aggregate(pipeline).to_list(limit)

    return {
        "by_kills":    [],   # TODO: [ { rank, callsign, faction_tag, kill_count, kd_ratio } ]
        "by_playtime": [],   # TODO: [ { rank, callsign, faction_tag, total_playtime_hours } ]
        "by_kd":       [],   # TODO: [ { rank, callsign, faction_tag, kd_ratio, kill_count } ]
    }


@router.get("/history")
async def activity_history(request: Request, days: int = 7):
    """
    Return daily event counts for the current user over the last `days` days.
    Used to render an activity sparkline/graph in the stats UI.

    TODO: Aggregate events collection by day, filtered to events where
          the user's callsign appears in the `players` array or as killer/victim.

    Returns: [ { date: "YYYY-MM-DD", event_count: int, kill_count: int, death_count: int } ]
    """
    user = await get_current_user(request)
    callsign = user.get("callsign", "")

    # TODO: implement date-bucketed aggregation
    # from datetime import timedelta
    # cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    # pipeline = [ ... ]

    return {
        "callsign": callsign,
        "days":     days,
        "history":  [],   # TODO: [ { date, event_count, kill_count, death_count } ]
    }


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_stats_routes(database, auth_fn):
    global db, get_current_user
    db = database
    get_current_user = auth_fn
    return router
