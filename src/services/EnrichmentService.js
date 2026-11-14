/**
 * EnrichmentService.js
 *
 * Motor de auto-clasificación inteligente, detección de tipo (link / palabra / frase),
 * extracción de favicon/dominio, sintaxis rápida (#categoría, @relación) y
 * normalización retrocompatible con los documentos existentes en `discoveries`.
 */

const DOMAIN_CATEGORY_RULES = [
  { pattern: /github\.com|gitlab\.com|stackoverflow\.com|vercel\.com|npmjs\.com|developer\.mozilla\.org|react\.dev|vite\.dev|openai\.com|anthropic\.com|huggingface\.co|arxiv\.org|kaggle\.com/i, category: 'Tecnología' },
  { pattern: /youtube\.com|youtu\.be|vimeo\.com|imdb\.com|letterboxd\.com|filmaffinity\.com|netflix\.com|spotify\.com|bandcamp\.com|soundcloud\.com/i, category: 'Cultura' },
  { pattern: /michelin\.com|vivino\.com|elcomidista|directoalpaladar|bodeboca|vino|gastro|restaurante/i, category: 'Gastro' },
  { pattern: /motorpasion|km77|topgear|porsche|ferrari|formula1|f1\.com|coches|autocar/i, category: 'Motor' },
  { pattern: /rae\.es|wordreference\.com|etymonline\.com|wiktionary\.org|fundeu\.es/i, category: 'Palabras & Léxico' },
  { pattern: /goodreads\.com|gutenberg\.org|cervantesvirtual|wikiquote/i, category: 'Libros & Frases' },
  { pattern: /hodinkee|chrono24|fratellowatches|reloj/i, category: 'Relojería' },
  { pattern: /deft\.work|anticitera/i, category: 'Anticitera' },
];

const KEYWORD_CATEGORY_RULES = [
  { pattern: /\b(ia|llm|gemma|gemini|gpt|react|docker|linux|python|rust|código|api|algoritmo|servidor|web)\b/i, category: 'Tecnología' },
  { pattern: /\b(vino|albariño|priorat|ribera|rioja|cata|bodega|receta|restaurante|menú|gastronomía|cocina|chef)\b/i, category: 'Gastro' },
  { pattern: /\b(motor|coche|f1|ferrari|porsche|clásico|v8|v12|circuito|chasis|aerodinámica)\b/i, category: 'Motor' },
  { pattern: /\b(película|cine|director|serie|música|álbum|canción|arte|pintura|museo|ópera|teatro)\b/i, category: 'Cultura' },
  { pattern: /\b(reloj|calibres|cronógrafo|tourbillon|horología|ginebra)\b/i, category: 'Relojería' },
  { pattern: /\b(libro|novela|ensayo|poema|autor|lectura|filosofía|cita|proverbio|aforismo)\b/i, category: 'Libros & Frases' },
];

export function looksLikeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s]*)?$/i.test(trimmed)) return true;
  return false;
}

export function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function extractDomain(urlStr) {
  try {
    const u = new URL(normalizeUrl(urlStr));
    return u.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function getFaviconUrl(urlOrDomain) {
  const domain = urlOrDomain.includes('/')
    ? extractDomain(urlOrDomain)
    : urlOrDomain.replace(/^www\./i, '');
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export function humanizeUrlTitle(urlStr) {
  try {
    const u = new URL(normalizeUrl(urlStr));
    const host = u.hostname.replace(/^www\./i, '');
    const segments = u.pathname
      .split('/')
      .filter(Boolean)
      .map((s) => decodeURIComponent(s).replace(/[-_]+/g, ' ').replace(/\.\w+$/, ''));
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      if (last.length >= 2 && last.length <= 64) {
        return `${last.charAt(0).toUpperCase() + last.slice(1)} · ${host}`;
      }
    }
    return host;
  } catch {
    return urlStr;
  }
}

export function detectItemType(text, explicitUrl = '') {
  if (explicitUrl || looksLikeUrl(text)) return 'link';
  const clean = String(text || '').trim();
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3 && clean.length <= 32 && !/[.!?;:]/.test(clean)) {
    return 'word';
  }
  return 'phrase';
}

export function inferCategory({ text = '', url = '', type = 'phrase' }) {
  const targetUrl = url || (looksLikeUrl(text) ? text : '');
  if (targetUrl) {
    for (const rule of DOMAIN_CATEGORY_RULES) {
      if (rule.pattern.test(targetUrl)) return rule.category;
    }
  }
  const combined = `${text} ${targetUrl}`;
  for (const rule of KEYWORD_CATEGORY_RULES) {
    if (rule.pattern.test(combined)) return rule.category;
  }
  if (type === 'word') return 'Palabras & Léxico';
  if (type === 'phrase') return 'Ideas & Citas';
  if (type === 'link') return 'Tecnología';
  return 'General';
}

/**
 * Extrae etiquetas `#Categoría` y referencias `@ término` de un texto de captura rápida.
 */
export function parseQuickInput(rawInput, allItems = []) {
  let working = String(rawInput || '').trim();
  const hashtags = [];
  const mentionTerms = [];

  working = working.replace(/(?:^|\s)#([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+)/g, (_, tag) => {
    hashtags.push(tag.replace(/_/g, ' '));
    return ' ';
  });

  working = working.replace(/(?:^|\s)@([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._-]+)/g, (_, mention) => {
    mentionTerms.push(mention.toLowerCase().replace(/_/g, ' '));
    return ' ';
  });

  const cleanText = working.replace(/\s+/g, ' ').trim();

  // Check if cleanText contains a URL + optional custom label
  const urlMatch = cleanText.match(/(https?:\/\/[^\s]+|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s]*)/i);
  let url = '';
  let title = cleanText;

  if (urlMatch && looksLikeUrl(urlMatch[1])) {
    url = normalizeUrl(urlMatch[1]);
    const rest = cleanText.replace(urlMatch[0], '').replace(/^[-–—:|]+|[-–—:|]+$/g, '').trim();
    title = rest || humanizeUrlTitle(url);
  } else if (looksLikeUrl(cleanText)) {
    url = normalizeUrl(cleanText);
    title = humanizeUrlTitle(url);
  }

  const type = detectItemType(cleanText, url);
  const primaryCategory =
    hashtags[0] || inferCategory({ text: `${title} ${cleanText}`, url, type });
  const extraCategories = hashtags.slice(1);

  // Match @mentions against existing items
  const relatedIds = [];
  if (mentionTerms.length > 0 && Array.isArray(allItems)) {
    for (const term of mentionTerms) {
      const found = allItems.find(
        (it) =>
          String(it.title || '').toLowerCase().includes(term) ||
          String(it.id || '').toLowerCase() === term
      );
      if (found && !relatedIds.includes(found.id)) {
        relatedIds.push(found.id);
      }
    }
  }

  return {
    type,
    title: title || cleanText,
    url,
    domain: url ? extractDomain(url) : '',
    favicon: url ? getFaviconUrl(url) : '',
    category: primaryCategory,
    extraCategories,
    relatedIds,
  };
}

/**
 * Normaliza cualquier documento de Firestore (`discoveries`) —tanto del modelo
 * antiguo como del nuevo modelo Keep— en una estructura uniforme.
 */
export function normalizeDiscoveryDoc(raw) {
  const id = raw.id;
  const legacyUrl = raw.url || raw.metadata?.url || (looksLikeUrl(raw.name) ? raw.name : '');
  const url = legacyUrl ? normalizeUrl(legacyUrl) : '';
  const rawTitle = raw.title || raw.name || (url ? humanizeUrlTitle(url) : 'Sin título');
  const type = raw.type || detectItemType(rawTitle, url);
  const domain = raw.domain || (url ? extractDomain(url) : '');
  const favicon = raw.favicon || (domain ? getFaviconUrl(domain) : '');
  const category = raw.category || inferCategory({ text: rawTitle, url, type });
  const extraCategories = Array.isArray(raw.extraCategories)
    ? raw.extraCategories.filter((c) => c && c !== category)
    : [];
  const relatedIds = Array.isArray(raw.relatedIds) ? raw.relatedIds : [];

  // Note: for legacy items with long descriptions, keep a concise note
  const rawNote = raw.note !== undefined ? raw.note : raw.description || '';
  const note = String(rawNote || '').trim();

  const createdAtMs =
    raw.createdAt?.toMillis?.() ||
    (raw.createdAt?.seconds ? raw.createdAt.seconds * 1000 : null) ||
    (typeof raw.createdAt === 'number' ? raw.createdAt : 0);

  return {
    id,
    type, // 'link' | 'word' | 'phrase'
    title: String(rawTitle).trim(),
    note,
    url,
    domain,
    favicon,
    category,
    subcategory: raw.subcategory || '',
    extraCategories,
    relatedIds,
    pinned: Boolean(raw.pinned || (raw.relevance_score && raw.relevance_score >= 90)),
    checked: Boolean(raw.checked),
    order: typeof raw.order === 'number' ? raw.order : 0,
    clicks: typeof raw.clicks === 'number' ? raw.clicks : 0,
    relevance_score: typeof raw.relevance_score === 'number' ? raw.relevance_score : 75,
    colorKey: raw.colorKey || '',
    attachment: raw.attachment || null,
    markdownContent: typeof raw.markdownContent === 'string' ? raw.markdownContent : '',
    kind: raw.kind || 'file', // 'file' | 'relation'
    sourceId: raw.sourceId || '',
    targetId: raw.targetId || '',
    relationLabel: raw.relationLabel || '',
    isPublic: raw.isPublic !== undefined ? Boolean(raw.isPublic) : true,
    sharedWith: Array.isArray(raw.sharedWith) ? raw.sharedWith : [],
    ownerUid: raw.ownerUid || '',
    ownerEmail: raw.ownerEmail || '',
    createdAtMs,
  };
}

const EnrichmentService = {
  parseQuickInput,
  normalizeDiscoveryDoc,
  detectItemType,
  inferCategory,
  looksLikeUrl,
  normalizeUrl,
  extractDomain,
  getFaviconUrl,
  humanizeUrlTitle,
};

export default EnrichmentService;
