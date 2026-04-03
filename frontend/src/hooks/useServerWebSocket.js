import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_BASE } from '@/lib/runtime-config';

export function useServerWebSocket() {
  const [liveStats, setLiveStats] = useState(null);
  const [serverState, setServerState] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveNarrations, setLiveNarrations] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [worldState, setWorldState] = useState(null);
  const [scarcityData, setScarcityData] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const shouldReconnectRef = useRef(true);

  const connect = useCallback(() => {
    if (!WS_BASE || !shouldReconnectRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(`${WS_BASE}/api/ws/feed`);

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          switch (msg.type) {
            case 'stats':
              setLiveStats(msg.data);
              // Stats also carry the server state
              if (msg.data?.state) setServerState(msg.data.state);
              break;
            case 'status':
              setServerState(msg.data?.state);
              break;
            case 'event':
              setLiveEvents((prev) => [msg.data, ...prev].slice(0, 200));
              break;
            case 'narration':
              setLiveNarrations((prev) => [msg.data, ...prev].slice(0, 50));
              break;
            case 'console':
              setConsoleLogs((prev) => [...prev, msg.data].slice(-300));
              break;
            case 'world_update':
              setWorldState(msg.data);
              break;
            case 'scarcity_update':
              setScarcityData(msg.data);
              break;
            default:
              break;
          }
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (shouldReconnectRef.current) {
          reconnectRef.current = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { liveStats, serverState, liveEvents, liveNarrations, consoleLogs, worldState, scarcityData, connected };
}
