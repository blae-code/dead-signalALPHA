"""
Dead Signal GM Features Backend Tests
=====================================
Tests for Game Master tools: World Events, Story Arcs, Factions, Analytics, Notifications

Test credentials:
  Admin: blae@katrasoluta.com / Kx9#mZvR!2026gM (callsign: GameMaster)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://faction-wars-17.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "blae@katrasoluta.com"
ADMIN_PASSWORD = "Kx9#mZvR!2026gM"


class TestAuth:
    """Authentication tests - login flow"""
    
    def test_login_success(self, api_client):
        """Test admin login with correct credentials"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # Response structure: {"user": {...}, "message": "..."}
        user = data.get("user", data)  # Handle both flat and nested response
        assert "callsign" in user, f"Response should contain callsign: {data}"
        assert user["callsign"] == "GameMaster", f"Expected GameMaster, got {user.get('callsign')}"
        assert user.get("role") == "system_admin", f"Expected system_admin role, got {user.get('role')}"
        print(f"✓ Login successful: {user['callsign']} ({user['role']})")


class TestWorldEvents:
    """World Events API tests - /api/gm/world-events/*"""
    
    def test_fire_world_event(self, authenticated_client):
        """POST /api/gm/world-events/fire - fire a custom world event"""
        response = authenticated_client.post(f"{BASE_URL}/api/gm/world-events/fire", json={
            "event_type": "custom",
            "label": "TEST_Artillery Strike",
            "narrative": "Shells rain from the south",
            "intensity": 7
        })
        assert response.status_code == 200, f"Fire event failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "event" in data, "Response should contain event object"
        print(f"✓ World event fired: {data['message']}")
    
    def test_create_template(self, authenticated_client):
        """POST /api/gm/world-events/templates - create a template"""
        template_name = f"TEST_Siege_{uuid.uuid4().hex[:6]}"
        response = authenticated_client.post(f"{BASE_URL}/api/gm/world-events/templates", json={
            "name": template_name,
            "event_type": "custom"
        })
        assert response.status_code == 200, f"Create template failed: {response.text}"
        data = response.json()
        assert "template_id" in data, "Response should contain template_id"
        assert data["name"] == template_name, f"Template name mismatch"
        print(f"✓ Template created: {data['name']} (id: {data['template_id']})")
        return data["template_id"]
    
    def test_list_templates(self, authenticated_client):
        """GET /api/gm/world-events/templates - list templates"""
        response = authenticated_client.get(f"{BASE_URL}/api/gm/world-events/templates")
        assert response.status_code == 200, f"List templates failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        print(f"✓ Templates listed: {len(data)} templates")


class TestStoryArcs:
    """Story Arcs API tests - /api/gm/story-arcs/*"""
    
    def test_create_story_arc(self, authenticated_client):
        """POST /api/gm/story-arcs/ - create a story arc"""
        arc_name = f"TEST_Sunset Protocol_{uuid.uuid4().hex[:6]}"
        response = authenticated_client.post(f"{BASE_URL}/api/gm/story-arcs/", json={
            "name": arc_name,
            "timing_mode": "sequential",
            "steps": [{
                "order": 0,
                "delay_minutes": 1,
                "action_type": "broadcast",
                "params": {"message": "Sunset approaches"},
                "label": "Warning"
            }]
        })
        assert response.status_code == 200, f"Create arc failed: {response.text}"
        data = response.json()
        assert "arc_id" in data, "Response should contain arc_id"
        assert data["name"] == arc_name, f"Arc name mismatch"
        assert data["status"] == "draft", f"New arc should be in draft status"
        print(f"✓ Story arc created: {data['name']} (id: {data['arc_id']})")
        return data["arc_id"]
    
    def test_list_story_arcs(self, authenticated_client):
        """GET /api/gm/story-arcs/ - list story arcs"""
        response = authenticated_client.get(f"{BASE_URL}/api/gm/story-arcs/")
        assert response.status_code == 200, f"List arcs failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        # Each arc should have arc_id field
        for arc in data:
            assert "arc_id" in arc, f"Arc missing arc_id field: {arc}"
        print(f"✓ Story arcs listed: {len(data)} arcs")
        return data
    
    def test_start_story_arc(self, authenticated_client):
        """POST /api/gm/story-arcs/{arc_id}/start - start a story arc"""
        # First create an arc
        arc_name = f"TEST_Start_Arc_{uuid.uuid4().hex[:6]}"
        create_response = authenticated_client.post(f"{BASE_URL}/api/gm/story-arcs/", json={
            "name": arc_name,
            "timing_mode": "sequential",
            "steps": [{
                "order": 0,
                "delay_minutes": 1,
                "action_type": "broadcast",
                "params": {"message": "Test broadcast"},
                "label": "Test Step"
            }]
        })
        assert create_response.status_code == 200, f"Create arc failed: {create_response.text}"
        arc_id = create_response.json()["arc_id"]
        
        # Now start it
        start_response = authenticated_client.post(f"{BASE_URL}/api/gm/story-arcs/{arc_id}/start")
        assert start_response.status_code == 200, f"Start arc failed: {start_response.text}"
        data = start_response.json()
        assert "message" in data, "Response should contain message"
        print(f"✓ Story arc started: {arc_id}")
        
        # Abort it to clean up
        authenticated_client.post(f"{BASE_URL}/api/gm/story-arcs/{arc_id}/abort")


class TestFactions:
    """Factions API tests - /api/gm/factions/*"""
    
    def test_faction_overview(self, authenticated_client):
        """GET /api/gm/factions/overview - returns array with numeric reputation"""
        response = authenticated_client.get(f"{BASE_URL}/api/gm/factions/overview")
        assert response.status_code == 200, f"Faction overview failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        
        # Verify reputation is numeric (not object)
        for faction in data:
            rep = faction.get("reputation")
            assert isinstance(rep, (int, float)), f"Reputation should be numeric, got {type(rep)}: {rep}"
        
        print(f"✓ Faction overview: {len(data)} factions, all with numeric reputation")


class TestAnalytics:
    """Analytics API tests - /api/gm/analytics/*"""
    
    def test_player_analytics(self, authenticated_client):
        """GET /api/gm/analytics/players - returns array of player objects"""
        response = authenticated_client.get(f"{BASE_URL}/api/gm/analytics/players")
        assert response.status_code == 200, f"Player analytics failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        
        # Verify player objects have expected fields
        for player in data[:5]:  # Check first 5
            assert "player_name" in player, f"Player missing player_name: {player}"
            assert "kills" in player, f"Player missing kills: {player}"
            assert "deaths" in player, f"Player missing deaths: {player}"
            assert "kd_ratio" in player, f"Player missing kd_ratio: {player}"
            assert "session_count" in player, f"Player missing session_count: {player}"
        
        print(f"✓ Player analytics: {len(data)} players with correct fields")


class TestStats:
    """Player Stats API tests - /api/stats/*"""
    
    def test_my_stats(self, authenticated_client):
        """GET /api/stats/me - returns player stats for logged-in user"""
        response = authenticated_client.get(f"{BASE_URL}/api/stats/me")
        assert response.status_code == 200, f"My stats failed: {response.text}"
        data = response.json()
        assert "callsign" in data, "Response should contain callsign"
        print(f"✓ My stats: {data.get('callsign')}")
    
    def test_leaderboard(self, authenticated_client):
        """GET /api/stats/leaderboard - returns leaderboard data"""
        response = authenticated_client.get(f"{BASE_URL}/api/stats/leaderboard")
        assert response.status_code == 200, f"Leaderboard failed: {response.text}"
        data = response.json()
        # Should have by_kills, by_playtime, by_kd
        assert "by_kills" in data, "Response should contain by_kills"
        assert "by_playtime" in data, "Response should contain by_playtime"
        assert "by_kd" in data, "Response should contain by_kd"
        print(f"✓ Leaderboard: {len(data.get('by_kills', []))} kill leaders")


class TestNotifications:
    """Notifications API tests - /api/notifications/*"""
    
    def test_subscribe(self, authenticated_client):
        """POST /api/notifications/subscribe - subscription endpoint"""
        response = authenticated_client.post(f"{BASE_URL}/api/notifications/subscribe", json={
            "subscription": {
                "endpoint": "https://test.push.example.com",
                "keys": {
                    "p256dh": "test_p256dh_key",
                    "auth": "test_auth_key"
                }
            }
        })
        assert response.status_code == 200, f"Subscribe failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        print(f"✓ Subscribed: {data['message']}")
    
    def test_get_preferences(self, authenticated_client):
        """GET /api/notifications/preferences - returns preferences object"""
        response = authenticated_client.get(f"{BASE_URL}/api/notifications/preferences")
        assert response.status_code == 200, f"Get preferences failed: {response.text}"
        data = response.json()
        assert "subscribed" in data, "Response should contain subscribed"
        assert "preferences" in data, "Response should contain preferences"
        print(f"✓ Preferences: subscribed={data['subscribed']}")
    
    def test_update_preferences(self, authenticated_client):
        """PATCH /api/notifications/preferences - update single preference"""
        # First ensure we're subscribed
        authenticated_client.post(f"{BASE_URL}/api/notifications/subscribe", json={
            "subscription": {
                "endpoint": "https://test.push.example.com",
                "keys": {"p256dh": "test", "auth": "test"}
            }
        })
        
        response = authenticated_client.patch(f"{BASE_URL}/api/notifications/preferences", json={
            "high_events": False
        })
        assert response.status_code == 200, f"Update preferences failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        print(f"✓ Preferences updated: {data['message']}")
    
    def test_unsubscribe(self, authenticated_client):
        """DELETE /api/notifications/subscribe - unsubscribe endpoint"""
        response = authenticated_client.delete(f"{BASE_URL}/api/notifications/subscribe")
        assert response.status_code == 200, f"Unsubscribe failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        print(f"✓ Unsubscribed: {data['message']}")


# ==================== FIXTURES ====================

@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def authenticated_client(api_client):
    """Session with auth cookies from login"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.text}")
    
    # Cookies are automatically stored in the session
    return api_client


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data(authenticated_client):
    """Cleanup TEST_ prefixed data after all tests complete"""
    yield
    # Cleanup story arcs
    try:
        arcs = authenticated_client.get(f"{BASE_URL}/api/gm/story-arcs/").json()
        for arc in arcs:
            if arc.get("name", "").startswith("TEST_"):
                if arc.get("status") in ("active", "paused"):
                    authenticated_client.post(f"{BASE_URL}/api/gm/story-arcs/{arc['arc_id']}/abort")
                authenticated_client.delete(f"{BASE_URL}/api/gm/story-arcs/{arc['arc_id']}")
    except Exception:
        pass
    
    # Cleanup templates
    try:
        templates = authenticated_client.get(f"{BASE_URL}/api/gm/world-events/templates").json()
        for t in templates:
            if t.get("name", "").startswith("TEST_"):
                authenticated_client.delete(f"{BASE_URL}/api/gm/world-events/templates/{t['template_id']}")
    except Exception:
        pass
