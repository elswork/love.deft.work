/**
 * Bóveda operativa real de love.deft.work enfocada en su arquitectura,
 * protocolos Human-in-the-Loop, ingesta y palancas técnicas de crecimiento.
 */

export const PLATFORM_ARCHITECTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 480" width="960" height="480">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09090b"/>
      <stop offset="100%" stop-color="#111114"/>
    </linearGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1"/>
    </marker>
    <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#22d3ee"/>
    </marker>
    <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#34d399"/>
    </marker>
  </defs>
  <rect width="960" height="480" rx="14" fill="url(#bg)" stroke="#27272a" stroke-width="1.5"/>
  <text x="36" y="42" fill="#fafafa" font-family="Inter, sans-serif" font-size="18" font-weight="700">love.deft.work · Arquitectura Precision Engineering Humano + Agentes</text>
  <text x="36" y="64" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="12">Simbiosis operativa: Command Center -> Streaming SSE/WS -> Bóveda Obsidian -> Firestore / Storage</text>

  <!-- Columna 1: Agentes y Bóveda -->
  <rect x="36" y="96" width="250" height="340" rx="10" fill="#18181b" stroke="#27272a"/>
  <text x="56" y="126" fill="#22d3ee" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600">01 · RUNTIME + EXPLORADOR</text>
  <rect x="56" y="144" width="210" height="62" rx="8" fill="#111114" stroke="#3f3f46"/>
  <circle cx="74" cy="166" r="5" fill="#fbbf24"/>
  <text x="88" y="170" fill="#fafafa" font-family="Inter, sans-serif" font-size="13" font-weight="600">Athena · Synthesist</text>
  <text x="70" y="191" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">ATH-01 · HITL Pending</text>

  <rect x="56" y="218" width="210" height="62" rx="8" fill="#111114" stroke="#3f3f46"/>
  <circle cx="74" cy="240" r="5" fill="#34d399"/>
  <text x="88" y="244" fill="#fafafa" font-family="Inter, sans-serif" font-size="13" font-weight="600">Hermes · Graph Linker</text>
  <text x="70" y="265" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">HRM-02 · [[WikiLinks]]</text>

  <rect x="56" y="292" width="210" height="62" rx="8" fill="#111114" stroke="#3f3f46"/>
  <circle cx="74" cy="314" r="5" fill="#a78bfa"/>
  <text x="88" y="318" fill="#fafafa" font-family="Inter, sans-serif" font-size="13" font-weight="600">Argus · Media Verifier</text>
  <text x="70" y="339" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">ARG-03 · Rules &amp; MIME</text>

  <rect x="56" y="368" width="210" height="48" rx="8" fill="#09090b" stroke="#27272a"/>
  <text x="70" y="396" fill="#fafafa" font-family="JetBrains Mono, monospace" font-size="11">Bóveda: .md .svg .pdf .url</text>

  <!-- Columna 2: Centro de Mando -->
  <rect x="348" y="96" width="276" height="220" rx="10" fill="#18181b" stroke="#6366f1" stroke-width="1.5"/>
  <text x="368" y="126" fill="#a78bfa" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600">02 · COMMAND CANVAS (CLS = 0)</text>
  <rect x="368" y="144" width="236" height="84" rx="8" fill="#09090b" stroke="#27272a"/>
  <text x="382" y="168" fill="#fafafa" font-family="Inter, sans-serif" font-size="13" font-weight="600">Stream Markdown Token-a-Token</text>
  <text x="382" y="190" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">[A] Aprobar  [R] Revisar</text>
  <text x="382" y="209" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">[P] Pausar   [⌘K] Comandos</text>

  <rect x="368" y="242" width="236" height="54" rx="8" fill="#111114" stroke="#27272a"/>
  <text x="382" y="266" fill="#34d399" font-family="JetBrains Mono, monospace" font-size="11">Consolidación Directa HITL</text>
  <text x="382" y="283" fill="#a1a1aa" font-family="Inter, sans-serif" font-size="11.5">Promueve propuestas a nodos reales</text>

  <!-- Transporte & Backend -->
  <rect x="348" y="336" width="276" height="100" rx="10" fill="#18181b" stroke="#22d3ee"/>
  <text x="368" y="364" fill="#22d3ee" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600">CAPA DE TRANSPORTE &amp; IA</text>
  <text x="368" y="388" fill="#fafafa" font-family="Inter, sans-serif" font-size="12.5">SSE EventSource · WebSocket · Gemini</text>
  <text x="368" y="410" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">connectAgentTransport() -&gt; Cloud Run</text>

  <!-- Columna 3: Persistencia y Grafo -->
  <rect x="684" y="96" width="240" height="340" rx="10" fill="#18181b" stroke="#27272a"/>
  <text x="704" y="126" fill="#34d399" font-family="JetBrains Mono, monospace" font-size="11" font-weight="600">03 · HIPERGRAFO &amp; PERSISTENCIA</text>
  <rect x="704" y="144" width="200" height="84" rx="8" fill="#111114" stroke="#3f3f46"/>
  <text x="720" y="168" fill="#fafafa" font-family="Inter, sans-serif" font-size="13" font-weight="600">Cloud Firestore</text>
  <text x="720" y="188" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">discoveries/ (file | relation)</text>
  <text x="720" y="206" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">categories/ (reglas RBAC)</text>

  <rect x="704" y="242" width="200" height="74" rx="8" fill="#111114" stroke="#3f3f46"/>
  <text x="720" y="266" fill="#fafafa" font-family="Inter, sans-serif" font-size="13" font-weight="600">Firebase Storage</text>
  <text x="720" y="286" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">love_attachments/&lt;uid&gt;/*</text>
  <text x="720" y="303" fill="#a1a1aa" font-family="JetBrains Mono, monospace" font-size="11">SVG · PDF · MP4 · Markdown</text>

  <rect x="704" y="330" width="200" height="86" rx="8" fill="#111114" stroke="#3f3f46"/>
  <text x="720" y="354" fill="#fafafa" font-family="Inter, sans-serif" font-size="13" font-weight="600">Creación de Valor</text>
  <text x="720" y="375" fill="#a1a1aa" font-family="Inter, sans-serif" font-size="11.5">Backlinks + Relaciones reificadas</text>
  <text x="720" y="395" fill="#fbbf24" font-family="JetBrains Mono, monospace" font-size="11">Backlog -&gt; Clipping -&gt; Bots</text>

  <!-- Flechas -->
  <line x1="286" y1="205" x2="344" y2="205" stroke="#6366f1" stroke-width="2" marker-end="url(#arrow)"/>
  <line x1="624" y1="190" x2="680" y2="190" stroke="#34d399" stroke-width="2" marker-end="url(#arrow-emerald)"/>
  <line x1="486" y1="316" x2="486" y2="334" stroke="#22d3ee" stroke-width="2" marker-end="url(#arrow-cyan)"/>
  <line x1="624" y1="382" x2="680" y2="285" stroke="#22d3ee" stroke-width="2" marker-end="url(#arrow-cyan)"/>
</svg>`;

export const PLATFORM_CATEGORIES = [
  { name: '01 · Arquitectura & Núcleo', colorKey: 'cyan', pinned: true, order: 600 },
  { name: '02 · Protocolos Humano-Agente', colorKey: 'violet', pinned: true, order: 500 },
  { name: '03 · Motor de Crecimiento & Ingesta', colorKey: 'emerald', pinned: false, order: 400 },
  { name: '04 · Hoja de Ruta & Backlog Vivo', colorKey: 'amber', pinned: false, order: 300 },
  { name: '05 · Recursos & Endpoints Clave', colorKey: 'rose', pinned: false, order: 200 },
  { name: '06 · Relaciones Estructurales', colorKey: 'indigo', pinned: false, order: 100 },
];

export const PLATFORM_ITEMS = [
  {
    id: 'plat-vision-v3',
    title: 'Sistema Operativo de Conocimiento · Visión v3',
    category: '01 · Arquitectura & Núcleo',
    kind: 'file',
    type: 'phrase',
    pinned: true,
    authorKind: 'hybrid',
    authorName: 'Equipo Anticitera + Athena',
    reviewStatus: 'verified',
    note: 'Documento rector de love.deft.work como centro de mando simbiótico Humano + Agentes.',
    relatedIds: ['plat-schema-firestore', 'plat-hitl-protocol', 'plat-arch-svg', 'plat-backlog-sprints'],
    markdownContent: `# Sistema Operativo de Conocimiento · Visión v3

**love.deft.work** evoluciona desde un repositorio estático hacia un **Centro de Mando Colaborativo Humano + Agentes** sobre la infraestructura real de \`free-deft-work\`.

![[mapa-arquitectura-v3.svg]]

## Principios operativos para hacer crecer la plataforma
1. **Todo elemento es un fichero interoperable:** notas \`.md\`, diagramas \`.svg\`, documentos \`.pdf\`, vídeos \`.mp4\`, referencias \`.url\` y relaciones reificadas \`.md\`.
2. **Las relaciones son nodos de primera clase:** cualquier arista con significado propio se materializa como fichero \`kind: "relation"\` para admitir hipótesis, evidencia y revisión por agentes.
3. **Human-in-the-Loop sin fricción:** cada agente opera en tiempo real con estado visible y espera validación en una pulsación (\`[A]\` aprobar, \`[R]\` revisar, \`[P]\` pausar).

## Mapa de documentos nucleares
- Persistencia y reglas: [[Esquema de Datos Firestore · discoveries y categories]]
- Interacción en vivo: [[Flujo Human-in-the-Loop (HITL) y Telemetría]]
- Siguiente fase de crecimiento: [[Backlog Técnico Priorizado · Próximos Sprints]]`,
  },
  {
    id: 'plat-schema-firestore',
    title: 'Esquema de Datos Firestore · discoveries y categories',
    category: '01 · Arquitectura & Núcleo',
    kind: 'file',
    type: 'phrase',
    pinned: true,
    authorKind: 'human',
    authorName: 'Arquitectura Core',
    reviewStatus: 'verified',
    note: 'Contrato vivo de colecciones discoveries y categories y campos clave para evolucionar el grafo.',
    relatedIds: ['plat-vision-v3', 'plat-security-rules', 'plat-ingestion-pipeline'],
    markdownContent: `# Esquema de Datos Firestore · \`discoveries\` y \`categories\`

Todas las vistas (Explorador, Command Canvas, Estudio Markdown y Grafo SVG) operan sobre dos colecciones compartidas en Cloud Firestore (\`free-deft-work\`).

## Campos actuales en \`discoveries/{id}\`
| Campo | Tipo | Uso en plataforma |
| :--- | :--- | :--- |
| \`title\` / \`name\` | \`string\` | Identificador visible y clave de resolución \`[[WikiLink]]\` |
| \`category\` / \`extraCategories\` | \`string / string[]\` | Listas estilo Obsidian multi-ubicación |
| \`kind\` | \`'file' \\| 'relation'\` | Distingue ficheros estándar de relaciones reificadas |
| \`sourceId\` / \`targetId\` / \`relationLabel\` | \`string\` | Arista dirigida para relaciones reificadas |
| \`markdownContent\` | \`string\` | Cuerpo Markdown completo con \`![[Embeds]]\` |
| \`attachment\` | \`object \\| null\` | Referencia en Storage (\`url\`, \`storagePath\`, \`contentType\`, \`size\`) |
| \`authorKind\` / \`reviewStatus\` | \`string\` | Trazabilidad \`human \\| agent \\| hybrid\` y estado HITL |

## Campos previstos para escalar (Fase 4)
- \`schemaVersion\`: control de migraciones incrementales sin romper clientes antiguos.
- \`agentRunId\`: trazabilidad exacta entre una nota y la sesión de agente que la generó.
- \`embedding\`: vector semántico para recuperación RAG híbrida.

Ver [[Directrices de Seguridad y Reglas Firebase]] y [[Pipeline de Ingesta Automática · URLs y Multimedia]].`,
  },
  {
    id: 'plat-arch-svg',
    title: 'mapa-arquitectura-v3.svg',
    category: '01 · Arquitectura & Núcleo',
    kind: 'file',
    type: 'phrase',
    pinned: false,
    authorKind: 'agent',
    authorName: 'Athena · Synthesist',
    reviewStatus: 'verified',
    attachmentKind: 'arch_svg',
    note: 'Diagrama vectorial de arquitectura de 3 paneles, capa SSE/WS y persistencia Firestore + Storage.',
    relatedIds: ['plat-vision-v3', 'plat-sse-ws-contract', 'plat-hitl-protocol'],
    markdownContent: `# Diagrama de Arquitectura Precision Engineering (\`.svg\`)

![[mapa-arquitectura-v3.svg]]

Este artefacto vectorial resume el flujo completo de datos en [[Sistema Operativo de Conocimiento · Visión v3]]:
- **Columna Izquierda:** Monitoreo continuo de agentes + árbol unificado por categorías.
- **Lienzo Central:** Consola streaming \`CLS = 0\` gobernada por [[Flujo Human-in-the-Loop (HITL) y Telemetría]].
- **Transporte:** Enchufable a backend externo mediante [[Contrato de Streaming SSE y WebSocket]].`,
  },
  {
    id: 'plat-hitl-protocol',
    title: 'Flujo Human-in-the-Loop (HITL) y Telemetría',
    category: '02 · Protocolos Humano-Agente',
    kind: 'file',
    type: 'phrase',
    pinned: true,
    authorKind: 'hybrid',
    authorName: 'HCI Lab + Athena',
    reviewStatus: 'verified',
    note: 'Máquina de estados de agentes, atajos de teclado y consolidación de propuestas en bóveda.',
    relatedIds: ['plat-vision-v3', 'plat-sse-ws-contract', 'plat-taxonomy-strategy', 'plat-backlog-sprints'],
    markdownContent: `# Flujo Human-in-the-Loop (HITL) y Telemetría

Para operar en simbiosis real sin fricción de chatbot, cada agente expone su ciclo de vida completo en la barra lateral y en el lienzo central:

## Máquina de estados (\`AGENT_STATES\`)
1. \`thinking\` — Ensamblando contexto desde la bóveda activa.
2. \`tool_use\` — Invocando herramientas inspeccionables en el panel derecho (\`Logs & Trace\`).
3. \`awaiting_approval\` — Artefacto o relación preparada esperando firma humana.
4. \`completed\` / \`paused\` / \`rejected\` — Ciclo cerrado, detenido o devuelto con nueva directriz.

## Atajos de teclado de alta velocidad
- \`Cmd/Ctrl + K\`: Abre la paleta universal para saltar a cualquier nota o comando.
- \`1\` / \`2\` / \`3\`: Cambia instantáneamente entre **Stream & HITL**, **Estudio .md** y **Grafo**.
- \`A\`: Aprueba la propuesta activa y crea el nodo real en Firestore.
- \`R\`: Solicita revisión humana manteniendo el hilo de ejecución.
- \`P\`: Pausa o reanuda el streaming sin perder tokens generados.
- \`J\` / \`K\`: Cambia el foco entre agentes activos.

Implementación coordinada con [[Contrato de Streaming SSE y WebSocket]] y validada contra [[Estrategia de Taxonomía Semántica e Hipergrafo]].`,
  },
  {
    id: 'plat-sse-ws-contract',
    title: 'Contrato de Streaming SSE y WebSocket',
    category: '02 · Protocolos Humano-Agente',
    kind: 'file',
    type: 'phrase',
    pinned: false,
    authorKind: 'human',
    authorName: 'Platform Core',
    reviewStatus: 'verified',
    note: 'Especificación de frames JSON para enchufar un backend Cloud Run / FastAPI / Node en tiempo real.',
    relatedIds: ['plat-arch-svg', 'plat-hitl-protocol', 'plat-ingestion-pipeline', 'plat-link-github'],
    markdownContent: `# Contrato de Streaming SSE y WebSocket

El adaptador \`connectAgentTransport()\` en \`src/services/AgentStreamAdapter.js\` permite conectar cualquier servicio backend sin tocar componentes React.

## Formato de frame JSON esperado
\`\`\`json
{
  "agentId": "athena",
  "patch": {
    "status": "tool_use",
    "currentTool": "vector_search",
    "progress": 64,
    "tokens": 312,
    "streamedMarkdown": "...texto incremental Markdown..."
  },
  "log": "Consulta vectorial completada en 48 ms"
}
\`\`\`

## Endpoints recomendados para producción
- **SSE (\`EventSource\`):** \`https://api.deft.work/agents/stream\` para flujos unidireccionales de baja latencia.
- **WebSocket (\`wss://\`):** \`wss://api.deft.work/agents/ws\` cuando el operador humano necesite cancelar herramientas en curso desde el servidor.

Consulta cómo alimenta este canal a [[Pipeline de Ingesta Automática · URLs y Multimedia]] y el código fuente en [[Repositorio GitHub · elswork/love.deft.work]].`,
  },
  {
    id: 'plat-security-rules',
    title: 'Directrices de Seguridad y Reglas Firebase',
    category: '02 · Protocolos Humano-Agente',
    kind: 'file',
    type: 'phrase',
    pinned: false,
    authorKind: 'human',
    authorName: 'Security Audit',
    reviewStatus: 'verified',
    note: 'Checklist de firestore.rules y storage.rules en el proyecto compartido free-deft-work.',
    relatedIds: ['plat-schema-firestore', 'plat-link-firebase', 'plat-anticitera-ecosystem'],
    markdownContent: `# Directrices de Seguridad y Reglas Firebase

\`love.deft.work\` comparte el proyecto \`free-deft-work\` junto con \`union.deft.work\`, por lo que toda evolución debe respetar el principio de mínimo privilegio:

## Reglas críticas activas
- **Firestore (\`discoveries\` y \`categories\`):**
  - Lectura pública únicamente cuando \`isPublic != false\`; acceso restringido a \`ownerUid\`, \`sharedWith\` y administrador cuando es privado.
  - Creación condicionada a usuario autenticado (\`request.auth != null\`).
  - NUNCA realizar borrados globales \`--all-collections\` para preservar \`unions/\` y \`public_tokens/\`.
- **Storage (\`love_attachments/{uid}/*\`):**
  - Escritura validada por \`request.auth.uid == uid\` y límite estricto de **15 MB** por fichero.

Administra despliegues de reglas desde [[Consola Firebase · free-deft-work]] según [[Esquema de Datos Firestore · discoveries y categories]].`,
  },
  {
    id: 'plat-ingestion-pipeline',
    title: 'Pipeline de Ingesta Automática · URLs y Multimedia',
    category: '03 · Motor de Crecimiento & Ingesta',
    kind: 'file',
    type: 'phrase',
    pinned: true,
    authorKind: 'hybrid',
    authorName: 'Hermes + Growth Team',
    reviewStatus: 'verified',
    note: 'Flujo automatizado desde captura rápida o bot (pending_bot) hasta enriquecimiento, OCR e indexado.',
    relatedIds: ['plat-schema-firestore', 'plat-sse-ws-contract', 'plat-taxonomy-strategy', 'plat-growth-kpis'],
    markdownContent: `# Pipeline de Ingesta Automática · URLs y Multimedia

El crecimiento sostenido de la plataforma depende de reducir a cero el coste de capturar información útil y convertirla en conocimiento enlazado:

## Etapas del pipeline
1. **Captura multicanal:** Subida Drag & Drop en barra lateral, creación \`.md\`, futuro Web Clipper o inserción sintética por bots en \`status: "pending_bot"\`.
2. **Extracción estructural:** \`EnrichmentService\` detecta dominio/favicon/tipo; los workers de Storage generan extractos Markdown para \`.pdf\` y transcripción para \`.mp4\`.
3. **Clasificación e hipervínculo:** Aplicación automática de [[Estrategia de Taxonomía Semántica e Hipergrafo]] sugiriendo \`[[WikiLinks]]\` candidatos.
4. **Validación HITL:** El resultado entra como propuesta para consolidar con \`[A]\` dentro de [[Flujo Human-in-the-Loop (HITL) y Telemetría]].

Impacto directo sobre [[Checklist Técnico de Adquisición y Retención]].`,
  },
  {
    id: 'plat-taxonomy-strategy',
    title: 'Estrategia de Taxonomía Semántica e Hipergrafo',
    category: '03 · Motor de Crecimiento & Ingesta',
    kind: 'file',
    type: 'phrase',
    pinned: false,
    authorKind: 'agent',
    authorName: 'Hermes · Graph Linker',
    reviewStatus: 'verified',
    note: 'Regla de la Biblioteca: equilibrio de abstracción para evitar fragmentación o categorías gigantes.',
    relatedIds: ['plat-ingestion-pipeline', 'plat-hitl-protocol', 'plat-schema-firestore'],
    markdownContent: `# Estrategia de Taxonomía Semántica e Hipergrafo

Basado en \`docs/Taxonomy_Strategy.md\`, la taxonomía evita dos fallos clásicos al crecer la base de conocimiento:

## La "Regla de la Biblioteca"
- **Evitar micro-categorías efímeras** (\`API SSE en Python 3.12\`) que atomizan el árbol lateral.
- **Evitar cajones de sastre opacos** (\`Varios\` o \`General\`) donde nadie encuentra un documento.
- **Usar categorías funcionales claras** combinadas con \`extraCategories\` y **Relaciones-Elemento (\`kind: 'relation'\`)** para cruzar dominios sin duplicar archivos.

## Higiene continua del grafo
- Monitorizar el contador **Huérfanos** (\`degree === 0\`) en la barra superior del Command Center.
- Ejecutar periódicamente a **Hermes** para transformar nodos aislados en nodos enlazados dentro de [[Pipeline de Ingesta Automática · URLs y Multimedia]].`,
  },
  {
    id: 'plat-growth-kpis',
    title: 'Checklist Técnico de Adquisición y Retención',
    category: '03 · Motor de Crecimiento & Ingesta',
    kind: 'file',
    type: 'phrase',
    pinned: false,
    authorKind: 'hybrid',
    authorName: 'Growth Engineering',
    reviewStatus: 'verified',
    note: 'Métricas clave, bucles virales por URLs compartidas y activación de colaboradores.',
    relatedIds: ['plat-ingestion-pipeline', 'plat-backlog-sprints', 'plat-link-anticitera'],
    markdownContent: `# Checklist Técnico de Adquisición y Retención

Para que **love.deft.work** crezca orgánicamente como herramienta diaria y red de conocimiento compartido:

## Métricas estrella (North Star)
- **Activación (< 60s):** Tiempo desde el primer acceso hasta crear o enlazar el primer nodo \`.md\` o \`.url\`.
- **Densidad del grafo:** Ratio \`totalLinks / totalFiles >= 2.0\` con **0% de nodos huérfanos** sin revisar.
- **Efecto red de compartición:** Enlaces profundos públicos (\`?item=\` y \`?cat=\`) con invitación directa a colaboradores Google (\`sharedWith\`) y código QR móvil.

## Palancas inmediatas en producto
- [ ] Exportar paquetes completos de categoría en \`.zip\` (Markdown + adjuntos).
- [ ] Publicar colecciones curadas embebibles en [[Ecosistema Anticitera (.IA)]].
- [ ] Extensión de navegador para guardar URLs con resumen agente automático en 1 clic.

Ejecución secuenciada en [[Backlog Técnico Priorizado · Próximos Sprints]].`,
  },
  {
    id: 'plat-backlog-sprints',
    title: 'Backlog Técnico Priorizado · Próximos Sprints',
    category: '04 · Hoja de Ruta & Backlog Vivo',
    kind: 'file',
    type: 'phrase',
    pinned: true,
    authorKind: 'hybrid',
    authorName: 'Product + Athena',
    reviewStatus: 'verified',
    note: 'Plan táctico de ingeniería editable directamente desde love.deft.work para evolucionar v3.',
    relatedIds: ['plat-vision-v3', 'plat-sse-ws-contract', 'plat-growth-kpis', 'plat-anticitera-ecosystem'],
    markdownContent: `# Backlog Técnico Priorizado · Próximos Sprints

Usa esta nota viva para asignar tareas a humanos o agentes desde el **Command Center**.

## Sprint Actual — Consolidación & Tiempo Real
- [ ] **Worker Cloud Run SSE/WebSocket:** Desplegar servidor conectado a Gemini + Firestore Admin siguiendo [[Contrato de Streaming SSE y WebSocket]].
- [ ] **Búsqueda Semántica Híbrida:** Combinar índice léxico instantáneo en cliente con embeddings persistentes en \`discoveries\`.
- [ ] **Historial de Revisiones / Diff HITL:** Guardar snapshot previo en subcolección \`revisions/\` cuando un agente edite un \`.md\` existente.

## Sprint Siguiente — Expansión & Captura
- [ ] **Web Clipper Chrome MV3 + PWA Share Target:** Enviar artículos, PDFs o selecciones de texto directos a la bóveda.
- [ ] **Workspaces Multi-equipo:** Aislamiento de bóvedas por organización conectando con [[Integración con el Ecosistema deft.work]].

Cada ítem completado debe reflejar su impacto en [[Checklist Técnico de Adquisición y Retención]].`,
  },
  {
    id: 'plat-anticitera-ecosystem',
    title: 'Integración con el Ecosistema deft.work',
    category: '04 · Hoja de Ruta & Backlog Vivo',
    kind: 'file',
    type: 'phrase',
    pinned: false,
    authorKind: 'human',
    authorName: 'Eloy López · Anticitera',
    reviewStatus: 'verified',
    note: 'Sinergia entre love.deft.work, anticitera.deft.work y union.deft.work sobre una base técnica común.',
    relatedIds: ['plat-link-anticitera', 'plat-vision-v3', 'plat-security-rules', 'plat-backlog-sprints'],
    markdownContent: `# Integración con el Ecosistema \`deft.work\`

**love.deft.work** funciona como el núcleo de memoria viva e investigación colaborativa dentro del ecosistema:

- **[[Ecosistema Anticitera (.IA)]]:** Fuente de conocimiento, divulgación e identidad abierta alrededor del Mecanismo de Anticitera y la iniciativa \`ccTLD .IA\`.
- **\`union.deft.work\`:** Coexiste sobre \`free-deft-work\` bajo aislamiento estricto de colecciones definido en [[Directrices de Seguridad y Reglas Firebase]].
- **[[Sistema Operativo de Conocimiento · Visión v3]]:** Sienta el estándar visual *Precision Engineering* reutilizable entre aplicaciones de la suite.`,
  },
  {
    id: 'plat-link-github',
    title: 'Repositorio GitHub · elswork/love.deft.work',
    category: '05 · Recursos & Endpoints Clave',
    kind: 'file',
    type: 'link',
    url: 'https://github.com/elswork/love.deft.work',
    domain: 'github.com',
    authorKind: 'human',
    authorName: 'Platform Core',
    reviewStatus: 'verified',
    note: 'Código fuente oficial, historial de arquitectura y flujo de despliegue continuo.',
    relatedIds: ['plat-sse-ws-contract', 'plat-backlog-sprints'],
    markdownContent: `# Repositorio GitHub · \`elswork/love.deft.work\`

- **URL oficial:** https://github.com/elswork/love.deft.work
- **Uso:** Trazabilidad de commits, revisión de Pull Requests y base del [[Contrato de Streaming SSE y WebSocket]] y [[Backlog Técnico Priorizado · Próximos Sprints]].`,
  },
  {
    id: 'plat-link-firebase',
    title: 'Consola Firebase · free-deft-work',
    category: '05 · Recursos & Endpoints Clave',
    kind: 'file',
    type: 'link',
    url: 'https://console.firebase.google.com/project/free-deft-work/overview',
    domain: 'console.firebase.google.com',
    authorKind: 'human',
    authorName: 'Platform Core',
    reviewStatus: 'verified',
    note: 'Panel operativo de Firestore, Firebase Storage, Authentication y Hosting target love-deft-work.',
    relatedIds: ['plat-security-rules', 'plat-schema-firestore'],
    markdownContent: `# Consola Firebase · \`free-deft-work\`

- **URL oficial:** https://console.firebase.google.com/project/free-deft-work/overview
- **Supervisión:** Cuotas, índices de [[Esquema de Datos Firestore · discoveries y categories]] y cumplimiento de [[Directrices de Seguridad y Reglas Firebase]].`,
  },
  {
    id: 'plat-link-anticitera',
    title: 'Ecosistema Anticitera (.IA)',
    category: '05 · Recursos & Endpoints Clave',
    kind: 'file',
    type: 'link',
    url: 'https://anticitera.deft.work',
    domain: 'anticitera.deft.work',
    authorKind: 'human',
    authorName: 'Eloy López · Anticitera',
    reviewStatus: 'verified',
    note: 'Portal matriz del proyecto Anticitera .IA y comunidad tecnológica abierta.',
    relatedIds: ['plat-anticitera-ecosystem', 'plat-growth-kpis'],
    markdownContent: `# Ecosistema Anticitera (.IA)

- **URL oficial:** https://anticitera.deft.work
- **Rol en crecimiento:** Canal de tracción comunitaria vinculado a [[Integración con el Ecosistema deft.work]] y [[Checklist Técnico de Adquisición y Retención]].`,
  },
  {
    id: 'plat-rel-sse-pipeline',
    title: 'Contrato SSE/WS — habilita → Pipeline de Ingesta Automática',
    category: '06 · Relaciones Estructurales',
    kind: 'relation',
    type: 'phrase',
    sourceId: 'plat-sse-ws-contract',
    targetId: 'plat-ingestion-pipeline',
    relationLabel: 'habilita',
    authorKind: 'hybrid',
    authorName: 'Athena · Synthesist',
    reviewStatus: 'verified',
    note: 'Relación arquitectónica: el protocolo de streaming desacoplado permite ejecutar scrapers y OCR con progreso en vivo.',
    relatedIds: ['plat-sse-ws-contract', 'plat-ingestion-pipeline'],
    markdownContent: `# Relación · Contrato SSE/WS — \`habilita\` → Pipeline de Ingesta Automática

- **Origen:** [[Contrato de Streaming SSE y WebSocket]]
- **Relación:** \`habilita\`
- **Destino:** [[Pipeline de Ingesta Automática · URLs y Multimedia]]

Sin eventos estructurados de progreso y propuesta HITL, la ingesta automática quedaría opaca para el operador humano.`,
  },
  {
    id: 'plat-rel-schema-rules',
    title: 'Esquema Firestore — gobierna → Reglas de Seguridad Firebase',
    category: '06 · Relaciones Estructurales',
    kind: 'relation',
    type: 'phrase',
    sourceId: 'plat-schema-firestore',
    targetId: 'plat-security-rules',
    relationLabel: 'gobierna',
    authorKind: 'human',
    authorName: 'Security Audit',
    reviewStatus: 'verified',
    note: 'Todo nuevo campo o colección añadido al esquema exige su validación correspondiente en firestore.rules.',
    relatedIds: ['plat-schema-firestore', 'plat-security-rules'],
    markdownContent: `# Relación · Esquema Firestore — \`gobierna\` → Reglas de Seguridad Firebase

- **Origen:** [[Esquema de Datos Firestore · discoveries y categories]]
- **Relación:** \`gobierna\`
- **Destino:** [[Directrices de Seguridad y Reglas Firebase]]

Garantiza que ninguna evolución del modelo de datos rompa la frontera multi-app con \`union.deft.work\`.`,
  },
  {
    id: 'plat-rel-backlog-growth',
    title: 'Backlog Priorizado — ejecuta → Checklist de Adquisición y Retención',
    category: '06 · Relaciones Estructurales',
    kind: 'relation',
    type: 'phrase',
    sourceId: 'plat-backlog-sprints',
    targetId: 'plat-growth-kpis',
    relationLabel: 'ejecuta',
    authorKind: 'hybrid',
    authorName: 'Growth Engineering',
    reviewStatus: 'verified',
    note: 'Conecta cada entregable de ingeniería con su métrica de impacto en usuarios y densidad del grafo.',
    relatedIds: ['plat-backlog-sprints', 'plat-growth-kpis'],
    markdownContent: `# Relación · Backlog Priorizado — \`ejecuta\` → Checklist de Adquisición y Retención

- **Origen:** [[Backlog Técnico Priorizado · Próximos Sprints]]
- **Relación:** \`ejecuta\`
- **Destino:** [[Checklist Técnico de Adquisición y Retención]]

Impide construir funcionalidades desconectadas de la activación, densidad o retención de la plataforma.`,
  },
  {
    id: 'plat-rel-hitl-taxonomy',
    title: 'Flujo HITL — valida → Taxonomía Semántica e Hipergrafo',
    category: '06 · Relaciones Estructurales',
    kind: 'relation',
    type: 'phrase',
    sourceId: 'plat-hitl-protocol',
    targetId: 'plat-taxonomy-strategy',
    relationLabel: 'valida',
    authorKind: 'agent',
    authorName: 'Hermes · Graph Linker',
    reviewStatus: 'verified',
    note: 'Las categorías y enlaces sugeridos por agentes pasan por revisión HITL para mantener limpio el grafo.',
    relatedIds: ['plat-hitl-protocol', 'plat-taxonomy-strategy'],
    markdownContent: `# Relación · Flujo HITL — \`valida\` → Taxonomía Semántica e Hipergrafo

- **Origen:** [[Flujo Human-in-the-Loop (HITL) y Telemetría]]
- **Relación:** \`valida\`
- **Destino:** [[Estrategia de Taxonomía Semántica e Hipergrafo]]

Combina velocidad de clasificación automática con criterio editorial humano.`,
  },
];

export const PLATFORM_ARCH_SVG_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLATFORM_ARCHITECTURE_SVG)}`;

export function buildLocalPlatformSnapshot(normalizeFn, getColorFn) {
  const categoriesMap = {};
  PLATFORM_CATEGORIES.forEach((cat) => {
    const color = getColorFn(cat.colorKey);
    categoriesMap[cat.name] = {
      id: cat.name,
      name: cat.name,
      colorKey: color.key,
      pinned: Boolean(cat.pinned),
      order: cat.order,
      isPublic: true,
      sharedWith: [],
    };
  });

  const items = PLATFORM_ITEMS.map((item, idx) => {
    const catMeta = PLATFORM_CATEGORIES.find((c) => c.name === item.category);
    const color = getColorFn(catMeta?.colorKey || 'cyan');
    const attachment =
      item.attachmentKind === 'arch_svg'
        ? {
            name: 'mapa-arquitectura-v3.svg',
            contentType: 'image/svg+xml',
            size: PLATFORM_ARCHITECTURE_SVG.length,
            url: PLATFORM_ARCH_SVG_DATA_URI,
          }
        : null;

    return normalizeFn({
      ...item,
      name: item.title,
      attachment,
      colorKey: color.key,
      isPublic: true,
      sharedWith: [],
      order: 100000 - idx,
    });
  });

  return { items, categoriesMap };
}
