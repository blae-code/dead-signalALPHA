/**
 * PushNotificationSetup
 * ----------------------
 * Browser push notification management: subscribe, unsubscribe, and
 * configure per-category preferences.
 *
 * Backend: /api/notifications/  (notifications.py)
 *
 * SETUP REQUIRED (one-time, by a server admin):
 *   1. Generate VAPID keys:  pip install pywebpush && vapid --gen
 *   2. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL to backend/.env
 *   3. Add pywebpush>=2.0.0 to requirements.txt
 *   4. Place the service worker at /public/sw.js (see TODO below)
 *
 * Service worker (public/sw.js) — TODO: create this file:
 *   self.addEventListener('push', event => {
 *     const data = event.data?.json() ?? {};
 *     self.registration.showNotification(data.title || 'Dead Signal', {
 *       body: data.body,
 *       icon: '/favicon.ico',
 *       data: { url: data.url || '/' },
 *     });
 *   });
 *   self.addEventListener('notificationclick', event => {
 *     event.notification.close();
 *     clients.openWindow(event.notification.data.url);
 *   });
 *
 * TODO:
 *  - Register /sw.js as a service worker on app load (e.g. in index.js or App.js):
 *      if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
 *  - Replace VAPID_PUBLIC_KEY placeholder with a real fetch from /api/notifications/vapid-key
 *    (already done below via fetchVapidKey).
 */

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Bell, BellOff, RefreshCw, Check, X } from 'lucide-react';

const PREF_LABELS = {
  high_events:    { label: 'Danger & Critical Events', desc: 'High-severity server events' },
  faction_alerts: { label: 'Faction Alerts',           desc: 'Invites, promotions, war declarations' },
  gm_broadcasts:  { label: 'GM Broadcasts',            desc: 'Narrative announcements from the GM' },
  server_status:  { label: 'Server Status',            desc: 'Server start, stop, crash notifications' },
};

function ToggleRow({ prefKey, value, label, desc, onChange }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1a1916]">
      <div>
        <div className="text-xs text-[#c9b89a]">{label}</div>
        <div className="text-[10px] text-[#4a4540]">{desc}</div>
      </div>
      <button
        onClick={() => onChange(prefKey, !value)}
        className={`relative w-8 h-4 rounded-full transition-colors ${value ? 'bg-[#6b7a3d]' : 'bg-[#3a3832]'}`}
        aria-pressed={value}
      >
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-[#c9b89a] transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export default function PushNotificationSetup() {
  const [supported, setSupported]       = useState(false);
  const [subscribed, setSubscribed]     = useState(false);
  const [permission, setPermission]     = useState('default');
  const [prefs, setPrefs]               = useState({});
  const [vapidKey, setVapidKey]         = useState(null);
  const [loading, setLoading]           = useState(false);
  const [status, setStatus]             = useState('');
  const [error, setError]               = useState('');

  const fetchState = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/preferences');
      setSubscribed(data.subscribed);
      setPrefs(data.preferences || {});
    } catch { /* user may not be subscribed */ }
  }, []);

  const fetchVapidKey = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/vapid-key');
      setVapidKey(data.public_key);
    } catch {
      setError('Push notifications are not configured on this server.');
    }
  }, []);

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window;
    setSupported(ok);
    setPermission(ok ? Notification.permission : 'denied');
    if (ok) { fetchVapidKey(); fetchState(); }
  }, [fetchVapidKey, fetchState]);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = window.atob(base64);
    return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
  };

  const subscribe = async () => {
    if (!vapidKey) { setError('VAPID key not available.'); return; }
    setLoading(true);
    setError('');
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setError('Permission denied.'); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await api.post('/notifications/subscribe', { subscription: sub.toJSON() });
      setSubscribed(true);
      setStatus('Subscribed successfully.');
      await fetchState();
    } catch (e) {
      setError(e.message || 'Failed to subscribe.');
    } finally { setLoading(false); }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      await api.delete('/notifications/subscribe');
      setSubscribed(false);
      setPrefs({});
      setStatus('Unsubscribed.');
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to unsubscribe.');
    } finally { setLoading(false); }
  };

  const updatePref = async (key, val) => {
    const updated = { ...prefs, [key]: val };
    setPrefs(updated);
    try {
      await api.patch('/notifications/preferences', { [key]: val });
    } catch {
      setPrefs(prefs); // revert
    }
  };

  if (!supported) {
    return (
      <div className="text-[#4a4540] text-xs text-center py-8">
        Push notifications are not supported in this browser.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#c4841d] tracking-wider uppercase">Push Notifications</span>
        <button onClick={fetchState} className="text-[#88837a] hover:text-[#c9b89a]">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-2 p-2 rounded text-xs border ${
        subscribed
          ? 'border-[#6b7a3d]/40 bg-[#6b7a3d]/10 text-[#6b7a3d]'
          : 'border-[#3a3832] bg-[#0d0c0a] text-[#88837a]'
      }`}>
        {subscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        {subscribed ? 'You are subscribed to push notifications.' : 'You are not subscribed.'}
      </div>

      {permission === 'denied' && (
        <p className="text-[#8b3a3a] text-xs">
          Notifications are blocked in your browser. Enable them in browser settings to subscribe.
        </p>
      )}

      {error && <p className="text-[#8b3a3a] text-xs">{error}</p>}
      {status && <p className="text-[#6b7a3d] text-xs">{status}</p>}

      {/* Subscribe / Unsubscribe button */}
      <button
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading || permission === 'denied' || !vapidKey}
        className={`w-full flex items-center justify-center gap-2 text-xs py-2 rounded border transition-colors disabled:opacity-50 ${
          subscribed
            ? 'border-[#8b3a3a]/40 text-[#8b3a3a] hover:bg-[#8b3a3a]/10'
            : 'border-[#c4841d]/40 text-[#c4841d] hover:bg-[#c4841d]/10'
        }`}
      >
        {subscribed ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
        {loading ? 'Working…' : subscribed ? 'Unsubscribe' : 'Enable Push Notifications'}
      </button>

      {/* Preferences */}
      {subscribed && (
        <div>
          <p className="text-[10px] text-[#4a4540] uppercase tracking-widest mb-2">Notification Types</p>
          {Object.entries(PREF_LABELS).map(([key, meta]) => (
            <ToggleRow
              key={key}
              prefKey={key}
              value={!!prefs[key]}
              label={meta.label}
              desc={meta.desc}
              onChange={updatePref}
            />
          ))}
        </div>
      )}

      {!vapidKey && !error && (
        <p className="text-[10px] text-[#4a4540] text-center">
          Push notifications require VAPID keys to be configured on the server.
          See backend/routes/notifications.py for setup instructions.
        </p>
      )}
    </div>
  );
}
