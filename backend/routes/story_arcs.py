"""
Narrative Story Arc Scheduler (GM)
===================================
A story arc is a sequence of timed narrative beats that unfold automatically
after the arc is started. Each step fires after a configurable delay.

Step action types:
  "broadcast"          → send RCON say command (params: { message })
  "rcon_command"       → raw RCON command (params: { command })
  "narrative_dispatch" → trigger AI narrator for a prompt (params: { prompt })
  "gm_broadcast"       → WebSocket gm_broadcast to dashboard (params: { message })
  "world_override"     → change world conditions (params: { weather?, time_of_day?, danger_level? })

Collection: story_arcs
Document schema:
  {
    arc_id:       str  (UUID4)
    name:         str  (max 100)
    description:  str  (max 500)
    status:       str  ("draft" | "active" | "paused" | "complete" | "aborted")
    steps: [
      {
        step_id:      str  (UUID4)
        order:        int  (execution order, 0-indexed)
        delay_minutes: float  (delay from arc start OR previous step, depending on mode)
        action_type:  str
        params:       dict
        label:        str  (display name, e.g. "Day 7 warning")
        status:       str  ("pending" | "fired" | "skipped" | "failed")
        scheduled_for: ISO8601 | null
        fired_at:     ISO8601 | null
        error:        str | null
      }
    ]
    timing_mode:  str  ("from_start" | "sequential")
      - "from_start":   each step fires delay_minutes after arc was started
      - "sequential":   each step fires delay_minutes after the previous step fired
    created_by:   str
    created_at:   ISO8601
    started_at:   ISO8601 | null
    completed_at: ISO8601 | null
    next_step_at: ISO8601 | null   (when the next pending step should fire)
  }

Execution:
  The scheduler (scheduler.py) must be extended to poll story arcs:
    - On each tick, check for story_arcs where status="active" AND next_step_at <= now
    - Fire the due step, update its status, compute next_step_at for the following step
    - If no more pending steps, set arc status="complete"

  TODO: Add _check_story_arcs() to Scheduler.run() loop in scheduler.py.
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gm/story-arcs", tags=["gm", "story-arcs"])

db = None
require_admin = None
ws_manager = None

STEP_ACTION_TYPES = {"broadcast", "rcon_command", "narrative_dispatch", "gm_broadcast", "world_override"}
ARC_STATUSES      = {"draft", "active", "paused", "complete", "aborted"}
TIMING_MODES      = {"from_start", "sequential"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class StepInput(BaseModel):
    order:          int
    delay_minutes:  float
    action_type:    str
    params:         dict = {}
    label:          str = ""

class ArcInput(BaseModel):
    name:         str
    description:  str = ""
    timing_mode:  str = "sequential"
    steps:        List[StepInput] = []

class ArcUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    timing_mode: Optional[str] = None
    steps:       Optional[List[StepInput]] = None   # Full replace of steps (draft only)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _build_steps(steps_input: List[StepInput]) -> list:
    return [
        {
            "step_id":       str(uuid.uuid4()),
            "order":         s.order,
            "delay_minutes": max(0.0, s.delay_minutes),
            "action_type":   s.action_type,
            "params":        s.params,
            "label":         s.label.strip()[:100],
            "status":        "pending",
            "scheduled_for": None,
            "fired_at":      None,
            "error":         None,
        }
        for s in sorted(steps_input, key=lambda x: x.order)
        if s.action_type in STEP_ACTION_TYPES
    ]

def _compute_next_step_at(arc: dict, started_at: datetime) -> Optional[str]:
    """
    Compute when the next pending step should fire based on timing_mode.
    Returns ISO8601 string or None if no pending steps remain.
    """
    pending = [s for s in arc.get("steps", []) if s["status"] == "pending"]
    if not pending:
        return None

    next_step = pending[0]
    mode = arc.get("timing_mode", "sequential")

    if mode == "from_start":
        fire_at = started_at + timedelta(minutes=next_step["delay_minutes"])
    else:  # sequential
        # Find the last fired step
        fired = [s for s in arc.get("steps", []) if s["status"] == "fired" and s["fired_at"]]
        if fired:
            last_fired_at = datetime.fromisoformat(fired[-1]["fired_at"].replace("Z", "+00:00"))
            fire_at = last_fired_at + timedelta(minutes=next_step["delay_minutes"])
        else:
            fire_at = started_at + timedelta(minutes=next_step["delay_minutes"])

    return fire_at.isoformat()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
async def list_arcs(request: Request, status: Optional[str] = None):
    """List all story arcs, optionally filtered by status."""
    await require_admin(request)
    query = {}
    if status and status in ARC_STATUSES:
        query["status"] = status
    arcs = (
        await db.story_arcs
        .find(query, {"_id": 0})
        .sort("created_at", -1)
        .to_list(100)
    )
    return arcs


@router.post("/")
async def create_arc(data: ArcInput, request: Request):
    """Create a new story arc (starts in draft status)."""
    user = await require_admin(request)

    if data.timing_mode not in TIMING_MODES:
        raise HTTPException(status_code=400, detail=f"timing_mode must be one of {TIMING_MODES}")

    steps = _build_steps(data.steps)
    arc = {
        "arc_id":       str(uuid.uuid4()),
        "name":         data.name.strip()[:100],
        "description":  data.description.strip()[:500],
        "status":       "draft",
        "timing_mode":  data.timing_mode,
        "steps":        steps,
        "created_by":   user.get("callsign", "GM"),
        "created_at":   _now(),
        "started_at":   None,
        "completed_at": None,
        "next_step_at": None,
    }
    await db.story_arcs.insert_one(arc)
    arc.pop("_id", None)
    return arc


@router.get("/{arc_id}")
async def get_arc(arc_id: str, request: Request):
    await require_admin(request)
    arc = await db.story_arcs.find_one({"arc_id": arc_id}, {"_id": 0})
    if not arc:
        raise HTTPException(status_code=404, detail="Arc not found")
    return arc


@router.patch("/{arc_id}")
async def update_arc(arc_id: str, data: ArcUpdate, request: Request):
    """Update arc metadata or steps. Steps can only be replaced while arc is in draft."""
    await require_admin(request)
    arc = await db.story_arcs.find_one({"arc_id": arc_id})
    if not arc:
        raise HTTPException(status_code=404, detail="Arc not found")

    update: dict = {}
    if data.name        is not None: update["name"]        = data.name.strip()[:100]
    if data.description is not None: update["description"] = data.description.strip()[:500]
    if data.timing_mode is not None:
        if data.timing_mode not in TIMING_MODES:
            raise HTTPException(status_code=400, detail="Invalid timing_mode")
        update["timing_mode"] = data.timing_mode
    if data.steps is not None:
        if arc["status"] != "draft":
            raise HTTPException(status_code=400, detail="Steps can only be replaced while arc is in draft")
        update["steps"] = _build_steps(data.steps)

    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.story_arcs.update_one({"arc_id": arc_id}, {"$set": update})
    return {"message": "Arc updated"}


@router.post("/{arc_id}/start")
async def start_arc(arc_id: str, request: Request):
    """
    Activate a draft arc. Computes next_step_at for the first step.
    The scheduler will pick it up on next tick.
    """
    await require_admin(request)
    arc = await db.story_arcs.find_one({"arc_id": arc_id})
    if not arc:
        raise HTTPException(status_code=404, detail="Arc not found")
    if arc["status"] not in ("draft", "paused"):
        raise HTTPException(status_code=400, detail=f"Cannot start arc with status '{arc['status']}'")
    if not arc.get("steps"):
        raise HTTPException(status_code=400, detail="Arc has no steps")

    now = datetime.now(timezone.utc)
    next_step_at = _compute_next_step_at(arc, now)

    await db.story_arcs.update_one(
        {"arc_id": arc_id},
        {"$set": {"status": "active", "started_at": now.isoformat(), "next_step_at": next_step_at}},
    )

    if ws_manager:
        await ws_manager.broadcast({
            "type": "story_arc_update",
            "data": {"arc_id": arc_id, "status": "active", "name": arc["name"]},
        })

    return {"message": "Arc activated", "next_step_at": next_step_at}


@router.post("/{arc_id}/pause")
async def pause_arc(arc_id: str, request: Request):
    """Pause an active arc. Steps will not fire while paused."""
    await require_admin(request)
    arc = await db.story_arcs.find_one({"arc_id": arc_id})
    if not arc or arc["status"] != "active":
        raise HTTPException(status_code=400, detail="Arc must be active to pause")
    await db.story_arcs.update_one({"arc_id": arc_id}, {"$set": {"status": "paused"}})
    return {"message": "Arc paused"}


@router.post("/{arc_id}/abort")
async def abort_arc(arc_id: str, request: Request):
    """Abort an arc. All remaining steps are skipped."""
    await require_admin(request)
    arc = await db.story_arcs.find_one({"arc_id": arc_id})
    if not arc:
        raise HTTPException(status_code=404, detail="Arc not found")
    if arc["status"] in ("complete", "aborted"):
        raise HTTPException(status_code=400, detail="Arc already finished")

    # Mark all pending steps as skipped
    steps = arc.get("steps", [])
    for s in steps:
        if s["status"] == "pending":
            s["status"] = "skipped"

    await db.story_arcs.update_one(
        {"arc_id": arc_id},
        {"$set": {"status": "aborted", "steps": steps, "completed_at": _now()}},
    )
    return {"message": "Arc aborted"}


@router.delete("/{arc_id}")
async def delete_arc(arc_id: str, request: Request):
    """Delete an arc. Only draft or complete/aborted arcs may be deleted."""
    await require_admin(request)
    arc = await db.story_arcs.find_one({"arc_id": arc_id})
    if not arc:
        raise HTTPException(status_code=404, detail="Arc not found")
    if arc["status"] in ("active", "paused"):
        raise HTTPException(status_code=400, detail="Abort the arc before deleting")
    await db.story_arcs.delete_one({"arc_id": arc_id})
    return {"message": "Arc deleted"}


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_story_arc_routes(database, admin_fn, broadcast_manager=None):
    global db, require_admin, ws_manager
    db = database
    require_admin = admin_fn
    ws_manager = broadcast_manager
    return router
