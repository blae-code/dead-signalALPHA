# Dead Signal — Product Requirements Document

## Overview
Dead Signal is an AI-narrated companion app for the HumanitZ survival sandbox game. It transforms the single-player/co-op experience into an MMO-lite with faction politics, a scarcity economy, real-time event narration, and server admin tools.

## Core Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI (dark tactical theme)
- **Backend**: FastAPI + MongoDB
- **Real-time**: WebSocket pipeline (Pterodactyl → Backend → Frontend)
- **AI**: Gemini 2.5 Flash via emergentintegrations (narrative generation)
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
- [x] NPC Director Panel
- [x] Mission Panel
- [x] Scheduled Tasks (auto-restart, broadcasts, backups)
- [x] Event Triggers (auto-respond to game events)
- [x] Quick RCON Commands
- [x] GM Broadcast system
- [x] Player Admin (kick/ban/unban/warn, notes, action history)
- [x] GM Action Log

### Visual Polish (Complete)
- [x] Immersive login page with radar background animation
- [x] Typewriter effect on tagline
- [x] Weather overlays (rain, snow, fog, storm, dust)
- [x] Live Status Bar (time, weather, season, threat level)
- [x] CRT scanline effects
- [x] Form entrance animations

## Upcoming Tasks (P1-P3)

### Phase 3: Immersion & Integrations (P1-P2)
- [ ] Diplomat AI Agent (Gemini-powered treaty/reputation engine)
- [ ] Interactive Territory Map (game map overlays for faction territories)
- [ ] Player count extraction from connect/disconnect logs
- [ ] LiveKit voice channels for factions
- [ ] TTS Narration (OpenAI/ElevenLabs)
- [ ] Discord webhook broadcaster
- [ ] Key distribution URLs for player onboarding
- [ ] Mobile responsive polish

### Refactoring
- [ ] Extract auth logic from server.py into routes/auth.py

## API Routes
- Auth: POST /api/auth/register, /login, /logout, /forgot-password, /reset-password, /refresh, GET /me
- Stats: GET /api/stats/me, /leaderboard, /history
- GM: POST /api/gm/world-events/fire, /templates, /story-arcs/, /{id}/start|pause|abort
- GM: GET /api/gm/factions/overview, /analytics/players
- Notifications: POST /api/notifications/subscribe, DELETE /subscribe, GET|PATCH /preferences
- Server: GET /api/server/status, /live-stats, /backups, /files
- WS: /api/ws/feed

## Database Collections
- users, events, narrations, factions, faction_members
- world_state, economy_state, password_resets, push_subscriptions
- gm_tasks, gm_triggers, gm_log, gm_broadcasts, gm_quick_commands
- story_arcs, world_event_templates, missions, npcs, intel_reports

## CORS Configuration
- Production: https://dead-signal.ca, https://faction-wars-17.preview.emergentagent.com
