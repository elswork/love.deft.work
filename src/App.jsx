import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from './firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import './index.css';
import LightDismissDialog from './components/LightDismissDialog';
import ShareModal from './components/ShareModal';
import ConnectionsGraph from './components/ConnectionsGraph';
import MarkdownVaultView from './components/MarkdownVaultView';
import EnrichmentService from './services/EnrichmentService';
import AttachmentService from './services/AttachmentService';
import {
  getFileDisplayName,
  getFileBadge,
  extractWikiLinks,
  resolveWikiTarget,
  buildInitialMarkdown,
  computeVaultConnections,
} from './services/MarkdownVaultService';
import { KEEP_COLORS, getColorConfig, getCategoryIcon } from './data/keep_palette';
import { AuthProvider, useAuth } from './context/AuthContext';

function useVaultData() {
  const [items, setItems] = useState([]);
  const [categoriesDocs, setCategoriesDocs] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'discoveries'), orderBy('createdAt', 'desc'));
    const unsubItems = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) =>
          EnrichmentService.normalizeDiscoveryDoc({ id: d.id, ...d.data() })
        );
        setItems(docs);
        setLoading(false);
      },
      (err) => {
        console.warn('[Vault] Error escuchando discoveries:', err);
        setLoading(false);
      }
    );

    const unsubCats = onSnapshot(
      collection(db, 'categories'),
      (snapshot) => {
        const map = {};
        snapshot.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setCategoriesDocs(map);
      },
      (err) => {
        console.warn('[Vault] Error escuchando categories:', err);
      }
    );

    return () => {
      unsubItems();
      unsubCats();
    };
  }, []);

  return { items, setItems, categoriesDocs, setCategoriesDocs, loading };
}

function ObsidianVaultBoard() {
  const { user, loginWithGoogle, logout } = useAuth();
  const { items, setItems, categoriesDocs, setCategoriesDocs, loading } = useVaultData();

  const [renderedScheme, setRenderedScheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const meta = document.querySelector('meta[name="color-scheme"]')?.content;
    if (meta === 'dark' || meta === 'light') return meta;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Navegación estilo Obsidian
  const [activeItemId, setActiveItemId] = useState('');
  const [editorMode, setEditorMode] = useState('split'); // 'read' | 'edit' | 'split'
  const [viewMode, setViewMode] = useState('vault'); // 'vault' | 'graph'
  const [searchQuery, setSearchQuery] = useState('');
  const [fileKindFilter, setFileKindFilter] = useState('all'); // 'all' | 'markdown' | 'media' | 'link' | 'relation'
  const [collapsedCats, setCollapsedCats] = useState({});

  // Borrador del editor Markdown activo
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Autocompletado [[WikiLink]] en el editor
  const [wikiSuggestQuery, setWikiSuggestQuery] = useState('');
  const [showWikiSuggest, setShowWikiSuggest] = useState(false);
  const editorTextareaRef = useRef(null);

  // Subida rápida de archivos
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const quickFileInputRef = useRef(null);
  const attachFileInputRef = useRef(null);

  // Panel de nueva relación-elemento
  const [relTargetId, setRelTargetId] = useState('');
  const [relLabel, setRelLabel] = useState('conecta con');

  // Modales
  const [shareTarget, setShareTarget] = useState(null);
  const [newNoteModalOpen, setNewNoteModalOpen] = useState(false);
  const [newNoteForm, setNewNoteForm] = useState({
    title: '',
    category: 'Anticitera',
    url: '',
    isPublic: true,
  });
  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false);
  const [newCatForm, setNewCatForm] = useState({
    name: '',
    icon: '📁',
    colorKey: 'emerald',
    note: '',
    isPublic: true,
  });

  // Drag & Drop entre listas
  const [dragItemId, setDragItemId] = useState('');
  const searchInputRef = useRef(null);

  // Tema claro/oscuro sincronizado
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const syncScheme = () => {
      let stored = null;
      try {
        stored = localStorage.getItem('color-scheme');
      } catch (err) {
        void err;
      }
      if (stored === 'dark' || stored === 'light') {
        setRenderedScheme(stored);
      } else {
        setRenderedScheme(mql.matches ? 'dark' : 'light');
      }
    };
    mql.addEventListener('change', syncScheme);
    window.addEventListener('storage', syncScheme);
    return () => {
      mql.removeEventListener('change', syncScheme);
      window.removeEventListener('storage', syncScheme);
    };
  }, []);

  const toggleColorScheme = () => {
    const systemScheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    const target = renderedScheme === 'dark' ? 'light' : 'dark';
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (target === systemScheme) {
      try {
        localStorage.removeItem('color-scheme');
      } catch (err) {
        void err;
      }
      if (meta) meta.content = 'light dark';
    } else {
      try {
        localStorage.setItem('color-scheme', target);
      } catch (err) {
        void err;
      }
      if (meta) meta.content = target;
    }
    setRenderedScheme(target);
  };

  // Atajos de teclado Ctrl+K / '/' para buscar, Ctrl+S para guardar
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Filtrado por visibilidad (público / propietario / colaborador)
  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (it.isPublic !== false) return true;
      if (!user) return false;
      if (user.email === 'elswork@gmail.com') return true;
      if (it.ownerUid && it.ownerUid === user.uid) return true;
      if (it.ownerEmail && it.ownerEmail === user.email) return true;
      if (Array.isArray(it.sharedWith) && it.sharedWith.includes(user.email)) return true;
      return false;
    });
  }, [items, user]);

  const itemsById = useMemo(
    () => Object.fromEntries(visibleItems.map((it) => [it.id, it])),
    [visibleItems]
  );

  // Deep-link inicial (?item=... o ?cat=...) o seleccionar primer archivo
  useEffect(() => {
    if (visibleItems.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const itemParam = params.get('item');
    if (itemParam && itemsById[itemParam]) {
      setActiveItemId(itemParam);
      return;
    }
    if (!activeItemId || !itemsById[activeItemId]) {
      const preferred = visibleItems.find((it) => it.pinned) || visibleItems[0];
      if (preferred) setActiveItemId(preferred.id);
    }
  }, [visibleItems, itemsById, activeItemId]);

  const activeItem = itemsById[activeItemId] || null;

  // Sincronizar borrador al cambiar de archivo activo
  useEffect(() => {
    if (!activeItem) {
      setDraftTitle('');
      setDraftMarkdown('');
      setDraftUrl('');
      setDirty(false);
      return;
    }
    setDraftTitle(activeItem.title || '');
    setDraftMarkdown(buildInitialMarkdown(activeItem, itemsById));
    setDraftUrl(activeItem.url || '');
    setDirty(false);
    setShowWikiSuggest(false);
    setUploadError('');
  }, [activeItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrado de archivos por búsqueda y tipo
  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleItems.filter((it) => {
      const badge = getFileBadge(it);
      if (fileKindFilter === 'markdown' && badge.kind !== 'markdown') return false;
      if (
        fileKindFilter === 'media' &&
        !['image', 'pdf', 'video', 'audio'].includes(badge.kind)
      ) {
        return false;
      }
      if (fileKindFilter === 'link' && badge.kind !== 'link') return false;
      if (fileKindFilter === 'relation' && badge.kind !== 'relation') return false;

      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        getFileDisplayName(it).toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        (it.note && it.note.toLowerCase().includes(q)) ||
        (it.markdownContent && it.markdownContent.toLowerCase().includes(q))
      );
    });
  }, [visibleItems, searchQuery, fileKindFilter]);

  // Construcción de Categorías como Listas de Archivos (todos los tipos)
  const categoryLists = useMemo(() => {
    const map = new Map();

    const ensureCat = (name) => {
      if (!map.has(name)) {
        const meta = categoriesDocs[name] || {};
        const color = getColorConfig(meta.colorKey || name);
        map.set(name, {
          name,
          icon: meta.icon || getCategoryIcon(name),
          colorKey: color.key,
          accent: color.accent,
          note: meta.note || '',
          pinned: Boolean(meta.pinned),
          order: typeof meta.order === 'number' ? meta.order : 0,
          isPublic: meta.isPublic !== undefined ? Boolean(meta.isPublic) : true,
          sharedWith: Array.isArray(meta.sharedWith) ? meta.sharedWith : [],
          files: [],
        });
      }
      return map.get(name);
    };

    Object.keys(categoriesDocs).forEach((catName) => ensureCat(catName));

    filteredFiles.forEach((it) => {
      const primary = ensureCat(it.category || 'General');
      primary.files.push({ item: it, isCrossRef: false });

      (it.extraCategories || []).forEach((xCat) => {
        if (xCat && xCat !== it.category) {
          ensureCat(xCat).files.push({ item: it, isCrossRef: true });
        }
      });
    });

    const list = Array.from(map.values()).filter((cat) => {
      if (cat.isPublic !== false) return true;
      if (!user) return false;
      if (user.email === 'elswork@gmail.com') return true;
      if (categoriesDocs[cat.name]?.ownerUid === user.uid) return true;
      if (cat.sharedWith.includes(user.email)) return true;
      return false;
    });

    list.forEach((cat) => {
      cat.files.sort((a, b) => {
        if (a.item.pinned !== b.item.pinned) return a.item.pinned ? -1 : 1;
        return a.item.title.localeCompare(b.item.title, 'es');
      });
    });

    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (b.order !== a.order) return b.order - a.order;
      return b.files.length - a.files.length;
    });

    return list;
  }, [filteredFiles, categoriesDocs, user]);

  // Conexiones (salientes, backlinks, relaciones reificadas) del archivo activo
  const activeConnections = useMemo(
    () => computeVaultConnections(activeItem, visibleItems),
    [activeItem, visibleItems]
  );

  // Total de conexiones en la bóveda
  const totalConnectionsCount = useMemo(() => {
    let count = 0;
    visibleItems.forEach((it) => {
      const wikis = extractWikiLinks(it.markdownContent || '');
      count += wikis.length + (it.relatedIds?.length || 0);
    });
    return count;
  }, [visibleItems]);

  // Mutaciones Firestore
  const mutateItem = async (id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    if (!user) return;
    try {
      await updateDoc(doc(db, 'discoveries', id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[Vault] Error actualizando archivo:', err);
    }
  };

  const mutateCategory = async (catName, patch) => {
    setCategoriesDocs((prev) => ({
      ...prev,
      [catName]: { ...(prev[catName] || { name: catName }), ...patch },
    }));
    if (!user) return;
    try {
      await setDoc(
        doc(db, 'categories', catName),
        {
          name: catName,
          ownerUid: categoriesDocs[catName]?.ownerUid || user.uid,
          ownerEmail: categoriesDocs[catName]?.ownerEmail || user.email || '',
          ...patch,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[Vault] Error actualizando categoría:', err);
    }
  };

  // Guardar cambios del editor Markdown activo
  const handleSaveActiveDraft = async () => {
    if (!activeItem || !user || savingDraft) return;
    setSavingDraft(true);
    try {
      const wikis = extractWikiLinks(draftMarkdown);
      const wikiIds = wikis
        .map((w) => resolveWikiTarget(w.target, visibleItems)?.id)
        .filter((id) => id && id !== activeItem.id);
      const mergedRelatedIds = Array.from(
        new Set([...(activeItem.relatedIds || []), ...wikiIds])
      );

      const firstParagraph =
        draftMarkdown
          .split('\n')
          .find((l) => l.trim() && !l.trim().startsWith('#')) || '';

      await mutateItem(activeItem.id, {
        title: draftTitle.trim() || activeItem.title,
        name: draftTitle.trim() || activeItem.title,
        url: draftUrl.trim(),
        domain: draftUrl.trim() ? EnrichmentService.extractDomain(draftUrl.trim()) : '',
        favicon: draftUrl.trim() ? EnrichmentService.getFaviconUrl(draftUrl.trim()) : '',
        markdownContent: draftMarkdown,
        note: firstParagraph.replace(/^[-*>\s]+/, '').slice(0, 140),
        description: firstParagraph.replace(/^[-*>\s]+/, '').slice(0, 140),
        relatedIds: mergedRelatedIds,
      });
      setDirty(false);
    } finally {
      setSavingDraft(false);
    }
  };

  // Crear un nuevo archivo .md en una categoría (o desde un WikiLink inexistente)
  const createMarkdownFile = async ({
    title,
    category = 'Anticitera',
    url = '',
    markdownContent = '',
    kind = 'file',
    sourceId = '',
    targetId = '',
    relationLabel = '',
    attachment = null,
    isPublic = true,
  }) => {
    if (!user) {
      await loginWithGoogle();
      return null;
    }
    const cleanTitle = String(title || 'Nueva nota').trim();
    const initialMd =
      markdownContent ||
      `# ${cleanTitle}\n\nEscribe aquí tu nota en Markdown. Usa \`[[Nombre]]\` para enlazar otros archivos o \`![[archivo]]\` para incrustarlos.\n`;

    const payload = {
      title: cleanTitle,
      name: cleanTitle,
      type: url ? 'link' : 'phrase',
      kind,
      sourceId,
      targetId,
      relationLabel,
      url,
      domain: url ? EnrichmentService.extractDomain(url) : '',
      favicon: url ? EnrichmentService.getFaviconUrl(url) : '',
      attachment,
      markdownContent: initialMd,
      note: '',
      description: '',
      category,
      extraCategories: [],
      relatedIds: [sourceId, targetId].filter(Boolean),
      pinned: false,
      checked: false,
      order: Date.now(),
      clicks: 0,
      colorKey: getColorConfig(category).key,
      isPublic,
      sharedWith: [],
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      createdAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, 'discoveries'), payload);
    setActiveItemId(ref.id);
    setViewMode('vault');
    return ref.id;
  };

  // Subir cualquier tipo de archivo (.md, .png, .pdf, .mp4, etc.) como elemento nuevo o adjunto
  const handleUploadNewFile = async (file, targetCategory = 'Archivo & Notas') => {
    if (!file) return;
    if (!user) {
      await loginWithGoogle();
      return;
    }
    setUploadError('');
    try {
      setUploadProgress(0);
      const uploaded = await AttachmentService.uploadAttachment(
        file,
        user.uid,
        (pct) => setUploadProgress(pct)
      );

      let initialMd = '';
      if (file.name.toLowerCase().endsWith('.md') || file.type === 'text/markdown') {
        initialMd = await file.text();
      } else {
        initialMd = `# ${AttachmentService.cleanFileTitle(file.name)}\n\n![[${file.name}]]\n\n## Notas y conexiones\n`;
      }

      await createMarkdownFile({
        title: file.name.toLowerCase().endsWith('.md')
          ? AttachmentService.cleanFileTitle(file.name)
          : file.name,
        category: targetCategory,
        markdownContent: initialMd,
        attachment: uploaded,
      });
    } catch (err) {
      setUploadError(err?.message || 'Error al subir el archivo.');
    } finally {
      setUploadProgress(null);
    }
  };

  // Adjuntar o reemplazar archivo dentro del elemento actualmente abierto
  const handleAttachToActiveItem = async (file) => {
    if (!file || !activeItem || !user) return;
    setUploadError('');
    try {
      setUploadProgress(0);
      const prevPath = activeItem.attachment?.storagePath;
      const uploaded = await AttachmentService.uploadAttachment(
        file,
        user.uid,
        (pct) => setUploadProgress(pct)
      );
      await mutateItem(activeItem.id, { attachment: uploaded });
      if (prevPath) {
        await AttachmentService.deleteAttachment(prevPath);
      }
    } catch (err) {
      setUploadError(err?.message || 'Error al adjuntar el fichero.');
    } finally {
      setUploadProgress(null);
    }
  };

  // Crear Relación-Elemento (.md reificado entre activo y destino)
  const handleCreateRelationElement = async (e) => {
    e.preventDefault();
    if (!activeItem || !relTargetId || !user) return;
    const target = itemsById[relTargetId];
    if (!target) return;

    const label = relLabel.trim() || 'conecta con';
    const relTitle = `${activeItem.title} — ${label} → ${target.title}`;
    const relMd = [
      `# Relación: ${activeItem.title} ↔ ${target.title}`,
      '',
      `> **Tipo de relación**: \`${label}\``,
      '',
      `- **Origen**: [[${activeItem.title}]]`,
      `- **Destino**: [[${target.title}]]`,
      '',
      '## Análisis de la conexión',
      `Explica aquí por qué **[[${activeItem.title}]]** *${label}* **[[${target.title}]]** y adjunta evidencias si es necesario.`,
      '',
    ].join('\n');

    await createMarkdownFile({
      title: relTitle,
      category: activeItem.category,
      markdownContent: relMd,
      kind: 'relation',
      sourceId: activeItem.id,
      targetId: target.id,
      relationLabel: label,
    });
    setRelTargetId('');
  };

  const handleDeleteItem = async (it) => {
    if (!user || !it) return;
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    if (activeItemId === it.id) setActiveItemId('');
    try {
      await deleteDoc(doc(db, 'discoveries', it.id));
      if (it.attachment?.storagePath) {
        await AttachmentService.deleteAttachment(it.attachment.storagePath);
      }
    } catch (err) {
      console.error('[Vault] Error al eliminar:', err);
    }
  };

  // Autocompletado [[ en el editor Markdown
  const handleEditorChange = (val) => {
    setDraftMarkdown(val);
    setDirty(true);
    const ta = editorTextareaRef.current;
    const pos = ta ? ta.selectionStart : val.length;
    const slice = val.slice(0, pos);
    const match = slice.match(/\[\[([^\]\n]*)$/);
    if (match) {
      setWikiSuggestQuery(match[1]);
      setShowWikiSuggest(true);
    } else {
      setShowWikiSuggest(false);
    }
  };

  const insertWikiSuggestion = (targetItem, asEmbed = false) => {
    const ta = editorTextareaRef.current;
    const token = asEmbed
      ? `![[${targetItem.attachment?.name || targetItem.title}]]`
      : `[[${targetItem.title}]]`;

    if (!ta) {
      setDraftMarkdown((prev) => `${prev}\n${token}`);
      setDirty(true);
      setShowWikiSuggest(false);
      return;
    }

    const pos = ta.selectionStart;
    const before = draftMarkdown.slice(0, pos);
    const after = draftMarkdown.slice(pos);
    const replacedBefore = before.replace(/\[\[([^\]\n]*)$/, token);
    const nextVal = replacedBefore + after;
    setDraftMarkdown(nextVal);
    setDirty(true);
    setShowWikiSuggest(false);
    requestAnimationFrame(() => ta.focus());
  };

  const wikiSuggestions = useMemo(() => {
    const q = wikiSuggestQuery.trim().toLowerCase();
    return visibleItems
      .filter((it) => it.id !== activeItemId)
      .filter(
        (it) =>
          !q ||
          it.title.toLowerCase().includes(q) ||
          getFileDisplayName(it).toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [visibleItems, wikiSuggestQuery, activeItemId]);

  const openVaultItem = (it) => {
    if (!it) return;
    setActiveItemId(it.id);
    setViewMode('vault');
    if (user) {
      updateDoc(doc(db, 'discoveries', it.id), { clicks: increment(1) }).catch((e) => void e);
    }
  };

  const activeBadge = activeItem ? getFileBadge(activeItem) : null;

  return (
    <div className="obsidian-app">
      {/* =================================================================
          HEADER DE BÓVEDA OBSIDIAN
      ================================================================= */}
      <header className="obsidian-topbar">
        <div className="obsidian-brand-group">
          <div className="obsidian-logo-mark" aria-hidden="true">
            ◈
          </div>
          <div>
            <div className="obsidian-brand-row">
              <h1 className="obsidian-brand-title">love.deft.work</h1>
              <span className="obsidian-vault-pill">Bóveda Obsidian</span>
            </div>
            <p className="obsidian-brand-sub">
              {visibleItems.length} archivos · {totalConnectionsCount} enlaces ·{' '}
              {categoryLists.length} listas
            </p>
          </div>
        </div>

        <search className="obsidian-search-wrap">
          <span className="obsidian-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar archivos, .md, etiquetas… (Ctrl+K)"
            className="obsidian-search-input"
            aria-label="Buscar archivos en la bóveda"
          />
          {searchQuery && (
            <button
              type="button"
              className="keep-icon-btn-sm"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </search>

        <div className="obsidian-topbar-actions">
          <div className="obsidian-segmented" role="group" aria-label="Vista principal">
            <button
              type="button"
              className={`obsidian-seg-btn ${viewMode === 'vault' ? 'active' : ''}`}
              onClick={() => setViewMode('vault')}
            >
              📂 Bóveda
            </button>
            <button
              type="button"
              className={`obsidian-seg-btn ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
            >
              🕸️ Grafo
            </button>
          </div>

          <button
            type="button"
            className="keep-btn keep-btn-primary"
            onClick={() => {
              setNewNoteForm((f) => ({
                ...f,
                category: activeItem?.category || categoryLists[0]?.name || 'Anticitera',
              }));
              setNewNoteModalOpen(true);
            }}
          >
            + Nuevo .md
          </button>

          <label
            htmlFor="vault-quick-upload"
            className="keep-btn keep-btn-soft obsidian-upload-btn"
            title="Subir .md, .png, .pdf, .mp4, .svg…"
          >
            📎 Subir archivo
            <input
              ref={quickFileInputRef}
              id="vault-quick-upload"
              type="file"
              className="keep-sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleUploadNewFile(
                    file,
                    activeItem?.category || 'Archivo & Notas'
                  );
                }
                e.target.value = '';
              }}
            />
          </label>

          <button
            type="button"
            className="keep-icon-btn"
            onClick={toggleColorScheme}
            title={renderedScheme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            aria-label="Cambiar tema claro/oscuro"
          >
            {renderedScheme === 'dark' ? '☀️' : '🌙'}
          </button>

          {user ? (
            <button
              type="button"
              className="keep-user-pill"
              onClick={logout}
              title={`Conectado como ${user.email} · Cerrar sesión`}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="keep-avatar" />
              ) : (
                <span>👤</span>
              )}
              <span className="keep-user-name">
                {user.displayName?.split(' ')[0] || 'Salir'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="keep-btn keep-btn-primary"
              onClick={loginWithGoogle}
            >
              Entrar con Google
            </button>
          )}
        </div>
      </header>

      {(uploadProgress !== null || uploadError) && (
        <div className="obsidian-upload-banner" role="status" aria-live="polite">
          {uploadProgress !== null && (
            <div className="keep-upload-progress-row">
              <span>Subiendo archivo…</span>
              <progress
                className="keep-upload-progress"
                value={uploadProgress}
                max={100}
                aria-label="Progreso de subida"
              />
              <span>{uploadProgress}%</span>
            </div>
          )}
          {uploadError && <span className="keep-file-error">{uploadError}</span>}
        </div>
      )}

      {/* =================================================================
          CUERPO PRINCIPAL: GRAFO GLOBAL O WORKSPACE OBSIDIAN DE 3 PANELES
      ================================================================= */}
      {viewMode === 'graph' ? (
        <main className="obsidian-graph-stage">
          <div className="obsidian-graph-header">
            <div>
              <h2>🕸️ Grafo de la Bóveda</h2>
              <p>
                Nodos de archivo (<code>.md</code>, multimedia, enlaces) y{' '}
                <strong>Relaciones-Elemento</strong> conectadas por <code>[[WikiLinks]]</code>.
              </p>
            </div>
            <button
              type="button"
              className="keep-btn keep-btn-soft"
              onClick={() => setViewMode('vault')}
            >
              Volver al editor
            </button>
          </div>
          <ConnectionsGraph
            items={visibleItems}
            categoriesMap={categoriesDocs}
            activeItemId={activeItemId}
            onSelectItem={(it) => openVaultItem(it)}
            onSelectCategory={() => setViewMode('vault')}
          />
        </main>
      ) : (
        <main className="obsidian-workspace">
          {/* ---------------------------------------------------------------
              PANEL IZQUIERDO: CATEGORÍAS COMO LISTAS DE ARCHIVOS (TODOS LOS TIPOS)
          --------------------------------------------------------------- */}
          <aside className="obsidian-sidebar" aria-label="Explorador de listas de archivos">
            <div className="obsidian-sidebar-head">
              <span className="obsidian-pane-title">📁 Listas por Categoría</span>
              {user && (
                <button
                  type="button"
                  className="keep-icon-btn-sm"
                  onClick={() => setNewCategoryModalOpen(true)}
                  title="Nueva categoría / lista"
                >
                  + 📁
                </button>
              )}
            </div>

            <div className="obsidian-type-filter-bar" role="group" aria-label="Filtrar por tipo de archivo">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'markdown', label: '.md' },
                { id: 'media', label: 'Media' },
                { id: 'link', label: '.url' },
                { id: 'relation', label: '🕸️ Rel.' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`obsidian-filter-chip ${fileKindFilter === t.id ? 'active' : ''}`}
                  onClick={() => setFileKindFilter(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="obsidian-tree-scroll">
              {loading && <p className="obsidian-muted-msg">Cargando bóveda…</p>}
              {!loading && categoryLists.length === 0 && (
                <p className="obsidian-muted-msg">No hay archivos que coincidan.</p>
              )}

              {categoryLists.map((cat) => {
                const isCollapsed = Boolean(collapsedCats[cat.name]);
                return (
                  <section
                    key={cat.name}
                    className="obsidian-folder-group"
                    style={{ '--cat-accent': cat.accent }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer?.files?.length) {
                        handleUploadNewFile(e.dataTransfer.files[0], cat.name);
                        return;
                      }
                      if (dragItemId && user) {
                        mutateItem(dragItemId, { category: cat.name });
                        setDragItemId('');
                      }
                    }}
                  >
                    <div className="obsidian-folder-row">
                      <button
                        type="button"
                        className="obsidian-folder-toggle"
                        onClick={() =>
                          setCollapsedCats((prev) => ({
                            ...prev,
                            [cat.name]: !prev[cat.name],
                          }))
                        }
                      >
                        <span className="obsidian-chevron">
                          {isCollapsed ? '▸' : '▾'}
                        </span>
                        <span>{cat.icon}</span>
                        <span className="obsidian-folder-name">{cat.name}</span>
                        <span className="obsidian-folder-count">{cat.files.length}</span>
                      </button>

                      <div className="obsidian-folder-actions">
                        <button
                          type="button"
                          className="keep-icon-btn-sm"
                          onClick={() => {
                            setNewNoteForm((f) => ({ ...f, category: cat.name }));
                            setNewNoteModalOpen(true);
                          }}
                          title={`Nuevo .md en ${cat.name}`}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="keep-icon-btn-sm"
                          onClick={() =>
                            setShareTarget({
                              kind: 'category',
                              name: cat.name,
                              items: cat.files.map((f) => f.item),
                              isPublic: cat.isPublic,
                              sharedWith: cat.sharedWith,
                            })
                          }
                          title={`Compartir lista ${cat.name}`}
                        >
                          📤
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <ul className="obsidian-file-list">
                        {cat.files.map(({ item: it, isCrossRef }) => {
                          const badge = getFileBadge(it);
                          const isActive = it.id === activeItemId;
                          return (
                            <li key={`${cat.name}-${it.id}`}>
                              <button
                                type="button"
                                draggable={Boolean(user)}
                                onDragStart={() => setDragItemId(it.id)}
                                onClick={() => openVaultItem(it)}
                                className={`obsidian-file-row ${isActive ? 'is-active' : ''}`}
                                title={getFileDisplayName(it)}
                              >
                                <span className="obsidian-file-icon">{badge.icon}</span>
                                <span className="obsidian-file-name">
                                  {getFileDisplayName(it)}
                                </span>
                                {isCrossRef && (
                                  <span className="obsidian-file-tag" title="Referencia cruzada">
                                    ↗
                                  </span>
                                )}
                                {it.pinned && (
                                  <span className="obsidian-file-tag" title="Fijado">
                                    ★
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </aside>

          {/* ---------------------------------------------------------------
              PANEL CENTRAL: LECTOR / EDITOR MARKDOWN + VISOR MULTIMEDIA
          --------------------------------------------------------------- */}
          <section className="obsidian-editor-pane" aria-label="Visor y editor de archivo">
            {!activeItem ? (
              <div className="obsidian-empty-pane">
                <p>Selecciona un archivo de las listas de la izquierda o crea un nuevo <code>.md</code>.</p>
                <button
                  type="button"
                  className="keep-btn keep-btn-primary"
                  onClick={() => setNewNoteModalOpen(true)}
                >
                  + Crear primer archivo .md
                </button>
              </div>
            ) : (
              <>
                <div className="obsidian-doc-toolbar">
                  <div className="obsidian-doc-breadcrumb">
                    <span className="obsidian-crumb-cat">
                      {getCategoryIcon(activeItem.category)} {activeItem.category}
                    </span>
                    <span aria-hidden="true">/</span>
                    <span className="obsidian-crumb-file">
                      {activeBadge?.icon} {getFileDisplayName(activeItem)}
                    </span>
                    {activeItem.kind === 'relation' && (
                      <span className="obsidian-relation-pill">Relación-Elemento</span>
                    )}
                    {dirty && <span className="obsidian-dirty-dot">● Sin guardar</span>}
                  </div>

                  <div className="obsidian-doc-actions">
                    <div className="obsidian-segmented" role="group" aria-label="Modo de vista">
                      {[
                        { id: 'read', label: '👁️ Lectura' },
                        { id: 'split', label: '◫ Dividido' },
                        { id: 'edit', label: '✏️ Editar' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`obsidian-seg-btn ${editorMode === m.id ? 'active' : ''}`}
                          onClick={() => setEditorMode(m.id)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {user && dirty && (
                      <button
                        type="button"
                        className="keep-btn keep-btn-primary"
                        onClick={handleSaveActiveDraft}
                        disabled={savingDraft}
                      >
                        {savingDraft ? 'Guardando…' : '💾 Guardar'}
                      </button>
                    )}

                    {user && (
                      <button
                        type="button"
                        className={`keep-icon-btn ${activeItem.pinned ? 'is-active' : ''}`}
                        onClick={() => mutateItem(activeItem.id, { pinned: !activeItem.pinned })}
                        title={activeItem.pinned ? 'Quitar fijado' : 'Fijar archivo'}
                      >
                        ★
                      </button>
                    )}

                    {user && (
                      <button
                        type="button"
                        className="keep-icon-btn"
                        onClick={() =>
                          mutateItem(activeItem.id, { isPublic: !activeItem.isPublic })
                        }
                        title={activeItem.isPublic ? 'Público (clic para hacer privado)' : 'Privado (clic para hacer público)'}
                      >
                        {activeItem.isPublic ? '🌍' : '🔒'}
                      </button>
                    )}

                    <button
                      type="button"
                      className="keep-icon-btn"
                      onClick={() =>
                        setShareTarget({
                          kind: 'item',
                          item: activeItem,
                          relatedItems: activeConnections.outgoing.map((o) => o.item),
                        })
                      }
                      title="Compartir archivo"
                    >
                      📤
                    </button>

                    {user && (
                      <button
                        type="button"
                        className="keep-icon-btn is-danger"
                        onClick={() => handleDeleteItem(activeItem)}
                        title="Eliminar archivo"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de fichero adjunto o URL externa del archivo activo */}
                <div className="obsidian-media-bar">
                  {activeItem.url && (
                    <a
                      href={activeItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="obsidian-media-chip"
                    >
                      {activeItem.favicon && (
                        <img src={activeItem.favicon} alt="" width="16" height="16" />
                      )}
                      <span>{activeItem.domain || activeItem.url} ↗</span>
                    </a>
                  )}

                  {activeItem.attachment?.url && (
                    <a
                      href={activeItem.attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="obsidian-media-chip"
                    >
                      <span>
                        {AttachmentService.getAttachmentIcon(
                          activeItem.attachment.contentType,
                          activeItem.attachment.name
                        )}
                      </span>
                      <span>{activeItem.attachment.name}</span>
                      <small>
                        ({AttachmentService.formatFileSize(activeItem.attachment.size)}) ↗
                      </small>
                    </a>
                  )}

                  {user && (
                    <label htmlFor="active-attach-input" className="obsidian-attach-btn">
                      📎 {activeItem.attachment?.url ? 'Reemplazar fichero' : 'Adjuntar fichero'}
                      <input
                        ref={attachFileInputRef}
                        id="active-attach-input"
                        type="file"
                        className="keep-sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleAttachToActiveItem(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Previsualización multimedia nativa si el elemento tiene imagen/vídeo/audio/pdf */}
                {activeItem.attachment?.url && (
                  <div className="obsidian-media-stage">
                    {AttachmentService.isImageAttachment(activeItem.attachment) && (
                      <img
                        src={activeItem.attachment.url}
                        alt={activeItem.attachment.name}
                        className="obsidian-stage-image"
                      />
                    )}
                    {(activeItem.attachment.contentType?.startsWith('video/') ||
                      /\.(mp4|webm|mov)$/i.test(activeItem.attachment.name)) && (
                      <video
                        src={activeItem.attachment.url}
                        controls
                        className="obsidian-stage-video"
                      />
                    )}
                    {(activeItem.attachment.contentType?.startsWith('audio/') ||
                      /\.(mp3|wav|ogg|m4a)$/i.test(activeItem.attachment.name)) && (
                      <audio src={activeItem.attachment.url} controls />
                    )}
                    {(activeItem.attachment.contentType === 'application/pdf' ||
                      activeItem.attachment.name.toLowerCase().endsWith('.pdf')) && (
                      <iframe
                        src={activeItem.attachment.url}
                        title={activeItem.attachment.name}
                        className="obsidian-stage-pdf"
                      />
                    )}
                  </div>
                )}

                {/* Cuerpo Edit / Read / Split */}
                <div className={`obsidian-panes mode-${editorMode}`}>
                  {(editorMode === 'edit' || editorMode === 'split') && (
                    <div className="obsidian-edit-col">
                      <div className="obsidian-edit-fields">
                        <input
                          type="text"
                          value={draftTitle}
                          disabled={!user}
                          onChange={(e) => {
                            setDraftTitle(e.target.value);
                            setDirty(true);
                          }}
                          placeholder="Nombre del archivo (sin extensión)…"
                          className="obsidian-title-input"
                        />
                        <input
                          type="url"
                          value={draftUrl}
                          disabled={!user}
                          onChange={(e) => {
                            setDraftUrl(e.target.value);
                            setDirty(true);
                          }}
                          placeholder="URL asociada (opcional)…"
                          className="obsidian-url-input"
                        />
                      </div>

                      <div className="obsidian-textarea-wrap">
                        <textarea
                          ref={editorTextareaRef}
                          value={draftMarkdown}
                          disabled={!user}
                          onChange={(e) => handleEditorChange(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                              e.preventDefault();
                              handleSaveActiveDraft();
                            }
                          }}
                          placeholder="Escribe en Markdown. Usa [[Nombre]] para enlazar otro archivo o ![[archivo]] para incrustar multimedia…"
                          className="obsidian-markdown-textarea"
                        />

                        {showWikiSuggest && wikiSuggestions.length > 0 && (
                          <div className="obsidian-wikisuggest-popover">
                            <div className="obsidian-wikisuggest-head">
                              Enlazar archivo de la bóveda:
                            </div>
                            {wikiSuggestions.map((cand) => {
                              const b = getFileBadge(cand);
                              return (
                                <div key={cand.id} className="obsidian-wikisuggest-item">
                                  <button
                                    type="button"
                                    className="obsidian-wikisuggest-main"
                                    onClick={() => insertWikiSuggestion(cand, false)}
                                  >
                                    <span>{b.icon}</span>
                                    <span>{getFileDisplayName(cand)}</span>
                                    <small>{cand.category}</small>
                                  </button>
                                  {cand.attachment?.url && (
                                    <button
                                      type="button"
                                      className="obsidian-wikisuggest-embed"
                                      onClick={() => insertWikiSuggestion(cand, true)}
                                      title="Incrustar con ![[]]"
                                    >
                                      ![[]]
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(editorMode === 'read' || editorMode === 'split') && (
                    <div className="obsidian-read-col">
                      <MarkdownVaultView
                        markdown={draftMarkdown}
                        allItems={visibleItems}
                        onOpenItem={(it) => openVaultItem(it)}
                        onCreateMissingNote={(missingName) => {
                          if (!user) return;
                          createMarkdownFile({
                            title: missingName,
                            category: activeItem.category,
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ---------------------------------------------------------------
              PANEL DERECHO: CONEXIONES (SALIENTES, BACKLINKS Y RELACIONES-ELEMENTO)
          --------------------------------------------------------------- */}
          <aside className="obsidian-inspector" aria-label="Inspector de conexiones y backlinks">
            {!activeItem ? (
              <p className="obsidian-muted-msg">Sin archivo seleccionado.</p>
            ) : (
              <>
                <div className="obsidian-inspector-section">
                  <h3 className="obsidian-inspector-title">
                    🕸️ Relaciones-Elemento ({activeConnections.relations.length})
                  </h3>
                  <p className="obsidian-inspector-hint">
                    Crea un archivo <code>.md</code> que represente la relación entre este archivo y otro.
                  </p>
                  {activeConnections.relations.length > 0 && (
                    <ul className="obsidian-conn-list">
                      {activeConnections.relations.map((rel) => (
                        <li key={rel.id}>
                          <button
                            type="button"
                            className="obsidian-conn-btn"
                            onClick={() => openVaultItem(rel)}
                          >
                            <span>🕸️</span>
                            <span>{rel.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {user && (
                    <form onSubmit={handleCreateRelationElement} className="obsidian-rel-form">
                      <select
                        value={relTargetId}
                        onChange={(e) => setRelTargetId(e.target.value)}
                        className="keep-select-compact"
                        aria-label="Archivo destino de la relación"
                      >
                        <option value="">Conectar con archivo…</option>
                        {visibleItems
                          .filter((it) => it.id !== activeItem.id)
                          .map((it) => (
                            <option key={it.id} value={it.id}>
                              {getFileDisplayName(it)} ({it.category})
                            </option>
                          ))}
                      </select>
                      <input
                        type="text"
                        value={relLabel}
                        onChange={(e) => setRelLabel(e.target.value)}
                        placeholder="Tipo (ej. demuestra, inspira, refuta)"
                        className="keep-input-compact"
                      />
                      <button
                        type="submit"
                        disabled={!relTargetId}
                        className="keep-btn keep-btn-soft"
                      >
                        + Crear Relación .md
                      </button>
                    </form>
                  )}
                </div>

                <div className="obsidian-inspector-section">
                  <h3 className="obsidian-inspector-title">
                    🔗 Enlaces salientes ({activeConnections.outgoing.length})
                  </h3>
                  {activeConnections.outgoing.length === 0 ? (
                    <p className="obsidian-muted-msg">
                      Usa <code>[[Nombre]]</code> en el Markdown para enlazar otros archivos.
                    </p>
                  ) : (
                    <ul className="obsidian-conn-list">
                      {activeConnections.outgoing.map(({ item: target, via }) => {
                        const b = getFileBadge(target);
                        return (
                          <li key={target.id}>
                            <button
                              type="button"
                              className="obsidian-conn-btn"
                              onClick={() => openVaultItem(target)}
                            >
                              <span>{b.icon}</span>
                              <span>{getFileDisplayName(target)}</span>
                              <small>{via}</small>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="obsidian-inspector-section">
                  <h3 className="obsidian-inspector-title">
                    ↩️ Backlinks ({activeConnections.backlinks.length})
                  </h3>
                  {activeConnections.backlinks.length === 0 ? (
                    <p className="obsidian-muted-msg">Ningún otro archivo enlaza a este todavía.</p>
                  ) : (
                    <ul className="obsidian-conn-list">
                      {activeConnections.backlinks.map(({ item: src, snippet }) => {
                        const b = getFileBadge(src);
                        return (
                          <li key={src.id}>
                            <button
                              type="button"
                              className="obsidian-conn-btn is-backlink"
                              onClick={() => openVaultItem(src)}
                            >
                              <div className="obsidian-backlink-head">
                                <span>{b.icon}</span>
                                <strong>{getFileDisplayName(src)}</strong>
                              </div>
                              {snippet && <p className="obsidian-backlink-snippet">{snippet}</p>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </aside>
        </main>
      )}

      {/* =================================================================
          MODAL: NUEVO ARCHIVO .MD
      ================================================================= */}
      <LightDismissDialog
        open={newNoteModalOpen}
        onClose={() => setNewNoteModalOpen(false)}
        title="Nuevo archivo Markdown (.md)"
        subtitle="Se añadirá a la lista de la categoría elegida"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newNoteForm.title.trim()) return;
            await createMarkdownFile(newNoteForm);
            setNewNoteForm({
              title: '',
              category: newNoteForm.category,
              url: '',
              isPublic: true,
            });
            setNewNoteModalOpen(false);
          }}
          className="share-modal-stack"
        >
          <div className="share-section">
            <label className="share-label">Nombre del archivo (.md)</label>
            <input
              type="text"
              required
              value={newNoteForm.title}
              onChange={(e) => setNewNoteForm({ ...newNoteForm, title: e.target.value })}
              placeholder="Ej: arquitectura-conocimiento"
              className="keep-input"
            />
          </div>
          <div className="share-section">
            <label className="share-label">Categoría (lista destino)</label>
            <input
              type="text"
              value={newNoteForm.category}
              onChange={(e) => setNewNoteForm({ ...newNoteForm, category: e.target.value })}
              className="keep-input"
              list="vault-cat-options"
            />
            <datalist id="vault-cat-options">
              {categoryLists.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="share-section">
            <label className="share-label">URL externa asociada (opcional)</label>
            <input
              type="url"
              value={newNoteForm.url}
              onChange={(e) => setNewNoteForm({ ...newNoteForm, url: e.target.value })}
              placeholder="https://…"
              className="keep-input"
            />
          </div>
          <div className="share-actions-row">
            <button type="submit" className="keep-btn keep-btn-primary">
              Crear archivo .md
            </button>
          </div>
        </form>
      </LightDismissDialog>

      {/* =================================================================
          MODAL: CREAR NUEVA CATEGORÍA
      ================================================================= */}
      <LightDismissDialog
        open={newCategoryModalOpen}
        onClose={() => setNewCategoryModalOpen(false)}
        title="Nueva Lista / Categoría"
        subtitle="Organiza tus archivos .md, imágenes, PDFs y vídeos"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newCatForm.name.trim()) return;
            await mutateCategory(newCatForm.name.trim(), {
              icon: newCatForm.icon || '📁',
              colorKey: newCatForm.colorKey,
              note: newCatForm.note.trim(),
              isPublic: newCatForm.isPublic,
              order: Date.now(),
            });
            setNewCatForm({
              name: '',
              icon: '📁',
              colorKey: 'emerald',
              note: '',
              isPublic: true,
            });
            setNewCategoryModalOpen(false);
          }}
          className="share-modal-stack"
        >
          <div className="share-section">
            <label className="share-label">Nombre de la lista</label>
            <input
              type="text"
              required
              value={newCatForm.name}
              onChange={(e) => setNewCatForm({ ...newCatForm, name: e.target.value })}
              placeholder="Ej: Proyectos, Fuentes PDF, Ideas…"
              className="keep-input"
            />
          </div>
          <div className="share-section">
            <label className="share-label">Icono</label>
            <input
              type="text"
              value={newCatForm.icon}
              onChange={(e) => setNewCatForm({ ...newCatForm, icon: e.target.value })}
              className="keep-input"
              maxLength={4}
            />
          </div>
          <div className="share-section">
            <label className="share-label">Color</label>
            <div className="keep-color-dots">
              {KEEP_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`keep-color-dot ${newCatForm.colorKey === c.key ? 'selected' : ''}`}
                  style={{ backgroundColor: c.accent }}
                  onClick={() => setNewCatForm({ ...newCatForm, colorKey: c.key })}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <div className="share-actions-row">
            <button type="submit" className="keep-btn keep-btn-primary">
              Crear lista
            </button>
          </div>
        </form>
      </LightDismissDialog>

      {/* =================================================================
          MODAL: COMPARTIR CATEGORÍA O ARCHIVO
      ================================================================= */}
      <ShareModal
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        target={shareTarget}
        user={user}
        onUpdateCategoryShare={async (catName, patch) => {
          await mutateCategory(catName, patch);
          setShareTarget((prev) => (prev ? { ...prev, ...patch } : prev));
        }}
        onUpdateItemShare={async (itemId, patch) => {
          await mutateItem(itemId, patch);
          setShareTarget((prev) =>
            prev?.item ? { ...prev, item: { ...prev.item, ...patch } } : prev
          );
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ObsidianVaultBoard />
    </AuthProvider>
  );
}
