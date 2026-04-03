# Dead Signal - Product Requirements Document

## Original Problem Statement
AI-narrated companion app for HumanitZ 24-player survival sandbox. Military ops center dashboard with server management, real-time event streaming, AI narration, auth key system, and faction metagame.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI (dark tactical theme)
- **Backend**: FastAPI (Python) with async endpoints + WebSocket
- **Database**: MongoDB (users, events, narratives, player_sessions, command_log, factions, faction_members, faction_invites, diplomacy)
- **AI**: Gemini 2.5 Flash via Emergent Universal Key
- **Game Integration**: Pterodactyl Client API + WebSocket console stream
- **Auth**: Universal Auth Key system (Callsign + DS-XXXX key), JWT cookies

## User Personas
- **System Admin**: Full access — server power, RCON, files, backups, key management, factions, app config
- **Server Admin**: Server management, RCON, player management
- **Player**: Dashboard view, event feed, narratives, faction features

## What's Been Implemented

### Phase 1 (Complete - April 3, 2026)
- [x] Universal Callsign + Auth Key authentication (no email)
- [x] First-time setup flow via setup secret
- [x] Auth key management: generate, reissue, revoke, suspend, delete
- [x] Role-based access control (system_admin, server_admin, player)
- [x] Pterodactyl Client API (status, power, commands, files, backups)
- [x] Real-time Pterodactyl WebSocket console streaming
- [x] Live server stats (CPU, RAM, disk) updated every 5s
- [x] Player count display (0/12) on dashboard
- [x] Log parser with regex patterns for game events
- [x] Real-time event broadcasting to frontend
- [x] Gemini 2.5 Flash AI narrator (Radio, Ambient, Auto-narrate)
- [x] 6-tab dashboard: Overview, Console, Tactical Map, Players, Factions, Admin
- [x] CRT scanline overlay, amber/rust/olive tactical theme
- [x] Graceful offline state handling

### Phase 2: Faction System (Complete - April 3, 2026)
- [x] Faction CRUD (create, update, disband)
- [x] Faction membership (invite, accept, decline, leave, kick)
- [x] Promote/demote/transfer leadership
- [x] Diplomacy engine (propose, accept, reject, cancel treaties)
- [x] Treaty types: Alliance, Trade, Non-Aggression, War
- [x] Factions tab UI with detail views, invite form, diplomacy panel
- [x] Color picker for faction banners

## Prioritized Backlog

### P0 (Next)
- Real player list parsing from HumanitZ console (connect/disconnect log patterns)
- Scheduled automated tasks (restarts, broadcasts)

### P1 (Phase 2 Remaining)
- Scarcity economy (resource tracking, dynamic pricing, marketplace)
- Interactive map with territory overlays
- AI Diplomat agent (Gemini) for faction negotiation assistance

### P2 (Phase 3)
- LiveKit voice integration
- TTS narration to voice channels
- Discord webhook notifications
- Key distribution URL system for onboarding
- Mobile responsive polish

## DB Collections
- `users`: callsign, auth_key_hash, role, status
- `events`: type, severity, raw, timestamp, players, details
- `narratives`: narration, type, timestamp
- `player_sessions`: name, joined_at, left_at, active, last_seen
- `factions`: faction_id, name, tag, color, leader_id, member_count, status
- `faction_members`: faction_id, user_id, callsign, role, status
- `faction_invites`: faction_id, user_id, callsign, invited_by, status
- `diplomacy`: treaty_id, from/to faction, treaty_type, status
