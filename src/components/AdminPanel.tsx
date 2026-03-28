import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X,
  RotateCcw,
  Trash2,
  CheckCircle2, 
  MessageSquare,
  ChevronDown,
  Filter,
  Check
} from 'lucide-react';
import { apiUrl } from '../lib/apiUrl';
import { SYLLABUS_BY_LEVEL } from '../syllabusCatalog';

const MIN_YEAR = 2017;
const MAX_YEAR = 2026;

const QUALIFICATION_LEVELS = [
  { id: 'IGCSE', label: 'IGCSE' },
  { id: 'OLEVEL', label: 'O Level' },
  { id: 'ALEVEL', label: 'AS & A Level' },
];

export interface Syllabus {
  level: string;
  code: string;
  label: string;
}

export interface UserRequest {
  id: number;
  user_id: number;
  requester_name?: string;
  type: 'BUG_FIX' | 'NEW_FEATURE' | 'ADD_SUBJECT';
  description: string;
  status: 'pending' | 'completed';
  created_at: string;
}

export interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
  token: string;
  requests: UserRequest[];
  loadingReqs: boolean;
  deleteRequest: (id: number) => void;
  updateRequestStatus: (id: number, status: 'pending' | 'completed') => void;
}

export default function AdminPanel({ 
  open, 
  onClose, 
  token,
  requests,
  loadingReqs,
  deleteRequest,
  updateRequestStatus
}: AdminPanelProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [selectedQuals, setSelectedQuals] = useState<string[]>(['IGCSE']);
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [syllabusSearch, setSyllabusSearch] = useState('');
  const [lastRefreshByKey, setLastRefreshByKey] = useState<Map<string, string>>(new Map());

  const [loadingEst, setLoadingEst] = useState(false);
  const [estimated, setEstimated] = useState<number | null>(null);
  const [requestFilter, setRequestFilter] = useState<'ALL' | UserRequest['type']>('ALL');
  const [debugSyllabusCode, setDebugSyllabusCode] = useState('');
  const [debugResult, setDebugResult] = useState<string | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      void fetchLastRefreshes();
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  useEffect(() => {
    if (open && token) void fetchEstimate();
  }, [selectedQuals, selectedCodes, open, token]);

  // Build syllabi from static catalog — no API needed
  useEffect(() => {
    const allSyllabi: Syllabus[] = [];
    for (const [level, options] of Object.entries(SYLLABUS_BY_LEVEL)) {
      for (const opt of options) {
        allSyllabi.push({ level: level.toUpperCase(), code: opt.code, label: opt.label });
      }
    }
    setSyllabi(allSyllabi);
  }, []);

  const fetchLastRefreshes = async () => {
    try {
      const res = await fetch(apiUrl('admin/last-refreshes'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json() as { ok: boolean; rows: Array<{ qualification_level: string; syllabus_code: string; last_refresh_at: string }> };
        const m = new Map<string, string>();
        if (data.ok && Array.isArray(data.rows)) {
          data.rows.forEach(d => {
            const levelUpper = String(d.qualification_level).toUpperCase();
            m.set(`${levelUpper}:${d.syllabus_code}`, d.last_refresh_at);
          });
        }
        setLastRefreshByKey(m);
      }
    } catch (e) {
      console.error('Failed to last-refreshes', e);
    }
  };

  const fetchEstimate = async () => {
    if (selectedQuals.length === 0) {
      setEstimated(0);
      return;
    }
    setLoadingEst(true);
    try {
      const res = await fetch(apiUrl('admin/estimate'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          qualificationLevels: selectedQuals.map(q => q.toLowerCase()),
          syllabusCodes: Array.from(selectedCodes)
        })
      });
      if (res.ok) {
        const data = await res.json() as { ok: boolean; estimatedUrls: number };
        setEstimated(data.estimatedUrls ?? null);
      }
    } catch {
      setEstimated(null);
    } finally {
      setLoadingEst(false);
    }
  };

  const toggleQual = (id: string) => {
    setSelectedQuals(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSyllabusCode = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const filteredSyllabi = useMemo(() => {
    return syllabi.filter(s => {
      const matchesQual = selectedQuals.includes(s.level);
      const matchesSearch = s.label.toLowerCase().includes(syllabusSearch.toLowerCase()) || 
                           s.code.includes(syllabusSearch);
      return matchesQual && matchesSearch;
    });
  }, [syllabi, selectedQuals, syllabusSearch]);

  const formatLastRefresh = (iso?: string) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    // User wants "2:18 Am" format
    return `${datePart} ${timeStr}`;
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshResult('Connecting to Turso...');
    try {
      const res = await fetch(apiUrl('admin/refresh'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          qualificationLevels: selectedQuals.map(q => q.toLowerCase()),
          syllabusCodes: Array.from(selectedCodes)
        })
      });
      if (!res.ok) {
        setRefreshResult('Server error occurred');
        return;
      }
      const data = (await res.json()) as {
        stats?: {
          urlsChecked: number;
          qpAvailable: number;
          msAvailable: number;
          qpMissing: number;
          msMissing: number;
          errors: number;
          durationMs: number;
        };
        error?: string;
      };
      if (!res.ok) {
        setRefreshResult(data.error || 'Refresh failed');
        return;
      }
      const s = data.stats;
      if (s) {
        setRefreshResult(
          `Done in ${(s.durationMs / 1000).toFixed(1)}s — Checked ${s.urlsChecked} URLs. QP ok ${s.qpAvailable} / missing ${s.qpMissing}. MS ok ${s.msAvailable} / missing ${s.msMissing}. Network errors: ${s.errors}.`
        );
      }
      void fetchLastRefreshes();
    } catch {
      setRefreshResult('Network error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto border-2 border-[#141414] bg-white shadow-xl"
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-8 text-gray-400 hover:text-[#141414] transition-colors z-[10]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 pb-3">
              <h2 className="text-xl font-bold uppercase tracking-widest mb-4 border-b-2 border-[#141414] pb-2">
                Dashboard
              </h2>
            </div>

            <div className="p-8 pt-0 space-y-4">
              {/* SYNC SECTION */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Qualification</p>
                  <div className="grid grid-cols-2 gap-1">
                    {QUALIFICATION_LEVELS.slice(0, 2).map((q) => {
                      const on = selectedQuals.includes(q.id);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => toggleQual(q.id)}
                          className={`border px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide ${
                            on
                              ? 'border-[#141414] bg-[#141414] text-white'
                              : 'border-[#141414] border-opacity-40 bg-white text-[#141414] hover:bg-gray-50'
                          }`}
                        >
                          {q.label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleQual(QUALIFICATION_LEVELS[2].id)}
                    className={`w-full border px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide ${
                      selectedQuals.includes(QUALIFICATION_LEVELS[2].id)
                        ? 'border-[#141414] bg-[#141414] text-white'
                        : 'border-[#141414] border-opacity-40 bg-white text-[#141414] hover:bg-gray-50'
                    }`}
                  >
                    {QUALIFICATION_LEVELS[2].label}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Syllabus</p>
                  <input
                    type="search"
                    value={syllabusSearch}
                    onChange={(e) => setSyllabusSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full border border-[#141414] border-opacity-30 px-3 py-2 text-xs"
                  />
                  <div className="max-h-48 overflow-y-auto border border-[#141414] border-opacity-20">
                    {selectedQuals.length === 0 ? (
                      <p className="p-3 text-xs font-mono opacity-50">Select at least one qualification.</p>
                    ) : filteredSyllabi.length === 0 ? (
                      <p className="p-3 text-xs font-mono opacity-50">No syllabi match.</p>
                    ) : (
                      filteredSyllabi.map((s) => {
                        const on = selectedCodes.has(s.code);
                        const lastAt = lastRefreshByKey.get(`${s.level}:${s.code}`);
                        return (
                          <button
                            key={`${s.level}-${s.code}-${s.label}`}
                            type="button"
                            onClick={() => toggleSyllabusCode(s.code)}
                            className={`flex w-full flex-col gap-0.5 border-b border-[#141414] border-opacity-10 px-3 py-2 text-left text-xs sm:flex-row sm:items-center sm:justify-between ${
                              on ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-gray-50'
                            }`}
                          >
                            <span className="truncate pr-2">{s.label}</span>
                            <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] opacity-70">
                              <span>{s.code}</span>
                              <span 
                                className={on ? 'text-white/80' : lastAt ? 'text-blue-600 font-bold' : 'text-gray-500'} 
                                title="Last refresh for this subject"
                              >
                                {formatLastRefresh(lastAt)}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="text-[10px] font-mono opacity-50">
                      {loadingEst ? (
                        <span>Estimating…</span>
                      ) : estimated != null ? (
                        <span>
                          ~<strong>{estimated.toLocaleString()}</strong> URLs (QP + MS, {MIN_YEAR}–{MAX_YEAR}, all sessions ×
                          variants).
                        </span>
                      ) : (
                        <span>Estimate unavailable.</span>
                      )}
                    </p>

                    <button
                      type="button"
                      disabled={refreshing || selectedQuals.length === 0}
                      onClick={handleRefresh}
                      className="w-full border border-[#141414] bg-[#141414] py-3 text-xs font-bold uppercase tracking-wide text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {refreshing ? 'Refreshing…' : 'Refresh link status'}
                    </button>
                    {refreshResult ? (
                      <p className="text-[10px] font-mono leading-relaxed text-blue-600">{refreshResult}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* REQUESTS SECTION */}
              <div className="space-y-4 border-t border-[#141414] border-opacity-20 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">User Requests</p>
                
                <div className="grid grid-cols-2 gap-1 mb-2">
                  {(['ALL', 'BUG_FIX', 'NEW_FEATURE', 'ADD_SUBJECT'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setRequestFilter(f)}
                      className={`border px-3 py-1.5 text-center text-[9px] font-bold uppercase tracking-wide ${
                        requestFilter === f 
                          ? 'border-[#141414] bg-[#141414] text-white' 
                          : 'border-[#141414] border-opacity-40 bg-white text-[#141414] hover:bg-gray-50'
                      }`}
                    >
                      {f === 'ALL' ? 'All' : f.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <div className="space-y-3 max-h-[40vh] overflow-y-auto w-full">
                  {loadingReqs ? (
                    <div className="text-center font-mono text-[10px] opacity-40 py-8">Loading requests...</div>
                  ) : requests.length === 0 ? (
                    <div className="text-center font-mono text-[10px] opacity-40 py-8">No requests found.</div>
                  ) : (
                    requests
                      .filter(r => requestFilter === 'ALL' || r.type === requestFilter)
                      .map(r => (
                        <div key={r.id} className={`border p-3 space-y-2 transition-colors ${r.status === 'completed' ? 'bg-gray-50 opacity-60' : 'bg-white border-[#141414]'}`}>
                          <div className="flex items-center justify-between gap-2 border-b border-[#141414]/5 pb-1.5 mb-1.5">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 border ${
                                r.type === 'BUG_FIX' ? 'border-red-600 text-red-600' :
                                r.type === 'NEW_FEATURE' ? 'border-blue-600 text-blue-600' :
                                'border-green-600 text-green-600'
                              }`}>
                                {r.type.replace('_', ' ')}
                              </span>
                               <span className="text-[9px] font-mono text-[#141414] opacity-80 whitespace-nowrap">
                                {(() => {
                                  const d = new Date(r.created_at);
                                  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
                                  return `${datePart} ${timeStr}`;
                                })()}
                              </span>
                              <span className="text-[9px] font-mono text-[#141414] truncate lowercase">
                                <span className="opacity-60 uppercase mr-1">By:</span><span className="font-bold">{r.requester_name || 'unknown'}</span>
                              </span>
                            </div>

                            <div className="flex gap-1 shrink-0">
                              {r.status !== 'completed' ? (
                                <button
                                  onClick={() => updateRequestStatus(r.id, 'completed')}
                                  className="w-6 h-6 flex items-center justify-center border border-[#141414] bg-[#141414] text-white hover:opacity-80 transition-opacity"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => updateRequestStatus(r.id, 'pending')}
                                  className="w-6 h-6 flex items-center justify-center border border-[#141414] bg-white text-[#141414] hover:bg-gray-50 transition-colors"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => deleteRequest(r.id)}
                                className="w-6 h-6 flex items-center justify-center border border-red-600 text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <p className="text-[10px] font-mono leading-relaxed">{r.description}</p>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* DEBUG */}
              <div className="space-y-3 border-t border-[#141414] border-opacity-20 pt-4 pb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Debug</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Syllabus code (e.g. 0478)"
                    value={debugSyllabusCode}
                    onChange={e => setDebugSyllabusCode(e.target.value)}
                    className="flex-1 border border-[#141414] border-opacity-30 px-3 py-1.5 text-[11px] font-mono focus:outline-none focus:border-[#141414]"
                  />
                  <button
                    disabled={debugLoading || !debugSyllabusCode.trim() || !token}
                    onClick={async () => {
                      const code = debugSyllabusCode.trim();
                      setDebugLoading(true);
                      setDebugResult(null);
                      try {
                        // Find syllabus in catalog
                        const allSyllabi = Object.entries(SYLLABUS_BY_LEVEL).flatMap(([level, list]) =>
                          (list as {code:string;label:string}[]).map(s => ({ ...s, level }))
                        );
                        const found = allSyllabi.find(s => s.code === code);
                        if (!found) { setDebugResult(`Syllabus code "${code}" not found in catalog`); setDebugLoading(false); return; }

                        // Build Cambridge syllabus URL
                        const prefixMap: Record<string,string> = { igcse: 'cambridge-igcse-', olevel: 'cambridge-o-level-', alevel: 'cambridge-international-as-and-a-level-' };
                        const prefix = prefixMap[found.level] || '';
                        let slug = found.label.toLowerCase().replace(/\s*\([^)]*\)/g, m => m.replace(/[^a-z0-9]/g,'-')).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
                        if (slug.endsWith(`-${code}`)) slug = slug.slice(0, -code.length - 1);
                        const syllabusUrl = `https://www.cambridgeinternational.org/programmes-and-qualifications/${prefix}${slug}-${code}/`;

                        setDebugResult(`Fetching PDF from ${syllabusUrl}...`);

                        // Fetch + parse PDF
                        const proxyUrl = apiUrl(`proxy-pdf?url=${encodeURIComponent(syllabusUrl)}`);
                        const pdfjsLib = await import('pdfjs-dist');
                        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
                        const pdf = await pdfjsLib.getDocument({
                          url: proxyUrl,
                          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
                          cMapPacked: true,
                          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
                        }).promise;

                        let rawText = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                          const page = await pdf.getPage(i);
                          const content = await page.getTextContent();
                          rawText += content.items.map((item: any) => `${item.str}${item.hasEOL ? '\n' : ' '}`).join('') + '\n';
                        }

                        // Clean text
                        let cleaned = rawText;
                        [/©\s*UCLES[^\n\r]*/gi, /Cambridge (Assessment|International)[^\n\r]*/gi, /\[\s*Turn\s*over[^\]]*\]/gi, /\bTurn\s*over\b/gi, /\bBLANK\s+PAGE\b/gi, /\bPage\s+\d+\s*(of\s*\d+)?\b/gi, /\b[A-Z]{1,4}\d{4}\/\d{2}\b/gi].forEach(p => { cleaned = cleaned.replace(p, ''); });
                        cleaned = cleaned.replace(/READ THESE INSTRUCTIONS FIRST[\s\S]{0,2000}?(?=\n[A-Z1-9])/gi, '').replace(/Answer all questions\.?/gi, '').replace(/The number of marks is given in brackets\.?/gi, '').replace(/Write your (name|centre|candidate)[^\n]*/gi, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

                        // Trim to subject content section
                        let subjectContentIdx = cleaned.toLowerCase().indexOf('subject content', 8000);
                        if (subjectContentIdx === -1) subjectContentIdx = cleaned.search(/subject\s+content/i);
                        if (subjectContentIdx !== -1) {
                          const after = cleaned.substring(subjectContentIdx);
                          const endIdx = after.search(/details\s+of\s+the\s+assessment|glossary|appendix/i);
                          cleaned = endIdx !== -1 ? after.substring(0, endIdx) : after;
                        }

                        setDebugResult(`PDF parsed (${pdf.numPages} pages, ${cleaned.length} chars). Sending to AI...`);

                        // Call build-topics endpoint
                        const res = await fetch(apiUrl('admin/build-topics'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ syllabusCode: code, syllabusText: cleaned })
                        });
                        const data = await res.json();
                        if (data.ok) {
                          setDebugResult(`✓ Built ${data.topicCount} topics for ${code} and saved to DB.`);
                        } else {
                          setDebugResult(`Error: ${data.error}`);
                        }
                      } catch (e: any) {
                        setDebugResult(`Error: ${e?.message || e}`);
                      }
                      setDebugLoading(false);
                    }}
                    className="px-3 py-1.5 border border-[#141414] bg-[#141414] text-white text-[10px] font-bold uppercase hover:opacity-80 disabled:opacity-40 whitespace-nowrap"
                  >
                    {debugLoading ? '...' : 'Build topics_json'}
                  </button>
                </div>
                {debugResult && <p className="text-[10px] font-mono opacity-70 break-all">{debugResult}</p>}
              </div>
            </div>
          </motion.div>

        </div>
      )}
    </AnimatePresence>
  );
}
