import React from 'react';
import {
  getFileBadge,
  getFileDisplayName,
} from '../services/MarkdownVaultService';
import { AGENT_STATES } from '../services/AgentStreamAdapter';
import {
  IconAgent,
  IconFileKind,
  IconFolder,
  IconPause,
  IconPlay,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
} from './VaultIcons';

const FILTER_OPTIONS = [
  { id: 'all', label: 'Todos' },
  { id: 'md', label: '.md' },
  { id: 'media', label: 'Media' },
  { id: 'relations', label: 'Relaciones' },
  { id: 'agent', label: 'Agentes' },
];

/**
 * Panel izquierdo dual de alta densidad:
 * 1) Estado vivo de agentes colaboradores + control rápido Pausa/Reanudar.
 * 2) Categorías estilo Obsidian con listas unificadas de archivos (.md, media, .url, relaciones).
 */
export default function SidebarExplorer({
  open,
  onClose,
  agents = [],
  activeAgentId,
  onSelectAgent,
  onTogglePauseAgent,
  categories = [],
  expandedCats = {},
  onToggleCategory,
  activeItemId,
  onSelectFile,
  searchQuery,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  onCreateNewMarkdown,
  onUploadFileTrigger,
  onDropFileOnCategory,
  dragTargetCategory,
  onSetDragTargetCategory,
  onCreateCategory,
  onRequestDeleteCategory,
  canEdit,
}) {
  return (
    <>
      {open && <div className="cc-mobile-backdrop" onClick={onClose} aria-hidden="true" />}

      <aside className={`cc-sidebar ${open ? 'is-open' : ''}`} aria-label="Explorador de Agentes y Bóveda">
        {/* Bloque 1: Monitor de Agentes en vivo */}
        <section className="cc-sidebar-section">
          <div className="cc-section-header">
            <span className="cc-section-title">
              <IconAgent size={13} /> Agentes en vivo
            </span>
            <span className="cc-mono-badge">
              {agents.filter((a) => a.status === 'awaiting_approval').length} HITL
            </span>
          </div>

          <div className="cc-agent-list">
            {agents.map((ag) => {
              const meta = AGENT_STATES[ag.status] || AGENT_STATES.completed;
              const isSelected = ag.id === activeAgentId;
              const isPaused = ag.status === 'paused';

              return (
                <div
                  key={ag.id}
                  className={`cc-agent-row ${isSelected ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="cc-agent-select"
                    onClick={() => {
                      onSelectAgent(ag.id);
                      onClose?.();
                    }}
                  >
                    <span className={`cc-status-dot tone-${meta.tone} ${meta.pulse ? 'is-pulsing' : ''}`} />
                    <span className="cc-agent-meta">
                      <span className="cc-agent-name-row">
                        <span className="cc-agent-name">{ag.name}</span>
                        <span className="cc-agent-code">{ag.codename}</span>
                      </span>
                      <span className="cc-agent-sub">
                        <span className={`cc-tone-text tone-${meta.tone}`}>{meta.label}</span>
                        <span>· {ag.tokens} tok</span>
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="cc-mini-icon-btn"
                    onClick={() => onTogglePauseAgent(ag.id)}
                    title={isPaused ? `Reanudar ${ag.name}` : `Pausar ${ag.name}`}
                    aria-label={isPaused ? `Reanudar ${ag.name}` : `Pausar ${ag.name}`}
                  >
                    {isPaused ? <IconPlay size={12} /> : <IconPause size={12} />}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bloque 2: Búsqueda local + acciones de bóveda */}
        <section className="cc-sidebar-controls">
          <div className="cc-sidebar-search">
            <IconSearch size={13} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filtrar archivos..."
              aria-label="Filtrar archivos de la bóveda"
            />
          </div>

          <div className="cc-quick-create-row">
            <button
              type="button"
              className="cc-btn cc-btn-primary cc-btn-sm"
              onClick={onCreateNewMarkdown}
            >
              <IconPlus size={13} /> Nueva .md
            </button>
            <button
              type="button"
              className="cc-btn cc-btn-secondary cc-btn-sm"
              onClick={onUploadFileTrigger}
            >
              <IconUpload size={13} /> Adjuntar
            </button>
          </div>

          <div className="cc-filter-strip" role="group" aria-label="Filtrar por tipo de elemento">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`cc-filter-chip ${filterType === opt.id ? 'is-active' : ''}`}
                onClick={() => onFilterTypeChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Bloque 3: Categorías estilo Obsidian con todos los tipos de archivo */}
        <section className="cc-vault-tree" aria-label="Listas de categorías">
          <div className="cc-section-header">
            <span className="cc-section-title">Bóveda Obsidian</span>
            <div className="cc-section-actions">
              <span className="cc-mono-badge">{categories.length} cat</span>
              {canEdit && (
                <button
                  type="button"
                  className="cc-mini-icon-btn"
                  onClick={onCreateCategory}
                  title="Nueva categoría"
                  aria-label="Nueva categoría"
                >
                  <IconPlus size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="cc-cat-scroll">
            {categories.map((cat) => {
              const isOpen = expandedCats[cat.name] !== false;
              const isDragOver = dragTargetCategory === cat.name;

              return (
                <div
                  key={cat.name}
                  className={`cc-cat-group ${isDragOver ? 'is-dragover' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onSetDragTargetCategory?.(cat.name);
                  }}
                  onDragLeave={() => onSetDragTargetCategory?.('')}
                  onDrop={(e) => {
                    e.preventDefault();
                    onSetDragTargetCategory?.('');
                    const droppedFile = e.dataTransfer?.files?.[0];
                    if (droppedFile) {
                      onDropFileOnCategory?.(droppedFile, cat.name);
                    }
                  }}
                >
                  <div className="cc-cat-header-row">
                    <button
                      type="button"
                      className="cc-cat-trigger"
                      onClick={() => onToggleCategory(cat.name)}
                      aria-expanded={isOpen}
                    >
                      <span className="cc-cat-caret">{isOpen ? '▾' : '▸'}</span>
                      <span
                        className="cc-cat-swatch"
                        style={{ backgroundColor: cat.accent }}
                        aria-hidden="true"
                      />
                      <IconFolder size={13} />
                      <span className="cc-cat-name">{cat.name}</span>
                      <span className="cc-mono-count">{cat.files.length}</span>
                    </button>

                    {canEdit && (
                      <button
                        type="button"
                        className="cc-cat-del-btn"
                        onClick={() => onRequestDeleteCategory?.(cat)}
                        title={`Eliminar categoría ${cat.name}`}
                        aria-label={`Eliminar categoría ${cat.name}`}
                      >
                        <IconTrash size={12} />
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <ul className="cc-file-list">
                      {cat.files.map(({ item, isCrossRef }) => {
                        const badge = getFileBadge(item);
                        const isActive = item.id === activeItemId;
                        const isPending = item.reviewStatus === 'pending';

                        return (
                          <li key={`${cat.name}-${item.id}`}>
                            <button
                              type="button"
                              className={`cc-file-row ${isActive ? 'is-active' : ''}`}
                              onClick={() => {
                                onSelectFile(item);
                                onClose?.();
                              }}
                              title={getFileDisplayName(item)}
                            >
                              <span className={`cc-file-kind kind-${badge.kind}`}>
                                <IconFileKind kind={badge.kind} size={13} />
                              </span>
                              <span className="cc-file-name">
                                {getFileDisplayName(item)}
                              </span>
                              {isPending && (
                                <span className="cc-dot-pending" title="Pendiente de validación HITL" />
                              )}
                              {isCrossRef && (
                                <span className="cc-mono-tag" title="Referencia cruzada">
                                  ref
                                </span>
                              )}
                              <span className="cc-file-ext">{badge.ext}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </aside>
    </>
  );
}
