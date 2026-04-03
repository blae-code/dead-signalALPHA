import { useState, useEffect, useRef, useCallback } from 'react';

const WS_BASE = process.env.REACT_APP_BACKEND_URL
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');

export function useServerWebSocket() {
  const [liveStats, setLiveStats] = useState(null);
  const [serverState, setServerState] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveNarrations, setLiveNarrations] = useState([]);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const connect = useCallback(() => {
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
            default:
              break;
          }
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { liveStats, serverState, liveEvents, liveNarrations, consoleLogs, connected };
}
