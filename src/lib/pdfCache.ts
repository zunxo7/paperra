const DB_NAME = 'paperra_pdf_cache';
const STORE_NAME = 'pdfs';
const DB_VERSION = 1;
// Keep cached PDFs for 7 days
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'url' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedPdf(url: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(url);
      req.onsuccess = () => {
        const entry = req.result;
        if (!entry) return resolve(null);
        if (Date.now() - entry.cachedAt > MAX_AGE_MS) {
          // Expired — delete and treat as miss
          const delTx = db.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(url);
          return resolve(null);
        }
        resolve(entry.data);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedPdf(url: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ url, data, cachedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Non-fatal
  }
}
