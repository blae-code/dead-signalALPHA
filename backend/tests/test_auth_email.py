"""
Test suite for Dead Signal email+password authentication system.
Tests: registration, login, logout, /me, onboarding, admin user management.
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials from env
ADMIN_EMAIL = "commander@deadsignal.com"
ADMIN_PASSWORD = "DeadSignal2024!"
ADMIN_CALLSIGN = "Commander"


@pytest.fixture
def api_client():
    """Fresh requests session with cookies enabled for each test."""
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    return session


@pytest.fixture
def admin_session():
    """Login as admin and return a fresh session."""
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    response = session.post(f'{BASE_URL}/api/auth/login', json={
        'email': ADMIN_EMAIL,
        'password': ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f'Admin login failed: {response.status_code} - {response.text}')
    return session


class TestHealthCheck:
    """Basic health check to ensure API is running."""
    
    def test_health_live(self, api_client):
        response = api_client.get(f'{BASE_URL}/api/health/live')
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'alive'
        print(f"Health check passed: {data}")


class TestRegistration:
    """Test user registration flow."""
    
    def test_register_success(self, api_client):
        """Register a new user with valid data."""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            'callsign': f'TEST_User_{unique_id}',
            'email': f'test_{unique_id}@example.com',
            'password': 'TestPass123!'
        }
        response = api_client.post(f'{BASE_URL}/api/auth/register', json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert 'user' in data
        assert data['user']['callsign'] == payload['callsign']
        assert data['user']['email'] == payload['email'].lower()
        assert data['user']['role'] == 'player'
        assert data['user']['onboarded'] == False
        assert 'id' in data['user']
        print(f"Registration success: {data['user']['callsign']}")
        
        # Store for cleanup
        return data['user']['id']
    
    def test_register_duplicate_email(self, api_client):
        """Duplicate email should fail with 400."""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            'callsign': f'TEST_Dup1_{unique_id}',
            'email': f'dup_{unique_id}@example.com',
            'password': 'TestPass123!'
        }
        # First registration
        response1 = api_client.post(f'{BASE_URL}/api/auth/register', json=payload)
        assert response1.status_code == 200
        
        # Second registration with same email
        payload2 = {
            'callsign': f'TEST_Dup2_{unique_id}',
            'email': f'dup_{unique_id}@example.com',  # Same email
            'password': 'TestPass456!'
        }
        response2 = api_client.post(f'{BASE_URL}/api/auth/register', json=payload2)
        assert response2.status_code == 400
        assert 'already registered' in response2.json().get('detail', '').lower()
        print("Duplicate email correctly rejected")
    
    def test_register_duplicate_callsign(self, api_client):
        """Duplicate callsign should fail with 400."""
        unique_id = str(uuid.uuid4())[:8]
        callsign = f'TEST_DupCall_{unique_id}'
        
        # First registration
        payload1 = {
            'callsign': callsign,
            'email': f'call1_{unique_id}@example.com',
            'password': 'TestPass123!'
        }
        response1 = api_client.post(f'{BASE_URL}/api/auth/register', json=payload1)
        assert response1.status_code == 200
        
        # Second registration with same callsign
        payload2 = {
            'callsign': callsign,  # Same callsign
            'email': f'call2_{unique_id}@example.com',
            'password': 'TestPass456!'
        }
        response2 = api_client.post(f'{BASE_URL}/api/auth/register', json=payload2)
        assert response2.status_code == 400
        assert 'already taken' in response2.json().get('detail', '').lower()
        print("Duplicate callsign correctly rejected")
    
    def test_register_short_callsign(self, api_client):
        """Callsign < 2 chars should fail."""
        payload = {
            'callsign': 'A',
            'email': f'short_{uuid.uuid4().hex[:8]}@example.com',
            'password': 'TestPass123!'
        }
        response = api_client.post(f'{BASE_URL}/api/auth/register', json=payload)
        assert response.status_code == 400
        assert 'at least 2' in response.json().get('detail', '').lower()
        print("Short callsign correctly rejected")
    
    def test_register_short_password(self, api_client):
        """Password < 6 chars should fail."""
        payload = {
            'callsign': f'TEST_ShortPw_{uuid.uuid4().hex[:8]}',
            'email': f'shortpw_{uuid.uuid4().hex[:8]}@example.com',
            'password': '12345'
        }
        response = api_client.post(f'{BASE_URL}/api/auth/register', json=payload)
        assert response.status_code == 400
        assert 'at least 6' in response.json().get('detail', '').lower()
        print("Short password correctly rejected")


class TestLogin:
    """Test login flow."""
    
    def test_login_admin_success(self, api_client):
        """Login with admin credentials."""
        response = api_client.post(f'{BASE_URL}/api/auth/login', json={
            'email': ADMIN_EMAIL,
            'password': ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        
        data = response.json()
        assert 'user' in data
        assert data['user']['email'] == ADMIN_EMAIL
        assert data['user']['callsign'] == ADMIN_CALLSIGN
        assert data['user']['role'] == 'system_admin'
        assert data['user']['onboarded'] == True  # Admin is pre-onboarded
        print(f"Admin login success: {data['user']['callsign']}")
        
        # Check cookies are set
        assert 'access_token' in api_client.cookies or response.cookies.get('access_token')
        print("Auth cookies set correctly")
    
    def test_login_invalid_email(self, api_client):
        """Invalid email should fail with 401."""
        response = api_client.post(f'{BASE_URL}/api/auth/login', json={
            'email': 'nonexistent@example.com',
            'password': 'SomePassword123!'
        })
        assert response.status_code == 401
        assert 'invalid' in response.json().get('detail', '').lower()
        print("Invalid email correctly rejected")
    
    def test_login_invalid_password(self, api_client):
        """Invalid password should fail with 401."""
        response = api_client.post(f'{BASE_URL}/api/auth/login', json={
            'email': ADMIN_EMAIL,
            'password': 'WrongPassword123!'
        })
        assert response.status_code == 401
        assert 'invalid' in response.json().get('detail', '').lower()
        print("Invalid password correctly rejected")


class TestAuthMe:
    """Test /auth/me endpoint."""
    
    def test_get_me_authenticated(self, admin_session):
        """GET /auth/me returns current user."""
        response = admin_session.get(f'{BASE_URL}/api/auth/me')
        assert response.status_code == 200, f"Get me failed: {response.text}"
        
        data = response.json()
        assert data['email'] == ADMIN_EMAIL
        assert data['callsign'] == ADMIN_CALLSIGN
        assert data['role'] == 'system_admin'
        assert 'password_hash' not in data  # Should not expose password
        print(f"GET /me success: {data['callsign']}")
    
    def test_get_me_unauthenticated(self):
        """GET /auth/me without auth should fail."""
        session = requests.Session()
        response = session.get(f'{BASE_URL}/api/auth/me')
        assert response.status_code == 401
        print("Unauthenticated /me correctly rejected")


class TestOnboarding:
    """Test onboarding flow."""
    
    def test_onboard_user(self, api_client):
        """POST /auth/onboard sets onboarded=true."""
        # Register a new user
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            'callsign': f'TEST_Onboard_{unique_id}',
            'email': f'onboard_{unique_id}@example.com',
            'password': 'TestPass123!'
        }
        reg_response = api_client.post(f'{BASE_URL}/api/auth/register', json=payload)
        assert reg_response.status_code == 200
        
        user_data = reg_response.json()['user']
        assert user_data['onboarded'] == False
        
        # Complete onboarding
        onboard_response = api_client.post(f'{BASE_URL}/api/auth/onboard')
        assert onboard_response.status_code == 200
        assert 'complete' in onboard_response.json().get('message', '').lower()
        
        # Verify onboarded status via /me
        me_response = api_client.get(f'{BASE_URL}/api/auth/me')
        assert me_response.status_code == 200
        assert me_response.json()['onboarded'] == True
        print("Onboarding flow completed successfully")


class TestLogout:
    """Test logout flow."""
    
    def test_logout(self, api_client):
        """POST /auth/logout clears cookies."""
        # First login
        login_response = api_client.post(f'{BASE_URL}/api/auth/login', json={
            'email': ADMIN_EMAIL,
            'password': ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        
        # Logout
        logout_response = api_client.post(f'{BASE_URL}/api/auth/logout')
        assert logout_response.status_code == 200
        assert 'logged out' in logout_response.json().get('message', '').lower()
        print("Logout successful")


class TestAdminUserManagement:
    """Test admin user management endpoints."""
    
    def test_list_users_admin(self, admin_session):
        """GET /admin/users lists all users (admin only)."""
        response = admin_session.get(f'{BASE_URL}/api/admin/users')
        assert response.status_code == 200, f"List users failed: {response.text}"
        
        users = response.json()
        assert isinstance(users, list)
        assert len(users) >= 1  # At least admin exists
        
        # Check admin is in list
        admin_found = any(u['email'] == ADMIN_EMAIL for u in users)
        assert admin_found, "Admin not found in user list"
        
        # Check no password_hash exposed
        for u in users:
            assert 'password_hash' not in u
        print(f"Listed {len(users)} users")
    
    def test_list_users_non_admin(self, api_client):
        """Non-admin cannot list users."""
        # Register a player
        unique_id = str(uuid.uuid4())[:8]
        reg_response = api_client.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_Player_{unique_id}',
            'email': f'player_{unique_id}@example.com',
            'password': 'TestPass123!'
        })
        assert reg_response.status_code == 200
        
        # Try to list users
        response = api_client.get(f'{BASE_URL}/api/admin/users')
        assert response.status_code == 403
        print("Non-admin correctly denied access to user list")
    
    def test_suspend_and_activate_user(self, admin_session):
        """Admin can suspend and activate users."""
        # First create a test user
        unique_id = str(uuid.uuid4())[:8]
        new_session = requests.Session()
        new_session.headers.update({'Content-Type': 'application/json'})
        
        reg_response = new_session.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_Suspend_{unique_id}',
            'email': f'suspend_{unique_id}@example.com',
            'password': 'TestPass123!'
        })
        assert reg_response.status_code == 200
        user_id = reg_response.json()['user']['id']
        
        # Suspend user
        suspend_response = admin_session.post(f'{BASE_URL}/api/admin/users/{user_id}/suspend')
        assert suspend_response.status_code == 200
        assert 'suspended' in suspend_response.json().get('message', '').lower()
        print(f"User {user_id} suspended")
        
        # Verify suspended user cannot login
        login_response = new_session.post(f'{BASE_URL}/api/auth/login', json={
            'email': f'suspend_{unique_id}@example.com',
            'password': 'TestPass123!'
        })
        assert login_response.status_code == 403
        print("Suspended user correctly denied login")
        
        # Activate user
        activate_response = admin_session.post(f'{BASE_URL}/api/admin/users/{user_id}/activate')
        assert activate_response.status_code == 200
        assert 'activated' in activate_response.json().get('message', '').lower()
        print(f"User {user_id} activated")
        
        # Verify activated user can login
        login_response2 = new_session.post(f'{BASE_URL}/api/auth/login', json={
            'email': f'suspend_{unique_id}@example.com',
            'password': 'TestPass123!'
        })
        assert login_response2.status_code == 200
        print("Activated user can login again")
    
    def test_delete_user(self, admin_session):
        """Admin can delete users."""
        # Create a test user
        unique_id = str(uuid.uuid4())[:8]
        new_session = requests.Session()
        new_session.headers.update({'Content-Type': 'application/json'})
        
        reg_response = new_session.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_Delete_{unique_id}',
            'email': f'delete_{unique_id}@example.com',
            'password': 'TestPass123!'
        })
        assert reg_response.status_code == 200
        user_id = reg_response.json()['user']['id']
        
        # Delete user
        delete_response = admin_session.delete(f'{BASE_URL}/api/admin/users/{user_id}')
        assert delete_response.status_code == 200
        assert 'deleted' in delete_response.json().get('message', '').lower()
        print(f"User {user_id} deleted")
        
        # Verify deleted user cannot login
        login_response = new_session.post(f'{BASE_URL}/api/auth/login', json={
            'email': f'delete_{unique_id}@example.com',
            'password': 'TestPass123!'
        })
        assert login_response.status_code == 401
        print("Deleted user correctly cannot login")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
