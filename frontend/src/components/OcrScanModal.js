import { useState, useRef } from 'react';
import { X, Scan, Camera, Check, Loader, AlertTriangle, Package, Hammer, Radio } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import api, { formatError } from '@/lib/api';

function fmtTimer(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function toggle(set, val) {
  const next = new Set(set);
  if (next.has(val)) next.delete(val); else next.add(val);
  return next;
}

function Section({ icon, title, onSelectAll, onClearAll, children }) {
  return (
    <div className="border border-[#2a2520]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#111111] border-b border-[#2a2520]">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] font-heading uppercase tracking-widest text-[#c4841d]">{title}</span>
        </div>
        <div className="flex gap-3">
          <button onClick={onSelectAll} className="text-[9px] font-mono text-[#88837a] hover:text-[#d4cfc4] transition-colors">ALL</button>
          <button onClick={onClearAll} className="text-[9px] font-mono text-[#88837a] hover:text-[#d4cfc4] transition-colors">NONE</button>
        </div>
      </div>
      <div className="p-2 space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ checked, onChange, children }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer hover:bg-[#1a1a1a] px-2 py-1 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-[#c4841d] w-3 h-3 flex-shrink-0"
      />
      <div className="flex items-center gap-2 flex-1 min-w-0">{children}</div>
    </label>
  );
}

function ApplyBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-2 w-full border border-[#4a5c3a] text-[#6b7a3d] hover:bg-[#4a5c3a]/20 font-heading text-[10px] uppercase tracking-widest py-2 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <Check className="w-3 h-3" /> {children}
    </button>
  );
}

export default function OcrScanModal({ onClose, onApplyInventory, onApplyCrafting }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [applyMsg, setApplyMsg] = useState('');
  const [selInv, setSelInv] = useState(new Set());
  const [selCraft, setSelCraft] = useState(new Set());
  const [selEvents, setSelEvents] = useState(new Set());
  const [loggingEvents, setLoggingEvents] = useState(false);
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setFile(f);
    setResult(null);
    setError('');
    setApplyMsg('');
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const scan = async () => {
    if (!file) return;
    setScanning(true);
    setError('');
    setResult(null);
    setApplyMsg('');
    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post('/ocr/scan', form, {
        headers: { 'Content-Type': undefined },
      });
      setResult(data);
      setSelInv(new Set(data.inventory_items.map((_, i) => i)));
      setSelCraft(new Set(data.crafting_queue.map((_, i) => i)));
      setSelEvents(new Set(data.events.map((_, i) => i)));
    } catch (e) {
      setError(formatError(e.response?.data?.detail) || 'Scan failed. Please try again.');
    }
    setScanning(false);
  };

  const applyInventory = async () => {
    const items = result.inventory_items.filter((_, i) => selInv.has(i));
    if (!items.length) return;
    try {
      await onApplyInventory(items);
      setApplyMsg(`Merged ${items.length} item type(s) into inventory.`);
    } catch (e) {
      setError(formatError(e.response?.data?.detail) || 'Failed to apply inventory.');
    }
  };

  const applyCrafting = async () => {
    const items = result.crafting_queue.filter((_, i) => selCraft.has(i));
    if (!items.length) return;
    try {
      await onApplyCrafting(items);
      setApplyMsg(`Added ${items.length} recipe(s) to crafting queue.`);
    } catch (e) {
      setError(formatError(e.response?.data?.detail) || 'Failed to apply crafting queue.');
    }
  };

  const logEvents = async () => {
    const events = result.events.filter((_, i) => selEvents.has(i));
    if (!events.length) return;
    setLoggingEvents(true);
    let logged = 0;
    for (const raw of events) {
      try {
        await api.post('/events', { raw });
        logged++;
      } catch { /* skip unparseable lines */ }
    }
    setLoggingEvents(false);
    setApplyMsg(`Logged ${logged} event(s) to the event feed.`);
  };

  const noResults = result &&
    result.inventory_items.length === 0 &&
    result.crafting_queue.length === 0 &&
    result.events.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-[#0d0d0d] border border-[#2a2520] w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2520] bg-[#111111] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4 text-[#c4841d]" />
            <span className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">OCR Screenshot Scan</span>
          </div>
          <button onClick={onClose} className="text-[#88837a] hover:text-[#d4cfc4] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">

            {/* Drop zone */}
            <div
              className="border-2 border-dashed border-[#2a2520] hover:border-[#c4841d]/50 p-5 text-center cursor-pointer transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              {preview ? (
                <img src={preview} alt="preview" className="max-h-36 mx-auto object-contain" />
              ) : (
                <>
                  <Camera className="w-7 h-7 text-[#88837a] mx-auto mb-2" />
                  <p className="text-xs font-mono text-[#88837a]">Drop screenshot or click to browse</p>
                  <p className="text-[10px] font-mono text-[#88837a]/50 mt-1">PNG · JPG · WebP · GIF — max 10 MB</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {error && (
              <div className="flex items-start gap-2 text-[#a94442] text-xs font-mono">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {applyMsg && (
              <p className="text-[#6b7a3d] text-[10px] font-mono">{applyMsg}</p>
            )}

            {/* Scan button */}
            <button
              onClick={scan}
              disabled={!file || scanning}
              className="w-full border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 font-heading text-xs uppercase tracking-widest py-2.5 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {scanning
                ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Scanning...</>
                : <><Scan className="w-3.5 h-3.5" /> Scan Image</>}
            </button>

            {/* Results */}
            {result && (
              <>
                {noResults ? (
                  <div className="flex items-center gap-2 text-[#c4841d] text-xs font-mono border border-[#c4841d]/30 p-3">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>No data detected. Try a clearer screenshot of an inventory or crafting screen.</span>
                  </div>
                ) : (
                  <>
                    {/* Inventory items */}
                    {result.inventory_items.length > 0 && (
                      <Section
                        icon={<Package className="w-3.5 h-3.5 text-[#c4841d]" />}
                        title={`Inventory Items (${result.inventory_items.length})`}
                        onSelectAll={() => setSelInv(new Set(result.inventory_items.map((_, i) => i)))}
                        onClearAll={() => setSelInv(new Set())}
                      >
                        {result.inventory_items.map((item, i) => (
                          <Row key={i} checked={selInv.has(i)} onChange={() => setSelInv(s => toggle(s, i))}>
                            <span className="flex-1 text-xs font-mono text-[#d4cfc4] truncate">{item.item_name}</span>
                            <span className="text-[#c4841d] text-xs font-mono flex-shrink-0">×{item.quantity}</span>
                            {item.notes && <span className="text-[#88837a] text-[10px] truncate max-w-[80px]">{item.notes}</span>}
                          </Row>
                        ))}
                        <ApplyBtn onClick={applyInventory} disabled={selInv.size === 0}>
                          Merge {selInv.size} item(s) into inventory
                        </ApplyBtn>
                      </Section>
                    )}

                    {/* Crafting queue */}
                    {result.crafting_queue.length > 0 && (
                      <Section
                        icon={<Hammer className="w-3.5 h-3.5 text-[#c4841d]" />}
                        title={`Crafting Queue (${result.crafting_queue.length})`}
                        onSelectAll={() => setSelCraft(new Set(result.crafting_queue.map((_, i) => i)))}
                        onClearAll={() => setSelCraft(new Set())}
                      >
                        {result.crafting_queue.map((item, i) => (
                          <Row key={i} checked={selCraft.has(i)} onChange={() => setSelCraft(s => toggle(s, i))}>
                            <span className="flex-1 text-xs font-mono text-[#d4cfc4] truncate">{item.recipe_name}</span>
                            <span className="text-[#c4841d] text-xs font-mono flex-shrink-0">×{item.quantity}</span>
                            {item.timer_seconds != null && (
                              <span className="text-[#88837a] text-[10px] flex-shrink-0">{fmtTimer(item.timer_seconds)}</span>
                            )}
                          </Row>
                        ))}
                        <ApplyBtn onClick={applyCrafting} disabled={selCraft.size === 0}>
                          Add {selCraft.size} recipe(s) to queue
                        </ApplyBtn>
                      </Section>
                    )}

                    {/* Events */}
                    {result.events.length > 0 && (
                      <Section
                        icon={<Radio className="w-3.5 h-3.5 text-[#c4841d]" />}
                        title={`Detected Events (${result.events.length})`}
                        onSelectAll={() => setSelEvents(new Set(result.events.map((_, i) => i)))}
                        onClearAll={() => setSelEvents(new Set())}
                      >
                        {result.events.map((ev, i) => (
                          <Row key={i} checked={selEvents.has(i)} onChange={() => setSelEvents(s => toggle(s, i))}>
                            <span className="text-[10px] font-mono text-[#88837a] break-all leading-relaxed">{ev}</span>
                          </Row>
                        ))}
                        <ApplyBtn onClick={logEvents} disabled={selEvents.size === 0 || loggingEvents}>
                          {loggingEvents ? 'Logging...' : `Log ${selEvents.size} event(s) to feed`}
                        </ApplyBtn>
                      </Section>
                    )}
                  </>
                )}

                {/* Raw text toggle */}
                {result.raw_text && (
                  <details className="border border-[#2a2520]">
                    <summary className="px-3 py-2 text-[9px] font-heading uppercase tracking-widest text-[#88837a] cursor-pointer hover:text-[#d4cfc4] transition-colors select-none">
                      Raw Extracted Text
                    </summary>
                    <pre className="p-3 text-[10px] font-mono text-[#88837a]/70 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                      {result.raw_text}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
