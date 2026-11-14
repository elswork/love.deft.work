import React, { useState, useMemo, useRef, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import EnrichmentService from '../services/EnrichmentService';
import AttachmentService from '../services/AttachmentService';
import { KEEP_COLORS, getColorConfig, getCategoryIcon } from '../data/keep_palette';

/**
 * Barra de captura rápida estilo Google Keep para love.deft.work.
 * Soporta links (con extracción automática de dominio/favicon y sugerencia de categoría),
 * palabras y frases cortas, más sintaxis rápida #Categoría y @Relación.
 */
export default function DiscoveryForm({
  categories = [],
  allItems = [],
  user,
  activeCategoryFilter,
  onCreated,
}) {
  const [rawInput, setRawInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [manualType, setManualType] = useState(''); // '' | 'link' | 'word' | 'phrase'
  const [manualCategory, setManualCategory] = useState('');
  const [extraCategories, setExtraCategories] = useState([]);
  const [relatedIds, setRelatedIds] = useState([]);
  const [relationQuery, setRelationQuery] = useState('');
  const [showRelationPicker, setShowRelationPicker] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [colorKey, setColorKey] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const handleSelectFile = (file) => {
    setFileError('');
    if (!file) return;
    if (file.size > AttachmentService.MAX_ATTACHMENT_BYTES) {
      setFileError('El fichero supera el máximo de 15 MB.');
      return;
    }
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(file);
    if (file.type && file.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl('');
    }
    if (!rawInput.trim()) {
      setRawInput(AttachmentService.cleanFileTitle(file.name));
    }
    setExpanded(true);
  };

  const clearSelectedFile = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(null);
    setFilePreviewUrl('');
    setFileError('');
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Inferencia en vivo mientras escribe
  const parsed = useMemo(
    () => EnrichmentService.parseQuickInput(rawInput, allItems),
    [rawInput, allItems]
  );

  const effectiveType = manualType || parsed.type;
  const effectiveCategory =
    manualCategory ||
    (activeCategoryFilter && activeCategoryFilter !== 'All'
      ? activeCategoryFilter
      : parsed.category);

  const combinedRelatedIds = useMemo(() => {
    return Array.from(new Set([...parsed.relatedIds, ...relatedIds]));
  }, [parsed.relatedIds, relatedIds]);

  const combinedExtraCategories = useMemo(() => {
    return Array.from(
      new Set([...parsed.extraCategories, ...extraCategories])
    ).filter((c) => c && c !== effectiveCategory);
  }, [parsed.extraCategories, extraCategories, effectiveCategory]);

  const relationCandidates = useMemo(() => {
    const q = relationQuery.trim().toLowerCase();
    return allItems
      .filter((it) => {
        if (!q) return true;
        return (
          it.title.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q) ||
          (it.domain && it.domain.toLowerCase().includes(q))
        );
      })
      .slice(0, 8);
  }, [allItems, relationQuery]);

  const resetForm = () => {
    setRawInput('');
    setNoteInput('');
    setManualType('');
    setManualCategory('');
    setExtraCategories([]);
    setRelatedIds([]);
    setRelationQuery('');
    setShowRelationPicker(false);
    setPinned(false);
    setIsPublic(true);
    setColorKey('');
    clearSelectedFile();
    setExpanded(false);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if ((!rawInput.trim() && !selectedFile) || saving) return;

    try {
      setSaving(true);
      setFileError('');

      let attachment = null;
      if (selectedFile) {
        setUploadProgress(0);
        attachment = await AttachmentService.uploadAttachment(
          selectedFile,
          user?.uid,
          (pct) => setUploadProgress(pct)
        );
      }

      const effectiveText = rawInput.trim() || AttachmentService.cleanFileTitle(selectedFile?.name);
      const effectiveParsed = rawInput.trim()
        ? parsed
        : EnrichmentService.parseQuickInput(effectiveText, allItems);
      const finalCategory = effectiveCategory.trim() || 'General';
      const payload = {
        name: effectiveParsed.title,
        title: effectiveParsed.title,
        type: effectiveType,
        url:
          effectiveType === 'link'
            ? effectiveParsed.url || EnrichmentService.normalizeUrl(effectiveText)
            : '',
        domain: effectiveType === 'link' ? effectiveParsed.domain : '',
        favicon: effectiveType === 'link' ? effectiveParsed.favicon : '',
        attachment,
        category: finalCategory,
        extraCategories: combinedExtraCategories,
        relatedIds: combinedRelatedIds,
        note: noteInput.trim(),
        description: noteInput.trim(),
        pinned,
        checked: false,
        order: Date.now(),
        clicks: 0,
        relevance_score: pinned ? 95 : 75,
        colorKey: colorKey || getColorConfig(finalCategory).key,
        isPublic,
        sharedWith: [],
        ownerUid: user?.uid || '',
        ownerEmail: user?.email || '',
        status: 'completed',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'discoveries'), payload);
      if (onCreated) onCreated(docRef.id, payload);
      resetForm();
    } catch (err) {
      console.error('[KeepCapture] Error al guardar:', err);
      setFileError(err?.message || 'Error al guardar el elemento.');
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const toggleExtraCategory = (cat) => {
    setExtraCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleRelatedId = (id) => {
    setRelatedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const categoryOptions = useMemo(() => {
    const base = categories.filter((c) => c && c !== 'All');
    const defaults = [
      'Tecnología',
      'Cultura',
      'Gastro',
      'Motor',
      'Palabras & Léxico',
      'Libros & Frases',
      'Ideas & Citas',
    ];
    return Array.from(new Set([...base, ...defaults]));
  }, [categories]);

  return (
    <div
      className={`keep-capture-shell ${expanded ? 'is-expanded' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          setExpanded(true);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer?.files?.length) {
          e.preventDefault();
          handleSelectFile(e.dataTransfer.files[0]);
        }
      }}
      onPaste={(e) => {
        const fileItem = Array.from(e.clipboardData?.items || []).find(
          (item) => item.kind === 'file'
        );
        if (fileItem) {
          const f = fileItem.getAsFile();
          if (f) handleSelectFile(f);
        }
      }}
    >
      <form onSubmit={handleSubmit} className="keep-capture-form">
        <div className="keep-capture-main-row">
          <span className="keep-capture-type-indicator" title={`Tipo detectado: ${effectiveType}`}>
            {effectiveType === 'link' ? '🔗' : effectiveType === 'word' ? '🏷️' : '💬'}
          </span>
          <input
            type="text"
            value={rawInput}
            onFocus={() => setExpanded(true)}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Añade un link, palabra, frase o adjunta un fichero… (#Categoría @elemento)"
            className="keep-capture-input"
            aria-label="Añadir un link, palabra, frase corta o fichero"
          />
          {rawInput.trim() && (
            <span className="keep-auto-cat-pill" title="Categoría asignada automáticamente">
              {getCategoryIcon(effectiveCategory)} {effectiveCategory}
            </span>
          )}
          <label
            htmlFor="capture-file-input"
            className={`keep-icon-btn keep-file-trigger ${selectedFile ? 'is-active' : ''}`}
            title="Adjuntar un fichero (máx. 15 MB)"
          >
            📎
            <input
              ref={fileInputRef}
              id="capture-file-input"
              type="file"
              className="keep-sr-only"
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            className={`keep-icon-btn ${pinned ? 'is-active' : ''}`}
            onClick={() => setPinned((p) => !p)}
            title={pinned ? 'Fijado arriba (Pin)' : 'Fijar elemento'}
          >
            📌
          </button>
          <button
            type="submit"
            disabled={(!rawInput.trim() && !selectedFile) || saving}
            className="keep-btn keep-btn-primary keep-capture-submit"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>

        {(selectedFile || fileError || uploadProgress !== null) && (
          <div className="keep-file-preview-bar">
            {selectedFile && (
              <div className="keep-file-chip">
                {filePreviewUrl ? (
                  <img src={filePreviewUrl} alt="" className="keep-file-thumb" />
                ) : (
                  <span>
                    {AttachmentService.getAttachmentIcon(selectedFile.type, selectedFile.name)}
                  </span>
                )}
                <span className="keep-file-name">{selectedFile.name}</span>
                <small className="keep-file-size">
                  {AttachmentService.formatFileSize(selectedFile.size)}
                </small>
                {!saving && (
                  <button
                    type="button"
                    className="keep-icon-btn-sm"
                    onClick={clearSelectedFile}
                    title="Quitar fichero"
                    aria-label="Quitar fichero adjunto"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
            {uploadProgress !== null && (
              <div className="keep-upload-progress-row" role="status" aria-live="polite">
                <progress
                  className="keep-upload-progress"
                  value={uploadProgress}
                  max={100}
                  aria-label="Progreso de subida del fichero"
                />
                <span>{uploadProgress}%</span>
              </div>
            )}
            {fileError && (
              <span className="keep-file-error" role="status" aria-live="polite">
                {fileError}
              </span>
            )}
          </div>
        )}

        {expanded && (
          <div className="keep-capture-details">
            {/* Vista previa instantánea si es URL */}
            {effectiveType === 'link' && parsed.domain && (
              <div className="keep-link-preview-bar">
                {parsed.favicon && (
                  <img src={parsed.favicon} alt="" width="16" height="16" />
                )}
                <strong>{parsed.title}</strong>
                <span className="keep-domain-tag">{parsed.domain}</span>
              </div>
            )}

            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Nota breve, contexto o definición de 1 línea (opcional)…"
              className="keep-capture-note-input"
            />

            <div className="keep-capture-toolbar">
              {/* Selector de tipo */}
              <div className="keep-pill-group" role="group" aria-label="Tipo de elemento">
                {[
                  { id: 'link', label: '🔗 Link' },
                  { id: 'word', label: '🏷️ Palabra' },
                  { id: 'phrase', label: '💬 Frase' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`keep-mini-pill ${effectiveType === t.id ? 'active' : ''}`}
                    onClick={() => setManualType(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Selector de categoría principal */}
              <div className="keep-inline-control">
                <label className="keep-sr-only" htmlFor="capture-cat-select">
                  Categoría principal
                </label>
                <select
                  id="capture-cat-select"
                  value={effectiveCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="keep-select-compact"
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {getCategoryIcon(c)} {c}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="O escribe nueva categoría…"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="keep-input-compact"
                />
              </div>

              {/* Botón para relacionar con elementos de otras listas */}
              <button
                type="button"
                className={`keep-mini-pill ${
                  showRelationPicker || combinedRelatedIds.length > 0 ? 'active' : ''
                }`}
                onClick={() => setShowRelationPicker((v) => !v)}
              >
                🕸️ Relacionar ({combinedRelatedIds.length})
              </button>

              {/* Privacidad */}
              <button
                type="button"
                className="keep-mini-pill"
                onClick={() => setIsPublic((v) => !v)}
                title="Cambiar visibilidad pública/privada"
              >
                {isPublic ? '🌍 Público' : '🔒 Privado'}
              </button>

              {/* Selector de color */}
              <div className="keep-color-dots">
                {KEEP_COLORS.slice(0, 7).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`keep-color-dot ${colorKey === c.key ? 'selected' : ''}`}
                    style={{ backgroundColor: c.accent }}
                    onClick={() => setColorKey(c.key === colorKey ? '' : c.key)}
                    title={`Color ${c.label}`}
                  />
                ))}
              </div>

              <button
                type="button"
                className="keep-btn-ghost"
                onClick={resetForm}
              >
                Cerrar
              </button>
            </div>

            {/* Selector desplegable de Relaciones entre listas y Categorías secundarias */}
            {showRelationPicker && (
              <div className="keep-relations-drawer">
                <div className="keep-relations-col">
                  <span className="keep-sub-label">
                    🔗 Vincular con elementos de cualquier categoría:
                  </span>
                  <input
                    type="text"
                    value={relationQuery}
                    onChange={(e) => setRelationQuery(e.target.value)}
                    placeholder="Buscar link, palabra o frase existente…"
                    className="keep-input-compact"
                  />
                  <div className="keep-relations-chips">
                    {relationCandidates.map((cand) => {
                      const active = combinedRelatedIds.includes(cand.id);
                      return (
                        <button
                          key={cand.id}
                          type="button"
                          className={`keep-relation-chip ${active ? 'active' : ''}`}
                          onClick={() => toggleRelatedId(cand.id)}
                        >
                          {active ? '✓ ' : '+ '}
                          {cand.title}{' '}
                          <small>({cand.category})</small>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="keep-relations-col">
                  <span className="keep-sub-label">
                    📂 Mostrar también como referencia en otras listas:
                  </span>
                  <div className="keep-relations-chips">
                    {categoryOptions
                      .filter((c) => c !== effectiveCategory)
                      .map((cat) => {
                        const active = combinedExtraCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            className={`keep-relation-chip ${active ? 'active' : ''}`}
                            onClick={() => toggleExtraCategory(cat)}
                          >
                            {active ? '✓ ' : '+ '}
                            {getCategoryIcon(cat)} {cat}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
