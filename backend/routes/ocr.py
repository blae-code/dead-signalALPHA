from fastapi import APIRouter, Request, HTTPException, UploadFile, File
import base64
import json
import logging
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ocr", tags=["ocr"])

db = None
get_current_user = None

_KNOWN_ITEMS = ', '.join(sorted([
    'Canned Food', 'Fresh Meat', 'MRE', 'Water Bottle', 'Water Purifier',
    '9mm Ammo', '5.56 Ammo', '12ga Shells', 'Bandage', 'First Aid Kit',
    'Antibiotics', 'Painkillers', 'Wood Planks', 'Metal Sheets', 'Nails',
    'Concrete Mix', 'Pistol', 'Shotgun', 'Assault Rifle', 'Melee Weapon',
    'Battery', 'Fuel Can', 'Tire', 'Backpack', 'Toolbox',
    'Wooden Barricade', 'Metal Wall', 'Campfire', 'Rain Collector', 'Splint',
    'Improvised Suppressor', 'Storage Crate', 'Generator', 'Concrete Wall',
    'Molotov Cocktail',
]))

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB

_SYSTEM = "You are an expert at extracting structured data from survival game screenshots. Return only valid JSON, no markdown."

_PROMPT = f"""Analyze this game screenshot and extract all visible data.

Return ONLY a JSON object with this exact structure:
{{
  "inventory_items": [{{"item_name": "...", "quantity": 1, "notes": ""}}],
  "crafting_queue": [{{"recipe_name": "...", "quantity": 1, "timer_seconds": null}}],
  "events": ["log line 1", "log line 2"],
  "raw_text": "all visible text verbatim"
}}

Rules:
- inventory_items: Every item in inventory/storage/loot. Match names to this list where possible: {_KNOWN_ITEMS}. Use exact in-game name otherwise.
- crafting_queue: Items being crafted. Set timer_seconds to an integer if a countdown is visible (MM:SS → seconds), else null.
- events: Kill feed messages, chat, server notifications, log lines — each as a separate string.
- raw_text: Full verbatim transcription of all readable text in the screenshot.
- Empty sections use []. Quantities must be positive integers."""


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith('```'):
        lines = text.splitlines()
        start = 1 if lines[0].startswith('```') else 0
        end = len(lines) - 1 if lines[-1].strip() == '```' else len(lines)
        text = '\n'.join(lines[start:end]).strip()
    return text


async def _call_vision(image_bytes: bytes, api_key: str) -> dict:
    image_b64 = base64.b64encode(image_bytes).decode('utf-8')
    chat = LlmChat(
        api_key=api_key,
        session_id='ocr-scan',
        system_message=_SYSTEM,
    ).with_model('gemini', 'gemini-2.5-flash')
    raw = await chat.send_message(
        UserMessage(text=_PROMPT, file_contents=[ImageContent(image_base64=image_b64)])
    )
    return json.loads(_strip_fences(raw))


def init_ocr_routes(database, auth_fn):
    global db, get_current_user
    db = database
    get_current_user = auth_fn
    return router


@router.post('/scan')
async def ocr_scan(request: Request, image: UploadFile = File(...)):
    """Scan a screenshot and extract inventory items, crafting queue, and events."""
    import os
    await get_current_user(request)

    api_key = os.environ.get('EMERGENT_LLM_KEY', '')
    if not api_key:
        raise HTTPException(status_code=503, detail='OCR service not configured')

    mime = (image.content_type or '').lower()
    if mime not in {'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'}:
        raise HTTPException(status_code=400, detail='Unsupported image format. Use JPEG, PNG, WebP, or GIF.')

    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail='Empty file')
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail='Image too large (max 10 MB)')

    try:
        raw = await _call_vision(data, api_key)
    except json.JSONDecodeError:
        logger.error('OCR: could not parse JSON from model response')
        raise HTTPException(status_code=422, detail='Could not extract structured data from image')
    except Exception as exc:
        logger.error('OCR scan error: %s', exc)
        raise HTTPException(status_code=500, detail=f'Scan failed: {exc}')

    # Normalise and sanitise each section
    inventory_items = []
    for it in raw.get('inventory_items', []):
        name = str(it.get('item_name', '')).strip()[:80]
        try:
            qty = max(0, min(int(it.get('quantity') or 0), 99999))
        except (TypeError, ValueError):
            qty = 0
        notes = str(it.get('notes', '')).strip()[:100]
        if name and qty > 0:
            inventory_items.append({'item_name': name, 'quantity': qty, 'notes': notes})

    crafting_queue = []
    for it in raw.get('crafting_queue', []):
        name = str(it.get('recipe_name', '')).strip()[:80]
        try:
            qty = max(1, min(int(it.get('quantity') or 1), 999))
        except (TypeError, ValueError):
            qty = 1
        timer = it.get('timer_seconds')
        try:
            timer = int(timer) if timer is not None else None
        except (TypeError, ValueError):
            timer = None
        if name:
            crafting_queue.append({'recipe_name': name, 'quantity': qty, 'timer_seconds': timer})

    events = [str(e).strip() for e in raw.get('events', []) if str(e).strip()][:20]

    return {
        'inventory_items': inventory_items,
        'crafting_queue': crafting_queue,
        'events': events,
        'raw_text': str(raw.get('raw_text', ''))[:5000],
    }
