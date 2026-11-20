import React, { useId, useMemo, useRef, useState } from 'react';
import MarkdownVaultView from './MarkdownVaultView';
import {
  searchLmWiki,
  synthesizeWikiArticle,
} from '../services/LmWikiEngine';
import {
  buildWikiMarkdownBundle,
  triggerTextDownload,
} from '../services/LocalFirstWikiStore';
import { getFileDisplayName } from '../services/MarkdownVaultService';
import {
  IconAgent,
  IconCheck,
  IconCode,
  IconDatabase,
  IconDownload,
  IconLink,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUpload,
  IconWiki,
} from './VaultIcons';

const SUBTABS = [
  { id: 'wiki', label: 'Wiki & Síntesis' },
  { id: 'links', label: 'Auto-Enlaces' },
  { id: 'code', label: 'Código Indexado' },
  { id: 'local', label: 'Local-First & Lint' },
];

const CODE_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'bash',
  'json',
  'sql',
  'css',
  'html',
  'yaml',
  'go',
  'rust',
];

function formatBytes(bytes = 0) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function LmWikiView({
  wikiIndex,
  allItems = [],
  savedSyntheses = [],
  wikiLog = [],
  lmConfig,
  storageTelemetry,
  isOnline = true,
  onSaveLmConfig,
  onSaveSynthesis,
  onPromoteArticleToVault,
  onApplyAutoLink,
  onApplyBatchAutoLinks,
  onImportLocalFiles,
  onQuickCaptureCode,
  onOpenItem,
  onCreateMissingNote,
  onRecompileIndex,
}) {
  const baseId = useId();
  const [subTab, setSubTab] = useState('wiki');
  const [wikiQuery, setWikiQuery] = useState('');
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedLang, setSelectedLang] = useState('all');
  const [copiedId, setCopiedId] = useState('');

  // Captura rápida de fragmento de código
  const [showCodeCapture, setShowCodeCapture] = useState(false);
  const [codeTitle, setCodeTitle] = useState('');
  const [codeLang, setCodeLang] = useState('javascript');
  const [codeBody, setCodeBody] = useState('');

  // Configuración local de motor LM
  const [cfgDraft, setCfgDraft] = useState(() => lmConfig);
  const [prevLmConfig, setPrevLmConfig] = useState(lmConfig);
  if (lmConfig !== prevLmConfig) {
    setPrevLmConfig(lmConfig);
    setCfgDraft(lmConfig);
  }

  const tabRefs = useRef({});
  const importInputRef = useRef(null);
  const synthAbortRef = useRef(null);

  const searchResults = useMemo(
    () => searchLmWiki(wikiIndex, wikiQuery),
    [wikiIndex, wikiQuery]
  );

  // Combinación de síntesis guardadas + artículos de concepto auto-compilados
  const allWikiArticles = useMemo(() => {
    const custom = savedSyntheses.map((s) => ({
      ...s,
      kind: 'synthesis',
      sourceCount: s.sourceIds?.length || 0,
      categories: ['Síntesis LM'],
      isCrossCategory: true,
    }));
    const concepts = (searchResults.concepts || []).map((c) => ({
      ...c,
      kind: 'concept',
    }));
    return [...custom, ...concepts];
  }, [savedSyntheses, searchResults.concepts]);

  const activeArticle = useMemo(() => {
    if (selectedArticleId) {
      const found = allWikiArticles.find((a) => a.id === selectedArticleId);
      if (found) return found;
    }
    return allWikiArticles[0] || null;
  }, [allWikiArticles, selectedArticleId]);

  const filteredSnippets = useMemo(() => {
    const base = searchResults.snippets || [];
    if (selectedLang === 'all') return base;
    return base.filter((s) => s.lang === selectedLang);
  }, [searchResults.snippets, selectedLang]);

  const availableLanguages = useMemo(
    () => Object.keys(wikiIndex?.snippetsByLang || {}).toSorted(),
    [wikiIndex]
  );

  const handleTabKeyDown = (e, currentIdx) => {
    let nextIdx = null;
    if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % SUBTABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + SUBTABS.length) % SUBTABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = SUBTABS.length - 1;
    if (nextIdx === null) return;

    e.preventDefault();
    const nextTab = SUBTABS[nextIdx];
    setSubTab(nextTab.id);
    const btn = tabRefs.current[nextTab.id];
    btn?.focus();
    btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const handleSynthesize = async (e, explicitTopic = '') => {
    e?.preventDefault?.();
    const topic = (explicitTopic || wikiQuery).trim();
    if (!topic || synthesizing) return;

    synthAbortRef.current?.abort();
    const controller = new AbortController();
    synthAbortRef.current = controller;

    setSynthesizing(true);
    setStatusMessage(`Sintetizando artículo wiki sobre «${topic}»...`);
    try {
      const article = await synthesizeWikiArticle({
        topic,
        index: wikiIndex,
        lmConfig,
        userSignal: controller.signal,
      });
      await onSaveSynthesis?.(article);
      setSelectedArticleId(article.id);
      setSubTab('wiki');
      setStatusMessage(`Artículo «${article.title}» compilado con ${article.engine}.`);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setStatusMessage(err?.message || 'Error al sintetizar el artículo.');
      }
    } finally {
      setSynthesizing(false);
    }
  };

  const handleCopyText = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? '' : cur)), 1600);
    } catch {
      setStatusMessage('No se pudo copiar al portapapeles.');
    }
  };

  const handleExportMarkdown = () => {
    const bundle = buildWikiMarkdownBundle({
      items: allItems,
      conceptPages: wikiIndex?.conceptPages || [],
      syntheses: savedSyntheses,
      wikiLog,
    });
    triggerTextDownload(`love-lm-wiki-${new Date().toISOString().slice(0, 10)}.md`, bundle);
    setStatusMessage('Snapshot Markdown LM Wiki exportado localmente.');
  };

  const handleExportJson = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        items: allItems,
        syntheses: savedSyntheses,
        wikiLog,
      },
      null,
      2
    );
    triggerTextDownload(
      `love-lm-wiki-${new Date().toISOString().slice(0, 10)}.json`,
      payload,
      'application/json;charset=utf-8'
    );
    setStatusMessage('Backup JSON Local-First descargado.');
  };

  const handleSubmitCodeCapture = async (e) => {
    e.preventDefault();
    if (!codeTitle.trim() || !codeBody.trim()) return;
    await onQuickCaptureCode?.({
      title: codeTitle.trim(),
      lang: codeLang,
      code: codeBody,
    });
    setCodeTitle('');
    setCodeBody('');
    setShowCodeCapture(false);
    setStatusMessage(`Fragmento «${codeTitle.trim()}» indexado y auto-enlazado.`);
  };

  const handleSaveConfigSubmit = async (e) => {
    e.preventDefault();
    await onSaveLmConfig?.(cfgDraft);
    setStatusMessage(`Motor LM actualizado: ${cfgDraft.provider} (${cfgDraft.model}).`);
  };

  const lint = wikiIndex?.lint || { healthScore: 100, orphans: [], brokenLinks: [], unstructuredNotes: [] };
  const suggestedLinks = wikiIndex?.suggestedLinks || [];

  return (
    <div className="cc-lm-shell">
      {/* Cabecera compacta Local-First & Sub-pestañas accesibles */}
      <div className="cc-lm-header">
        <div className="cc-lm-header-top">
          <div className="cc-lm-title-block">
            <span className="cc-lm-eyebrow">
              <IconWiki size={13} />
              <span>LM WIKI · AUTOORGANIZADO &amp; LOCAL-FIRST</span>
            </span>
            <span className={`cc-local-pill ${isOnline ? 'is-online' : 'is-offline'}`}>
              <span className={`cc-status-dot ${isOnline ? 'tone-emerald' : 'tone-amber'}`} />
              <span>{isOnline ? 'Local-First + Sync' : 'Offline Local'}</span>
            </span>
            <span className="cc-mono-badge" title="Última compilación del índice local">
              {wikiIndex?.uniqueTerms || 0} términos · {wikiIndex?.compiledMs || 1} ms
            </span>
          </div>

          <div className="cc-lm-header-actions">
            <button
              type="button"
              className="cc-btn cc-btn-secondary cc-btn-sm"
              onClick={() => importInputRef.current?.click()}
            >
              <IconUpload size={13} />
              <span>Importar .md / código</span>
            </button>
            <button
              type="button"
              className="cc-btn cc-btn-secondary cc-btn-sm"
              onClick={handleExportMarkdown}
            >
              <IconDownload size={13} />
              <span>Exportar Wiki</span>
            </button>
            <button
              type="button"
              className="cc-btn cc-btn-ghost cc-btn-sm"
              onClick={() => {
                onRecompileIndex?.();
                setStatusMessage('Índice semántico recompilado localmente.');
              }}
              aria-label="Recompilar índice LM Wiki"
              title="Recompilar índice LM Wiki"
            >
              <IconRefresh size={13} />
            </button>
          </div>
        </div>

        {/* Sub-tablist con soporte keyboard selection-follows-focus y borde en ::after */}
        <div
          className="cc-lm-tabs"
          role="tablist"
          aria-label="Secciones del motor LM Wiki"
          {...{ focusgroup: 'tablist nomemory' }}
        >
          {SUBTABS.map((tab, idx) => {
            const isSelected = subTab === tab.id;
            const badge =
              tab.id === 'wiki'
                ? allWikiArticles.length
                : tab.id === 'links'
                  ? suggestedLinks.length
                  : tab.id === 'code'
                    ? wikiIndex?.codeSnippets?.length || 0
                    : `${lint.healthScore}%`;

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                id={`${baseId}-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                className="cc-lm-tab"
                onClick={() => setSubTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                {...(isSelected ? { focusgroupstart: '' } : {})}
              >
                <span>{tab.label}</span>
                <span className="cc-mono-badge">{badge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Región aria-live única y discreta para anuncios de estado */}
      <div className="cc-lm-status-bar" role="status" aria-live="polite">
        {statusMessage && <span>{statusMessage}</span>}
      </div>

      {/* Input oculto para importación múltiple local-first (.md, .txt, código fuente) */}
      <input
        ref={importInputRef}
        type="file"
        multiple
        accept=".md,.markdown,.txt,.js,.jsx,.ts,.tsx,.py,.json,.css,.html,.sh,.sql,.yml,.yaml"
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            const count = await onImportLocalFiles?.(files);
            setStatusMessage(
              `${count || files.length} archivo(s) importados, indexados y auto-enlazados.`
            );
          }
          e.target.value = '';
        }}
      />

      {/* ================================================================= */}
      {/* SUB-VISTA 1: WIKI & SÍNTESIS AUTO-COMPILADA                       */}
      {/* ================================================================= */}
      {subTab === 'wiki' && (
        <div
          className="cc-lm-panel"
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-wiki`}
        >
          <form className="cc-lm-search-form" onSubmit={handleSynthesize}>
            <label htmlFor={`${baseId}-wiki-query`} className="keep-sr-only">
              Buscar en tu LM Wiki o sintetizar un tema nuevo
            </label>
            <div className="cc-lm-search-box">
              <IconSearch size={14} />
              <input
                id={`${baseId}-wiki-query`}
                type="search"
                value={wikiQuery}
                onChange={(e) => setWikiQuery(e.target.value)}
                placeholder="Buscar conceptos, código o preguntar para sintetizar un artículo wiki..."
              />
            </div>
            <button
              type="submit"
              className="cc-btn cc-btn-primary cc-btn-sm"
              disabled={synthesizing || !wikiQuery.trim()}
            >
              <IconAgent size={13} />
              <span>{synthesizing ? 'Sintetizando...' : 'Sintetizar artículo LM'}</span>
            </button>
          </form>

          <div className="cc-lm-split">
            {/* Lista izquierda: Conceptos auto-compilados + hits BM25 */}
            <div className="cc-lm-list-pane">
              {wikiQuery.trim() && searchResults.notes.length > 0 && (
                <div className="cc-lm-list-group">
                  <div className="cc-lm-group-head">
                    <span>COINCIDENCIAS BM25 EN NOTAS</span>
                    <span className="cc-mono-badge">{searchResults.notes.length}</span>
                  </div>
                  <ul className="cc-lm-card-list">
                    {searchResults.notes.slice(0, 6).map((hit) => (
                      <li key={hit.item.id}>
                        <button
                          type="button"
                          className="cc-lm-item-btn"
                          onClick={() => onOpenItem?.(hit.item)}
                        >
                          <div className="cc-lm-item-top">
                            <span className="cc-lm-item-title">{getFileDisplayName(hit.item)}</span>
                            <span className="cc-mono-tag">BM25 {hit.score.toFixed(1)}</span>
                          </div>
                          {hit.excerpt && <p className="cc-lm-item-excerpt">{hit.excerpt}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="cc-lm-list-group">
                <div className="cc-lm-group-head">
                  <span>PÁGINAS WIKI AUTO-COMPILADAS</span>
                  <span className="cc-mono-badge">{allWikiArticles.length}</span>
                </div>

                {allWikiArticles.length === 0 ? (
                  <p className="cc-muted-note">
                    Escribe o importa al menos 2 notas relacionadas para generar páginas wiki automáticamente.
                  </p>
                ) : (
                  <ul className="cc-lm-card-list">
                    {allWikiArticles.map((art) => {
                      const isCurrent = activeArticle?.id === art.id;
                      return (
                        <li key={art.id}>
                          <button
                            type="button"
                            className={`cc-lm-item-btn ${isCurrent ? 'is-selected' : ''}`}
                            onClick={() => setSelectedArticleId(art.id)}
                          >
                            <div className="cc-lm-item-top">
                              <span className="cc-lm-item-title">{art.title}</span>
                              <span
                                className={`cc-mono-tag ${
                                  art.kind === 'synthesis'
                                    ? 'tone-violet'
                                    : art.isCrossCategory
                                      ? 'tone-cyan'
                                      : ''
                                }`}
                              >
                                {art.kind === 'synthesis' ? 'LM' : `${art.sourceCount} src`}
                              </span>
                            </div>
                            <div className="cc-lm-item-meta">
                              <span>{(art.categories || []).slice(0, 2).join(' · ')}</span>
                              {art.snippetCount > 0 && <span>· {art.snippetCount} código</span>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Panel derecho: Artículo Wiki renderizado con acciones */}
            <div className="cc-lm-reader-pane">
              {!activeArticle ? (
                <div className="cc-empty-studio">
                  <h3>Tu LM Wiki está listo</h3>
                  <p>
                    Selecciona un concepto auto-compilado a la izquierda o escribe una pregunta arriba para sintetizar un nuevo artículo wiki.
                  </p>
                </div>
              ) : (
                <>
                  <div className="cc-lm-reader-bar">
                    <div className="cc-lm-reader-meta">
                      <span className="cc-mono-badge">
                        {activeArticle.engine || 'Auto-Compilado Local'}
                      </span>
                      <span>{activeArticle.sourceCount || 0} fuentes enlazadas</span>
                    </div>

                    <div className="cc-lm-reader-actions">
                      <button
                        type="button"
                        className="cc-btn cc-btn-ghost cc-btn-sm"
                        onClick={() => handleSynthesize(null, activeArticle.concept || activeArticle.topic || activeArticle.title)}
                        disabled={synthesizing}
                      >
                        <IconRefresh size={12} />
                        <span>Recompilar</span>
                      </button>

                      <button
                        type="button"
                        className="cc-btn cc-btn-secondary cc-btn-sm"
                        onClick={() => handleCopyText(activeArticle.id, activeArticle.markdown)}
                      >
                        {copiedId === activeArticle.id ? 'Copiado' : 'Copiar .md'}
                      </button>

                      <button
                        type="button"
                        className="cc-btn cc-btn-approve cc-btn-sm"
                        onClick={async () => {
                          await onPromoteArticleToVault?.(activeArticle);
                          setStatusMessage(`«${activeArticle.title}» guardado como nota permanente en la bóveda.`);
                        }}
                      >
                        <IconCheck size={12} />
                        <span>Promover a Bóveda (.md)</span>
                      </button>
                    </div>
                  </div>

                  <div className="cc-lm-reader-scroll">
                    <MarkdownVaultView
                      markdown={activeArticle.markdown}
                      allItems={allItems}
                      onOpenItem={onOpenItem}
                      onCreateMissingNote={onCreateMissingNote}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VISTA 2: AUTO-ENLAZADO SEMÁNTICO                              */}
      {/* ================================================================= */}
      {subTab === 'links' && (
        <div
          className="cc-lm-panel cc-lm-scroll-panel"
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-links`}
        >
          <div className="cc-lm-section-banner">
            <div>
              <h3 className="cc-lm-section-title">Motor de Auto-Enlazado Semántico (TF-IDF + Coseno)</h3>
              <p className="cc-muted-note">
                Detecta notas y fragmentos de código que comparten conceptos clave pero aún no están conectados con <code>[[WikiLinks]]</code>.
              </p>
            </div>
            {suggestedLinks.length > 0 && (
              <button
                type="button"
                className="cc-btn cc-btn-approve cc-btn-sm"
                onClick={async () => {
                  const applied = await onApplyBatchAutoLinks?.(suggestedLinks.slice(0, 5));
                  setStatusMessage(`${applied || 0} conexiones [[WikiLink]] inyectadas automáticamente.`);
                }}
              >
                <IconLink size={13} />
                <span>Auto-enlazar Top {Math.min(5, suggestedLinks.length)}</span>
              </button>
            )}
          </div>

          {suggestedLinks.length === 0 ? (
            <div className="cc-lm-empty-box">
              <p>Tu bóveda está muy bien conectada: no hay pares sin enlazar por encima del umbral actual ({Math.round((lmConfig?.autoLinkThreshold || 0.24) * 100)}%).</p>
            </div>
          ) : (
            <ul className="cc-lm-links-grid">
              {suggestedLinks.map((sug) => (
                <li key={sug.id} className="cc-lm-link-card">
                  <div className="cc-lm-link-top">
                    <span className={`cc-state-badge ${sug.crossCategory ? 'tone-cyan' : 'tone-violet'}`}>
                      {sug.confidencePct}% · {sug.crossCategory ? 'Puente entre categorías' : 'Misma categoría'}
                    </span>
                    <button
                      type="button"
                      className="cc-btn cc-btn-primary cc-btn-sm"
                      onClick={async () => {
                        await onApplyAutoLink?.(sug);
                        setStatusMessage(`Enlace [[${sug.target.title}]] inyectado en «${sug.source.title}».`);
                      }}
                    >
                      <IconLink size={12} />
                      <span>Insertar [[WikiLink]]</span>
                    </button>
                  </div>

                  <div className="cc-lm-link-pair">
                    <button
                      type="button"
                      className="cc-lm-node-pill"
                      onClick={() => onOpenItem?.(sug.source)}
                    >
                      {sug.source.title}
                    </button>
                    <span className="cc-lm-arrow" aria-hidden="true">↔</span>
                    <button
                      type="button"
                      className="cc-lm-node-pill"
                      onClick={() => onOpenItem?.(sug.target)}
                    >
                      {sug.target.title}
                    </button>
                  </div>

                  <div className="cc-lm-shared-terms">
                    <span>Conceptos compartidos:</span>
                    {sug.sharedTerms.map((term) => (
                      <code key={term}>{term}</code>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VISTA 3: ÍNDICE DE FRAGMENTOS DE CÓDIGO                       */}
      {/* ================================================================= */}
      {subTab === 'code' && (
        <div
          className="cc-lm-panel cc-lm-scroll-panel"
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-code`}
        >
          <div className="cc-lm-section-banner">
            <div>
              <h3 className="cc-lm-section-title">Índice Automático de Código y Símbolos</h3>
              <p className="cc-muted-note">
                Extrae bloques <code>```código```</code>, funciones y clases de toda tu bóveda para reutilizarlos sin buscar archivo por archivo.
              </p>
            </div>
            <button
              type="button"
              className="cc-btn cc-btn-primary cc-btn-sm"
              onClick={() => setShowCodeCapture((v) => !v)}
              aria-expanded={showCodeCapture}
            >
              <IconPlus size={13} />
              <span>{showCodeCapture ? 'Ocultar captura' : 'Capturar fragmento'}</span>
            </button>
          </div>

          {showCodeCapture && (
            <form className="cc-lm-code-capture" onSubmit={handleSubmitCodeCapture}>
              <div className="cc-lm-code-capture-row">
                <div className="cc-form-field">
                  <label htmlFor={`${baseId}-code-title`}>Título del fragmento</label>
                  <input
                    id={`${baseId}-code-title`}
                    type="text"
                    className="keep-input"
                    value={codeTitle}
                    onChange={(e) => setCodeTitle(e.target.value)}
                    placeholder="Ej: Helper SSE con AbortSignal.timeout"
                    required
                  />
                </div>
                <div className="cc-form-field">
                  <label htmlFor={`${baseId}-code-lang`}>Lenguaje</label>
                  <select
                    id={`${baseId}-code-lang`}
                    className="keep-input"
                    value={codeLang}
                    onChange={(e) => setCodeLang(e.target.value)}
                  >
                    {CODE_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cc-form-field">
                <label htmlFor={`${baseId}-code-body`}>Código fuente</label>
                <textarea
                  id={`${baseId}-code-body`}
                  className="cc-lm-code-textarea"
                  value={codeBody}
                  onChange={(e) => setCodeBody(e.target.value)}
                  placeholder="Pega aquí tu función, comando o configuración..."
                  rows={5}
                  required
                />
              </div>

              <div className="cc-form-actions">
                <button
                  type="button"
                  className="cc-btn cc-btn-secondary cc-btn-sm"
                  onClick={() => setShowCodeCapture(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="cc-btn cc-btn-primary cc-btn-sm">
                  <IconCode size={13} />
                  <span>Guardar e indexar</span>
                </button>
              </div>
            </form>
          )}

          {/* Filtro por lenguaje */}
          <div className="cc-lm-lang-bar" role="group" aria-label="Filtrar fragmentos por lenguaje">
            <button
              type="button"
              className={`cc-filter-chip ${selectedLang === 'all' ? 'is-active' : ''}`}
              onClick={() => setSelectedLang('all')}
            >
              Todos ({wikiIndex?.codeSnippets?.length || 0})
            </button>
            {availableLanguages.map((lang) => (
              <button
                key={lang}
                type="button"
                className={`cc-filter-chip ${selectedLang === lang ? 'is-active' : ''}`}
                onClick={() => setSelectedLang(lang)}
              >
                {lang} ({(wikiIndex?.snippetsByLang?.[lang] || []).length})
              </button>
            ))}
          </div>

          {filteredSnippets.length === 0 ? (
            <div className="cc-lm-empty-box">
              <p>
                Aún no hay bloques de código indexados con ese filtro. Usa <strong>Capturar fragmento</strong> o importa archivos <code>.js</code>, <code>.py</code>, <code>.ts</code> o <code>.sh</code>.
              </p>
            </div>
          ) : (
            <div className="cc-lm-snippets-list">
              {filteredSnippets.map((snip) => {
                const srcItem = allItems.find((it) => it.id === snip.sourceId);
                return (
                  <article key={snip.id} className="cc-lm-snippet-card">
                    <div className="cc-lm-snippet-head">
                      <div className="cc-lm-snippet-meta">
                        <span className="cc-mono-badge">{snip.lang}</span>
                        <strong>{snip.heading || snip.sourceTitle}</strong>
                        <span className="cc-muted-note">{snip.lineCount} líneas</span>
                      </div>
                      <div className="cc-lm-snippet-actions">
                        <button
                          type="button"
                          className="cc-btn cc-btn-ghost cc-btn-sm"
                          onClick={() => handleCopyText(snip.id, snip.code)}
                        >
                          {copiedId === snip.id ? 'Copiado' : 'Copiar'}
                        </button>
                        {srcItem && (
                          <button
                            type="button"
                            className="cc-btn cc-btn-secondary cc-btn-sm"
                            onClick={() => onOpenItem?.(srcItem)}
                          >
                            Abrir nota →
                          </button>
                        )}
                      </div>
                    </div>

                    {snip.symbols.length > 0 && (
                      <div className="cc-lm-shared-terms">
                        <span>Símbolos:</span>
                        {snip.symbols.map((sym) => (
                          <code key={sym}>{sym}</code>
                        ))}
                      </div>
                    )}

                    <pre className="obsidian-code-block cc-lm-code-pre">
                      <code>{snip.code}</code>
                    </pre>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VISTA 4: LOCAL-FIRST, LINT & MOTOR LM                         */}
      {/* ================================================================= */}
      {subTab === 'local' && (
        <div
          className="cc-lm-panel cc-lm-scroll-panel"
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-local`}
        >
          <div className="cc-lm-local-grid">
            {/* Tarjeta 1: Almacenamiento Local-First & Portabilidad */}
            <section className="cc-lm-card">
              <div className="cc-lm-card-head">
                <IconDatabase size={15} />
                <h3>Persistencia Local-First</h3>
              </div>
              <dl className="cc-lm-kv-list">
                <div>
                  <dt>Motor local</dt>
                  <dd>{storageTelemetry?.engine || 'IndexedDB + Firestore Cache'}</dd>
                </div>
                <div>
                  <dt>Estado red</dt>
                  <dd>{isOnline ? 'En línea (sincronización activa)' : 'Offline (operando en local)'}</dd>
                </div>
                <div>
                  <dt>Espacio usado</dt>
                  <dd>
                    {formatBytes(storageTelemetry?.usageBytes)} / {formatBytes(storageTelemetry?.quotaBytes)}
                  </dd>
                </div>
                <div>
                  <dt>Índice compilado</dt>
                  <dd>
                    {wikiIndex?.docCount || 0} documentos · {wikiIndex?.uniqueTerms || 0} términos ({wikiIndex?.compiledMs || 1} ms)
                  </dd>
                </div>
              </dl>

              <div className="cc-lm-btn-row">
                <button
                  type="button"
                  className="cc-btn cc-btn-primary cc-btn-sm"
                  onClick={() => importInputRef.current?.click()}
                >
                  <IconUpload size={13} />
                  <span>Importar archivos</span>
                </button>
                <button
                  type="button"
                  className="cc-btn cc-btn-secondary cc-btn-sm"
                  onClick={handleExportMarkdown}
                >
                  <IconDownload size={13} />
                  <span>Exportar .md</span>
                </button>
                <button
                  type="button"
                  className="cc-btn cc-btn-secondary cc-btn-sm"
                  onClick={handleExportJson}
                >
                  <IconDownload size={13} />
                  <span>Backup .json</span>
                </button>
              </div>
            </section>

            {/* Tarjeta 2: Configuración del Motor LM */}
            <section className="cc-lm-card">
              <div className="cc-lm-card-head">
                <IconAgent size={15} />
                <h3>Motor de Síntesis LM</h3>
              </div>

              <form className="cc-new-note-form" onSubmit={handleSaveConfigSubmit}>
                <div className="cc-form-field">
                  <label htmlFor={`${baseId}-lm-provider`}>Proveedor de síntesis</label>
                  <select
                    id={`${baseId}-lm-provider`}
                    className="keep-input"
                    value={cfgDraft.provider}
                    onChange={(e) => setCfgDraft((p) => ({ ...p, provider: e.target.value }))}
                  >
                    <option value="local">Local-First Determinista (BM25 · 100% Offline)</option>
                    <option value="ollama">Ollama / Servidor Local OpenAI-Compatible (ej. M2)</option>
                    <option value="gemini">Gemini API (nube, fallback local automático)</option>
                  </select>
                </div>

                {cfgDraft.provider === 'ollama' && (
                  <>
                    <div className="cc-form-field">
                      <label htmlFor={`${baseId}-lm-endpoint`}>Endpoint Chat Completions</label>
                      <input
                        id={`${baseId}-lm-endpoint`}
                        type="url"
                        className="keep-input"
                        value={cfgDraft.endpoint}
                        onChange={(e) => setCfgDraft((p) => ({ ...p, endpoint: e.target.value }))}
                        placeholder="http://192.168.1.75:11434/v1/chat/completions"
                      />
                    </div>
                    <div className="cc-form-field">
                      <label htmlFor={`${baseId}-lm-model`}>Modelo local</label>
                      <input
                        id={`${baseId}-lm-model`}
                        type="text"
                        className="keep-input"
                        value={cfgDraft.model}
                        onChange={(e) => setCfgDraft((p) => ({ ...p, model: e.target.value }))}
                        placeholder="qwen2.5:7b"
                      />
                    </div>
                  </>
                )}

                <div className="cc-form-field">
                  <label htmlFor={`${baseId}-lm-threshold`}>
                    Umbral de auto-enlazado: {Math.round((cfgDraft.autoLinkThreshold || 0.24) * 100)}%
                  </label>
                  <input
                    id={`${baseId}-lm-threshold`}
                    type="range"
                    min="0.04"
                    max="0.35"
                    step="0.01"
                    value={cfgDraft.autoLinkThreshold}
                    onChange={(e) =>
                      setCfgDraft((p) => ({
                        ...p,
                        autoLinkThreshold: Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="cc-form-actions">
                  <button type="submit" className="cc-btn cc-btn-primary cc-btn-sm">
                    Guardar motor LM
                  </button>
                </div>
              </form>
            </section>
          </div>

          {/* Tarjeta 3: Auditoría Lint (Salud del Grafo & Enlaces Rotos) */}
          <section className="cc-lm-card">
            <div className="cc-lm-card-head">
              <IconCheck size={15} />
              <h3>Auditoría Lint de la Wiki · Salud {lint.healthScore}/100</h3>
            </div>

            <div className="cc-lm-lint-cols">
              <div>
                <h4 className="cc-lm-subhead">
                  Enlaces rotos / fantasmas ({lint.brokenLinks.length})
                </h4>
                {lint.brokenLinks.length === 0 ? (
                  <p className="cc-muted-note">Sin enlaces rotos.</p>
                ) : (
                  <ul className="cc-lm-lint-list">
                    {lint.brokenLinks.slice(0, 8).map((brk) => (
                      <li key={brk.target}>
                        <span>
                          <code>[[{brk.target}]]</code>{' '}
                          <small>({brk.referencedBy.length} ref)</small>
                        </span>
                        <button
                          type="button"
                          className="cc-btn cc-btn-secondary cc-btn-sm"
                          onClick={() => onCreateMissingNote?.(brk.target)}
                        >
                          + Crear .md
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="cc-lm-subhead">Nodos huérfanos ({lint.orphans.length})</h4>
                {lint.orphans.length === 0 ? (
                  <p className="cc-muted-note">Todos los nodos tienen al menos una conexión.</p>
                ) : (
                  <ul className="cc-lm-lint-list">
                    {lint.orphans.slice(0, 8).map((orp) => (
                      <li key={orp.id}>
                        <button
                          type="button"
                          className="cc-lm-node-pill"
                          onClick={() => onOpenItem?.(orp)}
                        >
                          {orp.title}
                        </button>
                        <small>{orp.category}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Tarjeta 4: Registro Cronológico (log.md) */}
          <section className="cc-lm-card">
            <div className="cc-lm-card-head">
              <IconWiki size={15} />
              <h3>Registro Cronológico LM Wiki (`log.md`)</h3>
            </div>
            {wikiLog.length === 0 ? (
              <p className="cc-muted-note">
                Las síntesis, importaciones y auto-enlaces quedarán registrados aquí localmente.
              </p>
            ) : (
              <ul className="cc-lm-log-list">
                {wikiLog.slice(0, 20).map((entry) => (
                  <li key={entry.id}>
                    <span className="cc-mono-badge">{entry.action || 'WIKI'}</span>
                    <span className="cc-lm-log-ts">
                      {new Date(entry.ts).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>{entry.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
