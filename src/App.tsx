import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminPanel, { UserRequest } from './components/AdminPanel';
import { UserAuthModal } from './components/UserAuthModal';
import * as pdfjsLib from 'pdfjs-dist';
import {
  X, Search, ChevronRight, ChevronLeft, Menu, LogOut, CheckCircle2, History, AlertCircle, RefreshCw, Star, Info, LayoutGrid, List, Zap, Plus, Settings, Filter, Trash2, Edit2, Key, Download, Trash, User, ArrowRight, Share2, Clipboard, Globe, Send, Mail, Github, Twitter, Linkedin, ExternalLink, DownloadCloud, FileText, Check, Clock, PlusCircle, MinusCircle, HelpCircle, Save, Undo, Redo, Maximize2, Minimize2, MoreHorizontal, MoreVertical, Eye, EyeOff, Lock, LayoutDashboard, BookOpen, Bug, LogIn
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { UserHistoryModal } from './components/UserHistoryModal';
import { AlertModal } from './components/AlertModal';
import { RequestModal } from './components/RequestModal';
import { BugReportModal } from './components/BugReportModal';
import { ShopModal } from './components/ShopModal';
import { Question } from './types';
import { inferMsUrlFromQpUrl } from './lib/pdfParser';
import { formatMcqAnswer, parseMcqMarkSchemeFromText } from './lib/mcqMarkScheme';
import {
  countUnicodeLetters,
  isExamBlankPageFromPdfText,
  isLikelyRtlLayout,
  rowHasMeaningfulWords,
} from './lib/textScripts';
import {
  BASE_PAPERS_URL,
  QUALIFICATION_LEVELS,
  SYLLABUS_BY_LEVEL,
  getSyllabusLabelForCode,
  type QualificationLevel,
} from './syllabusCatalog';
import {
  MAX_YEAR,
  MIN_YEAR,
  SESSION_CODES as SESSION_OPTIONS,
  DEFAULT_VARIANTS_BEFORE_CATALOG,
  VARIANT_CODES as VARIANT_CANDIDATES,
} from './lib/paperLinkConstants';
import { apiUrl } from './lib/apiUrl';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const YEAR_OPTIONS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);

const ProfileModal = ({ isOpen, onClose, user, onLogout, onOpenHistory, onOpenAdmin, onAlert, onAlertUpgrade, onUpgrade, onOpenRequest, onOpenBugReport, onRefresh }: any) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (isOpen && onRefresh) {
      onRefresh();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[210] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white border-2 border-[#141414] p-6 w-full max-w-sm relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-[#141414] hover:opacity-70 focus:outline-none transition-opacity"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold uppercase tracking-wider mb-6 border-b-2 border-[#141414] pb-2">
              Your Profile
            </h2>

            {user ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <User className="w-6 h-6 text-[#141414]" />
                  <div>
                    <p className="text-sm font-bold">Username:</p>
                    <p className="text-base">{user.username}</p>
                  </div>
                </div>

                {/* Plan display */}
                <div className="border-2 border-[#141414] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Current Plan</span>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 ${
                      user.isAdmin ? 'bg-[#141414] text-white ring-2 ring-yellow-400 ring-offset-1' :
                      user.tier === 'pro' || user.tier === 'elite' ? 'bg-yellow-100 text-yellow-800' :
                      user.tier === 'starter'   ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {user.isAdmin ? 'ULTRA' : (user.tier === 'free' ? 'Free Trial' : user.tier.charAt(0).toUpperCase() + user.tier.slice(1))}
                    </span>
                  </div>

                  {!user.isAdmin && (
                    <div className="space-y-2 pt-2 border-t border-[#141414]/10">
                      {user.tier === 'free' && user.trialDaysLeft !== undefined && (
                        <div className="flex items-center justify-between">
                           <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Trial Ends In</span>
                           <span className="text-xs font-bold text-blue-600">{user.trialDaysLeft} DAYS</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-1.5">
                           <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Daily Reset In</span>
                           <button 
                             onClick={handleManualRefresh}
                             className={`p-1 hover:bg-gray-100 rounded-sm transition-all ${isRefreshing ? 'animate-spin' : ''}`}
                             title="Refresh info"
                           >
                             <RefreshCw className="w-2.5 h-2.5 opacity-40" />
                           </button>
                         </div>
                         <span className="text-xs font-mono font-bold">{formatTime(user.nextResetSeconds || 0)}</span>
                      </div>
                    </div>
                  )}

                  {!user.isAdmin && user.subscription && user.tier !== 'free' && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Renews</span>
                      <span className="text-[11px] font-mono">
                        {new Date(user.subscription.current_period_end * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  )}

                  {!user.isAdmin && user.tier !== 'pro' && user.tier !== 'elite' && (
                    <button
                      onClick={onUpgrade}
                      className="w-full mt-2 py-2.5 bg-blue-600 text-white font-bold uppercase text-[10px] tracking-widest hover:bg-[#141414] transition-colors shadow-[4px_4px_0px_rgba(37,99,235,0.2)]"
                    >
                      Upgrade Plan
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2">

                  <button
                    onClick={() => {
                      onClose(); onOpenHistory(); 
                    }}
                    className="flex items-center justify-center gap-2 border border-[#141414] px-4 py-2 hover:bg-gray-50 focus:outline-none transition-colors"
                    title="View History"
                  >
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      View History ({user.isAdmin ? 'UNLIMITED' : (user.tier === 'pro' || user.tier === 'elite' ? '50' : user.tier === 'starter' ? '5' : '3')})
                    </span>
                  </button>

                  <button
                    onClick={() => { 
                      if (user.tier === 'free') {
                        onAlertUpgrade("Feature requests and subject additions are available on Starter and Pro plans.");
                        return;
                      }
                      onClose(); onOpenRequest(); 
                    }}
                    className="flex items-center justify-center gap-2 border border-[#141414] px-4 py-2 hover:bg-gray-50 focus:outline-none transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Submit Request
                    </span>
                  </button>

                  <button
                    onClick={() => { onClose(); onOpenBugReport(); }}
                    className="flex items-center justify-center gap-2 border border-[#141414] px-4 py-2 hover:bg-gray-50 focus:outline-none transition-colors"
                  >
                    <Bug className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Report a Bug
                    </span>
                  </button>

                  {user.isAdmin && (
                    <button
                      onClick={() => { onClose(); onOpenAdmin(); }}
                      className="flex items-center justify-center gap-2 border border-[#141414] bg-gray-200 text-[#141414] px-4 py-2 hover:bg-gray-300 focus:outline-none transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase tracking-wider">Dashboard</span>
                    </button>
                  )}

                  <div className="pt-4 mt-2 border-t border-[#141414]/10">
                    <button
                      onClick={() => { onClose(); onLogout(); }}
                      className="w-full flex items-center justify-center gap-2 border border-[#141414] bg-white text-[#141414] px-4 py-2.5 hover:bg-[#141414] hover:text-white transition-all font-bold uppercase text-[10px] tracking-widest"
                    >
                      <LogOut className="w-4 h-4" />
                      LOGOUT
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-600">You are not logged in.</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const WelcomeModal = ({ isOpen, onClose, tokens }: { isOpen: boolean; onClose: () => void; tokens: number }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white border-4 border-[#141414] p-10 shadow-[8px_8px_0px_#141414] w-full max-w-sm relative text-center"
      >
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-blue-600 border-4 border-[#141414] flex items-center justify-center -rotate-6 shadow-[4px_4px_0px_#141414]">
             <Zap className="w-12 h-12 text-white" />
          </div>
        </div>
        <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2 leading-none">Congrats!</h2>
        <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-8 border-b-2 border-[#141414]/10 pb-4">
          Welcome to Paperra
        </p>
        <div className="bg-[#141414] text-white p-6 mb-8 transform rotate-1">
          <p className="text-[10px] font-bold uppercase tracking-[3px] opacity-70 mb-1">Account Credited</p>
          <p className="text-4xl font-black font-mono">{tokens} TOKENS</p>
        </div>
        <button
          onClick={onClose}
          className="w-full bg-blue-600 border-2 border-[#141414] text-white py-4 font-black uppercase text-sm tracking-widest hover:bg-[#141414] transition-all transform hover:-translate-y-1 active:translate-y-0"
        >
          Let's Go!
        </button>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showGuestWelcome, setShowGuestWelcome] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [mobileCompareViewer, setMobileCompareViewer] = useState<{
    title: string;
    questions: string[];
    markSchemes: string[];
    markSchemeText?: string;
  } | null>(null);
  const [showMobileMarkScheme, setShowMobileMarkScheme] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<'login' | 'signup'>('login');
  const [userHistoryOpen, setUserHistoryOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [authState, setAuthState] = useState<{ username: string; token: string; tokens: number; isAdmin?: boolean; tier: string; subscription: any | null; trialDaysLeft?: number; nextResetSeconds?: number } | null>(null);
  const [adminRequests, setAdminRequests] = useState<UserRequest[]>([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertCanUpgrade, setAlertCanUpgrade] = useState(false);
  const [alertType, setAlertType] = useState<'error' | 'info' | 'export'>('error');
  const [loadingRequests, setLoadingRequests] = useState(false);

  const user = authState;

  useEffect(() => {
    const anyModalOpen = 
      showPricingModal || previewImages || mobileCompareViewer || 
      showProfileModal || showShopModal || adminOpen || 
      showRequestModal || userModalOpen || userHistoryOpen || 
      showBugReportModal || showWelcomeModal;

    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [
    showPricingModal, previewImages, mobileCompareViewer, 
    showProfileModal, showShopModal, adminOpen, 
    showRequestModal, userModalOpen, userHistoryOpen, 
    showBugReportModal, showWelcomeModal
  ]);

  useEffect(() => {
    const token = localStorage.getItem('paperra_token');
    if (token) {
      setLoading(true);
      fetch(apiUrl('user/me'), {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(data => {
        if (data.username) {
          setAuthState({
            token,
            username: data.username,
            tokens: data.tokens,
            isAdmin: !!data.isAdmin,
            tier: data.tier || 'free',
            subscription: data.subscription || null,
            trialDaysLeft: data.trialDaysLeft,
            nextResetSeconds: data.nextResetSeconds
          });
        } else {
          setAuthState(null);
          localStorage.removeItem('paperra_token');
        }
      })
      .catch(() => setAuthState(null))
      .finally(() => setLoading(false));
    }
  }, []);

  const handleLoginSuccess = (data: { token: string; username: string; tokens: number; isAdmin?: boolean; tier: string; subscription?: any; trialDaysLeft?: number; nextResetSeconds?: number; isNewUser?: boolean }) => {
    setAuthState({ ...data, tier: data.tier || 'free', subscription: data.subscription || null, trialDaysLeft: data.trialDaysLeft || 0, nextResetSeconds: data.nextResetSeconds || 0 });
    localStorage.setItem('paperra_token', data.token);
    setUserModalOpen(false);
    if (data.isNewUser) {
      setTimeout(() => setShowWelcomeModal(true), 600);
    }
  };

  const refreshUserData = async () => {
    if (!user?.token) return;
    try {
      const res = await fetch(apiUrl('user/me'), {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (data.username) {
        setAuthState(prev => prev ? {
          ...prev,
          tokens: data.tokens,
          tier: data.tier,
          subscription: data.subscription,
          trialDaysLeft: data.trialDaysLeft,
          nextResetSeconds: data.nextResetSeconds
        } : null);
      }
    } catch (e) {
      console.error('Refresh failed', e);
    }
  };

  const handleLogout = () => {
    const token = user?.token;
    setAuthState(null);
    localStorage.removeItem('paperra_token');
    if (token) {
      fetch(apiUrl('user/logout'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
  };

  useEffect(() => {
    if (authState?.nextResetSeconds && authState.nextResetSeconds > 0) {
      const timer = setInterval(() => {
        setAuthState(prev => prev ? { ...prev, nextResetSeconds: Math.max(0, (prev.nextResetSeconds || 0) - 1) } : null);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [authState?.nextResetSeconds]);

  const [syllabusPdfUrl, setSyllabusPdfUrl] = useState('');
  const [topics, setTopics] = useState<{ unitId: string; title: string }[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsStatus, setTopicsStatus] = useState('');
  const [topicsError, setTopicsError] = useState('');
  const [questionTopicMappings, setQuestionTopicMappings] = useState<Record<string, string>>({});

  const fetchAdminRequests = async () => {
    if (!authState?.isAdmin) return;
    setLoadingRequests(true);
    try {
      const res = await fetch(apiUrl('admin/requests'), {
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      if (res.ok) {
        const data = await res.json() as { ok: boolean; requests: UserRequest[] };
        setAdminRequests(data.requests ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch requests', e);
    } finally {
      setLoadingRequests(false);
    }
  };

  const deleteAdminRequest = async (id: number) => {
    if (!authState?.token) return;
    try {
      const res = await fetch(apiUrl(`admin/requests/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authState.token}` }
      });
      if (res.ok) fetchAdminRequests();
    } catch (e) { console.error(e); }
  };

  const updateAdminRequestStatus = async (id: number, status: 'pending' | 'completed') => {
    if (!authState?.token) return;
    try {
      const res = await fetch(apiUrl('admin/requests/update-status'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.token}` 
        },
        body: JSON.stringify({ id, status })
      });
      if (res.ok) fetchAdminRequests();
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (adminOpen) fetchAdminRequests();
  }, [adminOpen]);


  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qualificationLevel, setQualificationLevel] = useState<QualificationLevel>('igcse');
  const [selectedSyllabusCode, setSelectedSyllabusCode] = useState('');
  const [cachedTopicCount, setCachedTopicCount] = useState(0);

  useEffect(() => {
    if (!selectedSyllabusCode) {
      setCachedTopicCount(0);
      return;
    }
    fetch(apiUrl(`topics/check-cache?syllabusCode=${selectedSyllabusCode}`))
      .then(r => r.json())
      .then(data => {
        if (data.cached && data.topicCount) {
          setCachedTopicCount(data.topicCount);
        } else {
          setCachedTopicCount(0);
        }
      })
      .catch(() => setCachedTopicCount(0));
  }, [selectedSyllabusCode]);
  const [syllabusSearch, setSyllabusSearch] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<string[]>(['W']);
  const [startYear, setStartYear] = useState(2025);
  const [endYear, setEndYear] = useState(2025);
  const [yearRange, setYearRange] = useState('2025');
  const [selectedVariants, setSelectedVariants] = useState<string[]>([
    ...DEFAULT_VARIANTS_BEFORE_CATALOG,
  ]);
  /** `undefined` = fetching; `null` = no Turso (show all subjects); `[]` = none refreshed; else codes from `syllabus_catalog_refresh` */
  const [refreshedSyllabusCodes, setRefreshedSyllabusCodes] = useState<string[] | null | undefined>(undefined);
  /** `undefined` = fetching; `null` = no Turso rows for syllabus (show full static list); `[]` = catalog has rows but no QP available; else only variants that worked in shared DB */
  const [catalogQpVariants, setCatalogQpVariants] = useState<string[] | null | undefined>(undefined);
  const getGenerateTokenCost = (count: number) => count;
  const [isFilteredLocally, setIsFilteredLocally] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'source' | 'filter' | 'export'>('source');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [showGuestFeatureLock, setShowGuestFeatureLock] = useState(false);
  const [guestTokens, setGuestTokens] = useState<number>(3);

  useEffect(() => {
    // If we're a guest, fetch the server-side IP tokens
    if (!authState) {
      fetch(apiUrl('user/guest-tokens'))
        .then(r => r.json())
        .then(data => {
          if (data.tokens !== undefined) {
             setGuestTokens(data.tokens);
             // Show welcome if it's their first time and they have 3 tokens
             if (data.tokens === 3 && !localStorage.getItem('paperra_guest_seen')) {
                setShowGuestWelcome(true);
                localStorage.setItem('paperra_guest_seen', 'true');
             }
          }
        })
        .catch(e => console.error("Guest token fetch failed", e));
    }
  }, [authState]);

  type TextItemBox = {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };

  type PageSnapshot = {
    pageNumber: number;
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    textItems: TextItemBox[];
    anchors: Array<{ number: number; label: string; y: number }>;
    msHeaderYs: number[];
    headerCutY?: number;
    footerY?: number;
    contentTopY: number;
    contentBottomY: number;
    contentCutoffY?: number;
    /** Arabic/Hebrew-heavy layout — question numbers may be in the right margin. */
    rtlLayout: boolean;
  };

  const cleanPdfTextForAI = (text: string) => {
    let cleaned = text;

    // Strip UCLES headers/footers and page artifacts
    cleaned = cleaned.replace(/©\s*UCLES[^\n\r]*/gi, "");
    cleaned = cleaned.replace(/Cambridge (Assessment|International)[^\n\r]*/gi, "");
    cleaned = cleaned.replace(/\[\s*Turn\s*over[^\]]*\]/gi, "");
    cleaned = cleaned.replace(/\bTurn\s*over\b/gi, "");
    cleaned = cleaned.replace(/\bBLANK\s+PAGE\b/gi, "");
    cleaned = cleaned.replace(/\bPage\s+\d+\s*(of\s*\d+)?\b/gi, "");
    cleaned = cleaned.replace(/\b\d{4}\/\d{2,4}\/[A-Z]\/[A-Z]+\/\d+\b/gi, ""); // document codes
    cleaned = cleaned.replace(/\b[A-Z]{1,4}\d{4}\/\d{2}\b/gi, ""); // paper codes like 0478/12

    // Strip front-matter boilerplate blocks
    cleaned = cleaned.replace(/READ THESE INSTRUCTIONS FIRST[\s\S]{0,2000}?(?=\n[A-Z1-9])/gi, "");
    cleaned = cleaned.replace(/Answer all questions\.?/gi, "");
    cleaned = cleaned.replace(/The number of marks is given in brackets\.?/gi, "");
    cleaned = cleaned.replace(/Write your (name|centre|candidate)[^\n]*/gi, "");
    cleaned = cleaned.replace(/You (must|should|may|will)[^\n]{0,120}/gi, "");
    cleaned = cleaned.replace(/This (document|booklet|paper)[^\n]{0,120}/gi, "");
    cleaned = cleaned.replace(/If you have been given[^\n]{0,120}/gi, "");
    cleaned = cleaned.replace(/Calculators (must|are|may)[^\n]{0,80}/gi, "");
    cleaned = cleaned.replace(/Electronic calculators (should|must|may)[^\n]{0,80}/gi, "");

    // Collapse filler phrases that add zero signal for topic classification
    const fillerPhrases = [
      /candidates should be able to:?/gi,
      /candidates will be able to:?/gi,
      /notes and guidance:?/gi,
      /learning objectives?:?/gi,
      /by the end of this (unit|topic|section)[^.\n]*/gi,
      /students (should|will|must|are expected to)[^.\n]*/gi,
      /it is (expected|assumed) that[^.\n]*/gi,
      /please note that[^.\n]*/gi,
      /for (the purposes of this syllabus|assessment purposes)[^.\n]*/gi,
      /the following (is|are) (required|expected|assumed)[^.\n]*/gi,
    ];
    fillerPhrases.forEach(p => { cleaned = cleaned.replace(p, ""); });

    // Remove lone numbers/letters that are just list markers (e.g. "1 " "a " "(i) ")
    cleaned = cleaned.replace(/^\s*(\d+|[a-z]|\([ivxlcdm]+\)|\([a-z]\))\s+/gim, "");

    // Collapse whitespace
    return cleaned
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const extractTextFromPdf = async (pdf: any, startPage: number) => {
    let text = '';
    for (let i = startPage; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
        .join('');
      text += `${pageText}\n`;
    }
    return text;
  };

  const looksTooSparse = (text: string) => {
    if (text.length < 800) return true;
    const letterCount = countUnicodeLetters(text);
    const slashCount = (text.match(/\//g) || []).length;
    return letterCount < 250 || slashCount > letterCount * 0.5;
  };

  const renderPdfPages = async (pdf: any, scale = 2, mode: 'qp' | 'ms' = 'qp'): Promise<PageSnapshot[]> => {
    const pages: PageSnapshot[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) continue;

      await page.render({ canvasContext: context, viewport }).promise;
      const textContent = await page.getTextContent();
      const textItems: TextItemBox[] = textContent.items.map((item: any) => {
        const tx = item.transform[4];
        const ty = item.transform[5];
        const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
        const h = Math.abs(item.height || 12);
        return {
          str: String(item.str || ''),
          x: Math.max(0, vx),
          y: Math.max(0, vy - h),
          width: Math.abs(item.width || 0),
          height: h,
        };
      });

      const pageTextForScripts = textItems.map((t) => t.str).join(' ');
      const rtlLayout = isLikelyRtlLayout(pageTextForScripts);

      const anchors: Array<{ number: number; label: string; y: number }> = [];
      textItems.forEach((item) => {
        const raw = item.str.trim();
        const msMatch = raw.match(/^(\d{1,2})(?:\((?:[a-z]|[ivxlcdm]{1,5})\)){0,3}[.):]?$/i);
        const qpMainMatch = raw.match(/^(\d{1,2})(?:\((?:[a-z]|[ivxlcdm]{1,5})\)){0,3}[.):]?$/i);
        const qpSubpartOnlyMatch = raw.match(/^(?:\((?:[a-z]|[ivxlcdm]{1,5})\)){1,3}[.):]?$/i);

        let number = NaN;
        if (msMatch?.[1]) number = Number(msMatch[1]);
        if (!msMatch && qpSubpartOnlyMatch) number = 0; // resolved later using previous main number

        if (!Number.isFinite(number)) return;
        if (number !== 0 && (number < 1 || number > 40)) return;
        if (mode === 'ms') {
          const leftMax = viewport.width * 0.18;
          const rightMin = viewport.width * 0.82;
          if (rtlLayout) {
            if (item.x > leftMax && item.x < rightMin) return;
          } else if (item.x > leftMax) return;
        } else {
          const qpLeftMax = viewport.width * (number === 0 ? 0.3 : 0.11);
          const qpRightMin = viewport.width * (number === 0 ? 0.7 : 0.89);
          if (rtlLayout) {
            if (item.x > qpLeftMax && item.x < qpRightMin) return;
          } else if (item.x > qpLeftMax) return;
        }
        if (item.y < viewport.height * 0.03 || item.y > viewport.height * 0.97) return;

        if (mode === 'ms') {
          const rowText = textItems
            .filter((t) => Math.abs(t.y - item.y) < Math.max(10, viewport.height * 0.01))
            .map((t) => t.str.trim())
            .join(' ')
            .toLowerCase();

          if (
            rowText.includes('cambridge igcse') ||
            rowText.includes('mark scheme') ||
            rowText.includes('published') ||
            /0478\/\d{2}/i.test(rowText) ||
            /march|june|november|may/i.test(rowText)
          ) return;

          if (!/[()]/.test(raw)) {
            if (rtlLayout) {
              if (item.x > viewport.width * 0.11 && item.x < viewport.width * 0.89) return;
            } else if (item.x > viewport.width * 0.11) return;
          }
        }

        if (mode === 'qp' && /^\d{1,2}$/.test(raw)) {
          const rowText = textItems
            .filter((t) => Math.abs(t.y - item.y) < Math.max(10, viewport.height * 0.01))
            .map((t) => t.str.trim())
            .join(' ')
            .toLowerCase();
          const rowWithoutThisNumber = rowText.replace(new RegExp(`\\b${raw}\\b`, 'g'), ' ');
          const hasMeaningfulWordsOnRow = rowHasMeaningfulWords(rowWithoutThisNumber);
          const looksLikeAnswerLine = /\.{3,}|_{3,}/.test(rowText);
          if (!hasMeaningfulWordsOnRow && looksLikeAnswerLine) {
            return;
          }
          // Ignore standalone numeric page markers near top when no subpart/question text shares the row.
          if (
            item.y < viewport.height * 0.2 &&
            !/\((?:[a-z]|[ivxlcdm]{1,5})\)/i.test(rowText) &&
            !/\p{L}/u.test(rowText.replace(/\d+/g, ''))
          ) {
            return;
          }
        }

        anchors.push({ number, label: raw, y: item.y });
      });

      const dedupedAnchors: Array<{ number: number; label: string; y: number }> = [];
      anchors
        .sort((a, b) => a.y - b.y)
        .forEach((a) => {
          const prev = dedupedAnchors[dedupedAnchors.length - 1];
          if (!prev || prev.label !== a.label || Math.abs(prev.y - a.y) > 18) {
            dedupedAnchors.push(a);
          }
        });

      const msHeaderYs = textItems
        .filter((item) => {
          const t = item.str.trim().toLowerCase();
          return t === 'question' && item.x <= viewport.width * 0.2;
        })
        .map((item) => item.y)
        .sort((a, b) => a - b);

      const rowBuckets = new Map<number, { texts: string[]; maxBottom: number; y: number }>();
      textItems.forEach((t) => {
        const rowStep = Math.max(6, viewport.height * 0.006);
        const key = Math.round(t.y / rowStep);
        const existing = rowBuckets.get(key);
        if (existing) {
          existing.texts.push(t.str.trim());
          existing.maxBottom = Math.max(existing.maxBottom, t.y + t.height);
          existing.y = Math.min(existing.y, t.y);
        } else {
          rowBuckets.set(key, {
            texts: [t.str.trim()],
            maxBottom: t.y + t.height,
            y: t.y,
          });
        }
      });

      const topMetaRows = [...rowBuckets.values()]
        .map((row) => ({
          ...row,
          text: row.texts.join(' ').replace(/\s+/g, ' ').trim(),
        }))
        .filter((row) => {
          if (row.y > viewport.height * 0.14) return false;
          const lower = row.text.toLowerCase();
          const hasBarcodeId = /\*\s*\d{6,}\s*\*/.test(row.text);
          const hasDFD = /\bdfd\b/i.test(row.text);
          const hasMarginText = /do not write in this margin/i.test(lower);
          return hasBarcodeId || hasDFD || hasMarginText;
        })
        .sort((a, b) => a.y - b.y);
      const headerCutY = topMetaRows.length
        ? Math.min(
            viewport.height * 0.35,
            Math.max(...topMetaRows.map((r) => r.maxBottom)) + Math.max(8, viewport.height * 0.01)
          )
        : undefined;

      const isFooterString = (t: string) => {
        return (
          /©\s*UCLES/i.test(t) ||
          /Page\s+\d+\s+of\s+\d+/i.test(t) ||
          /^\d{4}\/\d{2}\/[A-Z]\/[A-Z]\/\d{2}$/i.test(t) ||
          /\[?\s*Turn\s*over\s*\]?/i.test(t) ||
          /Permission\s+to\s+reproduce\s+items/i.test(t) ||
          /Cambridge\s+Assessment\s+International\s+Education/i.test(t) ||
          /copyright\s+acknowledgements/i.test(t) ||
          /University\s+of\s+Cambridge\s+Local\s+Examinations\s+Syndicate/i.test(t)
        );
      };

      const footerCandidates = textItems
        .filter((item) => {
          const t = item.str.trim();
          return (
            isFooterString(t) ||
            (/^\d{1,2}$/.test(t) && item.y > viewport.height * 0.88 && item.x > viewport.width * 0.35 && item.x < viewport.width * 0.65)
          );
        })
        .map((item) => item.y)
        .filter((y) => y > viewport.height * 0.65)
        .sort((a, b) => a - b);
      const footerY = footerCandidates.length ? footerCandidates[0] : undefined;

      const allRows = [...rowBuckets.values()].map((row) => ({
        ...row,
        text: row.texts.join(' '),
      }));

      const endOfContentMarkers = allRows
        .filter((row) => {
          const t = row.text;
          const clean = t.replace(/\s+/g, '');
          if (/BLANKPAGE/i.test(clean)) return true;

          // Identify barcode-like text elements mathematically
          if (clean.length >= 8 && new Set(clean.split('')).size <= 4) return true;
          if (clean.length >= 5 && /^[█▇▆▅▄▃▂\-\|I_\.,\x00-\x08\x0B-\x1F]+$/i.test(clean)) return true;
          if (/[\x01-\x08]/.test(clean)) return true;
          if (/^\*\s*\d+\s*\*$/.test(t.trim())) return true;

          return false;
        })
        .map((row) => row.y)
        .sort((a, b) => a - b);

      const contentCutoffY = endOfContentMarkers.length ? endOfContentMarkers[0] : undefined;

      const contentItems = textItems.filter((item) => {
        const t = item.str.trim();
        if (!t) return false;
        if (headerCutY !== undefined && item.y < headerCutY) return false;
        if (footerY !== undefined && item.y >= Math.max(footerY - (viewport.height * 0.01), viewport.height * 0.65)) return false;
        if (contentCutoffY !== undefined && item.y >= contentCutoffY - 2) return false;
        if (isFooterString(t)) return false;
        // Ignore lone page number near top/bottom center.
        if (/^\d{1,2}$/.test(t) && item.x > viewport.width * 0.35 && item.x < viewport.width * 0.65 && (item.y < viewport.height * 0.15 || item.y > viewport.height * 0.85)) {
          return false;
        }
        // Ignore lone page number near bottom center.
        if (/^\d{1,2}$/.test(t) && item.y > viewport.height * 0.85 && item.x > viewport.width * 0.35 && item.x < viewport.width * 0.65) {
          return false;
        }
        return true;
      });
      const contentTopY = contentItems.length
        ? Math.max(
            headerCutY ?? 0,
            Math.max(0, Math.min(...contentItems.map((item) => item.y)) - Math.max(6, viewport.height * 0.008))
          )
        : viewport.height * 0.08;
      let contentBottomY = contentItems.length
        ? Math.min(
            viewport.height,
            Math.max(...contentItems.map((item) => item.y + item.height)) + Math.max(8, viewport.height * 0.01)
          )
        : viewport.height * 0.9;

      if (contentCutoffY !== undefined) {
        contentBottomY = Math.min(contentBottomY, contentCutoffY - Math.max(12, viewport.height * 0.015));
      }
      if (footerY !== undefined) {
        contentBottomY = Math.min(contentBottomY, footerY - Math.max(12, viewport.height * 0.015));
      }

      pages.push({
        pageNumber: i,
        canvas,
        width: canvas.width,
        height: canvas.height,
        textItems,
        anchors: dedupedAnchors,
        msHeaderYs,
        headerCutY,
        footerY,
        contentTopY,
        contentBottomY,
        rtlLayout,
      });
    }

    return pages;
  };

  const cropCanvasRange = (source: HTMLCanvasElement, yStart: number, yEnd: number) => {
    const top = Math.max(0, Math.floor(yStart));
    const bottom = Math.min(source.height, Math.ceil(yEnd));
    const height = Math.max(1, bottom - top);
    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(source, 0, top, source.width, height, 0, 0, out.width, out.height);
    }
    return out;
  };

  const stitchCanvasSections = (sections: HTMLCanvasElement[]) => {
    const width = Math.max(...sections.map((s) => s.width));
    const height = sections.reduce((sum, s) => sum + s.height, 0);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.max(1, height);
    const ctx = out.getContext('2d');
    if (!ctx) return out;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    sections.forEach((section) => {
      ctx.drawImage(section, 0, y);
      y += section.height;
    });
    return out;
  };

  const trimCanvasBottomWhitespace = (source: HTMLCanvasElement) => {
    const ctx = source.getContext('2d');
    if (!ctx) return source;
    const { width, height } = source;
    const data = ctx.getImageData(0, 0, width, height).data;

    const rowHasInk = (y: number) => {
      let darkPixels = 0;
      const startX = Math.floor(width * 0.08);
      const endX = Math.ceil(width * 0.92);
      for (let x = startX; x < endX; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r < 242 || g < 242 || b < 242) darkPixels++;
      }
      return darkPixels > Math.max(2, Math.floor((endX - startX) * 0.0025));
    };

    let y = height - 1;
    while (y > 12 && !rowHasInk(y)) y--;
    const trimmedHeight = Math.max(14, Math.min(height, y + 10)); // keep slight bottom buffer
    if (trimmedHeight >= height) return source;

    const out = document.createElement('canvas');
    out.width = width;
    out.height = trimmedHeight;
    const outCtx = out.getContext('2d');
    if (!outCtx) return source;
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(source, 0, 0, width, trimmedHeight, 0, 0, out.width, out.height);
    return out;
  };

  const trimCanvasTopArtifacts = (source: HTMLCanvasElement) => {
    const ctx = source.getContext('2d');
    if (!ctx) return source;
    const { width, height } = source;
    const data = ctx.getImageData(0, 0, width, height).data;

    const darkCount = (y: number) => {
      let count = 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r < 240 || g < 240 || b < 240) count++;
      }
      return count;
    };

    const scanLimit = Math.min(height - 1, Math.floor(height * 0.28));
    let firstStrong = -1;
    const strongThreshold = Math.max(24, Math.floor(width * 0.014));

    for (let y = 0; y <= scanLimit; y++) {
      if (darkCount(y) >= strongThreshold) {
        firstStrong = y;
        break;
      }
    }

    if (firstStrong <= 0) return source;
    const top = Math.max(0, firstStrong - 3);
    if (top < 4) return source;

    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.max(12, height - top);
    const outCtx = out.getContext('2d');
    if (!outCtx) return source;
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(source, 0, top, width, out.height, 0, 0, out.width, out.height);
    return out;
  };

  const trimCanvasHorizontalWhitespace = (source: HTMLCanvasElement) => {
    const ctx = source.getContext('2d');
    if (!ctx) return source;
    const { width, height } = source;
    const data = ctx.getImageData(0, 0, width, height).data;

    const columnHasInk = (x: number) => {
      let darkPixels = 0;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r < 242 || g < 242 || b < 242) darkPixels++;
      }
      return darkPixels > Math.max(2, Math.floor(height * 0.01));
    };

    let left = 0;
    while (left < width - 2 && !columnHasInk(left)) left++;

    let right = width - 1;
    while (right > left + 1 && !columnHasInk(right)) right--;

    const pad = Math.max(4, Math.floor(width * 0.01));
    const cropLeft = Math.max(0, left - pad);
    const cropRight = Math.min(width - 1, right + pad);
    const cropWidth = Math.max(8, cropRight - cropLeft + 1);

    if (cropLeft <= 1 && cropRight >= width - 2) return source;

    const out = document.createElement('canvas');
    out.width = cropWidth;
    out.height = height;
    const outCtx = out.getContext('2d');
    if (!outCtx) return source;
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(source, cropLeft, 0, cropWidth, height, 0, 0, cropWidth, height);
    return out;
  };

  const cropCanvasHorizontalRange = (source: HTMLCanvasElement, xStart: number, xEnd: number) => {
    const left = Math.max(0, Math.floor(xStart));
    const right = Math.min(source.width, Math.ceil(xEnd));
    const width = Math.max(8, right - left);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    if (!ctx) return source;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, left, 0, width, source.height, 0, 0, width, source.height);
    return out;
  };

  const canvasRegionHasInk = (
    source: HTMLCanvasElement,
    yStart: number,
    yEnd: number,
    xStart = 0,
    xEnd = source.width
  ) => {
    const top = Math.max(0, Math.floor(yStart));
    const bottom = Math.min(source.height, Math.ceil(yEnd));
    const left = Math.max(0, Math.floor(xStart));
    const right = Math.min(source.width, Math.ceil(xEnd));
    const w = Math.max(1, right - left);
    const h = Math.max(1, bottom - top);
    if (h < 4 || w < 4) return false;

    const ctx = source.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(left, top, w, h).data;

    let dark = 0;
    const step = 2; // sample every 2nd pixel for speed
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r < 235 || g < 235 || b < 235) dark++;
      }
    }

    const sampled = Math.ceil(h / step) * Math.ceil(w / step);
    return dark > Math.max(12, Math.floor(sampled * 0.0025));
  };

  const cropMsMarksColumn = (source: HTMLCanvasElement) => {
    const keepRatio = 0.93; // Drop right-side marks column in MS tables.
    const newWidth = Math.max(16, Math.floor(source.width * keepRatio));
    if (newWidth >= source.width - 2) return source;
    const out = document.createElement('canvas');
    out.width = newWidth;
    out.height = source.height;
    const ctx = out.getContext('2d');
    if (!ctx) return source;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0, newWidth, source.height, 0, 0, newWidth, source.height);
    return out;
  };

  const stitchDataUrlImages = async (images: string[]) => {
    const loaded = await Promise.all(
      images.map(
        (src) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load stitched segment image'));
            img.src = src;
          })
      )
    );
    const width = Math.max(...loaded.map((img) => img.width));
    const height = loaded.reduce((sum, img) => sum + img.height, 0);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.max(1, height);
    const ctx = out.getContext('2d');
    if (!ctx) return images[0];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    let y = 0;
    loaded.forEach((img) => {
      ctx.drawImage(img, 0, y);
      y += img.height;
    });
    return out.toDataURL('image/png');
  };

  const extractQuestionImageSegments = (pages: PageSnapshot[], mode: 'qp' | 'ms' = 'qp') => {
    const allAnchors = pages.flatMap((page, pageIndex) =>
      page.anchors.map((anchor) => ({ ...anchor, pageIndex }))
    );
    allAnchors.sort((a, b) => (a.pageIndex - b.pageIndex) || (a.y - b.y));

    const resolvedAnchors = (() => {
      let currentMain = 0;
      let currentLetter = '';
      const resolved: Array<{ number: number; label: string; y: number; pageIndex: number }> = [];
      allAnchors.forEach((a) => {
        if (a.number > 0) {
          currentMain = a.number;
          currentLetter = '';
          resolved.push(a);
          return;
        }
        if (currentMain > 0) {
          const rawLab = a.label.toLowerCase();
          // Detect if it's a letter (a-z) but not a roman numeral, or if it's the first few letters which are unambiguously non-roman (like a, b, e, f, h, etc.)
          // Actually, (i), (v), (x) are roman. (a), (b), (c), (d), (e), (f), (g), (h), (j) etc are letters.
          // In Cambridge, first tier is (a)-(z), second tier is (i)-(x).
          if (/^\([a-z]\)$/.test(rawLab) && !/^\([ivx]+\)$/.test(rawLab)) {
            currentLetter = a.label;
            resolved.push({ ...a, number: currentMain, label: `${currentMain}${currentLetter}` });
          } else if (/^\([ivx]+\)$/.test(rawLab)) {
            resolved.push({ ...a, number: currentMain, label: `${currentMain}${currentLetter}${a.label}` });
          } else {
            // fallback (like (a)(i) combined)
            const match = rawLab.match(/^(\([a-z]\))(\([ivx]+\))$/);
            if (match) {
               currentLetter = match[1];
            }
            resolved.push({ ...a, number: currentMain, label: `${currentMain}${a.label}` });
          }
        }
      });
      return resolved;
    })();

    const filteredAnchorsRaw = resolvedAnchors.filter((a, idx) => {
      if (idx === 0) return true;
      const prev = resolvedAnchors[idx - 1];
      if (a.number <= 0) return false;
      return !(a.label === prev.label && a.pageIndex === prev.pageIndex && Math.abs(a.y - prev.y) < 20);
    });

    const filteredAnchors: typeof filteredAnchorsRaw = [];
    for (let i = 0; i < filteredAnchorsRaw.length; i++) {
      const a = filteredAnchorsRaw[i];
      const nxt = filteredAnchorsRaw[i + 1];

      const aStripped = a.label.replace(String(a.number), '').toLowerCase();
      const nxtStripped = nxt ? nxt.label.replace(String(nxt.number), '').toLowerCase() : '';

      const isBareToA = aStripped === '' && nxtStripped.includes('(a)');
      const isLetterToI = /^\([a-z]\)$/.test(aStripped) && nxtStripped === `${aStripped}(i)`;

      // Absorb context paragraphs into the first immediate subpart (e.g. `2` -> `(a)`, or `(b)` -> `(i)`)
      if (nxt && nxt.number === a.number && (isBareToA || isLetterToI)) {
        // Expand the starting coordinate of the subpart to physically capture the context text
        nxt.pageIndex = a.pageIndex;
        nxt.y = a.y;
        continue;
      }
      filteredAnchors.push(a);
    }

    const segments: Array<{ number: number; label: string; image: string; text: string; marks: number }> = [];

    for (let i = 0; i < filteredAnchors.length; i++) {
      const start = filteredAnchors[i];
      const end = filteredAnchors[i + 1];
      const sections: HTMLCanvasElement[] = [];
      const textChunks: string[] = [];

      for (let p = start.pageIndex; p <= (end ? end.pageIndex : pages.length - 1); p++) {
        const page = pages[p];
        const isSubpartAnchor = /(?:\((?:[a-z]|[ivxlcdm]{1,5})\)){1,3}/i.test(start.label) || /^(?:\((?:[a-z]|[ivxlcdm]{1,5})\)){1,3}/i.test(start.label);
        let fromY = p === start.pageIndex
          ? Math.max(
              0,
              start.y - (isSubpartAnchor ? Math.max(6, page.height * 0.008) : Math.max(20, page.height * 0.03))
            )
          : page.contentTopY;
        let toY = end
          ? (p === end.pageIndex ? Math.max(0, end.y - Math.max(8, page.height * 0.01)) : page.height)
          : page.height;

        // Hard safety boundary: never extend past a detected barcode or BLANK PAGE marker.
        if (page.contentCutoffY !== undefined) {
          toY = Math.min(toY, Math.max(0, page.contentCutoffY - Math.max(12, page.height * 0.015)));
        }

        // Keep multi-page stitching tight but don't cut diagram-only regions.
        if (toY > page.contentBottomY) {
          const hasInkBelowTextBottom = canvasRegionHasInk(
            page.canvas,
            page.contentBottomY,
            Math.min(toY, page.height),
            page.width * 0.1,
            page.width * 0.9
          );
          if (!hasInkBelowTextBottom) {
            toY = Math.min(toY, page.contentBottomY);
          }
        }

        if (page.footerY !== undefined) {
          toY = Math.min(toY, Math.max(0, page.footerY - Math.max(10, page.height * 0.012)));
        }

        if (mode === 'ms') {
          const nextHeaderY = page.msHeaderYs.find((y) => y > fromY + Math.max(30, page.height * 0.04));
          if (nextHeaderY !== undefined) {
            toY = Math.min(toY, Math.max(0, nextHeaderY - Math.max(10, page.height * 0.012)));
          }

          // Detect footer/meta by analyzing full row text (items are often tokenized).
          const rowBuckets = new Map<number, string[]>();
          page.textItems.forEach((t) => {
            const key = Math.round(t.y / Math.max(6, page.height * 0.006));
            const arr = rowBuckets.get(key) || [];
            arr.push(t.str.trim());
            rowBuckets.set(key, arr);
          });

          const msMetaRowYs = [...rowBuckets.entries()]
            .map(([k, parts]) => ({
              y: k * Math.max(6, page.height * 0.006),
              row: parts.join(' ').toLowerCase(),
            }))
            .filter(({ y, row }) => {
              if (y <= fromY + Math.max(18, page.height * 0.02)) return false;
              return (
                /0478\/\d{2}/i.test(row) ||
                /cambridge/i.test(row) ||
                /igcse/i.test(row) ||
                /mark\s*scheme/i.test(row) ||
                /published/i.test(row) ||
                /march|june|november|may/i.test(row)
              );
            })
            .map(({ y }) => y)
            .sort((a, b) => a - b);

          if (msMetaRowYs.length) {
            const metaCutY = msMetaRowYs[0] - Math.max(10, page.height * 0.012);
            toY = Math.min(toY, Math.max(0, metaCutY));
          }

          // Hard safety cutoff: never include the very bottom footer band in MS crops.
          const hardFooterCutY = page.height * 0.885;
          toY = Math.min(toY, hardFooterCutY);

        }

        // For QP, avoid dragging the last segment into bottom-page notes/copyright.
        if (mode === 'qp') {
          // Use detected per-page top meta boundary (barcode/header rows) when available.
          if (page.headerCutY !== undefined) {
            fromY = Math.max(fromY, page.headerCutY);
          }

          // If a centered standalone page number sits above this question anchor,
          // start below it so it never appears at the top of the segment.
          if (p === start.pageIndex) {
            const topPageNumber = page.textItems.find((t) => {
              const raw = t.str.trim();
              return (
                /^\d{1,2}$/.test(raw) &&
                t.x > page.width * 0.42 &&
                t.x < page.width * 0.58 &&
                t.y < start.y - Math.max(6, page.height * 0.008) &&
                (t.y + t.height) > (fromY - Math.max(2, page.height * 0.002))
              );
            });
            if (topPageNumber) {
              fromY = Math.max(
                fromY,
                topPageNumber.y + topPageNumber.height + Math.max(8, page.height * 0.01)
              );
            }
          }

          const ys = page.textItems
            .filter((t) => t.y >= fromY && t.y <= toY)
            .map((t) => t.y)
            .sort((a, b) => a - b);
          if (ys.length > 8) {
            let cutY: number | null = null;
            for (let j = 1; j < ys.length; j++) {
              const gap = ys[j] - ys[j - 1];
              if (gap > page.height * 0.11 && ys[j] > fromY + page.height * 0.18) {
                cutY = ys[j] - Math.max(10, page.height * 0.012);
                break;
              }
            }
            if (cutY !== null) {
              const hasInkAfterCut = canvasRegionHasInk(
                page.canvas,
                cutY,
                Math.min(toY, page.height),
                page.width * 0.1,
                page.width * 0.9
              );
              if (!hasInkAfterCut) {
                toY = Math.min(toY, cutY);
              }
            }
          }
        }
        if (toY - fromY < 8) continue;

        const pageText = page.textItems
          .filter((t) => t.y >= fromY && t.y <= toY)
          .map((t) => t.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const pageTextLower = pageText.toLowerCase();
        const msMetaOnlySection =
          mode === 'ms' &&
          (toY - fromY) < page.height * 0.06 &&
          (
            /0478\/\d{2}/i.test(pageText) ||
            pageTextLower.includes('cambridge') ||
            pageTextLower.includes('igcse') ||
            pageTextLower.includes('mark scheme') ||
            pageTextLower.includes('published') ||
            pageTextLower.includes('march') ||
            pageTextLower.includes('june') ||
            pageTextLower.includes('november')
          );

        if (msMetaOnlySection) {
          continue;
        }

        let section = trimCanvasBottomWhitespace(cropCanvasRange(page.canvas, fromY, toY));
        if (mode === 'qp') {
          // Drop page side rails before auto-trim; RTL papers often need a slightly wider keep band.
          const side = page.rtlLayout ? 0.02 : 0.045;
          section = cropCanvasHorizontalRange(
            section,
            section.width * side,
            section.width * (1 - side)
          );
        }
        if (mode === 'qp' && p === start.pageIndex) {
          section = trimCanvasTopArtifacts(section);
        }
        section = trimCanvasHorizontalWhitespace(section);
        if (mode === 'ms') {
          section = cropMsMarksColumn(section);
        }
        sections.push(section);
        if (pageText) textChunks.push(pageText);
      }

      if (!sections.length) continue;
      const stitched = stitchCanvasSections(sections);
      const combinedText = textChunks.join('\n').trim();
      const marks = Number(combinedText.match(/\[(\d{1,2})\]/)?.[1] || 1);

      if (mode === 'qp') {
        const compact = combinedText.replace(/\s+/g, ' ').trim();
        const hasAlpha = /\p{L}/u.test(compact);
        const isNumericOnly = /^\d{1,2}$/.test(compact);
        const isTiny = stitched.height < 90;
        if (isNumericOnly || (!hasAlpha && isTiny && compact.length < 24)) {
          continue;
        }
      }

      segments.push({
        number: start.number,
        label: start.label,
        image: stitched.toDataURL('image/png'),
        text: combinedText,
        marks: Number.isFinite(marks) ? marks : 1,
      });
    }

    return segments;
  };

  const filterExamBlankPages = (pages: PageSnapshot[], label: string) => {
    const skipped: number[] = [];
    const kept = pages.filter((p) => {
      const text = p.textItems.map((t) => t.str).join(' ');
      if (isExamBlankPageFromPdfText(text)) {
        skipped.push(p.pageNumber);
        return false;
      }
      return true;
    });
    if (skipped.length) {
      console.log('[SKIP_BLANK_PAGE]', { label, skippedPageNumbers: skipped, keptPages: kept.length });
    }
    return kept;
  };

  const trimMsPrefacePages = (pages: PageSnapshot[]) => {
    // Start MS segmentation from the first page that actually looks like
    // the question/answer/marks table with at least one valid anchor.
    const startIndex = pages.findIndex((page) => {
      const hasTableHeader = page.msHeaderYs.length > 0;
      if (!hasTableHeader) return false;
      const firstHeaderY = page.msHeaderYs[0];
      const anchorsBelowHeader = page.anchors.filter((a) => a.y > firstHeaderY + Math.max(18, page.height * 0.02));
      return anchorsBelowHeader.length > 0;
    });

    if (startIndex <= 0) return pages;
    const trimmed = pages.slice(startIndex);
    console.log("[MS_PREFACE_TRIM]", {
      originalPages: pages.length,
      skippedPages: startIndex,
      usedPages: trimmed.length,
    });
    return trimmed;
  };

  const processPDF = async (
    arrayBuffer: ArrayBuffer,
    fileName: string,
    sourceUrl?: string,
    options?: { suppressStatus?: boolean }
  ) => {
    const isMS = fileName.toLowerCase().includes('_ms_') || fileName.toLowerCase().includes('mark scheme');
    const showStatus = (msg: string) => {
      if (!options?.suppressStatus) setStatus(msg);
    };

    showStatus(`Processing ${fileName}`);
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    // Cost optimization default: skip first page. Reliability fallback: retry with full document.
    let fullText = cleanPdfTextForAI(await extractTextFromPdf(pdf, Math.min(2, pdf.numPages)));
    if (looksTooSparse(fullText)) {
      console.warn("[PDF_TEXT_SPARSE_AFTER_SKIP_FIRST_PAGE]", {
        fileName,
        chars: fullText.length,
        preview: fullText.slice(0, 300),
      });
      fullText = cleanPdfTextForAI(await extractTextFromPdf(pdf, 1));
      console.warn("[PDF_TEXT_FALLBACK_FULL_DOC]", {
        fileName,
        chars: fullText.length,
        preview: fullText.slice(0, 300),
      });
    }

    if (isMS) {
      const msFullText = cleanPdfTextForAI(await extractTextFromPdf(pdf, 1));
      const mcqAnswers = parseMcqMarkSchemeFromText(msFullText);
      if (mcqAnswers && mcqAnswers.size >= 5) {
        showStatus(`Processing ${fileName}`);
        setQuestions((prev) =>
          prev.map((q) => {
            const letter = mcqAnswers.get(q.number);
            if (letter === undefined) return q;
            return {
              ...q,
              markingScheme: formatMcqAnswer(letter),
              markingSchemeImages: undefined,
              markingSchemeImage: undefined,
            };
          })
        );
        console.log('[MS_MCQ_TEXT]', { fileName, sourceUrl, parsed: mcqAnswers.size });
        return [];
      }

      showStatus(`Processing ${fileName}`);
      const msPagesAll = await renderPdfPages(pdf, 2, 'ms');
      const msPages = trimMsPrefacePages(filterExamBlankPages(msPagesAll, fileName));
      const msSegments = extractQuestionImageSegments(msPages, 'ms');
      const msGrouped = new Map<string, string[]>();
      msSegments.forEach((segment) => {
        const key = segment.label || String(segment.number);
        const arr = msGrouped.get(key) || [];
        arr.push(segment.image);
        msGrouped.set(key, arr);

        // Also push it to a global fallback array for the entire number, so if MS parser fails to find a subpart, we don't return totally blank.
        const numStr = String(segment.number);
        if (key !== numStr) {
           const fall = msGrouped.get(numStr) || [];
           fall.push(segment.image);
           msGrouped.set(numStr, fall);
        }
      });

      const msByQuestion = new Map<string, string[]>();
      for (const [key, images] of msGrouped.entries()) {
        msByQuestion.set(key, images);
      }

      // Derive the expected QP paperId from this MS filename (e.g. "0478_w25_ms_11.pdf" -> "0478_w25_qp_11.pdf")
      const expectedQpId = fileName.replace(/_ms_/i, '_qp_').replace(/\.pdf$/i, '').toLowerCase();

      // Pre-compute whether any sub-part segments were detected for each question number
      const numbersWithSubParts = new Set<number>();
      for (const key of msByQuestion.keys()) {
        if (key.includes('(')) {
          const num = parseInt(key);
          if (!isNaN(num)) numbersWithSubParts.add(num);
        }
      }

      setQuestions(prev => prev.map(q => {
        // Only assign MS images to questions from the matching QP paper
        if (!q.paperId || q.paperId.replace(/_qp_/i, '_qp_').replace(/\.pdf$/i, '').toLowerCase() !== expectedQpId) return q;

        let msImages = undefined;
        if (q.label && msByQuestion.has(q.label)) {
          // Exact sub-part match
          msImages = msByQuestion.get(q.label);
        } else if (!q.label) {
          // Top-level question with no label — use parent fallback
          msImages = msByQuestion.get(q.number.toString());
        } else {
          // Has a label but wasn't found — only fall back to parent if NO sub-parts were detected
          // for this question (avoids showing unrelated sub-parts like showing 1(a)-1(f) for 1(g))
          if (!numbersWithSubParts.has(q.number)) {
            msImages = msByQuestion.get(q.number.toString());
          }
        }

        if (msImages?.length) {
          return {
            ...q,
            markingSchemeImages: msImages,
            markingSchemeImage: msImages.length === 1 ? msImages[0] : undefined,
            markingScheme: undefined
          };
        }
        return q;
      }));
      return [];
    }

    showStatus(`Processing ${fileName}`);
    const pages = filterExamBlankPages(await renderPdfPages(pdf, 2, 'qp'), fileName);
    if (!pages.length) {
      throw new Error('No pages left after removing BLANK PAGE sheets. If this is wrong, report the PDF text layer.');
    }
    const extracted = extractQuestionImageSegments(pages, 'qp');
    console.log("[QUESTION_IMAGE_SEGMENT_RESULT]", {
      fileName,
      extractedCount: extracted.length,
      inputChars: fullText.length,
      inputPreview: fullText.slice(0, 300),
      sourceUrl,
    });
    if (!extracted.length) {
      throw new Error("No question segments found. Check console logs for [QUESTION_IMAGE_SEGMENT_RESULT].");
    }

    const categorized = extracted.map((seg, idx) => {
      return {
        id: `${fileName}-q${seg.number}-part${idx}`,
        number: seg.number,
        label: seg.label,
        text: seg.text,
        marks: Math.max(seg.marks, 1),
        topicId: selectedSyllabusCode,
        paperId: fileName,
        questionImages: [seg.image],
        questionImage: seg.image
      };
    });

    setQuestions(prev => [...prev, ...categorized]);
    return categorized;
  };

  const extractFileNameFromUrl = (url: string) => {
    try {
      const path = new URL(url).pathname;
      const name = path.split('/').pop() || 'paper.pdf';
      return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
    } catch {
      return 'paper.pdf';
    }
  };

  const syllabusOptionsForLevel = SYLLABUS_BY_LEVEL[qualificationLevel];

  const getSyllabusLabel = (code: string) => getSyllabusLabelForCode(code);

  const selectSyllabus = (item: { code: string; label: string }) => {
    setSelectedSyllabusCode(item.code);
    setSyllabusSearch(item.label);
  };

  useEffect(() => {
    let cancelled = false;
    if (!selectedSyllabusCode.trim()) {
      setCatalogQpVariants(undefined);
      return () => {
        cancelled = true;
      };
    }
    setCatalogQpVariants(undefined);
    const params = new URLSearchParams({
      qualificationLevel,
      syllabusCode: selectedSyllabusCode,
      startYear: String(startYear),
      endYear: String(endYear),
    });
    if (selectedSessions.length > 0) {
      params.set("sessions", selectedSessions.join(","));
    }
    void (async () => {
      try {
        const res = await fetch(`/api/catalog/qp-variants?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          hasCatalogData?: boolean;
          variants?: string[] | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.error) {
          setCatalogQpVariants(null);
          return;
        }
        if (!data.hasCatalogData || !Array.isArray(data.variants)) {
          setCatalogQpVariants(null);
          return;
        }
        setCatalogQpVariants(data.variants);
      } catch {
        if (!cancelled) setCatalogQpVariants(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qualificationLevel, selectedSyllabusCode, selectedSessions, startYear, endYear]);

  /** When this syllabus is in the shared refresh list, never fall back to the static variant list if catalog data is missing. */
  const strictCatalogSubject = useMemo(
    () =>
      refreshedSyllabusCodes !== null &&
      refreshedSyllabusCodes !== undefined &&
      refreshedSyllabusCodes.includes(selectedSyllabusCode),
    [refreshedSyllabusCodes, selectedSyllabusCode]
  );

  const resolvedVariantOptions = useMemo((): string[] => {
    if (catalogQpVariants === undefined) return [...DEFAULT_VARIANTS_BEFORE_CATALOG];
    if (catalogQpVariants === null) {
      if (strictCatalogSubject) return [];
      return [...VARIANT_CANDIDATES];
    }
    return catalogQpVariants;
  }, [catalogQpVariants, strictCatalogSubject]);

  // Reset variants when critical filters change
  useEffect(() => {
    setSelectedVariants([]);
  }, [qualificationLevel, selectedSyllabusCode]);

  useEffect(() => {
    const opts = resolvedVariantOptions;
    setSelectedVariants((prev) => {
      if (opts.length === 0) return [];
      const allowed = new Set(opts);
      const next = prev.filter((v) => allowed.has(v));
      if (next.length > 0) return next;
      return [opts[0]!];
    });
  }, [resolvedVariantOptions]);


  const [isAutoMapped, setIsAutoMapped] = useState(false);

  const buildPaperLinks = (override?: any) => {
    const sc = override?.syllabusCode ?? selectedSyllabusCode;
    if (!sc.trim()) return [];
    const sy = override?.startYear ?? startYear;
    const ey = override?.endYear ?? endYear;
    const fromYear = Math.max(MIN_YEAR, Math.min(sy, ey));
    const toYear = Math.max(MIN_YEAR, Math.max(sy, ey));
    const links = new Set<string>();

    const sess = override?.selectedSessions ?? selectedSessions;
    const vars = override?.selectedVariants ?? selectedVariants;

    for (let year = fromYear; year <= toYear; year += 1) {
      const yy = String(year).slice(-2);
      sess.forEach((session: string) => {
        vars.forEach((variant: string) => {
          const file = `${sc}_${session.toLowerCase()}${yy}_qp_${variant}.pdf`;
          links.add(`${BASE_PAPERS_URL}${file}`);
        });
      });
    }

    return Array.from(links);
  };

  const [validCatalogLinks, setValidCatalogLinks] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSyllabusCode.trim()) {
      setValidCatalogLinks(null);
      return;
    }
    const params = new URLSearchParams({
      qualificationLevel,
      syllabusCode: selectedSyllabusCode,
      startYear: String(startYear),
      endYear: String(endYear),
    });
    if (selectedSessions.length > 0) params.set("sessions", selectedSessions.join(","));
    if (selectedVariants.length > 0) params.set("variants", selectedVariants.join(","));

    void (async () => {
      try {
        const res = await fetch(`/api/catalog/valid-papers?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error || !data.hasCatalogData) {
          setValidCatalogLinks(null);
          return;
        }
        setValidCatalogLinks(data.filenames.map((f: string) => `${BASE_PAPERS_URL}${f}`));
      } catch {
        if (!cancelled) setValidCatalogLinks(null);
      }
    })();
    return () => { cancelled = true; };
  }, [qualificationLevel, selectedSyllabusCode, startYear, endYear, selectedSessions, selectedVariants]);

  const paperLinks = useMemo(
    () => validCatalogLinks ?? buildPaperLinks(),
    [validCatalogLinks, selectedSyllabusCode, startYear, endYear, selectedSessions, selectedVariants]
  );

  const skipFirstQualReset = useRef(true);
  const prevQualificationLevel = useRef(qualificationLevel);
  useEffect(() => {
    if (skipFirstQualReset.current) {
      skipFirstQualReset.current = false;
      prevQualificationLevel.current = qualificationLevel;
      return;
    }
    const qualificationChanged = prevQualificationLevel.current !== qualificationLevel;
    prevQualificationLevel.current = qualificationLevel;
    if (qualificationChanged) {
      setSelectedSyllabusCode('');
      setSyllabusSearch('');
      return;
    }
    if (refreshedSyllabusCodes === undefined) {
      setSelectedSyllabusCode('');
      setSyllabusSearch('');
      return;
    }
    if (refreshedSyllabusCodes === null) {
      setSelectedSyllabusCode('');
      setSyllabusSearch('');
      return;
    }
    if (refreshedSyllabusCodes.length > 0) {
      return;
    }
    setSelectedSyllabusCode('');
    setSyllabusSearch('');
  }, [qualificationLevel, refreshedSyllabusCodes]);

  useEffect(() => {
    let cancelled = false;
    setRefreshedSyllabusCodes(undefined);
    const params = new URLSearchParams({ qualificationLevel });
    void (async () => {
      try {
        const res = await fetch(`/api/catalog/refreshed-syllabi?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          codes?: string[] | null;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.error) {
          setRefreshedSyllabusCodes(null);
          return;
        }
        if (data.codes === null) {
          setRefreshedSyllabusCodes(null);
          return;
        }
        if (Array.isArray(data.codes)) {
          setRefreshedSyllabusCodes(data.codes);
        } else {
          setRefreshedSyllabusCodes(null);
        }
      } catch {
        if (!cancelled) setRefreshedSyllabusCodes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qualificationLevel]);

  useEffect(() => {
    if (refreshedSyllabusCodes === undefined || refreshedSyllabusCodes === null) return;
    const set = new Set(refreshedSyllabusCodes);
    if (set.size === 0) return;
    if (set.has(selectedSyllabusCode)) return;
    const first = syllabusOptionsForLevel.find((item) => set.has(item.code));
    if (first) {
      setSelectedSyllabusCode(first.code);
      setSyllabusSearch(first.label);
    }
  }, [refreshedSyllabusCodes, qualificationLevel, syllabusOptionsForLevel, selectedSyllabusCode]);

  const isLikelyPdfBytes = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 5) return false;
    return (
      bytes[0] === 0x25 && // %
      bytes[1] === 0x50 && // P
      bytes[2] === 0x44 && // D
      bytes[3] === 0x46 && // F
      bytes[4] === 0x2d // -
    );
  };

  const fetchPdfArrayBuffer = async (url: string): Promise<ArrayBuffer> => {
    const proxyUrl = `/api/proxy-pdf?url=${encodeURIComponent(url)}`;
    const proxied = await fetch(proxyUrl);
    if (!proxied.ok) {
      const bodyText = await proxied.text().catch(() => "");
      console.error("[PDF_FETCH_ERROR]", {
        url,
        proxyUrl,
        status: proxied.status,
        statusText: proxied.statusText,
        bodyPreview: bodyText.slice(0, 500),
      });
      throw new Error(`Could not fetch PDF (${proxied.status}) via proxy. ${bodyText.slice(0, 160)}`);
    }

    const proxiedBuffer = await proxied.arrayBuffer();
    if (!isLikelyPdfBytes(proxiedBuffer)) {
      const preview = new TextDecoder().decode(new Uint8Array(proxiedBuffer).slice(0, 300));
      console.error("[PDF_SIGNATURE_ERROR]", {
        url,
        bytes: proxiedBuffer.byteLength,
        preview,
      });
      throw new Error("URL did not return a real PDF (received HTML/blocked page). Check console logs for response preview.");
    }

    return proxiedBuffer;
  };

  const processGeneratedLinks = async (candidateLinks?: string[], historyTrigger?: any) => {
    setIsAutoMapped(false);
    setIsFilteredLocally(false);
    setSelectedQuestionIds([]);
    setTopics([]);
    setQuestionTopicMappings({});
    setSelectedTopicFilters([]);
    setTopicsStatus('');
    const links = candidateLinks ?? buildPaperLinks();
    if (!links.length) {
      setStatus('No QP links for the current selection (sessions × years × variants).');
      return [];
    }

    const cost = getGenerateTokenCost(links.length);

    if (!user) {
      if (guestTokens < cost) {
        setStatus(`Insufficient tokens. This action requires ${cost} tokens. You only have ${guestTokens}. Login to receive 15 free tokens.`);
        setShowGuestFeatureLock(true);
        return [];
      }
    } else {
      if (!user.isAdmin && user.tokens < cost && !historyTrigger) {
        setStatus(`Insufficient tokens. This action requires ${cost} tokens.`);
        return [];
      }
    }

    setLoading(true);
    const allParsedQuestions: any[] = [];
    const startTime = Date.now();
    try {
      // 1. Deduct tokens IF it's a new generation (not a history restore)
      if (user) {
        if (!user.isAdmin && !historyTrigger) {
          const decRes = await fetch(apiUrl('user/decrement-tokens'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
            body: JSON.stringify({ amount: cost })
          });
          const decData = await decRes.json();
          if (!decRes.ok) throw new Error(decData.error || 'Token deduction failed');
          setAuthState({ ...user, tokens: decData.newTokens });
        }
      } else if (!historyTrigger) {
        // Guest generation - decrement server-side IP tokens
        try {
          const guestRes = await fetch(apiUrl('user/guest-tokens/deduct'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cost })
          });
          const guestData = await guestRes.json();
          if (guestData.tokens !== undefined) {
             setGuestTokens(guestData.tokens);
          }
        } catch (e) {
          console.error("Guest token deduction failed", e);
        }
      }

      // 2. Start processing
      let qpAttempted = 0;
      let qpSucceeded = 0;
      let msAttempted = 0;
      let msSucceeded = 0;
      const activeFiles = new Set<string>();
      const refreshProcessingStatus = () => {
        if (activeFiles.size === 0) return;
        const names = [...activeFiles];
        const shown = names.slice(0, 10);
        const suffix = names.length > 10 ? ` · … +${names.length - 10}` : '';
        setStatus(`Processing ${shown.join(' · ')}${suffix}`);
      };

      const concurrency = 10;
      for (let i = 0; i < links.length; i += concurrency) {
        const batch = links.slice(i, i + concurrency);

        await Promise.all(
          batch.map(async (url) => {
            try {
              qpAttempted += 1;
              const qpName = extractFileNameFromUrl(url);
              activeFiles.add(qpName);
              refreshProcessingStatus();
              try {
                const arrayBuffer = await fetchPdfArrayBuffer(url);
                const newQs = await processPDF(arrayBuffer, qpName, url, { suppressStatus: true });
                if (newQs) allParsedQuestions.push(...newQs);
                qpSucceeded += 1;
              } finally {
                activeFiles.delete(qpName);
                refreshProcessingStatus();
              }

              const msUrl = inferMsUrlFromQpUrl(url);
              if (msUrl) {
                try {
                  msAttempted += 1;
                  const msFileName = extractFileNameFromUrl(msUrl);
                  activeFiles.add(msFileName);
                  refreshProcessingStatus();
                  try {
                    const msBuffer = await fetchPdfArrayBuffer(msUrl);
                    await processPDF(msBuffer, msFileName, msUrl, { suppressStatus: true });
                    msSucceeded += 1;
                  } finally {
                    activeFiles.delete(msFileName);
                    refreshProcessingStatus();
                  }
                } catch (msError) {
                  console.warn("[AUTO_MS_FETCH_FAILED]", { url, msUrl, msError });
                }
              }
            } catch (parseError) {
              console.error("[PDF_PARSE_ERROR]", {
                url,
                error: parseError,
              });
            }
          })
        );
      }
      const totalAttempted = qpAttempted + msAttempted;
      const totalSucceeded = qpSucceeded + msSucceeded;
      const totalFailed = totalAttempted - totalSucceeded;
      setStatus(
        `Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s. Tried ${totalAttempted} links (QP ${qpSucceeded}/${qpAttempted}, MS ${msSucceeded}/${msAttempted}). Failed: ${totalFailed}.`
      );
      return allParsedQuestions;
    } catch (error) {
      console.error(error);
      setStatus('Error: ' + (error as Error).message);
      return [];
    } finally {
      setLoading(false);

      // Save to history if this is a fresh manual generation (not restore)
      if (!historyTrigger && user && links.length > 0) {
        fetch(apiUrl('user/history'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
          body: JSON.stringify({
            qualificationLevel,
            syllabusCode: selectedSyllabusCode,
            startYear,
            endYear,
            selectedSessions,
            selectedVariants,
            didFilter: false
          })
        }).catch(() => {});
      }

      // Automatically re-apply filter mapping when restored from history if they had filtered
      if (historyTrigger?.didFilter) {
        // Removed: setTimeout(() => document.getElementById('auto-map-trigger')?.click(), 800);
      }
    }
  };

  const handleProcessLinks = async () => {
    setQuestions([]);
    setStatus('');
    try {
      await processGeneratedLinks(paperLinks);
    } catch (error) {
      console.error(error);
      setStatus('Error: ' + (error as Error).message);
    }
  };

  const handleExport = async () => {
    if (!user?.isAdmin && (user?.tier === 'free' || user?.tier === 'starter')) {
      setAlertMessage("Export as PDF is available on the Pro plan.");
      setAlertCanUpgrade(true);
      return;
    }
    if (selectedQuestionIds.length === 0) {
      setAlertMessage("Select questions to export first.");
      return;
    }

    setAlertType('export');
    setAlertMessage("Building export...");
    
    try {
      const esc = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

      const selectedQuestions = filteredQuestions.filter(q => selectedQuestionIds.includes(q.id));

      // Topic label: no filter → All Topics, subset → list, all → All Topics
      let topicLabel = 'All Topics';
      if (selectedTopicFilters.length > 0 && topics.length > 0) {
        if (selectedTopicFilters.length >= topics.length) {
          topicLabel = 'All Topics';
        } else {
          topicLabel = selectedTopicFilters.map(id => {
            const t = topics.find(t => t.unitId === id);
            return t ? esc(id) + ' &middot; ' + esc(t.title) : esc(id);
          }).join(',&nbsp; ');
        }
      }

      const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

      const exportParts = (await Promise.all(selectedQuestions.map(async q => {
        const qImages = getQuestionImages(q);
        const msImages = getMarkSchemeImages(q);
        // Construct label: if parts exist, show list (e.g. "Q1 a), b), c), d), e), f)"), else just "Q1" or "Q1(a)"
        let label = 'Q' + q.number;
        if (q.parts && q.parts.length > 1) {
          const partLabels = q.parts.map(p => (p.label || '') + ')').filter(l => l !== ')').join(' ');
          label = `Q${q.number} ${partLabels}`;
        } else if (q.label) {
          label = 'Q' + q.label;
        }

        const singleImg = (src: string) =>
          `<img src="${src}" style="width:100%;display:block;" loading="eager" />`;
        const makeBadge = (tid: string) => {
          const title = topics.find(t => t.unitId === tid)?.title;
          return `<span style="display:inline-block;background:#2563eb;color:#fff;font-size:10px;font-weight:700;font-family:helvetica,sans-serif;letter-spacing:0px;padding:6px 14px;margin-bottom:6px;line-height:1.4;word-break:break-word;max-width:100%;">${esc(tid)}${title ? ' · ' + esc(title) : ''}</span>`;
        };

        // Build per-part image blocks with individual topic badges
        const hasParts = q.parts && q.parts.length > 1;
        let qImagesHtml: string;
        if (hasParts) {
          qImagesHtml = (await Promise.all(q.parts!.map(async part => {
            const partImgs = part.questionImages || [];
            const stitched = partImgs.length > 1 ? await stitchDataUrlImages(partImgs) : partImgs[0];
            const badge = part.topicId && !/^\d{4}$/.test(part.topicId) ? makeBadge(part.topicId) : '';
            return `<div style="margin-bottom:4px;">${badge}${stitched ? singleImg(stitched) : ''}</div>`;
          }))).join('');
        } else {
          const stitchedQ = qImages.length > 1 ? await stitchDataUrlImages(qImages) : qImages[0];
          const topicId = q.topicId && !/^\d{4}$/.test(q.topicId) ? q.topicId : null;
          qImagesHtml = (topicId ? makeBadge(topicId) : '') + (stitchedQ ? singleImg(stitchedQ) : '<p style="color:#9ca3af;font-size:11px;font-style:italic;">No image available</p>');
        }

        const stitchedMs = msImages.length > 1 ? await stitchDataUrlImages(msImages) : msImages[0];
        const msSection = stitchedMs
          ? `<div style="border-top:2px solid #2563eb;background:#eff6ff;"><div style="padding:10px 20px 6px;font-size:8px;font-weight:700;letter-spacing:2.5px;color:#2563eb;font-family:monospace;">&#10003; MARK SCHEME</div><div style="padding:0 20px 16px;">${singleImg(stitchedMs)}</div></div>`
          : '';
        const msTableHtml = msSection ? `<table style="width:100%;border:2px solid #141414;margin-bottom:28px;border-collapse:collapse;break-inside:avoid;page-break-inside:avoid;">
          <tr><td style="padding:0;"><div style="background:#666666;color:#fff;padding:12px 20px;text-align:center;font-size:10px;font-weight:700;letter-spacing:2px;font-family:helvetica,sans-serif;cursor:pointer;">BACK TO QUESTION</div></td></tr>
          <tr><td style="padding:16px 20px 10px;">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <span style="font-size:26px;font-style:italic;font-family:Georgia,serif;font-weight:700;">${esc(label)}</span>
              <span style="font-size:9px;font-weight:700;font-family:monospace;background:#f3f4f6;padding:5px 10px;">${esc(q.paperId || '')}</span>
            </div>
          </td></tr>
          <tr><td style="padding:0;">${msSection}</td></tr>
        </table>` : null;
        return {
          qHtml: `<table data-qi="${selectedQuestions.indexOf(q)}" style="width:100%;border:2px solid #141414;margin-bottom:28px;border-collapse:collapse;break-inside:avoid;page-break-inside:avoid;">
          <tr><td style="padding:16px 20px 10px;">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <span style="font-size:26px;font-style:italic;font-family:Georgia,serif;font-weight:700;">${esc(label)}</span>
              <span style="font-size:9px;font-weight:700;font-family:monospace;background:#f3f4f6;padding:5px 10px;">${esc(q.paperId || '')}</span>
            </div>
          </td></tr>
          <tr><td style="border-top:1px solid #e5e7eb;padding:14px 20px 4px;">
            <div style="font-size:8px;font-weight:700;letter-spacing:2.5px;color:#141414;opacity:0.4;margin-bottom:10px;font-family:monospace;">&#9654; QUESTION</div>
            ${qImagesHtml}
          </td></tr>
          <tr><td style="padding:0;"><div style="background:#2563eb;color:#fff;padding:12px 20px;text-align:center;font-size:10px;font-weight:700;letter-spacing:2px;font-family:helvetica,sans-serif;cursor:pointer;">SHOW MARK SCHEME</div></td></tr>
        </table>`,
          msHtml: msTableHtml
        };
      })));
      const questionsHtml = exportParts.map(p => p.qHtml).join('');
      const msAtEndHtml = '';
      const interleavedMsParts = exportParts.map((p, i) => ({ idx: i, msHtml: p.msHtml })).filter(p => p.msHtml);

      const coverDiv = `<div style="width:794px;min-height:1123px;padding:68px 76px;display:flex;flex-direction:column;background:#fff;font-family:system-ui,-apple-system,sans-serif;color:#141414;box-sizing:border-box;">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:52px;">
    <div style="width:44px;height:44px;background:#141414;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
    </div>
    <span style="font-size:15px;font-weight:900;letter-spacing:5px;text-transform:uppercase;">PAPERRA</span>
  </div>
  <div style="margin-bottom:44px;">
    <h1 style="font-size:54px;font-weight:900;letter-spacing:-2px;line-height:0.92;font-family:Georgia,serif;font-style:italic;">EXPORT</h1>
  </div>
  <div style="border:2px solid #141414;margin-bottom:24px;">
    <div style="background:#141414;padding:10px 18px;">
      <span style="color:#fff;font-size:8px;font-weight:700;letter-spacing:3px;font-family:monospace;">EXPORT DETAILS</span>
    </div>
    <div style="border-bottom:1px solid #e5e7eb;padding:13px 18px;display:flex;gap:16px;align-items:baseline;">
      <span style="width:108px;flex-shrink:0;font-size:8px;font-weight:700;letter-spacing:2px;opacity:0.4;font-family:monospace;">SUBJECT</span>
      <span style="font-size:13px;font-weight:600;">${esc(selectedSyllabusLabel)} (${esc(selectedSyllabusCode)})</span>
    </div>
    <div style="border-bottom:1px solid #e5e7eb;padding:13px 18px;display:flex;gap:16px;align-items:baseline;">
      <span style="width:108px;flex-shrink:0;font-size:8px;font-weight:700;letter-spacing:2px;opacity:0.4;font-family:monospace;">TOPICS</span>
      <span style="font-size:12px;font-weight:600;line-height:1.6;">${topicLabel}</span>
    </div>
    <div style="border-bottom:1px solid #e5e7eb;padding:13px 18px;display:flex;gap:16px;align-items:baseline;">
      <span style="width:108px;flex-shrink:0;font-size:8px;font-weight:700;letter-spacing:2px;opacity:0.4;font-family:monospace;">QUESTIONS</span>
      <span style="font-size:13px;font-weight:600;">${selectedQuestions.length}</span>
    </div>
    <div style="border-bottom:1px solid #e5e7eb;padding:13px 18px;display:flex;gap:16px;align-items:baseline;">
      <span style="width:108px;flex-shrink:0;font-size:8px;font-weight:700;letter-spacing:2px;opacity:0.4;font-family:monospace;">GENERATED</span>
      <span style="font-size:13px;font-weight:600;">${esc(dateStr)}</span>
    </div>
    <div style="padding:13px 18px;display:flex;gap:16px;align-items:baseline;">
      <span style="width:108px;flex-shrink:0;font-size:8px;font-weight:700;letter-spacing:2px;opacity:0.4;font-family:monospace;">EXPORTED BY</span>
      <span style="font-size:13px;font-weight:600;">${esc(user?.username || '')}</span>
    </div>
  </div>
  <div style="margin-top:auto;padding-top:14px;border-top:2px solid #141414;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:8px;font-weight:700;letter-spacing:2px;opacity:0.22;font-family:monospace;">PAPERRA.APP</span>
    <span style="font-size:8px;font-weight:700;letter-spacing:2px;opacity:0.22;font-family:monospace;">${esc(dateStr.toUpperCase())}</span>
  </div>
</div>`;

      const questionsDiv = `<div style="padding:53px 68px;width:794px;background:#fff;font-family:system-ui,-apple-system,sans-serif;color:#141414;box-sizing:border-box;">
${questionsHtml}
</div>`;

      const msAtEndDiv = msAtEndHtml ? `<div style="padding:53px 68px;width:794px;background:#fff;font-family:system-ui,-apple-system,sans-serif;color:#141414;box-sizing:border-box;">
<div style="margin-bottom:28px;border-bottom:3px solid #141414;padding-bottom:16px;"><span style="font-size:22px;font-weight:900;letter-spacing:3px;font-family:monospace;text-transform:uppercase;">Mark Schemes</span></div>
${msAtEndHtml}
</div>` : '';

      // Inject content divs only — never inject a full HTML document into the live DOM
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;pointer-events:none;';
      container.innerHTML = coverDiv + questionsDiv + msAtEndDiv;
      document.body.appendChild(container);

      setAlertMessage('Rendering PDF... please wait.');
      // Wait for images to decode
      await Promise.all(
        Array.from(container.querySelectorAll('img')).map(
          img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
        )
      );
      await new Promise(r => setTimeout(r, 300));

      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const A4_W_PX = 794;
      const A4_H_PX = 1123;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = 210;
      const pdfH = 297;

      // Render cover page — use children[0]/[1]/[2] since divs have no class names
      const coverEl = container.children[0] as HTMLElement;
      const questionsEl = container.children[1] as HTMLElement;
      const msAtEndEl = container.children[2] as HTMLElement | undefined;

      const coverCanvas = await html2canvas(coverEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: A4_W_PX, windowWidth: A4_W_PX });
      const coverImg = coverCanvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(coverImg, 'JPEG', 0, 0, pdfW, pdfH);

      // Render questions section — slice into A4 pages
      const qCanvas = await html2canvas(questionsEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: A4_W_PX, windowWidth: A4_W_PX });
      const totalQHeight = qCanvas.height;
      const sliceHeightPx = A4_H_PX * 2; // scale=2
      let yOffset = 0;

      while (yOffset < totalQHeight) {
        const sliceH = Math.min(sliceHeightPx, totalQHeight - yOffset);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = qCanvas.width;
        sliceCanvas.height = sliceH;
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(qCanvas, 0, yOffset, qCanvas.width, sliceH, 0, 0, qCanvas.width, sliceH);
        const sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.95);
        const sliceMmH = (sliceH / sliceHeightPx) * pdfH;
        pdf.addPage();
        pdf.addImage(sliceImg, 'JPEG', 0, 0, pdfW, sliceMmH);
        yOffset += sliceH;
      }

      // Render MS-at-end section if present
      if (msAtEndEl) {
        const msCanvas = await html2canvas(msAtEndEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: A4_W_PX, windowWidth: A4_W_PX });
        let msYOffset = 0;
        while (msYOffset < msCanvas.height) {
          const sliceH = Math.min(sliceHeightPx, msCanvas.height - msYOffset);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = msCanvas.width;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(msCanvas, 0, msYOffset, msCanvas.width, sliceH, 0, 0, msCanvas.width, sliceH);
          const sliceMmH = (sliceH / sliceHeightPx) * pdfH;
          pdf.addPage();
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfW, sliceMmH);
          msYOffset += sliceH;
        }
      }

      // Render per-question MS pages, then add "SHOW MARK SCHEME" button overlays
      if (interleavedMsParts.length > 0) {
        // Map from question index → first PDF page of its MS
        const msPageByQIdx: Record<number, number> = {};
        // Map from question index → first PDF page of question in questions section
        const qPageByQIdx: Record<number, number> = {};
        // Calculate which PDF page each question is on
        const questionsElRect3 = questionsEl.getBoundingClientRect();
        for (let i = 0; i < exportParts.length; i++) {
          const tableEl = questionsEl.querySelector(`table[data-qi="${i}"]`) as HTMLElement | null;
          if (!tableEl) continue;
          const tableRect = tableEl.getBoundingClientRect();
          const cardTopPx = (tableRect.top - questionsElRect3.top) * 2;
          const pageIdx = Math.floor(cardTopPx / sliceHeightPx);
          qPageByQIdx[i] = 2 + pageIdx; // +2: cover is page 1, questions start at page 2
        }

        for (const { idx, msHtml } of interleavedMsParts) {
          const msWrap = document.createElement('div');
          msWrap.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;pointer-events:none;';
          msWrap.innerHTML = `<div style="padding:53px 68px;width:794px;background:#fff;font-family:system-ui,-apple-system,sans-serif;color:#141414;box-sizing:border-box;">${msHtml}</div>`;
          document.body.appendChild(msWrap);
          await Promise.all(Array.from(msWrap.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
          await new Promise(r => setTimeout(r, 80));

          msPageByQIdx[idx] = pdf.getNumberOfPages() + 1;
          const msCanvas = await html2canvas(msWrap.children[0] as HTMLElement, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: A4_W_PX, windowWidth: A4_W_PX });

          // Track back button position for link annotation
          const msWrapInner = msWrap.children[0] as HTMLElement;
          const msWrapInnerRect = msWrapInner.getBoundingClientRect();
          const backBtnRow = msWrap.querySelector('table tr:first-child') as HTMLElement | null;
          const backBtnRowRect = backBtnRow?.getBoundingClientRect();

          document.body.removeChild(msWrap);

          let msY = 0;
          let isFirstMsPage = true;
          while (msY < msCanvas.height) {
            const sliceH = Math.min(sliceHeightPx, msCanvas.height - msY);
            const sc = document.createElement('canvas');
            sc.width = msCanvas.width; sc.height = sliceH;
            const ctx = sc.getContext('2d')!;
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, sc.width, sc.height);
            ctx.drawImage(msCanvas, 0, msY, msCanvas.width, sliceH, 0, 0, msCanvas.width, sliceH);
            const sliceMmH = (sliceH / sliceHeightPx) * pdfH;
            pdf.addPage();
            pdf.addImage(sc.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfW, sliceMmH);

            // Add back button link on first MS page
            if (isFirstMsPage && backBtnRowRect && qPageByQIdx[idx]) {
              const backBtnTopPx = (backBtnRowRect.top - msWrapInnerRect.top) * 2;
              const backBtnBottomPx = (backBtnRowRect.bottom - msWrapInnerRect.top) * 2;
              const backBtnYMm = (backBtnTopPx / sliceHeightPx) * pdfH;
              const backBtnHeightMm = ((backBtnBottomPx - backBtnTopPx) / sliceHeightPx) * pdfH;
              pdf.link(0, backBtnYMm, pdfW, backBtnHeightMm, { pageNumber: qPageByQIdx[idx] });
              isFirstMsPage = false;
            }
            msY += sliceH;
          }
        }

        // Add link annotations on rendered "SHOW MARK SCHEME" buttons
        const questionsElRect2 = questionsEl.getBoundingClientRect();
        for (let i = 0; i < exportParts.length; i++) {
          const msPage = msPageByQIdx[i];
          if (!msPage) continue;
          const tableEl = questionsEl.querySelector(`table[data-qi="${i}"]`) as HTMLElement | null;
          if (!tableEl) continue;
          // Get the last row (button row)
          const rows = Array.from(tableEl.querySelectorAll('tr')) as HTMLElement[];
          const btnRow = rows[rows.length - 1];
          if (!btnRow) continue;
          const btnRect = btnRow.getBoundingClientRect();
          // Button position relative to questionsEl, scaled for canvas scale=2
          const btnTopPx = (btnRect.top - questionsElRect2.top) * 2;
          const btnBottomPx = (btnRect.bottom - questionsElRect2.top) * 2;
          const pageIdx = Math.floor(btnTopPx / sliceHeightPx);
          const yWithinPagePx = btnTopPx % sliceHeightPx;
          const btnTopMm = (yWithinPagePx / sliceHeightPx) * pdfH;
          const btnHeightMm = ((btnBottomPx - btnTopPx) / sliceHeightPx) * pdfH;
          const pdfPageNum = 2 + pageIdx;
          if (pdfPageNum > pdf.getNumberOfPages()) continue;
          pdf.setPage(pdfPageNum);
          pdf.link(0, btnTopMm, pdfW, btnHeightMm, { pageNumber: msPage });
        }
      }

      // Add invisible (Ctrl+F searchable) text layer — one entry per part badge span
      const questionsElRect = questionsEl.getBoundingClientRect();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(37, 99, 235);
      const xMm = 68 * (pdfW / A4_W_PX);
      // Query every badge span rendered inside question content cells
      const badgeSpans = Array.from(questionsEl.querySelectorAll('td span[style*="2563eb"]')) as HTMLElement[];
      for (const span of badgeSpans) {
        const badgeText = span.textContent?.trim();
        if (!badgeText) continue;
        const rect = span.getBoundingClientRect();
        const relTopPx = rect.top - questionsElRect.top;
        const scaledTopPx = relTopPx * 2;
        const pageIdx = Math.floor(scaledTopPx / sliceHeightPx);
        const yWithinPagePx = scaledTopPx % sliceHeightPx;
        const yMm = (yWithinPagePx / sliceHeightPx) * pdfH + 3;
        const pdfPageNum = 2 + pageIdx;
        if (pdfPageNum > pdf.getNumberOfPages()) continue;
        pdf.setPage(pdfPageNum);
        (pdf as any).internal.write('3 Tr');
        pdf.text(badgeText, xMm, yMm);
        (pdf as any).internal.write('0 Tr');
      }

      document.body.removeChild(container);
      pdf.save(`Paperra_${esc(selectedSyllabusCode)}_${Date.now()}.pdf`);
      setAlertMessage('PDF downloaded!');
    } catch (err: any) {
      console.error(err);
      setAlertType('error');
      setAlertMessage('Failed to generate PDF: ' + err.message);
    }
  };

  const isPhoneDevice = () => window.matchMedia('(max-width: 768px)').matches;

  const toggleSession = (session: string) => {
    setSelectedSessions((prev) =>
      prev.includes(session) ? prev.filter((s) => s !== session) : [...prev, session]
    );
    setSelectedVariants([]);
  };

  const toggleVariant = (variant: string) => {
    setSelectedVariants((prev) =>
      prev.includes(variant) ? prev.filter((v) => v !== variant) : [...prev, variant]
    );
  };

  const getQuestionImages = (q: Question) => {
    if (q.questionImages?.length) return q.questionImages;
    if (q.questionImage) return [q.questionImage];
    return [];
  };

  const getMarkSchemeImages = (q: Question) => {
    if (q.markingSchemeImages?.length) return q.markingSchemeImages;
    if (q.markingSchemeImage) return [q.markingSchemeImage];
    return [];
  };

  const buildMobileComparePayload = (q: Question) => ({
    title: `Q${q.number}`,
    questions: getQuestionImages(q),
    markSchemes: getMarkSchemeImages(q),
    markSchemeText: q.markingScheme,
  });

  const preloadImages = (images: string[]) => {
    images.forEach((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    });
  };

  const openMobileViewerForQuestion = (q: Question) => {
    setShowMobileMarkScheme(false);
    const msImages = getMarkSchemeImages(q);
    if (msImages.length) preloadImages(msImages);
    setMobileCompareViewer(buildMobileComparePayload(q));
  };

  const openPreview = (images: string[], startIndex = 0) => {
    if (!images.length) return;
    setPreviewImages(images);
    setPreviewIndex(Math.min(Math.max(startIndex, 0), images.length - 1));
  };

  const closePreview = () => {
    setPreviewImages(null);
    setPreviewIndex(0);
  };

  const [selectedTopicFilters, setSelectedTopicFilters] = useState<string[]>([]);

  const filteredQuestions = useMemo(() => {
    if (selectedTopicFilters.length === 0) {
      // Group subparts into one card per Paper + Question Number
      const grouped = new Map<string, Question>();
      questions.forEach(q => {
        const key = `${q.paperId}-${q.number}`;
        const mappedTopic = questionTopicMappings[q.id];
        if (!grouped.has(key)) {
          grouped.set(key, {
            ...q,
            id: key,
            topicId: mappedTopic ?? q.topicId,
            questionImages: [...(q.questionImages || [])],
            markingSchemeImages: q.markingSchemeImages ? [...q.markingSchemeImages] : undefined,
            parts: [{
              label: q.label,
              topicId: mappedTopic,
              questionImages: q.questionImages ? [...q.questionImages] : undefined,
              markingSchemeImages: q.markingSchemeImages ? [...q.markingSchemeImages] : undefined,
              text: q.text
            }]
          });
        } else {
          const existing = grouped.get(key)!;
          if (q.questionImages) existing.questionImages!.push(...q.questionImages);
          if (q.text) existing.text += '\n\n' + q.text;
          if (q.markingSchemeImages) {
            if (!existing.markingSchemeImages) existing.markingSchemeImages = [];
            q.markingSchemeImages.forEach(img => {
              if (!existing.markingSchemeImages!.includes(img)) existing.markingSchemeImages!.push(img);
            });
          }
          existing.marks = Math.max(existing.marks, q.marks);
          if (existing.parts) {
            existing.parts.push({
              label: q.label,
              topicId: mappedTopic,
              questionImages: q.questionImages ? [...q.questionImages] : undefined,
              markingSchemeImages: q.markingSchemeImages ? [...q.markingSchemeImages] : undefined,
              text: q.text
            });
          }
        }
      });
      return Array.from(grouped.values()).sort((a, b) => a.number - b.number);
    }
    // When filters are active, dynamically group subparts by Q number + matching topic
    const filteredGroupProps = new Map<string, { q: Question; labels: string[] }>();
    questions.forEach(q => {
      const mapped = questionTopicMappings[q.id];
      if (!mapped) return;
      if (!selectedTopicFilters.some(filter => mapped === filter || mapped.startsWith(filter))) return;

      const key = `${q.paperId}-${q.number}-${mapped}`;
      if (!filteredGroupProps.has(key)) {
        filteredGroupProps.set(key, {
          q: {
            ...q,
            id: key,
            topicId: mapped,
            questionImages: [...(q.questionImages || [])],
            markingSchemeImages: q.markingSchemeImages ? [...q.markingSchemeImages] : undefined
          },
          labels: q.label ? [q.label] : []
        });
      } else {
        const existing = filteredGroupProps.get(key)!;
        if (q.label) existing.labels.push(q.label);
        if (q.questionImages) existing.q.questionImages!.push(...q.questionImages);
        if (q.text) existing.q.text += '\n\n' + q.text;

        if (q.markingSchemeImages) {
          if (!existing.q.markingSchemeImages) existing.q.markingSchemeImages = [];

          // Avoid pushing duplicate MS images! Very likely in global fallback cases.
          q.markingSchemeImages.forEach(img => {
             if (!existing.q.markingSchemeImages!.includes(img)) {
                 existing.q.markingSchemeImages!.push(img);
             }
          });
        }

        existing.q.marks = Math.max(existing.q.marks, q.marks);
      }
    });

    return Array.from(filteredGroupProps.values()).map(({ q, labels }) => {
       if (labels.length > 0) {
          const stripped = labels.map(l => l.replace(new RegExp(`^${q.number}`), '').replace(/\(([^)]+)\)/g, ' $1)').trim());
          q.label = `${q.number} ${stripped.join(', ')}`.trim();
       } else {
          q.label = String(q.number);
       }
       return q;
    }).sort((a, b) => a.number - b.number);
  }, [questions, selectedTopicFilters, questionTopicMappings]);

  const toggleTopicFilter = (unitId: string) => {
    setSelectedTopicFilters((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  const getSyllabusWebpageUrl = (level: string, label: string, code: string) => {
    let prefix = '';
    if (level === 'igcse') prefix = 'cambridge-igcse-';
    else if (level === 'olevel') prefix = 'cambridge-o-level-';
    else if (level === 'alevel') prefix = 'cambridge-international-as-and-a-level-';

    let slug = label
      .toLowerCase()
      .replace(/\s*\([^)]*\)/g, (match) => match.replace(/[^a-z0-9]/g, '-'))
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Remove the code suffix from the label if it already exists there
    if (slug.endsWith(`-${code}`)) {
      slug = slug.substring(0, slug.length - code.length - 1);
    }

    return `https://www.cambridgeinternational.org/programmes-and-qualifications/${prefix}${slug}-${code}/`;
  };

  const selectedSyllabusLabel = getSyllabusLabel(selectedSyllabusCode);

  const handleFilterWithAI = async (overrideQuestions?: any[]) => {
    // Safety: ensure overrideQuestions is actually an array (not a click event)
    const rawTarget = Array.isArray(overrideQuestions) ? overrideQuestions : questions;
    const targetQuestions = Array.isArray(rawTarget) ? rawTarget : [];
    
    if (!user) return setTopicsError('Please login');
    if (!user.isAdmin && user.tokens <= 0) return setTopicsError('Token limit reached.');
    
    if (targetQuestions.length === 0) {
      console.warn("[FILTER_ABORTED] No questions available for filtering", { questions, overrideQuestions });
      return setTopicsError('Generate questions first.');
    }
    if (!selectedSyllabusCode) return setTopicsError('No syllabus selected.');

    setTopicsLoading(true);
    setTopicsStatus('');
    setTopicsError('');
    try {
      setTopicsStatus('CHECKING CACHE...');
      const cacheCheckRes = await fetch(apiUrl(`topics/check-cache?syllabusCode=${selectedSyllabusCode}`));
      const cacheCheckData = await cacheCheckRes.json().catch(() => ({ cached: false }));

      let textToPass = '';
      if (!cacheCheckData.cached) {
        setTopicsStatus('FETCHING SYLLABUS PDF...');
        const u = getSyllabusWebpageUrl(qualificationLevel, selectedSyllabusLabel, selectedSyllabusCode);
        const fullUrl = apiUrl(`proxy-pdf?url=${encodeURIComponent(u)}`);
        const pdf = await pdfjsLib.getDocument({
          url: fullUrl,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
        }).promise;

        setTopicsStatus('PARSING PDF...');
        const rawText = await extractTextFromPdf(pdf, 1);
        textToPass = cleanPdfTextForAI(rawText);
      } else {
        setTopicsStatus('TOPICS FOUND. SENDING TO AI...');
      }

      if (textToPass) setTopicsStatus('TOPICS EXTRACTED. SENDING TO AI...');
      const qsToSend = targetQuestions.map(q => ({
        id: q.id,
        number: q.number,
        text: q.text || ''
      }));

      const res = await fetch(apiUrl('topics/filter-questions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          syllabusCode: selectedSyllabusCode,
          syllabusText: textToPass,
          questions: qsToSend
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTopics(data.topics);
      setQuestionTopicMappings(data.mappings);
      console.log("[FILTER_DEBUG] Mappings received:", data.mappings);
      setAuthState({ ...user, tokens: data.newLimit });
      setSelectedTopicFilters([]);
      setIsAutoMapped(true);
      setIsFilteredLocally(true);

      // Update history log as "Filtered"
      fetch(apiUrl('user/history'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({
          qualificationLevel,
          syllabusCode: selectedSyllabusCode,
          startYear,
          endYear,
          selectedSessions,
          selectedVariants,
          didFilter: true
        })
      });
    } catch (err: any) {
      setTopicsError(err.message);
    } finally {
      setTopicsLoading(false);
    }
  };
  const generatedLinkCount = paperLinks.length;

  const syllabusPoolForPicker = useMemo(() => {
    if (refreshedSyllabusCodes === undefined) return [];
    if (refreshedSyllabusCodes === null) return syllabusOptionsForLevel;
    const set = new Set(refreshedSyllabusCodes);
    return syllabusOptionsForLevel.filter((item) => set.has(item.code));
  }, [syllabusOptionsForLevel, refreshedSyllabusCodes]);

  const filteredSyllabusOptions = useMemo(
    () =>
      syllabusPoolForPicker
        .filter((item) => item.label.toLowerCase().includes(syllabusSearch.trim().toLowerCase()))
        .slice(0, 12),
    [syllabusPoolForPicker, syllabusSearch]
  );

  const restoreHistoryAndRun = async (h: any) => {
    setAlertType('restore');
    setAlertMessage(`Restoring session for ${h.syllabusCode}...`);
    setQualificationLevel(h.qualificationLevel as any);
    setSelectedSyllabusCode(h.syllabusCode);
    setStartYear(h.startYear);
    setEndYear(h.endYear);
    setSelectedSessions(h.selectedSessions);
    setSelectedVariants(h.selectedVariants);
    setQuestions([]);
    setSelectedQuestionIds([]);
    setStatus('');
    try {
      const links = buildPaperLinks(h);
      const restoredQs = await processGeneratedLinks(links, h);
      if (h.didFilter && restoredQs && restoredQs.length > 0) {
         await handleFilterWithAI(restoredQs);
      }
      setAlertMessage(null);
      setSidebarTab('filter');
    } catch (e: any) {
      console.error(e);
      setAlertType('error');
      setAlertMessage(`Restore failed: ${e.message}`);
      setStatus(`Error: ${e.message}`);
    }
  };



  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans flex flex-col">
      <header className="border-b border-[#141414] p-6 flex items-center justify-between gap-4 bg-white sticky top-0 z-40">
        <div className="flex items-center gap-2.5 h-10">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#141414] hover:opacity-70 transition-opacity"
            aria-label="Paperra Home"
          >
            <BookOpen className="w-9 h-9" strokeWidth={1.5} />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-none">Paperra</h1>
          </div>
        </div>

        <nav className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center h-full gap-2">
            <div className="flex items-center h-full border-2 border-blue-600 bg-blue-600 text-white">
              <span className="px-3 sm:px-4 py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider leading-none">
                Tokens: {user ? user.tokens : guestTokens}
              </span>
            </div>
            {!user && (
              <button
                onClick={() => {
                  setUserModalMode('login');
                  setUserModalOpen(true);
                }}
                className="flex items-center h-full border-2 border-[#141414] bg-[#141414] text-white hover:bg-white hover:text-[#141414] transition-all"
              >
                <div className="px-3 sm:px-4 py-1.5 flex items-center">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider leading-none">Log in</span>
                </div>
              </button>
            )}
          </div>

          {/* MOBILE AUTH BUTTONS */}
          <div className="flex sm:hidden">
            {user && (
              <button
                onClick={() => setShowProfileModal(true)}
                className="p-1.5 border-2 border-[#141414] bg-[#141414] text-white hover:bg-white hover:text-[#141414] transition-all flex items-center justify-center"
                aria-label="Profile"
              >
                <User className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-4">
            {user && (
              <>
                <button
                  onClick={() => setShowShopModal(true)}
                  className="px-4 py-1.5 border-2 border-[#141414] bg-[#141414] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-white hover:text-[#141414] transition-all"
                >
                  Pricing
                </button>

                <button
                  onClick={() => setShowProfileModal(true)}
                  className="px-4 py-1.5 border-2 border-[#141414] bg-[#141414] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-white hover:text-[#141414] transition-all"
                >
                  Profile
                </button>
              </>
            )}
          </div>

          {user && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="sm:hidden p-1.5 border-2 border-[#141414] hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </nav>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[150] sm:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 h-full w-[280px] bg-white border-l-4 border-[#141414] shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-10">
                <span className="text-xl font-bold tracking-tight leading-none -translate-y-[0.5px]">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 hover:bg-gray-100 border-2 border-[#141414]">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {user && (
                  <>
                    <button
                      onClick={() => { setMobileMenuOpen(false); setShowShopModal(true); }}
                      className="w-full text-left p-4 border-2 border-[#141414] bg-[#141414] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-white hover:text-[#141414] transition-all"
                    >
                      Pricing
                    </button>
                    <button
                      onClick={() => { setMobileMenuOpen(false); setShowRequestModal(true); }}
                      className="w-full text-left p-4 border-2 border-[#141414] bg-white text-[#141414] text-[11px] font-bold uppercase tracking-wider hover:bg-[#141414] hover:text-white transition-all"
                    >
                      Submit Request
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <UserHistoryModal
        isOpen={userHistoryOpen}
        onClose={() => setUserHistoryOpen(false)}
        token={user?.token}
        onRestore={restoreHistoryAndRun}
      />
      <AdminPanel
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        token={user?.isAdmin ? user.token : null}
        requests={adminRequests}
        loadingReqs={loadingRequests}
        deleteRequest={deleteAdminRequest}
        updateRequestStatus={updateAdminRequestStatus}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <section className="relative bg-white border border-[#141414] overflow-hidden">
            <div className="flex border-b border-[#141414]">
              <button
                onClick={() => setSidebarTab('source')}
                className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  sidebarTab === 'source' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-gray-50 border-r border-[#141414]'
                }`}
              >
                Source
              </button>
              <button
                onClick={() => {
                  if (!user) setShowGuestFeatureLock(true);
                  else setSidebarTab('filter');
                }}
                className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                  sidebarTab === 'filter' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-gray-50 border-r border-[#141414]'
                } ${!user ? 'opacity-60' : ''}`}
              >
                Filter
                {!user && <Lock className="w-3 h-3 text-blue-600" />}
              </button>
              <button
                onClick={() => {
                  if (!user) setShowGuestFeatureLock(true);
                  else setSidebarTab('export');
                }}
                className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
                  sidebarTab === 'export' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-gray-50'
                } ${!user ? 'opacity-60' : ''}`}
              >
                Export
                {!user && <Lock className="w-3 h-3 text-blue-600" />}
              </button>
            </div>
            
            <div className="p-6 pt-4 relative">
              {!user && showGuestFeatureLock && (
                <div className="absolute inset-0 z-[30] bg-white/80 backdrop-blur-[1px] flex items-center justify-center p-6 text-center select-none">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white border-2 border-[#141414] p-6 shadow-[6px_6px_0px_#141414] flex flex-col items-center gap-4 max-w-[200px] relative"
                  >
                    <button 
                      onClick={() => setShowGuestFeatureLock(false)}
                      className="absolute top-4 right-4 text-[#141414] hover:opacity-60 z-10"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="w-12 h-12 bg-blue-50 border-2 border-blue-600 rounded-full flex items-center justify-center">
                      <Lock className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-widest text-[#141414]">
                        {(guestTokens < getGenerateTokenCost(paperLinks.length) && paperLinks.length > 0) ? 'Insufficient Tokens' : 'Locked Content'}
                      </p>
                      <p className="text-[9px] font-mono leading-tight text-[#141414]">
                        {(guestTokens < getGenerateTokenCost(paperLinks.length) && paperLinks.length > 0)
                          ? `This action requires ${getGenerateTokenCost(paperLinks.length)} tokens. You only have ${guestTokens}. Login to receive 15 free tokens.` 
                          : 'Feature restricted. Login to unlock specific topic filtering and exporting.'}
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        setUserModalMode('login');
                        setUserModalOpen(true);
                      }}
                      className="w-full bg-[#141414] text-white py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-colors"
                    >
                      LOGIN NOW
                    </button>
                  </motion.div>
                </div>
              )}
              {sidebarTab === 'source' ? (
                <div className="space-y-3">
                  <div className="flex justify-end -mt-2 mb-1">
                    <button 
                       onClick={() => setShowInfoModal(true)}
                       className="text-blue-600 hover:text-[#141414] transition-colors"
                     >
                       <span className="text-[8px] font-black uppercase tracking-widest">How to use</span>
                     </button>
                  </div>
                  <div className="space-y-[5px]">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 block">Qualification</label>
                    <div className="flex flex-wrap gap-1">
                      {QUALIFICATION_LEVELS.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setQualificationLevel(q.id)}
                          disabled={loading}
                          className={`flex-1 min-w-[5.5rem] border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide ${
                            qualificationLevel === q.id
                              ? 'bg-[#141414] text-white border-[#141414]'
                              : 'border-[#141414] border-opacity-30 hover:bg-gray-100'
                          }`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-[5px]">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 flex items-center gap-1">
                      Syllabus
                    </label>
                    <div className="relative">
                      <input
                        value={syllabusSearch}
                        onChange={(e) => setSyllabusSearch(e.target.value)}
                        disabled={loading}
                        placeholder="Search subject or code"
                        className="w-full p-2 pr-8 border border-[#141414] border-opacity-20 focus:border-opacity-100 outline-none text-xs"
                      />
                      <Search className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-[#141414]" />
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-[#141414] border-opacity-10">
                      {filteredSyllabusOptions.map((item) => (
                        <button
                          key={`${item.code}-${item.label}`}
                          onClick={() => selectSyllabus(item)}
                          disabled={item.unavailable}
                          className={`w-full text-left px-2 py-1.5 text-[11px] border-b border-[#141414] border-opacity-10 last:border-b-0 ${
                            selectedSyllabusCode === item.code
                              ? 'bg-[#141414] text-white'
                              : item.unavailable
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-gray-100'
                          }`}
                        >
                          {item.label}{item.unavailable ? ' (No content)' : ''}
                        </button>
                      ))}
                      {!filteredSyllabusOptions.length && (
                        <div className="px-2 py-2 text-[11px] opacity-60">
                          {refreshedSyllabusCodes === undefined
                            ? 'Loading subject list…'
                            : refreshedSyllabusCodes !== null && refreshedSyllabusCodes.length === 0
                              ? 'No subjects in the shared catalog yet.'
                              : 'No matching syllabus found.'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-[5px]">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 block">Session letters</label>
                    <div className="grid grid-cols-7 gap-1">
                      {SESSION_OPTIONS.map((session) => (
                        <button
                          key={session}
                          onClick={() => toggleSession(session)}
                          className={`border p-1 text-[10px] font-bold uppercase ${selectedSessions.includes(session) ? 'bg-[#141414] text-white border-[#141414]' : 'border-[#141414] border-opacity-30 hover:bg-gray-100'}`}
                        >
                          {session}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-[5px]">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 block">Paper variant</label>
                    {resolvedVariantOptions.length === 0 ? (
                      <p className="text-[10px] font-mono text-blue-600 font-bold text-center">
                        Please select a year.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {resolvedVariantOptions.map((variant) => (
                          <button
                            key={variant}
                            type="button"
                            onClick={() => toggleVariant(variant)}
                            className={`border p-2 text-[10px] font-bold uppercase ${selectedVariants.includes(variant) ? 'bg-[#141414] text-white border-[#141414]' : 'border-[#141414] border-opacity-30 hover:bg-gray-100'}`}
                          >
                            {variant}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-[5px]">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 block">Year Range</label>
                    <input
                      value={yearRange}
                      onChange={(e) => {
                        const val = e.target.value;
                        setYearRange(val);
                        const parts = val.split('-').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));
                        if (parts.length === 2) {
                          setStartYear(Math.min(...parts));
                          setEndYear(Math.max(...parts));
                        } else if (parts.length === 1 && /^\d{4}$/.test(val.trim())) {
                          setStartYear(parts[0]);
                          setEndYear(parts[0]);
                        }
                      }}
                      disabled={loading}
                      placeholder="2017-2026 or 2026"
                      className="w-full p-2 border border-[#141414] border-opacity-20 focus:border-opacity-100 outline-none text-xs"
                    />
                  </div>
                  
                  <div className="pt-2 space-y-4">
                    <div className="flex flex-col gap-2">
                        <button
                          onClick={handleProcessLinks}
                          disabled={
                            loading ||
                            (!user && guestTokens < getGenerateTokenCost(paperLinks.length)) ||
                            !selectedSyllabusCode.trim() ||
                            selectedSessions.length === 0 ||
                            selectedVariants.length === 0
                          }
                          className="w-full border border-[#141414] bg-[#141414] text-white p-3 text-[11px] font-bold uppercase hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          <Zap className="w-4 h-4" />
                          Generate {paperLinks.length > 0 ? (
                            `(${getGenerateTokenCost(paperLinks.length)} ${getGenerateTokenCost(paperLinks.length) === 1 ? 'TOKEN' : 'TOKENS'})`
                          ) : ''}
                        </button>
                    </div>

                    {(status || paperLinks.length > 0) && (
                      <p
                        className={`text-[10px] font-mono text-center text-blue-600 break-words [overflow-wrap:anywhere] uppercase font-bold tracking-tight ${loading ? 'animate-pulse' : ''}`}
                      >
                        {status || `${paperLinks.length} QP FOUND`}
                      </p>
                    )}
                  </div>
                </div>
              ) : sidebarTab === 'filter' ? (
                <div className="space-y-5">
                  <div className="space-y-[5px]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-50">Topicwise AI Filter</h3>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={handleFilterWithAI}
                        disabled={isAutoMapped || topicsLoading || !user || !selectedSyllabusCode || questions.length === 0}
                        className="flex-1 px-3 py-2.5 border border-[#141414] bg-[#141414] text-white text-[10px] font-bold uppercase hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {topicsLoading ? (
                          'Processing...'
                        ) : isAutoMapped ? (
                          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Filtered</span>
                        ) : (
                          <>
                            <Filter className="w-3.5 h-3.5" />
                            {`Filter (10 Tokens)`}
                          </>
                        )}
                      </button>
                      {(topicsLoading || topics.length > 0) && (
                        <p className={`text-[10px] font-mono text-center text-blue-600 uppercase font-bold tracking-tight ${topicsLoading ? 'animate-pulse' : ''}`}>
                          {topicsLoading ? (topicsStatus || 'LOADING...') : `${topics.length} TOPICS FOUND`}
                        </p>
                      )}

                        {questions.length === 0 && user && (
                          <div className="text-center">
                            <p className="text-[10px] font-mono uppercase text-blue-600 font-bold">Generate Papers First</p>
                          </div>
                        )}

                      {topicsError && (
                        <p className={`text-[10px] font-mono text-center text-red-600 uppercase font-bold tracking-tight`}>{topicsError}</p>
                      )}
                    </div>
                  </div>

                  {topics.length > 0 && (
                    <div className="space-y-[5px] pt-4 border-t border-[#141414] border-opacity-10">
                      <label className="text-[10px] font-bold uppercase opacity-50 block">Select topics:</label>
                      <div className="grid gap-1 max-h-96 overflow-y-auto pr-1">
                        {topics.map(t => (
                          <button 
                            key={t.unitId}
                            onClick={() => toggleTopicFilter(t.unitId)}
                            className={`px-3 py-2 text-[10px] border font-bold text-left uppercase transition-colors ${selectedTopicFilters.includes(t.unitId) ? 'bg-[#141414] text-white border-[#141414]' : 'bg-transparent text-[#141414] border-[#141414] border-opacity-20 hover:border-opacity-100 hover:bg-gray-50'}`}
                          >
                            <span className="opacity-40 mr-2">{t.unitId}</span> {t.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-[5px]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-50">Bulk Export</h3>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleExport}
                        disabled={filteredQuestions.length === 0}
                        className="flex-1 px-3 py-2.5 border border-[#141414] bg-[#141414] text-white text-[10px] font-bold uppercase hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Export {selectedQuestionIds.length > 0 ? `(${selectedQuestionIds.length})` : ''}
                      </button>

                      {questions.length === 0 && user && (
                        <div className="text-center">
                          <p className="text-[10px] font-mono uppercase text-blue-600 font-bold">Generate Papers First</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {filteredQuestions.length > 0 && (
                    <div className="space-y-[5px] pt-4 border-t border-[#141414] border-opacity-10">
                      <div 
                        onClick={() => {
                          if (selectedQuestionIds.length === filteredQuestions.length) {
                            setSelectedQuestionIds([]);
                          } else {
                            setSelectedQuestionIds(filteredQuestions.map(q => q.id));
                          }
                        }}
                        className="flex items-center gap-3 p-3 border border-[#141414] bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                      >
                         <div className="w-4 h-4 border border-[#141414] flex items-center justify-center bg-white">
                            {selectedQuestionIds.length === filteredQuestions.length && filteredQuestions.length > 0 && (
                              <div className="w-2.5 h-2.5 bg-[#141414]" />
                            )}
                         </div>
                         <span className="text-[10px] font-bold uppercase tracking-widest">Select All ({filteredQuestions.length})</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {questions.length === 0 && !loading ? (
            <div className="h-[600px] border-2 border-dashed border-[#141414] border-opacity-20 flex flex-col items-center justify-center text-center p-12 opacity-40">
              <FileText className="w-16 h-16 mb-4" />
              <h3 className="text-xl font-serif italic">No questions extracted yet</h3>
              <p className="text-sm max-w-xs">Choose syllabus, sessions, years and paper variants to auto-fetch papers and extract question images.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-[#141414] pb-3 gap-3">
                <h2 className="text-xl font-serif italic">
                  {selectedSyllabusLabel}
                </h2>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <p className="text-[10px] font-mono uppercase opacity-50 shrink-0">
                    {filteredQuestions.length} Results Found
                  </p>
                </div>
              </div>



              <div className="grid gap-4">
                {filteredQuestions.map((q) => (
                  <div 
                    key={q.id}
                    onClick={() => {
                      if (isPhoneDevice()) openMobileViewerForQuestion(q);
                    }}
                    className={`group relative bg-white border border-[#141414] p-6 transition-all ${isPhoneDevice() ? 'cursor-pointer hover:shadow-lg' : ''} ${selectedQuestionIds.includes(q.id) ? 'shadow-[4px_4px_0px_#2563eb1a] border-blue-600/30' : ''}`}
                  >
                    {sidebarTab === 'export' && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedQuestionIds(prev => 
                            prev.includes(q.id) ? prev.filter(id => id !== q.id) : [...prev, q.id]
                          );
                        }}
                        className={`absolute top-6 right-6 w-6 h-6 border-2 border-[#141414] flex items-center justify-center cursor-pointer transition-colors z-10 ${
                          selectedQuestionIds.includes(q.id) ? 'bg-[#141414] border-[#141414]' : 'bg-white border-opacity-20 hover:border-opacity-100'
                        }`}
                      >
                        {selectedQuestionIds.includes(q.id) && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </div>
                    )}

                    {selectedTopicFilters.length > 0 && q.topicId && !/^\d{4}$/.test(q.topicId) && (
                      <div className="absolute top-0 left-0 bg-[#2563eb] text-white px-4 py-1.5 text-[11px] font-bold font-mono border-b border-r border-[#2563eb] z-10 shadow-sm">
                        {q.topicId}
                      </div>
                    )}

                    <div className="flex items-start mb-4 mt-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-2xl font-serif font-bold italic text-[#141414]">
                          {selectedTopicFilters.length > 0 && q.label ? `Q${q.label}` : `Q${q.number}`}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span
                            className="text-xs font-bold uppercase tracking-tight bg-gray-100 px-3 py-1.5 inline-block max-w-[min(100%,360px)] truncate font-mono normal-case"
                            title={q.paperId}
                          >
                            {q.paperId}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {!isPhoneDevice() && q.questionImages?.length ? (
                      <details
                        className="mb-4 border border-[#141414] border-opacity-10 bg-[#f9f9f9] p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <summary
                          className="text-[10px] font-bold uppercase cursor-pointer hover:underline"
                          onClick={(e) => {
                            if (isPhoneDevice()) {
                              e.preventDefault();
                              e.stopPropagation();
                              setMobileCompareViewer(buildMobileComparePayload(q));
                            }
                          }}
                        >
                          Show Question
                        </summary>
                        <div className="mt-3">
                          {q.parts && q.parts.length > 1 ? (
                            <div>
                              {q.parts.map((part, partIdx) => (
                                <div key={`${q.id}-part-${partIdx}`}>
                                  {part.topicId && (
                                    <span className="text-[10px] font-bold font-mono bg-[#2563eb] text-white px-2 py-0.5 inline-block mb-1 mt-2">{part.topicId}</span>
                                  )}
                                  {part.questionImages?.map((img, idx) => (
                                    <img
                                      key={`${q.id}-part-${partIdx}-${idx}`}
                                      src={img}
                                      alt={`Question ${q.number}`}
                                      className="w-[60%] lg:w-[70%] cursor-zoom-in block"
                                      loading="lazy"
                                      onClick={(e) => { e.stopPropagation(); openPreview(part.questionImages!, idx); }}
                                    />
                                  ))}
                                </div>
                              ))}
                            </div>
                          ) : (
                            q.questionImages.map((img, idx) => (
                              <img
                                key={`${q.id}-qp-${idx}`}
                                src={img}
                                alt={`Question ${q.number}`}
                                className="w-[60%] lg:w-[70%] border border-[#141414] border-opacity-10 cursor-zoom-in"
                                loading="lazy"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isPhoneDevice()) {
                                    setMobileCompareViewer(buildMobileComparePayload(q));
                                  } else {
                                    openPreview(q.questionImages || [img], idx);
                                  }
                                }}
                              />
                            ))
                          )}
                        </div>
                      </details>
                    ) : !isPhoneDevice() && q.questionImage ? (
                      <details
                        className="mb-4 border border-[#141414] border-opacity-10 bg-[#f9f9f9] p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <summary
                          className="text-[10px] font-bold uppercase cursor-pointer hover:underline"
                          onClick={(e) => {
                            if (isPhoneDevice()) {
                              e.preventDefault();
                              e.stopPropagation();
                              setMobileCompareViewer(buildMobileComparePayload(q));
                            }
                          }}
                        >
                          Show Question
                        </summary>
                        <div className="mt-3">
                          <img
                            src={q.questionImage}
                            alt={`Question ${q.number}`}
                            className="w-[60%] lg:w-[70%] border border-[#141414] border-opacity-10 cursor-zoom-in"
                            loading="lazy"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPhoneDevice()) {
                                setMobileCompareViewer(buildMobileComparePayload(q));
                              } else {
                                openPreview([q.questionImage!], 0);
                              }
                            }}
                          />
                        </div>
                      </details>
                    ) : !isPhoneDevice() ? (
                      <p className="text-sm leading-relaxed mb-4 font-medium whitespace-pre-wrap">
                        {q.text}
                      </p>
                    ) : (
                      <div className="mb-4" />
                    )}

                    {!isPhoneDevice() && (q.markingSchemeImages?.length || q.markingSchemeImage || q.markingScheme) && (
                      <details 
                        className="mb-4 border border-[#141414] border-opacity-10 bg-[#f9f9f9] p-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <summary className="text-[10px] font-bold uppercase cursor-pointer hover:underline flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                          Show Mark Scheme
                        </summary>
                        <div className="mt-3 text-xs font-mono whitespace-pre-wrap border-t border-[#141414] border-opacity-10 pt-3">
                          {q.markingSchemeImages?.length ? (
                            <div className="space-y-3">
                              {q.markingSchemeImages.map((img, idx) => (
                                <img
                                  key={`${q.id}-ms-${idx}`}
                                  src={img}
                                  alt={`Mark scheme for question ${q.number} part ${idx + 1}`}
                                  className="w-[60%] lg:w-[70%] border border-[#141414] border-opacity-10 cursor-zoom-in"
                                  loading="lazy"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isPhoneDevice()) {
                                      setMobileCompareViewer(buildMobileComparePayload(q));
                                    } else {
                                      openPreview(q.markingSchemeImages || [img], idx);
                                    }
                                  }}
                                />
                              ))}
                            </div>
                          ) : q.markingSchemeImage ? (
                            <img
                              src={q.markingSchemeImage}
                              alt={`Mark scheme for question ${q.number}`}
                              className="w-[60%] lg:w-[70%] border border-[#141414] border-opacity-10 cursor-zoom-in"
                              loading="lazy"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isPhoneDevice()) {
                                  setMobileCompareViewer(buildMobileComparePayload(q));
                                } else {
                                  openPreview([q.markingSchemeImage!], 0);
                                }
                              }}
                            />
                          ) : (
                            <span className="text-2xl font-bold font-mono text-[#141414] tracking-wide">
                              {q.markingScheme}
                            </span>
                          )}
                        </div>
                      </details>
                    )}

                    <div className="flex items-center gap-2 text-[10px] font-mono opacity-40 uppercase">
                      <ChevronRight className="w-3 h-3" />
                      {isPhoneDevice()
                        ? 'Tap card to open question + mark scheme'
                        : 'Expand sections to view question and mark scheme'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-12 border-t border-[#141414] p-8 bg-white flex flex-row items-center justify-between gap-6">
        <p className="text-xs text-gray-400 font-mono whitespace-nowrap">
          Paperra &copy; 2026
        </p>
        <div className="flex items-center">
          <a 
            href="https://www.linkedin.com/in/zunnoon-jawad-3b236a37b/" 
            target="_blank" 
            rel="noreferrer"
            className="opacity-50 hover:opacity-100 transition-opacity"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
          </a>
        </div>
      </footer>

      <AnimatePresence>
        {previewImages && (
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closePreview}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-[95vw] max-h-[95vh] lg:max-w-[76vw] lg:max-h-[76vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute -top-10 right-0 text-white hover:text-gray-200"
                onClick={closePreview}
                aria-label="Close preview"
              >
                <X className="w-7 h-7" />
              </button>
              <img
                src={previewImages[previewIndex]}
                alt="Preview"
                className="max-w-[95vw] max-h-[95vh] lg:max-w-[76vw] lg:max-h-[76vh] object-contain border border-white/20 bg-white"
              />
              {previewImages.length > 1 && (
                <p className="text-white/80 text-xs text-center mt-2">
                  {previewIndex + 1} / {previewImages.length}
                </p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileCompareViewer && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setMobileCompareViewer(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="w-full sm:max-w-2xl max-h-[92vh] bg-white overflow-y-auto p-4 sm:rounded-lg"
              onClick={(e) => e.stopPropagation()}
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 28, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-white py-1">
                <h3 className="text-sm font-bold uppercase" />
                <div className="flex items-center gap-2">
                  {(mobileCompareViewer.markSchemes.length > 0 || mobileCompareViewer.markSchemeText) && (
                    <button
                      className="text-[10px] font-bold uppercase border border-[#141414] px-2 py-1 hover:bg-gray-100"
                      onClick={() => setShowMobileMarkScheme((prev) => !prev)}
                    >
                      {showMobileMarkScheme ? 'Hide MS' : 'Show MS'}
                    </button>
                  )}
                  <button
                    className="text-[#141414] hover:opacity-70"
                    onClick={() => setMobileCompareViewer(null)}
                    aria-label="Close mobile compare viewer"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                <section>
                  <div className="space-y-3">
                    {mobileCompareViewer.questions.map((img, idx) => (
                      <img
                        key={`mobile-q-${idx}`}
                        src={img}
                        alt="Question"
                        className="w-full border border-[#141414] border-opacity-10"
                        loading="lazy"
                      />
                    ))}
                  </div>
                </section>

                <AnimatePresence initial={false}>
                  {showMobileMarkScheme &&
                    (mobileCompareViewer.markSchemes.length > 0 || mobileCompareViewer.markSchemeText) && (
                    <motion.section
                      initial={{ opacity: 0, y: 12, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: 8, height: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <p className="text-[10px] font-bold uppercase mb-2">Mark Scheme</p>
                      {mobileCompareViewer.markSchemeText && !mobileCompareViewer.markSchemes.length ? (
                        <p className="text-xl font-bold font-mono text-[#141414] py-2">
                          {mobileCompareViewer.markSchemeText}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {mobileCompareViewer.markSchemes.map((img, idx) => (
                            <img
                              key={`mobile-ms-${idx}`}
                              src={img}
                              alt="Mark scheme"
                              className="w-full border border-[#141414] border-opacity-10"
                              loading="lazy"
                            />
                          ))}
                        </div>
                      )}
                    </motion.section>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <UserAuthModal 
        open={userModalOpen} 
        onClose={() => setUserModalOpen(false)} 
        onLoginSuccess={handleLoginSuccess}
        mode={userModalMode}
      />
      <AnimatePresence>
        {showPricingModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white border-2 border-[#141414] p-8 shadow-2xl w-full max-w-sm relative"
            >
              <button 
                onClick={() => setShowPricingModal(false)}
                className="absolute top-4 right-4 text-[#141414] hover:opacity-60"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b-2 border-[#141414] pb-2">
                Current Rates
              </h2>
              
              <div className="space-y-6">

                <div className="space-y-2">
                  <div className="flex items-center justify-between font-bold text-sm">
                     <span className="uppercase tracking-wide">Question Extraction</span>
                     <span className="text-blue-600 font-mono">1 Token / Paper</span>
                  </div>
                  <p className="text-[11px] font-mono opacity-70 leading-relaxed">
                    Parsing exam papers and extracting questions from the Cambridge database.
                  </p>
                </div>

                <div className="space-y-2 pt-4 border-t border-[#141414]/10">
                  <div className="flex items-center justify-between font-bold text-sm">
                     <span className="uppercase tracking-wide">Topicwise AI Filter</span>
                     <span className="text-blue-600 font-mono">10 Tokens / Filter</span>
                  </div>
                  <p className="text-[11px] font-mono opacity-70 leading-relaxed">
                    Deep AI classification of extracted questions by specific syllabus units.
                  </p>
                </div>

                <div className="space-y-2 pt-4 border-t border-[#141414]/10">
                  <div className="flex items-center justify-between font-bold text-sm">
                     <span className="uppercase tracking-wide">Requests</span>
                     <span className="text-blue-600 font-mono">5 Tokens</span>
                  </div>
                  <p className="text-[11px] font-mono opacity-70 leading-relaxed">
                    Feature requests & subject additions: Blocked for Free. Available for Starter and Pro.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInfoModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white border-2 border-[#141414] p-8 shadow-2xl w-full max-w-md relative sm:max-h-[85vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowInfoModal(false)}
                className="absolute top-4 right-4 text-[#141414] hover:opacity-60"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b-2 border-[#141414] pb-2">
                What is Paperra?
              </h2>
              
              <div className="space-y-6">
                <p className="text-sm border-l-4 border-blue-600 pl-4 py-1 font-medium bg-blue-50/50 italic leading-relaxed">
                  Paperra is an AI-powered extraction engine designed to help teachers and students find specific questions from Cambridge past papers in seconds.
                </p>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-50">How to use</h3>
                  
                  <div className="space-y-3">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-none border-2 border-[#141414] flex items-center justify-center font-bold text-xs bg-white">1</div>
                      <div>
                        <p className="font-bold text-sm uppercase text-blue-600">Source</p>
                        <p className="text-[11px] opacity-70 font-mono">Select your syllabus, year range, and exam variants in the Source Tab.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-none border-2 border-[#141414] flex items-center justify-center font-bold text-xs bg-white">2</div>
                      <div>
                        <p className="font-bold text-sm uppercase text-blue-600">Generate</p>
                        <p className="text-[11px] opacity-70 font-mono">Click 'Generate'. Paperra will find and parse every question from matching past papers with its corresponding mark scheme.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-none border-2 border-[#141414] flex items-center justify-center font-bold text-xs bg-white">3</div>
                      <div>
                        <p className="font-bold text-sm uppercase text-blue-600">Filter</p>
                        <p className="text-[11px] opacity-70 font-mono">Use the Filter Tab to automatically categorize every extracted question by specific syllabus topics.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-none border-2 border-[#141414] flex items-center justify-center font-bold text-xs bg-white">4</div>
                      <div>
                        <p className="font-bold text-sm uppercase text-blue-600">History</p>
                        <p className="text-[11px] opacity-70 font-mono">Review questions on-screen or restore them later from your 'History' tab in your Profile.</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-none border-2 border-[#141414] flex items-center justify-center font-bold text-xs bg-white">5</div>
                      <div>
                        <p className="font-bold text-sm uppercase text-blue-600">Export</p>
                        <p className="text-[11px] opacity-70 font-mono">Select specific questions and export them as a high-quality PDF document (Pro only).</p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-none border-2 border-[#141414] flex items-center justify-center font-bold text-xs bg-white">6</div>
                      <div>
                        <p className="font-bold text-sm uppercase text-blue-600">Request</p>
                        <p className="text-[11px] opacity-70 font-mono">Need a syllabus or feature? Submit a request to the team via your Profile tab.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#141414]/10">
                  <p className="text-[10px] font-mono text-center opacity-40 uppercase tracking-tighter">
                    Built for speed. Powered by AI.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AlertModal 
        message={alertMessage} 
        onClose={() => { setAlertMessage(null); setAlertCanUpgrade(false); setAlertType('error'); }} 
        onUpgrade={alertCanUpgrade ? () => setShowShopModal(true) : undefined}
        type={alertType}
      />

      <ProfileModal 
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onLogout={handleLogout}
        onOpenHistory={() => setUserHistoryOpen(true)}
        onOpenAdmin={() => setAdminOpen(true)}
        onAlert={setAlertMessage}
        onAlertUpgrade={(msg: string) => { setAlertMessage(msg); setAlertCanUpgrade(true); }}
        onUpgrade={() => { setShowProfileModal(false); setShowShopModal(true); }}
        onOpenRequest={() => setShowRequestModal(true)}
        onOpenBugReport={() => setShowBugReportModal(true)}
        onRefresh={refreshUserData}
      />

      <BugReportModal 
        isOpen={showBugReportModal}
        onClose={() => setShowBugReportModal(false)}
        user={user}
        onAlert={setAlertMessage}
      />

      <RequestModal 
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        user={user}
        onUpdateTokens={(newCount) => user && setAuthState({ ...user, tokens: newCount })}
        onAlert={setAlertMessage}
        onAlertUpgrade={(msg: string) => { setAlertMessage(msg); setAlertCanUpgrade(true); }}
      />

      <ShopModal
        isOpen={showShopModal}
        onClose={() => setShowShopModal(false)}
        user={user}
        onUpdateTokens={(newCount) => user && setAuthState({ ...user, tokens: newCount })}
        onOpenAuth={() => setUserModalOpen(true)}
        onAlert={setAlertMessage}
        onOpenInfo={() => setShowPricingModal(true)}
      />

      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        tokens={15}
      />
      <WelcomeModal
        isOpen={showGuestWelcome}
        onClose={() => setShowGuestWelcome(false)}
        tokens={3}
      />
    </div>
  );
}
