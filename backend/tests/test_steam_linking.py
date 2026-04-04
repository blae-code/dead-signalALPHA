"""
Steam Linking Feature Tests
============================
Tests for the new Steam identity linking feature:
- GET /api/profile/me - returns profile with steam_name, steam_id
- POST /api/profile/link-steam - link steam identity
- DELETE /api/profile/link-steam - unlink steam identity
- GET /api/profile/available-players - list known game players
- GET /api/profile/resolve-players - resolve linked users
- GET /api/players - returns online array with app_callsign field
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "blae@katrasoluta.com"
ADMIN_PASSWORD = "Kx9#mZvR!2026gM"
ADMIN_CALLSIGN = "GameMaster"
EXPECTED_STEAM_NAME = "blae"
EXPECTED_STEAM_ID = "76561198054619063"


class TestSteamLinking:
    """Steam identity linking API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as GameMaster
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        print(f"✓ Logged in as {ADMIN_CALLSIGN}")
        
        yield
        
        # Cleanup - ensure steam link is restored to original state
        try:
            self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
                "steam_name": EXPECTED_STEAM_NAME,
                "steam_id": EXPECTED_STEAM_ID
            })
        except:
            pass
    
    def test_01_get_profile_me_with_steam_fields(self):
        """GET /api/profile/me returns profile with steam_name and steam_id"""
        response = self.session.get(f"{BASE_URL}/api/profile/me")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "email" in data, "Profile should contain email"
        assert "callsign" in data, "Profile should contain callsign"
        assert data["callsign"] == ADMIN_CALLSIGN, f"Expected callsign {ADMIN_CALLSIGN}, got {data.get('callsign')}"
        
        # Check steam fields exist (may or may not be populated)
        print(f"✓ Profile retrieved: {data.get('callsign')}")
        print(f"  steam_name: {data.get('steam_name', 'not set')}")
        print(f"  steam_id: {data.get('steam_id', 'not set')}")
        
        # GameMaster should already have steam linked
        if data.get('steam_name'):
            assert data['steam_name'] == EXPECTED_STEAM_NAME, f"Expected steam_name '{EXPECTED_STEAM_NAME}', got '{data.get('steam_name')}'"
        if data.get('steam_id'):
            assert data['steam_id'] == EXPECTED_STEAM_ID, f"Expected steam_id '{EXPECTED_STEAM_ID}', got '{data.get('steam_id')}'"
    
    def test_02_link_steam_valid(self):
        """POST /api/profile/link-steam with valid data returns 200"""
        # First unlink to test linking
        self.session.delete(f"{BASE_URL}/api/profile/link-steam")
        
        # Now link with test data
        response = self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
            "steam_name": "TestPlayer",
            "steam_id": "76561198000000001"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "steam_name" in data or "steam_id" in data, "Response should contain steam info"
        print(f"✓ Steam linked: {data.get('message')}")
        print(f"  steam_name: {data.get('steam_name')}")
        print(f"  steam_id: {data.get('steam_id')}")
    
    def test_03_link_steam_invalid_steamid_short(self):
        """POST /api/profile/link-steam with invalid SteamID (too short) returns 400"""
        response = self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
            "steam_id": "123"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Error response should contain detail"
        print(f"✓ Invalid SteamID rejected: {data.get('detail')}")
    
    def test_04_link_steam_invalid_steamid_non_numeric(self):
        """POST /api/profile/link-steam with non-numeric SteamID returns 400"""
        response = self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
            "steam_id": "7656119805461abc"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print(f"✓ Non-numeric SteamID rejected")
    
    def test_05_link_steam_empty_body(self):
        """POST /api/profile/link-steam with empty body returns 400"""
        response = self.session.post(f"{BASE_URL}/api/profile/link-steam", json={})
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Error response should contain detail"
        print(f"✓ Empty body rejected: {data.get('detail')}")
    
    def test_06_unlink_steam(self):
        """DELETE /api/profile/link-steam unlinks steam identity"""
        # First ensure we have something linked
        self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
            "steam_name": "TempPlayer",
            "steam_id": "76561198000000002"
        })
        
        # Now unlink
        response = self.session.delete(f"{BASE_URL}/api/profile/link-steam")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        print(f"✓ Steam unlinked: {data.get('message')}")
        
        # Verify unlinked
        profile = self.session.get(f"{BASE_URL}/api/profile/me").json()
        assert profile.get('steam_name') is None or profile.get('steam_name') == '', "steam_name should be cleared"
        assert profile.get('steam_id') is None or profile.get('steam_id') == '', "steam_id should be cleared"
        print(f"✓ Verified steam fields cleared from profile")
    
    def test_07_relink_original_steam(self):
        """POST /api/profile/link-steam re-links original steam identity"""
        response = self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
            "steam_name": EXPECTED_STEAM_NAME,
            "steam_id": EXPECTED_STEAM_ID
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"✓ Re-linked original steam: {data.get('message')}")
        
        # Verify
        profile = self.session.get(f"{BASE_URL}/api/profile/me").json()
        assert profile.get('steam_name') == EXPECTED_STEAM_NAME, f"Expected steam_name '{EXPECTED_STEAM_NAME}'"
        assert profile.get('steam_id') == EXPECTED_STEAM_ID, f"Expected steam_id '{EXPECTED_STEAM_ID}'"
        print(f"✓ Verified steam fields restored: {profile.get('steam_name')} / {profile.get('steam_id')}")
    
    def test_08_get_available_players(self):
        """GET /api/profile/available-players returns array of known game players"""
        response = self.session.get(f"{BASE_URL}/api/profile/available-players")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        print(f"✓ Available players: {len(data)} players found")
        
        # If there are players, check structure
        if len(data) > 0:
            player = data[0]
            print(f"  Sample player: steam_name={player.get('steam_name')}, steam_id={player.get('steam_id')}, level={player.get('level')}, clan={player.get('clan')}, linked_to={player.get('linked_to')}")
    
    def test_09_get_resolve_players(self):
        """GET /api/profile/resolve-players returns linked_users array"""
        response = self.session.get(f"{BASE_URL}/api/profile/resolve-players")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "linked_users" in data, "Response should contain linked_users"
        assert isinstance(data["linked_users"], list), "linked_users should be an array"
        print(f"✓ Resolve players: {len(data['linked_users'])} linked users found")
        
        # Check if GameMaster is in the list
        for user in data["linked_users"]:
            if user.get("callsign") == ADMIN_CALLSIGN:
                print(f"  Found {ADMIN_CALLSIGN}: steam_name={user.get('steam_name')}, steam_id={user.get('steam_id')}")
                break
    
    def test_10_get_players_with_app_callsign(self):
        """GET /api/players returns online array with app_callsign field for linked players"""
        response = self.session.get(f"{BASE_URL}/api/players")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "online" in data, "Response should contain online array"
        assert "online_count" in data, "Response should contain online_count"
        assert isinstance(data["online"], list), "online should be an array"
        print(f"✓ Players endpoint: {data['online_count']} online")
        
        # If there are online players, check structure
        if len(data["online"]) > 0:
            player = data["online"][0]
            print(f"  Sample online player: name={player.get('name')}, steam_name={player.get('steam_name')}, app_callsign={player.get('app_callsign')}")
            # Verify app_callsign field exists (may be None if not linked)
            assert "app_callsign" in player, "Online player should have app_callsign field"


class TestSteamLinkingEdgeCases:
    """Edge case tests for Steam linking"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as GameMaster
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        yield
        
        # Cleanup - restore original steam link
        try:
            self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
                "steam_name": EXPECTED_STEAM_NAME,
                "steam_id": EXPECTED_STEAM_ID
            })
        except:
            pass
    
    def test_link_steam_name_only(self):
        """POST /api/profile/link-steam with only steam_name works"""
        self.session.delete(f"{BASE_URL}/api/profile/link-steam")
        
        response = self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
            "steam_name": "OnlyNamePlayer"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Link with steam_name only works")
    
    def test_link_steam_id_only(self):
        """POST /api/profile/link-steam with only steam_id works"""
        self.session.delete(f"{BASE_URL}/api/profile/link-steam")
        
        response = self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
            "steam_id": "76561198000000003"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Link with steam_id only works")
    
    def test_link_steam_whitespace_trimmed(self):
        """POST /api/profile/link-steam trims whitespace"""
        self.session.delete(f"{BASE_URL}/api/profile/link-steam")
        
        response = self.session.post(f"{BASE_URL}/api/profile/link-steam", json={
            "steam_name": "  TrimmedName  ",
            "steam_id": "  76561198000000004  "
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify trimmed
        profile = self.session.get(f"{BASE_URL}/api/profile/me").json()
        assert profile.get('steam_name') == "TrimmedName", "steam_name should be trimmed"
        assert profile.get('steam_id') == "76561198000000004", "steam_id should be trimmed"
        print(f"✓ Whitespace trimmed correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
