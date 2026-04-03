import os
import httpx
import logging

logger = logging.getLogger(__name__)


class PterodactylClient:
    def __init__(self):
        self.base_url = os.environ.get('PTERODACTYL_URL', '').rstrip('/')
        self.api_key = os.environ.get('PTERODACTYL_API_KEY', '')
        self.server_id = os.environ.get('PTERODACTYL_SERVER_ID', '')

    @property
    def headers(self):
        return {
            'Authorization': f'Bearer {self.api_key}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }

    @property
    def configured(self):
        return bool(self.base_url and self.api_key and self.server_id)

    def _url(self, path: str) -> str:
        return f'{self.base_url}/api/client/servers/{self.server_id}{path}'

    async def _get(self, path: str, params=None):
        if not self.configured:
            return {'error': 'Pterodactyl not configured', 'configured': False}
        try:
            async with httpx.AsyncClient(timeout=15, verify=True) as client:
                resp = await client.get(self._url(path), headers=self.headers, params=params)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f'Pterodactyl HTTP {e.response.status_code} on {path}: {e.response.text[:200]}')
            return {'error': f'HTTP {e.response.status_code}', 'detail': e.response.text[:200], 'configured': True}
        except Exception as e:
            logger.error(f'Pterodactyl error on {path}: {e}')
            return {'error': str(e), 'configured': True}

    async def _post(self, path: str, json_data=None):
        if not self.configured:
            return {'error': 'Pterodactyl not configured', 'configured': False}
        try:
            async with httpx.AsyncClient(timeout=15, verify=True) as client:
                resp = await client.post(self._url(path), headers=self.headers, json=json_data)
                if resp.status_code == 204:
                    return {'success': True}
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f'Pterodactyl HTTP {e.response.status_code} on POST {path}: {e.response.text[:200]}')
            return {'error': f'HTTP {e.response.status_code}', 'detail': e.response.text[:200]}
        except Exception as e:
            logger.error(f'Pterodactyl error on POST {path}: {e}')
            return {'error': str(e)}

    async def get_server_details(self):
        return await self._get('')

    async def get_resources(self):
        return await self._get('/resources')

    async def send_power_action(self, signal: str):
        return await self._post('/power', {'signal': signal})

    async def send_command(self, command: str):
        return await self._post('/command', {'command': command})

    async def list_files(self, directory: str = '/'):
        return await self._get('/files/list', params={'directory': directory})

    async def get_file_contents(self, file_path: str):
        if not self.configured:
            return {'error': 'Pterodactyl not configured'}
        try:
            async with httpx.AsyncClient(timeout=15, verify=True) as client:
                resp = await client.get(
                    self._url('/files/contents'),
                    headers=self.headers,
                    params={'file': file_path}
                )
                resp.raise_for_status()
                return {'content': resp.text, 'file': file_path}
        except Exception as e:
            logger.error(f'Pterodactyl get_file_contents error: {e}')
            return {'error': str(e)}

    async def list_backups(self):
        return await self._get('/backups')

    async def create_backup(self):
        return await self._post('/backups')

    async def get_websocket_credentials(self):
        return await self._get('/websocket')
