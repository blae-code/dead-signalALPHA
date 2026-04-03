"""
Safe faction integration smoke tests.

These tests are environment-driven and do not embed preview URLs or live credentials.
Set the DEAD_SIGNAL_TEST_* environment variables from backend/tests/conftest.py to run them.
"""

import requests


def test_setup_status(integration_config):
    response = requests.get(f"{integration_config['base_url']}/api/auth/setup-status", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert 'setup_required' in data


def test_list_factions(admin_session, integration_config):
    response = admin_session.get(f"{integration_config['base_url']}/api/factions", timeout=20)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_my_faction_shape(admin_session, integration_config):
    response = admin_session.get(f"{integration_config['base_url']}/api/factions/my", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert 'faction' in data
    assert 'membership' in data


def test_pending_invites_shape(admin_session, integration_config):
    response = admin_session.get(f"{integration_config['base_url']}/api/factions/invites/pending", timeout=20)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
