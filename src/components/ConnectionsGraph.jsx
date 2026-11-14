import React, { useMemo } from 'react';
import { getColorConfig, getCategoryIcon } from '../data/keep_palette';
import { extractWikiLinks, resolveWikiTarget } from '../services/MarkdownVaultService';

/**
 * Mapa visual interactivo (SVG) estilo Obsidian.md de conexiones entre archivos
 * ([[WikiLinks]], relaciones reificadas y referencias cruzadas entre categorías).
 */
export default function ConnectionsGraph({
  items,
  categoriesMap,
  activeItemId,
  onSelectItem,
  onSelectCategory,
}) {
  const graph = useMemo(() => {
    const referencedSet = new Set();
    const linkPairs = [];

    items.forEach((it) => {
      const mdLinks = extractWikiLinks(it.markdownContent || '');
      const resolvedWikiIds = mdLinks
        .map((lnk) => resolveWikiTarget(lnk.target, items)?.id)
        .filter(Boolean);
      const targets = new Set([
        ...(it.relatedIds || []),
        ...resolvedWikiIds,
        ...(it.sourceId ? [it.sourceId] : []),
        ...(it.targetId ? [it.targetId] : []),
      ]);

      if (targets.size > 0 || it.extraCategories?.length > 0 || it.kind === 'relation') {
        referencedSet.add(it.id);
        targets.forEach((tId) => {
          if (tId !== it.id) {
            referencedSet.add(tId);
            linkPairs.push([it.id, tId]);
          }
        });
      }
    });

    const subset =
      referencedSet.size >= 2
        ? items.filter((it) => referencedSet.has(it.id)).slice(0, 32)
        : items.slice(0, 20);

    const width = 920;
    const height = 460;
    const cx = width / 2;
    const cy = height / 2;
    const rx = 345;
    const ry = 175;

    const nodes = subset.map((it, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(1, subset.length) - Math.PI / 2;
      const color = getColorConfig(
        categoriesMap[it.category]?.colorKey || it.colorKey || it.category
      );
      return {
        ...it,
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
        accent: color.accent,
      };
    });

    const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const edges = [];
    const seenPairs = new Set();

    linkPairs.forEach(([srcId, dstId]) => {
      const source = nodeById[srcId];
      const target = nodeById[dstId];
      if (!source || !target || source.id === target.id) return;
      const pairKey = [source.id, target.id].sort().join('::');
      if (seenPairs.has(pairKey)) return;
      seenPairs.add(pairKey);
      edges.push({
        id: pairKey,
        source,
        target,
        crossCategory: source.category !== target.category,
      });
    });

    return { nodes, edges, width, height };
  }, [items, categoriesMap]);

  if (graph.nodes.length === 0) {
    return (
      <div className="keep-empty-state">
        <p>Todavía no hay elementos suficientes para trazar el Mapa de Conexiones.</p>
      </div>
    );
  }

  return (
    <div className="connections-graph-card">
      <div className="connections-graph-header">
        <div>
          <h3>🕸️ Mapa de Conexiones entre Categorías y Elementos</h3>
          <p>
            Las líneas continuas enlazan elementos vinculados con <code>@relación</code> entre listas distintas. Pulsa cualquier nodo para inspeccionarlo o saltar a su lista.
          </p>
        </div>
        <span className="keep-badge">
          {graph.edges.length} vínculos activos · {graph.nodes.length} nodos
        </span>
      </div>

      <div className="connections-svg-wrap">
        <svg
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          className="connections-svg"
          role="img"
          aria-label="Grafo de conexiones entre elementos de distintas categorías"
        >
          {/* Vínculos */}
          {graph.edges.map((edge) => {
            const isHighlighted =
              activeItemId &&
              (edge.source.id === activeItemId || edge.target.id === activeItemId);
            const mx = (edge.source.x + edge.target.x) / 2;
            const my = (edge.source.y + edge.target.y) / 2 - 22;
            return (
              <path
                key={edge.id}
                d={`M ${edge.source.x} ${edge.source.y} Q ${mx} ${my} ${edge.target.x} ${edge.target.y}`}
                fill="none"
                stroke={isHighlighted ? '#10b981' : edge.source.accent}
                strokeWidth={isHighlighted ? 3 : 1.8}
                strokeDasharray={edge.crossCategory ? undefined : '4 4'}
                opacity={isHighlighted ? 0.95 : 0.55}
              />
            );
          })}

          {/* Nodos */}
          {graph.nodes.map((node) => {
            const isSelected = activeItemId === node.id;
            const label =
              node.title.length > 22 ? `${node.title.slice(0, 20)}…` : node.title;
            const catIcon = getCategoryIcon(node.category);
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                className="graph-node-group"
                onClick={() => onSelectItem && onSelectItem(node)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={isSelected ? 22 : 17}
                  fill={node.accent}
                  opacity={isSelected ? 0.28 : 0.16}
                />
                <circle
                  r={isSelected ? 13 : 10}
                  fill={node.accent}
                  stroke="#ffffff"
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
                <text
                  y={26}
                  textAnchor="middle"
                  className="graph-node-title"
                >
                  {label}
                </text>
                <text
                  y={-16}
                  textAnchor="middle"
                  className="graph-node-cat"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectCategory) onSelectCategory(node.category);
                  }}
                >
                  {catIcon} {node.category}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
