# Dead Signal — Product Requirements Document

## Overview
Dead Signal is an AI-narrated companion app for the HumanitZ survival sandbox game. It transforms the single-player/co-op experience into an MMO-lite with faction politics, a scarcity economy, real-time event narration, and server admin tools.

## Core Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI (dark tactical theme)
- **Backend**: FastAPI + MongoDB
- **Real-time**: WebSocket pipeline (Pterodactyl -> Backend -> Frontend)
- **AI**: Gemini 2.5 Flash via emergentintegrations (narrative generation + diplomatic intelligence + OCR vision)
- **Auth**: Email/Password with JWT (HTTP-only cookies), Callsign display names
- **Server Integration**: Pterodactyl API (RCON, file browser, backups, live stats)

## Authentication
- Email + Password registration with unique Callsign
- JWT access/refresh tokens in HTTP-only cookies
- Roles: `system_admin`, `player`
- Self-service password recovery (inline token-based flow)
- Admin can generate reset links from User Management

## Implemented Features

### Phase 1: Core Infrastructure (Complete)
- [x] Tactical Terminal UI Design (dark mode, CRT effects, amber/rust accents, monospace fonts)
- [x] Pterodactyl API Integration (server controls, live stats, file browser, backups)
- [x] WebSocket pipeline for live console logs and server stats
- [x] Event Engine (regex-based log parser)
- [x] AI Narrative Layer (Gemini 2.5 Flash)
- [x] Email/Password Auth with Callsign system
- [x] Password Reset flow (self-service + admin-generated)
- [x] Onboarding flow for new users

### Phase 2: Metagame Layer (Complete)
- [x] Faction system (CRUD, membership, roles, territory claims)
- [x] Scarcity Economy (event-driven pricing, resource tracking, marketplace)
- [x] World Conditions (weather overlays, living status bar, time/season/threat)
- [x] Live dashboard with graceful offline handling

### Phase 2.5: GM Tools & Stats (Complete)
- [x] Personal Player Stats Dashboard (K/D, session time, kills, activity timeline, leaderboards)
- [x] Browser Push Notifications (VAPID keys, service worker, subscription management)
- [x] World Event Composer (fire events with RCON + narrative broadcast, templates)
- [x] Faction Balance Overview (faction analytics with leader, members, reputation)
- [x] Story Arc Scheduler (timed narrative beats with steps, start/pause/abort)
- [x] Player Heat Map & Behaviour Analytics (activity categorization, sort/filter)
- [x] NPC Director Panel, Mission Panel
- [x] Scheduled Tasks, Event Triggers, Quick RCON Commands
- [x] GM Broadcast system, Player Admin, GM Action Log

### Phase 3: Intelligence & Territory (Complete)
- [x] Player Count Extraction (WebSocket broadcasts online_players + online_count)
- [x] Diplomat AI Agent (Gemini 2.5 Flash powered diplomatic intelligence)
- [x] Interactive Territory Map (16x16 grid with faction-colored territory overlays)
- [x] Steam Identity Linking (manual link of app account to in-game character)

### Phase 4: Survival Planning Suite (Complete — Current Session)
- [x] **Base Planner**: Visual 8x8 grid canvas for placing base modules (11 module types: Storage Room, Armory, Med Bay, Crafting Station, Watch Tower, Generator Room, Kitchen, Barricade Wall, Reinforced Wall, Concrete Bunker, Sleeping Quarters)
  - Save/load blueprints to MongoDB
  - Auto-aggregates total crafting recipes and raw materials needed
  - Cross-references against player inventory to show have/need/shortfall
- [x] **Loot Intelligence System**: 25-item database mapping resources to 21 scavenging locations
  - Probability tiers (high/medium/low) per item-location pair
  - Danger ratings per location (low/medium/high/very_high)
  - Location Guide with detailed descriptions
  - Search/filter across all items
  - Shortfall Intel API: given missing items, returns where to find them
- [x] **Enhanced OCR**: Alias resolution system for common OCR misspellings
  - 70+ alias mappings for HumanitZ items
  - Structured review table with editable names/quantities
  - Confidence indicators (exact/alias/partial/unknown)
  - Autocomplete from known items list
- [x] **Operations Dashboard Tab**: New tab in main navigation housing Base Planner + Loot Intel

### Visual Polish (Complete)
- [x] Immersive login page with radar background animation + typewriter tagline
- [x] Weather overlays (rain, snow, fog, storm, dust)
- [x] Live Status Bar (time, weather, season, threat level)
- [x] CRT scanline effects, form entrance animations

## Upcoming Tasks (P2-P3)

### Phase 5: Immersion & Integrations
- [ ] LiveKit voice channels for factions
- [ ] TTS Narration (OpenAI/ElevenLabs)
- [ ] Discord webhook broadcaster for AI narratives
- [ ] Key distribution URLs for player onboarding
- [ ] Mobile responsive polish

### Refactoring
- [ ] Extract auth logic from server.py into routes/auth.py

## API Routes
- Auth: POST /api/auth/register, /login, /logout, /forgot-password, /reset-password, /refresh, GET /me
- Stats: GET /api/stats/me, /leaderboard, /history
- GM: POST /api/gm/world-events/fire, /templates, /story-arcs/, /{id}/start|pause|abort
- GM: GET /api/gm/factions/overview, /analytics/players
- Diplomat: GET /api/diplomat/analysis, /reputation-matrix; POST /api/diplomat/recommend
- Territories: GET /api/territories, /summary, /markers; POST /claim; DELETE /claim
- Notifications: POST /api/notifications/subscribe, DELETE /subscribe, GET|PATCH /preferences
- Server: GET /api/server/status, /live-stats, /backups, /files, /api/players
- Inventory: GET/PUT/PATCH /api/inventory/items, /caches, /bases, /crafting-queue
- OCR: POST /api/ocr/scan
- Loot Intel: GET /api/loot-intel/items, /locations, /items/{name}; POST /resolve-aliases, /shortfall-intel
- Planner: GET /api/planner/modules, /blueprints; POST/PUT/DELETE /api/planner/blueprints/{id}; POST /blueprints/{id}/calculate
- WS: /api/ws/feed

## Database Collections
- users, events, narrations, factions, faction_members
- world_state, economy_state, password_resets, push_subscriptions
- gm_tasks, gm_triggers, gm_log, gm_broadcasts, gm_quick_commands
- story_arcs, world_event_templates, missions, npcs, intel_reports
- territories, diplomacy
- player_inventory, caches, bases, crafting_queues
- blueprints, loot_markers

## CORS Configuration
- Production: https://dead-signal.ca, https://faction-wars-17.preview.emergentagent.com
