import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  QUALIFICATION_LEVELS,
  SYLLABUS_BY_LEVEL,
  type QualificationLevel,
} from '../syllabusCatalog';
import { MAX_YEAR, MIN_YEAR } from '../lib/paperLinkConstants';
import { apiUrl } from '../lib/apiUrl';

type Props = {
  open: boolean;
  onClose: () => void;
  token: string | null;
  onToken: (token: string | null) => void;
};

export function AdminPanel({ open, onClose, token, onToken }: Props) {
  const [step, setStep] = useState<'password' | 'panel'>(token ? 'panel' : 'password');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [selectedQuals, setSelectedQuals] = useState<QualificationLevel[]>(['igcse']);
  const [syllabusSearch, setSyllabusSearch] = useState('');
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [estimated, setEstimated] = useState<number | null>(null);
  const [lastRefreshes, setLastRefreshes] = useState<
    Array<{ qualification_level: string; syllabus_code: string; last_refresh_at: string }>
  >([]);
  const [loadingEst, setLoadingEst] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (token) setStep('panel');
    else setStep('password');
  }, [open, token]);

  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [open]);

  const flatSyllabi = useMemo(() => {
    const rows: { code: string; label: string; level: QualificationLevel }[] = [];
    for (const q of selectedQuals) {
      const list = SYLLABUS_BY_LEVEL[q] ?? [];
      for (const item of list) {
        if (item.unavailable) continue;
        rows.push({ code: item.code, label: item.label, level: q });
      }
    }
    rows.sort((a, b) => a.label.localeCompare(b.label));
    return rows;
  }, [selectedQuals]);

  const filteredSyllabi = useMemo(() => {
    const q = syllabusSearch.trim().toLowerCase();
    if (!q) return flatSyllabi;
    return flatSyllabi.filter((s) => s.label.toLowerCase().includes(q));
  }, [flatSyllabi, syllabusSearch]);

  const lastRefreshByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of lastRefreshes) {
      m.set(`${r.qualification_level}:${r.syllabus_code}`, r.last_refresh_at);
    }
    return m;
  }, [lastRefreshes]);

  const formatLastRefresh = (iso: string | undefined) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const fetchLastRefreshes = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('admin/last-refreshes'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onToken(null);
        setStep('password');
        return;
      }
      const data = (await res.json()) as {
        rows?: Array<{ qualification_level: string; syllabus_code: string; last_refresh_at: string }>;
      };
      if (res.ok && data.rows) setLastRefreshes(data.rows);
    } catch {
      /* ignore */
    }
  }, [token, onToken]);

  const toggleQual = (id: QualificationLevel) => {
    setSelectedQuals((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length ? next : prev;
      }
      return [...prev, id];
    });
    setSelectedCodes(new Set());
  };

  const toggleSyllabusCode = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const runEstimate = useCallback(async () => {
    if (!token || selectedQuals.length === 0) {
      setEstimated(null);
      return;
    }
    setLoadingEst(true);
    try {
      const res = await fetch(apiUrl('admin/estimate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          qualificationLevels: selectedQuals,
          syllabusCodes: selectedCodes.size ? [...selectedCodes] : [],
        }),
      });
      if (res.status === 401) {
        onToken(null);
        setStep('password');
        setEstimated(null);
        return;
      }
      const data = (await res.json()) as { estimatedUrls?: number; error?: string };
      if (!res.ok) {
        setEstimated(null);
        return;
      }
      setEstimated(data.estimatedUrls ?? null);
    } catch {
      setEstimated(null);
    } finally {
      setLoadingEst(false);
    }
  }, [token, selectedQuals, selectedCodes, onToken]);

  useEffect(() => {
    if (!open || step !== 'panel' || !token) return;
    const t = window.setTimeout(runEstimate, 350);
    return () => window.clearTimeout(t);
  }, [open, step, token, runEstimate]);

  useEffect(() => {
    if (!open || step !== 'panel' || !token) return;
    void fetchLastRefreshes();
  }, [open, step, token, fetchLastRefreshes]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(apiUrl('admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        setLoginError(data.error || 'Login failed');
        return;
      }
      if (data.token) {
        onToken(data.token);
        setPassword('');
        setStep('panel');
      }
    } catch {
      setLoginError('Network error');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(apiUrl('admin/logout'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      /* ignore */
    }
    onToken(null);
    setStep('password');
  };

  const handleClearCatalog = async () => {
    if (!token) return;
    setClearMessage(null);
    if (
      !window.confirm(
        'Delete EVERY row in EVERY application table (full Turso wipe), then re-seed variant codes so refresh still works? This cannot be undone.'
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch(apiUrl('admin/clear-catalog'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onToken(null);
        setStep('password');
        return;
      }
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setClearMessage(data.error || 'Clear failed');
        return;
      }
      setClearMessage('Catalog cleared. Run a link refresh when ready.');
      void fetchLastRefreshes();
    } catch {
      setClearMessage('Network error');
    } finally {
      setClearing(false);
    }
  };

  const handleRefresh = async () => {
    if (!token || selectedQuals.length === 0) return;
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch(apiUrl('admin/refresh'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          qualificationLevels: selectedQuals,
          syllabusCodes: selectedCodes.size ? [...selectedCodes] : [],
        }),
      });
      if (res.status === 401) {
        onToken(null);
        setStep('password');
        setRefreshResult('Session expired. Sign in again.');
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Admin"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto border border-[#141414] bg-white shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1 text-[#141414] hover:opacity-70"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {step === 'password' ? (
          <form onSubmit={handleLogin} className="p-8 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[#141414]">Admin</h2>
            <p className="text-xs font-mono opacity-60">Enter the server admin password.</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#141414] px-3 py-2 text-sm font-mono"
              placeholder="Password"
              autoComplete="current-password"
            />
            {loginError ? (
              <p className="text-xs font-mono text-red-700">{loginError}</p>
            ) : null}
            <button
              type="submit"
              className="w-full border border-[#141414] bg-[#141414] py-2 text-xs font-bold uppercase tracking-wide text-white hover:opacity-90"
            >
              Continue
            </button>
          </form>
        ) : (
          <div className="p-8 space-y-6">
            <div className="flex items-start justify-between gap-2 pr-8">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#141414]">
                  Link refresh
                </h2>
                <p className="mt-1 text-[10px] font-mono opacity-50">
                  Years <strong>{MIN_YEAR}</strong>–<strong>{MAX_YEAR}</strong> · all sessions &amp; variants · writes to
                  Turso (shared catalog).
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="shrink-0 text-[10px] font-bold uppercase tracking-wide underline opacity-60 hover:opacity-100"
              >
                Log out
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Qualification</p>
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
              <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400">Syllabus</p>
              <p className="text-[10px] font-mono opacity-50">
                Tap to include only these subjects. None selected = all subjects for the qualifications above.
              </p>
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
                          <span className={on ? 'text-white/80' : 'text-gray-500'} title="Last refresh for this subject">
                            {formatLastRefresh(lastAt)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-2 border-t border-[#141414] border-opacity-20 pt-4">
              <p className="text-[10px] font-mono">
                {loadingEst ? (
                  <span className="opacity-50">Estimating…</span>
                ) : estimated != null ? (
                  <span>
                    ~<strong>{estimated.toLocaleString()}</strong> URLs (QP + MS, {MIN_YEAR}–{MAX_YEAR}, all sessions ×
                    variants).
                  </span>
                ) : (
                  <span className="opacity-50">Estimate unavailable.</span>
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
                <p className="text-[10px] font-mono leading-relaxed text-[#141414]">{refreshResult}</p>
              ) : null}
            </div>

            <div className="space-y-2 border-t border-red-900/20 pt-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-red-800">Danger zone</p>
              <p className="text-[10px] font-mono text-red-900/80">
                Empties all user tables in the DB (everything listed in sqlite_master except internal sqlite_/libsql
                tables), then restores <code className="font-mono">caie_variant</code> codes so link refresh keeps working.
              </p>
              <button
                type="button"
                disabled={clearing || !token}
                onClick={() => void handleClearCatalog()}
                className="w-full border border-red-800 bg-white py-2 text-[11px] font-bold uppercase tracking-wide text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {clearing ? 'Clearing…' : 'Delete all catalog data'}
              </button>
              {clearMessage ? (
                <p className="text-[10px] font-mono leading-relaxed text-[#141414]">{clearMessage}</p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
