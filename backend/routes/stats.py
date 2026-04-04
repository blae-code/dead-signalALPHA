"""
Player Stats — Personal and leaderboard statistics.

Endpoints:
  GET /api/stats/me               — current user's personal stats
  GET /api/stats/leaderboard      — top players (kills, playtime, kd)
  GET /api/stats/history?days=7   — recent event activity timeline
"""

from fastapi import APIRouter, Request
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stats", tags=["stats"])

db = None
get_current_user = None


async def _session_stats(callsign: str) -> dict:
    sessions = await db.player_sessions.find(
        {"name": callsign}, {"_id": 0}
    ).to_list(1000)

    total_sessions = len(sessions)
    total_minutes = 0.0
    longest_minutes = 0.0
    first_seen = None
    last_seen = None

    for s in sessions:
        start = s.get("joined_at") or s.get("connected_at")
        end = s.get("last_seen")
        if start and (first_seen is None or start < first_seen):
            first_seen = start
        if end and (last_seen is None or end > last_seen):
            last_seen = end
        if start and end:
            try:
                t0 = datetime.fromisoformat(start.replace("Z", "+00:00"))
                t1 = datetime.fromisoformat(end.replace("Z", "+00:00"))
                delta = (t1 - t0).total_seconds() / 60
                if 0 < delta < 1440:
                    total_minutes += delta
                    if delta > longest_minutes:
                        longest_minutes = delta
            except Exception:
                pass

    recent = await db.player_sessions.find(
        {"name": callsign}, {"_id": 0}
    ).sort("last_seen", -1).to_list(10)

    return {
        "total_sessions": total_sessions,
        "total_playtime_minutes": round(total_minutes),
        "total_playtime_hours": round(total_minutes / 60, 1),
        "longest_session_hours": round(longest_minutes / 60, 1),
        "first_seen": first_seen,
        "last_seen": last_seen,
        "recent_sessions": recent,
    }


async def _combat_stats(callsign: str) -> dict:
    kills = await db.events.count_documents({
        "type": "player_kill",
        "$or": [
            {"details.killer": callsign},
            {"players": callsign, "type": "player_kill"},
        ]
    })
    deaths = await db.events.count_documents({
        "type": "player_death",
        "$or": [
            {"details.victim": callsign},
            {"details.player": callsign},
            {"players": callsign, "type": "player_death"},
        ]
    })

    # Kill streak: longest consecutive kills without a death
    all_combat = await db.events.find(
        {
            "type": {"$in": ["player_kill", "player_death"]},
            "$or": [
                {"details.killer": callsign},
                {"details.victim": callsign},
                {"details.player": callsign},
                {"players": callsign},
            ]
        },
        {"_id": 0, "type": 1, "details": 1, "timestamp": 1}
    ).sort("timestamp", 1).to_list(500)

    streak = 0
    best_streak = 0
    for ev in all_combat:
        is_kill = (
            ev.get("type") == "player_kill" and
            (ev.get("details", {}).get("killer") == callsign or callsign in ev.get("players", []))
        )
        is_death = (
            ev.get("type") == "player_death" and
            (ev.get("details", {}).get("victim") == callsign or
             ev.get("details", {}).get("player") == callsign)
        )
        if is_kill:
            streak += 1
            best_streak = max(best_streak, streak)
        elif is_death:
            streak = 0

    return {
        "kills": kills,
        "deaths": deaths,
        "kd_ratio": round(kills / max(deaths, 1), 2),
        "best_kill_streak": best_streak,
    }


async def _faction_info(user_id: str) -> dict:
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


@router.get("/me")
async def my_stats(request: Request):
    user = await get_current_user(request)
    callsign = user.get("callsign", "")
    uid = user["_id"]

    session_data = await _session_stats(callsign)
    combat_data = await _combat_stats(callsign)
    faction_data = await _faction_info(uid)

    inv = await db.player_inventory.find_one({"user_id": uid}, {"_id": 0, "items": 1})
    items_count = len(inv.get("items", [])) if inv else 0

    events_count = await db.events.count_documents({
        "$or": [
            {"players": callsign},
            {"details.killer": callsign},
            {"details.victim": callsign},
            {"details.player": callsign},
        ]
    })

    # Most active hours (from sessions)
    hour_counts = {}
    sessions = await db.player_sessions.find(
        {"name": callsign}, {"_id": 0, "joined_at": 1, "connected_at": 1}
    ).to_list(200)
    for s in sessions:
        ts = s.get("joined_at") or s.get("connected_at")
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                h = dt.hour
                hour_counts[h] = hour_counts.get(h, 0) + 1
            except Exception:
                pass
    most_active_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    most_active_hours = [{"hour": h, "sessions": c} for h, c in most_active_hours]

    return {
        "callsign": callsign,
        **faction_data,
        **combat_data,
        **session_data,
        "events_logged": events_count,
        "items_in_inventory": items_count,
        "most_active_hours": most_active_hours,
    }


@router.get("/leaderboard")
async def leaderboard(request: Request, limit: int = 10):
    await get_current_user(request)
    limit = max(1, min(limit, 50))

    # Kills leaderboard
    kills_pipeline = [
        {"$match": {"type": "player_kill"}},
        {"$group": {"_id": "$details.killer", "kill_count": {"$sum": 1}}},
        {"$match": {"_id": {"$ne": None}}},
        {"$sort": {"kill_count": -1}},
        {"$limit": limit},
    ]
    kills_data = await db.events.aggregate(kills_pipeline).to_list(limit)

    # Deaths per player for K/D
    deaths_pipeline = [
        {"$match": {"type": "player_death"}},
        {"$group": {"_id": {"$ifNull": ["$details.victim", "$details.player"]}, "death_count": {"$sum": 1}}},
    ]
    deaths_map = {}
    async for d in db.events.aggregate(deaths_pipeline):
        if d["_id"]:
            deaths_map[d["_id"]] = d["death_count"]

    by_kills = []
    for i, k in enumerate(kills_data):
        callsign = k["_id"] or "Unknown"
        deaths = deaths_map.get(callsign, 0)
        by_kills.append({
            "rank": i + 1,
            "callsign": callsign,
            "kill_count": k["kill_count"],
            "death_count": deaths,
            "kd_ratio": round(k["kill_count"] / max(deaths, 1), 2),
        })

    # Playtime leaderboard from sessions
    all_names = await db.player_sessions.distinct("name")
    playtime_list = []
    for name in all_names[:100]:
        sessions = await db.player_sessions.find(
            {"name": name}, {"_id": 0, "joined_at": 1, "connected_at": 1, "last_seen": 1}
        ).to_list(200)
        total_min = 0
        for s in sessions:
            start = s.get("joined_at") or s.get("connected_at")
            end = s.get("last_seen")
            if start and end:
                try:
                    t0 = datetime.fromisoformat(start.replace("Z", "+00:00"))
                    t1 = datetime.fromisoformat(end.replace("Z", "+00:00"))
                    delta = (t1 - t0).total_seconds() / 60
                    if 0 < delta < 1440:
                        total_min += delta
                except Exception:
                    pass
        playtime_list.append({"callsign": name, "total_playtime_hours": round(total_min / 60, 1)})

    playtime_list.sort(key=lambda x: x["total_playtime_hours"], reverse=True)
    by_playtime = [
        {"rank": i + 1, **p} for i, p in enumerate(playtime_list[:limit])
    ]

    # K/D leaderboard (min 3 kills)
    kd_list = [k for k in by_kills if k["kill_count"] >= 3]
    kd_list.sort(key=lambda x: x["kd_ratio"], reverse=True)
    by_kd = [{"rank": i + 1, **{k: v for k, v in p.items() if k != "rank"}} for i, p in enumerate(kd_list[:limit])]

    return {
        "by_kills": by_kills,
        "by_playtime": by_playtime,
        "by_kd": by_kd,
    }


@router.get("/history")
async def activity_history(request: Request, days: int = 7):
    user = await get_current_user(request)
    callsign = user.get("callsign", "")
    days = max(1, min(days, 30))

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    events = await db.events.find(
        {
            "timestamp": {"$gte": cutoff},
            "$or": [
                {"players": callsign},
                {"details.killer": callsign},
                {"details.victim": callsign},
                {"details.player": callsign},
            ]
        },
        {"_id": 0, "type": 1, "timestamp": 1}
    ).to_list(2000)

    buckets = {}
    for i in range(days):
        d = (datetime.now(timezone.utc) - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        buckets[d] = {"date": d, "event_count": 0, "kills": 0, "deaths": 0}

    for ev in events:
        ts = ev.get("timestamp", "")[:10]
        if ts in buckets:
            buckets[ts]["event_count"] += 1
            if ev.get("type") == "player_kill":
                buckets[ts]["kills"] += 1
            elif ev.get("type") == "player_death":
                buckets[ts]["deaths"] += 1

    return {
        "callsign": callsign,
        "days": days,
        "history": list(buckets.values()),
    }


def init_stats_routes(database, auth_fn):
    global db, get_current_user
    db = database
    get_current_user = auth_fn
    return router
