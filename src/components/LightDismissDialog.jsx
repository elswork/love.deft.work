import React, { useEffect, useId, useRef } from 'react';

/**
 * Modal nativo <dialog closedby="any"> conforme a modern-web-guidance
 * (`light-dismiss-a-dialog`), con apertura mediante showModal() y fallback
 * de coordenadas para navegadores sin soporte nativo de `closedby`.
 */
export default function LightDismissDialog({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = '560px',
  children,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      if (onClose) onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Fallback for browsers without native closedby support
    let handleBackdropClick = null;
    if (
      typeof HTMLDialogElement !== 'undefined' &&
      !('closedBy' in HTMLDialogElement.prototype)
    ) {
      handleBackdropClick = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;

        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (handleBackdropClick) {
        dialog.removeEventListener('click', handleBackdropClick);
      }
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      {...{ closedby: 'any' }}
      aria-labelledby={titleId}
      className="keep-dialog"
      style={{ maxWidth }}
    >
      <div className="keep-dialog-inner">
        <div className="keep-dialog-header">
          <div>
            <h2 id={titleId} className="keep-dialog-title">
              {title}
            </h2>
            {subtitle && <p className="keep-dialog-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="keep-icon-btn"
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar ventana"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="keep-dialog-body">{children}</div>
      </div>
    </dialog>
  );
}
