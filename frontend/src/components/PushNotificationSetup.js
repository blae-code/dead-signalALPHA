import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Bell, BellOff, Loader2, Check, AlertTriangle } from 'lucide-react';

const VAPID_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushNotificationSetup() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState({
    high_events: true,
    faction_alerts: true,
    gm_broadcasts: true,
    server_status: true,
  });

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window && !!VAPID_KEY);
    checkSubscription();
  }, []);

  const checkSubscription = useCallback(async () => {
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
      if (sub) {
        // Fetch prefs from server
        try {
          const { data } = await api.get('/notifications/preferences');
          if (data?.preferences) setPrefs(data.preferences);
        } catch { /* graceful */ }
      }
    } catch { /* graceful */ }
  }, []);

  const subscribe = async () => {
    setLoading(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Notification permission denied');
        setLoading(false);
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });

      await api.post('/notifications/subscribe', {
        subscription: sub.toJSON(),
        preferences: prefs,
      });

      setSubscribed(true);
    } catch (err) {
      setError(err?.message || 'Subscription failed');
    }
    setLoading(false);
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await api.delete('/notifications/subscribe');
        }
      }
      setSubscribed(false);
    } catch { /* graceful */ }
    setLoading(false);
  };

  const updatePrefs = async (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    try {
      await api.patch('/notifications/preferences', { [key]: !prefs[key] });
    } catch { /* graceful */ }
  };

  if (!supported) {
    return (
      <div className="border border-[#2a2520] bg-[#111111] p-3 text-xs font-mono text-[#88837a]" data-testid="push-unsupported">
        <div className="flex items-center gap-2">
          <BellOff className="w-3.5 h-3.5" />
          Push notifications not supported in this browser
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="push-notifications">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Push Notifications</h3>
          {subscribed && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-[#6b7a3d]">
              <Check className="w-3 h-3" /> ACTIVE
            </span>
          )}
        </div>
        <button
          onClick={subscribed ? unsubscribe : subscribe}
          disabled={loading}
          data-testid="push-toggle"
          className={`flex items-center gap-1.5 text-[10px] font-mono uppercase border px-3 py-1 transition-all ${subscribed ? 'border-[#8b3a3a] text-[#8b3a3a] hover:bg-[#8b3a3a]/10' : 'border-[#6b7a3d] text-[#6b7a3d] hover:bg-[#6b7a3d]/10'}`}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : subscribed ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
          {subscribed ? 'Disable' : 'Enable'}
        </button>
      </div>

      {error && (
        <div className="p-2 m-3 border border-[#8b3a3a]/60 bg-[#8b3a3a]/10 flex items-center gap-2 text-xs font-mono text-[#d4cfc4]">
          <AlertTriangle className="w-3 h-3 text-[#8b3a3a]" /> {error}
        </div>
      )}

      {subscribed && (
        <div className="p-3 space-y-2">
          <p className="text-[10px] font-heading uppercase tracking-widest text-[#88837a] mb-2">Alert Preferences</p>
          {[
            { key: 'high_events', label: 'High-Priority Events', desc: 'Hordes, airdrops, critical threats' },
            { key: 'faction_alerts', label: 'Faction Alerts', desc: 'Invites, war declarations, promotions' },
            { key: 'gm_broadcasts', label: 'GM Broadcasts', desc: 'Game Master narrative dispatches' },
            { key: 'server_status', label: 'Server Status', desc: 'Server start, stop, crash alerts' },
          ].map(({ key, label, desc }) => (
            <button
              key={key}
              onClick={() => updatePrefs(key)}
              data-testid={`pref-${key}`}
              className="w-full flex items-center justify-between p-2 border border-[#2a2520] bg-[#111111] hover:border-[#c4841d]/20 transition-colors text-left"
            >
              <div>
                <p className="text-xs font-mono text-[#d4cfc4]">{label}</p>
                <p className="text-[10px] font-mono text-[#88837a]/60">{desc}</p>
              </div>
              <div className={`w-8 h-4 rounded-full relative transition-colors ${prefs[key] ? 'bg-[#c4841d]' : 'bg-[#2a2520]'}`}>
                <div className={`w-3 h-3 rounded-full bg-[#d4cfc4] absolute top-0.5 transition-all ${prefs[key] ? 'left-4.5' : 'left-0.5'}`}
                  style={{ left: prefs[key] ? '17px' : '2px' }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
