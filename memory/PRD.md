# Dead Signal — PRD

## Original Problem Statement
AI-narrated companion app that transforms HumanitZ survival sandbox into an MMO-lite experience. Features faction politics, scarcity economy, real-time event narration, and server admin tools. Tactical military ops center UI (dark mode, CRT effects, amber/rust accents, monospace fonts), Pterodactyl integration for server management and live log streaming, Gemini 2.5 Flash for AI narration, custom Auth Key/Callsign based authentication.

## User Personas
- **System Admin / Game Master**: Manages the server, creates missions, NPCs, world events, controls economy, converses with SIGINT AI
- **Player**: Views intel, trades, faction info, survival tools, personal stats, asks SIGINT for survival advice

## Core Requirements
1. Pterodactyl API integration for server controls + live console streaming
2. Gemini 2.5 Flash AI narration from parsed console logs
3. Custom auth: email/password + callsign system
4. Faction system with territories, diplomacy, and AI diplomat
5. Economy with scarcity index, trades, supply requests, crafting
6. GM Tools: missions, NPCs, world events, triggers, broadcasts, scheduler
7. Survival Planning Suite: base planner, recipe tracker, loot intel, OCR scan
8. SIGINT AI Chat: natural language server control (GM) + field intelligence (player)
9. Tactical dark terminal UI throughout

## Architecture
```
/app
├── backend/
│   ├── server.py             # Main FastAPI server, Auth, WS, middleware
│   ├── routes/
│   │   ├── ai_chat.py        # SIGINT AI conversational endpoint (GM/Player modes)
│   │   ├── meta.py           # /api/meta/options - aggregated dropdown data
│   │   ├── factions.py       # Faction CRUD + diplomacy
│   │   ├── missions.py       # Mission CRUD + stages/objectives
│   │   ├── npcs.py           # NPC CRUD + spawn/status
│   │   ├── economy.py        # Resources, trades, supply requests
│   │   ├── inventory.py      # Player inventory + OCR merge
│   │   ├── gamemaster.py     # GM tools, triggers, broadcasts
│   │   ├── world_events.py   # World event firing
│   │   ├── loot_intel.py     # Location-aware loot intelligence
│   │   └── planner.py        # Base planner
│   ├── pterodactyl.py        # Async Pterodactyl API client
│   ├── pterodactyl_ws.py     # Background WS consumer for live logs
│   ├── event_parser.py       # Regex-based log parser
│   └── ai_narrator.py        # Gemini 2.5 Flash narrative generation
├── frontend/
│   ├── src/
│   │   ├── pages/DashboardPage.js    # Main interface (SIGINT tab added)
│   │   ├── components/
│   │   │   ├── AIChatPanel.js        # SIGINT conversational UI
│   │   │   ├── WorldConditions.js    # Enhanced with survival tips
│   │   │   ├── PlayerStats.js        # Enhanced with faction standings
│   │   │   ├── MissionPanel.js       # QoL: dropdowns, presets, empty states
│   │   │   ├── NPCPanel.js           # QoL: dropdowns, presets, empty states
│   │   │   └── ...
│   │   ├── hooks/useMetaOptions.js   # Shared cached meta data hook
│   │   └── lib/api.js
```

## What's Been Implemented

### Phase 1: Core Infrastructure (Complete)
- Pterodactyl API + WebSocket live log streaming
- Event engine & Gemini AI narrative layer
- Custom auth, live dashboard, graceful offline handling

### Phase 2: Metagame Layer (Complete)
- Factions, diplomacy, diplomat AI, economy, territory map, GM tools

### Phase 3: Survival Planning Suite (Complete)
- Base Planner, Recipe Tracker, Loot Intel, OCR Import

### Phase 4: QoL + Visual Polish Pass (Complete - Apr 2026)
- `/api/meta/options` endpoint + `useMetaOptions` hook
- MissionPanel, NPCPanel: dropdown controls, template presets, empty state CTAs
- WorldEventComposer, GameMasterPanel triggers: territory datalists
- ResourceHub: enhanced empty states
- Deployment fix: sparse email index, CORS env-only

### Phase 5: SIGINT AI Command Center (Complete - Apr 2026)
- **Backend `routes/ai_chat.py`**: Gemini-powered conversational endpoint
  - GM mode: full RCON access, natural language commands, server queries
  - Player mode: read-only world intel, survival advice, trade analysis
  - Live context injection: server stats, online players, world state, events, factions, economy, missions, NPCs
  - Safe command auto-execution (broadcasts/say)
  - Destructive command confirmation flow (kick/ban/restart/stop)
  - Session management with chat history and session browser
- **Frontend `AIChatPanel.js`**: Military comms terminal UI
  - Session sidebar, suggested prompts, message bubbles
  - Action result indicators (green success, red failure)
  - Confirmation prompt for destructive commands
  - GM badge / role-aware interface
- **WorldConditions.js**: Context-aware survival tips based on weather/time/danger/temperature
- **PlayerStats.js**: Faction Standings leaderboard

## Prioritized Backlog

### P1 - Next Up
- Player count extraction from console logs (connect/disconnect tracking)
- Log search & analysis (searchable console buffer)
- Server config advisor (AI reads and suggests settings)

### P2 - Future
- LiveKit voice integration for faction voice channels
- Advanced AI agents (TTS Narrator, NPC voices)
- Discord webhook broadcaster for AI narrative dispatches
- Key distribution URL system for onboarding
- Danger heatmap on tactical map
- Event pattern alerts (GM smart triggers)

## 3rd Party Integrations
- **Pterodactyl API**: Server management + live log streaming (user API key)
- **Gemini 2.5 Flash**: AI narration + diplomat + OCR + SIGINT chat (Emergent LLM Key)

## DB Schema (Key Collections)
- `users`: {email, password_hash, callsign, role, steam_id}
- `factions`: {faction_id, name, tag, color, territories, members}
- `missions`: {mission_id, title, stages, rewards, assigned_players}
- `npcs`: {npc_id, name, role, faction, inventory, dialogue}
- `events`: {event_id, event_type, raw_log, parsed_data}
- `narrations`: {event_id, dispatch_text, timestamp}
- `ai_chat_history`: {session_id, callsign, role, user_message, ai_response, commands_parsed, actions_taken}
