"""
Test New Features: Territory Map, Diplomat AI, Player Count
============================================================
Tests for iteration 10 - three new features:
1. Territory Map (CRUD, summary, markers)
2. Diplomat AI (reputation matrix, analysis, treaty recommendation)
3. Player Count (online_players, online_count)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "blae@katrasoluta.com"
ADMIN_PASSWORD = "Kx9#mZvR!2026gM"

# Faction IDs from context
IRON_WOLVES_ID = "69cfc5cb824e38cd002e722f"
TEST_FACTION_ALPHA_ID = "69cfc757189046ac11824343"


@pytest.fixture(scope="module")
def session():
    """Create a requests session with cookies."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_session(session):
    """Login as admin and return authenticated session."""
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.status_code} - {response.text}")
    return session


class TestLogin:
    """Verify admin login works before testing new features."""
    
    def test_admin_login(self, session):
        """Login as GameMaster admin."""
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert data["user"]["role"] in ("system_admin", "server_admin")
        print(f"✓ Logged in as {data['user']['callsign']} ({data['user']['role']})")


class TestTerritoryEndpoints:
    """Territory Map API tests."""
    
    def test_get_territories(self, auth_session):
        """GET /api/territories - returns array of territories with faction data."""
        response = auth_session.get(f"{BASE_URL}/api/territories")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected array of territories"
        print(f"✓ GET /api/territories returned {len(data)} territories")
        
        # Verify territory structure if any exist
        if len(data) > 0:
            t = data[0]
            assert "territory_id" in t, "Missing territory_id"
            assert "x" in t, "Missing x coordinate"
            assert "y" in t, "Missing y coordinate"
            assert "faction_id" in t, "Missing faction_id"
            # Check faction enrichment
            if "faction" in t:
                assert "name" in t["faction"], "Missing faction name"
                assert "tag" in t["faction"], "Missing faction tag"
                assert "color" in t["faction"], "Missing faction color"
                print(f"  - First territory: {t['territory_id']} owned by {t['faction'].get('name', 'Unknown')}")
    
    def test_get_territory_summary(self, auth_session):
        """GET /api/territories/summary - returns faction summary with counts."""
        response = auth_session.get(f"{BASE_URL}/api/territories/summary")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected array of faction summaries"
        print(f"✓ GET /api/territories/summary returned {len(data)} factions")
        
        # Verify summary structure
        for s in data:
            assert "faction_id" in s, "Missing faction_id"
            assert "name" in s, "Missing faction name"
            assert "tag" in s, "Missing faction tag"
            assert "total" in s, "Missing total count"
            print(f"  - {s['tag']}: {s['total']} territories")
    
    def test_get_territory_markers(self, auth_session):
        """GET /api/territories/markers - returns array of event markers."""
        response = auth_session.get(f"{BASE_URL}/api/territories/markers")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected array of markers"
        print(f"✓ GET /api/territories/markers returned {len(data)} markers")
        
        # Verify marker structure if any exist
        for m in data[:3]:
            assert "type" in m, "Missing marker type"
            print(f"  - Marker type: {m['type']}")
    
    def test_claim_territory(self, auth_session):
        """POST /api/territories/claim - assign territory to faction."""
        # Use a test cell that's unlikely to conflict (6,6)
        payload = {
            "x": 6,
            "y": 6,
            "faction_id": IRON_WOLVES_ID,
            "zone_type": "outpost",
            "label": "Test Outpost"
        }
        response = auth_session.post(f"{BASE_URL}/api/territories/claim", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data, "Missing message in response"
        assert "territory_id" in data, "Missing territory_id in response"
        assert data["territory_id"] == "6-6", f"Expected territory_id '6-6', got {data['territory_id']}"
        print(f"✓ POST /api/territories/claim: {data['message']}")
    
    def test_verify_claimed_territory(self, auth_session):
        """Verify the claimed territory appears in GET /api/territories."""
        response = auth_session.get(f"{BASE_URL}/api/territories")
        assert response.status_code == 200
        data = response.json()
        
        # Find our test territory
        test_territory = next((t for t in data if t.get("territory_id") == "6-6"), None)
        assert test_territory is not None, "Claimed territory 6-6 not found"
        assert test_territory["faction_id"] == IRON_WOLVES_ID
        assert test_territory["zone_type"] == "outpost"
        print(f"✓ Verified territory 6-6 is claimed by Iron Wolves as outpost")
    
    def test_release_territory(self, auth_session):
        """DELETE /api/territories/claim - release territory."""
        payload = {"x": 6, "y": 6}
        response = auth_session.delete(f"{BASE_URL}/api/territories/claim", json=payload)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "message" in data, "Missing message in response"
        print(f"✓ DELETE /api/territories/claim: {data['message']}")
    
    def test_verify_released_territory(self, auth_session):
        """Verify the released territory no longer exists."""
        response = auth_session.get(f"{BASE_URL}/api/territories")
        assert response.status_code == 200
        data = response.json()
        
        # Ensure our test territory is gone
        test_territory = next((t for t in data if t.get("territory_id") == "6-6"), None)
        assert test_territory is None, "Territory 6-6 should have been released"
        print(f"✓ Verified territory 6-6 has been released")


class TestDiplomatEndpoints:
    """Diplomat AI API tests."""
    
    def test_get_reputation_matrix(self, auth_session):
        """GET /api/diplomat/reputation-matrix - returns matrix with faction pairs."""
        response = auth_session.get(f"{BASE_URL}/api/diplomat/reputation-matrix")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "matrix" in data, "Missing matrix in response"
        assert "factions" in data, "Missing factions in response"
        assert "timestamp" in data, "Missing timestamp in response"
        
        matrix = data["matrix"]
        assert isinstance(matrix, list), "Matrix should be an array"
        print(f"✓ GET /api/diplomat/reputation-matrix returned {len(matrix)} faction pairs")
        
        # Verify matrix entry structure
        if len(matrix) > 0:
            entry = matrix[0]
            assert "faction_a" in entry, "Missing faction_a"
            assert "faction_b" in entry, "Missing faction_b"
            assert "score" in entry, "Missing score"
            assert "sentiment" in entry, "Missing sentiment"
            print(f"  - {entry['faction_a']} <-> {entry['faction_b']}: {entry['score']} ({entry['sentiment']})")
    
    def test_get_diplomatic_analysis(self, auth_session):
        """GET /api/diplomat/analysis - returns AI-generated strategic assessment."""
        response = auth_session.get(f"{BASE_URL}/api/diplomat/analysis", timeout=30)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "analysis" in data, "Missing analysis in response"
        assert "faction_count" in data, "Missing faction_count"
        assert "treaty_count" in data, "Missing treaty_count"
        assert "timestamp" in data, "Missing timestamp"
        
        # Analysis should be a non-empty string
        assert isinstance(data["analysis"], str), "Analysis should be a string"
        assert len(data["analysis"]) > 10, "Analysis seems too short"
        print(f"✓ GET /api/diplomat/analysis returned {len(data['analysis'])} chars")
        print(f"  - Factions: {data['faction_count']}, Treaties: {data['treaty_count']}")
        print(f"  - Preview: {data['analysis'][:100]}...")
    
    def test_treaty_recommendation(self, auth_session):
        """POST /api/diplomat/recommend - get AI treaty recommendation."""
        payload = {
            "faction_a_id": IRON_WOLVES_ID,
            "faction_b_id": TEST_FACTION_ALPHA_ID
        }
        response = auth_session.post(f"{BASE_URL}/api/diplomat/recommend", json=payload, timeout=30)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "recommendation" in data, "Missing recommendation"
        assert "faction_a" in data, "Missing faction_a name"
        assert "faction_b" in data, "Missing faction_b name"
        assert "context" in data, "Missing context"
        assert "timestamp" in data, "Missing timestamp"
        
        # Recommendation should be a non-empty string
        assert isinstance(data["recommendation"], str), "Recommendation should be a string"
        assert len(data["recommendation"]) > 10, "Recommendation seems too short"
        print(f"✓ POST /api/diplomat/recommend: {data['faction_a']} vs {data['faction_b']}")
        print(f"  - Power ratio: {data['context'].get('power_ratio', 'N/A')}")
        print(f"  - Preview: {data['recommendation'][:100]}...")
    
    def test_treaty_recommendation_missing_faction(self, auth_session):
        """POST /api/diplomat/recommend - should fail with missing faction_id."""
        payload = {"faction_a_id": IRON_WOLVES_ID}
        response = auth_session.post(f"{BASE_URL}/api/diplomat/recommend", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print(f"✓ POST /api/diplomat/recommend correctly rejects missing faction_b_id")


class TestPlayerEndpoints:
    """Player Count API tests."""
    
    def test_get_players(self, auth_session):
        """GET /api/players - returns online_count and online array."""
        response = auth_session.get(f"{BASE_URL}/api/players")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "online" in data, "Missing online array"
        assert "online_count" in data, "Missing online_count"
        assert "recent_sessions" in data, "Missing recent_sessions"
        
        assert isinstance(data["online"], list), "online should be an array"
        assert isinstance(data["online_count"], int), "online_count should be an integer"
        assert data["online_count"] >= 0, "online_count should be non-negative"
        
        print(f"✓ GET /api/players: {data['online_count']} players online")
        print(f"  - Recent sessions: {len(data['recent_sessions'])}")
        
        # If players are online, verify structure
        if len(data["online"]) > 0:
            player = data["online"][0]
            assert "name" in player, "Missing player name"
            print(f"  - Online: {[p['name'] for p in data['online']]}")
    
    def test_get_live_stats(self, auth_session):
        """GET /api/server/live-stats - returns online_players from WebSocket."""
        response = auth_session.get(f"{BASE_URL}/api/server/live-stats")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "stats" in data, "Missing stats"
        assert "state" in data, "Missing state"
        assert "online_players" in data, "Missing online_players"
        assert "ws_connected" in data, "Missing ws_connected"
        
        assert isinstance(data["online_players"], list), "online_players should be an array"
        print(f"✓ GET /api/server/live-stats: state={data['state']}, ws_connected={data['ws_connected']}")
        print(f"  - Online players: {data['online_players']}")


class TestFactionEndpoints:
    """Verify factions exist for territory/diplomat tests."""
    
    def test_get_factions(self, auth_session):
        """GET /api/factions - verify test factions exist."""
        response = auth_session.get(f"{BASE_URL}/api/factions")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Expected array of factions"
        print(f"✓ GET /api/factions returned {len(data)} factions")
        
        # Verify our test factions exist
        faction_ids = [f.get("faction_id") for f in data]
        assert IRON_WOLVES_ID in faction_ids, f"Iron Wolves faction not found"
        assert TEST_FACTION_ALPHA_ID in faction_ids, f"Test Faction Alpha not found"
        
        for f in data:
            if f.get("faction_id") in [IRON_WOLVES_ID, TEST_FACTION_ALPHA_ID]:
                print(f"  - {f.get('name')} [{f.get('tag')}]: {f.get('color')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
