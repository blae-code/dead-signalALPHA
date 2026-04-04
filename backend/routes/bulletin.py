"""
Faction Bulletin Board
======================
In-faction posts: announcements, strategy notes, pinned intel.

Collection: faction_posts
Document schema:
  {
    post_id:        str  (UUID4)
    faction_id:     str
    author_id:      str  (user _id)
    author_callsign: str
    title:          str  (max 120)
    body:           str  (max 2000)
    category:       str  ("general" | "strategy" | "intel" | "alert")
    pinned:         bool
    pinned_by:      str | null  (callsign)
    created_at:     ISO8601
    updated_at:     ISO8601
    edited:         bool
  }

WebSocket broadcast types emitted:
  { type: "bulletin_post",    data: <post doc> }
  { type: "bulletin_delete",  data: { post_id, faction_id } }
  { type: "bulletin_pin",     data: { post_id, faction_id, pinned } }
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bulletin", tags=["bulletin"])

db = None
get_current_user = None
ws_manager = None

CATEGORIES = {"general", "strategy", "intel", "alert"}
OFFICER_ROLES = {"leader", "officer"}


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class PostInput(BaseModel):
    title: str
    body: str
    category: str = "general"

class PostUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _require_member(user_id: str, faction_id: str) -> dict:
    """Raise 403 if user is not an active member of faction_id. Returns membership doc."""
    membership = await db.faction_members.find_one(
        {"user_id": user_id, "faction_id": faction_id, "status": "active"}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this faction")
    return membership

async def _require_officer(user_id: str, faction_id: str) -> dict:
    """Raise 403 if user is not a leader or officer of faction_id."""
    membership = await _require_member(user_id, faction_id)
    if membership.get("role") not in OFFICER_ROLES:
        raise HTTPException(status_code=403, detail="Officer or leader rank required")
    return membership

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/posts")
async def list_posts(request: Request, faction_id: str, limit: int = 50):
    """
    List bulletin posts for a faction (newest first).
    Caller must be an active member of the faction.

    TODO: Also allow public posts to be visible to non-members if faction is public.
    """
    user = await get_current_user(request)
    await _require_member(user["_id"], faction_id)

    posts = (
        await db.faction_posts
        .find({"faction_id": faction_id}, {"_id": 0})
        .sort([("pinned", -1), ("created_at", -1)])
        .limit(max(1, min(limit, 100)))
        .to_list(100)
    )
    return posts


@router.post("/posts")
async def create_post(data: PostInput, request: Request):
    """
    Create a bulletin post in the caller's current faction.

    TODO: Optionally accept an explicit faction_id so officers can post on behalf
          of a faction they lead (useful for multi-faction GMs).
    """
    user = await get_current_user(request)
    uid = user["_id"]

    # Resolve caller's active faction
    membership = await db.faction_members.find_one(
        {"user_id": uid, "status": "active"}, {"_id": 0}
    )
    if not membership:
        raise HTTPException(status_code=400, detail="You must be in a faction to post")

    faction_id = membership["faction_id"]

    # Validate
    title = data.title.strip()[:120]
    body = data.body.strip()[:2000]
    if not title or not body:
        raise HTTPException(status_code=400, detail="Title and body are required")
    if data.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of {CATEGORIES}")

    now = _now()
    post = {
        "post_id":         str(uuid.uuid4()),
        "faction_id":      faction_id,
        "author_id":       uid,
        "author_callsign": user.get("callsign", "Unknown"),
        "title":           title,
        "body":            body,
        "category":        data.category,
        "pinned":          False,
        "pinned_by":       None,
        "created_at":      now,
        "updated_at":      now,
        "edited":          False,
    }
    await db.faction_posts.insert_one(post)
    post.pop("_id", None)

    if ws_manager:
        await ws_manager.broadcast({"type": "bulletin_post", "data": post})

    return post


@router.patch("/posts/{post_id}")
async def update_post(post_id: str, data: PostUpdate, request: Request):
    """
    Edit a bulletin post. Only the original author may edit.

    TODO: Allow officers to edit any post in their faction.
    """
    user = await get_current_user(request)

    post = await db.faction_posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post["author_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own posts")

    update: dict = {"updated_at": _now(), "edited": True}
    if data.title is not None:
        update["title"] = data.title.strip()[:120]
    if data.body is not None:
        update["body"] = data.body.strip()[:2000]
    if data.category is not None:
        if data.category not in CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category")
        update["category"] = data.category

    await db.faction_posts.update_one({"post_id": post_id}, {"$set": update})
    return {"message": "Post updated"}


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, request: Request):
    """
    Delete a bulletin post. Author may delete their own; officers may delete any in faction.
    """
    user = await get_current_user(request)

    post = await db.faction_posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    faction_id = post["faction_id"]
    is_author = post["author_id"] == user["_id"]

    if not is_author:
        # Must be officer+ in the faction to delete others' posts
        await _require_officer(user["_id"], faction_id)

    await db.faction_posts.delete_one({"post_id": post_id})

    if ws_manager:
        await ws_manager.broadcast({
            "type": "bulletin_delete",
            "data": {"post_id": post_id, "faction_id": faction_id},
        })

    return {"message": "Post deleted"}


@router.post("/posts/{post_id}/pin")
async def toggle_pin(post_id: str, request: Request):
    """Toggle pinned status on a post. Officer+ only."""
    user = await get_current_user(request)

    post = await db.faction_posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    await _require_officer(user["_id"], post["faction_id"])

    new_pinned = not post.get("pinned", False)
    await db.faction_posts.update_one(
        {"post_id": post_id},
        {"$set": {
            "pinned":    new_pinned,
            "pinned_by": user.get("callsign") if new_pinned else None,
            "updated_at": _now(),
        }},
    )

    if ws_manager:
        await ws_manager.broadcast({
            "type": "bulletin_pin",
            "data": {"post_id": post_id, "faction_id": post["faction_id"], "pinned": new_pinned},
        })

    return {"message": "Pinned" if new_pinned else "Unpinned", "pinned": new_pinned}


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_bulletin_routes(database, auth_fn, broadcast_manager=None):
    global db, get_current_user, ws_manager
    db = database
    get_current_user = auth_fn
    ws_manager = broadcast_manager
    return router
