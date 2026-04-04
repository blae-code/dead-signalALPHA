"""
Loot & Airdrop Tracker
=======================
Shared map markers for airdrops, loot caches, resources, and points of interest.
Complements the inventory caches system — markers are map-visible breadcrumbs,
not storage containers.

Collection: loot_markers
Document schema:
  {
    marker_id:     str  (UUID4)
    type:          str  ("airdrop" | "cache" | "resource" | "poi" | "danger")
    label:         str  (max 60)  e.g. "Airdrop C7", "Military Loot", "Horde Nest"
    description:   str  (max 300)
    grid_x:        int | null
    grid_y:        int | null
    location_name: str  (max 80)  e.g. "Navezgane", "Preplaced Prison"
    status:        str  ("active" | "looted" | "expired" | "danger")
    visibility:    str  ("private" | "faction" | "public")
    reported_by:   str  (callsign)
    owner_id:      str  (user _id)
    faction_id:    str | null
    expires_at:    ISO8601 | null   (null = no expiry)
    looted_by:     str | null       (callsign of who looted it)
    looted_at:     ISO8601 | null
    created_at:    ISO8601
    updated_at:    ISO8601
  }

Marker types and their recommended icons on the frontend:
  airdrop  → Package (amber pulse)
  cache    → Archive
  resource → Boxes
  poi      → MapPin
  danger   → AlertTriangle (red)

WebSocket broadcast types emitted:
  { type: "loot_marker_new",    data: <marker doc> }
  { type: "loot_marker_update", data: <marker doc> }
  { type: "loot_marker_delete", data: { marker_id } }
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/loot", tags=["loot"])

db = None
get_current_user = None
ws_manager = None

MARKER_TYPES   = {"airdrop", "cache", "resource", "poi", "danger"}
MARKER_STATUSES = {"active", "looted", "expired", "danger"}
VISIBILITIES   = {"private", "faction", "public"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class MarkerInput(BaseModel):
    type: str
    label: str
    description: str = ""
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    location_name: str = ""
    visibility: str = "faction"
    expires_at: Optional[str] = None   # ISO8601 or null

class MarkerUpdate(BaseModel):
    label:         Optional[str] = None
    description:   Optional[str] = None
    grid_x:        Optional[int] = None
    grid_y:        Optional[int] = None
    location_name: Optional[str] = None
    status:        Optional[str] = None
    visibility:    Optional[str] = None
    expires_at:    Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

async def _get_faction_id(user_id: str) -> Optional[str]:
    m = await db.faction_members.find_one(
        {"user_id": user_id, "status": "active"}, {"_id": 0, "faction_id": 1}
    )
    return m["faction_id"] if m else None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/markers")
async def list_markers(
    request: Request,
    type: Optional[str] = None,
    status: str = "active",
    limit: int = 100,
):
    """
    Return visible loot markers for the current user.
    Visibility rules:
      - "public" markers visible to all authenticated users
      - "faction" markers visible to members of the same faction
      - "private" markers visible only to owner

    TODO: Apply proper visibility filter combining all three rules.
          Currently returns all markers — implement the query filter below.
    """
    user = await get_current_user(request)
    uid = user["_id"]
    faction_id = await _get_faction_id(uid)

    # TODO: build compound visibility query
    # query = {
    #   "$or": [
    #     { "visibility": "public" },
    #     { "visibility": "faction", "faction_id": faction_id },
    #     { "visibility": "private", "owner_id": uid },
    #   ]
    # }
    # if status: query["status"] = status
    # if type and type in MARKER_TYPES: query["type"] = type

    query: dict = {}
    if status:
        query["status"] = status
    if type and type in MARKER_TYPES:
        query["type"] = type

    markers = (
        await db.loot_markers
        .find(query, {"_id": 0})
        .sort("created_at", -1)
        .limit(max(1, min(limit, 200)))
        .to_list(200)
    )
    return markers


@router.post("/markers")
async def create_marker(data: MarkerInput, request: Request):
    """Report a new loot marker visible to the selected audience."""
    user = await get_current_user(request)
    uid = user["_id"]

    if data.type not in MARKER_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {MARKER_TYPES}")
    if data.visibility not in VISIBILITIES:
        raise HTTPException(status_code=400, detail=f"visibility must be one of {VISIBILITIES}")

    faction_id = await _get_faction_id(uid) if data.visibility == "faction" else None
    if data.visibility == "faction" and not faction_id:
        raise HTTPException(status_code=400, detail="Join a faction to post faction-visible markers")

    now = _now()
    marker = {
        "marker_id":     str(uuid.uuid4()),
        "type":          data.type,
        "label":         data.label.strip()[:60],
        "description":   data.description.strip()[:300],
        "grid_x":        data.grid_x,
        "grid_y":        data.grid_y,
        "location_name": data.location_name.strip()[:80],
        "status":        "active",
        "visibility":    data.visibility,
        "reported_by":   user.get("callsign", "Unknown"),
        "owner_id":      uid,
        "faction_id":    faction_id,
        "expires_at":    data.expires_at,
        "looted_by":     None,
        "looted_at":     None,
        "created_at":    now,
        "updated_at":    now,
    }
    await db.loot_markers.insert_one(marker)
    marker.pop("_id", None)

    if ws_manager:
        await ws_manager.broadcast({"type": "loot_marker_new", "data": marker})

    return marker


@router.patch("/markers/{marker_id}")
async def update_marker(marker_id: str, data: MarkerUpdate, request: Request):
    """Update a marker. Owner only."""
    user = await get_current_user(request)
    doc = await db.loot_markers.find_one({"marker_id": marker_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Marker not found")
    if doc["owner_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Only the reporter can edit this marker")

    update: dict = {"updated_at": _now()}
    if data.label         is not None: update["label"]         = data.label.strip()[:60]
    if data.description   is not None: update["description"]   = data.description.strip()[:300]
    if data.grid_x        is not None: update["grid_x"]        = data.grid_x
    if data.grid_y        is not None: update["grid_y"]        = data.grid_y
    if data.location_name is not None: update["location_name"] = data.location_name.strip()[:80]
    if data.status        is not None:
        if data.status not in MARKER_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status")
        update["status"] = data.status
    if data.visibility is not None:
        if data.visibility not in VISIBILITIES:
            raise HTTPException(status_code=400, detail="Invalid visibility")
        update["visibility"] = data.visibility
    if data.expires_at is not None:
        update["expires_at"] = data.expires_at

    await db.loot_markers.update_one({"marker_id": marker_id}, {"$set": update})
    updated = await db.loot_markers.find_one({"marker_id": marker_id}, {"_id": 0})

    if ws_manager:
        await ws_manager.broadcast({"type": "loot_marker_update", "data": updated})

    return updated


@router.post("/markers/{marker_id}/loot")
async def mark_looted(marker_id: str, request: Request):
    """Mark a marker as looted. Any authenticated user can mark it looted."""
    user = await get_current_user(request)
    doc = await db.loot_markers.find_one({"marker_id": marker_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Marker not found")
    if doc["status"] == "looted":
        raise HTTPException(status_code=400, detail="Already marked as looted")

    now = _now()
    await db.loot_markers.update_one(
        {"marker_id": marker_id},
        {"$set": {"status": "looted", "looted_by": user.get("callsign"), "looted_at": now, "updated_at": now}},
    )
    updated = await db.loot_markers.find_one({"marker_id": marker_id}, {"_id": 0})

    if ws_manager:
        await ws_manager.broadcast({"type": "loot_marker_update", "data": updated})

    return {"message": "Marked as looted", "looted_by": user.get("callsign")}


@router.delete("/markers/{marker_id}")
async def delete_marker(marker_id: str, request: Request):
    """Delete a marker. Owner only."""
    user = await get_current_user(request)
    doc = await db.loot_markers.find_one({"marker_id": marker_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Marker not found")
    if doc["owner_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Only the reporter can delete this marker")

    await db.loot_markers.delete_one({"marker_id": marker_id})

    if ws_manager:
        await ws_manager.broadcast({"type": "loot_marker_delete", "data": {"marker_id": marker_id}})

    return {"message": "Marker deleted"}


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_loot_routes(database, auth_fn, broadcast_manager=None):
    global db, get_current_user, ws_manager
    db = database
    get_current_user = auth_fn
    ws_manager = broadcast_manager
    return router
