# Dead Signal - Product Requirements Document

## Original Problem Statement
AI-narrated companion app for HumanitZ 24-player survival sandbox. Military ops center dashboard with server management, real-time event streaming, AI narration, and auth key system.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI (dark tactical theme)
- **Backend**: FastAPI (Python) with async endpoints + WebSocket
- **Database**: MongoDB (users, events, narratives, player_sessions, command_log)
- **AI**: Gemini 2.5 Flash via Emergent Universal Key
- **Game Integration**: Pterodactyl Client API + WebSocket console stream
- **Auth**: Universal Auth Key system (Callsign + DS-XXXX key), JWT cookies

## User Personas
- **System Admin**: Full access — server power, RCON, files, backups, key management, app config
- **Server Admin**: Server management, RCON, player management
- **Player**: Dashboard view, event feed, narratives, faction features (Phase 2)

## What's Been Implemented (April 3, 2026)

### Auth Key System
- [x] Universal Callsign + Auth Key authentication (no email needed)
- [x] First-time setup flow via setup secret (creates system admin)
- [x] Auth key format: DS-XXXX-XXXX-XXXX-XXXX (never expires)
- [x] Admin key management: generate, reissue, revoke, suspend, delete
- [x] Role-based access control (system_admin, server_admin, player)
- [x] JWT with httpOnly cookies, brute force protection

### Server Integration
- [x] Pterodactyl Client API (status, power controls, commands, files, backups)
- [x] Real-time Pterodactyl WebSocket console streaming
- [x] Live server stats (CPU, RAM, disk) updated via WebSocket every 5s
- [x] Server state tracking (running/offline)

### Event Engine
- [x] Log parser with regex patterns (connects, disconnects, deaths, kills, hordes, airdrops)
- [x] Events stored in MongoDB with severity classification
- [x] Real-time event broadcasting to connected frontend clients
- [x] Console output buffering (300 lines)

### AI Narrative Layer
- [x] Gemini 2.5 Flash: Narrator, Radio Operator, Ambient Dispatches
- [x] Auto-narration of high-severity events
- [x] Typewriter animation for narrative display
- [x] Dispatch archive with history

### Dashboard
- [x] 5-tab layout: Overview, Console, Tactical Map, Players, Admin
- [x] Live WebSocket connection with LIVE indicator
- [x] Server Status with real-time stats + power controls
- [x] Event Feed with severity-based styling
- [x] RCON Console with live server output + command input
- [x] Placeholder tactical grid map
- [x] Player Roster (tracked from console events)
- [x] Admin: File browser, backups, auth key management
- [x] CRT scanline overlay, amber/rust/olive theme

## Prioritized Backlog

### P0 (Next Session)
- Real player list parsing from HumanitZ console
- Scheduled automated tasks (restarts, broadcasts)

### P1 (Phase 2)
- Faction system (CRUD, membership, roles, elections, territory claims)
- Diplomacy engine (status tracking, proposals, AI diplomat)
- Scarcity economy (resource tracking, dynamic pricing, marketplace)
- Interactive map with FModel-extracted game assets

### P2 (Phase 3)
- LiveKit voice integration
- TTS narration to voice channels
- Discord webhook notifications
- Mobile responsive polish
