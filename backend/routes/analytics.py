"""
GM Player Analytics
====================
Server-wide player activity metrics and GM-facing analytics.

Reads from existing collections:
  player_sessions  — { name, steam_id, ip, connected_at, last_seen, online }
  events           — { type, details, timestamp }  (player_kill, player_death, etc.)
  gm_players       — { player_name, status, ban_reason, ... }

Endpoints:
  GET /api/gm/analytics/players           — ranked player activity list
  GET /api/gm/analytics/players/{name}    — per-player detail + session timeline
  GET /api/gm/analytics/activity          — hourly server activity over N hours
  GET /api/gm/analytics/summary           — quick counts for dashboard widgets

Activity score formula (implement in aggregation pipeline):
  score = (session_count * 10) + (kills * 3) + floor(playtime_hours * 5)

NOTE: Kill/death counts require the `events` collection to store events with:
  { type: "player_kill",   details: { killer: str, victim: str } }
  { type: "player_death",  details: { player: str, cause: str } }
Until events are ingested, kill/death counts will return 0.
"""

from fastapi import APIRouter, Request, HTTPException
from typing import Optional
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gm/analytics", tags=["gm", "analytics"])

db = None
require_admin = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def _get_kill_counts(player_name: str) -> dict:
    """
    Return kills and deaths for a named player from the events collection.

    TODO: Replace count_documents calls with a single $facet aggregation
    once the events ingestion pipeline is confirmed to write player_kill /
    player_death documents.
    """
    kills = await db.events.count_documents({
        "type": "player_kill",
        "details.killer": player_name,
    })
    deaths = await db.events.count_documents({
        "type": "player_death",
        "details.player": player_name,
    })
    return {"kills": kills, "deaths": deaths}


async def _session_stats(player_name: str) -> dict:
    """Aggregate session data for a player from player_sessions."""
    sessions = await db.player_sessions.find(
        {"name": player_name}, {"_id": 0}
    ).sort("last_seen", -1).to_list(200)

    if not sessions:
        return {
            "session_count": 0,
            "total_playtime_minutes": 0,
            "last_seen": None,
            "first_seen": None,
            "online": False,
        }

    total_minutes = 0
    for s in sessions:
        start = s.get("connected_at")
        end   = s.get("last_seen")
        if start and end:
            try:
                t0 = datetime.fromisoformat(start.replace("Z", "+00:00"))
                t1 = datetime.fromisoformat(end.replace("Z", "+00:00"))
                delta = (t1 - t0).total_seconds() / 60
                if 0 < delta < 1440:   # cap at 24h to exclude bad data
                    total_minutes += delta
            except Exception:
                pass

    return {
        "session_count": len(sessions),
        "total_playtime_minutes": round(total_minutes),
        "last_seen":  sessions[0].get("last_seen"),
        "first_seen": sessions[-1].get("connected_at"),
        "online":     bool(sessions[0].get("online")),
    }


def _activity_score(session_count: int, kills: int, playtime_minutes: int) -> int:
    """Simple engagement score for sorting. Tune weights as needed."""
    playtime_hours = playtime_minutes / 60
    return int(session_count * 10 + kills * 3 + playtime_hours * 5)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/summary")
async def analytics_summary(request: Request):
    """
    Quick counts for GM dashboard widgets.
    Returns: total tracked players, online now, new this week, banned.
    """
    await require_admin(request)

    week_ago = (_now_utc() - timedelta(days=7)).isoformat()
    total   = await db.player_sessions.distinct("name")
    online  = await db.player_sessions.count_documents({"online": True})
    new_wk  = len(await db.player_sessions.distinct("name", {
        "connected_at": {"$gte": week_ago}
    }))
    banned  = await db.gm_players.count_documents({"status": "banned"})

    return {
        "total_players":  len(total),
        "online_now":     online,
        "new_this_week":  new_wk,
        "banned":         banned,
    }


@router.get("/players")
async def list_player_analytics(
    request: Request,
    limit:   int = 50,
    sort_by: str = "score",   # score | playtime | sessions | kills | last_seen
    online_only: bool = False,
):
    """
    Return a ranked list of players with activity metrics.
    Pulls from player_sessions; merges kill counts from events.

    Performance note: this does N+1 event queries — acceptable for small
    servers (<500 players). For larger deployments, maintain a cached
    player_stats collection updated by the scheduler.
    """
    await require_admin(request)

    limit = max(1, min(limit, 200))
    query: dict = {}
    if online_only:
        query["online"] = True

    # Collect distinct player names visible in sessions
    all_names = await db.player_sessions.distinct("name", query)

    rows = []
    for name in all_names[:200]:   # hard cap to protect performance
        sess  = await _session_stats(name)
        kd    = await _get_kill_counts(name)
        score = _activity_score(sess["session_count"], kd["kills"], sess["total_playtime_minutes"])
        gm_rec = await db.gm_players.find_one({"player_name": name}, {"_id": 0, "status": 1})
        rows.append({
            "player_name":            name,
            "status":                 (gm_rec or {}).get("status", "active"),
            "online":                 sess["online"],
            "session_count":          sess["session_count"],
            "total_playtime_minutes": sess["total_playtime_minutes"],
            "kills":                  kd["kills"],
            "deaths":                 kd["deaths"],
            "kd_ratio":               round(kd["kills"] / max(kd["deaths"], 1), 2),
            "last_seen":              sess["last_seen"],
            "first_seen":             sess["first_seen"],
            "activity_score":         score,
        })

    SORT_KEYS = {
        "score":     lambda r: r["activity_score"],
        "playtime":  lambda r: r["total_playtime_minutes"],
        "sessions":  lambda r: r["session_count"],
        "kills":     lambda r: r["kills"],
        "last_seen": lambda r: r["last_seen"] or "",
    }
    key_fn = SORT_KEYS.get(sort_by, SORT_KEYS["score"])
    rows.sort(key=key_fn, reverse=True)

    return rows[:limit]


@router.get("/players/{player_name}")
async def get_player_analytics(player_name: str, request: Request):
    """
    Full analytics detail for a single player, including:
    - Session timeline (last 20 sessions)
    - Kill/death history (last 50 events)
    - GM notes and action history
    """
    await require_admin(request)

    player_name = player_name.strip()[:80]
    if not player_name:
        raise HTTPException(status_code=400, detail="player_name is required")

    sess = await _session_stats(player_name)
    kd   = await _get_kill_counts(player_name)

    sessions = await db.player_sessions.find(
        {"name": player_name}, {"_id": 0}
    ).sort("last_seen", -1).to_list(20)

    kill_events = await db.events.find(
        {"type": "player_kill", "details.killer": player_name}, {"_id": 0}
    ).sort("timestamp", -1).to_list(50)

    death_events = await db.events.find(
        {"type": "player_death", "details.player": player_name}, {"_id": 0}
    ).sort("timestamp", -1).to_list(50)

    gm_notes = await db.gm_player_notes.find(
        {"player_name": player_name}, {"_id": 0}
    ).sort("timestamp", -1).to_list(30)

    gm_actions = await db.gm_action_log.find(
        {"details.player_name": player_name}, {"_id": 0}
    ).sort("timestamp", -1).to_list(30)

    gm_rec = await db.gm_players.find_one({"player_name": player_name}, {"_id": 0})

    score = _activity_score(sess["session_count"], kd["kills"], sess["total_playtime_minutes"])

    return {
        "player_name":   player_name,
        "gm_record":     gm_rec or {},
        "stats": {
            **sess,
            **kd,
            "kd_ratio":      round(kd["kills"] / max(kd["deaths"], 1), 2),
            "activity_score": score,
        },
        "sessions":      sessions,
        "kill_events":   kill_events,
        "death_events":  death_events,
        "gm_notes":      gm_notes,
        "gm_actions":    gm_actions,
    }


@router.get("/activity")
async def server_activity(
    request:   Request,
    hours:     int = 24,   # lookback window
    bucket_h:  int = 1,    # bucket size in hours (1 or 6 or 24)
):
    """
    Hourly player connection count over the last N hours.
    Returns a list of { bucket_start: ISO8601, player_count: int } objects.

    TODO: Replace the Python loop with a MongoDB $group aggregation on
    player_sessions.connected_at for better performance at scale:

      pipeline = [
        { "$match": { "connected_at": { "$gte": since.isoformat() } } },
        { "$addFields": {
            "bucket": { "$dateTrunc": {
              "date": { "$toDate": "$connected_at" },
              "unit": "hour",
              "binSize": bucket_h,
            }}
        }},
        { "$group": { "_id": "$bucket", "count": { "$sum": 1 } } },
        { "$sort": { "_id": 1 } },
      ]
    """
    await require_admin(request)

    hours     = max(1, min(hours, 720))
    bucket_h  = max(1, min(bucket_h, 24))
    now       = _now_utc()
    since     = now - timedelta(hours=hours)

    sessions = await db.player_sessions.find(
        {"connected_at": {"$gte": since.isoformat()}},
        {"_id": 0, "connected_at": 1},
    ).to_list(5000)

    # Build buckets
    num_buckets = hours // bucket_h
    buckets: dict[int, int] = {}
    for i in range(num_buckets):
        bucket_ts = int((since + timedelta(hours=i * bucket_h)).timestamp())
        buckets[bucket_ts] = 0

    for s in sessions:
        ts_str = s.get("connected_at")
        if not ts_str:
            continue
        try:
            dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            offset_h = int((dt - since).total_seconds() / 3600)
            bucket_i = (offset_h // bucket_h) * bucket_h
            bucket_ts = int((since + timedelta(hours=bucket_i)).timestamp())
            if bucket_ts in buckets:
                buckets[bucket_ts] += 1
        except Exception:
            pass

    result = [
        {
            "bucket_start": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
            "player_count": count,
        }
        for ts, count in sorted(buckets.items())
    ]
    return {"hours": hours, "bucket_hours": bucket_h, "buckets": result}


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_analytics_routes(database, admin_fn):
    global db, require_admin
    db = database
    require_admin = admin_fn
    return router
