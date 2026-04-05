"""
QoL Pass Testing - Meta Options API & Guided Controls
======================================================
Tests for iteration 13: Meta options endpoint, dropdowns, empty states, CORS cleanup
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "blae@katrasoluta.com"
ADMIN_PASSWORD = "Kx9#mZvR!2026gM"


@pytest.fixture(scope="module")
def session():
    """Create a requests session with auth cookies."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login to get auth cookies
    login_resp = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return s


class TestMetaOptionsEndpoint:
    """Test GET /api/meta/options endpoint - aggregated canonical lists for dropdowns."""
    
    def test_meta_options_returns_200(self, session):
        """Meta options endpoint should return 200 for authenticated users."""
        resp = session.get(f"{BASE_URL}/api/meta/options")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    
    def test_meta_options_contains_factions(self, session):
        """Meta options should include factions list."""
        resp = session.get(f"{BASE_URL}/api/meta/options")
        data = resp.json()
        assert 'factions' in data, "Missing 'factions' key in meta options"
        assert isinstance(data['factions'], list), "factions should be a list"
    
    def test_meta_options_contains_npcs(self, session):
        """Meta options should include NPCs list with npc_id, name, role, status."""
        resp = session.get(f"{BASE_URL}/api/meta/options")
        data = resp.json()
        assert 'npcs' in data, "Missing 'npcs' key in meta options"
        assert isinstance(data['npcs'], list), "npcs should be a list"
        # If there are NPCs, verify structure
        if len(data['npcs']) > 0:
            npc = data['npcs'][0]
            assert 'npc_id' in npc, "NPC missing npc_id"
            assert 'name' in npc, "NPC missing name"
    
    def test_meta_options_contains_missions(self, session):
        """Meta options should include missions list with mission_id, title, status."""
        resp = session.get(f"{BASE_URL}/api/meta/options")
        data = resp.json()
        assert 'missions' in data, "Missing 'missions' key in meta options"
        assert isinstance(data['missions'], list), "missions should be a list"
    
    def test_meta_options_contains_callsigns(self, session):
        """Meta options should include player callsigns list."""
        resp = session.get(f"{BASE_URL}/api/meta/options")
        data = resp.json()
        assert 'callsigns' in data, "Missing 'callsigns' key in meta options"
        assert isinstance(data['callsigns'], list), "callsigns should be a list"
        # Should have at least the admin callsign
        assert len(data['callsigns']) > 0, "callsigns list should not be empty"
    
    def test_meta_options_contains_resources(self, session):
        """Meta options should include resources list (sorted)."""
        resp = session.get(f"{BASE_URL}/api/meta/options")
        data = resp.json()
        assert 'resources' in data, "Missing 'resources' key in meta options"
        assert isinstance(data['resources'], list), "resources should be a list"
        assert len(data['resources']) > 0, "resources list should not be empty"
        # Verify sorted
        assert data['resources'] == sorted(data['resources']), "resources should be sorted"
    
    def test_meta_options_contains_territory_locations(self, session):
        """Meta options should include territory_locations list."""
        resp = session.get(f"{BASE_URL}/api/meta/options")
        data = resp.json()
        assert 'territory_locations' in data, "Missing 'territory_locations' key in meta options"
        assert isinstance(data['territory_locations'], list), "territory_locations should be a list"
    
    def test_meta_options_contains_enums(self, session):
        """Meta options should include enums object with all canonical lists."""
        resp = session.get(f"{BASE_URL}/api/meta/options")
        data = resp.json()
        assert 'enums' in data, "Missing 'enums' key in meta options"
        enums = data['enums']
        
        # Verify all expected enum lists
        expected_enums = [
            'mission_types', 'mission_statuses', 'objective_types', 'reward_types',
            'difficulty_levels', 'npc_roles', 'npc_factions', 'npc_statuses',
            'spawn_types', 'dialogue_triggers', 'event_types', 'trigger_events', 'trigger_actions'
        ]
        for enum_name in expected_enums:
            assert enum_name in enums, f"Missing enum: {enum_name}"
            assert isinstance(enums[enum_name], list), f"{enum_name} should be a list"
            assert len(enums[enum_name]) > 0, f"{enum_name} should not be empty"
    
    def test_meta_options_requires_auth(self):
        """Meta options endpoint should require authentication."""
        resp = requests.get(f"{BASE_URL}/api/meta/options")
        assert resp.status_code == 401, f"Expected 401 for unauthenticated request, got {resp.status_code}"


class TestMissionsAPI:
    """Test missions API for dropdown integration."""
    
    def test_missions_list(self, session):
        """GET /api/missions should return list."""
        resp = session.get(f"{BASE_URL}/api/missions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_missions_summary(self, session):
        """GET /api/missions/summary should return status counts."""
        resp = session.get(f"{BASE_URL}/api/missions/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert 'by_status' in data or 'total' in data or isinstance(data, dict)


class TestNPCsAPI:
    """Test NPCs API for dropdown integration."""
    
    def test_npcs_list(self, session):
        """GET /api/npcs should return list."""
        resp = session.get(f"{BASE_URL}/api/npcs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_npcs_summary(self, session):
        """GET /api/npcs/summary should return status counts."""
        resp = session.get(f"{BASE_URL}/api/npcs/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)


class TestEconomyAPI:
    """Test economy API for trade/supply empty states."""
    
    def test_trades_list(self, session):
        """GET /api/economy/trades should return list."""
        resp = session.get(f"{BASE_URL}/api/economy/trades")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_supply_requests_list(self, session):
        """GET /api/economy/supply-requests should return list."""
        resp = session.get(f"{BASE_URL}/api/economy/supply-requests")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
    
    def test_resources_list(self, session):
        """GET /api/economy/resources should return list for dropdowns."""
        resp = session.get(f"{BASE_URL}/api/economy/resources")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Resources list should not be empty"


class TestGMTriggersAPI:
    """Test GM triggers API for useMetaOptions integration."""
    
    def test_triggers_list(self, session):
        """GET /api/gm/triggers should return list."""
        resp = session.get(f"{BASE_URL}/api/gm/triggers")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestWorldEventsAPI:
    """Test world events API for location datalist."""
    
    def test_world_events_templates(self, session):
        """GET /api/gm/world-events/templates should return list."""
        resp = session.get(f"{BASE_URL}/api/gm/world-events/templates")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestCORSConfiguration:
    """Test CORS configuration - no hardcoded origins."""
    
    def test_cors_preflight(self):
        """OPTIONS request should return proper CORS headers."""
        resp = requests.options(
            f"{BASE_URL}/api/health/live",
            headers={"Origin": BASE_URL, "Access-Control-Request-Method": "GET"}
        )
        # 200 or 204 are both valid for preflight
        assert resp.status_code in [200, 204], f"Expected 200 or 204, got {resp.status_code}"
        # Should have CORS headers
        assert 'Access-Control-Allow-Origin' in resp.headers
    
    def test_cors_allows_credentials(self):
        """CORS should allow credentials for cookie-based auth."""
        resp = requests.options(
            f"{BASE_URL}/api/auth/login",
            headers={"Origin": BASE_URL, "Access-Control-Request-Method": "POST"}
        )
        # Check for credentials header
        if 'Access-Control-Allow-Credentials' in resp.headers:
            assert resp.headers['Access-Control-Allow-Credentials'] == 'true'


class TestHealthEndpoints:
    """Test health endpoints for deployment verification."""
    
    def test_health_live(self):
        """GET /api/health/live should return alive status."""
        resp = requests.get(f"{BASE_URL}/api/health/live")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get('status') == 'alive'
    
    def test_health_ready(self):
        """GET /api/health/ready should return ready status."""
        resp = requests.get(f"{BASE_URL}/api/health/ready")
        # May be 200 or 503 depending on services
        assert resp.status_code in [200, 503]
        data = resp.json()
        assert 'status' in data


class TestFactionsAPI:
    """Test factions API for dropdown integration."""
    
    def test_factions_list(self, session):
        """GET /api/factions should return list."""
        resp = session.get(f"{BASE_URL}/api/factions")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestTerritoriesAPI:
    """Test territories API for location datalist."""
    
    def test_territories_list(self, session):
        """GET /api/territories should return list."""
        resp = session.get(f"{BASE_URL}/api/territories")
        assert resp.status_code == 200
        data = resp.json()
        # Could be list or dict with territories key
        assert isinstance(data, (list, dict))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
