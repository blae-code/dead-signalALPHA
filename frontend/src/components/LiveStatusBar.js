import {
  Sun, Moon, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog,
  Thermometer, ShieldAlert, Flower2, Snowflake, TreeDeciduous, Radio,
} from 'lucide-react';

const WEATHER_ICONS = {
  clear: <Sun className="w-3 h-3" />,
  cloudy: <Cloud className="w-3 h-3" />,
  overcast: <Cloud className="w-3 h-3" />,
  rain: <CloudRain className="w-3 h-3" />,
  storm: <CloudLightning className="w-3 h-3" />,
  fog: <CloudFog className="w-3 h-3" />,
  snow: <CloudSnow className="w-3 h-3" />,
  blizzard: <CloudSnow className="w-3 h-3" />,
};

const TIME_ICONS = {
  dawn: <Sun className="w-3 h-3" />,
  morning: <Sun className="w-3 h-3" />,
  noon: <Sun className="w-3 h-3" />,
  afternoon: <Sun className="w-3 h-3" />,
  dusk: <Moon className="w-3 h-3" />,
  night: <Moon className="w-3 h-3" />,
  midnight: <Moon className="w-3 h-3" />,
};

const SEASON_ICONS = {
  spring: <Flower2 className="w-3 h-3" />,
  summer: <Sun className="w-3 h-3" />,
  autumn: <TreeDeciduous className="w-3 h-3" />,
  winter: <Snowflake className="w-3 h-3" />,
};

const DANGER_COLORS = ['#6b7a3d', '#6b7a3d', '#6b7a3d', '#6b7a3d', '#c4841d', '#c4841d', '#8b3a3a', '#8b3a3a', '#8b3a3a', '#8b3a3a', '#ff0000'];
const DANGER_LABELS = ['SAFE', 'SAFE', 'LOW', 'LOW', 'MODERATE', 'MODERATE', 'HIGH', 'HIGH', 'EXTREME', 'EXTREME', 'LETHAL'];

export default function LiveStatusBar({ worldState }) {
  if (!worldState) return null;

  const dangerColor = DANGER_COLORS[worldState.danger_level] || '#88837a';
  const dangerLabel = DANGER_LABELS[worldState.danger_level] || 'UNKNOWN';

  return (
    <div
      className="border-b border-[#2a2520] bg-[#0a0a0a]/90 px-4 py-1.5 flex items-center gap-4 overflow-x-auto text-[10px] font-mono"
      data-testid="live-status-bar"
      style={{ transition: 'background-color 1.5s ease' }}
    >
      {/* Live indicator */}
      <div className="flex items-center gap-1.5 text-[#6b7a3d] shrink-0">
        <Radio className="w-3 h-3 animate-pulse" />
        <span className="uppercase tracking-widest">Live</span>
      </div>

      <div className="w-px h-3 bg-[#2a2520]" />

      {/* Time */}
      <div className="flex items-center gap-1.5 text-[#d4cfc4] shrink-0" style={{ transition: 'color 0.5s ease' }}>
        <span className="text-[#c4841d]">{TIME_ICONS[worldState.time_of_day]}</span>
        <span>{worldState.hour_display}</span>
        <span className="text-[#88837a] uppercase">{worldState.time_of_day}</span>
      </div>

      <div className="w-px h-3 bg-[#2a2520]" />

      {/* Weather */}
      <div className="flex items-center gap-1.5 text-[#d4cfc4] shrink-0" style={{ transition: 'color 0.5s ease' }}>
        <span className="text-[#c4841d]">{WEATHER_ICONS[worldState.weather]}</span>
        <span className="uppercase">{worldState.weather}</span>
        <span className="text-[#88837a] flex items-center gap-0.5">
          <Thermometer className="w-2.5 h-2.5" />
          {worldState.temperature}°C
        </span>
      </div>

      <div className="w-px h-3 bg-[#2a2520]" />

      {/* Season */}
      <div className="flex items-center gap-1.5 text-[#d4cfc4] shrink-0">
        <span className="text-[#c4841d]">{SEASON_ICONS[worldState.season]}</span>
        <span className="uppercase">{worldState.season}</span>
        <span className="text-[#88837a]">Day {worldState.day}</span>
      </div>

      <div className="w-px h-3 bg-[#2a2520]" />

      {/* Danger */}
      <div className="flex items-center gap-1.5 shrink-0">
        <ShieldAlert className="w-3 h-3" style={{ color: dangerColor }} />
        <span className="uppercase tracking-widest font-bold" style={{ color: dangerColor, transition: 'color 0.5s ease' }}>
          Threat: {dangerLabel}
        </span>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="w-1 h-2.5"
              style={{
                backgroundColor: i < Math.ceil(worldState.danger_level / 2) ? dangerColor : '#2a2520',
                transition: 'background-color 1s ease',
              }}
            />
          ))}
        </div>
      </div>

      {/* Custom alert */}
      {worldState.custom_alert && (
        <>
          <div className="w-px h-3 bg-[#2a2520]" />
          <span className="text-[#8b3a3a] uppercase tracking-wider truncate max-w-[200px] shrink-0">
            {worldState.custom_alert}
          </span>
        </>
      )}
    </div>
  );
}
