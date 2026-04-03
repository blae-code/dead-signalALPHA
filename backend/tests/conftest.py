import os

import pytest
import requests


def env(name: str) -> str:
    return os.environ.get(name, '').strip()


@pytest.fixture(scope='session')
def integration_config():
    base_url = env('DEAD_SIGNAL_TEST_BASE_URL').rstrip('/')
    if not base_url:
        pytest.skip('Set DEAD_SIGNAL_TEST_BASE_URL to run backend integration tests')
    return {
        'base_url': base_url,
        'admin_callsign': env('DEAD_SIGNAL_TEST_ADMIN_CALLSIGN'),
        'admin_auth_key': env('DEAD_SIGNAL_TEST_ADMIN_AUTH_KEY'),
        'player_callsign': env('DEAD_SIGNAL_TEST_PLAYER_CALLSIGN'),
        'player_auth_key': env('DEAD_SIGNAL_TEST_PLAYER_AUTH_KEY'),
        'mutations_enabled': env('DEAD_SIGNAL_TEST_ENABLE_MUTATIONS').lower() == 'true',
    }


def _login_session(base_url: str, callsign: str, auth_key: str) -> requests.Session:
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    response = session.post(
        f'{base_url}/api/auth/login',
        json={'callsign': callsign, 'auth_key': auth_key},
        timeout=20,
    )
    if response.status_code != 200:
        pytest.skip(f'Login failed for {callsign}: {response.status_code} {response.text}')
    return session


@pytest.fixture(scope='session')
def admin_session(integration_config):
    if not integration_config['admin_callsign'] or not integration_config['admin_auth_key']:
        pytest.skip('Set DEAD_SIGNAL_TEST_ADMIN_CALLSIGN and DEAD_SIGNAL_TEST_ADMIN_AUTH_KEY to run authenticated admin tests')
    return _login_session(
        integration_config['base_url'],
        integration_config['admin_callsign'],
        integration_config['admin_auth_key'],
    )


@pytest.fixture(scope='session')
def player_session(integration_config):
    if not integration_config['player_callsign'] or not integration_config['player_auth_key']:
        pytest.skip('Player credentials not configured for non-admin authorization tests')
    return _login_session(
        integration_config['base_url'],
        integration_config['player_callsign'],
        integration_config['player_auth_key'],
    )
