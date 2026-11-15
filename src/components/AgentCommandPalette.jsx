import React, { useEffect, useMemo, useRef, useState } from 'react';
import LightDismissDialog from './LightDismissDialog';
import {
  getFileBadge,
  getFileDisplayName,
} from '../services/MarkdownVaultService';
import { AGENT_STATES } from '../services/AgentStreamAdapter';
import {
  IconAgent,
  IconCheck,
  IconCommand,
  IconFileKind,
  IconGraph,
  IconPause,
  IconSearch,
} from './VaultIcons';

/**
 * Paleta de comandos Cmd/Ctrl + K construida sobre <dialog closedby="any">
 * con manejo de teclado IME-safe.
 */
export default function AgentCommandPalette({
  open,
  onClose,
  items = [],
  agents = [],
  activeAgent,
  activeItem,
  onSelectItem,
  onSelectAgent,
  onSwitchView,
  onApproveAgent,
  onRejectAgent,
  onTogglePauseAgent,
  onAnalyzeActiveItem,
  onCreateNewNote,
  onToggleTheme,
  onResetToPlatformVault,
  canEdit,
}) {
  const [queryText, setQueryText] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleClose = () => {
    setQueryText('');
    setSelectedIndex(0);
    onClose();
  };

  const actions = useMemo(() => {
    const list = [];

    if (activeAgent?.status === 'awaiting_approval') {
      list.push({
        id: 'cmd-approve',
        group: 'Human-in-the-Loop',
        label: `Aprobar y consolidar propuesta de ${activeAgent.name}`,
        shortcut: 'A',
        kind: 'hitl',
        run: () => onApproveAgent?.(activeAgent.id),
      });
      list.push({
        id: 'cmd-reject',
        group: 'Human-in-the-Loop',
        label: `Solicitar revisión a ${activeAgent.name}`,
        shortcut: 'R',
        kind: 'hitl',
        run: () => onRejectAgent?.(activeAgent.id),
      });
    }

    if (activeAgent) {
      list.push({
        id: 'cmd-pause',
        group: 'Human-in-the-Loop',
        label:
          activeAgent.status === 'paused'
            ? `Reanudar ejecución de ${activeAgent.name}`
            : `Pausar agente ${activeAgent.name}`,
        shortcut: 'P',
        kind: 'pause',
        run: () => onTogglePauseAgent?.(activeAgent.id),
      });
    }

    if (activeItem) {
      list.push({
        id: 'cmd-analyze',
        group: 'Acciones rápidas',
        label: `Analizar "${getFileDisplayName(activeItem)}" con Athena`,
        shortcut: 'G A',
        kind: 'agent',
        run: () => onAnalyzeActiveItem?.(),
      });
    }

    list.push(
      {
        id: 'cmd-new-md',
        group: 'Acciones rápidas',
        label: 'Crear nueva nota Markdown (.md)',
        shortcut: 'N',
        kind: 'action',
        run: () => onCreateNewNote?.(),
      },
      {
        id: 'cmd-view-stream',
        group: 'Navegación',
        label: 'Ir a Centro de Mando (Stream & HITL)',
        shortcut: '1',
        kind: 'view',
        run: () => onSwitchView?.('stream'),
      },
      {
        id: 'cmd-view-studio',
        group: 'Navegación',
        label: 'Ir a Estudio Obsidian (.md y multimedia)',
        shortcut: '2',
        kind: 'view',
        run: () => onSwitchView?.('studio'),
      },
      {
        id: 'cmd-view-graph',
        group: 'Navegación',
        label: 'Ir a Grafo interactivo de conocimiento',
        shortcut: '3',
        kind: 'graph',
        run: () => onSwitchView?.('graph'),
      },
      {
        id: 'cmd-theme',
        group: 'Preferencias',
        label: 'Alternar tema Oscuro / Claro',
        shortcut: 'T',
        kind: 'action',
        run: () => onToggleTheme?.(),
      },
      ...(canEdit && onResetToPlatformVault
        ? [
            {
              id: 'cmd-reset-platform',
              group: 'Administración Plataforma',
              label: 'Purgar pruebas y cargar Bóveda Operativa real (18 nodos)',
              shortcut: 'INIT',
              kind: 'action',
              run: () => onResetToPlatformVault(),
            },
          ]
        : [])
    );

    agents.forEach((ag) => {
      const stateMeta = AGENT_STATES[ag.status] || AGENT_STATES.completed;
      list.push({
        id: `agent-${ag.id}`,
        group: 'Agentes',
        label: `${ag.name} · ${stateMeta.label}`,
        shortcut: ag.codename,
        kind: 'agent',
        run: () => {
          onSelectAgent?.(ag.id);
          onSwitchView?.('stream');
        },
      });
    });

    items.slice(0, 60).forEach((it) => {
      const badge = getFileBadge(it);
      list.push({
        id: `file-${it.id}`,
        group: `Bóveda · ${it.category}`,
        label: getFileDisplayName(it),
        sublabel: it.note || '',
        shortcut: badge.ext,
        kind: 'file',
        fileKind: badge.kind,
        run: () => {
          onSelectItem?.(it);
          onSwitchView?.('studio');
        },
      });
    });

    const q = queryText.trim().toLowerCase();
    if (!q) return list.slice(0, 14);
    return list
      .filter(
        (entry) =>
          entry.label.toLowerCase().includes(q) ||
          entry.group.toLowerCase().includes(q) ||
          (entry.sublabel || '').toLowerCase().includes(q)
      )
      .slice(0, 16);
  }, [
    agents,
    activeAgent,
    activeItem,
    items,
    queryText,
    onApproveAgent,
    onRejectAgent,
    onTogglePauseAgent,
    onAnalyzeActiveItem,
    onCreateNewNote,
    onSwitchView,
    onToggleTheme,
    onResetToPlatformVault,
    canEdit,
    onSelectAgent,
    onSelectItem,
  ]);

  const safeIndex = Math.min(selectedIndex, Math.max(0, actions.length - 1));

  const executeSelected = (entry) => {
    if (!entry) return;
    entry.run();
    handleClose();
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    executeSelected(actions[safeIndex]);
  };

  const handleKeyDown = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (actions.length ? (prev + 1) % actions.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        actions.length ? (prev - 1 + actions.length) % actions.length : 0
      );
    }
  };

  return (
    <LightDismissDialog
      open={open}
      onClose={handleClose}
      title="Paleta de Comandos"
      subtitle="Salta a cualquier archivo, controla agentes o ejecuta acciones HITL"
      maxWidth="620px"
    >
      <form className="cc-cmd-form" onSubmit={handleFormSubmit}>
        <div className="cc-cmd-search-bar">
          <IconSearch size={15} />
          <input
            ref={inputRef}
            type="text"
            className="cc-cmd-input"
            value={queryText}
            onChange={(e) => {
              setQueryText(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar archivos .md, PDFs, agentes o comandos..."
            aria-label="Buscar en paleta de comandos"
          />
          <button type="submit" className="cc-cmd-submit-btn">
            Ejecutar ↵
          </button>
        </div>

        <ul className="cc-cmd-results" role="listbox" aria-label="Comandos disponibles">
          {actions.length === 0 ? (
            <li className="cc-cmd-empty">No hay coincidencias para "{queryText}".</li>
          ) : (
            actions.map((entry, idx) => {
              const isSelected = idx === safeIndex;
              return (
                <li key={entry.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    className={`cc-cmd-option ${isSelected ? 'is-selected' : ''}`}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => executeSelected(entry)}
                  >
                    <span className="cc-cmd-option-icon">
                      {entry.kind === 'hitl' ? (
                        <IconCheck size={14} />
                      ) : entry.kind === 'pause' ? (
                        <IconPause size={14} />
                      ) : entry.kind === 'agent' ? (
                        <IconAgent size={14} />
                      ) : entry.kind === 'graph' ? (
                        <IconGraph size={14} />
                      ) : entry.kind === 'file' ? (
                        <IconFileKind kind={entry.fileKind} size={14} />
                      ) : (
                        <IconCommand size={14} />
                      )}
                    </span>
                    <span className="cc-cmd-option-main">
                      <span className="cc-cmd-option-label">{entry.label}</span>
                      <span className="cc-cmd-option-group">{entry.group}</span>
                    </span>
                    {entry.shortcut && <kbd className="cc-kbd">{entry.shortcut}</kbd>}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="cc-cmd-footer">
          <span><kbd className="cc-kbd">↑↓</kbd> Navegar</span>
          <span><kbd className="cc-kbd">↵</kbd> Ejecutar</span>
          <span><kbd className="cc-kbd">Esc</kbd> Cerrar</span>
        </div>
      </form>
    </LightDismissDialog>
  );
}
