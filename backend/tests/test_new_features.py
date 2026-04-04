"""
Test suite for Dead Signal new features (iteration 10):
- Player Stats (GET /api/stats/me, GET /api/stats/leaderboard)
- World Events (POST /api/gm/world-events/fire, GET/POST /api/gm/world-events/templates)
- Story Arcs (GET/POST /api/gm/story-arcs/, POST /api/gm/story-arcs/{arc_id}/start)
- Faction Balance Overview (GET /api/gm/factions/overview)
- Player Analytics (GET /api/gm/analytics/players)
- Push Notifications (POST /api/notifications/subscribe)
"""

import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials from test_credentials.md
ADMIN_EMAIL = "blae@katrasoluta.com"
ADMIN_PASSWORD = "Kx9#mZvR!2026gM"

# Secondary admin
SECONDARY_ADMIN_EMAIL = "commander@deadsignal.com"
SECONDARY_ADMIN_PASSWORD = "DeadSignal2024!"


@pytest.fixture(scope="module")
def admin_session():
    """Login as admin and return authenticated session with cookies."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    
    if response.status_code != 200:
        # Try secondary admin
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SECONDARY_ADMIN_EMAIL, "password": SECONDARY_ADMIN_PASSWORD},
            timeout=20,
        )
    
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    return session


class TestPlayerStats:
    """Test player stats endpoints - GET /api/stats/me and GET /api/stats/leaderboard"""
    
    def test_get_my_stats(self, admin_session):
        """GET /api/stats/me - returns player stats object"""
        response = admin_session.get(f"{BASE_URL}/api/stats/me", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "callsign" in data, "Response should contain callsign"
        assert "kills" in data, "Response should contain kills"
        assert "deaths" in data, "Response should contain deaths"
        assert "kd_ratio" in data, "Response should contain kd_ratio"
        assert "total_sessions" in data or "total_playtime_hours" in data, "Response should contain session data"
        
        print(f"✓ Player stats retrieved: callsign={data.get('callsign')}, kills={data.get('kills')}, deaths={data.get('deaths')}")
    
    def test_get_leaderboard(self, admin_session):
        """GET /api/stats/leaderboard - returns leaderboard with by_kills, by_playtime arrays"""
        response = admin_session.get(f"{BASE_URL}/api/stats/leaderboard?limit=10", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "by_kills" in data, "Response should contain by_kills array"
        assert "by_playtime" in data, "Response should contain by_playtime array"
        assert isinstance(data["by_kills"], list), "by_kills should be a list"
        assert isinstance(data["by_playtime"], list), "by_playtime should be a list"
        
        print(f"✓ Leaderboard retrieved: {len(data.get('by_kills', []))} kill leaders, {len(data.get('by_playtime', []))} playtime leaders")


class TestWorldEvents:
    """Test world events endpoints - GM tools for firing events and managing templates"""
    
    def test_fire_world_event(self, admin_session):
        """POST /api/gm/world-events/fire - fire a world event (requires admin)"""
        payload = {
            "event_type": "custom",
            "label": f"Test Event {uuid.uuid4().hex[:8]}",
            "intensity": 5
        }
        
        response = admin_session.post(
            f"{BASE_URL}/api/gm/world-events/fire",
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "event" in data, "Response should contain event object"
        
        event = data["event"]
        assert event.get("label") == payload["label"], "Event label should match"
        assert event.get("event_type") == payload["event_type"], "Event type should match"
        assert event.get("intensity") == payload["intensity"], "Event intensity should match"
        
        print(f"✓ World event fired: {data.get('message')}")
    
    def test_list_templates(self, admin_session):
        """GET /api/gm/world-events/templates - list saved templates"""
        response = admin_session.get(f"{BASE_URL}/api/gm/world-events/templates", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Templates listed: {len(data)} templates found")
    
    def test_create_template(self, admin_session):
        """POST /api/gm/world-events/templates - create template"""
        template_name = f"Test Template {uuid.uuid4().hex[:8]}"
        payload = {
            "name": template_name,
            "event_type": "airdrop",
            "description": "Test template for automated testing"
        }
        
        response = admin_session.post(
            f"{BASE_URL}/api/gm/world-events/templates",
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("name") == template_name, "Template name should match"
        assert data.get("event_type") == "airdrop", "Event type should match"
        assert "template_id" in data, "Response should contain template_id"
        
        print(f"✓ Template created: {data.get('name')} (id: {data.get('template_id')})")
        
        return data.get("template_id")


class TestStoryArcs:
    """Test story arc endpoints - GM tools for narrative scheduling"""
    
    def test_list_story_arcs(self, admin_session):
        """GET /api/gm/story-arcs/ - list story arcs"""
        response = admin_session.get(f"{BASE_URL}/api/gm/story-arcs/", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ Story arcs listed: {len(data)} arcs found")
    
    def test_create_story_arc(self, admin_session):
        """POST /api/gm/story-arcs/ - create arc with steps"""
        arc_name = f"Test Arc {uuid.uuid4().hex[:8]}"
        payload = {
            "name": arc_name,
            "timing_mode": "sequential",
            "steps": [
                {
                    "order": 0,
                    "delay_minutes": 1,
                    "action_type": "broadcast",
                    "params": {"message": "Test broadcast message"},
                    "label": "Step 1"
                }
            ]
        }
        
        response = admin_session.post(
            f"{BASE_URL}/api/gm/story-arcs/",
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("name") == arc_name, "Arc name should match"
        assert data.get("timing_mode") == "sequential", "Timing mode should match"
        assert data.get("status") == "draft", "New arc should be in draft status"
        assert "arc_id" in data, "Response should contain arc_id"
        assert len(data.get("steps", [])) == 1, "Arc should have 1 step"
        
        print(f"✓ Story arc created: {data.get('name')} (id: {data.get('arc_id')}, status: {data.get('status')})")
        
        return data.get("arc_id")
    
    def test_start_story_arc(self, admin_session):
        """POST /api/gm/story-arcs/{arc_id}/start - start a draft arc"""
        # First create an arc
        arc_name = f"Test Arc Start {uuid.uuid4().hex[:8]}"
        create_payload = {
            "name": arc_name,
            "timing_mode": "sequential",
            "steps": [
                {
                    "order": 0,
                    "delay_minutes": 1,
                    "action_type": "broadcast",
                    "params": {"message": "Test start message"},
                    "label": "Start Step"
                }
            ]
        }
        
        create_response = admin_session.post(
            f"{BASE_URL}/api/gm/story-arcs/",
            json=create_payload,
            timeout=20
        )
        
        assert create_response.status_code == 200, f"Arc creation failed: {create_response.text}"
        arc_id = create_response.json().get("arc_id")
        
        # Now start the arc
        start_response = admin_session.post(
            f"{BASE_URL}/api/gm/story-arcs/{arc_id}/start",
            timeout=20
        )
        
        assert start_response.status_code == 200, f"Expected 200, got {start_response.status_code}: {start_response.text}"
        
        data = start_response.json()
        assert "message" in data, "Response should contain message"
        assert "next_step_at" in data, "Response should contain next_step_at"
        
        print(f"✓ Story arc started: {data.get('message')}, next_step_at: {data.get('next_step_at')}")


class TestFactionBalance:
    """Test faction balance overview endpoint - GM analytics"""
    
    def test_get_faction_overview(self, admin_session):
        """GET /api/gm/factions/overview - faction balance overview data"""
        response = admin_session.get(f"{BASE_URL}/api/gm/factions/overview", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # If there are factions, verify structure
        if len(data) > 0:
            faction = data[0]
            assert "name" in faction, "Faction should have name"
            assert "member_count" in faction, "Faction should have member_count"
            print(f"✓ Faction overview retrieved: {len(data)} factions, top faction: {faction.get('name')} ({faction.get('member_count')} members)")
        else:
            print(f"✓ Faction overview retrieved: 0 factions (empty list is valid)")


class TestPlayerAnalytics:
    """Test player analytics endpoint - GM player tracking"""
    
    def test_get_player_analytics(self, admin_session):
        """GET /api/gm/analytics/players - player analytics data"""
        response = admin_session.get(f"{BASE_URL}/api/gm/analytics/players", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # If there are players, verify structure
        if len(data) > 0:
            player = data[0]
            assert "player_name" in player, "Player should have player_name"
            print(f"✓ Player analytics retrieved: {len(data)} players tracked")
        else:
            print(f"✓ Player analytics retrieved: 0 players (empty list is valid)")


class TestPushNotifications:
    """Test push notification endpoints"""
    
    def test_get_vapid_key(self, admin_session):
        """GET /api/notifications/vapid-key - get VAPID public key (public endpoint)"""
        response = admin_session.get(f"{BASE_URL}/api/notifications/vapid-key", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "public_key" in data, "Response should contain public_key"
        assert len(data["public_key"]) > 0, "Public key should not be empty"
        
        print(f"✓ VAPID public key retrieved: {data['public_key'][:20]}...")
    
    def test_subscribe_push_notification(self, admin_session):
        """POST /api/notifications/subscribe - push notification subscription endpoint"""
        # Create a mock subscription object (browser would generate this)
        mock_subscription = {
            "endpoint": f"https://fcm.googleapis.com/fcm/send/test-{uuid.uuid4().hex}",
            "keys": {
                "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
                "auth": "tBHItJI5svbpez7KI4CCXg"
            }
        }
        
        payload = {
            "subscription": mock_subscription
        }
        
        response = admin_session.post(
            f"{BASE_URL}/api/notifications/subscribe",
            json=payload,
            timeout=20
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        
        print(f"✓ Push notification subscription: {data.get('message')}")
    
    def test_get_notification_preferences(self, admin_session):
        """GET /api/notifications/preferences - get notification preferences"""
        response = admin_session.get(f"{BASE_URL}/api/notifications/preferences", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "subscribed" in data, "Response should contain subscribed status"
        assert "preferences" in data, "Response should contain preferences"
        
        print(f"✓ Notification preferences retrieved: subscribed={data.get('subscribed')}")


class TestGMStats:
    """Test GM stats endpoint"""
    
    def test_get_gm_stats(self, admin_session):
        """GET /api/gm/stats - GM dashboard stats"""
        response = admin_session.get(f"{BASE_URL}/api/gm/stats", timeout=20)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "active_tasks" in data, "Response should contain active_tasks"
        assert "tracked_players" in data, "Response should contain tracked_players"
        assert "banned_players" in data, "Response should contain banned_players"
        
        print(f"✓ GM stats retrieved: {data.get('active_tasks')} tasks, {data.get('tracked_players')} players tracked")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
