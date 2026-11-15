import AgentService from './AgentService';
import { getFileDisplayName } from './MarkdownVaultService';

/**
 * Estados oficiales del ciclo Human-in-the-Loop (HITL) de cada agente.
 */
export const AGENT_STATES = {
  thinking: { label: 'Pensando', tone: 'cyan', pulse: true },
  tool_use: { label: 'Ejecutando herramienta', tone: 'violet', pulse: true },
  awaiting_approval: { label: 'Esperando aprobación', tone: 'amber', pulse: true },
  completed: { label: 'Completado', tone: 'emerald', pulse: false },
  paused: { label: 'Pausado', tone: 'slate', pulse: false },
  rejected: { label: 'Revisión solicitada', tone: 'rose', pulse: false },
};

function formatClockTime(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function createLogEntry(level, source, message, payload = '') {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: formatClockTime(),
    level, // 'info' | 'tool' | 'hitl' | 'warn' | 'done'
    source,
    message,
    payload,
  };
}

/**
 * Inicializa 3 agentes colaboradores con estado realista para operar desde el primer frame
 * sin dependencias externas obligatorias, sincronizados con los archivos reales de la bóveda.
 */
export function createInitialAgents(items = []) {
  const primary = items[0] || null;
  const secondary = items[1] || items[0] || null;

  const pName = primary ? getFileDisplayName(primary) : 'manifiesto-anticitera.md';
  const sName = secondary ? getFileDisplayName(secondary) : 'arquitectura-conocimiento.md';

  return [
    {
      id: 'athena',
      codename: 'ATH-01',
      name: 'Athena · Synthesist',
      role: 'Síntesis transversal y detección de huecos epistémicos',
      model: 'gemini-2.5-flash',
      transport: 'stream-local',
      status: 'awaiting_approval',
      progress: 92,
      tokens: 418,
      latencyMs: 640,
      targetItemId: primary?.id || '',
      targetTitle: primary?.title || 'Manifiesto Anticitera',
      currentTool: 'propose_vault_synthesis',
      streamedMarkdown: [
        `### Propuesta de Síntesis y Enlace Estructural`,
        '',
        `He cruzado el contenido de **[[${primary?.title || 'Manifiesto Anticitera'}]]** (\`${pName}\`) con los nodos activos de la bóveda:`,
        '',
        `- **Hipótesis de enlace:** Existe alta afinidad semántica con [[${secondary?.title || 'Arquitectura de Conocimiento'}]].`,
        `- **Acción propuesta:** Consolidar una nota Markdown verificada y registrar una **Relación-Elemento** (\`kind: relation\`) para hacer explícito el puente conceptual.`,
        `- **Riesgo evaluado:** Bajo · 0 colisiones de identificadores detectadas.`,
      ].join('\n'),
      proposal: {
        kind: 'create_note',
        title: `Síntesis · ${primary?.title || 'Núcleo de Bóveda'}`,
        category: primary?.category || 'Anticitera',
        relationLabel: 'sintetiza_y_conecta',
        sourceId: primary?.id || '',
        targetId: secondary?.id || '',
        markdownContent: [
          `# Síntesis · ${primary?.title || 'Núcleo de Bóveda'}`,
          '',
          `> Generado en simbiosis Humano + **Athena · Synthesist**`,
          '',
          `## Hallazgos principales`,
          `- Nodo origen: [[${primary?.title || pName}]]`,
          `- Puente propuesto: [[${secondary?.title || sName}]]`,
          '',
          `## Conclusión accionable`,
          `Validar las fuentes multimedia adjuntas y mantener actualizada la relación bidireccional en el grafo.`,
        ].join('\n'),
      },
      toolCalls: [
        { id: 'tc-1', tool: 'vault.read_index', args: '{ scope: "visible", limit: 30 }', status: 'ok', durationMs: 38 },
        { id: 'tc-2', tool: 'graph.extract_wikilinks', args: `{ file: "${pName}" }`, status: 'ok', durationMs: 92 },
        { id: 'tc-3', tool: 'hitl.stage_proposal', args: '{ action: "create_note" }', status: 'pending', durationMs: 510 },
      ],
    },
    {
      id: 'hermes',
      codename: 'HRM-02',
      name: 'Hermes · Graph Linker',
      role: 'Curación automática de [[WikiLinks]] y nodos huérfanos',
      model: 'gemini-2.5-flash',
      transport: 'stream-local',
      status: 'completed',
      progress: 100,
      tokens: 276,
      latencyMs: 390,
      targetItemId: secondary?.id || '',
      targetTitle: secondary?.title || 'Índice de Conexiones',
      currentTool: 'idle',
      streamedMarkdown: [
        `### Auditoría de Integridad de Grafo completada`,
        '',
        `- Enlaces \`[[WikiLink]]\` verificados sin destinos rotos en el subgrafo principal.`,
        `- Listo para ejecutar descubrimiento de conexiones ante un nuevo archivo o comando humano.`,
      ].join('\n'),
      proposal: null,
      toolCalls: [
        { id: 'tc-h1', tool: 'graph.scan_orphans', args: '{ threshold: 0 }', status: 'ok', durationMs: 44 },
        { id: 'tc-h2', tool: 'links.verify_targets', args: '{ mode: "strict" }', status: 'ok', durationMs: 118 },
      ],
    },
    {
      id: 'argus',
      codename: 'ARG-03',
      name: 'Argus · Media Verifier',
      role: 'Validación de adjuntos (.pdf, .svg, .mp4, .url) y backlinks',
      model: 'verifier-v1',
      transport: 'stream-local',
      status: 'paused',
      progress: 45,
      tokens: 124,
      latencyMs: 215,
      targetItemId: '',
      targetTitle: 'Cola de verificación multimedia',
      currentTool: 'await_resume',
      streamedMarkdown: [
        `### Inspección en pausa por control humano`,
        '',
        `Pulsa **[P] Reanudar** o envía una nueva directriz para verificar checksums, MIME types y visibilidad compartida en Storage.`,
      ].join('\n'),
      proposal: null,
      toolCalls: [
        { id: 'tc-a1', tool: 'storage.inspect_headers', args: '{ bucket: "love_attachments" }', status: 'paused', durationMs: 215 },
      ],
    },
  ];
}

/**
 * Conector preparado para backends en tiempo real (SSE o WebSocket).
 * Si el endpoint está disponible, reenvía frames JSON estructurados al runtime UI;
 * en modo local ejecuta el adaptador de streaming integrado sin latencia de red innecesaria.
 */
export function connectAgentTransport({ mode = 'simulator', endpoint = '', onEvent, onError }) {
  if (mode === 'sse' && endpoint && typeof EventSource !== 'undefined') {
    const es = new EventSource(endpoint);
    es.onmessage = (evt) => {
      try {
        const frame = JSON.parse(evt.data);
        onEvent?.(frame);
      } catch (err) {
        onError?.(err);
      }
    };
    es.onerror = (err) => {
      onError?.(err);
    };
    return {
      mode: 'sse',
      disconnect: () => es.close(),
    };
  }

  if (mode === 'ws' && endpoint && typeof WebSocket !== 'undefined') {
    const ws = new WebSocket(endpoint);
    ws.onmessage = (evt) => {
      try {
        const frame = JSON.parse(evt.data);
        onEvent?.(frame);
      } catch (err) {
        onError?.(err);
      }
    };
    ws.onerror = (err) => {
      onError?.(err);
    };
    return {
      mode: 'ws',
      send: (payload) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(payload));
        }
      },
      disconnect: () => ws.close(),
    };
  }

  return {
    mode: 'simulator',
    disconnect: () => {},
  };
}

/**
 * Ejecuta una tarea colaborativa de agente sobre la bóveda real con streaming por tokens
 * (sin saltos de layout CLS) y entrega una propuesta accionable para aprobación HITL.
 */
export async function runStreamingAgentTask({
  agentId,
  prompt,
  taskType = 'synthesize', // 'analyze_item' | 'synthesize' | 'redirect'
  activeItem = null,
  allItems = [],
  scopeLabel = 'Toda la bóveda',
  shouldAbort,
  isPaused,
  onPatchAgent,
  onLog,
}) {
  const startedAt = performance.now();
  const targetTitle = activeItem?.title || scopeLabel;

  onPatchAgent(agentId, {
    status: 'thinking',
    progress: 12,
    tokens: 0,
    targetItemId: activeItem?.id || '',
    targetTitle,
    currentTool: 'context.assemble',
    streamedMarkdown: '',
    proposal: null,
    toolCalls: [
      {
        id: `tc-${Date.now()}-1`,
        tool: 'context.assemble',
        args: `{ items: ${allItems.length}, focus: "${activeItem ? getFileDisplayName(activeItem) : scopeLabel}" }`,
        status: 'running',
        durationMs: 0,
      },
    ],
  });
  onLog(createLogEntry('info', agentId.toUpperCase(), `Inicio de ejecución · "${prompt.slice(0, 80)}"`));

  await new Promise((r) => setTimeout(r, 180));
  if (shouldAbort?.()) return;

  onPatchAgent(agentId, (prev) => ({
    status: 'tool_use',
    progress: 38,
    currentTool: taskType === 'analyze_item' ? 'agent.analyze_connections' : 'agent.synthesize_vault',
    toolCalls: [
      ...(prev.toolCalls || []).map((tc) => ({ ...tc, status: 'ok', durationMs: 42 })),
      {
        id: `tc-${Date.now()}-2`,
        tool: taskType === 'analyze_item' ? 'agent.analyze_connections' : 'agent.synthesize_vault',
        args: `{ scope: "${scopeLabel}", strategy: "gemini-or-lexical" }`,
        status: 'running',
        durationMs: 0,
      },
    ],
  }));
  onLog(createLogEntry('tool', agentId.toUpperCase(), `Invocando ${taskType === 'analyze_item' ? 'analyzeItemWithAgent()' : 'synthesizeVaultQuestion()'}`));

  let finalMarkdown = '';
  let proposal = null;

  if (taskType === 'analyze_item' && activeItem) {
    const analysis = await AgentService.analyzeItemWithAgent(activeItem, allItems);
    if (shouldAbort?.()) return;
    const suggestionsLines = (analysis.suggestions || []).map(
      (s) => `- **[[${s.targetTitle}]]** · \`${s.relationLabel}\` — ${s.reason}`
    );
    finalMarkdown = [
      `### Análisis de Archivo · ${getFileDisplayName(activeItem)}`,
      '',
      analysis.summary || 'Análisis completado sobre el contexto del archivo.',
      '',
      ...(suggestionsLines.length > 0
        ? ['#### Conexiones propuestas para aprobación HITL', ...suggestionsLines]
        : ['#### Estado de conexiones', '- No se detectaron nuevas aristas pendientes con umbral mínimo.']),
    ].join('\n');

    const firstSug = analysis.suggestions?.[0] || null;
    proposal = {
      kind: firstSug ? 'create_relation' : 'update_note',
      title: firstSug
        ? `${activeItem.title} — ${firstSug.relationLabel} → ${firstSug.targetTitle}`
        : `Resumen IA · ${activeItem.title}`,
      category: activeItem.category || 'Anticitera',
      sourceId: activeItem.id,
      targetId: firstSug?.targetId || '',
      relationLabel: firstSug?.relationLabel || 'analiza',
      suggestions: analysis.suggestions || [],
      markdownContent: finalMarkdown,
    };
  } else {
    const res = await AgentService.synthesizeVaultQuestion(prompt, allItems, scopeLabel);
    if (shouldAbort?.()) return;
    finalMarkdown = res.markdown || '';
    proposal = {
      kind: 'create_note',
      title: res.title || `Síntesis: ${prompt.slice(0, 42)}`,
      category: activeItem?.category || (scopeLabel.startsWith('Categoría: ') ? scopeLabel.replace('Categoría: ', '') : 'Anticitera'),
      sourceId: activeItem?.id || '',
      targetId: '',
      relationLabel: 'sintetiza',
      markdownContent: finalMarkdown,
    };
  }

  // Streaming incremental por palabras manteniendo geometría estable (CLS = 0)
  const words = finalMarkdown.split(/(\s+)/);
  let built = '';
  let tokenCount = 0;

  for (let i = 0; i < words.length; i += 2) {
    if (shouldAbort?.()) return;
    while (isPaused?.()) {
      await new Promise((r) => setTimeout(r, 120));
      if (shouldAbort?.()) return;
    }
    const chunk = (words[i] || '') + (words[i + 1] || '');
    built += chunk;
    tokenCount += 1;
    const pct = Math.min(96, 42 + Math.round(((i + 2) / Math.max(1, words.length)) * 54));
    onPatchAgent(agentId, {
      streamedMarkdown: built,
      progress: pct,
      tokens: tokenCount,
      latencyMs: Math.round(performance.now() - startedAt),
    });
    await new Promise((r) => setTimeout(r, 16));
  }

  const totalLatency = Math.round(performance.now() - startedAt);
  onPatchAgent(agentId, (prev) => ({
    status: 'awaiting_approval',
    progress: 100,
    tokens: tokenCount,
    latencyMs: totalLatency,
    currentTool: 'hitl.awaiting_human',
    streamedMarkdown: finalMarkdown,
    proposal,
    toolCalls: (prev.toolCalls || []).map((tc) =>
      tc.status === 'running' ? { ...tc, status: 'ok', durationMs: totalLatency } : tc
    ),
  }));
  onLog(createLogEntry('hitl', agentId.toUpperCase(), `Propuesta lista (${tokenCount} tokens · ${totalLatency} ms). Esperando aprobación humana.`));
}
