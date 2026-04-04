# Dead Signal — Product Requirements Document

## Overview
Dead Signal is an AI-narrated companion app for the HumanitZ survival sandbox. It transforms solo/co-op gameplay into a connected, living world via faction politics, a scarcity economy, real-time event narration, and server admin tools.

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI (Python), Motor (async MongoDB)
- **Database**: MongoDB
- **Integrations**: Pterodactyl API (server management), Gemini 2.5 Flash via emergentintegrations (AI narration)
- **Auth**: Email + password with JWT cookies, bcrypt hashing

## Authentication
- Email + password registration with Callsign (display name)
- Bcrypt password hashing, JWT access (12h) + refresh (30d) tokens in HTTP-only cookies
- Brute force protection (5 attempts, 15-min lockout)
- Password reset via token (user-initiated 1h expiry, admin-generated 24h expiry)
- Admin seeded from env vars (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_CALLSIGN)
- Onboarding flow for new users (5-6 step feature briefing)
- Roles: system_admin, player

## What's Implemented

### Phase 1 — Core & Auth (Complete)
- [x] Tactical Terminal UI Design (dark theme, CRT effects, amber/rust accents)
- [x] Pterodactyl API Integration (server controls, RCON, live log streaming)
- [x] Background WebSocket consumer for real-time Pterodactyl console
- [x] Event Engine (regex-based log parser for player events, weather, time, combat)
- [x] AI Narrative Layer (Gemini 2.5 Flash parses logs → atmospheric dispatches)
- [x] Email + Password Authentication (register, login, logout, forgot/reset password)
- [x] Onboarding flow (5-step briefing for players, 6 for admins)
- [x] Admin User Management (suspend, activate, delete, promote/demote, reset password links)
- [x] Live Dashboard with WebSocket data (stats, events, narrations, world state, scarcity)
- [x] Graceful offline state handling

### Phase 2 — Metagame & Admin (Complete)
- [x] Faction System (CRUD, members, alliances)
- [x] Game Master Suite (scheduler, event triggers, player admin, RCON broadcasts)
- [x] AI Narrative In-Game Broadcasting (manual + auto modes)
- [x] Scarcity Economy (crafting planner, trade board, resource tracking)
- [x] World Conditions (live weather, time, season, danger level)
- [x] Dynamic Scarcity Engine (world conditions influence resource values in real-time)
- [x] Live World State Broadcasting via WebSocket (15s updates)

### Phase 2.5 — Immersion, Utility & Polish (Complete)
- [x] Password Reset Flow (forgot password + admin reset links)
- [x] Ambient Weather Overlays (CSS particle effects: rain, snow, storm, fog, blizzard, dust)
- [x] Living Status Bar (persistent world state below header, visible on every tab)
- [x] Event/Narration Entry Animations (staggered slide-in reveals)
- [x] Activity Pulse on Tabs (notification dots for unread events on inactive tabs)
- [x] Expanded User Profile Dropdown (callsign, email, role, last login, join date)
- [x] Tab/Panel Transition Animations (fadeSlideIn on active tab content)
- [x] Responsive Mobile Menu (hamburger toggle, full-screen navigation overlay)
- [x] Button Micro-interactions (scale on press, smooth hover transitions)
- [x] Panel Hover Effects (border glow on hover)

## Database Collections
- `users`: {callsign, email, password_hash, role, status, onboarded, created_at, last_login}
- `events`: {timestamp, event_type, raw_log, parsed_data, severity}
- `narrations`: {event_id, dispatch_text, timestamp}
- `factions`: {name, tag, members, alliances}
- `resource_scarcity`: {name, category, base_value, current_value, multiplier, supply_level, trend}
- `password_resets`: {email, token, expires_at, created_at}

## Key API Endpoints
- POST /api/auth/register — Register (callsign + email + password)
- POST /api/auth/login — Login (email + password)
- POST /api/auth/logout — Logout (clear cookies)
- POST /api/auth/forgot-password — Generate reset token
- POST /api/auth/reset-password — Reset password with token
- POST /api/auth/onboard — Mark user as onboarded
- GET /api/admin/users — List all users (admin)
- POST /api/admin/users/{id}/reset-link — Generate admin reset link
- GET /api/factions/* — Faction CRUD
- GET /api/gamemaster/* — GM tools
- GET /api/world/state — Current world conditions
- GET /api/economy/resources — Resource list with scarcity
- WS /api/ws/feed — Real-time stream (stats, events, narrations, world_update, scarcity_update)

## Upcoming Tasks (P1-P2)
- Interactive territory map with faction overlays
- AI Diplomat agent for faction negotiation
- Discord webhook broadcaster for AI narratives

## Backlog (P2-P3)
- LiveKit voice channels for factions
- TTS narration (OpenAI/ElevenLabs)
- Key distribution URLs for player onboarding
- Mobile responsive polish (further refinement)
