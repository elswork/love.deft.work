/**
 * LmWikiEngine.js
 *
 * Motor de Base de Conocimiento Personal ("LM Wiki") Autoorganizado y Local-First.
 * Inspirado en wikis compiladas y mantenidas por modelos de lenguaje:
 *   Fuentes crudas (.md, notas, fragmentos de código)
 *     → Índice BM25/TF-IDF + Extractor de Código
 *     → Páginas de Concepto Auto-Compiladas (con citas [[WikiLink]])
 *     → Motor de Auto-Enlazado Semántico
 *     → Auditoría Lint (huérfanos, enlaces rotos, cobertura)
 *     → Síntesis bajo demanda (Local determinista / Ollama local / Gemini)
 */

import {
  buildInitialMarkdown,
  computeVaultConnections,
  extractWikiLinks,
  normalizeLookupKey,
  resolveWikiTarget,
} from './MarkdownVaultService.js';
import EnrichmentService from './EnrichmentService.js';
import AgentService from './AgentService.js';

const STOP_WORDS = new Set([
  'para', 'como', 'este', 'esta', 'estos', 'estas', 'sobre', 'entre', 'desde',
  'donde', 'pero', 'porque', 'cuando', 'todo', 'toda', 'todos', 'todas', 'cada',
  'solo', 'tambien', 'puede', 'pueden', 'hacer', 'tiene', 'tienen', 'siendo',
  'hacia', 'hasta', 'bajo', 'mediante', 'segun', 'sin', 'con', 'por', 'una',
  'unos', 'unas', 'del', 'las', 'los', 'que', 'mas', 'muy', 'mas', 'aqui',
  'nota', 'notas', 'archivo', 'archivos', 'texto', 'parte', 'forma', 'tipo',
  'with', 'from', 'that', 'this', 'have', 'will', 'your', 'into', 'they',
  'their', 'about', 'which', 'when', 'where', 'there', 'then', 'than', 'only',
  'also', 'just', 'more', 'some', 'such', 'true', 'false', 'null', 'const',
  'return', 'import', 'export', 'default', 'function', 'async', 'await',
  'http', 'https', 'www', 'com', 'org', 'work',
]);

const CODE_FILE_LANG_MAP = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.sh': 'bash',
  '.bash': 'bash',
  '.json': 'json',
  '.css': 'css',
  '.html': 'html',
  '.sql': 'sql',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
};

function groupBySafe(items, keyFn) {
  if (typeof Object.groupBy === 'function') {
    return Object.groupBy(items, keyFn);
  }
  const acc = Object.create(null);
  items.forEach((item, idx) => {
    const k = String(keyFn(item, idx));
    if (!Object.hasOwn(acc, k)) acc[k] = [];
    acc[k].push(item);
  });
  return acc;
}

export function normalizeTerm(raw = '') {
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .trim();
}

export function tokenizeText(text = '') {
  const cleaned = String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/[^\s)]+/g, ' ')
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ._-]+/g, ' ');

  const rawTokens = cleaned.split(/\s+/);
  const tokens = [];

  for (const raw of rawTokens) {
    const norm = normalizeTerm(raw).replace(/^[._-]+|[._-]+$/g, '');
    if (norm.length < 3) continue;
    if (/^\d+$/.test(norm)) continue;
    if (STOP_WORDS.has(norm)) continue;
    tokens.push({ norm, display: raw.replace(/^[._-]+|[._-]+$/g, '') });
  }
  return tokens;
}

/**
 * Extrae todos los bloques de código cercados (```lang ... ```) y sus símbolos.
 */
export function extractCodeSnippetsFromMarkdown(markdown = '', sourceItem = null) {
  const snippets = [];
  const regex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let match;
  let idx = 0;

  while ((match = regex.exec(markdown)) !== null) {
    const lang = (match[1] || 'text').toLowerCase().trim() || 'text';
    const code = (match[2] || '').trim();
    if (!code) continue;

    // Contexto: encabezado más cercano antes del bloque
    const before = markdown.slice(0, match.index);
    const headings = Array.from(before.matchAll(/^#{1,4}\s+(.+)$/gm));
    const nearestHeading = headings.length > 0 ? headings[headings.length - 1][1].trim() : '';

    const symbols = extractCodeSymbols(code);
    const lineCount = code.split('\n').length;

    snippets.push({
      id: `${sourceItem?.id || 'note'}-code-${idx}`,
      lang,
      code,
      lineCount,
      heading: nearestHeading,
      symbols,
      sourceId: sourceItem?.id || '',
      sourceTitle: sourceItem?.title || 'Sin título',
      sourceCategory: sourceItem?.category || 'General',
    });
    idx += 1;
  }

  return snippets;
}

export function extractCodeSymbols(code = '') {
  const found = new Set();
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]{2,})/g,
    /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][\w$]{2,})\s*=\s*(?:async\s*)?(?:\(|[a-zA-Z_$])/g,
    /(?:export\s+)?class\s+([A-Z][\w$]{2,})/g,
    /def\s+([a-zA-Z_][\w]{2,})\s*\(/g,
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]{2,})/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) {
      if (m[1]) found.add(m[1]);
    }
  }
  return Array.from(found).slice(0, 12);
}

const BOILERPLATE_CONCEPTS = new Set([
  'origen',
  'destino',
  'relacion',
  'tipo de relacion',
  'contexto de la relacion',
  'conexiones',
  'notas y conexiones',
  'objetivo',
  'resumen',
  'contexto',
  'md',
  'url',
  'pdf',
  'svg',
  'general',
  'sin titulo',
  'siguientes pasos',
  'siguientes pasos recomendados',
]);

function extractSalientPhrases(markdown = '', title = '', itemKind = 'file') {
  if (itemKind === 'relation') return [];
  const phrases = [];
  const add = (raw, weight) => {
    const clean = String(raw || '')
      .replace(/[*_`[\]#>:]/g, '')
      .replace(/^\d+\s*[·.)-]?\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length < 3 || clean.length > 44) return;
    if (/^\.[a-z0-9]{1,5}$/i.test(clean)) return;
    const key = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const norm = normalizeTerm(clean.replace(/\s+/g, ''));
    if (norm.length < 3 || STOP_WORDS.has(norm) || BOILERPLATE_CONCEPTS.has(key) || BOILERPLATE_CONCEPTS.has(norm)) {
      return;
    }
    phrases.push({ key, label: clean, weight });
  };

  // Títulos y subtítulos
  String(title)
    .split(/[·—–|:()/,-]+/)
    .forEach((seg) => add(seg, 4));

  for (const m of markdown.matchAll(/^#{1,3}\s+(.+)$/gm)) {
    m[1].split(/[·—–|:(),-]+/).forEach((seg) => add(seg, 3));
  }

  // Términos destacados en **negrita** o `código`
  for (const m of markdown.matchAll(/\*\*([^*]{3,36})\*\*/g)) {
    add(m[1], 2.5);
  }
  for (const m of markdown.matchAll(/`([a-zA-Z0-9._:/-]{3,32})`/g)) {
    add(m[1], 2.2);
  }

  return phrases;
}

function pickBestExcerpt(markdown = '', termNorm = '') {
  const lines = String(markdown)
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((l) => l.replace(/^[-*#>\s]+/, '').trim())
    .filter((l) => l.length >= 24 && !l.startsWith('![['));

  const match = lines.find((l) => normalizeTerm(l).includes(termNorm));
  const chosen = match || lines[0] || '';
  return chosen.length > 170 ? `${chosen.slice(0, 167)}…` : chosen;
}

/**
 * Compila todo el índice LM Wiki de forma determinista y local-first (< 15 ms típico):
 * - Vectores TF-IDF por documento
 * - Catálogo de fragmentos de código
 * - Páginas de concepto auto-compiladas
 * - Sugerencias de auto-enlazado semántico
 * - Informe de salud Lint (huérfanos, enlaces rotos, notas sin estructura)
 */
export function compileLmWikiIndex(items = [], options = {}) {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const autoLinkThreshold = typeof options.autoLinkThreshold === 'number' ? options.autoLinkThreshold : 0.08;

  const itemsById = Object.fromEntries(items.map((it) => [it.id, it]));
  const docCount = Math.max(1, items.length);

  const docData = [];
  const docFreq = new Map();
  const displayForms = new Map();
  const codeSnippets = [];
  const phraseBuckets = new Map();

  // 1. Tokenización, extracción de código y conceptos salientes
  for (const item of items) {
    const md = buildInitialMarkdown(item, itemsById);
    const snippets = extractCodeSnippetsFromMarkdown(md, item);
    codeSnippets.push(...snippets);

    const titleTokens = tokenizeText(item.title || '');
    const bodyTokens = tokenizeText(`${item.note || ''}\n${md}`);
    const symbolTokens = snippets.flatMap((s) =>
      s.symbols.map((sym) => ({ norm: normalizeTerm(sym), display: sym }))
    );

    const tf = new Map();
    const pushToken = (tok, weight) => {
      if (!tok.norm) return;
      tf.set(tok.norm, (tf.get(tok.norm) || 0) + weight);
      if (!displayForms.has(tok.norm) || tok.display.length < displayForms.get(tok.norm).length) {
        displayForms.set(tok.norm, tok.display);
      }
    };

    titleTokens.forEach((t) => pushToken(t, 3.0));
    bodyTokens.forEach((t) => pushToken(t, 1.0));
    symbolTokens.forEach((t) => pushToken(t, 2.2));

    for (const term of tf.keys()) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }

    const salient = extractSalientPhrases(md, item.title, item.kind);
    for (const p of salient) {
      if (!phraseBuckets.has(p.key)) {
        phraseBuckets.set(p.key, { label: p.label, score: 0, itemIds: new Set() });
      }
      const b = phraseBuckets.get(p.key);
      b.score += p.weight;
      b.itemIds.add(item.id);
    }

    const wikiLinks = extractWikiLinks(md);
    const conns = computeVaultConnections(item, items);

    docData.push({
      item,
      markdown: md,
      tf,
      totalTerms: bodyTokens.length + titleTokens.length,
      wikiLinks,
      connections: conns,
      snippets,
    });
  }

  // 2. Cálculo de vectores TF-IDF normalizados (L2)
  const idfMap = new Map();
  for (const [term, df] of docFreq.entries()) {
    idfMap.set(term, Math.log((docCount + 1) / (df + 1)) + 1);
  }

  const vectors = new Map();
  for (const d of docData) {
    const vec = new Map();
    let normSq = 0;
    for (const [term, freq] of d.tf.entries()) {
      const weight = (1 + Math.log(freq)) * (idfMap.get(term) || 1);
      vec.set(term, weight);
      normSq += weight * weight;
    }
    const norm = Math.sqrt(normSq) || 1;
    for (const [term, val] of vec.entries()) {
      vec.set(term, val / norm);
    }
    vectors.set(d.item.id, vec);
  }

  // 3. Auto-Enlazado Semántico (pares no enlazados con similitud coseno >= umbral)
  const suggestedLinks = [];
  for (let i = 0; i < docData.length; i += 1) {
    const a = docData[i];
    if (a.item.kind === 'relation') continue;
    const vecA = vectors.get(a.item.id);
    const linkedIds = new Set([
      a.item.id,
      ...a.connections.outgoing.map((o) => o.item.id),
      ...a.connections.backlinks.map((b) => b.item.id),
    ]);

    for (let j = i + 1; j < docData.length; j += 1) {
      const b = docData[j];
      if (b.item.kind === 'relation') continue;
      if (linkedIds.has(b.item.id)) continue;

      const vecB = vectors.get(b.item.id);
      let dot = 0;
      const shared = [];
      for (const [term, valA] of vecA.entries()) {
        const valB = vecB.get(term);
        if (valB) {
          const contrib = valA * valB;
          dot += contrib;
          shared.push({ term, contrib });
        }
      }

      const crossCategory = a.item.category !== b.item.category;
      const adjustedScore = dot + (crossCategory && dot > 0.05 ? 0.04 : 0);

      if (adjustedScore >= autoLinkThreshold && shared.length >= 2) {
        const topShared = shared
          .toSorted((x, y) => y.contrib - x.contrib)
          .slice(0, 4)
          .map((s) => displayForms.get(s.term) || s.term);

        suggestedLinks.push({
          id: `sug-${a.item.id}__${b.item.id}`,
          source: a.item,
          target: b.item,
          score: Math.min(0.99, Number(adjustedScore.toFixed(2))),
          confidencePct: Math.min(98, Math.round(Math.sqrt(adjustedScore) * 100)),
          sharedTerms: topShared,
          crossCategory,
          suggestedLabel: crossCategory ? 'puente conceptual' : 'complementa',
        });
      }
    }
  }

  const sortedSuggestedLinks = suggestedLinks
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 28);

  // 4. Páginas Wiki Auto-Compiladas (Concept Hubs por co-ocurrencia en >= 2 notas)
  const conceptCandidates = [];
  for (const [key, bucket] of phraseBuckets.entries()) {
    if (bucket.itemIds.size >= 2) {
      conceptCandidates.push({
        key,
        label: bucket.label,
        itemIds: Array.from(bucket.itemIds),
        score: bucket.itemIds.size * 5 + bucket.score,
      });
    }
  }

  // Complementar con términos TF-IDF multi-documento si hay pocos conceptos fraseales
  if (conceptCandidates.length < 8) {
    for (const [term, df] of docFreq.entries()) {
      if (df < 2 || df > Math.max(3, Math.ceil(docCount * 0.85))) continue;
      if (conceptCandidates.some((c) => normalizeTerm(c.label) === term)) continue;
      const matchingIds = docData
        .filter((d) => d.tf.has(term))
        .map((d) => d.item.id);
      if (matchingIds.length >= 2) {
        const display = displayForms.get(term) || term;
        conceptCandidates.push({
          key: term,
          label: display.charAt(0).toUpperCase() + display.slice(1),
          itemIds: matchingIds,
          score: matchingIds.length * 3.5 + (idfMap.get(term) || 1),
        });
      }
    }
  }

  const dedupedConcepts = [];
  const seenConceptKeys = new Set();
  for (const cand of conceptCandidates.toSorted((a, b) => b.score - a.score)) {
    const normKey = normalizeTerm(cand.label);
    if (!normKey || seenConceptKeys.has(normKey)) continue;
    seenConceptKeys.add(normKey);
    dedupedConcepts.push(cand);
    if (dedupedConcepts.length >= 16) break;
  }

  const conceptPages = dedupedConcepts.map((concept) => {
    const sources = concept.itemIds
      .map((id) => docData.find((d) => d.item.id === id))
      .filter(Boolean);
    const categoriesSet = Array.from(new Set(sources.map((s) => s.item.category || 'General')));
    const termNorm = normalizeTerm(concept.label);
    const relatedSnippets = sources.flatMap((s) => s.snippets).slice(0, 2);

    const citationBullets = sources.map((s) => {
      const excerpt = pickBestExcerpt(s.markdown, termNorm);
      return `- **[[${s.item.title}]]** *(${s.item.category})* — ${excerpt || 'Referencia directa en bóveda.'}`;
    });

    const summaryLead =
      categoriesSet.length > 1
        ? `Concepto transversal que conecta **${sources.length} documentos** a lo largo de **${categoriesSet.length} categorías** (${categoriesSet.join(' · ')}).`
        : `Concepto recurrente documentado en **${sources.length} archivos** dentro de **${categoriesSet[0]}**.`;

    const mdLines = [
      `# Wiki · ${concept.label}`,
      '',
      `> **Artículo auto-compilado (LM Wiki · Local-First)** · ${sources.length} fuentes indexadas · Cobertura: ${categoriesSet.join(', ')}`,
      '',
      '## Síntesis ejecutiva',
      summaryLead,
      '',
      '## Evidencia y fuentes citadas',
      ...citationBullets,
      '',
    ];

    if (relatedSnippets.length > 0) {
      mdLines.push('## Fragmentos de código relacionados', '');
      relatedSnippets.forEach((snip) => {
        mdLines.push(
          `Desde [[${snip.sourceTitle}]]${snip.heading ? ` (${snip.heading})` : ''}:`,
          `\`\`\`${snip.lang}`,
          snip.code.slice(0, 600),
          '```',
          ''
        );
      });
    }

    mdLines.push(
      '## Acciones sugeridas de mantenimiento',
      `- Revisa si alguna fuente citada carece de enlace recíproco \`[[${sources[0]?.item.title || concept.label}]]\`.`,
      `- Pulsa **Promover a Bóveda (.md)** si quieres fijar este artículo como nodo editable permanente.`
    );

    return {
      id: `wiki-concept-${termNorm}`,
      title: `Wiki · ${concept.label}`,
      concept: concept.label,
      sourceCount: sources.length,
      categories: categoriesSet,
      sourceIds: sources.map((s) => s.item.id),
      snippetCount: relatedSnippets.length,
      markdown: mdLines.join('\n'),
      isCrossCategory: categoriesSet.length > 1,
    };
  });

  // 5. Auditoría Lint (huérfanos, enlaces rotos, notas densas sin estructura)
  const orphans = [];
  const brokenMap = new Map();
  const unstructuredNotes = [];

  for (const d of docData) {
    const degree =
      d.connections.outgoing.length +
      d.connections.backlinks.length +
      d.connections.relations.length;
    if (degree === 0) {
      orphans.push(d.item);
    }

    for (const lnk of d.wikiLinks) {
      if (lnk.isEmbed) continue;
      const resolved = resolveWikiTarget(lnk.target, items);
      if (!resolved) {
        const key = normalizeLookupKey(lnk.target);
        if (!brokenMap.has(key)) {
          brokenMap.set(key, {
            target: lnk.target,
            referencedBy: [],
          });
        }
        const entry = brokenMap.get(key);
        if (!entry.referencedBy.some((r) => r.id === d.item.id)) {
          entry.referencedBy.push(d.item);
        }
      }
    }

    const hasSubheading = /^##\s+/m.test(d.markdown);
    if (d.markdown.length > 360 && !hasSubheading) {
      unstructuredNotes.push(d.item);
    }
  }

  const brokenLinks = Array.from(brokenMap.values()).toSorted(
    (a, b) => b.referencedBy.length - a.referencedBy.length
  );

  const snippetsByLang = groupBySafe(codeSnippets, (s) => s.lang);
  const compiledMs = Math.max(
    1,
    Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
  );

  // Salud general 0..100
  const orphanPenalty = Math.min(30, orphans.length * 4);
  const brokenPenalty = Math.min(25, brokenLinks.length * 5);
  const linkBonus = Math.min(20, conceptPages.length * 2);
  const healthScore = Math.max(25, Math.min(100, 85 - orphanPenalty - brokenPenalty + linkBonus));

  return {
    compiledAt: Date.now(),
    compiledMs,
    docCount: items.length,
    uniqueTerms: docFreq.size,
    docData,
    idfMap,
    conceptPages,
    suggestedLinks: sortedSuggestedLinks,
    codeSnippets,
    snippetsByLang,
    lint: {
      healthScore,
      orphans,
      brokenLinks,
      unstructuredNotes,
    },
  };
}

/**
 * Búsqueda semántica/BM25 instantánea sobre notas, páginas wiki compiladas y fragmentos de código.
 */
export function searchLmWiki(index, rawQuery = '') {
  const query = String(rawQuery || '').trim();
  if (!query || !index) {
    return {
      notes: [],
      concepts: index?.conceptPages || [],
      snippets: index?.codeSnippets || [],
    };
  }

  const qLower = query.toLowerCase();
  const qTokens = tokenizeText(query);
  const qNorms = qTokens.length > 0 ? qTokens.map((t) => t.norm) : [normalizeTerm(query)];

  // 1. Score sobre notas
  const notes = index.docData
    .map((d) => {
      let score = 0;
      const matched = [];
      const titleLower = String(d.item.title || '').toLowerCase();
      if (titleLower.includes(qLower)) score += 12;

      for (const qn of qNorms) {
        if (!qn) continue;
        const tf = d.tf.get(qn) || 0;
        if (tf > 0) {
          const idf = index.idfMap.get(qn) || 1;
          score += (1 + Math.log(tf)) * idf * 3;
          matched.push(qn);
        } else if (normalizeTerm(d.markdown).includes(qn)) {
          score += 1.5;
          matched.push(qn);
        }
      }

      return {
        item: d.item,
        score,
        matchedTerms: Array.from(new Set(matched)),
        excerpt: pickBestExcerpt(d.markdown, matched[0] || qNorms[0] || ''),
      };
    })
    .filter((r) => r.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 20);

  // 2. Score sobre páginas wiki auto-compiladas
  const concepts = index.conceptPages.filter((p) => {
    const hay = normalizeTerm(`${p.title} ${p.concept} ${p.categories.join(' ')} ${p.markdown}`);
    return hay.includes(normalizeTerm(query)) || qNorms.some((qn) => qn && hay.includes(qn));
  });

  // 3. Score sobre fragmentos de código
  const snippets = index.codeSnippets.filter((s) => {
    const hay = `${s.lang} ${s.heading} ${s.sourceTitle} ${s.symbols.join(' ')} ${s.code}`.toLowerCase();
    return hay.includes(qLower) || qNorms.some((qn) => qn && hay.includes(qn));
  });

  return { notes, concepts, snippets };
}

/**
 * Inyecta de forma idempotente un [[WikiLink]] en el contenido Markdown de una nota.
 */
export function injectWikiLinkIntoMarkdown(markdown = '', targetTitle = '', relationLabel = 'relacionado con') {
  if (!targetTitle) return markdown;
  const existing = extractWikiLinks(markdown);
  const targetNorm = normalizeLookupKey(targetTitle);
  if (existing.some((l) => normalizeLookupKey(l.target) === targetNorm)) {
    return markdown;
  }

  const line = `- **${relationLabel}**: [[${targetTitle}]]`;
  if (/^##\s+Conexiones/im.test(markdown)) {
    return markdown.replace(/(^##\s+Conexiones[^\n]*\n)/im, `$1${line}\n`);
  }
  const trimmed = String(markdown || '').trimEnd();
  return `${trimmed}\n\n## Conexiones\n${line}\n`;
}

/**
 * Parsea un archivo local importado (Markdown, texto o código fuente)
 * y genera un documento listo para añadir a la bóveda con auto-enlaces detectados.
 */
export async function parseImportedLocalFile(file, existingItems = []) {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buffer);
  const fileName = file.name || 'nota-importada.md';
  const extMatch = fileName.match(/(\.[a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : '.md';
  const baseTitle = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || fileName;

  let markdownContent = text;
  let inferredCategory = EnrichmentService.inferCategory({ text: `${baseTitle} ${text.slice(0, 600)}`, type: 'phrase' });

  if (CODE_FILE_LANG_MAP[ext]) {
    const lang = CODE_FILE_LANG_MAP[ext];
    const symbols = extractCodeSymbols(text);
    inferredCategory = '01 · Arquitectura & Núcleo';
    markdownContent = [
      `# ${baseTitle}`,
      '',
      `> **Fragmento importado localmente** · Archivo original: \`${fileName}\` · Lenguaje: \`${lang}\``,
      '',
      ...(symbols.length > 0
        ? ['## Símbolos indexados', symbols.map((s) => `- \`${s}\``).join('\n'), '']
        : []),
      '## Código fuente',
      `\`\`\`${lang}`,
      text.trim(),
      '```',
      '',
    ].join('\n');
  } else if (!text.trim().startsWith('#')) {
    markdownContent = `# ${baseTitle}\n\n${text.trim()}\n`;
  }

  // Detectar hasta 3 enlaces automáticos con notas ya existentes en la bóveda
  const importedTokens = new Set(tokenizeText(`${baseTitle} ${text.slice(0, 2000)}`).map((t) => t.norm));
  const autoMatches = existingItems
    .map((it) => {
      const itTokens = tokenizeText(`${it.title} ${it.note || ''}`).map((t) => t.norm);
      const hits = itTokens.filter((t) => importedTokens.has(t));
      return { item: it, hits: hits.length };
    })
    .filter((m) => m.hits >= 2)
    .toSorted((a, b) => b.hits - a.hits)
    .slice(0, 3);

  let enrichedMarkdown = markdownContent;
  autoMatches.forEach(({ item }) => {
    enrichedMarkdown = injectWikiLinkIntoMarkdown(enrichedMarkdown, item.title, 'auto-enlazado al importar');
  });

  return {
    title: baseTitle,
    category: inferredCategory,
    markdownContent: enrichedMarkdown,
    autoLinkedCount: autoMatches.length,
    ext,
  };
}

/**
 * Sintetiza un nuevo artículo Wiki sobre cualquier pregunta o tema combinando:
 * 1) Recuperación BM25 local sobre tu bóveda
 * 2) Proveedor configurado: Local determinista | Ollama / OpenAI-compatible local | Gemini
 */
export async function synthesizeWikiArticle({
  topic,
  index,
  lmConfig,
  userSignal,
}) {
  const cleanTopic = String(topic || '').trim();
  if (!cleanTopic) {
    throw new Error('Escribe un tema o pregunta para sintetizar el artículo wiki.');
  }

  const hits = searchLmWiki(index, cleanTopic);
  const topNotes = hits.notes.slice(0, 8);
  const topSnippets = hits.snippets.slice(0, 3);
  const contextItems =
    topNotes.length > 0
      ? topNotes.map((h) => h.item)
      : index.docData.slice(0, 8).map((d) => d.item);

  // Opción 1: Endpoint local compatible OpenAI / Ollama (ej. M2 o localhost:11434)
  if (lmConfig?.provider === 'ollama' && lmConfig?.endpoint) {
    const contextBlock = contextItems
      .map(
        (it) =>
          `### [[${it.title}]] (${it.category})\n${(it.markdownContent || it.note || '').slice(0, 700)}`
      )
      .join('\n\n');

    const signal = userSignal
      ? AbortSignal.any([userSignal, AbortSignal.timeout(25_000)])
      : AbortSignal.timeout(25_000);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (lmConfig.apiKey?.trim()) {
        headers.Authorization = `Bearer ${lmConfig.apiKey.trim()}`;
      }
      const res = await fetch(lmConfig.endpoint.trim(), {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          model: lmConfig.model || 'qwen2.5:7b',
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content:
                'Eres el compilador LM Wiki de una base de conocimiento personal estilo Obsidian. Escribe un artículo wiki claro y denso en Markdown en español, citando siempre las fuentes exactas con [[Título exacto]], incluyendo resumen ejecutivo, conexiones, código relevante si existe y preguntas abiertas.',
            },
            {
              role: 'user',
              content: `Tema / pregunta a sintetizar: "${cleanTopic}"\n\nFuentes recuperadas de la bóveda:\n${contextBlock}`,
            },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} desde endpoint LM local`);
      }
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content?.trim();
      if (text) {
        return {
          id: `syn-${Date.now()}`,
          title: `Wiki · ${cleanTopic.slice(0, 54)}`,
          topic: cleanTopic,
          engine: `Ollama/Local (${lmConfig.model || 'custom'})`,
          createdAt: Date.now(),
          sourceIds: contextItems.map((c) => c.id),
          markdown: text.startsWith('#') ? text : `# Wiki · ${cleanTopic}\n\n${text}`,
        };
      }
    } catch (err) {
      const wrapped = new Error(`Fallback al compilador local determinista (${err.message})`, {
        cause: err,
      });
      console.warn('[LmWikiEngine]', wrapped);
    }
  }

  // Opción 2: Gemini API (si el usuario lo seleccionó y tiene clave configurada)
  if (lmConfig?.provider === 'gemini') {
    try {
      const res = await AgentService.synthesizeVaultQuestion(
        cleanTopic,
        contextItems,
        `LM Wiki · ${cleanTopic}`
      );
      if (res?.markdown) {
        return {
          id: `syn-${Date.now()}`,
          title: res.title || `Wiki · ${cleanTopic.slice(0, 54)}`,
          topic: cleanTopic,
          engine: res.agentName || 'Gemini',
          createdAt: Date.now(),
          sourceIds: contextItems.map((c) => c.id),
          markdown: res.markdown,
        };
      }
    } catch (err) {
      console.warn('[LmWikiEngine] Gemini fallback a motor local:', err);
    }
  }

  // Opción 3 (por defecto y fallback garantizado 100% offline): Compilador Semántico Local
  const categoriesCovered = Array.from(new Set(contextItems.map((c) => c.category || 'General')));
  const lines = [
    `# Wiki · ${cleanTopic}`,
    '',
    `> **Síntesis Local-First (BM25 + Extracción Semántica)** · ${topNotes.length} coincidencias directas · Categorías: ${categoriesCovered.join(' · ')}`,
    '',
    '## Panorama sintetizado',
    topNotes.length > 0
      ? `La consulta sobre **«${cleanTopic}»** cruza **${topNotes.length} notas** de tu bóveda. Los términos ancla detectados son: ${Array.from(
          new Set(topNotes.flatMap((n) => n.matchedTerms))
        )
          .slice(0, 8)
          .map((t) => `\`${t}\``)
          .join(', ') || 'coincidencia directa de título'}.`
      : `Todavía no hay notas específicas sobre **«${cleanTopic}»** en tu bóveda local. Se muestran los nodos estructurales más cercanos como punto de partida.`,
    '',
    '## Evidencia y citas en bóveda',
    ...(topNotes.length > 0
      ? topNotes.map(
          (n) =>
            `- **[[${n.item.title}]]** *(${n.item.category})* — ${n.excerpt || n.item.note || 'Documento relacionado.'}`
        )
      : contextItems.slice(0, 5).map((it) => `- **[[${it.title}]]** *(${it.category})*`)),
    '',
  ];

  if (topSnippets.length > 0) {
    lines.push('## Fragmentos de código indexados', '');
    topSnippets.forEach((snip) => {
      lines.push(
        `Fuente: [[${snip.sourceTitle}]]${snip.heading ? ` · ${snip.heading}` : ''}`,
        `\`\`\`${snip.lang}`,
        snip.code.slice(0, 600),
        '```',
        ''
      );
    });
  }

  const relatedSuggestions = index.suggestedLinks
    .filter((s) =>
      contextItems.some((c) => c.id === s.source.id || c.id === s.target.id)
    )
    .slice(0, 3);

  lines.push(
    '## Huecos y enlaces recomendados',
    ...(relatedSuggestions.length > 0
      ? relatedSuggestions.map(
          (s) =>
            `- Conectar **[[${s.source.title}]]** ↔ **[[${s.target.title}]]** (*${s.confidencePct}%* · términos: \`${s.sharedTerms.join(', ')}\`).`
        )
      : [
          `- Crear una nota atómica dedicada a **[[${cleanTopic}]]** para consolidar decisiones y código.`,
        ]),
    ''
  );

  return {
    id: `syn-${Date.now()}`,
    title: `Wiki · ${cleanTopic.slice(0, 54)}`,
    topic: cleanTopic,
    engine: 'Local-First BM25 Compiler',
    createdAt: Date.now(),
    sourceIds: contextItems.map((c) => c.id),
    markdown: lines.join('\n'),
  };
}

const LmWikiEngine = {
  normalizeTerm,
  tokenizeText,
  extractCodeSnippetsFromMarkdown,
  extractCodeSymbols,
  compileLmWikiIndex,
  searchLmWiki,
  injectWikiLinkIntoMarkdown,
  parseImportedLocalFile,
  synthesizeWikiArticle,
};

export default LmWikiEngine;
