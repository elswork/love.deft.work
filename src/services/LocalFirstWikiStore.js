/**
 * LocalFirstWikiStore.js
 *
 * Almacenamiento local-first en IndexedDB (con fallback a localStorage) para el
 * motor LM Wiki de love.deft.work:
 * - Instantánea local de notas y categorías (arranque instantáneo sin latencia ni red)
 * - Artículos wiki sintetizados por LM
 * - Registro cronológico tipo `log.md` (ingesta, auto-enlaces, síntesis, lint)
 * - Configuración del motor LM (local determinista / Ollama local / Gemini)
 */

const DB_NAME = 'love_lm_wiki_v1';
const DB_VERSION = 1;
const STORE_KV = 'kv';

const KEY_VAULT_CACHE = 'vault_snapshot_v1';
const KEY_SYNTHESES = 'wiki_syntheses_v1';
const KEY_WIKI_LOG = 'wiki_log_v1';
const KEY_LM_CONFIG = 'lm_config_v1';

export const DEFAULT_LM_CONFIG = Object.freeze({
  provider: 'local', // 'local' | 'ollama' | 'gemini'
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'qwen2.5:7b',
  apiKey: '',
  autoLinkThreshold: 0.08,
  autoCompileOnChange: true,
});

let dbPromise = null;

function openWikiDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openWikiDb();
  if (!db) {
    try {
      const raw = localStorage.getItem(`${DB_NAME}:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readonly');
      const req = tx.objectStore(STORE_KV).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key, value) {
  const payload = typeof structuredClone === 'function' ? structuredClone(value) : value;
  const db = await openWikiDb();
  if (!db) {
    try {
      localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).put(payload, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function loadLocalVaultSnapshot() {
  const data = await idbGet(KEY_VAULT_CACHE);
  if (!data || !Array.isArray(data.items)) return null;
  return data;
}

export async function saveLocalVaultSnapshot({ items = [], categoriesDocs = {} }) {
  return idbSet(KEY_VAULT_CACHE, {
    items,
    categoriesDocs,
    savedAt: Date.now(),
  });
}

export async function loadSavedSyntheses() {
  const list = await idbGet(KEY_SYNTHESES);
  return Array.isArray(list) ? list : [];
}

export async function saveSyntheses(list = []) {
  return idbSet(KEY_SYNTHESES, list.slice(0, 80));
}

export async function loadWikiLog() {
  const list = await idbGet(KEY_WIKI_LOG);
  return Array.isArray(list) ? list : [];
}

export async function appendWikiLogEntry(entry) {
  const current = await loadWikiLog();
  const next = [
    {
      id: `wlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      ...entry,
    },
    ...current,
  ].slice(0, 150);
  await idbSet(KEY_WIKI_LOG, next);
  return next;
}

export async function loadLmConfig() {
  const saved = await idbGet(KEY_LM_CONFIG);
  return { ...DEFAULT_LM_CONFIG, ...(saved || {}) };
}

export async function saveLmConfig(config) {
  const merged = { ...DEFAULT_LM_CONFIG, ...(config || {}) };
  await idbSet(KEY_LM_CONFIG, merged);
  return merged;
}

/**
 * Estima el uso de almacenamiento local del navegador (StorageManager API).
 */
export async function getStorageTelemetry() {
  const result = {
    engine: typeof indexedDB !== 'undefined' ? 'IndexedDB + Firestore Cache' : 'localStorage',
    usageBytes: 0,
    quotaBytes: 0,
    persisted: false,
  };
  try {
    if (navigator?.storage?.estimate) {
      const est = await navigator.storage.estimate();
      result.usageBytes = est.usage || 0;
      result.quotaBytes = est.quota || 0;
    }
    if (navigator?.storage?.persisted) {
      result.persisted = await navigator.storage.persisted();
    }
  } catch {
    // ignore browser restrictions
  }
  return result;
}

/**
 * Exporta toda la base LM Wiki (index.md + artículos compilados + fuentes + log.md)
 * en UTF-8 limpio usando TextEncoder para descarga local inmediata.
 */
export function buildWikiMarkdownBundle({ items = [], conceptPages = [], syntheses = [], wikiLog = [] }) {
  const now = new Date().toISOString();
  const lines = [
    `# love.deft.work · LM Wiki Snapshot (Local-First)`,
    '',
    `> Exportado el \`${now}\` · ${items.length} fuentes · ${conceptPages.length} páginas de concepto · ${syntheses.length} síntesis LM`,
    '',
    `## Índice Maestro (\`index.md\`)`,
    '',
  ];

  const byCat =
    typeof Object.groupBy === 'function'
      ? Object.groupBy(items, (it) => it.category || 'General')
      : items.reduce((acc, it) => {
          const k = it.category || 'General';
          (acc[k] ??= []).push(it);
          return acc;
        }, Object.create(null));

  Object.keys(byCat)
    .toSorted((a, b) => a.localeCompare(b, 'es'))
    .forEach((cat) => {
      lines.push(`### ${cat}`);
      (byCat[cat] ?? []).forEach((it) => {
        lines.push(`- [[${it.title}]]${it.note ? ` — ${it.note}` : ''}`);
      });
      lines.push('');
    });

  if (conceptPages.length > 0) {
    lines.push('---', '', '## Páginas Wiki Auto-Compiladas', '');
    conceptPages.slice(0, 25).forEach((page) => {
      lines.push(page.markdown, '', '---', '');
    });
  }

  if (syntheses.length > 0) {
    lines.push('## Síntesis Guardadas por LM', '');
    syntheses.forEach((syn) => {
      lines.push(syn.markdown, '', '---', '');
    });
  }

  if (wikiLog.length > 0) {
    lines.push('## Registro Cronológico (`log.md`)', '');
    wikiLog.slice(0, 40).forEach((e) => {
      lines.push(`- \`${e.ts}\` **[${e.action || 'WIKI'}]** ${e.summary || ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export function triggerTextDownload(filename, textContent, mimeType = 'text/markdown;charset=utf-8') {
  const bytes = new TextEncoder().encode(textContent);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LocalFirstWikiStore = {
  DEFAULT_LM_CONFIG,
  loadLocalVaultSnapshot,
  saveLocalVaultSnapshot,
  loadSavedSyntheses,
  saveSyntheses,
  loadWikiLog,
  appendWikiLogEntry,
  loadLmConfig,
  saveLmConfig,
  getStorageTelemetry,
  buildWikiMarkdownBundle,
  triggerTextDownload,
};

export default LocalFirstWikiStore;
