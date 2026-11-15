import React, { useState } from 'react';
import {
  getFileBadge,
  getFileDisplayName,
} from '../services/MarkdownVaultService';
import { AGENT_STATES } from '../services/AgentStreamAdapter';
import {
  IconFileKind,
  IconPlus,
  IconRelation,
  IconTerminal,
} from './VaultIcons';

/**
 * Inspector derecho de precisión:
 * 1) Telemetría, trace de llamadas a herramientas y consola de logs monoespaciada.
 * 2) Conexiones Obsidian (Salientes, Backlinks y creador de Relación-Elemento .md).
 */
export default function TelemetryInspector({
  open,
  onClose,
  activeAgent,
  logs = [],
  transportMode,
  transportEndpoint,
  onChangeTransport,
  activeItem,
  allItems = [],
  activeConnections = { outgoing: [], backlinks: [], relations: [] },
  onSelectFile,
  onCreateRelation,
  canEdit,
}) {
  const [tab, setTab] = useState('telemetry'); // 'telemetry' | 'connections'
  const [relTargetId, setRelTargetId] = useState('');
  const [relLabel, setRelLabel] = useState('complementa');

  const agentMeta = activeAgent
    ? AGENT_STATES[activeAgent.status] || AGENT_STATES.completed
    : null;

  const handleSubmitRelation = (e) => {
    e.preventDefault();
    if (!activeItem || !relTargetId) return;
    onCreateRelation(activeItem, relTargetId, relLabel);
    setRelTargetId('');
  };

  return (
    <>
      {open && <div className="cc-mobile-backdrop" onClick={onClose} aria-hidden="true" />}

      <aside className={`cc-inspector ${open ? 'is-open' : ''}`} aria-label="Inspector de telemetría y conexiones">
        <div className="cc-inspector-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'telemetry'}
            className={`cc-inspector-tab ${tab === 'telemetry' ? 'is-active' : ''}`}
            onClick={() => setTab('telemetry')}
          >
            <IconTerminal size={13} />
            <span>Logs &amp; Trace</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'connections'}
            className={`cc-inspector-tab ${tab === 'connections' ? 'is-active' : ''}`}
            onClick={() => setTab('connections')}
          >
            <IconRelation size={13} />
            <span>Conexiones</span>
            <span className="cc-mono-badge">
              {activeConnections.outgoing.length + activeConnections.backlinks.length}
            </span>
          </button>
        </div>

        {/* Pestaña 1: Telemetría, Tool Calls y Logs streaming */}
        {tab === 'telemetry' && (
          <div className="cc-inspector-body">
            {activeAgent && agentMeta && (
              <div className="cc-inspector-card">
                <div className="cc-section-header">
                  <span className="cc-section-title">Tool Calls · {activeAgent.codename}</span>
                  <span className={`cc-tone-text tone-${agentMeta.tone}`}>{agentMeta.label}</span>
                </div>

                <ul className="cc-toolcall-list">
                  {(activeAgent.toolCalls || []).map((tc) => (
                    <li key={tc.id} className="cc-toolcall-row">
                      <div className="cc-toolcall-top">
                        <span className={`cc-tc-status is-${tc.status}`}>{tc.status}</span>
                        <span className="cc-tc-name">{tc.tool}</span>
                        <span className="cc-tc-ms">{tc.durationMs}ms</span>
                      </div>
                      <code className="cc-tc-args">{tc.args}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="cc-inspector-card">
              <div className="cc-section-header">
                <span className="cc-section-title">Transporte en Tiempo Real</span>
                <span className="cc-mono-badge">{transportMode}</span>
              </div>
              <div className="cc-transport-controls">
                <select
                  className="cc-scope-select"
                  value={transportMode}
                  onChange={(e) => onChangeTransport(e.target.value, transportEndpoint)}
                  aria-label="Modo de transporte de agentes"
                >
                  <option value="simulator">Stream Integrado (Gemini + Local)</option>
                  <option value="sse">SSE · EventSource</option>
                  <option value="ws">WebSocket · Bidireccional</option>
                </select>

                {transportMode !== 'simulator' && (
                  <input
                    type="url"
                    className="cc-mono-input"
                    value={transportEndpoint}
                    onChange={(e) => onChangeTransport(transportMode, e.target.value)}
                    placeholder={
                      transportMode === 'sse'
                        ? 'https://api.deft.work/agents/stream'
                        : 'wss://api.deft.work/agents/ws'
                    }
                    aria-label="URL del endpoint de streaming"
                  />
                )}
              </div>
            </div>

            <div className="cc-inspector-logs">
              <div className="cc-section-header">
                <span className="cc-section-title">Stream Event Log</span>
                <span className="cc-mono-badge">{logs.length}</span>
              </div>

              <div className="cc-log-scroll">
                {logs.map((entry) => (
                  <div key={entry.id} className={`cc-log-entry level-${entry.level}`}>
                    <div className="cc-log-meta">
                      <span className="cc-log-ts">{entry.ts}</span>
                      <span className="cc-log-src">{entry.source}</span>
                      <span className="cc-log-lvl">{entry.level}</span>
                    </div>
                    <div className="cc-log-msg">{entry.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pestaña 2: Conexiones Obsidian y Relación-Elemento reificada */}
        {tab === 'connections' && (
          <div className="cc-inspector-body">
            {!activeItem ? (
              <div className="cc-inspector-empty">
                Selecciona un archivo para inspeccionar sus enlaces y backlinks.
              </div>
            ) : (
              <>
                {canEdit && (
                  <form className="cc-inspector-card" onSubmit={handleSubmitRelation}>
                    <div className="cc-section-header">
                      <span className="cc-section-title">Nueva Relación-Elemento (.md)</span>
                    </div>

                    <div className="cc-rel-form">
                      <select
                        className="cc-scope-select"
                        value={relTargetId}
                        onChange={(e) => setRelTargetId(e.target.value)}
                        aria-label="Archivo destino de la relación"
                      >
                        <option value="">Conectar con archivo...</option>
                        {allItems
                          .filter((it) => it.id !== activeItem.id)
                          .map((cand) => (
                            <option key={cand.id} value={cand.id}>
                              {getFileDisplayName(cand)} [{cand.category}]
                            </option>
                          ))}
                      </select>

                      <div className="cc-rel-verb-row">
                        <input
                          type="text"
                          className="cc-mono-input"
                          value={relLabel}
                          onChange={(e) => setRelLabel(e.target.value)}
                          placeholder="verbo (demuestra, implementa...)"
                          aria-label="Etiqueta de relación"
                        />
                        <button
                          type="submit"
                          className="cc-btn cc-btn-primary cc-btn-sm"
                          disabled={!relTargetId}
                        >
                          <IconPlus size={13} /> Crear
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="cc-inspector-card">
                  <div className="cc-section-header">
                    <span className="cc-section-title">Salientes (WikiLinks)</span>
                    <span className="cc-mono-badge">{activeConnections.outgoing.length}</span>
                  </div>

                  {activeConnections.outgoing.length === 0 ? (
                    <p className="cc-muted-note">Sin enlaces salientes aún.</p>
                  ) : (
                    <ul className="cc-conn-list">
                      {activeConnections.outgoing.map(({ item, via }) => (
                        <li key={`out-${item.id}`}>
                          <button
                            type="button"
                            className="cc-conn-btn"
                            onClick={() => onSelectFile(item)}
                          >
                            <IconFileKind kind={getFileBadge(item).kind} size={13} />
                            <span className="cc-conn-title">{getFileDisplayName(item)}</span>
                            <span className="cc-mono-tag">{via}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="cc-inspector-card">
                  <div className="cc-section-header">
                    <span className="cc-section-title">Backlinks (Mencionado en)</span>
                    <span className="cc-mono-badge">{activeConnections.backlinks.length}</span>
                  </div>

                  {activeConnections.backlinks.length === 0 ? (
                    <p className="cc-muted-note">Ningún archivo apunta aquí todavía.</p>
                  ) : (
                    <ul className="cc-conn-list">
                      {activeConnections.backlinks.map(({ item, snippet, isRelationNode }) => (
                        <li key={`back-${item.id}`}>
                          <button
                            type="button"
                            className="cc-conn-btn is-stacked"
                            onClick={() => onSelectFile(item)}
                          >
                            <div className="cc-conn-top">
                              <IconFileKind kind={getFileBadge(item).kind} size={13} />
                              <span className="cc-conn-title">{getFileDisplayName(item)}</span>
                              {isRelationNode && <span className="cc-mono-tag">rel</span>}
                            </div>
                            {snippet && <span className="cc-conn-snippet">{snippet}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
