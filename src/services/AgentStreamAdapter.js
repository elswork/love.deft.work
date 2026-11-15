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
  const visionNode =
    items.find((it) => it.id === 'plat-vision-v3') ||
    items[0] ||
    null;
  const backlogNode =
    items.find((it) => it.id === 'plat-backlog-sprints') ||
    items[1] ||
    visionNode;

  const vTitle = visionNode?.title || 'Sistema Operativo de Conocimiento · Visión v3';
  const bTitle = backlogNode?.title || 'Backlog Técnico Priorizado · Próximos Sprints';
  const vFile = visionNode ? getFileDisplayName(visionNode) : 'sistema-operativo-vision-v3.md';
  const bFile = backlogNode ? getFileDisplayName(backlogNode) : 'backlog-tecnico-sprints.md';
  const totalCount = items.length;

  return [
    {
      id: 'athena',
      codename: 'ATH-01',
      name: 'Athena · Synthesist',
      role: 'Arquitectura evolutiva, especificación de sprints y convergencia de producto',
      model: 'gemini-2.5-flash',
      transport: 'stream-local',
      status: 'awaiting_approval',
      progress: 100,
      tokens: 394,
      latencyMs: 520,
      targetItemId: backlogNode?.id || '',
      targetTitle: bTitle,
      currentTool: 'propose_growth_milestone',
      streamedMarkdown: [
        `### Diagnóstico de Crecimiento · love.deft.work`,
        '',
        `He analizado los **${totalCount || 18}** nodos activos cruzando **[[${vTitle}]]** con **[[${bTitle}]]**:`,
        '',
        `- **Palanca nº 1 (Captura sin fricción):** Priorizar el *Web Clipper MV3* + cola \`pending_bot\` para multiplicar la tasa de ingesta semanal desde navegador y móvil.`,
        `- **Palanca nº 2 (Memoria vectorial e historial):** Añadir subcolección \`revisions/\` antes de consolidar ediciones de agentes en \`.md\` existentes.`,
        `- **Propuesta HITL lista:** Crear nota técnica de implementación conectada al backlog para iniciar el siguiente sprint.`,
      ].join('\n'),
      proposal: {
        kind: 'create_note',
        title: 'Especificación · Web Clipper MV3 & Cola de Ingesta',
        category: '03 · Motor de Crecimiento & Ingesta',
        relationLabel: 'implementa',
        sourceId: backlogNode?.id || '',
        targetId: visionNode?.id || '',
        markdownContent: [
          `# Especificación · Web Clipper MV3 & Cola de Ingesta`,
          '',
          `> Propuesta consolidada por Humano + **Athena · Synthesist** para ampliar \`love.deft.work\``,
          '',
          `## Objetivo`,
          `Reducir a **< 3 segundos** la captura de URLs, citas seleccionadas o PDFs desde Chrome directamente hacia [[Pipeline de Ingesta Automática · URLs y Multimedia]].`,
          '',
          `## Contrato mínimo del payload`,
          `- Escritura autenticada en \`discoveries/\` con \`authorKind: "human"\` y \`reviewStatus: "pending"\`.`,
          `- Enriquecimiento automático en segundo plano vía [[Contrato de Streaming SSE y WebSocket]].`,
          `- Validación final humana mediante atajo \`[A]\` según [[Flujo Human-in-the-Loop (HITL) y Telemetría]].`,
        ].join('\n'),
      },
      toolCalls: [
        { id: 'tc-1', tool: 'vault.read_index', args: `{ scope: "platform", nodes: ${totalCount} }`, status: 'ok', durationMs: 34 },
        { id: 'tc-2', tool: 'graph.trace_dependencies', args: `{ from: "${vFile}", to: "${bFile}" }`, status: 'ok', durationMs: 88 },
        { id: 'tc-3', tool: 'hitl.stage_proposal', args: '{ target: "03 · Motor de Crecimiento & Ingesta" }', status: 'pending', durationMs: 398 },
      ],
    },
    {
      id: 'hermes',
      codename: 'HRM-02',
      name: 'Hermes · Graph Linker',
      role: 'Detección de nodos huérfanos, convergencia taxonómica y [[WikiLinks]]',
      model: 'gemini-2.5-flash',
      transport: 'stream-local',
      status: 'completed',
      progress: 100,
      tokens: 248,
      latencyMs: 310,
      targetItemId: visionNode?.id || '',
      targetTitle: vTitle,
      currentTool: 'idle',
      streamedMarkdown: [
        `### Salud del Hipergrafo Verificada`,
        '',
        `- Supervisando **${totalCount || 18} nodos** y sus relaciones reificadas (\`kind: "relation"\`).`,
        `- Selecciona cualquier nota o pulsa **Huecos epistémicos** abajo para que proponga nuevas aristas entre categorías.`,
      ].join('\n'),
      proposal: null,
      toolCalls: [
        { id: 'tc-h1', tool: 'graph.scan_orphans', args: '{ threshold: 0 }', status: 'ok', durationMs: 41 },
        { id: 'tc-h2', tool: 'taxonomy.check_library_rule', args: '{ categories: 6 }', status: 'ok', durationMs: 96 },
      ],
    },
    {
      id: 'argus',
      codename: 'ARG-03',
      name: 'Argus · Security & Quality',
      role: 'Auditoría de firestore.rules, límites Storage (15 MB) y esquema de metadatos',
      model: 'verifier-v1',
      transport: 'stream-local',
      status: 'paused',
      progress: 50,
      tokens: 142,
      latencyMs: 190,
      targetItemId: 'plat-security-rules',
      targetTitle: 'Directrices de Seguridad y Reglas Firebase',
      currentTool: 'await_resume',
      streamedMarkdown: [
        `### Auditoría de Cumplimiento en Pausa`,
        '',
        `Pulsa **[P] Reanudar** o envía un prompt para auditar adjuntos en \`love_attachments/\`, visibilidad \`isPublic\` o consistencia de campos antes de desplegar cambios en \`free-deft-work\`.`,
      ].join('\n'),
      proposal: null,
      toolCalls: [
        { id: 'tc-a1', tool: 'security.audit_rules_alignment', args: '{ project: "free-deft-work" }', status: 'paused', durationMs: 190 },
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
