#!/usr/bin/env python3
"""
Minimal backend smoke test runner.

This script is safe for source control: it reads all configuration from environment
variables and uses session cookies instead of hard-coded JWTs.
"""

from __future__ import annotations

import os
import sys

import requests


def env(name: str) -> str:
    return os.environ.get(name, '').strip()


def require(name: str) -> str:
    value = env(name)
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def main() -> int:
    try:
        base_url = require('DEAD_SIGNAL_TEST_BASE_URL').rstrip('/')
        callsign = require('DEAD_SIGNAL_TEST_ADMIN_CALLSIGN')
        auth_key = require('DEAD_SIGNAL_TEST_ADMIN_AUTH_KEY')
    except RuntimeError as exc:
        print(exc)
        return 1

    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})

    login = session.post(
        f'{base_url}/api/auth/login',
        json={'callsign': callsign, 'auth_key': auth_key},
        timeout=20,
    )
    if login.status_code != 200:
        print(f'Login failed: {login.status_code} {login.text}')
        return 1

    checks = [
        '/api/auth/me',
        '/api/server/status',
        '/api/events',
        '/api/world/state',
        '/api/economy/resources',
        '/api/gm/stats',
    ]

    failed = False
    for endpoint in checks:
        response = session.get(f'{base_url}{endpoint}', timeout=20)
        ok = response.status_code == 200
        print(f'{"OK" if ok else "FAIL"} {endpoint} -> {response.status_code}')
        failed = failed or not ok

    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
