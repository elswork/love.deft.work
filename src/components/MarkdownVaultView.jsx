import React from 'react';
import {
  resolveWikiTarget,
  getFileBadge,
  getFileDisplayName,
} from '../services/MarkdownVaultService';
import AttachmentService from '../services/AttachmentService';
import { IconFileKind, IconImage } from './VaultIcons';

/**
 * Renderizador seguro de Markdown estilo Obsidian.md sin dangerouslySetInnerHTML.
 * Soporta encabezados, listas, citas, bloques de código, negrita/cursiva,
 * enlaces externos [texto](url), [[WikiLinks]] y ![[Embeds]] multimedia.
 */
export default function MarkdownVaultView({
  markdown = '',
  allItems = [],
  onOpenItem,
  onCreateMissingNote,
}) {
  const renderInline = (text, keyPrefix) => {
    // Tokeniza: ![[embed]], [[wikilink]], [label](url), `code`, **bold**, *italic*
    const tokenRegex =
      /(!\[\[[^\]]+\]\]|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    const parts = String(text).split(tokenRegex);

    return parts.map((part, idx) => {
      const key = `${keyPrefix}-${idx}`;
      if (!part) return null;

      // Embed ![[...]]
      if (part.startsWith('![[') && part.endsWith(']]')) {
        const inner = part.slice(3, -2).trim();
        const [rawTarget, rawAlias] = inner.split('|');
        const targetItem = resolveWikiTarget(rawTarget, allItems);

        if (targetItem?.attachment?.url) {
          const att = targetItem.attachment;
          if (AttachmentService.isImageAttachment(att)) {
            return (
              <figure key={key} className="obsidian-embed-figure">
                <img src={att.url} alt={rawAlias || att.name} loading="lazy" />
                <figcaption>
                    <button
                    type="button"
                    className="obsidian-wikilink-inline"
                    onClick={() => onOpenItem && onOpenItem(targetItem)}
                  >
                    <IconImage size={14} /> {rawAlias || getFileDisplayName(targetItem)}
                  </button>
                </figcaption>
              </figure>
            );
          }
          if (att.contentType?.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(att.name)) {
            return (
              <figure key={key} className="obsidian-embed-figure">
                <video src={att.url} controls preload="metadata" />
                <figcaption>{rawAlias || att.name}</figcaption>
              </figure>
            );
          }
          return (
            <div key={key} className="obsidian-embed-card">
              <span>{AttachmentService.getAttachmentIcon(att.contentType, att.name)}</span>
              <a href={att.url} target="_blank" rel="noopener noreferrer">
                {rawAlias || att.name}
              </a>
              <small>{AttachmentService.formatFileSize(att.size)}</small>
            </div>
          );
        }

        if (targetItem) {
          const badge = getFileBadge(targetItem);
          return (
            <button
              key={key}
              type="button"
              className="obsidian-wikilink"
              onClick={() => onOpenItem && onOpenItem(targetItem)}
            >
              <IconFileKind kind={badge.kind} size={14} /> {rawAlias || getFileDisplayName(targetItem)}
            </button>
          );
        }

        return (
          <span key={key} className="obsidian-wikilink is-unresolved">
            📎 {rawTarget} (sin archivo)
          </span>
        );
      }

      // WikiLink [[...]]
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const inner = part.slice(2, -2).trim();
        const [rawTarget, rawAlias] = inner.split('|');
        const targetName = (rawTarget || '').trim();
        const label = (rawAlias || targetName).trim();
        const resolved = resolveWikiTarget(targetName, allItems);

        if (resolved) {
          const badge = getFileBadge(resolved);
          return (
            <button
              key={key}
              type="button"
              className="obsidian-wikilink"
              onClick={() => onOpenItem && onOpenItem(resolved)}
              title={`Abrir ${getFileDisplayName(resolved)} (${resolved.category})`}
            >
              <span className="obsidian-wl-icon">
                <IconFileKind kind={badge.kind} size={14} />
              </span>
              {label}
            </button>
          );
        }

        return (
          <button
            key={key}
            type="button"
            className="obsidian-wikilink is-unresolved"
            onClick={() => onCreateMissingNote && onCreateMissingNote(targetName)}
            title={`Crear nueva nota «${targetName}.md»`}
          >
            + {label}
          </button>
        );
      }

      // Enlace Markdown [texto](url)
      if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
        const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (m) {
          return (
            <a
              key={key}
              href={m[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="obsidian-ext-link"
            >
              {m[1]} ↗
            </a>
          );
        }
      }

      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={key} className="obsidian-inline-code">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }

      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
  };

  const lines = String(markdown || '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Bloque de código ```
    if (line.trim().startsWith('```')) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre key={`code-${i}`} className="obsidian-code-block">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      i += 1;
      continue;
    }

    // Encabezados
    const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const Tag = `h${level}`;
      blocks.push(
        <Tag key={`h-${i}`} className={`obsidian-h${level}`}>
          {renderInline(hMatch[2], `h-${i}`)}
        </Tag>
      );
      i += 1;
      continue;
    }

    // Cita >
    if (line.trim().startsWith('>')) {
      const quoteText = line.replace(/^\s*>\s?/, '');
      blocks.push(
        <blockquote key={`q-${i}`} className="obsidian-blockquote">
          {renderInline(quoteText, `q-${i}`)}
        </blockquote>
      );
      i += 1;
      continue;
    }

    // Lista - o *
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, '');
        listItems.push(
          <li key={`li-${i}`}>{renderInline(itemText, `li-${i}`)}</li>
        );
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="obsidian-list">
          {listItems}
        </ul>
      );
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="obsidian-paragraph">
        {renderInline(line, `p-${i}`)}
      </p>
    );
    i += 1;
  }

  return <div className="obsidian-markdown-body">{blocks}</div>;
}
