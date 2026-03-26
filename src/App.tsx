import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  FileText, 
  ChevronRight, 
  BookOpen, 
  CheckCircle2,
  Link as LinkIcon,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const YEAR_OPTIONS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);

export default function App() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminToken, setAdminTokenState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('paperra_admin_token');
    } catch {
      return null;
    }
  });
  const adminIconClicks = useRef({ n: 0, t: 0 });

  const setAdminToken = (token: string | null) => {
    try {
      if (token) sessionStorage.setItem('paperra_admin_token', token);
      else sessionStorage.removeItem('paperra_admin_token');
    } catch {
      /* ignore */
    }
    setAdminTokenState(token);
  };

  const onPaperraIconClick = () => {
    const now = Date.now();
    if (now - adminIconClicks.current.t > 700) adminIconClicks.current.n = 0;
    adminIconClicks.current.t = now;
    adminIconClicks.current.n += 1;
    if (adminIconClicks.current.n >= 3) {
      adminIconClicks.current.n = 0;
      setAdminOpen(true);
    }
  };

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qualificationLevel, setQualificationLevel] = useState<QualificationLevel>('igcse');
  const [selectedSyllabusCode, setSelectedSyllabusCode] = useState('');
  const [syllabusSearch, setSyllabusSearch] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<string[]>(['W']);
  const [startYear, setStartYear] = useState(2025);
  const [endYear, setEndYear] = useState(2025);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([
    ...DEFAULT_VARIANTS_BEFORE_CATALOG,
  ]);
  /** `undefined` = fetching; `null` = no Turso (show all subjects); `[]` = none refreshed; else codes from `syllabus_catalog_refresh` */
  const [refreshedSyllabusCodes, setRefreshedSyllabusCodes] = useState<string[] | null | undefined>(undefined);
  /** `undefined` = fetching; `null` = no Turso rows for syllabus (show full static list); `[]` = catalog has rows but no QP available; else only variants that worked in shared DB */
  const [catalogQpVariants, setCatalogQpVariants] = useState<string[] | null | undefined>(undefined);
  const [previewImages, setPreviewImages] = useState<string[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [mobileCompareViewer, setMobileCompareViewer] = useState<{
    title: string;
    questions: string[];
    markSchemes: string[];
    markSchemeText?: string;
  } | null>(null);
  const [showMobileMarkScheme, setShowMobileMarkScheme] = useState(false);

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
    /** Arabic/Hebrew-heavy layout — question numbers may be in the right margin. */
    rtlLayout: boolean;
  };

  const cleanPdfTextForAI = (text: string) => {
    const footerPatterns = [
      /©\s*UCLES[^\n\r]*/gi,
      /\[\s*Turn\s*over[^\]]*\]/gi,
      /\bTurn\s*over\b/gi,
      /\bBLANK\s+PAGE\b/gi,
      /\bPage\s+\d+\b/gi,
      /\b\d+\s*0?4?7?8\/\d{2}\b/gi
    ];

    let cleaned = text;
    footerPatterns.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, " ");
    });

    // Remove common exam boilerplate blocks that add tokens but not value.
    cleaned = cleaned.replace(/READ THESE INSTRUCTIONS FIRST[\s\S]{0,1400}?Do not use an erasable pen[.\s]*/gi, " ");
    cleaned = cleaned.replace(/Answer all questions[.\s]*/gi, " ");
    cleaned = cleaned.replace(/The number of marks is given in brackets[.\s]*/gi, " ");

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
        if (mode === 'ms' && msMatch?.[1]) number = Number(msMatch[1]);
        if (mode === 'qp' && qpMainMatch?.[1]) number = Number(qpMainMatch[1]);
        if (mode === 'qp' && !qpMainMatch && qpSubpartOnlyMatch) number = 0; // resolved later using previous main number

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

      const footerCandidates = textItems
        .filter((item) => {
          const t = item.str.trim();
          return (
            /©\s*UCLES/i.test(t) ||
            /Page\s+\d+\s+of\s+\d+/i.test(t) ||
            /^\d{4}\/\d{2}\/[A-Z]\/[A-Z]\/\d{2}$/i.test(t) ||
            /\[?\s*Turn\s*over\s*\]?/i.test(t) ||
            (/^\d{1,2}$/.test(t) && item.y > viewport.height * 0.88 && item.x > viewport.width * 0.35 && item.x < viewport.width * 0.65)
          );
        })
        .map((item) => item.y)
        .filter((y) => y > viewport.height * 0.65)
        .sort((a, b) => a - b);
      const footerY = footerCandidates.length ? footerCandidates[0] : undefined;

      const contentItems = textItems.filter((item) => {
        const t = item.str.trim();
        if (!t) return false;
        if (headerCutY !== undefined && item.y < headerCutY) return false;
        if (/©\s*UCLES/i.test(t)) return false;
        if (/Page\s+\d+\s+of\s+\d+/i.test(t)) return false;
        if (/Turn\s*over/i.test(t)) return false;
        if (/^\d{4}\/\d{2}\/[A-Z]\/[A-Z]\/\d{2}$/i.test(t)) return false;
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
      const contentBottomY = contentItems.length
        ? Math.min(
            viewport.height,
            Math.max(...contentItems.map((item) => item.y + item.height)) + Math.max(8, viewport.height * 0.01)
          )
        : viewport.height * 0.9;

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
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r < 242 || g < 242 || b < 242) darkPixels++;
      }
      return darkPixels > Math.max(2, Math.floor(width * 0.0025));
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
      if (mode !== 'qp') return allAnchors;
      let currentMain = 0;
      const resolved: Array<{ number: number; label: string; y: number; pageIndex: number }> = [];
      allAnchors.forEach((a) => {
        if (a.number > 0) {
          currentMain = a.number;
          resolved.push(a);
          return;
        }
        if (currentMain > 0) {
          resolved.push({ ...a, number: currentMain, label: `${currentMain}${a.label}` });
        }
      });
      return resolved;
    })();

    const filteredAnchors = resolvedAnchors.filter((a, idx) => {
      if (idx === 0) return true;
      const prev = resolvedAnchors[idx - 1];
      if (a.number <= 0) return false;
      return !(a.label === prev.label && a.pageIndex === prev.pageIndex && Math.abs(a.y - prev.y) < 20);
    });

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
        return;
      }

      showStatus(`Processing ${fileName}`);
      const msPagesAll = await renderPdfPages(pdf, 2, 'ms');
      const msPages = trimMsPrefacePages(filterExamBlankPages(msPagesAll, fileName));
      const msSegments = extractQuestionImageSegments(msPages, 'ms');
      const msGrouped = new Map<number, string[]>();
      msSegments.forEach((segment) => {
        const arr = msGrouped.get(segment.number) || [];
        arr.push(segment.image);
        msGrouped.set(segment.number, arr);
      });

      const msByQuestion = new Map<string, string[]>();
      for (const [number, images] of msGrouped.entries()) {
        msByQuestion.set(String(number), images);
      }
      console.log("[MARKSCHEME_IMAGE_SEGMENT_RESULT]", {
        fileName,
        sourceUrl,
        segments: msSegments.length,
        groupedQuestions: msByQuestion.size,
      });
      
      setQuestions(prev => prev.map(q => {
        const qNumStr = q.number.toString();
        const msImages = msByQuestion.get(qNumStr);
        if (msImages?.length) {
          const stitched = msImages.length === 1 ? msImages[0] : undefined;
          return {
            ...q,
            markingSchemeImages: msImages,
            markingSchemeImage: stitched,
            markingScheme: undefined
          };
        }
        return q;
      }));
      return;
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

    const grouped = new Map<number, Array<{ image: string; text: string; marks: number }>>();
    extracted.forEach((seg: any) => {
      const arr = grouped.get(seg.number) || [];
      arr.push({ image: seg.image, text: seg.text, marks: seg.marks });
      grouped.set(seg.number, arr);
    });

    const categorized = [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, parts]) => {
        return {
          id: `${fileName}-${number}-${Math.random().toString(36).substr(2, 5)}`,
          number,
          text: parts.map((p) => p.text).join('\n\n'),
          marks: Math.max(...parts.map((p) => p.marks), 1),
          topicId: selectedSyllabusCode,
          paperId: fileName,
          questionImages: parts.map((p) => p.image),
          questionImage: parts.length === 1 ? parts[0].image : undefined
        };
      });

    setQuestions(prev => [...prev, ...categorized]);
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

  const buildPaperLinks = () => {
    if (!selectedSyllabusCode.trim()) return [];
    const fromYear = Math.max(MIN_YEAR, Math.min(startYear, endYear));
    const toYear = Math.max(MIN_YEAR, Math.max(startYear, endYear));
    const links = new Set<string>();

    for (let year = fromYear; year <= toYear; year += 1) {
      const yy = String(year).slice(-2);
      selectedSessions.forEach((session) => {
        selectedVariants.forEach((variant) => {
          const file = `${selectedSyllabusCode}_${session.toLowerCase()}${yy}_qp_${variant}.pdf`;
          links.add(`${BASE_PAPERS_URL}${file}`);
        });
      });
    }

    return Array.from(links);
  };

  const paperLinks = useMemo(
    () => buildPaperLinks(),
    [selectedSyllabusCode, startYear, endYear, selectedSessions, selectedVariants]
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

  const processGeneratedLinks = async (candidateLinks?: string[]) => {
    const links = candidateLinks ?? buildPaperLinks();
    if (!links.length) {
      setStatus('No QP links for the current selection (sessions × years × variants).');
      return;
    }

    setLoading(true);
    try {
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
                await processPDF(arrayBuffer, qpName, url, { suppressStatus: true });
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
        `Done. Tried ${totalAttempted} links (QP ${qpSucceeded}/${qpAttempted}, MS ${msSucceeded}/${msAttempted}). Failed: ${totalFailed}.`
      );
    } catch (error) {
      console.error(error);
      setStatus('Error: ' + (error as Error).message);
    } finally {
      setLoading(false);
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

  const isPhoneDevice = () => window.matchMedia('(max-width: 768px)').matches;

  const toggleSession = (session: string) => {
    setSelectedSessions((prev) =>
      prev.includes(session) ? prev.filter((s) => s !== session) : [...prev, session]
    );
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

  const filteredQuestions = questions;
  const selectedSyllabusLabel = getSyllabusLabel(selectedSyllabusCode);
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

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans">
      <header className="border-b border-[#141414] p-6 flex items-center bg-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPaperraIconClick}
            className="shrink-0 rounded-sm p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#141414]"
            aria-label="Paperra"
            title="Paperra"
          >
            <BookOpen className="w-12 h-12" strokeWidth={1.5} aria-hidden />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Paperra</h1>
            <p className="text-[10px] leading-snug font-mono opacity-60 italic max-w-md">
              Fetch past papers and extract questions and answers
              <br />
              for Cambridge O Level, IGCSE and A &amp; AS Level
            </p>
          </div>
        </div>
      </header>

      <AdminPanel
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        token={adminToken}
        onToken={setAdminToken}
      />

      <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <section className="relative bg-white border border-[#141414] p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest border-b border-[#141414] pb-2 flex items-center justify-between">
              Paper Source
              <LinkIcon className="w-3 h-3" />
            </h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase opacity-50">Qualification</label>
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
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase opacity-50 flex items-center gap-1">
                  Syllabus
                </label>
                <input
                  value={syllabusSearch}
                  onChange={(e) => setSyllabusSearch(e.target.value)}
                  disabled={loading}
                  placeholder="Search subject or code (e.g. Computer Science, 0478)"
                  className="w-full p-2 border border-[#141414] border-opacity-20 focus:border-opacity-100 outline-none text-xs"
                />
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

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase opacity-50">Session letters</label>
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

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase opacity-50">Paper variant</label>
                {resolvedVariantOptions.length === 0 ? (
                  <p className="text-[10px] font-mono text-amber-800">
                    No QP links marked available in the shared catalog for this syllabus. Run an admin link refresh for
                    this subject or choose another.
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

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase opacity-50">Start year</label>
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    disabled={loading}
                    className="w-full p-2 border border-[#141414] border-opacity-20 focus:border-opacity-100 outline-none text-xs"
                  >
                    {YEAR_OPTIONS.map((year) => <option key={`from-${year}`} value={year}>{year}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase opacity-50">End year</label>
                  <select
                    value={endYear}
                    onChange={(e) => setEndYear(Number(e.target.value))}
                    disabled={loading}
                    className="w-full p-2 border border-[#141414] border-opacity-20 focus:border-opacity-100 outline-none text-xs"
                  >
                    {YEAR_OPTIONS.map((year) => <option key={`to-${year}`} value={year}>{year}</option>)}
                  </select>
                </div>
              </div>

              <button
                onClick={handleProcessLinks}
                disabled={
                  loading ||
                  !selectedSyllabusCode.trim() ||
                  selectedSessions.length === 0 ||
                  selectedVariants.length === 0
                }
                className="w-full border border-[#141414] bg-[#141414] text-white p-2 text-[10px] font-bold uppercase hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Generate + Process ({generatedLinkCount} QP links)
              </button>

            </div>
            
            {status && (
              <p
                className={`text-[10px] font-mono text-center text-blue-600 break-words [overflow-wrap:anywhere] ${loading ? 'animate-pulse' : ''}`}
              >
                {status}
              </p>
            )}
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
              <div className="flex justify-between items-end border-b border-[#141414] pb-2">
                <h2 className="text-xl font-serif italic">
                  {selectedSyllabusLabel}
                </h2>
                <p className="text-[10px] font-mono uppercase opacity-50">{filteredQuestions.length} Results Found</p>
              </div>

              <div className="grid gap-4">
                {filteredQuestions.map((q) => (
                  <div 
                    key={q.id}
                    onClick={() => {
                      if (isPhoneDevice()) openMobileViewerForQuestion(q);
                    }}
                    className={`group relative bg-white border border-[#141414] p-6 transition-all ${isPhoneDevice() ? 'cursor-pointer hover:shadow-lg' : ''}`}
                  >
                    <div className="flex items-start mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-serif font-bold italic text-[#141414]">Q{q.number}</span>
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
                        <div className="mt-3 space-y-3">
                          {q.questionImages.map((img, idx) => (
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
                          ))}
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

      <footer className="mt-12 border-t border-[#141414] p-8 bg-white text-center">
        <p className="text-[10px] font-mono uppercase tracking-widest opacity-50">
          Powered by GPT-5 Nano · Paperra
        </p>
      </footer>

      {previewImages && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={closePreview}
        >
          <div
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
          </div>
        </div>
      )}

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
    </div>
  );
}
