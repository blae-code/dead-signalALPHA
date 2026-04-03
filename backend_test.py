#!/usr/bin/env python3
"""
Dead Signal Backend API Testing Suite
Tests all backend endpoints for the Dead Signal app
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class DeadSignalAPITester:
    def __init__(self, base_url: str = "https://dead-signal.preview.emergentagent.com"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_token = None
        self.player_token = None
        self.test_results = []

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            'test': name,
            'success': success,
            'details': details,
            'response_data': response_data
        })

    def test_endpoint(self, method: str, endpoint: str, expected_status: int, 
                     data: Optional[Dict] = None, headers: Optional[Dict] = None,
                     test_name: str = "") -> tuple[bool, Any]:
        """Test a single endpoint"""
        url = f"{self.base_url}/api{endpoint}"
        test_name = test_name or f"{method} {endpoint}"
        
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, headers=headers)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data, headers=headers)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url, headers=headers)
            else:
                self.log_test(test_name, False, f"Unsupported method: {method}")
                return False, None

            success = response.status_code == expected_status
            response_data = None
            
            try:
                response_data = response.json()
            except:
                response_data = response.text

            if success:
                self.log_test(test_name, True, f"Status: {response.status_code}", response_data)
            else:
                self.log_test(test_name, False, 
                            f"Expected {expected_status}, got {response.status_code}. Response: {response_data}")

            return success, response_data

        except Exception as e:
            self.log_test(test_name, False, f"Exception: {str(e)}")
            return False, None

    def test_auth_flow(self):
        """Test authentication endpoints with new Callsign + Auth Key system"""
        print("\n🔐 Testing Authentication Flow...")
        
        # Test setup status first
        self.test_endpoint('GET', '/auth/setup-status', 200, test_name="Setup Status Check")
        
        # Test admin login with Callsign + Auth Key
        success, data = self.test_endpoint(
            'POST', '/auth/login', 200,
            {'callsign': 'Commander', 'auth_key': 'DS-NV3F-CQ4Q-STFP-CVGN'},
            test_name="Admin Login (Commander)"
        )
        
        if success and data and 'token' in data:
            self.admin_token = data['token']
            self.session.headers['Authorization'] = f'Bearer {self.admin_token}'
            print(f"   Admin token acquired: {self.admin_token[:20]}...")
            print(f"   Admin role: {data.get('role', 'unknown')}")
        else:
            print("   ❌ Failed to get admin token")
            return False

        # Test /auth/me with admin token
        self.test_endpoint('GET', '/auth/me', 200, test_name="Get Current User (Admin)")

        # Test player login with Callsign + Auth Key
        success, data = self.test_endpoint(
            'POST', '/auth/login', 200,
            {'callsign': 'Ghost', 'auth_key': 'DS-HW7V-LL44-3LV2-33TL'},
            test_name="Player Login (Ghost)"
        )
        
        if success and data and 'token' in data:
            self.player_token = data['token']
            print(f"   Player token acquired: {self.player_token[:20]}...")
            print(f"   Player role: {data.get('role', 'unknown')}")
        
        # Test logout
        self.test_endpoint('POST', '/auth/logout', 200, test_name="Logout")
        
        # Test refresh token
        self.test_endpoint('POST', '/auth/refresh', 401, test_name="Refresh Token (should fail after logout)")
        
        return True

    def test_server_endpoints(self):
        """Test server management endpoints"""
        print("\n🖥️  Testing Server Endpoints...")
        
        # Ensure we have admin token
        if not self.admin_token:
            print("   ❌ No admin token available")
            return False
            
        self.session.headers['Authorization'] = f'Bearer {self.admin_token}'
        
        # Test server status
        self.test_endpoint('GET', '/server/status', 200, test_name="Server Status")
        
        # Test power actions (these might fail due to Pterodactyl 401, but should return proper error)
        for action in ['start', 'stop', 'restart', 'kill']:
            self.test_endpoint(
                'POST', '/server/power', 200,
                {'signal': action},
                test_name=f"Power Action: {action}"
            )
        
        # Test command sending
        self.test_endpoint(
            'POST', '/server/command', 200,
            {'command': 'help'},
            test_name="Send Command"
        )
        
        # Test file listing
        self.test_endpoint('GET', '/server/files', 200, test_name="List Files")
        
        # Test backups
        self.test_endpoint('GET', '/server/backups', 200, test_name="List Backups")

    def test_event_endpoints(self):
        """Test event management endpoints"""
        print("\n📊 Testing Event Endpoints...")
        
        if not self.admin_token:
            print("   ❌ No admin token available")
            return False
            
        self.session.headers['Authorization'] = f'Bearer {self.admin_token}'
        
        # Test get events
        self.test_endpoint('GET', '/events', 200, test_name="Get Events")
        
        # Test add event
        self.test_endpoint(
            'POST', '/events', 200,
            {'raw': 'Player TestUser connected to the server'},
            test_name="Add Event"
        )
        
        # Test event stats
        self.test_endpoint('GET', '/events/stats', 200, test_name="Event Stats")

    def test_admin_key_management(self):
        """Test admin key management endpoints"""
        print("\n🔑 Testing Admin Key Management...")
        
        if not self.admin_token:
            print("   ❌ No admin token available")
            return False
            
        self.session.headers['Authorization'] = f'Bearer {self.admin_token}'
        
        # Test list keys
        success, data = self.test_endpoint('GET', '/admin/keys', 200, test_name="List Auth Keys")
        if success and data:
            print(f"   Found {len(data)} users in system")
            for user in data:
                print(f"   - {user.get('callsign', 'unknown')}: {user.get('role', 'unknown')} ({user.get('status', 'unknown')})")
        
        # Test generate new key
        test_callsign = f"TestUser{datetime.now().strftime('%H%M%S')}"
        success, data = self.test_endpoint(
            'POST', '/admin/keys', 200,
            {'callsign': test_callsign, 'role': 'player'},
            test_name="Generate New Auth Key"
        )
        
        new_user_id = None
        if success and data:
            new_user_id = data.get('id')
            print(f"   Generated key for {test_callsign}: {data.get('auth_key', 'N/A')}")
        
        if new_user_id:
            # Test reissue key
            self.test_endpoint(
                'POST', f'/admin/keys/{new_user_id}/reissue', 200,
                test_name="Reissue Auth Key"
            )
            
            # Test suspend user
            self.test_endpoint(
                'POST', f'/admin/keys/{new_user_id}/suspend', 200,
                test_name="Suspend User"
            )
            
            # Test activate user
            self.test_endpoint(
                'POST', f'/admin/keys/{new_user_id}/activate', 200,
                test_name="Activate User"
            )
            
            # Test delete user
            self.test_endpoint(
                'DELETE', f'/admin/keys/{new_user_id}', 200,
                test_name="Delete User"
            )
        
        return True

    def test_suspended_user_login(self):
        """Test that suspended users cannot login"""
        print("\n🚫 Testing Suspended User Login...")
        
        if not self.admin_token:
            print("   ❌ No admin token available")
            return False
            
        self.session.headers['Authorization'] = f'Bearer {self.admin_token}'
        
        # Create a test user
        test_callsign = f"SuspendTest{datetime.now().strftime('%H%M%S')}"
        success, data = self.test_endpoint(
            'POST', '/admin/keys', 200,
            {'callsign': test_callsign, 'role': 'player'},
            test_name="Create Test User for Suspension"
        )
        
        if not success or not data:
            print("   ❌ Failed to create test user")
            return False
            
        test_user_id = data.get('id')
        test_auth_key = data.get('auth_key')
        
        # Suspend the user
        self.test_endpoint(
            'POST', f'/admin/keys/{test_user_id}/suspend', 200,
            test_name="Suspend Test User"
        )
        
        # Try to login with suspended user (should fail)
        self.test_endpoint(
            'POST', '/auth/login', 403,
            {'callsign': test_callsign, 'auth_key': test_auth_key},
            test_name="Login with Suspended User (should fail)"
        )
        
        # Clean up - delete the test user
        self.test_endpoint(
            'DELETE', f'/admin/keys/{test_user_id}', 200,
            test_name="Cleanup: Delete Test User"
        )
        
        return True

    def test_narrative_endpoints(self):
        """Test AI narrative endpoints"""
        print("\n🤖 Testing AI Narrative Endpoints...")
        
        if not self.admin_token:
            print("   ❌ No admin token available")
            return False
            
        self.session.headers['Authorization'] = f'Bearer {self.admin_token}'
        
        # Test radio report
        self.test_endpoint('POST', '/narrative/radio-report', 200, test_name="Radio Report")
        
        # Test ambient dispatch
        for time_of_day in ['dawn', 'noon', 'dusk']:
            self.test_endpoint(
                'POST', f'/narrative/ambient?time_of_day={time_of_day}', 200,
                test_name=f"Ambient Dispatch: {time_of_day}"
            )
        
        # Test event narration
        test_event = {
            'type': 'player_connect',
            'severity': 'info',
            'raw': 'Player TestUser connected',
            'timestamp': datetime.now().isoformat(),
            'players': ['TestUser'],
            'details': {}
        }
        self.test_endpoint(
            'POST', '/narrative/narrate', 200,
            {'event': test_event},
            test_name="Narrate Event"
        )
        
        # Test narrative history
        self.test_endpoint('GET', '/narrative/history', 200, test_name="Narrative History")

        return True

    def test_unauthorized_access(self):
        """Test endpoints without authentication"""
        print("\n🚫 Testing Unauthorized Access...")
        
        # Remove auth header
        if 'Authorization' in self.session.headers:
            del self.session.headers['Authorization']
        
        # These should all return 401
        endpoints_requiring_auth = [
            ('/auth/me', 'GET'),
            ('/server/status', 'GET'),
            ('/events', 'GET'),
            ('/narrative/radio-report', 'POST')
        ]
        
        for endpoint, method in endpoints_requiring_auth:
            self.test_endpoint(method, endpoint, 401, test_name=f"Unauthorized: {method} {endpoint}")

    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting Dead Signal Backend API Tests")
        print(f"Testing against: {self.base_url}")
        print("=" * 60)
        
        try:
            # Test authentication first
            if not self.test_auth_flow():
                print("❌ Authentication tests failed, stopping")
                return False
            
            # Test other endpoints
            self.test_server_endpoints()
            self.test_event_endpoints()
            self.test_admin_key_management()
            self.test_suspended_user_login()
            self.test_narrative_endpoints()
            self.test_unauthorized_access()
            
        except Exception as e:
            print(f"❌ Test suite failed with exception: {e}")
            return False
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

    def get_failed_tests(self):
        """Get list of failed tests"""
        return [test for test in self.test_results if not test['success']]

def main():
    """Main test runner"""
    tester = DeadSignalAPITester()
    success = tester.run_all_tests()
    
    # Print failed tests for debugging
    failed_tests = tester.get_failed_tests()
    if failed_tests:
        print("\n❌ Failed Tests Details:")
        for test in failed_tests:
            print(f"  - {test['test']}: {test['details']}")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())