import { MapPin, Crosshair, AlertTriangle } from 'lucide-react';

export default function GridMap() {
  const gridSize = 16;
  const cells = Array.from({ length: gridSize * gridSize });

  // Sample markers for visual interest
  const markers = [
    { x: 3, y: 5, type: 'base', label: 'Alpha Base' },
    { x: 11, y: 3, type: 'danger', label: 'Horde Zone' },
    { x: 7, y: 10, type: 'airdrop', label: 'Last Airdrop' },
    { x: 14, y: 8, type: 'base', label: 'Outpost Bravo' },
    { x: 5, y: 13, type: 'danger', label: 'Dead Zone' },
  ];

  const getMarker = (x, y) => markers.find((m) => m.x === x && m.y === y);

  return (
    <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg" data-testid="grid-map-panel">
      <div className="border-b border-[#2a2520] bg-[#111111] p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-[#c4841d]" />
          <h3 className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">Tactical Map</h3>
        </div>
        <span className="text-[10px] font-mono text-[#88837a]">PLACEHOLDER // FMODEL EXTRACTION PENDING</span>
      </div>

      <div className="p-4">
        {/* Legend */}
        <div className="flex gap-4 mb-3 text-[10px] font-mono">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-[#4a5c3a]" />
            <span className="text-[#88837a]">Bases</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-[#8b3a3a]" />
            <span className="text-[#88837a]">Threat Zones</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-[#c4841d]" />
            <span className="text-[#88837a]">Airdrops</span>
          </div>
        </div>

        {/* Grid */}
        <div className="relative border border-[#2a2520] bg-[#0d0d0d] overflow-hidden">
          {/* Grid overlay */}
          <div
            className="grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
              aspectRatio: '1',
            }}
          >
            {cells.map((_, i) => {
              const x = i % gridSize;
              const y = Math.floor(i / gridSize);
              const marker = getMarker(x, y);

              return (
                <div
                  key={i}
                  className={`border border-[#1a1a1a]/60 aspect-square relative flex items-center justify-center transition-colors hover:bg-[#2a2520]/30 ${
                    marker ? 'z-10' : ''
                  }`}
                  title={marker?.label}
                >
                  {marker?.type === 'base' && (
                    <MapPin className="w-3 h-3 text-[#4a5c3a] drop-shadow-[0_0_4px_rgba(74,92,58,0.8)]" />
                  )}
                  {marker?.type === 'danger' && (
                    <AlertTriangle className="w-3 h-3 text-[#8b3a3a] drop-shadow-[0_0_4px_rgba(139,58,58,0.8)]" />
                  )}
                  {marker?.type === 'airdrop' && (
                    <div className="w-2 h-2 bg-[#c4841d] pulse-amber" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Crosshair center */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <Crosshair className="w-8 h-8 text-[#c4841d]/10" />
          </div>

          {/* Grid coordinates */}
          <div className="absolute top-0 left-0 right-0 flex justify-between px-1 text-[8px] font-mono text-[#88837a]/30">
            {Array.from({ length: gridSize }, (_, i) => (
              <span key={i}>{String.fromCharCode(65 + i)}</span>
            ))}
          </div>
          <div className="absolute top-0 bottom-0 left-0 flex flex-col justify-between py-1 text-[8px] font-mono text-[#88837a]/30">
            {Array.from({ length: gridSize }, (_, i) => (
              <span key={i} className="leading-none">{i + 1}</span>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[10px] font-mono text-[#88837a] text-center">
          Map data pending FModel game asset extraction. Showing placeholder tactical grid.
        </p>
      </div>
    </div>
  );
}
