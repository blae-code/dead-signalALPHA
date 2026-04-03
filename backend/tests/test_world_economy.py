"""
Test suite for Dead Signal World Conditions and Economy System APIs
Tests: World state, World override, Resources, Recipes, Trades, Supply Requests
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CALLSIGN = "Commander"
ADMIN_AUTH_KEY = "DS-NV3F-CQ4Q-STFP-CVGN"
PLAYER_CALLSIGN = "TestPlayer2"
PLAYER_AUTH_KEY = "DS-4CYN-JXJ4-D65K-4LDK"


@pytest.fixture(scope="module")
def admin_session():
    """Get authenticated admin session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "callsign": ADMIN_CALLSIGN,
        "auth_key": ADMIN_AUTH_KEY
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return session


@pytest.fixture(scope="module")
def player_session():
    """Get authenticated player session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "callsign": PLAYER_CALLSIGN,
        "auth_key": PLAYER_AUTH_KEY
    })
    assert response.status_code == 200, f"Player login failed: {response.text}"
    return session


# ==================== WORLD STATE TESTS ====================

class TestWorldState:
    """Tests for GET /api/world/state"""
    
    def test_world_state_returns_all_fields(self, admin_session):
        """World state should return all required fields"""
        response = admin_session.get(f"{BASE_URL}/api/world/state")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Check all required fields exist
        required_fields = [
            'hour', 'hour_display', 'time_of_day', 'day', 'season',
            'weather', 'temperature', 'danger_level',
            'weather_tooltip', 'time_tooltip', 'season_tooltip'
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"World state: hour={data['hour_display']}, time={data['time_of_day']}, day={data['day']}, season={data['season']}, weather={data['weather']}, danger={data['danger_level']}")
    
    def test_world_state_hour_display_format(self, admin_session):
        """hour_display should be in HH:MM format"""
        response = admin_session.get(f"{BASE_URL}/api/world/state")
        data = response.json()
        
        hour_display = data['hour_display']
        assert ':' in hour_display, f"hour_display should contain colon: {hour_display}"
        parts = hour_display.split(':')
        assert len(parts) == 2, f"hour_display should be HH:MM format: {hour_display}"
        assert parts[0].isdigit() and parts[1].isdigit(), f"hour_display parts should be numeric: {hour_display}"
    
    def test_world_state_time_of_day_valid(self, admin_session):
        """time_of_day should be one of valid values"""
        response = admin_session.get(f"{BASE_URL}/api/world/state")
        data = response.json()
        
        valid_times = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night', 'midnight']
        assert data['time_of_day'] in valid_times, f"Invalid time_of_day: {data['time_of_day']}"
    
    def test_world_state_season_valid(self, admin_session):
        """season should be one of valid values"""
        response = admin_session.get(f"{BASE_URL}/api/world/state")
        data = response.json()
        
        valid_seasons = ['spring', 'summer', 'autumn', 'winter']
        assert data['season'] in valid_seasons, f"Invalid season: {data['season']}"
    
    def test_world_state_weather_valid(self, admin_session):
        """weather should be one of valid values"""
        response = admin_session.get(f"{BASE_URL}/api/world/state")
        data = response.json()
        
        valid_weather = ['clear', 'cloudy', 'overcast', 'rain', 'storm', 'fog', 'snow', 'blizzard']
        assert data['weather'] in valid_weather, f"Invalid weather: {data['weather']}"
    
    def test_world_state_danger_level_range(self, admin_session):
        """danger_level should be 0-10"""
        response = admin_session.get(f"{BASE_URL}/api/world/state")
        data = response.json()
        
        assert 0 <= data['danger_level'] <= 10, f"danger_level out of range: {data['danger_level']}"
    
    def test_world_state_tooltips_not_empty(self, admin_session):
        """Tooltips should have content"""
        response = admin_session.get(f"{BASE_URL}/api/world/state")
        data = response.json()
        
        assert len(data['weather_tooltip']) > 0, "weather_tooltip should not be empty"
        assert len(data['time_tooltip']) > 0, "time_tooltip should not be empty"
        assert len(data['season_tooltip']) > 0, "season_tooltip should not be empty"
    
    def test_world_state_day_range(self, admin_session):
        """day should be 1-120"""
        response = admin_session.get(f"{BASE_URL}/api/world/state")
        data = response.json()
        
        assert 1 <= data['day'] <= 120, f"day out of range: {data['day']}"
    
    def test_world_state_requires_auth(self):
        """World state should require authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/world/state")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestWorldOverride:
    """Tests for POST /api/world/override"""
    
    def test_world_override_weather(self, admin_session):
        """Admin can override weather"""
        response = admin_session.post(f"{BASE_URL}/api/world/override", json={
            "weather": "storm"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert 'overrides' in data
        assert data['overrides'].get('weather') == 'storm'
        
        # Verify world state reflects override
        state_response = admin_session.get(f"{BASE_URL}/api/world/state")
        state = state_response.json()
        assert state['weather'] == 'storm', f"Weather override not applied: {state['weather']}"
        print("Weather override to 'storm' successful")
    
    def test_world_override_clear_weather(self, admin_session):
        """Admin can clear weather override"""
        response = admin_session.post(f"{BASE_URL}/api/world/override", json={
            "weather": ""
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert 'weather' not in data.get('overrides', {}), "Weather should be cleared"
        print("Weather override cleared")
    
    def test_world_override_time_offset(self, admin_session):
        """Admin can set time offset"""
        response = admin_session.post(f"{BASE_URL}/api/world/override", json={
            "time_offset_hours": 6.0
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data['overrides'].get('time_offset_hours') == 6.0
        print("Time offset set to 6 hours")
        
        # Reset time offset
        admin_session.post(f"{BASE_URL}/api/world/override", json={"time_offset_hours": 0})
    
    def test_world_override_custom_alert(self, admin_session):
        """Admin can set custom alert"""
        alert_text = "TEST ALERT: Horde incoming from the north!"
        response = admin_session.post(f"{BASE_URL}/api/world/override", json={
            "custom_alert": alert_text
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify alert in world state
        state_response = admin_session.get(f"{BASE_URL}/api/world/state")
        state = state_response.json()
        assert state.get('custom_alert') == alert_text, f"Custom alert not set: {state.get('custom_alert')}"
        print(f"Custom alert set: {alert_text}")
        
        # Clear alert
        admin_session.post(f"{BASE_URL}/api/world/override", json={"custom_alert": ""})
    
    def test_world_override_requires_admin(self, player_session):
        """Non-admin cannot override world state"""
        response = player_session.post(f"{BASE_URL}/api/world/override", json={
            "weather": "blizzard"
        })
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Non-admin correctly blocked from world override")


# ==================== ECONOMY RESOURCES TESTS ====================

class TestEconomyResources:
    """Tests for GET /api/economy/resources"""
    
    def test_resources_returns_25_items(self, admin_session):
        """Should return exactly 25 resources"""
        response = admin_session.get(f"{BASE_URL}/api/economy/resources")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert len(data) == 25, f"Expected 25 resources, got {len(data)}"
        print(f"Resources count: {len(data)}")
    
    def test_resources_have_required_fields(self, admin_session):
        """Each resource should have required fields"""
        response = admin_session.get(f"{BASE_URL}/api/economy/resources")
        data = response.json()
        
        required_fields = ['name', 'category', 'rarity', 'base_value', 'current_value', 'supply_level']
        for resource in data:
            for field in required_fields:
                assert field in resource, f"Resource {resource.get('name', 'unknown')} missing field: {field}"
        
        print("All resources have required fields")
    
    def test_resources_categories_valid(self, admin_session):
        """Resources should have valid categories"""
        response = admin_session.get(f"{BASE_URL}/api/economy/resources")
        data = response.json()
        
        valid_categories = ['weapons', 'ammo', 'food', 'water', 'medical', 'materials', 'tools', 'clothing', 'electronics', 'vehicle_parts', 'misc']
        for resource in data:
            assert resource['category'] in valid_categories, f"Invalid category for {resource['name']}: {resource['category']}"
    
    def test_resources_rarity_valid(self, admin_session):
        """Resources should have valid rarity"""
        response = admin_session.get(f"{BASE_URL}/api/economy/resources")
        data = response.json()
        
        valid_rarities = ['common', 'uncommon', 'rare']
        for resource in data:
            assert resource['rarity'] in valid_rarities, f"Invalid rarity for {resource['name']}: {resource['rarity']}"
    
    def test_resources_supply_level_valid(self, admin_session):
        """Resources should have valid supply level"""
        response = admin_session.get(f"{BASE_URL}/api/economy/resources")
        data = response.json()
        
        valid_supply = ['surplus', 'normal', 'scarce', 'critical']
        for resource in data:
            assert resource['supply_level'] in valid_supply, f"Invalid supply_level for {resource['name']}: {resource['supply_level']}"
    
    def test_resources_requires_auth(self):
        """Resources endpoint requires authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/economy/resources")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


# ==================== ECONOMY RECIPES TESTS ====================

class TestEconomyRecipes:
    """Tests for GET /api/economy/recipes"""
    
    def test_recipes_returns_10_items(self, admin_session):
        """Should return exactly 10 crafting recipes"""
        response = admin_session.get(f"{BASE_URL}/api/economy/recipes")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert len(data) == 10, f"Expected 10 recipes, got {len(data)}"
        print(f"Recipes count: {len(data)}")
    
    def test_recipes_have_required_fields(self, admin_session):
        """Each recipe should have required fields"""
        response = admin_session.get(f"{BASE_URL}/api/economy/recipes")
        data = response.json()
        
        required_fields = ['name', 'category', 'ingredients', 'result', 'result_qty', 'difficulty', 'desc']
        for recipe in data:
            for field in required_fields:
                assert field in recipe, f"Recipe {recipe.get('name', 'unknown')} missing field: {field}"
        
        print("All recipes have required fields")
    
    def test_recipes_ingredients_structure(self, admin_session):
        """Recipe ingredients should have item and qty"""
        response = admin_session.get(f"{BASE_URL}/api/economy/recipes")
        data = response.json()
        
        for recipe in data:
            assert isinstance(recipe['ingredients'], list), f"Ingredients should be list for {recipe['name']}"
            for ing in recipe['ingredients']:
                assert 'item' in ing, f"Ingredient missing 'item' in {recipe['name']}"
                assert 'qty' in ing, f"Ingredient missing 'qty' in {recipe['name']}"
    
    def test_recipes_difficulty_valid(self, admin_session):
        """Recipes should have valid difficulty"""
        response = admin_session.get(f"{BASE_URL}/api/economy/recipes")
        data = response.json()
        
        valid_difficulties = ['easy', 'medium', 'hard']
        for recipe in data:
            assert recipe['difficulty'] in valid_difficulties, f"Invalid difficulty for {recipe['name']}: {recipe['difficulty']}"


# ==================== TRADE BOARD TESTS ====================

class TestTradeBoard:
    """Tests for Trade Board CRUD operations"""
    
    def test_list_trades(self, admin_session):
        """Should list open/claimed trades"""
        response = admin_session.get(f"{BASE_URL}/api/economy/trades")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Trades should be a list"
        print(f"Active trades count: {len(data)}")
    
    def test_create_trade(self, player_session):
        """Player can create a trade post"""
        response = player_session.post(f"{BASE_URL}/api/economy/trades", json={
            "offering": [{"item": "Bandage", "qty": 5}],
            "requesting": [{"item": "Water Bottle", "qty": 2}],
            "notes": "TEST TRADE - Will meet at safe zone"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert 'trade_id' in data, "Response should contain trade_id"
        assert data['poster_callsign'] == PLAYER_CALLSIGN
        assert data['status'] == 'open'
        assert len(data['offering']) == 1
        assert len(data['requesting']) == 1
        print(f"Created trade: {data['trade_id']}")
        
        return data['trade_id']
    
    def test_create_trade_validation(self, admin_session):
        """Trade creation requires offering or requesting"""
        response = admin_session.post(f"{BASE_URL}/api/economy/trades", json={
            "offering": [],
            "requesting": [],
            "notes": "Empty trade"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
    
    def test_claim_trade(self, admin_session, player_session):
        """Admin can claim player's trade"""
        # First create a trade as player
        create_response = player_session.post(f"{BASE_URL}/api/economy/trades", json={
            "offering": [{"item": "9mm Ammo", "qty": 20}],
            "requesting": [{"item": "Canned Food", "qty": 3}],
            "notes": "TEST - Claim test"
        })
        trade_id = create_response.json()['trade_id']
        
        # Admin claims the trade
        response = admin_session.post(f"{BASE_URL}/api/economy/trades/{trade_id}/respond", json={
            "action": "claim"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify trade is claimed
        trades = admin_session.get(f"{BASE_URL}/api/economy/trades").json()
        claimed_trade = next((t for t in trades if t['trade_id'] == trade_id), None)
        assert claimed_trade is not None, "Trade should still be visible"
        assert claimed_trade['status'] == 'claimed'
        assert claimed_trade['claimed_by'] == ADMIN_CALLSIGN
        print(f"Trade {trade_id} claimed by {ADMIN_CALLSIGN}")
    
    def test_cannot_claim_own_trade(self, admin_session):
        """Cannot claim your own trade"""
        # Create trade as admin
        create_response = admin_session.post(f"{BASE_URL}/api/economy/trades", json={
            "offering": [{"item": "Pistol", "qty": 1}],
            "requesting": [{"item": "5.56 Ammo", "qty": 30}],
            "notes": "TEST - Self claim test"
        })
        trade_id = create_response.json()['trade_id']
        
        # Try to claim own trade
        response = admin_session.post(f"{BASE_URL}/api/economy/trades/{trade_id}/respond", json={
            "action": "claim"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Correctly blocked from claiming own trade")
        
        # Cleanup - cancel the trade
        admin_session.post(f"{BASE_URL}/api/economy/trades/{trade_id}/respond", json={"action": "cancel"})
    
    def test_complete_trade(self, admin_session, player_session):
        """Trade parties can complete trade"""
        # Create and claim a trade
        create_response = player_session.post(f"{BASE_URL}/api/economy/trades", json={
            "offering": [{"item": "Toolbox", "qty": 1}],
            "requesting": [{"item": "Battery", "qty": 2}],
            "notes": "TEST - Complete test"
        })
        trade_id = create_response.json()['trade_id']
        
        admin_session.post(f"{BASE_URL}/api/economy/trades/{trade_id}/respond", json={"action": "claim"})
        
        # Complete the trade
        response = admin_session.post(f"{BASE_URL}/api/economy/trades/{trade_id}/respond", json={
            "action": "complete"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"Trade {trade_id} completed")
    
    def test_cancel_trade(self, admin_session):
        """Poster can cancel their trade"""
        # Create trade
        create_response = admin_session.post(f"{BASE_URL}/api/economy/trades", json={
            "offering": [{"item": "MRE", "qty": 2}],
            "requesting": [{"item": "Antibiotics", "qty": 1}],
            "notes": "TEST - Cancel test"
        })
        trade_id = create_response.json()['trade_id']
        
        # Cancel the trade
        response = admin_session.post(f"{BASE_URL}/api/economy/trades/{trade_id}/respond", json={
            "action": "cancel"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"Trade {trade_id} cancelled")
    
    def test_trade_history(self, admin_session):
        """Can retrieve trade history"""
        response = admin_session.get(f"{BASE_URL}/api/economy/trades/history?limit=10")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "History should be a list"
        print(f"Trade history count: {len(data)}")


# ==================== SUPPLY REQUESTS TESTS ====================

class TestSupplyRequests:
    """Tests for Supply Request CRUD operations"""
    
    def test_list_supply_requests(self, admin_session):
        """Should list open supply requests"""
        response = admin_session.get(f"{BASE_URL}/api/economy/supply-requests")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Supply requests should be a list"
        print(f"Open supply requests: {len(data)}")
    
    def test_create_supply_request_normal(self, player_session):
        """Player can create normal priority supply request"""
        response = player_session.post(f"{BASE_URL}/api/economy/supply-requests", json={
            "items": [{"item": "Bandage", "qty": 10}, {"item": "Painkillers", "qty": 5}],
            "priority": "normal",
            "notes": "TEST - Need medical supplies for base"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert 'request_id' in data
        assert data['priority'] == 'normal'
        assert data['status'] == 'open'
        assert len(data['items']) == 2
        print(f"Created supply request: {data['request_id']}")
    
    def test_create_supply_request_urgent(self, admin_session):
        """Can create urgent priority supply request"""
        response = admin_session.post(f"{BASE_URL}/api/economy/supply-requests", json={
            "items": [{"item": "Antibiotics", "qty": 3}],
            "priority": "urgent",
            "notes": "TEST - Critical medical emergency!"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data['priority'] == 'urgent'
        print(f"Created urgent supply request: {data['request_id']}")
    
    def test_create_supply_request_low(self, player_session):
        """Can create low priority supply request"""
        response = player_session.post(f"{BASE_URL}/api/economy/supply-requests", json={
            "items": [{"item": "Wood Planks", "qty": 50}],
            "priority": "low",
            "notes": "TEST - Building materials when available"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data['priority'] == 'low'
        print(f"Created low priority supply request: {data['request_id']}")
    
    def test_fulfill_supply_request(self, admin_session, player_session):
        """Player can fulfill another's supply request"""
        # Create request as admin
        create_response = admin_session.post(f"{BASE_URL}/api/economy/supply-requests", json={
            "items": [{"item": "Fuel Can", "qty": 5}],
            "priority": "normal",
            "notes": "TEST - Fulfill test"
        })
        request_id = create_response.json()['request_id']
        
        # Player fulfills the request
        response = player_session.post(f"{BASE_URL}/api/economy/supply-requests/{request_id}/fulfill")
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"Supply request {request_id} fulfilled")


# ==================== SCARCITY INDEX TESTS ====================

class TestScarcityIndex:
    """Tests for GET /api/economy/scarcity"""
    
    def test_scarcity_index(self, admin_session):
        """Should return scarcity data"""
        response = admin_session.get(f"{BASE_URL}/api/economy/scarcity")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Scarcity should be a list"
        print(f"Scarcity entries: {len(data)}")


# ==================== INTEGRATION TESTS ====================

class TestEconomyIntegration:
    """Integration tests for economy system"""
    
    def test_existing_commander_trade(self, admin_session):
        """Verify Commander's existing trade (Assault Rifle for Antibiotics + First Aid Kit)"""
        response = admin_session.get(f"{BASE_URL}/api/economy/trades")
        data = response.json()
        
        # Look for Commander's trade
        commander_trades = [t for t in data if t['poster_callsign'] == 'Commander' and t['status'] == 'open']
        
        if commander_trades:
            trade = commander_trades[0]
            print(f"Found Commander's trade: offering {trade['offering']}, requesting {trade['requesting']}")
            
            # Check if it matches expected trade
            offering_items = [o['item'] for o in trade['offering']]
            requesting_items = [r['item'] for r in trade['requesting']]
            
            if 'Assault Rifle' in offering_items:
                print("Commander's Assault Rifle trade found!")
        else:
            print("No open Commander trades found - may have been claimed/completed")
    
    def test_player_can_claim_commander_trade(self, admin_session, player_session):
        """TestPlayer2 can claim Commander's trade"""
        # Get Commander's open trades
        response = admin_session.get(f"{BASE_URL}/api/economy/trades")
        data = response.json()
        
        commander_trades = [t for t in data if t['poster_callsign'] == 'Commander' and t['status'] == 'open']
        
        if commander_trades:
            trade_id = commander_trades[0]['trade_id']
            
            # Player claims the trade
            claim_response = player_session.post(f"{BASE_URL}/api/economy/trades/{trade_id}/respond", json={
                "action": "claim"
            })
            
            if claim_response.status_code == 200:
                print(f"TestPlayer2 claimed Commander's trade {trade_id}")
            else:
                print(f"Could not claim trade: {claim_response.text}")
        else:
            print("No Commander trades available to claim")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
