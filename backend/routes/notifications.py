"""
Web Push Notifications
======================
Subscribe/unsubscribe to browser push notifications and manage preferences.

SETUP REQUIRED:
  1. Generate VAPID keys:
       pip install pywebpush
       vapid --gen
     Add to backend/.env:
       VAPID_PUBLIC_KEY=<base64url public key>
       VAPID_PRIVATE_KEY=<base64url private key>
       VAPID_EMAIL=mailto:admin@dead-signal.ca

  2. Add pywebpush to requirements.txt:
       pywebpush>=2.0.0

  3. Frontend: register service worker at /public/sw.js (see TODO below)
     and call POST /api/notifications/subscribe with the PushSubscription JSON.

Collection: push_subscriptions
Document schema:
  {
    user_id:      str
    callsign:     str
    subscription: dict  (PushSubscription JSON from browser)
    preferences:  {
      high_events:     bool  (danger/critical severity events)
      faction_alerts:  bool  (faction invites, officer promotions, war declarations)
      gm_broadcasts:   bool  (GM narrative broadcasts)
      server_status:   bool  (server start/stop/crash)
    }
    created_at:   ISO8601
    updated_at:   ISO8601
  }

To send a push from any backend handler:
  from routes.notifications import send_push_to_user, send_push_to_faction
  await send_push_to_user(user_id, title, body, url="/")
  await send_push_to_faction(faction_id, title, body)
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging
import os
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

db = None
get_current_user = None


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SubscribeInput(BaseModel):
    subscription: dict   # Raw PushSubscription JSON from browser

class PreferencesUpdate(BaseModel):
    high_events:    Optional[bool] = None
    faction_alerts: Optional[bool] = None
    gm_broadcasts:  Optional[bool] = None
    server_status:  Optional[bool] = None


# ---------------------------------------------------------------------------
# Push sending helpers (call from other routes)
# ---------------------------------------------------------------------------

def _get_vapid_config() -> dict | None:
    """Return VAPID config dict or None if not configured."""
    pub  = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
    priv = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    mail = os.environ.get("VAPID_EMAIL", "").strip()
    if not all([pub, priv, mail]):
        return None
    return {"public_key": pub, "private_key": priv, "email": mail}


async def _send_push(subscription: dict, title: str, body: str, url: str = "/") -> bool:
    """
    Send a single Web Push notification.

    TODO: implement using pywebpush:
      from pywebpush import webpush, WebPushException
      vapid = _get_vapid_config()
      if not vapid: return False
      payload = json.dumps({"title": title, "body": body, "url": url})
      try:
          webpush(
              subscription_info=subscription,
              data=payload,
              vapid_private_key=vapid["private_key"],
              vapid_claims={"sub": vapid["email"]},
          )
          return True
      except WebPushException as e:
          if e.response and e.response.status_code in (404, 410):
              # Subscription expired — caller should delete it
              raise
          logger.error("Push failed: %s", e)
          return False
    """
    logger.debug("Push stub: %s — %s", title, body)
    return False   # TODO: replace with real implementation


async def send_push_to_user(db_ref, user_id: str, title: str, body: str, url: str = "/"):
    """Send a push notification to all subscriptions for a specific user."""
    sub_docs = await db_ref.push_subscriptions.find(
        {"user_id": user_id}, {"_id": 0, "subscription": 1}
    ).to_list(10)
    for doc in sub_docs:
        try:
            await _send_push(doc["subscription"], title, body, url)
        except Exception:
            # TODO: delete expired subscriptions (410 Gone)
            pass


async def send_push_to_faction(db_ref, faction_id: str, title: str, body: str, url: str = "/"):
    """Send a push to all subscribed members of a faction."""
    members = await db_ref.faction_members.find(
        {"faction_id": faction_id, "status": "active"}, {"_id": 0, "user_id": 1}
    ).to_list(200)
    for m in members:
        await send_push_to_user(db_ref, m["user_id"], title, body, url)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/vapid-key")
async def get_vapid_public_key():
    """
    Return the VAPID public key so the frontend can subscribe.
    This endpoint is intentionally public (no auth) so the SW can fetch it.
    """
    vapid = _get_vapid_config()
    if not vapid:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    return {"public_key": vapid["public_key"]}


@router.post("/subscribe")
async def subscribe(data: SubscribeInput, request: Request):
    """Save or update the caller's push subscription."""
    user = await get_current_user(request)
    uid = user["_id"]

    if not isinstance(data.subscription, dict) or "endpoint" not in data.subscription:
        raise HTTPException(status_code=400, detail="Invalid subscription object")

    now = datetime.now(timezone.utc).isoformat()
    await db.push_subscriptions.update_one(
        {"user_id": uid},
        {"$set": {
            "callsign":     user.get("callsign", ""),
            "subscription": data.subscription,
            "updated_at":   now,
        },
         "$setOnInsert": {
            "preferences": {
                "high_events":    True,
                "faction_alerts": True,
                "gm_broadcasts":  True,
                "server_status":  False,
            },
            "created_at": now,
        }},
        upsert=True,
    )
    return {"message": "Subscribed"}


@router.delete("/subscribe")
async def unsubscribe(request: Request):
    """Remove the caller's push subscription."""
    user = await get_current_user(request)
    await db.push_subscriptions.delete_one({"user_id": user["_id"]})
    return {"message": "Unsubscribed"}


@router.get("/preferences")
async def get_preferences(request: Request):
    """Return the caller's notification preferences, or defaults if not subscribed."""
    user = await get_current_user(request)
    doc = await db.push_subscriptions.find_one(
        {"user_id": user["_id"]}, {"_id": 0, "preferences": 1, "subscription": 1}
    )
    subscribed = bool(doc)
    prefs = doc.get("preferences", {}) if doc else {}
    return {
        "subscribed": subscribed,
        "preferences": {
            "high_events":    prefs.get("high_events", True),
            "faction_alerts": prefs.get("faction_alerts", True),
            "gm_broadcasts":  prefs.get("gm_broadcasts", True),
            "server_status":  prefs.get("server_status", False),
        },
    }


@router.patch("/preferences")
async def update_preferences(data: PreferencesUpdate, request: Request):
    """Update notification preferences for the current user."""
    user = await get_current_user(request)
    update: dict = {}
    if data.high_events    is not None: update["preferences.high_events"]    = data.high_events
    if data.faction_alerts is not None: update["preferences.faction_alerts"] = data.faction_alerts
    if data.gm_broadcasts  is not None: update["preferences.gm_broadcasts"]  = data.gm_broadcasts
    if data.server_status  is not None: update["preferences.server_status"]  = data.server_status

    if not update:
        raise HTTPException(status_code=400, detail="No preferences to update")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.push_subscriptions.update_one(
        {"user_id": user["_id"]}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No subscription found — subscribe first")
    return {"message": "Preferences updated"}


# ---------------------------------------------------------------------------
# Init
# ---------------------------------------------------------------------------

def init_notification_routes(database, auth_fn):
    global db, get_current_user
    db = database
    get_current_user = auth_fn
    return router
