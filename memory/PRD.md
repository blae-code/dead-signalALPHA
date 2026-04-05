# Dead Signal — PRD

## Original Problem Statement
AI-narrated companion app that transforms HumanitZ survival sandbox into an MMO-lite experience. Features faction politics, scarcity economy, real-time event narration, and server admin tools. Tactical military ops center UI (dark mode, CRT effects, amber/rust accents, monospace fonts), Pterodactyl integration for server management and live log streaming, Gemini 2.5 Flash for AI narration, custom Auth Key/Callsign based authentication.

## User Personas
- **System Admin / Game Master**: Manages the server, creates missions, NPCs, world events, controls economy
- **Player**: Views intel, trades, faction info, survival tools, personal stats

## Core Requirements
1. Pterodactyl API integration for server controls + live console streaming
2. Gemini 2.5 Flash AI narration from parsed console logs
3. Custom auth: email/password + callsign system
4. Faction system with territories, diplomacy, and AI diplomat
5. Economy with scarcity index, trades, supply requests, crafting
6. GM Tools: missions, NPCs, world events, triggers, broadcasts, scheduler
7. Survival Planning Suite: base planner, recipe tracker, loot intel, OCR scan
8. Tactical dark terminal UI throughout

## Architecture
```
/app
├── backend/
│   ├── server.py             # Main FastAPI server, Auth, WS, middleware
│   ├── routes/               # API routers
│   │   ├── meta.py           # /api/meta/options - aggregated dropdown data
│   │   ├── factions.py       # Faction CRUD + diplomacy
│   │   ├── missions.py       # Mission CRUD + stages/objectives
│   │   ├── npcs.py           # NPC CRUD + spawn/status
│   │   ├── economy.py        # Resources, trades, supply requests
│   │   ├── inventory.py      # Player inventory + OCR merge
│   │   ├── gamemaster.py     # GM tools, triggers, broadcasts
│   │   ├── world_events.py   # World event firing
│   │   ├── loot_intel.py     # Location-aware loot intelligence
│   │   ├── planner.py        # Base planner
│   │   └── ...               # territories, stats, alerts, etc.
│   ├── pterodactyl.py        # Async Pterodactyl API client
│   ├── pterodactyl_ws.py     # Background WS consumer for live logs
│   ├── event_parser.py       # Regex-based log parser
│   └── ai_narrator.py        # Gemini 2.5 Flash narrative generation
├── frontend/
│   ├── src/
│   │   ├── pages/DashboardPage.js
│   │   ├── components/       # All panels and UI components
│   │   ├── hooks/useMetaOptions.js  # Shared cached meta data hook
│   │   └── lib/api.js
```

## What's Been Implemented

### Phase 1: Core Infrastructure (Complete)
- Project scaffolding, tactical terminal UI design
- Pterodactyl API + WebSocket live log streaming
- Event engine & Gemini AI narrative layer
- Custom email/password + callsign auth system
- Live dashboard with WebSocket feed
- Graceful offline state handling

### Phase 2: Metagame Layer (Complete)
- Faction system (CRUD, territories, diplomacy)
- Diplomat AI (Gemini-powered treaty analysis)
- Scarcity economy (event-driven pricing, trades, supply board)
- Interactive territory map with grid overlay
- GM Tools: missions, NPCs, world events, triggers, broadcasts, scheduler

### Phase 3: Survival Planning Suite (Complete)
- Base Planner (blueprints, material tracking)
- Recipe Tracker with crafting planner
- Location-Aware Loot Intelligence
- OCR Inventory Import via Gemini Vision

### QoL + Visual Polish Pass (Complete - Apr 2026)
- Created `/api/meta/options` endpoint aggregating all dropdown data
- Created `useMetaOptions` hook with in-memory caching
- MissionPanel: full rewrite with faction/player/NPC dropdowns, template presets (Supply Run, Bounty Hunt, Defense Mission), enhanced empty states
- NPCPanel: full rewrite with faction/resource/location dropdowns, template presets (Trader, Quest Giver, Hostile), enhanced empty states
- WorldEventComposer: location datalist from territory data
- GameMasterPanel triggers: uses shared meta options instead of 3 separate API calls
- ResourceHub: enhanced empty states with actionable CTAs
- **Deployment fix**: Sparse unique index on email (handles null email users)
- **CORS fix**: Removed hardcoded origins, uses env vars only

## Prioritized Backlog

### P1 - Next Up
- Player count extraction from console logs (connect/disconnect tracking)

### P2 - Future
- LiveKit voice integration for faction voice channels
- Advanced AI agents (TTS Narrator, NPC voices)
- Discord webhook broadcaster for AI narrative dispatches
- Key distribution URL system for onboarding

## 3rd Party Integrations
- **Pterodactyl API**: Server management + live log streaming (user API key)
- **Gemini 2.5 Flash**: AI narration + diplomat + OCR (Emergent LLM Key)

## DB Schema (Key Collections)
- `users`: {email, password_hash, callsign, role, steam_id}
- `factions`: {faction_id, name, tag, color, territories}
- `missions`: {mission_id, title, stages, rewards, assigned_players}
- `npcs`: {npc_id, name, role, faction, inventory, dialogue}
- `events`: {event_id, event_type, raw_log, parsed_data}
- `narrations`: {event_id, dispatch_text, timestamp}
