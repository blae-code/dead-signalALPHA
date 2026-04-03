"""
Game Master API Tests - Dead Signal
Tests all GM endpoints: stats, tasks, broadcasts, player admin, triggers, quick commands, action log
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review_request
ADMIN_CALLSIGN = "Commander"
ADMIN_AUTH_KEY = "DS-NV3F-CQ4Q-STFP-CVGN"
PLAYER_CALLSIGN = "TestPlayer2"
PLAYER_AUTH_KEY = "DS-4CYN-JXJ4-D65K-4LDK"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "callsign": ADMIN_CALLSIGN,
        "auth_key": ADMIN_AUTH_KEY
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


@pytest.fixture(scope="module")
def player_token():
    """Get non-admin player token for 403 tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "callsign": PLAYER_CALLSIGN,
        "auth_key": PLAYER_AUTH_KEY
    })
    assert response.status_code == 200, f"Player login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


@pytest.fixture
def admin_headers(admin_token):
    """Headers with admin auth"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def player_headers(player_token):
    """Headers with player auth (non-admin)"""
    return {"Authorization": f"Bearer {player_token}", "Content-Type": "application/json"}


# ==================== GM STATS ====================

class TestGMStats:
    """Test GET /api/gm/stats endpoint"""
    
    def test_gm_stats_returns_all_fields(self, admin_headers):
        """GM stats should return all required stat fields"""
        response = requests.get(f"{BASE_URL}/api/gm/stats", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        required_fields = ['active_tasks', 'tracked_players', 'banned_players', 'active_triggers', 'broadcasts_24h', 'actions_24h']
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
            assert isinstance(data[field], int), f"{field} should be int, got {type(data[field])}"
        
        print(f"GM Stats: {data}")
    
    def test_gm_stats_requires_admin(self, player_headers):
        """Non-admin should get 403 on GM stats"""
        response = requests.get(f"{BASE_URL}/api/gm/stats", headers=player_headers)
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"


# ==================== SCHEDULED TASKS ====================

class TestScheduledTasks:
    """Test scheduled task CRUD endpoints"""
    
    created_task_id = None
    
    def test_list_tasks(self, admin_headers):
        """GET /api/gm/tasks should return list of tasks"""
        response = requests.get(f"{BASE_URL}/api/gm/tasks", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Tasks should be a list"
        print(f"Found {len(data)} existing tasks")
    
    def test_create_task_restart(self, admin_headers):
        """POST /api/gm/tasks should create a restart task"""
        payload = {
            "name": "TEST_AutoRestart",
            "action": "restart",
            "params": {"warn_minutes": 2},
            "interval_minutes": 360,
            "enabled": False  # Disabled so it doesn't actually run
        }
        response = requests.post(f"{BASE_URL}/api/gm/tasks", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Create task failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_AutoRestart"
        assert data["action"] == "restart"
        assert data["enabled"] == False
        assert "task_id" in data
        
        TestScheduledTasks.created_task_id = data["task_id"]
        print(f"Created task: {data['task_id']}")
    
    def test_create_task_broadcast(self, admin_headers):
        """POST /api/gm/tasks should create a broadcast task"""
        payload = {
            "name": "TEST_HourlyBroadcast",
            "action": "broadcast",
            "params": {"message": "Test broadcast message"},
            "interval_minutes": 60,
            "enabled": False
        }
        response = requests.post(f"{BASE_URL}/api/gm/tasks", json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["action"] == "broadcast"
    
    def test_create_task_invalid_action(self, admin_headers):
        """POST /api/gm/tasks with invalid action should return 400"""
        payload = {
            "name": "TEST_Invalid",
            "action": "invalid_action",
            "interval_minutes": 60
        }
        response = requests.post(f"{BASE_URL}/api/gm/tasks", json=payload, headers=admin_headers)
        assert response.status_code == 400, f"Expected 400 for invalid action, got {response.status_code}"
    
    def test_update_task(self, admin_headers):
        """PATCH /api/gm/tasks/{task_id} should update task"""
        if not TestScheduledTasks.created_task_id:
            pytest.skip("No task created to update")
        
        response = requests.patch(
            f"{BASE_URL}/api/gm/tasks/{TestScheduledTasks.created_task_id}",
            json={"enabled": True, "name": "TEST_AutoRestart_Updated"},
            headers=admin_headers
        )
        assert response.status_code == 200
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/gm/tasks", headers=admin_headers)
        tasks = response.json()
        updated = next((t for t in tasks if t["task_id"] == TestScheduledTasks.created_task_id), None)
        assert updated is not None
        assert updated["enabled"] == True
    
    def test_run_task_now(self, admin_headers):
        """POST /api/gm/tasks/{task_id}/run-now should queue task"""
        if not TestScheduledTasks.created_task_id:
            pytest.skip("No task created to run")
        
        response = requests.post(
            f"{BASE_URL}/api/gm/tasks/{TestScheduledTasks.created_task_id}/run-now",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
    
    def test_delete_task(self, admin_headers):
        """DELETE /api/gm/tasks/{task_id} should delete task"""
        if not TestScheduledTasks.created_task_id:
            pytest.skip("No task created to delete")
        
        response = requests.delete(
            f"{BASE_URL}/api/gm/tasks/{TestScheduledTasks.created_task_id}",
            headers=admin_headers
        )
        assert response.status_code == 200
        
        # Verify deletion
        response = requests.get(f"{BASE_URL}/api/gm/tasks", headers=admin_headers)
        tasks = response.json()
        deleted = next((t for t in tasks if t["task_id"] == TestScheduledTasks.created_task_id), None)
        assert deleted is None, "Task should be deleted"
    
    def test_tasks_require_admin(self, player_headers):
        """Non-admin should get 403 on task endpoints"""
        response = requests.get(f"{BASE_URL}/api/gm/tasks", headers=player_headers)
        assert response.status_code == 403


# ==================== BROADCASTS ====================

class TestBroadcasts:
    """Test broadcast endpoints"""
    
    def test_list_broadcasts(self, admin_headers):
        """GET /api/gm/broadcasts should return broadcast history"""
        response = requests.get(f"{BASE_URL}/api/gm/broadcasts", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} broadcasts in history")
    
    def test_send_broadcast(self, admin_headers):
        """POST /api/gm/broadcast should send a broadcast"""
        # Using a safe test message
        payload = {"message": "TEST: System check complete"}
        response = requests.post(f"{BASE_URL}/api/gm/broadcast", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Broadcast failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"Broadcast sent: {data}")
    
    def test_send_broadcast_empty_message(self, admin_headers):
        """POST /api/gm/broadcast with empty message should return 400"""
        payload = {"message": "   "}
        response = requests.post(f"{BASE_URL}/api/gm/broadcast", json=payload, headers=admin_headers)
        assert response.status_code == 400
    
    def test_broadcasts_require_admin(self, player_headers):
        """Non-admin should get 403 on broadcast endpoints"""
        response = requests.get(f"{BASE_URL}/api/gm/broadcasts", headers=player_headers)
        assert response.status_code == 403
        
        response = requests.post(f"{BASE_URL}/api/gm/broadcast", json={"message": "test"}, headers=player_headers)
        assert response.status_code == 403


# ==================== PLAYER ADMIN ====================

class TestPlayerAdmin:
    """Test player admin endpoints"""
    
    def test_list_managed_players(self, admin_headers):
        """GET /api/gm/players should return tracked players"""
        response = requests.get(f"{BASE_URL}/api/gm/players", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} tracked players")
    
    def test_get_player_profile(self, admin_headers):
        """GET /api/gm/players/{player_name} should return player profile"""
        # Test with a known player name
        response = requests.get(f"{BASE_URL}/api/gm/players/TestSurvivor", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "profile" in data
        assert "notes" in data
        assert "actions" in data
        assert "sessions" in data
        print(f"Player profile: {data['profile']}")
    
    def test_add_player_note(self, admin_headers):
        """POST /api/gm/players/note should add a note"""
        payload = {
            "player_name": "TEST_Player",
            "note": "Test note for automated testing",
            "note_type": "info"
        }
        response = requests.post(f"{BASE_URL}/api/gm/players/note", json=payload, headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["player_name"] == "TEST_Player"
        assert data["note_type"] == "info"
    
    def test_add_watchlist_note(self, admin_headers):
        """POST /api/gm/players/note with watchlist type"""
        payload = {
            "player_name": "TEST_WatchPlayer",
            "note": "Suspicious activity - automated test",
            "note_type": "watchlist"
        }
        response = requests.post(f"{BASE_URL}/api/gm/players/note", json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["note_type"] == "watchlist"
    
    def test_player_action_warn(self, admin_headers):
        """POST /api/gm/players/action with warn action"""
        payload = {
            "player_name": "TEST_WarnPlayer",
            "action": "warn",
            "reason": "Test warning - automated test"
        }
        response = requests.post(f"{BASE_URL}/api/gm/players/action", json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "warn" in data["message"].lower()
    
    def test_list_banned_players(self, admin_headers):
        """GET /api/gm/players/banned should return banned list"""
        response = requests.get(f"{BASE_URL}/api/gm/players/banned", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} banned players")
    
    def test_get_watchlist(self, admin_headers):
        """GET /api/gm/players/watchlist should return watchlist notes"""
        response = requests.get(f"{BASE_URL}/api/gm/players/watchlist", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} watchlist entries")
    
    def test_player_admin_requires_admin(self, player_headers):
        """Non-admin should get 403 on player admin endpoints"""
        response = requests.get(f"{BASE_URL}/api/gm/players", headers=player_headers)
        assert response.status_code == 403
        
        response = requests.get(f"{BASE_URL}/api/gm/players/banned", headers=player_headers)
        assert response.status_code == 403


# ==================== EVENT TRIGGERS ====================

class TestEventTriggers:
    """Test event trigger endpoints"""
    
    created_trigger_id = None
    
    def test_list_triggers(self, admin_headers):
        """GET /api/gm/triggers should return triggers list"""
        response = requests.get(f"{BASE_URL}/api/gm/triggers", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} triggers")
        
        # Check if Welcome Message trigger exists (from seed data)
        welcome = next((t for t in data if "Welcome" in t.get("name", "")), None)
        if welcome:
            print(f"Found Welcome Message trigger: {welcome['trigger_id']}")
    
    def test_create_trigger(self, admin_headers):
        """POST /api/gm/triggers should create a trigger"""
        payload = {
            "name": "TEST_DeathAnnounce",
            "trigger_event": "player_death",
            "action": "broadcast",
            "params": {"message": "A survivor has fallen: {player}"},
            "enabled": False,
            "cooldown_seconds": 10
        }
        response = requests.post(f"{BASE_URL}/api/gm/triggers", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Create trigger failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_DeathAnnounce"
        assert data["trigger_event"] == "player_death"
        assert "trigger_id" in data
        
        TestEventTriggers.created_trigger_id = data["trigger_id"]
        print(f"Created trigger: {data['trigger_id']}")
    
    def test_toggle_trigger(self, admin_headers):
        """PATCH /api/gm/triggers/{trigger_id} should toggle trigger"""
        if not TestEventTriggers.created_trigger_id:
            pytest.skip("No trigger created to toggle")
        
        response = requests.patch(
            f"{BASE_URL}/api/gm/triggers/{TestEventTriggers.created_trigger_id}",
            json={"enabled": True},
            headers=admin_headers
        )
        assert response.status_code == 200
    
    def test_delete_trigger(self, admin_headers):
        """DELETE /api/gm/triggers/{trigger_id} should delete trigger"""
        if not TestEventTriggers.created_trigger_id:
            pytest.skip("No trigger created to delete")
        
        response = requests.delete(
            f"{BASE_URL}/api/gm/triggers/{TestEventTriggers.created_trigger_id}",
            headers=admin_headers
        )
        assert response.status_code == 200
    
    def test_triggers_require_admin(self, player_headers):
        """Non-admin should get 403 on trigger endpoints"""
        response = requests.get(f"{BASE_URL}/api/gm/triggers", headers=player_headers)
        assert response.status_code == 403


# ==================== QUICK COMMANDS ====================

class TestQuickCommands:
    """Test quick command endpoints"""
    
    created_cmd_id = None
    
    def test_list_quick_commands(self, admin_headers):
        """GET /api/gm/quick-commands should return saved commands"""
        response = requests.get(f"{BASE_URL}/api/gm/quick-commands", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} quick commands")
    
    def test_create_quick_command(self, admin_headers):
        """POST /api/gm/quick-commands should save a command"""
        payload = {
            "command": "save",
            "description": "TEST: Force save world"
        }
        response = requests.post(f"{BASE_URL}/api/gm/quick-commands", json=payload, headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["command"] == "save"
        assert "cmd_id" in data
        
        TestQuickCommands.created_cmd_id = data["cmd_id"]
        print(f"Created quick command: {data['cmd_id']}")
    
    def test_execute_quick_command(self, admin_headers):
        """POST /api/gm/quick-commands/{cmd_id}/execute should execute command"""
        if not TestQuickCommands.created_cmd_id:
            pytest.skip("No command created to execute")
        
        response = requests.post(
            f"{BASE_URL}/api/gm/quick-commands/{TestQuickCommands.created_cmd_id}/execute",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
    
    def test_delete_quick_command(self, admin_headers):
        """DELETE /api/gm/quick-commands/{cmd_id} should delete command"""
        if not TestQuickCommands.created_cmd_id:
            pytest.skip("No command created to delete")
        
        response = requests.delete(
            f"{BASE_URL}/api/gm/quick-commands/{TestQuickCommands.created_cmd_id}",
            headers=admin_headers
        )
        assert response.status_code == 200
    
    def test_execute_nonexistent_command(self, admin_headers):
        """POST /api/gm/quick-commands/{cmd_id}/execute with invalid ID should return 404"""
        response = requests.post(
            f"{BASE_URL}/api/gm/quick-commands/nonexistent123/execute",
            headers=admin_headers
        )
        assert response.status_code == 404
    
    def test_quick_commands_require_admin(self, player_headers):
        """Non-admin should get 403 on quick command endpoints"""
        response = requests.get(f"{BASE_URL}/api/gm/quick-commands", headers=player_headers)
        assert response.status_code == 403


# ==================== ACTION LOG ====================

class TestActionLog:
    """Test action log endpoint"""
    
    def test_get_action_log(self, admin_headers):
        """GET /api/gm/log should return action log"""
        response = requests.get(f"{BASE_URL}/api/gm/log", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} action log entries")
        
        # Verify log entry structure
        if len(data) > 0:
            entry = data[0]
            assert "action" in entry
            assert "timestamp" in entry
            assert "actor" in entry
    
    def test_action_log_with_limit(self, admin_headers):
        """GET /api/gm/log?limit=10 should respect limit"""
        response = requests.get(f"{BASE_URL}/api/gm/log?limit=10", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 10
    
    def test_action_log_requires_admin(self, player_headers):
        """Non-admin should get 403 on action log"""
        response = requests.get(f"{BASE_URL}/api/gm/log", headers=player_headers)
        assert response.status_code == 403


# ==================== CLEANUP ====================

class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_tasks(self, admin_headers):
        """Remove TEST_ prefixed tasks"""
        response = requests.get(f"{BASE_URL}/api/gm/tasks", headers=admin_headers)
        if response.status_code == 200:
            tasks = response.json()
            for task in tasks:
                if task.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/gm/tasks/{task['task_id']}", headers=admin_headers)
                    print(f"Cleaned up task: {task['name']}")
    
    def test_cleanup_test_triggers(self, admin_headers):
        """Remove TEST_ prefixed triggers"""
        response = requests.get(f"{BASE_URL}/api/gm/triggers", headers=admin_headers)
        if response.status_code == 200:
            triggers = response.json()
            for trigger in triggers:
                if trigger.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/gm/triggers/{trigger['trigger_id']}", headers=admin_headers)
                    print(f"Cleaned up trigger: {trigger['name']}")
    
    def test_cleanup_test_commands(self, admin_headers):
        """Remove TEST_ prefixed quick commands"""
        response = requests.get(f"{BASE_URL}/api/gm/quick-commands", headers=admin_headers)
        if response.status_code == 200:
            commands = response.json()
            for cmd in commands:
                if cmd.get("description", "").startswith("TEST:"):
                    requests.delete(f"{BASE_URL}/api/gm/quick-commands/{cmd['cmd_id']}", headers=admin_headers)
                    print(f"Cleaned up command: {cmd['command']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
