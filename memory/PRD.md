# Dead Signal - Product Requirements Document

## Original Problem Statement
AI-narrated companion app for HumanitZ 24-player survival sandbox. Military ops center dashboard with server management, real-time event streaming, AI narration, auth key system, faction metagame, and comprehensive Game Master controls.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI (dark tactical theme)
- **Backend**: FastAPI (Python) with async endpoints + WebSocket + Background Scheduler
- **Database**: MongoDB
- **AI**: Gemini 2.5 Flash via Emergent Universal Key
- **Game Integration**: Pterodactyl Client API + WebSocket console stream + RCON
- **Auth**: Universal Auth Key system (Callsign + DS-XXXX key), JWT cookies

## What's Been Implemented

### Phase 1 (Complete)
- [x] Universal Callsign + Auth Key authentication
- [x] First-time setup flow via setup secret
- [x] Auth key management: generate, reissue, revoke, suspend, delete
- [x] Role-based access control (system_admin, server_admin, player)
- [x] Pterodactyl Client API (status, power, commands, files, backups)
- [x] Real-time Pterodactyl WebSocket console streaming
- [x] Live server stats (CPU, RAM, disk) updated every 5s
- [x] Player count display (0/12) on dashboard
- [x] Log parser with regex patterns for game events
- [x] Gemini 2.5 Flash AI narrator
- [x] CRT scanline overlay, amber/rust/olive tactical theme
- [x] Graceful offline state handling

### Phase 2: Faction System (Complete)
- [x] Faction CRUD (create, update, disband)
- [x] Faction membership (invite, accept, decline, leave, kick)
- [x] Promote/demote/transfer leadership
- [x] Diplomacy engine (propose, accept, reject, cancel treaties)
- [x] Treaty types: Alliance, Trade, Non-Aggression, War
- [x] Factions tab UI with detail views, invite form, diplomacy panel

### Phase 2.5: Game Master Suite (Complete - April 3, 2026)
- [x] **Scheduler Engine**: Background task runner (restarts, broadcasts, commands, backups)
- [x] **Task Presets**: 6-Hour Restart, Hourly Broadcast, Daily Backup
- [x] **Broadcast System**: In-game RCON broadcasts with quick templates + history
- [x] **Player Admin**: Kick/ban/unban/warn/whitelist with reasons + tracking
- [x] **Player Notes**: Info, warning, watchlist, ban_reason categorization
- [x] **Player Profiles**: Complete view with notes, action history, sessions
- [x] **Ban List & Watchlist**: Dedicated views for banned/watched players
- [x] **Event Triggers**: Auto-fire on game events (connect, death, horde, etc.)
- [x] **Trigger Presets**: Welcome Message, Goodbye, Horde Alert, Death Report
- [x] **Quick Commands**: Saved RCON commands for one-click execution
- [x] **Action Log**: Full audit trail with timestamps, actors, details
- [x] **GM Dashboard**: 6 stat cards showing active tasks/players/bans/triggers
- [x] **Access Control**: All GM endpoints admin-only (403 for players)

## Dashboard Tabs (7 total)
1. Overview — Server stats, event feed, AI narrations
2. Console — RCON console with command history
3. Tactical Map — Grid map placeholder
4. Players — Player roster with online status
5. Factions — Faction management + diplomacy
6. Game Master — 7 sub-tabs (Overview, Scheduler, Broadcasts, Player Admin, Triggers, Quick Cmds, Action Log)
7. Admin — File browser, backups, key management

## Prioritized Backlog

### P0 (Next)
- Parse HumanitZ-specific connect/disconnect log patterns for live player list
- Scarcity economy (resource tracking, dynamic pricing, marketplace)

### P1
- Interactive territory map with faction overlays
- AI Diplomat agent (Gemini) for faction negotiation
- Discord webhook broadcaster for AI narrative dispatches

### P2
- LiveKit voice integration for faction channels
- TTS narration
- Key distribution URL system for onboarding
- Mobile responsive polish

## DB Collections
- `users`, `events`, `narratives`, `player_sessions`, `command_log`
- `factions`, `faction_members`, `faction_invites`, `diplomacy`
- `scheduled_tasks`, `gm_broadcasts`, `gm_players`, `gm_player_notes`
- `gm_triggers`, `gm_quick_commands`, `gm_action_log`
