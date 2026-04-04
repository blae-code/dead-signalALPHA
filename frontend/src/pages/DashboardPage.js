import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/App';
import api from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ServerStatus from '@/components/ServerStatus';
import WorldConditions from '@/components/WorldConditions';
import EventFeed from '@/components/EventFeed';
import NarrativePanel from '@/components/NarrativePanel';
import IntelBoard from '@/components/IntelBoard';
import RconConsole from '@/components/RconConsole';
import GridMap from '@/components/GridMap';
import PlayerRoster from '@/components/PlayerRoster';
import KeyManagement from '@/components/KeyManagement';
import FactionPanel from '@/components/FactionPanel';
import GameMasterPanel from '@/components/GameMasterPanel';
import PlayerStats from '@/components/PlayerStats';
import ResourceHub from '@/components/ResourceHub';
import WeatherOverlay from '@/components/WeatherOverlay';
import LiveStatusBar from '@/components/LiveStatusBar';
import PushNotificationSetup from '@/components/PushNotificationSetup';
import { useServerWebSocket } from '@/hooks/useServerWebSocket';
import {
  Radio, Activity, Terminal, Map, Shield, LogOut, User, ChevronDown, Users, Wifi, WifiOff,
  Swords, Crosshair, Package, Menu, X, Clock, CalendarDays, BarChart3, Bell,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function DashboardPage({ user: propUser, onLogout }) {
  const authCtx = useAuth();
  const user = propUser || authCtx?.user;
  const logout = onLogout || authCtx?.logout;
  const {
    liveStats,
    serverState,
    liveEvents,
    liveIntel,
    liveNarrations,
    consoleLogs,
    worldState,
    scarcityData,
    connected,
  } = useServerWebSocket();
  const [serverData, setServerData] = useState(null);
  const [events, setEvents] = useState([]);
  const [backups, setBackups] = useState([]);
  const [files, setFiles] = useState([]);
  const [filePath, setFilePath] = useState('/');
  const [onlineCount, setOnlineCount] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Activity tracking: count unread events per tab since last viewed
  const [tabActivity, setTabActivity] = useState({});
  const viewedEventsRef = useRef(0);
  const viewedNarrationsRef = useRef(0);
  const viewedIntelRef = useRef(0);

  // Track new activity on inactive tabs
  useEffect(() => {
    if (activeTab !== 'overview' && liveEvents.length > viewedEventsRef.current) {
      setTabActivity((prev) => ({ ...prev, overview: true }));
    }
    if (activeTab !== 'intel' && liveIntel?.length > viewedIntelRef.current) {
      setTabActivity((prev) => ({ ...prev, intel: true }));
    }
    if (activeTab !== 'console' && consoleLogs.length > 0) {
      setTabActivity((prev) => ({ ...prev, console: true }));
    }
  }, [liveEvents.length, liveIntel?.length, consoleLogs.length, activeTab]);

  // Clear activity when tab becomes active
  useEffect(() => {
    setTabActivity((prev) => ({ ...prev, [activeTab]: false }));
    if (activeTab === 'overview') viewedEventsRef.current = liveEvents.length;
    if (activeTab === 'intel') viewedIntelRef.current = liveIntel?.length || 0;
  }, [activeTab, liveEvents.length, liveIntel?.length]);

  const fetchOnlineCount = useCallback(async () => {
    try {
      const { data } = await api.get('/players');
      setOnlineCount(data.online_count || 0);
    } catch { /* graceful */ }
  }, []);

  const fetchServer = useCallback(async () => {
    try {
      const { data } = await api.get('/server/status');
      setServerData(data);
    } catch { /* graceful */ }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const { data } = await api.get('/events?limit=50');
      setEvents(data);
    } catch { /* graceful */ }
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const { data } = await api.get('/server/backups');
      setBackups(data?.data || []);
    } catch { /* graceful */ }
  }, []);

  const fetchFiles = useCallback(async (path) => {
    try {
      const { data } = await api.get(`/server/files?path=${encodeURIComponent(path)}`);
      setFiles(data?.data || []);
      setFilePath(path);
    } catch { /* graceful */ }
  }, []);

  useEffect(() => {
    fetchServer();
    fetchEvents();
    fetchOnlineCount();
    const i = setInterval(() => { fetchServer(); fetchOnlineCount(); }, 30000);
    return () => clearInterval(i);
  }, [fetchServer, fetchEvents, fetchOnlineCount]);

  const allEvents = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const ev of [...liveEvents, ...events]) {
      const key = `${ev.event_id || ev.timestamp}-${ev.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(ev);
      }
    }
    return merged.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).slice(0, 100);
  }, [liveEvents, events]);

  const isAdmin = user?.role === 'system_admin' || user?.role === 'server_admin';
  const isSystemAdmin = user?.role === 'system_admin';
  const currentState = serverState || serverData?.resources?.attributes?.current_state || 'unknown';

  const TAB_LIST = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-3 h-3" /> },
    { id: 'stats', label: 'My Stats', icon: <BarChart3 className="w-3 h-3" /> },
    { id: 'intel', label: 'Intel', icon: <Radio className="w-3 h-3" /> },
    { id: 'console', label: 'Console', icon: <Terminal className="w-3 h-3" /> },
    { id: 'map', label: 'Tactical Map', icon: <Map className="w-3 h-3" /> },
    { id: 'players', label: 'Players', icon: <Users className="w-3 h-3" /> },
    { id: 'factions', label: 'Factions', icon: <Swords className="w-3 h-3" /> },
    { id: 'economy', label: 'Economy', icon: <Package className="w-3 h-3" /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell className="w-3 h-3" /> },
    ...(isAdmin ? [{ id: 'gm', label: 'Game Master', icon: <Crosshair className="w-3 h-3" /> }] : []),
    ...(isAdmin ? [{ id: 'admin', label: 'Admin', icon: <Shield className="w-3 h-3" /> }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#111111] flex flex-col" data-testid="dashboard-page">
      {/* Weather overlay — responds to live world conditions */}
      <WeatherOverlay weather={worldState?.weather} />

      {/* Header */}
      <header className="border-b border-[#2a2520] bg-[#111111]/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-[#c4841d] glow-amber" />
          <h1 className="font-heading text-xl sm:text-2xl font-bold uppercase tracking-[0.15em] text-[#c4841d] glow-amber-text">
            Dead Signal
          </h1>
          <span className="hidden lg:inline text-xs font-mono text-[#88837a] ml-2">
            // COMMAND TERMINAL v1.0
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Status indicators — desktop only */}
          <div className="hidden md:flex items-center gap-3 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              {connected ? (
                <><Wifi className="w-3 h-3 text-[#6b7a3d]" /><span className="text-[#6b7a3d]">CONNECTED</span></>
              ) : (
                <><WifiOff className="w-3 h-3 text-[#8b3a3a]" /><span className="text-[#8b3a3a]">DISCONNECTED</span></>
              )}
            </div>
            <span className="text-[#2a2520]">|</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${
                currentState === 'running' ? 'bg-[#6b7a3d] pulse-green'
                  : currentState === 'starting' ? 'bg-[#c4841d] pulse-amber'
                  : currentState === 'offline' || currentState === 'stopped' ? 'bg-[#8b3a3a]'
                  : 'bg-[#88837a]'
              }`} />
              <span className={
                currentState === 'running' ? 'text-[#6b7a3d]'
                  : currentState === 'starting' ? 'text-[#c4841d]'
                  : currentState === 'offline' || currentState === 'stopped' ? 'text-[#8b3a3a]'
                  : 'text-[#88837a]'
              }>
                SERVER {currentState.toUpperCase()}
              </span>
            </div>
          </div>

          {/* User menu — expanded */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="user-menu-button" className="flex items-center gap-2 border border-[#2a2520] px-3 py-1.5 text-xs font-mono text-[#d4cfc4] hover:border-[#c4841d] transition-colors">
                <User className="w-3 h-3" />
                <span className="hidden sm:inline">{user?.callsign || 'Operator'}</span>
                <ChevronDown className="w-3 h-3 text-[#88837a]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#1a1a1a] border-[#2a2520] text-[#d4cfc4] rounded-none min-w-[200px] z-50" data-testid="user-dropdown">
              {/* User info section */}
              <div className="px-3 py-2.5 border-b border-[#2a2520]">
                <p className="text-xs font-mono text-[#c4841d] font-bold">{user?.callsign}</p>
                <p className="text-[10px] font-mono text-[#88837a] mt-0.5">{user?.email}</p>
                <p className="text-[10px] font-mono text-[#88837a] mt-0.5 uppercase tracking-widest">
                  {user?.role?.replace('_', ' ')}
                </p>
              </div>
              {user?.last_login && (
                <div className="px-3 py-1.5 border-b border-[#2a2520]">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#88837a]/60">
                    <Clock className="w-2.5 h-2.5" />
                    Last: {new Date(user.last_login).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#88837a]/60">
                    <CalendarDays className="w-2.5 h-2.5" />
                    Joined: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                  </div>
                </div>
              )}
              <DropdownMenuSeparator className="bg-[#2a2520]" />
              <DropdownMenuItem
                data-testid="logout-button"
                onClick={logout}
                className="text-xs font-mono cursor-pointer hover:bg-[#2a2520] hover:text-[#8b3a3a] rounded-none focus:bg-[#2a2520] text-[#88837a]"
              >
                <LogOut className="w-3 h-3 mr-2" /> Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-[#88837a] hover:text-[#c4841d] transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Living Status Bar — visible on every tab */}
      <LiveStatusBar worldState={worldState} />

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-[#0a0a0a]/95 pt-16" data-testid="mobile-menu">
          <div className="p-4 space-y-1">
            {TAB_LIST.map((t) => (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-heading uppercase tracking-widest transition-all ${
                  activeTab === t.id
                    ? 'text-[#c4841d] bg-[#c4841d]/10 border-l-2 border-[#c4841d]'
                    : 'text-[#88837a] hover:text-[#d4cfc4] border-l-2 border-transparent'
                }`}
              >
                {t.icon} {t.label}
                {tabActivity[t.id] && <span className="w-1.5 h-1.5 rounded-full bg-[#c4841d] ml-auto" />}
              </button>
            ))}
            {/* Mobile status */}
            <div className="mt-4 pt-4 border-t border-[#2a2520] flex items-center gap-3 px-4 text-[10px] font-mono">
              {connected ? (
                <><Wifi className="w-3 h-3 text-[#6b7a3d]" /><span className="text-[#6b7a3d]">CONNECTED</span></>
              ) : (
                <><WifiOff className="w-3 h-3 text-[#8b3a3a]" /><span className="text-[#8b3a3a]">DISCONNECTED</span></>
              )}
              <span className="text-[#2a2520]">|</span>
              <span className={currentState === 'running' ? 'text-[#6b7a3d]' : 'text-[#8b3a3a]'}>
                SERVER {currentState.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-auto relative z-10">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Desktop tab bar */}
          <TabsList className="hidden md:flex bg-[#111111] border border-[#2a2520] rounded-none p-1 mb-4 w-full justify-start overflow-x-auto gap-0">
            {TAB_LIST.map((t) => (
              <TabsTrigger
                key={t.id}
                data-testid={`tab-${t.id}`}
                value={t.id}
                className={`relative rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2 ${tabActivity[t.id] ? 'tab-pulse' : ''}`}
              >
                <span className="flex items-center gap-1.5">{t.icon} {t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 space-y-4">
                <ServerStatus data={serverData} liveStats={liveStats} liveState={currentState} onRefresh={fetchServer} isAdmin={isAdmin} onlineCount={onlineCount} />
                <WorldConditions liveWorldState={worldState} />
              </div>
              <div className="lg:col-span-2 space-y-4">
                <EventFeed events={allEvents} onRefresh={fetchEvents} serverOffline={currentState === 'offline' || currentState === 'stopped'} />
                <NarrativePanel events={allEvents} liveNarrations={liveNarrations} isAdmin={isAdmin} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="intel" className="mt-0">
            <IntelBoard liveIntel={liveIntel} liveWorldState={worldState} liveScarcity={scarcityData} />
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <PlayerStats />
          </TabsContent>

          <TabsContent value="alerts" className="mt-0">
            <PushNotificationSetup />
          </TabsContent>

          <TabsContent value="console" className="mt-0">
            <RconConsole isAdmin={isAdmin} consoleLogs={consoleLogs} serverOffline={currentState === 'offline' || currentState === 'stopped'} />
          </TabsContent>

          <TabsContent value="map" className="mt-0">
            <GridMap />
          </TabsContent>

          <TabsContent value="players" className="mt-0">
            <PlayerRoster isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="factions" className="mt-0">
            <FactionPanel user={user} />
          </TabsContent>

          <TabsContent value="economy" className="mt-0">
            <ResourceHub user={user} liveScarcity={scarcityData} liveWorldState={worldState} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="gm" className="mt-0">
              <GameMasterPanel />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="admin" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* File Browser */}
                <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg panel-hover">
                  <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
                    <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">File System</h3>
                    <button data-testid="refresh-files-button" onClick={() => fetchFiles(filePath)} className="text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors">[SCAN]</button>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-3 text-xs font-mono text-[#88837a]">
                      <span>PATH:</span>
                      <span className="text-[#d4cfc4]">{filePath}</span>
                      {filePath !== '/' && (
                        <button onClick={() => { const parent = filePath.split('/').slice(0, -1).join('/') || '/'; fetchFiles(parent); }} className="text-[#c4841d] hover:underline">[UP]</button>
                      )}
                    </div>
                    <div className="space-y-1 max-h-[400px] overflow-auto">
                      {files.length === 0 && <p className="text-xs font-mono text-[#88837a]">Click [SCAN] to browse files</p>}
                      {files.map?.((f, i) => (
                        <div key={i} className="flex items-center justify-between p-2 text-xs font-mono border border-transparent hover:border-[#2a2520] hover:bg-[#111111] transition-colors cursor-pointer" onClick={() => { if (f.attributes?.is_file === false) { fetchFiles(filePath === '/' ? `/${f.attributes?.name}` : `${filePath}/${f.attributes?.name}`); } }}>
                          <span className={f.attributes?.is_file ? 'text-[#d4cfc4]' : 'text-[#c4841d]'}>{f.attributes?.is_file ? '' : '/'}{f.attributes?.name || 'unknown'}</span>
                          <span className="text-[#88837a]">{f.attributes?.size ? `${(f.attributes.size / 1024).toFixed(1)}KB` : ''}</span>
                        </div>
                      )) || null}
                    </div>
                  </div>
                </div>

                {/* Backups */}
                <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg panel-hover">
                  <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
                    <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Backups</h3>
                    <div className="flex gap-2">
                      <button data-testid="create-backup-button" onClick={async () => { try { await api.post('/server/backups'); fetchBackups(); } catch {} }} className="text-xs font-mono border border-[#4a5c3a] text-[#4a5c3a] px-2 py-1 hover:bg-[#4a5c3a] hover:text-[#111111] transition-all">[CREATE]</button>
                      <button data-testid="refresh-backups-button" onClick={fetchBackups} className="text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors">[SCAN]</button>
                    </div>
                  </div>
                  <div className="p-3 space-y-1 max-h-[400px] overflow-auto">
                    {backups.length === 0 && <p className="text-xs font-mono text-[#88837a]">Click [SCAN] to list backups</p>}
                    {backups.map?.((b, i) => (
                      <div key={i} className="flex items-center justify-between p-2 text-xs font-mono border border-transparent hover:border-[#2a2520] hover:bg-[#111111]">
                        <span className="text-[#d4cfc4]">{b.attributes?.name || `Backup ${i + 1}`}</span>
                        <span className="text-[#88837a]">{b.attributes?.bytes ? `${(b.attributes.bytes / 1024 / 1024).toFixed(1)}MB` : ''}</span>
                      </div>
                    )) || null}
                  </div>
                </div>
              </div>

              {isSystemAdmin && (
                <div className="lg:col-span-2 mt-4">
                  <KeyManagement />
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
