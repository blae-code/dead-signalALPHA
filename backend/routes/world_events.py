"""
World Event Composer (GM)
=========================
Compose and fire a complete world event in one GM action:
  1. Pick an event template or define custom parameters
  2. Optionally configure location / intensity / affected zone
  3. Write an optional narrative announcement
  4. Execute: RCON command + WebSocket broadcast + AI narrative + GM log

Collection: world_event_templates
Document schema:
  {
    template_id:  str  (UUID4)
    name:         str  (max 80)
    description:  str  (max 300)
    event_type:   str  ("airdrop" | "horde" | "weather" | "npc_spawn" | "custom")
    rcon_command: str  (max 500, template vars: {location}, {intensity})
    narrative:    str  (max 500, broadcast narrative text)
    defaults:     { location: str, intensity: int }
    created_by:   str  (callsign)
    created_at:   ISO8601
    use_count:    int
  }

Fire request shape (POST /api/gm/world-events/fire):
  {
    template_id:   str | null        (null = ad-hoc, requires all fields)
    event_type:    str
    label:         str               (short display name, e.g. "Airdrop Grid C7")
    rcon_command:  str | null        (skip RCON if null)
    narrative:     str | null        (skip AI broadcast if null)
    location:      str | null
    intensity:     int               (1-10)
    broadcast_msg: str | null        (direct WS broadcast to all players)
  }

WebSocket broadcast emitted after fire:
  { type: "world_event", data: { label, event_type, location, intensity, fired_by, timestamp } }
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gm/world-events", tags=["gm", "world-events"])

db = None
get_current_user = None
require_admin = None
ptero = None
ws_manager = None

EVENT_TYPES = {"airdrop", "horde", "weather", "npc_spawn", "custom"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class FireEventInput(BaseModel):
    template_id:   Optional[str] = None
    event_type:    str = "custom"
    label:         str
    rcon_command:  Optional[str] = None
    narrative:     Optional[str] = None
    broadcast_msg: Optional[str] = None
    location:      Optional[str] = None
    intensity:     int = 5

class TemplateInput(BaseModel):
    name:         str
    description:  str = ""
    event_type:   str = "custom"
    rcon_command: str = ""
    narrative:    str = ""
    defaults:     dict = {}

class TemplateUpdate(BaseModel):
    name:         Optional[str] = None
    description:  Optional[str] = None
    rcon_command: Optional[str] = None
    narrative:    Optional[str] = None
    defaults:     Optional[dict] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

async def _log_action(callsign: str, action: str, details: dict):
    await db.gm_action_log.insert_one({
        "callsign":   callsign,
        "action":     action,
        "details":    details,
        "timestamp":  _now(),
    })


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/fire")
async def fire_world_event(data: FireEventInput, request: Request):
    """
    Fire a world event. Executes all configured actions atomically:
      1. Substitute template variables into rcon_command
      2. Send RCON command via Pterodactyl if rcon_command is set
      3. Broadcast event notification over WebSocket
      4. Send broadcast_msg via RCON say command if provided
      5. Log the action in gm_action_log

    TODO: If narrative is provided, call AI narrator to generate
          a dramatic announcement and send it as a narration WS broadcast.
          Use: narrator.narrate_event({ type: data.event_type, raw: data.narrative })
    """
    user = await require_admin(request)
    callsign = user.get("callsign", "GM")

    if data.event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"event_type must be one of {EVENT_TYPES}")
    if not 1 <= data.intensity <= 10:
        raise HTTPException(status_code=400, detail="intensity must be 1–10")

    label = data.label.strip()[:120]
    errors = []

    # 1. Resolve template if provided
    template = None
    if data.template_id:
        template = await db.world_event_templates.find_one({"template_id": data.template_id})
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        await db.world_event_templates.update_one(
            {"template_id": data.template_id}, {"$inc": {"use_count": 1}}
        )

    # 2. Build and send RCON command
    rcon_cmd = (data.rcon_command or (template or {}).get("rcon_command", "") or "").strip()
    if rcon_cmd and ptero:
        # Substitute template variables
        rcon_cmd = rcon_cmd.replace("{location}", data.location or "").replace("{intensity}", str(data.intensity))
        try:
            await ptero.send_command(rcon_cmd)
        except Exception as e:
            logger.error("World event RCON failed: %s", e)
            errors.append(f"RCON: {e}")

    # 3. Broadcast player-visible announcement via RCON say
    if data.broadcast_msg and ptero:
        try:
            safe_msg = data.broadcast_msg.strip()[:240].replace("\n", " ")
            await ptero.send_command(f"say [EVENT] {safe_msg}")
        except Exception as e:
            errors.append(f"Broadcast: {e}")

    # 4. WebSocket event notification to all connected dashboard clients
    event_payload = {
        "label":      label,
        "event_type": data.event_type,
        "location":   data.location,
        "intensity":  data.intensity,
        "fired_by":   callsign,
        "timestamp":  _now(),
    }
    if ws_manager:
        await ws_manager.broadcast({"type": "world_event", "data": event_payload})

    # 5. TODO: Narrative AI broadcast
    # if data.narrative and narrator:
    #     narration = await narrator.narrate_event({
    #         "type": data.event_type,
    #         "raw": data.narrative,
    #         "summary": label,
    #     })
    #     if ws_manager:
    #         await ws_manager.broadcast({"type": "narration", "data": {"text": narration}})

    await _log_action(callsign, "world_event_fire", {
        "label": label, "event_type": data.event_type,
        "rcon_sent": bool(rcon_cmd), "intensity": data.intensity,
    })

    return {
        "message": f"World event fired: {label}",
        "event":   event_payload,
        "errors":  errors,
    }


@router.get("/templates")
async def list_templates(request: Request):
    """List all saved world event templates."""
    await require_admin(request)
    templates = (
        await db.world_event_templates
        .find({}, {"_id": 0})
        .sort("use_count", -1)
        .to_list(100)
    )
    return templates


@router.post("/templates")
async def create_template(data: TemplateInput, request: Request):
    """Save a new world event template for reuse."""
    user = await require_admin(request)

    if data.event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid event_type")

    template = {
        "template_id":  str(uuid.uuid4()),
        "name":         data.name.strip()[:80],
        "description":  data.description.strip()[:300],
        "event_type":   data.event_type,
        "rcon_command": data.rcon_command.strip()[:500],
        "narrative":    data.narrative.strip()[:500],
        "defaults":     data.defaults,
        "created_by":   user.get("callsign", "GM"),
        "created_at":   _now(),
        "use_count":    0,
    }
    await db.world_event_templates.insert_one(template)
    template.pop("_id", None)
    return template


@router.patch("/templates/{template_id}")
async def update_template(template_id: str, data: TemplateUpdate, request: Request):
    """Update a world event template."""
    await require_admin(request)
    doc = await db.world_event_templates.find_one({"template_id": template_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")

    update: dict = {}
    if data.name         is not None: update["name"]         = data.name.strip()[:80]
    if data.description  is not None: update["description"]  = data.description.strip()[:300]
    if data.rcon_command is not None: update["rcon_command"] = data.rcon_command.strip()[:500]
    if data.narrative    is not None: update["narrative"]    = data.narrative.strip()[:500]
    if data.defaults     is not None: update["defaults"]     = data.defaults

    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.world_event_templates.update_one({"template_id": template_id}, {"$set": update})
    return {"message": "Template updated"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, request: Request):
    """Delete a world event template."""
    await require_admin(request)
    result = await db.world_event_templates.delete_one({"template_id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_world_events_routes(database, auth_fn, admin_fn, ptero_client=None, broadcast_manager=None):
    global db, get_current_user, require_admin, ptero, ws_manager
    db = database
    get_current_user = auth_fn
    require_admin = admin_fn
    ptero = ptero_client
    ws_manager = broadcast_manager
    return router
