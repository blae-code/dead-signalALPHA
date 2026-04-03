import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/App';
import api from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ServerStatus from '@/components/ServerStatus';
import WorldConditions from '@/components/WorldConditions';
import EventFeed from '@/components/EventFeed';
import NarrativePanel from '@/components/NarrativePanel';
import RconConsole from '@/components/RconConsole';
import GridMap from '@/components/GridMap';
import PlayerRoster from '@/components/PlayerRoster';
import KeyManagement from '@/components/KeyManagement';
import FactionPanel from '@/components/FactionPanel';
import GameMasterPanel from '@/components/GameMasterPanel';
import ResourceHub from '@/components/ResourceHub';
import { useServerWebSocket } from '@/hooks/useServerWebSocket';
import {
  Radio, Activity, Terminal, Map, Shield, LogOut, User, ChevronDown, Users, Wifi, WifiOff, Swords, Crosshair, Package,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { liveStats, serverState, liveEvents, liveNarrations, consoleLogs, connected } = useServerWebSocket();
  const [serverData, setServerData] = useState(null);
  const [events, setEvents] = useState([]);
  const [backups, setBackups] = useState([]);
  const [files, setFiles] = useState([]);
  const [filePath, setFilePath] = useState('/');
  const [onlineCount, setOnlineCount] = useState(0);

  // Fetch online player count
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

  const fetchFiles = useCallback(async (dir) => {
    try {
      const { data } = await api.get(`/server/files?directory=${encodeURIComponent(dir || '/')}`);
      setFiles(data?.data || []);
      setFilePath(dir || '/');
    } catch { /* graceful */ }
  }, []);

  useEffect(() => {
    fetchServer();
    fetchEvents();
    fetchOnlineCount();
    const si = setInterval(fetchServer, 60000);
    const ei = setInterval(fetchEvents, 30000);
    const pi = setInterval(fetchOnlineCount, 15000);
    return () => { clearInterval(si); clearInterval(ei); clearInterval(pi); };
  }, [fetchServer, fetchEvents, fetchOnlineCount]);

  // Merge live events with fetched events, deduplicate by timestamp
  const allEvents = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const ev of [...liveEvents, ...events]) {
      const key = `${ev.timestamp}-${ev.raw}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(ev);
      }
    }
    return merged.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).slice(0, 100);
  }, [liveEvents, events]);

  const isAdmin = user?.role === 'system_admin' || user?.role === 'server_admin';
  const isSystemAdmin = user?.role === 'system_admin';

  // Derive current state from WS or API
  const currentState = serverState || serverData?.resources?.attributes?.current_state || 'unknown';

  return (
    <div className="min-h-screen bg-[#111111] flex flex-col" data-testid="dashboard-page">
      {/* Header */}
      <header className="border-b border-[#2a2520] bg-[#111111] px-4 py-3 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-[#c4841d] glow-amber" />
          <h1 className="font-heading text-2xl font-bold uppercase tracking-[0.15em] text-[#c4841d] glow-amber-text">
            Dead Signal
          </h1>
          <span className="hidden sm:inline text-xs font-mono text-[#88837a] ml-2">
            // COMMAND TERMINAL v1.0
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Combined status indicator */}
          <div className="hidden md:flex items-center gap-3 text-[10px] font-mono">
            {/* WebSocket connection */}
            <div className="flex items-center gap-1.5">
              {connected ? (
                <><Wifi className="w-3 h-3 text-[#6b7a3d]" /><span className="text-[#6b7a3d]">CONNECTED</span></>
              ) : (
                <><WifiOff className="w-3 h-3 text-[#8b3a3a]" /><span className="text-[#8b3a3a]">DISCONNECTED</span></>
              )}
            </div>

            <span className="text-[#2a2520]">|</span>

            {/* Server state */}
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

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="user-menu-button" className="flex items-center gap-2 border border-[#2a2520] px-3 py-1.5 text-xs font-mono text-[#d4cfc4] hover:border-[#c4841d] transition-colors">
                <User className="w-3 h-3" />
                <span className="hidden sm:inline">{user?.callsign || 'Operator'}</span>
                <span className="text-[#88837a] hidden sm:inline">({user?.role?.replace('_', ' ')})</span>
                <ChevronDown className="w-3 h-3 text-[#88837a]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-[#1a1a1a] border-[#2a2520] text-[#d4cfc4] rounded-none min-w-[160px]">
              <DropdownMenuItem
                data-testid="logout-button"
                onClick={logout}
                className="text-xs font-mono cursor-pointer hover:bg-[#2a2520] hover:text-[#c4841d] rounded-none focus:bg-[#2a2520]"
              >
                <LogOut className="w-3 h-3 mr-2" /> Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-auto">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-[#111111] border border-[#2a2520] rounded-none p-1 mb-4 w-full justify-start overflow-x-auto flex-wrap gap-0">
            <TabsTrigger
              data-testid="tab-overview"
              value="overview"
              className="rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2"
            >
              <Activity className="w-3 h-3 mr-2" /> Overview
            </TabsTrigger>
            <TabsTrigger
              data-testid="tab-console"
              value="console"
              className="rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2"
            >
              <Terminal className="w-3 h-3 mr-2" /> Console
            </TabsTrigger>
            <TabsTrigger
              data-testid="tab-map"
              value="map"
              className="rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2"
            >
              <Map className="w-3 h-3 mr-2" /> Tactical Map
            </TabsTrigger>
            <TabsTrigger
              data-testid="tab-players"
              value="players"
              className="rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2"
            >
              <Users className="w-3 h-3 mr-2" /> Players
            </TabsTrigger>
            <TabsTrigger
              data-testid="tab-factions"
              value="factions"
              className="rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2"
            >
              <Swords className="w-3 h-3 mr-2" /> Factions
            </TabsTrigger>
            <TabsTrigger
              data-testid="tab-economy"
              value="economy"
              className="rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2"
            >
              <Package className="w-3 h-3 mr-2" /> Economy
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger
                data-testid="tab-gm"
                value="gm"
                className="rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2"
              >
                <Crosshair className="w-3 h-3 mr-2" /> Game Master
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger
                data-testid="tab-admin"
                value="admin"
                className="rounded-none font-heading uppercase tracking-widest text-xs data-[state=active]:bg-[#c4841d]/10 data-[state=active]:text-[#c4841d] data-[state=active]:border-b-2 data-[state=active]:border-[#c4841d] text-[#88837a] hover:text-[#d4cfc4] px-4 py-2"
              >
                <Shield className="w-3 h-3 mr-2" /> Admin
              </TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 space-y-4">
                <ServerStatus data={serverData} liveStats={liveStats} liveState={currentState} onRefresh={fetchServer} isAdmin={isAdmin} onlineCount={onlineCount} />
                <WorldConditions />
              </div>
              <div className="lg:col-span-2 space-y-4">
                <EventFeed events={allEvents} onRefresh={fetchEvents} serverOffline={currentState === 'offline' || currentState === 'stopped'} />
                <NarrativePanel events={allEvents} liveNarrations={liveNarrations} isAdmin={isAdmin} />
              </div>
            </div>
          </TabsContent>

          {/* Console Tab */}
          <TabsContent value="console" className="mt-0">
            <RconConsole isAdmin={isAdmin} consoleLogs={consoleLogs} serverOffline={currentState === 'offline' || currentState === 'stopped'} />
          </TabsContent>

          {/* Map Tab */}
          <TabsContent value="map" className="mt-0">
            <GridMap />
          </TabsContent>

          {/* Players Tab */}
          <TabsContent value="players" className="mt-0">
            <PlayerRoster isAdmin={isAdmin} />
          </TabsContent>

          {/* Factions Tab */}
          <TabsContent value="factions" className="mt-0">
            <FactionPanel user={user} />
          </TabsContent>

          {/* Economy Tab */}
          <TabsContent value="economy" className="mt-0">
            <ResourceHub user={user} />
          </TabsContent>

          {/* Game Master Tab */}
          {isAdmin && (
            <TabsContent value="gm" className="mt-0">
              <GameMasterPanel />
            </TabsContent>
          )}

          {/* Admin Tab */}
          {isAdmin && (
            <TabsContent value="admin" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* File Browser */}
                <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
                  <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
                    <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">File System</h3>
                    <button
                      data-testid="refresh-files-button"
                      onClick={() => fetchFiles(filePath)}
                      className="text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors"
                    >
                      [SCAN]
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-3 text-xs font-mono text-[#88837a]">
                      <span>PATH:</span>
                      <span className="text-[#d4cfc4]">{filePath}</span>
                      {filePath !== '/' && (
                        <button
                          onClick={() => {
                            const parent = filePath.split('/').slice(0, -1).join('/') || '/';
                            fetchFiles(parent);
                          }}
                          className="text-[#c4841d] hover:underline"
                        >[UP]</button>
                      )}
                    </div>
                    <div className="space-y-1 max-h-[400px] overflow-auto">
                      {files.length === 0 && (
                        <p className="text-xs font-mono text-[#88837a]">Click [SCAN] to browse files</p>
                      )}
                      {files.map?.((f, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 text-xs font-mono border border-transparent hover:border-[#2a2520] hover:bg-[#111111] transition-colors cursor-pointer"
                          onClick={() => {
                            if (f.attributes?.is_file === false) {
                              fetchFiles(filePath === '/' ? `/${f.attributes?.name}` : `${filePath}/${f.attributes?.name}`);
                            }
                          }}
                        >
                          <span className={f.attributes?.is_file ? 'text-[#d4cfc4]' : 'text-[#c4841d]'}>
                            {f.attributes?.is_file ? '' : '/'}{f.attributes?.name || 'unknown'}
                          </span>
                          <span className="text-[#88837a]">
                            {f.attributes?.size ? `${(f.attributes.size / 1024).toFixed(1)}KB` : ''}
                          </span>
                        </div>
                      )) || null}
                    </div>
                  </div>
                </div>

                {/* Backups */}
                <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
                  <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
                    <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Backups</h3>
                    <div className="flex gap-2">
                      <button
                        data-testid="create-backup-button"
                        onClick={async () => {
                          try {
                            await api.post('/server/backups');
                            fetchBackups();
                          } catch { /* graceful */ }
                        }}
                        className="text-xs font-mono border border-[#4a5c3a] text-[#4a5c3a] px-2 py-1 hover:bg-[#4a5c3a] hover:text-[#111111] transition-all"
                      >
                        [CREATE]
                      </button>
                      <button
                        data-testid="refresh-backups-button"
                        onClick={fetchBackups}
                        className="text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors"
                      >
                        [SCAN]
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-1 max-h-[400px] overflow-auto">
                    {backups.length === 0 && (
                      <p className="text-xs font-mono text-[#88837a]">Click [SCAN] to list backups</p>
                    )}
                    {backups.map?.((b, i) => (
                      <div key={i} className="flex items-center justify-between p-2 text-xs font-mono border border-transparent hover:border-[#2a2520] hover:bg-[#111111]">
                        <span className="text-[#d4cfc4]">{b.attributes?.name || `Backup ${i + 1}`}</span>
                        <span className="text-[#88837a]">
                          {b.attributes?.bytes ? `${(b.attributes.bytes / 1024 / 1024).toFixed(1)}MB` : ''}
                        </span>
                      </div>
                    )) || null}
                  </div>
                </div>
              </div>

              {/* Key Management - System Admin only */}
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
