# Dead Signal - Product Requirements Document

## Original Problem Statement
AI-narrated companion app for HumanitZ 24-player survival sandbox. Transforms server management into an immersive military ops center experience with faction politics, scarcity economy, real-time event narration, and admin tools.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn UI (dark tactical theme)
- **Backend**: FastAPI (Python) with async endpoints
- **Database**: MongoDB (users, events, narratives, command_log)
- **AI**: Gemini 2.5 Flash via Emergent Universal Key
- **Game Integration**: Pterodactyl Client API for server management
- **Auth**: JWT with httpOnly cookies + Bearer token fallback

## User Personas
- **Server Admin (super_admin)**: Full access to power controls, RCON, files, backups
- **Server Admin (server_admin)**: Server management without user admin
- **Faction Leader**: Faction management (Phase 2)
- **Player**: View dashboard, events, narratives

## What's Been Implemented (Phase 1 - April 3, 2026)
- [x] JWT authentication with role-based access (register, login, logout, refresh)
- [x] Admin seeding (super_admin role)
- [x] Pterodactyl API integration (server status, power controls, commands, files, backups)
- [x] Event Engine with log parser (regex-based classification)
- [x] AI Narrative Layer (Gemini 2.5 Flash): Narrator, Radio Operator, Ambient Dispatches
- [x] Real-time Dashboard with Overview, Console, Tactical Map, Admin tabs
- [x] Server Status panel with graceful error handling
- [x] RCON Command Terminal interface
- [x] Event Feed with severity-based styling
- [x] AI Narrative Dispatch panel with typewriter animation
- [x] Placeholder tactical grid map
- [x] CRT scanline overlay effect
- [x] Dark tactical military theme (Barlow Condensed + JetBrains Mono)
- [x] WebSocket infrastructure for live feed
- [x] Brute force login protection

## Known Issues
- Pterodactyl API returns 401: API key may need regeneration in BiSect panel

## Prioritized Backlog

### P0 (Next Session)
- Fix Pterodactyl API authentication (user needs to verify/regenerate API key)
- Real-time log streaming via Pterodactyl WebSocket
- Auto-narration of high-severity events

### P1 (Phase 2)
- Faction system (CRUD, membership, roles, elections)
- Diplomacy engine (status tracking, proposals, AI diplomat)
- Scarcity economy (resource tracking, dynamic pricing, marketplace)
- Interactive map with FModel-extracted assets

### P2 (Phase 3)
- LiveKit voice integration
- TTS narration to voice channels
- NPC voice personas
- Mobile responsive polish
- Discord webhook notifications
