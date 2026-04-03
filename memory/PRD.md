# Dead Signal - Product Requirements Document

## Original Problem Statement
AI-narrated companion app for HumanitZ survival sandbox. Military ops center dashboard with server management, real-time event streaming, AI narration with in-game broadcasting, auth key system, faction metagame, comprehensive Game Master controls, immersive world conditions, and scarcity economy.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI (dark tactical theme, 8 tabs)
- **Backend**: FastAPI (Python) with async endpoints + WebSocket + Background Scheduler
- **Database**: MongoDB (18 collections)
- **AI**: Gemini 2.5 Flash via Emergent Universal Key
- **Game Integration**: Pterodactyl Client API + WebSocket + RCON
- **Auth**: Universal Auth Key system (Callsign + DS-XXXX key), JWT cookies

## What's Been Implemented

### Phase 1: Core Platform (Complete)
- [x] Auth Key system, RBAC, key management
- [x] Pterodactyl API + WebSocket console + RCON
- [x] Live server stats, player count (0/12)
- [x] Event parser, AI narrator (Gemini 2.5 Flash)
- [x] Graceful offline handling, CRT tactical theme

### Phase 2: Faction System (Complete)
- [x] Faction CRUD, membership, leadership
- [x] Diplomacy engine (4 treaty types)

### Phase 2.5: Game Master Suite (Complete)
- [x] Scheduler engine, broadcast system, player admin
- [x] Event triggers, quick commands, action log

### Phase 3: Narrative Broadcasting (Complete)
- [x] Manual In-Game send on each narration
- [x] Auto-broadcast toggle in GM panel
- [x] RCON integration for AI dispatches

### Phase 4: Immersive World & Economy (Complete - April 3, 2026)
- [x] **World Conditions**: Time of day (calculated from uptime), weather (season-aware auto-cycle), season, temperature, danger level (0-10)
- [x] **Gameplay Tooltips**: Every condition has a hover tooltip explaining gameplay impact (zombie aggression, visibility, food spoilage, etc.)
- [x] **Day Cycle Visualization**: 24h progress bar with night zone highlighting
- [x] **GM Weather Override**: Admin can force weather, time offset, custom alerts
- [x] **Resource Catalog**: 25 HumanitZ items across 11 categories with rarity and base values
- [x] **Scarcity Index**: Supply levels and value trends for all resources
- [x] **Trade Board**: Post/claim/complete/cancel trades between players, faction tag display
- [x] **Supply Requests**: Request items with priority (low/normal/urgent), fulfill system
- [x] **Crafting Planner**: 10 recipes with ingredients, difficulty, expandable details, category filters
- [x] **Trade Protocol Guide**: Step-by-step trading instructions in UI

## Dashboard Tabs (8)
1. Overview — Server stats + World Conditions + Event Feed + AI Dispatch
2. Console — RCON console
3. Tactical Map — Grid map placeholder
4. Players — Player roster
5. Factions — Faction management + diplomacy
6. Economy — Trade Board, Supply Requests, Crafting Planner, Scarcity Index
7. Game Master — Scheduler, Broadcasts, Player Admin, Triggers, Quick Cmds, Action Log (admin-only)
8. Admin — File browser, backups, key management (admin-only)

## Prioritized Backlog

### P1 (Next)
- Interactive territory map with faction overlays
- AI Diplomat agent for faction negotiation
- Discord webhook broadcaster for AI narratives

### P2 (Future)
- LiveKit voice channels
- OpenAI Whisper STT
- TTS narration
- Key distribution URLs
- Mobile responsive polish
