import { extractWikiLinks, getFileDisplayName } from './MarkdownVaultService.js';

const GEMINI_API_KEY = import.meta.env?.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';

async function callGeminiJson(prompt) {
  if (!GEMINI_API_KEY) return null;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}`);
  }
  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return JSON.parse(rawText);
}

/**
 * Fallback determinista local por similitud léxica cuando no hay conexión o clave Gemini.
 */
function localSuggestConnections(activeItem, allItems) {
  const sourceText = `${activeItem.title} ${activeItem.note || ''} ${activeItem.markdownContent || ''}`.toLowerCase();
  const existingTargets = new Set([
    ...(activeItem.relatedIds || []),
    ...extractWikiLinks(activeItem.markdownContent || '').map((w) => w.target.toLowerCase()),
  ]);

  const stopWords = new Set(['para', 'como', 'este', 'esta', 'sobre', 'entre', 'desde', 'donde', 'pero', 'archivo', 'nota']);
  const tokens = Array.from(
    new Set(
      sourceText
        .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !stopWords.has(w))
    )
  );

  const scored = allItems
    .filter((it) => it.id !== activeItem.id && !existingTargets.has(it.id) && !existingTargets.has(it.title.toLowerCase()))
    .map((cand) => {
      const candText = `${cand.title} ${cand.note || ''} ${cand.markdownContent || ''} ${cand.category}`.toLowerCase();
      const hits = tokens.filter((t) => candText.includes(t));
      const sameCatBonus = cand.category !== activeItem.category ? 2 : 0; // Priorizar puentes entre categorías
      return {
        item: cand,
        score: hits.length * 3 + (hits.length > 0 ? sameCatBonus : 0),
        hits,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    agentName: 'Athena Local',
    summary:
      activeItem.note ||
      `Archivo «${getFileDisplayName(activeItem)}» en ${activeItem.category}.`,
    suggestions: scored.map(({ item, hits }) => ({
      targetId: item.id,
      targetTitle: item.title,
      relationLabel: item.category !== activeItem.category ? 'conecta entre listas' : 'complementa',
      reason: `Coincidencia semántica en: ${hits.slice(0, 3).join(', ')}.`,
    })),
  };
}

/**
 * Analiza un archivo de la bóveda y propone conexiones reales + resumen ejecutivo.
 */
export async function analyzeItemWithAgent(activeItem, allItems = []) {
  const candidates = allItems
    .filter((it) => it.id !== activeItem.id)
    .slice(0, 30)
    .map((it) => ({
      id: it.id,
      title: it.title,
      category: it.category,
      kind: it.kind || 'file',
      note: (it.note || it.markdownContent || '').slice(0, 160),
    }));

  const prompt = `Eres un agente analista de conocimiento colaborando con un humano en una bóveda estilo Obsidian.
Archivo activo:
- ID: ${activeItem.id}
- Título: ${activeItem.title}
- Categoría: ${activeItem.category}
- Contenido Markdown: ${(activeItem.markdownContent || activeItem.note || '').slice(0, 1200)}

Otros archivos de la bóveda:
${JSON.stringify(candidates)}

Devuelve JSON estricto con este formato:
{
  "summary": "Resumen ejecutivo en 1-2 frases en español",
  "suggestions": [
    {
      "targetId": "id exacto del archivo candidato",
      "targetTitle": "título exacto",
      "relationLabel": "verbo corto de relación (ej: demuestra, inspira, refuta, complementa, implementa)",
      "reason": "breve justificación en español"
    }
  ]
}
Propón máximo 4 conexiones realmente relevantes (no repitas las que ya estén enlazadas).`;

  try {
    const res = await callGeminiJson(prompt);
    if (res && Array.isArray(res.suggestions)) {
      const validIds = new Set(candidates.map((c) => c.id));
      return {
        agentName: 'Athena · Gemini',
        summary: res.summary || '',
        suggestions: res.suggestions.filter((s) => validIds.has(s.targetId)).slice(0, 4),
      };
    }
  } catch (err) {
    console.warn('[AgentService] Fallback a análisis local:', err);
  }

  return localSuggestConnections(activeItem, allItems);
}

/**
 * Genera una nueva nota Markdown de síntesis analítica a partir de una pregunta humana
 * y el contexto de los archivos seleccionados.
 */
export async function synthesizeVaultQuestion(question, scopeItems = [], scopeLabel = 'Toda la bóveda') {
  const contextItems = scopeItems.slice(0, 24).map((it) => ({
    title: it.title,
    category: it.category,
    ext: getFileDisplayName(it),
    excerpt: (it.markdownContent || it.note || '').slice(0, 280),
  }));

  const prompt = `Eres Athena, un agente colaborador en una bóveda de conocimiento Humano + Agentes.
Ámbito: ${scopeLabel}
Pregunta del usuario: "${question}"

Archivos disponibles en el ámbito:
${JSON.stringify(contextItems)}

Devuelve JSON estricto con:
{
  "title": "Título breve de la nota de síntesis",
  "markdown": "Nota Markdown en español bien estructurada con secciones (##), conclusiones accionables, huecos detectados y enlaces [[Título exacto]] a los archivos citados."
}`;

  try {
    const res = await callGeminiJson(prompt);
    if (res?.markdown) {
      return {
        agentName: 'Athena · Gemini',
        title: res.title || `Síntesis: ${question.slice(0, 42)}`,
        markdown: res.markdown,
      };
    }
  } catch (err) {
    console.warn('[AgentService] Fallback síntesis local:', err);
  }

  // Fallback estructurado local
  const refs = scopeItems.slice(0, 6).map((it) => `- [[${it.title}]] (${it.category}) — ${it.note || 'Archivo en bóveda'}`);
  return {
    agentName: 'Athena Local',
    title: `Análisis: ${question.slice(0, 48)}`,
    markdown: [
      `# Análisis: ${question}`,
      '',
      `> **Ámbito analizado**: ${scopeLabel} (${scopeItems.length} archivos)`,
      '',
      '## Archivos clave relacionados',
      ...refs,
      '',
      '## Siguientes pasos recomendados',
      '- Revisar los archivos listados y crear una **Relación-Elemento** `.md` entre los conceptos puente.',
      '- Añadir evidencia adjunta (`.pdf`, `.svg`, `.mp4`) en los nodos que aún no tengan respaldo documental.',
      '',
    ].join('\n'),
  };
}

const AgentService = {
  analyzeItemWithAgent,
  synthesizeVaultQuestion,
};

export default AgentService;
