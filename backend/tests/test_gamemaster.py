"""
Safe Game Master integration smoke tests.

These cover admin-read endpoints and optional authorization checks without embedding
environment-specific credentials in source control.
"""


def test_gm_stats(admin_session, integration_config):
    response = admin_session.get(f"{integration_config['base_url']}/api/gm/stats", timeout=20)
    assert response.status_code == 200
    data = response.json()
    for field in (
        'active_tasks',
        'tracked_players',
        'banned_players',
        'active_triggers',
        'broadcasts_24h',
        'actions_24h',
    ):
        assert field in data


def test_gm_collections_are_lists(admin_session, integration_config):
    endpoints = (
        '/api/gm/tasks',
        '/api/gm/broadcasts',
        '/api/gm/players',
        '/api/gm/triggers',
        '/api/gm/quick-commands',
        '/api/gm/log',
    )
    for endpoint in endpoints:
        response = admin_session.get(f"{integration_config['base_url']}{endpoint}", timeout=20)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


def test_non_admin_blocked_from_gm(player_session, integration_config):
    response = player_session.get(f"{integration_config['base_url']}/api/gm/stats", timeout=20)
    assert response.status_code == 403
