"""
Dead Signal - Faction System Backend Tests
Tests for faction CRUD, membership, and diplomacy endpoints
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://faction-wars-17.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_CALLSIGN = "Commander"
ADMIN_AUTH_KEY = "DS-NV3F-CQ4Q-STFP-CVGN"

class TestAuthAndSetup:
    """Authentication and setup tests"""
    
    def test_setup_status(self):
        """Check setup status endpoint"""
        response = requests.get(f"{BASE_URL}/api/auth/setup-status")
        assert response.status_code == 200
        data = response.json()
        assert "setup_required" in data
        print(f"Setup required: {data['setup_required']}")
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "callsign": ADMIN_CALLSIGN,
            "auth_key": ADMIN_AUTH_KEY
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["callsign"] == ADMIN_CALLSIGN
        assert data["role"] == "system_admin"
        print(f"Login successful: {data['callsign']} ({data['role']})")
        return data["token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "callsign": "InvalidUser",
            "auth_key": "DS-XXXX-XXXX-XXXX-XXXX"
        })
        assert response.status_code == 401


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "callsign": ADMIN_CALLSIGN,
        "auth_key": ADMIN_AUTH_KEY
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestServerStatus:
    """Server status and live stats tests"""
    
    def test_server_status(self, auth_headers):
        """Test server status endpoint"""
        response = requests.get(f"{BASE_URL}/api/server/status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "configured" in data
        print(f"Server configured: {data['configured']}")
    
    def test_live_stats(self, auth_headers):
        """Test live stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/server/live-stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "state" in data
        assert "ws_connected" in data
        print(f"Server state: {data['state']}, WS connected: {data['ws_connected']}")
    
    def test_players_endpoint(self, auth_headers):
        """Test players endpoint - should return online count"""
        response = requests.get(f"{BASE_URL}/api/players", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "online_count" in data
        assert "online" in data
        assert "recent_sessions" in data
        print(f"Online players: {data['online_count']}")


class TestFactionCRUD:
    """Faction CRUD operations tests"""
    
    def test_list_factions(self, auth_headers):
        """Test listing all active factions"""
        response = requests.get(f"{BASE_URL}/api/factions", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Active factions: {len(data)}")
        for f in data:
            print(f"  - [{f.get('tag')}] {f.get('name')} (members: {f.get('member_count')})")
        return data
    
    def test_my_faction(self, auth_headers):
        """Test getting current user's faction"""
        response = requests.get(f"{BASE_URL}/api/factions/my", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "faction" in data
        assert "membership" in data
        if data["faction"]:
            print(f"My faction: [{data['faction']['tag']}] {data['faction']['name']}")
            print(f"My role: {data['membership']['role']}")
        else:
            print("Not in any faction")
        return data
    
    def test_create_faction(self, auth_headers):
        """Test creating a new faction"""
        # First check if user is already in a faction
        my_faction = requests.get(f"{BASE_URL}/api/factions/my", headers=auth_headers).json()
        
        if my_faction.get("faction"):
            print(f"Already in faction [{my_faction['faction']['tag']}], skipping create test")
            pytest.skip("User already in a faction")
        
        # Create a test faction
        test_faction_data = {
            "name": f"TEST_Faction_{int(time.time())}",
            "tag": "TST",
            "description": "Test faction for automated testing",
            "color": "#c4841d"
        }
        
        response = requests.post(f"{BASE_URL}/api/factions", json=test_faction_data, headers=auth_headers)
        
        if response.status_code == 400 and "already taken" in response.json().get("detail", ""):
            # Tag already taken, try with different tag
            test_faction_data["tag"] = f"T{int(time.time()) % 100}"
            response = requests.post(f"{BASE_URL}/api/factions", json=test_faction_data, headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "faction" in data
        assert "membership" in data
        assert data["faction"]["name"] == test_faction_data["name"]
        assert data["membership"]["role"] == "leader"
        print(f"Created faction: [{data['faction']['tag']}] {data['faction']['name']}")
        return data["faction"]["faction_id"]
    
    def test_get_faction_detail(self, auth_headers):
        """Test getting faction detail with members and treaties"""
        # First get list of factions
        factions = requests.get(f"{BASE_URL}/api/factions", headers=auth_headers).json()
        
        if not factions:
            pytest.skip("No factions to test")
        
        faction_id = factions[0]["faction_id"]
        response = requests.get(f"{BASE_URL}/api/factions/{faction_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "faction" in data
        assert "members" in data
        assert "treaties" in data
        print(f"Faction detail: [{data['faction']['tag']}] {data['faction']['name']}")
        print(f"  Members: {len(data['members'])}")
        print(f"  Treaties: {len(data['treaties'])}")
        return data
    
    def test_update_faction(self, auth_headers):
        """Test updating faction details"""
        # Get my faction
        my_faction = requests.get(f"{BASE_URL}/api/factions/my", headers=auth_headers).json()
        
        if not my_faction.get("faction"):
            pytest.skip("Not in a faction")
        
        if my_faction["membership"]["role"] not in ("leader", "officer"):
            pytest.skip("Not a leader or officer")
        
        faction_id = my_faction["faction"]["faction_id"]
        new_description = f"Updated at {int(time.time())}"
        
        response = requests.patch(
            f"{BASE_URL}/api/factions/{faction_id}",
            json={"description": new_description},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Verify update
        updated = requests.get(f"{BASE_URL}/api/factions/{faction_id}", headers=auth_headers).json()
        assert updated["faction"]["description"] == new_description
        print(f"Updated faction description: {new_description}")


class TestFactionMembership:
    """Faction membership tests"""
    
    def test_pending_invites(self, auth_headers):
        """Test getting pending invites"""
        response = requests.get(f"{BASE_URL}/api/factions/invites/pending", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Pending invites: {len(data)}")
        return data
    
    def test_invite_player_not_found(self, auth_headers):
        """Test inviting a non-existent player"""
        my_faction = requests.get(f"{BASE_URL}/api/factions/my", headers=auth_headers).json()
        
        if not my_faction.get("faction"):
            pytest.skip("Not in a faction")
        
        if my_faction["membership"]["role"] not in ("leader", "officer"):
            pytest.skip("Not a leader or officer")
        
        faction_id = my_faction["faction"]["faction_id"]
        response = requests.post(
            f"{BASE_URL}/api/factions/{faction_id}/invite",
            json={"callsign": "NonExistentPlayer12345"},
            headers=auth_headers
        )
        assert response.status_code == 404
        assert "not found" in response.json().get("detail", "").lower()
        print("Correctly rejected invite to non-existent player")


class TestFactionDiplomacy:
    """Faction diplomacy tests"""
    
    def test_list_treaties(self, auth_headers):
        """Test listing treaties for a faction"""
        factions = requests.get(f"{BASE_URL}/api/factions", headers=auth_headers).json()
        
        if not factions:
            pytest.skip("No factions to test")
        
        faction_id = factions[0]["faction_id"]
        response = requests.get(f"{BASE_URL}/api/factions/{faction_id}/diplomacy", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Treaties for faction: {len(data)}")
        return data
    
    def test_propose_treaty_validation(self, auth_headers):
        """Test treaty proposal validation"""
        my_faction = requests.get(f"{BASE_URL}/api/factions/my", headers=auth_headers).json()
        
        if not my_faction.get("faction"):
            pytest.skip("Not in a faction")
        
        if my_faction["membership"]["role"] not in ("leader", "officer"):
            pytest.skip("Not a leader or officer")
        
        faction_id = my_faction["faction"]["faction_id"]
        
        # Test invalid treaty type
        response = requests.post(
            f"{BASE_URL}/api/factions/{faction_id}/diplomacy",
            json={"target_faction_id": "invalid", "treaty_type": "invalid_type"},
            headers=auth_headers
        )
        assert response.status_code == 400
        print("Correctly rejected invalid treaty type")
        
        # Test self-treaty
        response = requests.post(
            f"{BASE_URL}/api/factions/{faction_id}/diplomacy",
            json={"target_faction_id": faction_id, "treaty_type": "alliance"},
            headers=auth_headers
        )
        assert response.status_code == 400
        print("Correctly rejected self-treaty")


class TestAdminKeyManagement:
    """Admin key management tests"""
    
    def test_list_keys(self, auth_headers):
        """Test listing all auth keys (admin only)"""
        response = requests.get(f"{BASE_URL}/api/admin/keys", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Total users: {len(data)}")
        for u in data[:5]:  # Show first 5
            print(f"  - {u.get('callsign')} ({u.get('role')}) - {u.get('status')}")
    
    def test_generate_key(self, auth_headers):
        """Test generating a new auth key"""
        test_callsign = f"TEST_Player_{int(time.time())}"
        response = requests.post(
            f"{BASE_URL}/api/admin/keys",
            json={"callsign": test_callsign, "role": "player"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "auth_key" in data
        assert data["callsign"] == test_callsign
        print(f"Generated key for: {test_callsign}")
        return data


class TestDashboardTabs:
    """Test dashboard tab data endpoints"""
    
    def test_events_endpoint(self, auth_headers):
        """Test events endpoint"""
        response = requests.get(f"{BASE_URL}/api/events?limit=10", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Events: {len(data)}")
    
    def test_console_log(self, auth_headers):
        """Test console log endpoint"""
        response = requests.get(f"{BASE_URL}/api/server/console-log?limit=10", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Console lines: {len(data)}")
    
    def test_narrative_history(self, auth_headers):
        """Test narrative history endpoint"""
        response = requests.get(f"{BASE_URL}/api/narrative/history?limit=5", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Narratives: {len(data)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
