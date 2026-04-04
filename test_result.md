#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Dead Signal — a Rust game server dashboard. Phase 2.5 complete: 7 new features built (Player Stats, Push Notifications, World Event Composer, Faction Balance Overview, Story Arc Scheduler, Player Heat Map & Analytics, NPC Panel). Need comprehensive end-to-end testing of all 7 features."

backend:
  - task: "Player Stats API"
    implemented: true
    working: "NA"
    file: "backend/routes/stats.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented GET /api/stats/me (personal stats), GET /api/stats/leaderboard (top players by kills/playtime/kd), GET /api/stats/history?days=7 (activity timeline). Reads from player_sessions and events collections."

  - task: "Push Notifications API"
    implemented: true
    working: "NA"
    file: "backend/routes/notifications.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented POST /api/notifications/subscribe, DELETE /api/notifications/unsubscribe, GET /api/notifications/status, PATCH /api/notifications/preferences. Uses pywebpush for VAPID. VAPID keys must be set in .env; if not set the subscribe endpoint returns 503. Test subscribe/unsubscribe/preferences flow."

  - task: "World Event Composer API"
    implemented: true
    working: "NA"
    file: "backend/routes/world_events.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented POST /api/world-events/fire (fire an event immediately), GET/POST /api/world-events/templates, PATCH/DELETE /api/world-events/templates/{id}. Fires events via Pterodactyl RCON and broadcasts via WebSocket. Requires admin role."

  - task: "Story Arc Scheduler API"
    implemented: true
    working: "NA"
    file: "backend/routes/story_arcs.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented CRUD for story arcs (GET /, POST /, GET /{id}, PATCH /{id}, DELETE /{id}) and lifecycle endpoints POST /{id}/start, /{id}/pause, /{id}/abort. Stores arcs in story_arcs collection. Requires admin role."

  - task: "Player Analytics API"
    implemented: true
    working: "NA"
    file: "backend/routes/analytics.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented GET /api/analytics/summary, GET /api/analytics/players (paginated list with activity scores), GET /api/analytics/players/{name}, GET /api/analytics/activity (server activity over time). Admin only."

  - task: "NPC Panel API"
    implemented: true
    working: "NA"
    file: "backend/routes/npcs.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implemented full NPC CRUD (GET/POST /api/npcs, GET/PATCH/DELETE /api/npcs/{id}), status updates (POST /api/npcs/{id}/status), spawn (POST /api/npcs/{id}/spawn), director endpoints (GET /api/npcs/director/active, GET /api/npcs/{id}/director, POST /api/npcs/{id}/director/command, POST /api/npcs/{id}/director/link-mission). NPC summary at GET /api/npcs/summary."

  - task: "Faction Balance Overview API"
    implemented: true
    working: "NA"
    file: "backend/routes/factions.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "FactionBalanceOverview frontend reads from existing /api/factions endpoint. Verify factions data returns member counts and resources that the balance overview component can render."

frontend:
  - task: "Player Stats Component"
    implemented: true
    working: "NA"
    file: "frontend/src/components/PlayerStats.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Renders personal stats (sessions, playtime, KD), leaderboard tab, and activity history chart. Located in Players tab on dashboard. Calls GET /api/stats/me, /api/stats/leaderboard, /api/stats/history."

  - task: "Push Notification Setup Component"
    implemented: true
    working: "NA"
    file: "frontend/src/components/PushNotificationSetup.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Renders push notification subscription toggle and per-category preferences (high events, faction alerts, GM broadcasts, server status). Located in Players tab. Calls /api/notifications/* endpoints."

  - task: "World Event Composer Component"
    implemented: true
    working: "NA"
    file: "frontend/src/components/WorldEventComposer.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GM tool for composing and firing world events. Has template management and live fire capability. Located inside GameMasterPanel under 'world-event' tab. Admin only."

  - task: "Faction Balance Overview Component"
    implemented: true
    working: "NA"
    file: "frontend/src/components/FactionBalanceOverview.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Visual overview of faction strengths and resource balance. Located inside GameMasterPanel under 'faction-bal' tab. Admin only."

  - task: "Story Arc Scheduler Component"
    implemented: true
    working: "NA"
    file: "frontend/src/components/StoryArcScheduler.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Create/manage story arcs with steps, start/pause/abort lifecycle controls. Located inside GameMasterPanel under 'story-arcs' tab. Admin only."

  - task: "Player Heat Map & Analytics Component"
    implemented: true
    working: "NA"
    file: "frontend/src/components/PlayerAnalytics.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Displays player activity heatmap and analytics summary. Located inside GameMasterPanel under 'analytics' tab. Admin only."

  - task: "NPC Panel Component"
    implemented: true
    working: "NA"
    file: "frontend/src/components/NPCPanel.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Full NPC management UI: create/edit/delete NPCs, set status, spawn, director commands. Located inside GameMasterPanel under 'npcs' tab. Admin only."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 10
  run_ui: true

test_plan:
  current_focus:
    - "Player Stats API"
    - "Player Stats Component"
    - "Push Notifications API"
    - "Push Notification Setup Component"
    - "World Event Composer API"
    - "World Event Composer Component"
    - "Faction Balance Overview API"
    - "Faction Balance Overview Component"
    - "Story Arc Scheduler API"
    - "Story Arc Scheduler Component"
    - "Player Heat Map & Analytics Component"
    - "Player Analytics API"
    - "NPC Panel API"
    - "NPC Panel Component"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Phase 2.5 complete. 7 new features have been implemented and integrated into the dashboard but
      have NOT yet been tested end-to-end. Please test all 14 tasks (7 backend + 7 frontend) listed
      in test_plan.current_focus.

      KEY CONTEXT:
      - Login: commander@deadsignal.com / DeadSignal2024! (admin/server-admin role)
      - The 5 GM tools (WorldEventComposer, FactionBalanceOverview, StoryArcScheduler,
        PlayerAnalytics, NPCPanel) are all inside the Game Master tab → GameMasterPanel component.
        GameMasterPanel has its own sub-tab bar. Navigate to each sub-tab to test.
      - PlayerStats and PushNotificationSetup are in the Players tab.
      - Push Notifications: VAPID keys may not be configured in .env — if so, subscribe endpoint
        returns 503. Test the UI renders correctly regardless; note the 503 is expected.
      - World Event Composer fires events via RCON to Pterodactyl — RCON may not respond in test
        env. The UI should handle errors gracefully (show error toast, not crash).
      - Story Arc Scheduler: test create arc, start it, pause it, abort it. Verify state transitions
        appear correctly in the UI.
      - NPC Panel: test create NPC, update status, spawn, delete. Also test director command flow.
      - Player Analytics and Player Stats pull from player_sessions and events collections which
        may be empty in test env — the components should render empty states gracefully.
      - All admin-only endpoints should return 403 for non-admin users.

      Please run backend API tests first (pytest or direct HTTP), then UI tests. Report all findings
      back in this file.
