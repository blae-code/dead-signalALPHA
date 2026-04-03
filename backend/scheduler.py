import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class Scheduler:
    """Background task scheduler for automated server management."""

    def __init__(self, db, ptero_client, ws_manager):
        self.db = db
        self.ptero = ptero_client
        self.ws_manager = ws_manager
        self.running = False
        self._task = None

    async def start(self):
        self.running = True
        self._task = asyncio.create_task(self._loop())
        logger.info('Scheduler started')

    def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()

    async def _loop(self):
        while self.running:
            try:
                await self._tick()
            except Exception as e:
                logger.error(f'Scheduler tick error: {e}')
            await asyncio.sleep(30)  # Check every 30s

    async def _tick(self):
        now = datetime.now(timezone.utc)
        now_str = now.isoformat()

        # Find due tasks
        due = await self.db.scheduled_tasks.find({
            'enabled': True,
            'next_run': {'$lte': now_str},
        }).to_list(50)

        for task in due:
            try:
                await self._execute_task(task)
                await self._advance_schedule(task, now)
            except Exception as e:
                logger.error(f'Task {task.get("name")} failed: {e}')
                await self.db.scheduled_tasks.update_one(
                    {'task_id': task['task_id']},
                    {'$set': {'last_error': str(e), 'last_run': now_str}}
                )

    async def _execute_task(self, task):
        action = task.get('action')
        params = task.get('params', {})
        now = datetime.now(timezone.utc).isoformat()

        if action == 'restart':
            # Broadcast warning first
            warn_mins = params.get('warn_minutes', 5)
            if warn_mins > 0:
                await self.ptero.send_command(f'say [DEAD SIGNAL] Server restart in {warn_mins} minutes')
                await self.ws_manager.broadcast({
                    'type': 'gm_broadcast',
                    'data': {'message': f'Scheduled restart in {warn_mins}m', 'timestamp': now}
                })
            await asyncio.sleep(min(warn_mins * 60, 300))  # Wait up to 5 min
            await self.ptero.send_power_action('restart')

        elif action == 'broadcast':
            msg = params.get('message', '')
            if msg:
                await self.ptero.send_command(f'say {msg}')
                await self.ws_manager.broadcast({
                    'type': 'gm_broadcast',
                    'data': {'message': msg, 'timestamp': now}
                })

        elif action == 'command':
            cmd = params.get('command', '')
            if cmd:
                await self.ptero.send_command(cmd)

        elif action == 'backup':
            await self.ptero.create_backup()

        # Log execution
        await self.db.gm_action_log.insert_one({
            'action': f'scheduled_{action}',
            'details': {'task_name': task.get('name'), 'params': params},
            'actor': 'SCHEDULER',
            'timestamp': now,
        })

    async def _advance_schedule(self, task, now: datetime):
        interval = task.get('interval_minutes', 0)
        if interval > 0:
            next_run = now + timedelta(minutes=interval)
            await self.db.scheduled_tasks.update_one(
                {'task_id': task['task_id']},
                {'$set': {
                    'next_run': next_run.isoformat(),
                    'last_run': now.isoformat(),
                    'last_error': None,
                    'run_count': (task.get('run_count', 0) or 0) + 1,
                }}
            )
        else:
            # One-shot task — disable after execution
            await self.db.scheduled_tasks.update_one(
                {'task_id': task['task_id']},
                {'$set': {
                    'enabled': False,
                    'last_run': now.isoformat(),
                    'last_error': None,
                    'run_count': (task.get('run_count', 0) or 0) + 1,
                }}
            )
