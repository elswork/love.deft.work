import React, { Suspense, lazy, useState } from 'react';
import MarkdownVaultView from './MarkdownVaultView';
import AttachmentService from '../services/AttachmentService';
import {
  getFileBadge,
  getFileDisplayName,
} from '../services/MarkdownVaultService';
import { AGENT_STATES } from '../services/AgentStreamAdapter';
import {
  IconAgent,
  IconCheck,
  IconClose,
  IconFileKind,
  IconGraph,
  IconHuman,
  IconMarkdown,
  IconPause,
  IconPlay,
  IconRedirect,
  IconShare,
  IconStar,
  IconTerminal,
  IconTrash,
  IconUpload,
} from './VaultIcons';

const ConnectionsGraph = lazy(() => import('./ConnectionsGraph'));

/**
 * Lienzo Central del Command Center:
 * 1) Stream Colaborativo & Cola HITL (streaming CLS = 0, Approve/Reject/Pause/Redirect).
 * 2) Estudio Obsidian (.md editor/preview + multimedia + [[WikiLinks]]).
 * 3) Grafo interactivo (carga diferida con React.lazy).
 */
export default function AgentWorkspaceCanvas({
  viewMode,
  onSetViewMode,
  agents = [],
  activeAgent,
  onSelectAgent,
  onApproveAgent,
  onRejectAgent,
  onTogglePauseAgent,
  onDispatchPrompt,
  categories = [],
  categoriesMap = {},
  allItems = [],
  activeItem,
  vaultAnalytics,
  draftTitle,
  onDraftTitleChange,
  draftMarkdown,
  onEditorChange,
  editorTextareaRef,
  studioSubMode,
  onSetStudioSubMode,
  dirty,
  saving,
  uploadProgress,
  uploadError,
  showWikiSuggest,
  wikiSuggestions = [],
  onInsertWikiSuggestion,
  onSaveDraft,
  onSelectItem,
  onCreateMissingNote,
  onAnalyzeActiveItem,
  onShareItem,
  onTogglePinItem,
  onVerifyPendingItem,
  onDeleteItem,
  onAttachFile,
  canEdit,
}) {
  const [promptInput, setPromptInput] = useState('');
  const [dispatchScope, setDispatchScope] = useState('ACTIVE_ITEM');

  const pendingHitlCount = agents.filter((a) => a.status === 'awaiting_approval').length;
  const activeAgentState = activeAgent
    ? AGENT_STATES[activeAgent.status] || AGENT_STATES.completed
    : AGENT_STATES.completed;

  const activeBadge = activeItem ? getFileBadge(activeItem) : null;

  const handleSubmitPrompt = (e) => {
    e.preventDefault();
    const clean = promptInput.trim();
    if (!clean || !activeAgent) return;
    onDispatchPrompt(activeAgent.id, clean, dispatchScope);
    setPromptInput('');
  };

  const handlePromptKeyDown = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitPrompt(e);
    }
  };

  return (
    <main className="cc-canvas" aria-label="Espacio de trabajo colaborativo">
      {/* Cabecera de pestañas principales + métricas compactas */}
      <div className="cc-canvas-topbar">
        <div className="cc-view-tabs" role="tablist" aria-label="Modos del espacio de trabajo">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'stream'}
            className={`cc-view-tab ${viewMode === 'stream' ? 'is-active' : ''}`}
            onClick={() => onSetViewMode('stream')}
          >
            <IconTerminal size={14} />
            <span>Stream &amp; HITL</span>
            {pendingHitlCount > 0 && (
              <span className="cc-tab-pill">{pendingHitlCount}</span>
            )}
            <kbd className="cc-kbd-hint">1</kbd>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'studio'}
            className={`cc-view-tab ${viewMode === 'studio' ? 'is-active' : ''}`}
            onClick={() => onSetViewMode('studio')}
          >
            <IconMarkdown size={14} />
            <span>Estudio .md &amp; Media</span>
            <kbd className="cc-kbd-hint">2</kbd>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'graph'}
            className={`cc-view-tab ${viewMode === 'graph' ? 'is-active' : ''}`}
            onClick={() => onSetViewMode('graph')}
          >
            <IconGraph size={14} />
            <span>Grafo</span>
            <kbd className="cc-kbd-hint">3</kbd>
          </button>
        </div>

        <div className="cc-kpi-strip">
          <div className="cc-kpi">
            <span className="cc-kpi-label">Archivos</span>
            <span className="cc-kpi-value">{vaultAnalytics.totalFiles}</span>
          </div>
          <div className="cc-kpi">
            <span className="cc-kpi-label">Enlaces</span>
            <span className="cc-kpi-value">{vaultAnalytics.totalLinks}</span>
          </div>
          <div className="cc-kpi">
            <span className="cc-kpi-label">Huérfanos</span>
            <span className="cc-kpi-value">{vaultAnalytics.orphans.length}</span>
          </div>
          <div className="cc-kpi">
            <span className="cc-kpi-label">HITL</span>
            <span className={`cc-kpi-value ${pendingHitlCount > 0 ? 'tone-amber' : ''}`}>
              {pendingHitlCount}
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODO 1: STREAM COLABORATIVO & CONTROL HUMAN-IN-THE-LOOP      */}
      {/* ============================================================ */}
      {viewMode === 'stream' && (
        <div className="cc-stream-shell">
          {/* Selector horizontal rápido de agentes activos */}
          <div className="cc-agent-pills-bar" role="group" aria-label="Seleccionar agente activo">
            {agents.map((ag) => {
              const st = AGENT_STATES[ag.status] || AGENT_STATES.completed;
              const isSelected = ag.id === activeAgent?.id;
              return (
                <button
                  key={ag.id}
                  type="button"
                  className={`cc-agent-chip ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onSelectAgent(ag.id)}
                >
                  <span className={`cc-status-dot tone-${st.tone} ${st.pulse ? 'is-pulsing' : ''}`} />
                  <span className="cc-agent-chip-name">{ag.name}</span>
                  <span className="cc-agent-chip-state">{st.label}</span>
                </button>
              );
            })}
          </div>

          {activeAgent && (
            <>
              {/* Panel de estado vivo + barra HITL */}
              <div className="cc-agent-header-card">
                <div className="cc-agent-header-main">
                  <div className="cc-agent-title-block">
                    <div className="cc-agent-eyebrow">
                      <span className="cc-mono-code">{activeAgent.codename}</span>
                      <span className={`cc-state-badge tone-${activeAgentState.tone}`}>
                        <span className={`cc-status-dot tone-${activeAgentState.tone} ${activeAgentState.pulse ? 'is-pulsing' : ''}`} />
                        {activeAgentState.label}
                      </span>
                      <span className="cc-tool-chip" title="Herramienta actual">
                        fn: {activeAgent.currentTool}
                      </span>
                    </div>
                    <h2 className="cc-agent-title">{activeAgent.name}</h2>
                    <p className="cc-agent-role">{activeAgent.role}</p>
                  </div>

                  {/* Métricas fijas tabular-nums */}
                  <div className="cc-agent-metrics">
                    <div className="cc-metric-box">
                      <span>Tokens</span>
                      <strong>{activeAgent.tokens}</strong>
                    </div>
                    <div className="cc-metric-box">
                      <span>Latencia</span>
                      <strong>{activeAgent.latencyMs} ms</strong>
                    </div>
                    <div className="cc-metric-box">
                      <span>Modelo</span>
                      <strong>{activeAgent.model}</strong>
                    </div>
                  </div>
                </div>

                {/* Barra de progreso de altura fija (CLS = 0) */}
                <div className="cc-progress-track" aria-hidden="true">
                  <div
                    className={`cc-progress-fill tone-${activeAgentState.tone}`}
                    style={{ width: `${activeAgent.progress || 0}%` }}
                  />
                </div>

                {/* Botonera HITL de baja fricción */}
                <div className="cc-hitl-bar">
                  <div className="cc-hitl-actions">
                    {(activeAgent.status === 'awaiting_approval' || activeAgent.proposal) && (
                      <>
                        <button
                          type="button"
                          className="cc-btn cc-btn-approve"
                          onClick={() => onApproveAgent(activeAgent.id)}
                        >
                          <IconCheck size={14} />
                          <span>Aprobar y consolidar</span>
                          <kbd className="cc-kbd">A</kbd>
                        </button>

                        <button
                          type="button"
                          className="cc-btn cc-btn-reject"
                          onClick={() => onRejectAgent(activeAgent.id)}
                        >
                          <IconClose size={14} />
                          <span>Pedir revisión</span>
                          <kbd className="cc-kbd">R</kbd>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="cc-btn cc-btn-secondary"
                      onClick={() => onTogglePauseAgent(activeAgent.id)}
                    >
                      {activeAgent.status === 'paused' ? (
                        <>
                          <IconPlay size={14} />
                          <span>Reanudar</span>
                        </>
                      ) : (
                        <>
                          <IconPause size={14} />
                          <span>Pausar</span>
                        </>
                      )}
                      <kbd className="cc-kbd">P</kbd>
                    </button>

                    {activeItem && (
                      <button
                        type="button"
                        className="cc-btn cc-btn-ghost"
                        onClick={onAnalyzeActiveItem}
                      >
                        <IconAgent size={14} />
                        <span>Analizar "{getFileDisplayName(activeItem)}"</span>
                      </button>
                    )}
                  </div>

                  {activeAgent.targetItemId && (
                    <button
                      type="button"
                      className="cc-target-link"
                      onClick={() => {
                        const target = allItems.find((it) => it.id === activeAgent.targetItemId);
                        if (target) {
                          onSelectItem(target);
                          onSetViewMode('studio');
                        }
                      }}
                    >
                      Nodo objetivo: {activeAgent.targetTitle} →
                    </button>
                  )}
                </div>
              </div>

              {/* Ventana de streaming con altura reservada (cero Cumulative Layout Shift) */}
              <div className="cc-stream-output-frame" aria-live="polite">
                <div className="cc-stream-output-header">
                  <span>OUTPUT STREAM · MARKDOWN EN VIVO</span>
                  <span className="cc-mono-badge">CLS 0.000</span>
                </div>

                <div className="cc-stream-output-scroll">
                  <MarkdownVaultView
                    markdown={activeAgent.streamedMarkdown || '_Esperando directriz humana..._'}
                    allItems={allItems}
                    onOpenItem={(it) => {
                      onSelectItem(it);
                      onSetViewMode('studio');
                    }}
                    onCreateMissingNote={onCreateMissingNote}
                  />

                  {activeAgent.proposal && (
                    <div className="cc-proposal-card">
                      <div className="cc-proposal-head">
                        <span className="cc-proposal-tag">ARTEFACTO PROPUESTO HITL</span>
                        <span className="cc-mono-badge">{activeAgent.proposal.kind}</span>
                      </div>
                      <div className="cc-proposal-title">{activeAgent.proposal.title}</div>
                      <div className="cc-proposal-meta">
                        <span>Categoría: <strong>{activeAgent.proposal.category}</strong></span>
                        {activeAgent.proposal.relationLabel && (
                          <span>Relación: <code>{activeAgent.proposal.relationLabel}</code></span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Barra rápida de redirección / prompt al agente */}
              <form className="cc-dispatch-form" onSubmit={handleSubmitPrompt}>
                <div className="cc-dispatch-controls">
                  <select
                    className="cc-scope-select"
                    value={dispatchScope}
                    onChange={(e) => setDispatchScope(e.target.value)}
                    aria-label="Ámbito de contexto"
                  >
                    <option value="ACTIVE_ITEM">
                      Contexto: {activeItem ? getFileDisplayName(activeItem) : 'Sin archivo activo'}
                    </option>
                    <option value="ALL">Contexto: Toda la bóveda ({allItems.length})</option>
                    {categories.map((cat) => (
                      <option key={cat.name} value={cat.name}>
                        Categoría: {cat.name} ({cat.files.length})
                      </option>
                    ))}
                  </select>

                  <div className="cc-preset-prompts">
                    <button
                      type="button"
                      className="cc-preset-btn"
                      onClick={() =>
                        onDispatchPrompt(
                          activeAgent.id,
                          'Detecta huecos epistémicos y propón 2 enlaces puente entre categorías.',
                          dispatchScope
                        )
                      }
                    >
                      Huecos epistémicos
                    </button>
                    <button
                      type="button"
                      className="cc-preset-btn"
                      onClick={() =>
                        onDispatchPrompt(
                          activeAgent.id,
                          'Sintetiza conclusiones accionables e incorpora referencias [[WikiLink]].',
                          dispatchScope
                        )
                      }
                    >
                      Síntesis ejecutiva
                    </button>
                  </div>
                </div>

                <div className="cc-dispatch-input-row">
                  <input
                    type="text"
                    className="cc-dispatch-input"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    placeholder={`Redirigir a ${activeAgent.name} o pedir análisis en tiempo real...`}
                    aria-label="Instrucción o redirección para el agente"
                  />
                  <button type="submit" className="cc-btn cc-btn-primary">
                    <IconRedirect size={14} />
                    <span>Enviar</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODO 2: ESTUDIO OBSIDIAN (.MD + MULTIMEDIA + WIKILINKS)      */}
      {/* ============================================================ */}
      {viewMode === 'studio' && (
        <div className="cc-studio-shell">
          {!activeItem ? (
            <div className="cc-empty-studio">
              <h3>Selecciona un archivo de la bóveda</h3>
              <p>Elige cualquier archivo `.md`, `.svg`, `.pdf`, `.mp4` o `.url` en la columna izquierda o pulsa Cmd/Ctrl + K.</p>
            </div>
          ) : (
            <>
              {/* Header del archivo activo */}
              <div className="cc-studio-header">
                <div className="cc-studio-title-wrap">
                  <span className={`cc-file-kind-pill kind-${activeBadge.kind}`}>
                    <IconFileKind kind={activeBadge.kind} size={14} />
                    <span>{activeBadge.ext}</span>
                  </span>

                  <input
                    type="text"
                    className="cc-studio-title-input"
                    value={draftTitle}
                    onChange={(e) => onDraftTitleChange(e.target.value)}
                    readOnly={!canEdit}
                    aria-label="Nombre del archivo"
                  />

                  <span className={`cc-author-pill is-${activeItem.authorKind || 'human'}`}>
                    {activeItem.authorKind === 'agent' || activeItem.authorKind === 'hybrid' ? (
                      <IconAgent size={12} />
                    ) : (
                      <IconHuman size={12} />
                    )}
                    <span>
                      {activeItem.authorKind === 'agent'
                        ? 'Agente'
                        : activeItem.authorKind === 'hybrid'
                        ? 'Humano + Agente'
                        : 'Humano'}
                    </span>
                  </span>

                  {activeItem.reviewStatus === 'pending' && canEdit && (
                    <button
                      type="button"
                      className="cc-btn cc-btn-approve cc-btn-sm"
                      onClick={() => onVerifyPendingItem(activeItem.id)}
                    >
                      <IconCheck size={12} /> Validar nodo
                    </button>
                  )}
                </div>

                <div className="cc-studio-actions">
                  <div className="cc-seg-group" role="group" aria-label="Modo de edición">
                    {[
                      { id: 'preview', label: 'Lectura' },
                      { id: 'split', label: 'Split' },
                      { id: 'edit', label: 'Markdown' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`cc-seg-btn ${studioSubMode === m.id ? 'is-active' : ''}`}
                        onClick={() => onSetStudioSubMode(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="cc-btn cc-btn-secondary cc-btn-sm"
                    onClick={onAnalyzeActiveItem}
                  >
                    <IconAgent size={13} /> Analizar
                  </button>

                  <button
                    type="button"
                    className="cc-btn cc-btn-ghost cc-btn-sm"
                    onClick={() => onShareItem(activeItem)}
                    title="Compartir archivo"
                  >
                    <IconShare size={13} />
                  </button>

                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className={`cc-btn cc-btn-ghost cc-btn-sm ${activeItem.pinned ? 'is-pinned' : ''}`}
                        onClick={() => onTogglePinItem(activeItem)}
                        title={activeItem.pinned ? 'Desfijar' : 'Fijar arriba'}
                      >
                        <IconStar size={13} filled={activeItem.pinned} />
                      </button>

                      <button
                        type="button"
                        className="cc-btn cc-btn-ghost cc-btn-sm"
                        onClick={() => onDeleteItem(activeItem)}
                        title="Eliminar archivo"
                      >
                        <IconTrash size={13} />
                      </button>

                      <button
                        type="button"
                        className={`cc-btn cc-btn-sm ${dirty ? 'cc-btn-primary' : 'cc-btn-secondary'}`}
                        onClick={onSaveDraft}
                        disabled={saving}
                      >
                        {saving ? 'Guardando...' : dirty ? 'Guardar cambios' : 'Sincronizado'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Bloque multimedia / URL / adjunto */}
              {(activeItem.attachment?.url || activeItem.url || canEdit) && (
                <div className="cc-media-strip">
                  {activeItem.url && (
                    <a
                      href={activeItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cc-url-pill"
                    >
                      ↗ {activeItem.domain || activeItem.url}
                    </a>
                  )}

                  {activeItem.attachment?.url && (
                    <div className="cc-attachment-inline">
                      {AttachmentService.isImageAttachment(activeItem.attachment) ? (
                        <img
                          src={activeItem.attachment.url}
                          alt={activeItem.attachment.name}
                          className="cc-attachment-thumb"
                        />
                      ) : activeItem.attachment.contentType?.startsWith('video/') ? (
                        <video
                          src={activeItem.attachment.url}
                          controls
                          preload="metadata"
                          className="cc-attachment-video"
                        />
                      ) : (
                        <a
                          href={activeItem.attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cc-attachment-file-link"
                        >
                          {AttachmentService.getAttachmentIcon(
                            activeItem.attachment.contentType,
                            activeItem.attachment.name
                          )}{' '}
                          {activeItem.attachment.name} (
                          {AttachmentService.formatFileSize(activeItem.attachment.size)})
                        </a>
                      )}
                    </div>
                  )}

                  {canEdit && (
                    <label className="cc-attach-upload-btn">
                      <IconUpload size={13} />
                      <span>
                        {uploadProgress !== null
                          ? `Subiendo ${uploadProgress}%`
                          : activeItem.attachment
                          ? 'Reemplazar adjunto'
                          : 'Adjuntar media/PDF'}
                      </span>
                      <input
                        type="file"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) onAttachFile(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}

                  {uploadError && <span className="cc-error-text">{uploadError}</span>}
                </div>
              )}

              {/* Área Editor / Vista Obsidian */}
              <div className={`cc-editor-grid mode-${studioSubMode}`}>
                {(studioSubMode === 'edit' || studioSubMode === 'split') && (
                  <div className="cc-editor-pane">
                    <textarea
                      ref={editorTextareaRef}
                      className="cc-markdown-textarea"
                      value={draftMarkdown}
                      onChange={(e) => onEditorChange(e.target.value)}
                      readOnly={!canEdit}
                      placeholder="Escribe Markdown aquí... Usa [[Nombre del archivo]] o ![[media]] para enlazar."
                      aria-label="Editor Markdown"
                    />

                    {showWikiSuggest && wikiSuggestions.length > 0 && (
                      <div className="cc-wikilink-popover" role="listbox" aria-label="Sugerencias WikiLink">
                        <div className="cc-wikilink-head">Enlazar nodo de bóveda</div>
                        {wikiSuggestions.map((cand) => (
                          <button
                            key={cand.id}
                            type="button"
                            className="cc-wikilink-option"
                            onClick={() => onInsertWikiSuggestion(cand)}
                          >
                            <IconFileKind kind={getFileBadge(cand).kind} size={13} />
                            <span>{getFileDisplayName(cand)}</span>
                            <small>{cand.category}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(studioSubMode === 'preview' || studioSubMode === 'split') && (
                  <div className="cc-preview-pane">
                    <MarkdownVaultView
                      markdown={draftMarkdown}
                      allItems={allItems}
                      onOpenItem={(it) => onSelectItem(it)}
                      onCreateMissingNote={onCreateMissingNote}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODO 3: GRAFO INTERACTIVO (LAZY LOADED)                      */}
      {/* ============================================================ */}
      {viewMode === 'graph' && (
        <div className="cc-graph-shell">
          <Suspense
            fallback={
              <div className="cc-graph-loading">
                <span>Cargando motor gráfico SVG...</span>
              </div>
            }
          >
            <ConnectionsGraph
              items={allItems}
              categoriesMap={categoriesMap}
              activeItemId={activeItem?.id}
              onSelectItem={(it) => {
                onSelectItem(it);
                onSetViewMode('studio');
              }}
            />
          </Suspense>
        </div>
      )}
    </main>
  );
}
