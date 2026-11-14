/**
 * Servicio central de bóveda estilo Obsidian.md para love.deft.work.
 * Gestiona extensiones de archivo, extracción de [[WikiLinks]] / ![[Embeds]],
 * resolución de objetivos, backlinks y relaciones reificadas.
 */

export function getFileExtension(item) {
  if (!item) return '.md';
  if (item.attachment?.name) {
    const m = item.attachment.name.match(/(\.[a-z0-9]{1,8})$/i);
    if (m) return m[1].toLowerCase();
  }
  if (item.type === 'link' && item.url && !item.markdownContent) {
    return '.url';
  }
  return '.md';
}

export function getFileDisplayName(item) {
  if (!item) return 'sin-titulo.md';
  if (item.attachment?.name && !item.markdownContent && item.title === item.attachment.name) {
    return item.attachment.name;
  }
  const base = String(item.title || 'sin-titulo').trim();
  const ext = getFileExtension(item);
  if (base.toLowerCase().endsWith(ext)) return base;
  return `${base}${ext}`;
}

export function getFileBadge(item) {
  const ext = getFileExtension(item);
  const mime = String(item?.attachment?.contentType || '').toLowerCase();

  if (item?.kind === 'relation') return { ext: '.md', icon: '🕸️', kind: 'relation' };
  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].includes(ext)) {
    return { ext, icon: '🖼️', kind: 'image' };
  }
  if (ext === '.pdf' || mime === 'application/pdf') {
    return { ext: '.pdf', icon: '📕', kind: 'pdf' };
  }
  if (mime.startsWith('video/') || ['.mp4', '.webm', '.mov'].includes(ext)) {
    return { ext, icon: '🎬', kind: 'video' };
  }
  if (mime.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
    return { ext, icon: '🎵', kind: 'audio' };
  }
  if (ext === '.url') {
    return { ext: '.url', icon: '🔗', kind: 'link' };
  }
  return { ext: ext || '.md', icon: '📝', kind: 'markdown' };
}

/**
 * Extrae todos los [[WikiLinks]] y ![[Embeds]] de un texto Markdown.
 * Soporta [[Destino]] y [[Destino|Alias]].
 */
export function extractWikiLinks(markdown = '') {
  const results = [];
  const regex = /(!?)\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const isEmbed = match[1] === '!';
    const inner = match[2].trim();
    const [rawTarget, rawAlias] = inner.split('|');
    const target = (rawTarget || '').trim();
    const alias = (rawAlias || target).trim();
    if (target) {
      results.push({ target, alias, isEmbed, raw: match[0] });
    }
  }
  return results;
}

export function normalizeLookupKey(str = '') {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\.(md|url|pdf|png|jpg|jpeg|svg|mp4|webm|mp3)$/i, '')
    .replace(/\s+/g, ' ');
}

export function resolveWikiTarget(target, items = []) {
  if (!target) return null;
  const clean = normalizeLookupKey(target);
  return (
    items.find((it) => it.id === target) ||
    items.find((it) => normalizeLookupKey(it.title) === clean) ||
    items.find((it) => normalizeLookupKey(it.attachment?.name || '') === clean) ||
    items.find((it) => normalizeLookupKey(getFileDisplayName(it)) === clean) ||
    null
  );
}

/**
 * Construye un contenido Markdown inicial si el documento proviene del formato anterior.
 */
export function buildInitialMarkdown(item, itemsById = {}) {
  if (typeof item.markdownContent === 'string' && item.markdownContent.trim()) {
    return item.markdownContent;
  }

  const lines = [`# ${item.title}`, ''];
  if (item.kind === 'relation' && item.sourceId && item.targetId) {
    const src = itemsById[item.sourceId];
    const dst = itemsById[item.targetId];
    lines.push(
      `> **Relación (${item.relationLabel || 'conecta con'})**: [[${src?.title || item.sourceId}]] ──▶ [[${dst?.title || item.targetId}]]`,
      ''
    );
  }
  if (item.note) {
    lines.push(item.note, '');
  }
  if (item.url) {
    lines.push(`- **Enlace externo**: [${item.domain || item.url}](${item.url})`, '');
  }
  if (item.attachment?.name) {
    lines.push(`- **Archivo adjunto**: ![[${item.attachment.name}]]`, '');
  }
  const relNames = (item.relatedIds || [])
    .map((id) => itemsById[id]?.title)
    .filter(Boolean);
  if (relNames.length > 0) {
    lines.push('## Conexiones', '');
    relNames.forEach((name) => lines.push(`- [[${name}]]`));
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Calcula las conexiones salientes y backlinks (menciones entrantes)
 * combinando [[WikiLinks]] dentro del Markdown y `relatedIds` / relaciones reificadas.
 */
export function computeVaultConnections(activeItem, allItems = []) {
  if (!activeItem) return { outgoing: [], backlinks: [], relations: [] };

  const itemsById = Object.fromEntries(allItems.map((it) => [it.id, it]));
  const activeKey = normalizeLookupKey(activeItem.title);
  const activeAttKey = normalizeLookupKey(activeItem.attachment?.name || '');

  // 1. Enlaces salientes del archivo activo
  const md = buildInitialMarkdown(activeItem, itemsById);
  const parsedLinks = extractWikiLinks(md);
  const outgoingMap = new Map();

  parsedLinks.forEach((lnk) => {
    const resolved = resolveWikiTarget(lnk.target, allItems);
    if (resolved && resolved.id !== activeItem.id) {
      outgoingMap.set(resolved.id, { item: resolved, via: lnk.isEmbed ? 'embed' : 'wikilink' });
    }
  });

  (activeItem.relatedIds || []).forEach((id) => {
    const resolved = itemsById[id];
    if (resolved && resolved.id !== activeItem.id && !outgoingMap.has(resolved.id)) {
      outgoingMap.set(resolved.id, { item: resolved, via: 'link' });
    }
  });

  // Si es una relación reificada, incluir origen y destino
  if (activeItem.sourceId && itemsById[activeItem.sourceId]) {
    outgoingMap.set(activeItem.sourceId, { item: itemsById[activeItem.sourceId], via: 'origen' });
  }
  if (activeItem.targetId && itemsById[activeItem.targetId]) {
    outgoingMap.set(activeItem.targetId, { item: itemsById[activeItem.targetId], via: 'destino' });
  }

  // 2. Backlinks (archivos que mencionan o enlazan al archivo activo)
  const backlinks = [];
  allItems.forEach((other) => {
    if (other.id === activeItem.id) return;
    const otherMd = buildInitialMarkdown(other, itemsById);
    const otherLinks = extractWikiLinks(otherMd);
    const matchesWiki = otherLinks.some((lnk) => {
      const k = normalizeLookupKey(lnk.target);
      return (
        lnk.target === activeItem.id ||
        k === activeKey ||
        (activeAttKey && k === activeAttKey)
      );
    });
    const matchesRelated = (other.relatedIds || []).includes(activeItem.id);
    const matchesReified =
      other.sourceId === activeItem.id || other.targetId === activeItem.id;

    if (matchesWiki || matchesRelated || matchesReified) {
      // Extraer primera línea con mención como snippet de contexto
      const snippetLine =
        otherMd
          .split('\n')
          .find((line) => {
            const lower = line.toLowerCase();
            return (
              lower.includes(`[[${activeKey}`) ||
              (activeAttKey && lower.includes(`[[${activeAttKey}`))
            );
          }) || other.note || '';

      backlinks.push({
        item: other,
        snippet: snippetLine.replace(/^[-*#>\s]+/, '').slice(0, 110),
        isRelationNode: other.kind === 'relation',
      });
    }
  });

  // 3. Relaciones reificadas que conectan este nodo
  const relations = allItems.filter(
    (it) =>
      it.kind === 'relation' &&
      (it.sourceId === activeItem.id || it.targetId === activeItem.id)
  );

  return {
    outgoing: Array.from(outgoingMap.values()),
    backlinks,
    relations,
  };
}

const MarkdownVaultService = {
  getFileExtension,
  getFileDisplayName,
  getFileBadge,
  extractWikiLinks,
  resolveWikiTarget,
  buildInitialMarkdown,
  computeVaultConnections,
};

export default MarkdownVaultService;
