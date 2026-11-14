import React, { useState } from 'react';
import LightDismissDialog from './LightDismissDialog';

/**
 * Modal de compartición universal para love.deft.work:
 * Funciona tanto a nivel de Categoría (`target.kind === 'category'`)
 * como a nivel de Elemento individual (`target.kind === 'item'`).
 */
export default function ShareModal({
  open,
  onClose,
  target,
  canEdit,
  onUpdateSharing,
}) {
  const [emailInput, setEmailInput] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  if (!target) return null;

  const isCategory = target.kind === 'category';
  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://love.deft.work/';

  const shareUrl = isCategory
    ? `${baseUrl}?cat=${encodeURIComponent(target.name)}`
    : `${baseUrl}?item=${encodeURIComponent(target.item.id)}`;

  const isPublic = isCategory ? target.isPublic !== false : target.item.isPublic !== false;
  const sharedWith = isCategory
    ? target.sharedWith || []
    : target.item.sharedWith || [];

  const buildMarkdownExport = () => {
    if (isCategory) {
      const lines = [
        `📋 *${target.name}* (${target.items.length} elementos) — love.deft.work`,
        '',
        ...target.items.map((it) => {
          const check = it.checked ? '☑️' : it.type === 'link' ? '🔗' : it.type === 'word' ? '🏷️' : '💬';
          const main = it.type === 'link' ? `${it.title} (${it.url})` : it.title;
          const note = it.note ? ` — _${it.note}_` : '';
          const att = it.attachment?.url ? ` [📎 ${it.attachment.name}: ${it.attachment.url}]` : '';
          return `${check} ${main}${note}${att}`;
        }),
        '',
        `🔗 Ver tablero: ${shareUrl}`,
      ];
      return lines.join('\n');
    } else {
      const it = target.item;
      const icon = it.type === 'link' ? '🔗' : it.type === 'word' ? '🏷️' : '💬';
      const lines = [
        `${icon} *${it.title}* [${it.category}]`,
        ...(it.url ? [`🌐 ${it.url}`] : []),
        ...(it.attachment?.url ? [`📎 ${it.attachment.name}: ${it.attachment.url}`] : []),
        ...(it.note ? [`📝 ${it.note}`] : []),
        ...(target.relatedItems?.length
          ? [
              `🔗 Relacionado con: ${target.relatedItems
                .map((r) => `${r.title} (${r.category})`)
                .join(', ')}`,
            ]
          : []),
        `🔗 Enlace directo: ${shareUrl}`,
      ];
      return lines.join('\n');
    }
  };

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2200);
    } catch {
      // Fallback
    }
  };

  const handleTogglePublic = async (nextPublic) => {
    if (!canEdit || !onUpdateSharing) return;
    await onUpdateSharing({
      isPublic: nextPublic,
      sharedWith,
    });
  };

  const handleAddCollaborator = async (e) => {
    e.preventDefault();
    const clean = emailInput.trim().toLowerCase();
    if (!clean || !clean.includes('@')) return;
    if (sharedWith.includes(clean)) {
      setEmailInput('');
      return;
    }
    const nextList = [...sharedWith, clean];
    setEmailInput('');
    if (canEdit && onUpdateSharing) {
      await onUpdateSharing({
        isPublic,
        sharedWith: nextList,
      });
    }
  };

  const handleRemoveCollaborator = async (email) => {
    const nextList = sharedWith.filter((e) => e !== email);
    if (canEdit && onUpdateSharing) {
      await onUpdateSharing({
        isPublic,
        sharedWith: nextList,
      });
    }
  };

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(
    shareUrl
  )}`;

  return (
    <LightDismissDialog
      open={open}
      onClose={onClose}
      title={
        isCategory
          ? `Compartir categoría «${target.name}»`
          : `Compartir «${target.item.title}»`
      }
      subtitle={
        isCategory
          ? `${target.items.length} elementos en esta lista · Nivel Categoría`
          : `Elemento tipo ${target.item.type.toUpperCase()} en ${target.item.category}`
      }
    >
      <div className="share-modal-stack">
        {/* 1. Interruptor Público / Privado */}
        <div className="share-visibility-box">
          <div>
            <div className="share-visibility-title">
              {isPublic ? '🌍 Acceso público de lectura activo' : '🔒 Privado (solo tú y colaboradores)'}
            </div>
            <div className="share-visibility-desc">
              {isPublic
                ? 'Cualquier persona con el enlace o código QR puede consultar este contenido.'
                : 'Solo visible tras iniciar sesión con una cuenta autorizada.'}
            </div>
          </div>
          {canEdit && (
            <label className="keep-switch-label">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => handleTogglePublic(e.target.checked)}
              />
              <span>{isPublic ? 'Público' : 'Privado'}</span>
            </label>
          )}
        </div>

        {/* 2. Enlace directo + Botones de copia rápida */}
        <div className="share-section">
          <label className="share-label">Enlace directo compartible</label>
          <div className="share-url-row">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="keep-input"
              onClick={(e) => e.target.select()}
            />
            <button
              type="button"
              className="keep-btn keep-btn-primary"
              onClick={() => copyText(shareUrl, 'url')}
            >
              {copiedKey === 'url' ? '✓ Copiado' : 'Copiar link'}
            </button>
          </div>
        </div>

        {/* 3. Exportar en 1 clic (Markdown / WhatsApp / Portapapeles) */}
        <div className="share-section">
          <label className="share-label">
            Exportación rápida (WhatsApp, Telegram, Markdown)
          </label>
          <pre className="share-markdown-preview">{buildMarkdownExport()}</pre>
          <div className="share-actions-row">
            <button
              type="button"
              className="keep-btn keep-btn-tonal"
              onClick={() => copyText(buildMarkdownExport(), 'md')}
            >
              {copiedKey === 'md'
                ? '✓ Texto copiado al portapapeles'
                : '📋 Copiar como lista / texto limpio'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(buildMarkdownExport())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="keep-btn keep-btn-tonal"
            >
              💬 Enviar por WhatsApp
            </a>
          </div>
        </div>

        {/* 4. Colaboradores por email de Google */}
        <div className="share-section">
          <label className="share-label">
            Colaboradores invitados (acceso y edición con Google Auth)
          </label>
          {canEdit ? (
            <form onSubmit={handleAddCollaborator} className="share-url-row">
              <input
                type="email"
                placeholder="correo@gmail.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="keep-input"
              />
              <button type="submit" className="keep-btn keep-btn-tonal">
                + Invitar
              </button>
            </form>
          ) : (
            <p className="share-visibility-desc">
              Inicia sesión para gestionar los permisos de colaboración.
            </p>
          )}
          {sharedWith.length > 0 && (
            <div className="share-collaborators-chips">
              {sharedWith.map((email) => (
                <span key={email} className="keep-chip">
                  👤 {email}
                  {canEdit && (
                    <button
                      type="button"
                      className="keep-chip-remove"
                      onClick={() => handleRemoveCollaborator(email)}
                      title="Quitar acceso"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 5. Código QR instantáneo para móvil */}
        <div className="share-qr-box">
          <img
            src={qrImageUrl}
            alt="Código QR para compartir"
            width="136"
            height="136"
            className="share-qr-img"
            loading="lazy"
          />
          <div className="share-qr-meta">
            <strong>Código QR instantáneo</strong>
            <p>
              Escanea con la cámara del móvil para abrir directamente{' '}
              {isCategory
                ? `la categoría «${target.name}»`
                : `el elemento «${target.item.title}»`}{' '}
              en <code>love.deft.work</code>.
            </p>
          </div>
        </div>
      </div>
    </LightDismissDialog>
  );
}
