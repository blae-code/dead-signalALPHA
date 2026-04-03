# Dead Signal - Product Requirements Document

## Original Problem Statement
AI-narrated companion app for HumanitZ 24-player survival sandbox. Military ops center dashboard with server management, real-time event streaming, AI narration with in-game broadcasting, auth key system, faction metagame, and comprehensive Game Master controls.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI (dark tactical theme)
- **Backend**: FastAPI (Python) with async endpoints + WebSocket + Background Scheduler
- **Database**: MongoDB
- **AI**: Gemini 2.5 Flash via Emergent Universal Key
- **Game Integration**: Pterodactyl Client API + WebSocket console stream + RCON
- **Auth**: Universal Auth Key system (Callsign + DS-XXXX key), JWT cookies (secure=True, samesite=none)

## What's Been Implemented

### Phase 1 (Complete)
- [x] Universal Callsign + Auth Key authentication
- [x] First-time setup flow, key management (generate, reissue, revoke, suspend, delete)
- [x] Role-based access control (system_admin, server_admin, player)
- [x] Pterodactyl Client API + WebSocket console streaming + RCON
- [x] Live server stats (CPU, RAM, disk, player count 0/12)
- [x] Log parser, real-time event broadcasting
- [x] Gemini 2.5 Flash AI narrator
- [x] CRT scanline overlay, dark tactical theme
- [x] Graceful offline state handling

### Phase 2: Faction System (Complete)
- [x] Faction CRUD, membership, promote/demote/transfer
- [x] Diplomacy engine (Alliance, Trade, Non-Aggression, War treaties)

### Phase 2.5: Game Master Suite (Complete)
- [x] Scheduler engine (automated restarts, broadcasts, commands, backups)
- [x] Broadcast system with RCON + quick templates + history
- [x] Player admin (kick/ban/warn/whitelist, notes, profiles, action history)
- [x] Event triggers (auto-fire on game events with cooldowns)
- [x] Quick commands, action log, GM dashboard stats

### Phase 2.6: Narrative In-Game Broadcasting (Complete - April 3, 2026)
- [x] **Manual broadcast**: "In-Game" button on each narration in dispatch archive (hover to reveal, click to send via RCON)
- [x] **Auto-broadcast toggle**: GM Overview setting to auto-send all AI narrations in-game
- [x] **"Sent" indicator**: Green checkmark + "SENT" badge on broadcast dispatches
- [x] **In-game formatting**: Narrations prefixed with [DEAD SIGNAL], truncated to 200 chars for RCON
- [x] **Audit trail**: All broadcasts logged to GM action log

## Dashboard Tabs (7)
1. Overview — Server stats, event feed, AI narrations (with In-Game send buttons)
2. Console — RCON console
3. Tactical Map — Grid map placeholder
4. Players — Player roster
5. Factions — Faction management + diplomacy
6. Game Master — 7 sub-tabs (Overview + auto-broadcast toggle, Scheduler, Broadcasts, Player Admin, Triggers, Quick Cmds, Action Log)
7. Admin — File browser, backups, key management

## Prioritized Backlog

### P0 (Next)
- Parse HumanitZ-specific connect/disconnect log patterns for live player list
- Scarcity economy (resource tracking, dynamic pricing, marketplace)

### P1
- Interactive territory map with faction overlays
- AI Diplomat agent (Gemini) for faction negotiation
- Discord webhook broadcaster

### P2
- LiveKit voice, TTS narration, key distribution URLs, mobile polish
