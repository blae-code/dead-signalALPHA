"""
Test Suite for Survival Planning Suite Features
================================================
Tests: Base Planner, Loot Intelligence, OCR Alias Resolution
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSurvivalPlannerAPIs:
    """Test the new Survival Planning Suite endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session with auth cookies"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "blae@katrasoluta.com",
            "password": "Kx9#mZvR!2026gM"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        print(f"✓ Login successful as GameMaster")
        
    # =========================================================================
    # LOOT INTEL TESTS
    # =========================================================================
    
    def test_get_loot_intel_items(self):
        """GET /api/loot-intel/items returns 25 items with locations"""
        response = self.session.get(f"{BASE_URL}/api/loot-intel/items")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 25, f"Expected 25 items, got {len(data)}"
        
        # Verify structure of first item
        first_item = data[0]
        assert "item_name" in first_item, "Item should have item_name"
        assert "locations" in first_item, "Item should have locations"
        assert isinstance(first_item["locations"], list), "Locations should be a list"
        
        # Verify location structure
        if first_item["locations"]:
            loc = first_item["locations"][0]
            assert "name" in loc, "Location should have name"
            assert "probability" in loc, "Location should have probability"
            assert "info" in loc, "Location should have info"
        
        print(f"✓ GET /api/loot-intel/items returned {len(data)} items")
        
    def test_get_loot_intel_locations(self):
        """GET /api/loot-intel/locations returns location database"""
        response = self.session.get(f"{BASE_URL}/api/loot-intel/locations")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "locations" in data, "Response should have locations"
        assert "count" in data, "Response should have count"
        assert data["count"] > 0, "Should have at least one location"
        
        # Verify location structure
        locations = data["locations"]
        first_loc_name = list(locations.keys())[0]
        first_loc = locations[first_loc_name]
        assert "type" in first_loc, "Location should have type"
        assert "danger" in first_loc, "Location should have danger"
        assert "description" in first_loc, "Location should have description"
        
        print(f"✓ GET /api/loot-intel/locations returned {data['count']} locations")
        
    def test_get_specific_item_intel(self):
        """GET /api/loot-intel/items/{item_name} returns specific item intel"""
        response = self.session.get(f"{BASE_URL}/api/loot-intel/items/Canned%20Food")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["item_name"] == "Canned Food", "Item name should match"
        assert len(data["locations"]) > 0, "Should have locations"
        
        print(f"✓ GET /api/loot-intel/items/Canned Food returned {len(data['locations'])} locations")
        
    def test_resolve_aliases(self):
        """POST /api/loot-intel/resolve-aliases resolves OCR misspellings"""
        response = self.session.post(f"{BASE_URL}/api/loot-intel/resolve-aliases", json={
            "items": [
                {"name": "wod planks", "quantity": 10},
                {"name": "caned food", "quantity": 5},
                {"name": "9mm", "quantity": 50},
                {"name": "Bandage", "quantity": 3},  # Exact match
                {"name": "unknown_item_xyz", "quantity": 1}  # Unknown
            ]
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "items" in data, "Response should have items"
        items = data["items"]
        assert len(items) == 5, f"Expected 5 items, got {len(items)}"
        
        # Check alias resolution
        wood_planks = items[0]
        assert wood_planks["original"] == "wod planks"
        assert wood_planks["resolved"] == "Wood Planks"
        assert wood_planks["confidence"] == "alias"
        
        # Check exact match
        bandage = items[3]
        assert bandage["resolved"] == "Bandage"
        assert bandage["confidence"] == "exact"
        
        # Check unknown
        unknown = items[4]
        assert unknown["confidence"] == "unknown"
        
        print(f"✓ POST /api/loot-intel/resolve-aliases resolved {len(items)} items correctly")
        
    def test_shortfall_intel(self):
        """POST /api/loot-intel/shortfall-intel returns location intel for missing items"""
        response = self.session.post(f"{BASE_URL}/api/loot-intel/shortfall-intel", json={
            "items": [
                {"item": "Wood Planks", "quantity": 20},
                {"item": "Metal Sheets", "quantity": 10},
                {"item": "Nails", "quantity": 30}
            ]
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "intel" in data, "Response should have intel"
        intel = data["intel"]
        assert len(intel) == 3, f"Expected 3 items, got {len(intel)}"
        
        # Verify structure
        wood = intel[0]
        assert wood["item_name"] == "Wood Planks"
        assert wood["quantity_needed"] == 20
        assert len(wood["locations"]) > 0
        
        # Verify location has danger info
        loc = wood["locations"][0]
        assert "danger" in loc
        assert "probability" in loc
        
        print(f"✓ POST /api/loot-intel/shortfall-intel returned intel for {len(intel)} items")
        
    # =========================================================================
    # BASE PLANNER TESTS
    # =========================================================================
    
    def test_get_planner_modules(self):
        """GET /api/planner/modules returns 12 module types"""
        response = self.session.get(f"{BASE_URL}/api/planner/modules")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 12, f"Expected 12 modules, got {len(data)}"
        
        # Verify module structure
        module = data[0]
        assert "module_type" in module
        assert "label" in module
        assert "category" in module
        assert "description" in module
        assert "recipes_needed" in module
        assert "color" in module
        
        # Check for expected modules
        module_types = [m["module_type"] for m in data]
        expected = ["storage_room", "armory", "med_bay", "crafting_station", 
                    "watchtower", "generator_room", "kitchen", "barricade",
                    "metal_wall", "concrete_bunker", "sleeping_quarters", "empty"]
        for exp in expected:
            assert exp in module_types, f"Missing module type: {exp}"
        
        print(f"✓ GET /api/planner/modules returned {len(data)} modules")
        
    def test_create_blueprint(self):
        """POST /api/planner/blueprints creates a blueprint with material aggregation"""
        response = self.session.post(f"{BASE_URL}/api/planner/blueprints", json={
            "name": "TEST_Blueprint_Alpha",
            "grid_size": 8,
            "modules": [
                {"x": 0, "y": 0, "module_type": "storage_room"},
                {"x": 1, "y": 0, "module_type": "armory"},
                {"x": 0, "y": 1, "module_type": "med_bay"},
                {"x": 1, "y": 1, "module_type": "watchtower"}
            ],
            "notes": "Test blueprint for automated testing"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "blueprint_id" in data, "Response should have blueprint_id"
        assert data["name"] == "TEST_Blueprint_Alpha"
        assert len(data["modules"]) == 4
        
        # Verify material aggregation
        assert "materials" in data
        assert "recipes" in data["materials"]
        assert "raw_materials" in data["materials"]
        assert len(data["materials"]["recipes"]) > 0, "Should have recipes"
        assert len(data["materials"]["raw_materials"]) > 0, "Should have raw materials"
        
        # Store blueprint_id for later tests
        self.blueprint_id = data["blueprint_id"]
        print(f"✓ POST /api/planner/blueprints created blueprint: {self.blueprint_id}")
        
        return data["blueprint_id"]
        
    def test_list_blueprints(self):
        """GET /api/planner/blueprints lists saved blueprints"""
        response = self.session.get(f"{BASE_URL}/api/planner/blueprints")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GET /api/planner/blueprints returned {len(data)} blueprints")
        
    def test_get_blueprint(self):
        """GET /api/planner/blueprints/{id} returns specific blueprint"""
        # First create a blueprint
        create_response = self.session.post(f"{BASE_URL}/api/planner/blueprints", json={
            "name": "TEST_Blueprint_Get",
            "grid_size": 8,
            "modules": [{"x": 2, "y": 2, "module_type": "kitchen"}]
        })
        assert create_response.status_code == 200
        blueprint_id = create_response.json()["blueprint_id"]
        
        # Get the blueprint
        response = self.session.get(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["blueprint_id"] == blueprint_id
        assert data["name"] == "TEST_Blueprint_Get"
        
        print(f"✓ GET /api/planner/blueprints/{blueprint_id} returned blueprint")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}")
        
    def test_update_blueprint(self):
        """PUT /api/planner/blueprints/{id} updates blueprint"""
        # First create a blueprint
        create_response = self.session.post(f"{BASE_URL}/api/planner/blueprints", json={
            "name": "TEST_Blueprint_Update",
            "grid_size": 8,
            "modules": [{"x": 0, "y": 0, "module_type": "barricade"}]
        })
        assert create_response.status_code == 200
        blueprint_id = create_response.json()["blueprint_id"]
        
        # Update the blueprint
        response = self.session.put(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}", json={
            "name": "TEST_Blueprint_Updated",
            "modules": [
                {"x": 0, "y": 0, "module_type": "barricade"},
                {"x": 1, "y": 0, "module_type": "metal_wall"}
            ]
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify update
        get_response = self.session.get(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}")
        data = get_response.json()
        assert data["name"] == "TEST_Blueprint_Updated"
        assert len(data["modules"]) == 2
        
        print(f"✓ PUT /api/planner/blueprints/{blueprint_id} updated blueprint")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}")
        
    def test_delete_blueprint(self):
        """DELETE /api/planner/blueprints/{id} deletes blueprint"""
        # First create a blueprint
        create_response = self.session.post(f"{BASE_URL}/api/planner/blueprints", json={
            "name": "TEST_Blueprint_Delete",
            "grid_size": 8,
            "modules": []
        })
        assert create_response.status_code == 200
        blueprint_id = create_response.json()["blueprint_id"]
        
        # Delete the blueprint
        response = self.session.delete(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        # Verify deletion
        get_response = self.session.get(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}")
        assert get_response.status_code == 404
        
        print(f"✓ DELETE /api/planner/blueprints/{blueprint_id} deleted blueprint")
        
    def test_calculate_blueprint_materials(self):
        """POST /api/planner/blueprints/{id}/calculate cross-references inventory"""
        # First create a blueprint with modules
        create_response = self.session.post(f"{BASE_URL}/api/planner/blueprints", json={
            "name": "TEST_Blueprint_Calculate",
            "grid_size": 8,
            "modules": [
                {"x": 0, "y": 0, "module_type": "storage_room"},
                {"x": 1, "y": 0, "module_type": "armory"},
                {"x": 2, "y": 0, "module_type": "watchtower"}
            ]
        })
        assert create_response.status_code == 200
        blueprint_id = create_response.json()["blueprint_id"]
        
        # Calculate materials
        response = self.session.post(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}/calculate")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "blueprint_name" in data
        assert "module_count" in data
        assert data["module_count"] == 3
        assert "recipes" in data
        assert "breakdown" in data
        assert "shortfall" in data
        assert "can_build" in data
        
        # Verify breakdown structure
        if data["breakdown"]:
            item = data["breakdown"][0]
            assert "item" in item
            assert "needed" in item
            assert "have" in item
            assert "short" in item
        
        print(f"✓ POST /api/planner/blueprints/{blueprint_id}/calculate returned material breakdown")
        print(f"  - Module count: {data['module_count']}")
        print(f"  - Recipes needed: {len(data['recipes'])}")
        print(f"  - Raw materials: {len(data['breakdown'])}")
        print(f"  - Can build: {data['can_build']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/planner/blueprints/{blueprint_id}")
        
    # =========================================================================
    # CLEANUP
    # =========================================================================
    
    def test_cleanup_test_blueprints(self):
        """Cleanup any TEST_ prefixed blueprints"""
        response = self.session.get(f"{BASE_URL}/api/planner/blueprints")
        if response.status_code == 200:
            blueprints = response.json()
            for bp in blueprints:
                if bp.get("name", "").startswith("TEST_"):
                    self.session.delete(f"{BASE_URL}/api/planner/blueprints/{bp['blueprint_id']}")
                    print(f"  Cleaned up: {bp['name']}")
        print("✓ Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
