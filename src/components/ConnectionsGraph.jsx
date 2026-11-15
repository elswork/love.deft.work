import React, { useMemo, useState } from 'react';
import { getColorConfig } from '../data/keep_palette';
import {
  extractWikiLinks,
  resolveWikiTarget,
  getFileDisplayName,
} from '../services/MarkdownVaultService';

/**
 * Mapa visual interactivo (SVG) estilo estudio de conocimiento:
 * muestra archivos (.md, multimedia, enlaces), Relaciones-Elemento reificadas
 * y nodos generados/analizados por Agentes IA.
 */
export default function ConnectionsGraph({
  items,
  categoriesMap,
  activeItemId,
  onSelectItem,
}) {
  const [hoveredId, setHoveredId] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'relations' | 'agent'

  const graph = useMemo(() => {
    const filteredBase = items.filter((it) => {
      if (filterMode === 'relations') {
        return it.kind === 'relation' || (it.relatedIds?.length || 0) > 0;
      }
      if (filterMode === 'agent') {
        return it.authorKind === 'agent' || it.authorKind === 'hybrid';
      }
      return true;
    });

    const subset = filteredBase.slice(0, 30);
    const width = 980;
    const height = 520;
    const cx = width / 2;
    const cy = height / 2;
    const rx = 360;
    const ry = 195;

    const nodes = subset.map((it, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(1, subset.length) - Math.PI / 2;
      const isRel = it.kind === 'relation';
      const radiusFactor = isRel ? 0.56 : idx % 2 === 0 ? 1 : 0.78;
      const color = getColorConfig(
        categoriesMap[it.category]?.colorKey || it.colorKey || it.category
      );
      return {
        ...it,
        x: cx + rx * radiusFactor * Math.cos(angle),
        y: cy + ry * radiusFactor * Math.sin(angle),
        accent: isRel ? '#8b5cf6' : color.accent,
      };
    });

    const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const edges = [];
    const seenPairs = new Set();

    nodes.forEach((n) => {
      const mdLinks = extractWikiLinks(n.markdownContent || '');
      const resolvedWikiIds = mdLinks
        .map((lnk) => resolveWikiTarget(lnk.target, items)?.id)
        .filter(Boolean);
      const targets = new Set([
        ...(n.relatedIds || []),
        ...resolvedWikiIds,
        ...(n.sourceId ? [n.sourceId] : []),
        ...(n.targetId ? [n.targetId] : []),
      ]);

      targets.forEach((targetId) => {
        const target = nodeById[targetId];
        if (!target || target.id === n.id) return;
        const pairKey = [n.id, target.id].sort().join('::');
        if (seenPairs.has(pairKey)) return;
        seenPairs.add(pairKey);

        // Punto de control suave hacia el centro para curvas Bézier elegantes
        const mx = (n.x + target.x) / 2;
        const my = (n.y + target.y) / 2;
        const qx = mx * 0.85 + cx * 0.15;
        const qy = my * 0.85 + cy * 0.15;

        edges.push({
          id: pairKey,
          source: n,
          target,
          path: `M ${n.x} ${n.y} Q ${qx} ${qy} ${target.x} ${target.y}`,
          isRelationEdge: n.kind === 'relation' || target.kind === 'relation',
          crossCategory: n.category !== target.category,
        });
      });
    });

    return { nodes, edges, width, height };
  }, [items, categoriesMap, filterMode]);

  const neighborIds = useMemo(() => {
    const focus = hoveredId || activeItemId;
    if (!focus) return null;
    const set = new Set([focus]);
    graph.edges.forEach((e) => {
      if (e.source.id === focus) set.add(e.target.id);
      if (e.target.id === focus) set.add(e.source.id);
    });
    return set;
  }, [hoveredId, activeItemId, graph.edges]);

  if (graph.nodes.length === 0) {
    return (
      <div className="vault-empty-card">
        <p>No hay nodos que coincidan con este filtro en el grafo.</p>
      </div>
    );
  }

  return (
    <div className="studio-graph-card">
      <div className="studio-graph-toolbar">
        <div className="studio-segmented" role="group" aria-label="Filtrar nodos del grafo">
          {[
            { id: 'all', label: 'Todos los archivos' },
            { id: 'relations', label: 'Con relaciones' },
            { id: 'agent', label: 'Asistidos por Agente' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              className={`studio-seg-btn ${filterMode === m.id ? 'active' : ''}`}
              onClick={() => setFilterMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="studio-graph-legend">
          <span><i className="legend-dot is-file" /> Archivo</span>
          <span><i className="legend-dot is-rel" /> Relación-Elemento</span>
          <span><i className="legend-dot is-agent" /> Agente IA</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        className="studio-graph-svg"
        role="img"
        aria-label="Grafo interactivo de archivos y relaciones"
      >
        <defs>
          <pattern id="studio-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="currentColor" opacity="0.12" />
          </pattern>
        </defs>

        <rect width={graph.width} height={graph.height} fill="url(#studio-grid)" rx="12" />

        {graph.edges.map((edge) => {
          const highlighted =
            !neighborIds ||
            (neighborIds.has(edge.source.id) && neighborIds.has(edge.target.id));
          return (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke={
                edge.isRelationEdge
                  ? '#8b5cf6'
                  : edge.crossCategory
                  ? '#06b6d4'
                  : 'currentColor'
              }
              strokeWidth={highlighted ? 2 : 1}
              strokeDasharray={edge.isRelationEdge ? '5 4' : undefined}
              opacity={highlighted ? 0.65 : 0.12}
            />
          );
        })}

        {graph.nodes.map((node) => {
          const isActive = node.id === activeItemId || node.id === hoveredId;
          const isDimmed = neighborIds && !neighborIds.has(node.id);
          const isAgent = node.authorKind === 'agent' || node.authorKind === 'hybrid';
          const isRel = node.kind === 'relation';

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="studio-graph-node"
              opacity={isDimmed ? 0.25 : 1}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId('')}
              onClick={() => onSelectItem && onSelectItem(node)}
              style={{ cursor: 'pointer' }}
            >
              {isAgent && (
                <circle
                  r={isActive ? 22 : 17}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}

              {isRel ? (
                <rect
                  x={-11}
                  y={-11}
                  width={22}
                  height={22}
                  rx={6}
                  transform="rotate(45)"
                  fill={node.accent}
                  stroke="#ffffff"
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
              ) : (
                <circle
                  r={isActive ? 14 : 10}
                  fill={node.accent}
                  stroke="#ffffff"
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
              )}

              <text
                y={isRel ? 26 : 24}
                textAnchor="middle"
                className="studio-graph-label"
              >
                {getFileDisplayName(node).slice(0, 24)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
