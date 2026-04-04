import { useState, useRef } from 'react';
import { X, Scan, Camera, Check, Loader, AlertTriangle, Package, Hammer, Radio, Edit3, ArrowRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import api, { formatError } from '@/lib/api';

const KNOWN_ITEMS = [
  'Canned Food','Fresh Meat','MRE','Water Bottle','Water Purifier',
  '9mm Ammo','5.56 Ammo','12ga Shells','Bandage','First Aid Kit',
  'Antibiotics','Painkillers','Wood Planks','Metal Sheets','Nails',
  'Concrete Mix','Pistol','Shotgun','Assault Rifle','Melee Weapon',
  'Battery','Fuel Can','Tire','Backpack','Toolbox',
  'Wooden Barricade','Metal Wall','Campfire','Rain Collector','Splint',
  'Improvised Suppressor','Storage Crate','Generator','Concrete Wall','Molotov Cocktail',
].sort();

const CONFIDENCE_STYLES = {
  exact:   { label: 'EXACT',   color: '#6b7a3d', border: 'border-[#6b7a3d]' },
  alias:   { label: 'ALIAS',   color: '#c4841d', border: 'border-[#c4841d]' },
  partial: { label: 'PARTIAL', color: '#c4841d', border: 'border-[#c4841d]' },
  unknown: { label: 'UNKNOWN', color: '#8b3a3a', border: 'border-[#8b3a3a]' },
};

function Section({ icon, title, badge, children }) {
  return (
    <div className="border border-[#2a2520]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#111111] border-b border-[#2a2520]">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] font-heading uppercase tracking-widest text-[#c4841d]">{title}</span>
        </div>
        {badge}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

export default function OcrScanModal({ onClose, onApplyInventory, onApplyCrafting }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [rawResult, setRawResult] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [crafting, setCrafting] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [applyMsg, setApplyMsg] = useState('');
  const [step, setStep] = useState('upload'); // upload | review
  const fileRef = useRef();

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setFile(f);
    setRawResult(null);
    setReviewItems([]);
    setError('');
    setApplyMsg('');
    setStep('upload');
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const scan = async () => {
    if (!file) return;
    setScanning(true);
    setError('');
    setApplyMsg('');
    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post('/ocr/scan', form, {
        headers: { 'Content-Type': undefined },
      });
      setRawResult(data);
      setCrafting(data.crafting_queue || []);
      setEvents(data.events || []);

      // Resolve aliases for inventory items
      if (data.inventory_items?.length > 0) {
        setResolving(true);
        try {
          const { data: resolved } = await api.post('/loot-intel/resolve-aliases', {
            items: data.inventory_items.map(it => ({ name: it.item_name, quantity: it.quantity })),
          });
          setReviewItems((resolved.items || []).map((item, i) => ({
            ...item,
            selected: true,
            editing: false,
            notes: data.inventory_items[i]?.notes || '',
          })));
        } catch {
          // Fallback: use raw items without resolution
          setReviewItems(data.inventory_items.map(it => ({
            original: it.item_name,
            resolved: it.item_name,
            quantity: it.quantity,
            confidence: 'unknown',
            selected: true,
            editing: false,
            notes: it.notes || '',
          })));
        }
        setResolving(false);
      }
      setStep('review');
    } catch (e) {
      setError(formatError(e.response?.data?.detail) || 'Scan failed. Please try again.');
    }
    setScanning(false);
  };

  const updateItem = (idx, field, value) => {
    setReviewItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const toggleSelect = (idx) => {
    setReviewItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  };

  const selectAll = () => setReviewItems(prev => prev.map(it => ({ ...it, selected: true })));
  const selectNone = () => setReviewItems(prev => prev.map(it => ({ ...it, selected: false })));

  const applyInventory = async () => {
    const items = reviewItems
      .filter(it => it.selected && it.quantity > 0)
      .map(it => ({ item_name: it.resolved, quantity: it.quantity, notes: it.notes || '' }));
    if (!items.length) return;
    try {
      await onApplyInventory(items);
      setApplyMsg(`Merged ${items.length} item(s) into inventory.`);
    } catch (e) {
      setError(formatError(e.response?.data?.detail) || 'Failed to apply.');
    }
  };

  const applyCraftingQueue = async () => {
    if (!crafting.length) return;
    try {
      await onApplyCrafting(crafting);
      setApplyMsg(`Added ${crafting.length} recipe(s) to crafting queue.`);
    } catch (e) {
      setError(formatError(e.response?.data?.detail) || 'Failed to apply crafting.');
    }
  };

  const selectedCount = reviewItems.filter(it => it.selected).length;
  const exactCount = reviewItems.filter(it => it.confidence === 'exact').length;
  const unknownCount = reviewItems.filter(it => it.confidence === 'unknown').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-[#0d0d0d] border border-[#2a2520] w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2520] bg-[#111111] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4 text-[#c4841d]" />
            <span className="font-heading text-sm uppercase tracking-widest text-[#c4841d]">
              {step === 'upload' ? 'OCR Screenshot Scan' : 'Review & Correct'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {step === 'review' && (
              <button onClick={() => setStep('upload')} className="text-[9px] font-mono text-[#88837a] hover:text-[#c4841d]">
                BACK
              </button>
            )}
            <button onClick={onClose} className="text-[#88837a] hover:text-[#d4cfc4] transition-colors" data-testid="ocr-close-btn">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {step === 'upload' && (
              <>
                {/* Drop zone */}
                <div
                  className="border-2 border-dashed border-[#2a2520] hover:border-[#c4841d]/50 p-5 text-center cursor-pointer transition-colors"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                  data-testid="ocr-drop-zone"
                >
                  {preview ? (
                    <img src={preview} alt="preview" className="max-h-36 mx-auto object-contain" />
                  ) : (
                    <>
                      <Camera className="w-7 h-7 text-[#88837a] mx-auto mb-2" />
                      <p className="text-xs font-mono text-[#88837a]">Drop screenshot or click to browse</p>
                      <p className="text-[10px] font-mono text-[#88837a]/50 mt-1">PNG / JPG / WebP / GIF — max 10 MB</p>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden" onChange={(e) => handleFile(e.target.files[0])} />

                <button onClick={scan} disabled={!file || scanning} data-testid="ocr-scan-btn"
                  className="w-full border border-[#c4841d] text-[#c4841d] hover:bg-[#c4841d]/10 font-heading text-xs uppercase tracking-widest py-2.5 flex items-center justify-center gap-2 disabled:opacity-40 transition-colors">
                  {scanning
                    ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Scanning &amp; Resolving...</>
                    : <><Scan className="w-3.5 h-3.5" /> Scan Image</>}
                </button>
              </>
            )}

            {step === 'review' && (
              <>
                {/* Stats bar */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-[#2a2520] p-2 text-center">
                    <p className="font-heading text-lg font-bold text-[#c4841d]">{reviewItems.length}</p>
                    <p className="text-[8px] font-mono text-[#88837a] uppercase">Detected</p>
                  </div>
                  <div className="border border-[#6b7a3d]/40 p-2 text-center">
                    <p className="font-heading text-lg font-bold text-[#6b7a3d]">{exactCount}</p>
                    <p className="text-[8px] font-mono text-[#88837a] uppercase">Exact Match</p>
                  </div>
                  <div className="border border-[#8b3a3a]/40 p-2 text-center">
                    <p className="font-heading text-lg font-bold text-[#8b3a3a]">{unknownCount}</p>
                    <p className="text-[8px] font-mono text-[#88837a] uppercase">Unknown</p>
                  </div>
                </div>

                {resolving && (
                  <div className="flex items-center gap-2 text-[#c4841d] text-xs font-mono">
                    <Loader className="w-3 h-3 animate-spin" /> Resolving aliases...
                  </div>
                )}

                {/* Inventory review table */}
                {reviewItems.length > 0 && (
                  <Section
                    icon={<Package className="w-3.5 h-3.5 text-[#c4841d]" />}
                    title={`Inventory Review (${reviewItems.length})`}
                    badge={
                      <div className="flex gap-2">
                        <button onClick={selectAll} className="text-[9px] font-mono text-[#88837a] hover:text-[#d4cfc4]">ALL</button>
                        <button onClick={selectNone} className="text-[9px] font-mono text-[#88837a] hover:text-[#d4cfc4]">NONE</button>
                      </div>
                    }
                  >
                    <div className="space-y-1">
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-1 px-2 py-1 text-[8px] font-mono text-[#88837a] uppercase border-b border-[#2a2520]">
                        <div className="col-span-1"></div>
                        <div className="col-span-3">Original</div>
                        <div className="col-span-1"></div>
                        <div className="col-span-3">Resolved</div>
                        <div className="col-span-2">Qty</div>
                        <div className="col-span-2">Status</div>
                      </div>

                      {reviewItems.map((item, i) => {
                        const conf = CONFIDENCE_STYLES[item.confidence] || CONFIDENCE_STYLES.unknown;
                        const changed = item.original !== item.resolved;
                        return (
                          <div key={i} className={`grid grid-cols-12 gap-1 items-center px-2 py-1.5 border transition-all ${
                            item.selected ? 'border-[#2a2520] bg-[#1a1a1a]' : 'border-transparent opacity-50'
                          }`}>
                            {/* Select */}
                            <div className="col-span-1">
                              <input type="checkbox" checked={item.selected} onChange={() => toggleSelect(i)}
                                className="accent-[#c4841d] w-3 h-3" />
                            </div>
                            {/* Original name */}
                            <div className="col-span-3">
                              <span className={`text-[10px] font-mono ${changed ? 'text-[#88837a] line-through' : 'text-[#d4cfc4]'}`}>
                                {item.original}
                              </span>
                            </div>
                            {/* Arrow */}
                            <div className="col-span-1 flex justify-center">
                              {changed && <ArrowRight className="w-2.5 h-2.5 text-[#c4841d]" />}
                            </div>
                            {/* Resolved name — editable */}
                            <div className="col-span-3">
                              <input list={`ocr-items-${i}`} value={item.resolved}
                                onChange={e => updateItem(i, 'resolved', e.target.value)}
                                className="w-full bg-[#0a0a0a] border border-[#2a2520] text-[#d4cfc4] text-[10px] px-1.5 py-0.5 font-mono focus:outline-none focus:border-[#c4841d]" />
                              <datalist id={`ocr-items-${i}`}>
                                {KNOWN_ITEMS.map(n => <option key={n} value={n} />)}
                              </datalist>
                            </div>
                            {/* Quantity — editable */}
                            <div className="col-span-2">
                              <input type="number" min="0" max="99999" value={item.quantity}
                                onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 0)}
                                className="w-full bg-[#0a0a0a] border border-[#2a2520] text-[#d4cfc4] text-[10px] px-1.5 py-0.5 font-mono focus:outline-none focus:border-[#c4841d]" />
                            </div>
                            {/* Confidence badge */}
                            <div className="col-span-2 flex justify-end">
                              <span className={`text-[7px] font-mono uppercase px-1.5 py-0.5 border ${conf.border}`}
                                style={{ color: conf.color }}>
                                {conf.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button onClick={applyInventory} disabled={selectedCount === 0} data-testid="ocr-apply-inventory-btn"
                      className="mt-2 w-full border border-[#4a5c3a] text-[#6b7a3d] hover:bg-[#4a5c3a]/20 font-heading text-[10px] uppercase tracking-widest py-2 flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors">
                      <Check className="w-3 h-3" /> Merge {selectedCount} item(s) into inventory
                    </button>
                  </Section>
                )}

                {/* Crafting queue */}
                {crafting.length > 0 && (
                  <Section icon={<Hammer className="w-3.5 h-3.5 text-[#c4841d]" />} title={`Crafting Queue (${crafting.length})`}>
                    {crafting.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 border border-[#2a2520]">
                        <span className="flex-1 text-[10px] font-mono text-[#d4cfc4]">{item.recipe_name}</span>
                        <span className="text-[#c4841d] text-[10px] font-mono">x{item.quantity}</span>
                      </div>
                    ))}
                    <button onClick={applyCraftingQueue} data-testid="ocr-apply-crafting-btn"
                      className="mt-2 w-full border border-[#4a5c3a] text-[#6b7a3d] hover:bg-[#4a5c3a]/20 font-heading text-[10px] uppercase tracking-widest py-2 flex items-center justify-center gap-1.5 transition-colors">
                      <Check className="w-3 h-3" /> Add to crafting queue
                    </button>
                  </Section>
                )}

                {/* Events */}
                {events.length > 0 && (
                  <Section icon={<Radio className="w-3.5 h-3.5 text-[#c4841d]" />} title={`Events (${events.length})`}>
                    {events.map((ev, i) => (
                      <p key={i} className="text-[10px] font-mono text-[#88837a] px-2 py-0.5 break-all">{ev}</p>
                    ))}
                  </Section>
                )}

                {/* Raw text */}
                {rawResult?.raw_text && (
                  <details className="border border-[#2a2520]">
                    <summary className="px-3 py-2 text-[9px] font-heading uppercase tracking-widest text-[#88837a] cursor-pointer hover:text-[#d4cfc4] select-none">
                      Raw Extracted Text
                    </summary>
                    <pre className="p-3 text-[10px] font-mono text-[#88837a]/70 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                      {rawResult.raw_text}
                    </pre>
                  </details>
                )}

                {reviewItems.length === 0 && crafting.length === 0 && events.length === 0 && (
                  <div className="flex items-center gap-2 text-[#c4841d] text-xs font-mono border border-[#c4841d]/30 p-3">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>No data detected. Try a clearer screenshot.</span>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 text-[#a94442] text-xs font-mono">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {applyMsg && (
              <p className="text-[#6b7a3d] text-[10px] font-mono">{applyMsg}</p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
