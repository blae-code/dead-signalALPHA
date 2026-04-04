"""
Faction Chat
============
Real-time text chat per faction, riding the existing WebSocket infrastructure.

Because ws_manager broadcasts to ALL connected clients, messages carry a
faction_id field and the frontend filters to only display messages for the
user's own faction. This is adequate for a small-to-medium player count.

For larger deployments or privacy requirements, consider adding per-user
WebSocket rooms to ConnectionManager (store { ws, user_id, faction_id } tuples
and add a broadcast_to_faction(faction_id, msg) method).

Collection: faction_messages
Document schema:
  {
    message_id:     str  (UUID4)
    faction_id:     str
    author_id:      str
    author_callsign: str
    content:        str  (max 500)
    message_type:   str  ("text" | "system" | "alert")
    created_at:     ISO8601
  }

WebSocket broadcast type emitted:
  { type: "faction_message", data: <message doc> }

Frontend receiver (add to useServerWebSocket.js):
  case 'faction_message':
    if (msg.data.faction_id === currentUser.faction_id) {
      setChatMessages(prev => [...prev, msg.data].slice(-100));
    }
    break;
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

db = None
get_current_user = None
ws_manager = None

OFFICER_ROLES = {"leader", "officer"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class MessageInput(BaseModel):
    content: str

class SystemMessageInput(BaseModel):
    """Used internally to post system/alert messages (e.g. faction events)."""
    faction_id: str
    content: str
    message_type: str = "system"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

async def _require_member(user_id: str, faction_id: str) -> dict:
    membership = await db.faction_members.find_one(
        {"user_id": user_id, "faction_id": faction_id, "status": "active"}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this faction")
    return membership


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/messages")
async def get_messages(request: Request, faction_id: str, limit: int = 50):
    """
    Fetch recent chat messages for a faction (newest last for display).
    Caller must be an active faction member.
    """
    user = await get_current_user(request)
    await _require_member(user["_id"], faction_id)

    messages = (
        await db.faction_messages
        .find({"faction_id": faction_id}, {"_id": 0})
        .sort("created_at", -1)
        .limit(max(1, min(limit, 100)))
        .to_list(100)
    )
    return list(reversed(messages))   # Return chronological order


@router.post("/messages")
async def send_message(data: MessageInput, request: Request):
    """
    Send a chat message to the caller's current faction.
    The message is persisted and broadcast over WebSocket.

    Rate limiting TODO: prevent message spam (max ~1 message/second per user).
    Consider storing last_message_at in the membership doc and rejecting
    if less than 1s has passed.
    """
    user = await get_current_user(request)
    uid = user["_id"]

    membership = await db.faction_members.find_one(
        {"user_id": uid, "status": "active"}, {"_id": 0}
    )
    if not membership:
        raise HTTPException(status_code=400, detail="You must be in a faction to chat")

    faction_id = membership["faction_id"]
    content = data.content.strip()[:500]
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    msg_doc = {
        "message_id":     str(uuid.uuid4()),
        "faction_id":     faction_id,
        "author_id":      uid,
        "author_callsign": user.get("callsign", "Unknown"),
        "content":        content,
        "message_type":   "text",
        "created_at":     _now(),
    }
    await db.faction_messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)

    if ws_manager:
        await ws_manager.broadcast({"type": "faction_message", "data": msg_doc})

    return msg_doc


@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, request: Request):
    """
    Delete a message. Author may delete their own.
    Officers may delete any message in their faction.
    """
    user = await get_current_user(request)
    msg = await db.faction_messages.find_one({"message_id": message_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    is_author = msg["author_id"] == user["_id"]
    if not is_author:
        membership = await db.faction_members.find_one(
            {"user_id": user["_id"], "faction_id": msg["faction_id"], "status": "active"}
        )
        if not membership or membership.get("role") not in OFFICER_ROLES:
            raise HTTPException(status_code=403, detail="Cannot delete others' messages")

    await db.faction_messages.delete_one({"message_id": message_id})

    if ws_manager:
        await ws_manager.broadcast({
            "type": "faction_message_delete",
            "data": {"message_id": message_id, "faction_id": msg["faction_id"]},
        })

    return {"message": "Deleted"}


# ---------------------------------------------------------------------------
# Internal helper called by other routes (e.g. faction events)
# ---------------------------------------------------------------------------

async def post_system_message(faction_id: str, content: str, message_type: str = "system"):
    """
    Post an automated system message to a faction channel.
    Call this from faction route handlers when notable events occur, e.g.:
      - Member joined/left
      - Diplomacy treaty accepted
      - Territory claimed

    Example usage in routes/factions.py:
      from routes.faction_chat import post_system_message
      await post_system_message(faction_id, f"{callsign} joined the faction.")
    """
    if db is None:
        return
    msg_doc = {
        "message_id":      str(uuid.uuid4()),
        "faction_id":      faction_id,
        "author_id":       "system",
        "author_callsign": "SYSTEM",
        "content":         content[:500],
        "message_type":    message_type,
        "created_at":      _now(),
    }
    await db.faction_messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)
    if ws_manager:
        await ws_manager.broadcast({"type": "faction_message", "data": msg_doc})


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_chat_routes(database, auth_fn, broadcast_manager=None):
    global db, get_current_user, ws_manager
    db = database
    get_current_user = auth_fn
    ws_manager = broadcast_manager
    return router
