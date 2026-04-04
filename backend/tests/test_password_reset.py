"""
Test suite for Dead Signal password reset and admin reset link features.
Tests: forgot-password, reset-password, admin reset-link generation.
"""
import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "commander@deadsignal.com"
ADMIN_PASSWORD = "DeadSignal2024!"


@pytest.fixture
def api_client():
    """Fresh requests session with cookies enabled."""
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    return session


@pytest.fixture
def admin_session():
    """Login as admin and return session."""
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    response = session.post(f'{BASE_URL}/api/auth/login', json={
        'email': ADMIN_EMAIL,
        'password': ADMIN_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f'Admin login failed: {response.status_code} - {response.text}')
    return session


class TestForgotPassword:
    """Test forgot-password endpoint."""
    
    def test_forgot_password_valid_email(self, api_client):
        """POST /auth/forgot-password with valid email generates reset token."""
        # First register a user
        unique_id = str(uuid.uuid4())[:8]
        email = f'reset_{unique_id}@example.com'
        
        reg_response = api_client.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_Reset_{unique_id}',
            'email': email,
            'password': 'OldPassword123!'
        })
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        
        # Request password reset
        reset_response = api_client.post(f'{BASE_URL}/api/auth/forgot-password', json={
            'email': email
        })
        assert reset_response.status_code == 200, f"Forgot password failed: {reset_response.text}"
        
        data = reset_response.json()
        assert 'message' in data
        assert 'reset_token' in data  # Token returned in response (no email service)
        assert len(data['reset_token']) > 20  # Token should be substantial
        print(f"Reset token generated: {data['reset_token'][:10]}...")
    
    def test_forgot_password_nonexistent_email(self, api_client):
        """POST /auth/forgot-password with nonexistent email still returns 200 (prevent enumeration)."""
        response = api_client.post(f'{BASE_URL}/api/auth/forgot-password', json={
            'email': 'nonexistent_user_xyz@example.com'
        })
        assert response.status_code == 200
        data = response.json()
        assert 'message' in data
        # Should NOT return a token for nonexistent email
        assert 'reset_token' not in data or data.get('reset_token') is None
        print("Nonexistent email handled correctly (no enumeration)")
    
    def test_forgot_password_missing_email(self, api_client):
        """POST /auth/forgot-password without email should fail."""
        response = api_client.post(f'{BASE_URL}/api/auth/forgot-password', json={})
        assert response.status_code == 400
        assert 'email' in response.json().get('detail', '').lower()
        print("Missing email correctly rejected")


class TestResetPassword:
    """Test reset-password endpoint."""
    
    def test_reset_password_valid_token(self, api_client):
        """POST /auth/reset-password with valid token updates password."""
        # Register a user
        unique_id = str(uuid.uuid4())[:8]
        email = f'resetpw_{unique_id}@example.com'
        old_password = 'OldPassword123!'
        new_password = 'NewPassword456!'
        
        reg_response = api_client.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_ResetPw_{unique_id}',
            'email': email,
            'password': old_password
        })
        assert reg_response.status_code == 200
        
        # Get reset token
        forgot_response = api_client.post(f'{BASE_URL}/api/auth/forgot-password', json={
            'email': email
        })
        assert forgot_response.status_code == 200
        token = forgot_response.json()['reset_token']
        
        # Reset password
        reset_response = api_client.post(f'{BASE_URL}/api/auth/reset-password', json={
            'token': token,
            'password': new_password
        })
        assert reset_response.status_code == 200, f"Reset failed: {reset_response.text}"
        assert 'updated' in reset_response.json().get('message', '').lower()
        print("Password reset successful")
        
        # Verify old password no longer works
        login_old = api_client.post(f'{BASE_URL}/api/auth/login', json={
            'email': email,
            'password': old_password
        })
        assert login_old.status_code == 401
        print("Old password correctly rejected")
        
        # Verify new password works
        login_new = api_client.post(f'{BASE_URL}/api/auth/login', json={
            'email': email,
            'password': new_password
        })
        assert login_new.status_code == 200
        print("New password works correctly")
    
    def test_reset_password_invalid_token(self, api_client):
        """POST /auth/reset-password with invalid token returns 400."""
        response = api_client.post(f'{BASE_URL}/api/auth/reset-password', json={
            'token': 'invalid_token_xyz123',
            'password': 'NewPassword123!'
        })
        assert response.status_code == 400
        assert 'invalid' in response.json().get('detail', '').lower() or 'expired' in response.json().get('detail', '').lower()
        print("Invalid token correctly rejected")
    
    def test_reset_password_short_password(self, api_client):
        """POST /auth/reset-password with short password returns 400."""
        # Register and get token
        unique_id = str(uuid.uuid4())[:8]
        email = f'shortpw_{unique_id}@example.com'
        
        api_client.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_ShortPw_{unique_id}',
            'email': email,
            'password': 'OldPassword123!'
        })
        
        forgot_response = api_client.post(f'{BASE_URL}/api/auth/forgot-password', json={
            'email': email
        })
        token = forgot_response.json().get('reset_token', 'dummy')
        
        # Try to reset with short password
        response = api_client.post(f'{BASE_URL}/api/auth/reset-password', json={
            'token': token,
            'password': '12345'  # Too short
        })
        assert response.status_code == 400
        assert 'at least 6' in response.json().get('detail', '').lower()
        print("Short password correctly rejected")
    
    def test_reset_password_missing_token(self, api_client):
        """POST /auth/reset-password without token returns 400."""
        response = api_client.post(f'{BASE_URL}/api/auth/reset-password', json={
            'password': 'NewPassword123!'
        })
        assert response.status_code == 400
        assert 'token' in response.json().get('detail', '').lower()
        print("Missing token correctly rejected")
    
    def test_reset_token_single_use(self, api_client):
        """Reset token should be invalidated after use."""
        # Register a user
        unique_id = str(uuid.uuid4())[:8]
        email = f'singleuse_{unique_id}@example.com'
        
        api_client.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_SingleUse_{unique_id}',
            'email': email,
            'password': 'OldPassword123!'
        })
        
        # Get reset token
        forgot_response = api_client.post(f'{BASE_URL}/api/auth/forgot-password', json={
            'email': email
        })
        token = forgot_response.json()['reset_token']
        
        # Use token once
        reset1 = api_client.post(f'{BASE_URL}/api/auth/reset-password', json={
            'token': token,
            'password': 'NewPassword123!'
        })
        assert reset1.status_code == 200
        
        # Try to use same token again
        reset2 = api_client.post(f'{BASE_URL}/api/auth/reset-password', json={
            'token': token,
            'password': 'AnotherPassword456!'
        })
        assert reset2.status_code == 400
        print("Token correctly invalidated after single use")


class TestAdminResetLink:
    """Test admin reset-link generation endpoint."""
    
    def test_admin_reset_link_success(self, admin_session, api_client):
        """POST /admin/users/{id}/reset-link generates reset link (admin only)."""
        # Create a test user
        unique_id = str(uuid.uuid4())[:8]
        email = f'adminreset_{unique_id}@example.com'
        
        reg_response = api_client.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_AdminReset_{unique_id}',
            'email': email,
            'password': 'OldPassword123!'
        })
        assert reg_response.status_code == 200
        user_id = reg_response.json()['user']['id']
        
        # Admin generates reset link
        reset_link_response = admin_session.post(f'{BASE_URL}/api/admin/users/{user_id}/reset-link')
        assert reset_link_response.status_code == 200, f"Reset link failed: {reset_link_response.text}"
        
        data = reset_link_response.json()
        assert 'reset_url' in data
        assert 'token' in data
        assert 'callsign' in data
        assert 'expires' in data
        assert data['callsign'] == f'TEST_AdminReset_{unique_id}'
        print(f"Admin reset link generated: {data['reset_url'][:50]}...")
        
        # Verify the token works
        reset_response = api_client.post(f'{BASE_URL}/api/auth/reset-password', json={
            'token': data['token'],
            'password': 'AdminResetPassword789!'
        })
        assert reset_response.status_code == 200
        print("Admin-generated reset token works correctly")
    
    def test_admin_reset_link_non_admin(self, api_client):
        """Non-admin cannot generate reset links."""
        # Register a player
        unique_id = str(uuid.uuid4())[:8]
        
        reg_response = api_client.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_NonAdmin_{unique_id}',
            'email': f'nonadmin_{unique_id}@example.com',
            'password': 'TestPass123!'
        })
        assert reg_response.status_code == 200
        user_id = reg_response.json()['user']['id']
        
        # Try to generate reset link as non-admin
        response = api_client.post(f'{BASE_URL}/api/admin/users/{user_id}/reset-link')
        assert response.status_code == 403
        print("Non-admin correctly denied reset link generation")
    
    def test_admin_reset_link_nonexistent_user(self, admin_session):
        """Admin reset link for nonexistent user returns 404."""
        fake_id = '000000000000000000000000'  # Valid ObjectId format but doesn't exist
        response = admin_session.post(f'{BASE_URL}/api/admin/users/{fake_id}/reset-link')
        assert response.status_code == 404
        print("Nonexistent user correctly returns 404")


class TestLoginAfterReset:
    """Test that login works correctly after password reset."""
    
    def test_full_reset_flow(self, api_client):
        """Complete flow: register -> forgot -> reset -> login with new password."""
        unique_id = str(uuid.uuid4())[:8]
        email = f'fullflow_{unique_id}@example.com'
        old_password = 'OldPassword123!'
        new_password = 'NewPassword456!'
        
        # 1. Register
        reg_response = api_client.post(f'{BASE_URL}/api/auth/register', json={
            'callsign': f'TEST_FullFlow_{unique_id}',
            'email': email,
            'password': old_password
        })
        assert reg_response.status_code == 200
        print("Step 1: Registration successful")
        
        # 2. Logout (clear cookies)
        api_client.post(f'{BASE_URL}/api/auth/logout')
        
        # 3. Request password reset
        forgot_response = api_client.post(f'{BASE_URL}/api/auth/forgot-password', json={
            'email': email
        })
        assert forgot_response.status_code == 200
        token = forgot_response.json()['reset_token']
        print("Step 2: Reset token generated")
        
        # 4. Reset password
        reset_response = api_client.post(f'{BASE_URL}/api/auth/reset-password', json={
            'token': token,
            'password': new_password
        })
        assert reset_response.status_code == 200
        print("Step 3: Password reset successful")
        
        # 5. Login with new password
        login_response = api_client.post(f'{BASE_URL}/api/auth/login', json={
            'email': email,
            'password': new_password
        })
        assert login_response.status_code == 200
        assert login_response.json()['user']['email'] == email
        print("Step 4: Login with new password successful")
        
        # 6. Verify /me works
        me_response = api_client.get(f'{BASE_URL}/api/auth/me')
        assert me_response.status_code == 200
        assert me_response.json()['email'] == email
        print("Step 5: /me endpoint works after reset")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
