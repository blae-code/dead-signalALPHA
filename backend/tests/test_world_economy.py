"""
Safe world and economy integration smoke tests.

These intentionally avoid environment-specific seed assumptions and use cookie-based
sessions from backend/tests/conftest.py.
"""


def test_world_state_shape(admin_session, integration_config):
    response = admin_session.get(f"{integration_config['base_url']}/api/world/state", timeout=20)
    assert response.status_code == 200
    data = response.json()
    for field in (
        'hour',
        'hour_display',
        'time_of_day',
        'day',
        'season',
        'weather',
        'temperature',
        'danger_level',
        'weather_tooltip',
        'time_tooltip',
        'season_tooltip',
    ):
        assert field in data


def test_world_override_requires_admin(player_session, integration_config):
    response = player_session.post(
        f"{integration_config['base_url']}/api/world/override",
        json={'weather': 'storm'},
        timeout=20,
    )
    assert response.status_code == 403


def test_economy_catalogs(admin_session, integration_config):
    endpoints = (
        '/api/economy/resources',
        '/api/economy/recipes',
        '/api/economy/scarcity',
        '/api/economy/trades',
        '/api/economy/supply-requests',
    )
    for endpoint in endpoints:
        response = admin_session.get(f"{integration_config['base_url']}{endpoint}", timeout=20)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
