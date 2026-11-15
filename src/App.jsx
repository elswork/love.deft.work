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
import {
  IconVault,
  IconFileKind,
  IconGraph,
  IconAgent,
  IconHuman,
  IconSearch,
  IconUpload,
  IconShare,
  IconStar,
  IconTrash,
  IconRelation,
} from './components/VaultIcons';
import EnrichmentService from './services/EnrichmentService';
import AttachmentService from './services/AttachmentService';
import AgentService from './services/AgentService';
import {
  getFileDisplayName,
  getFileExtension,
  getFileBadge,
  extractWikiLinks,
  resolveWikiTarget,
  buildInitialMarkdown,
  computeVaultConnections,
} from './services/MarkdownVaultService';
import { KEEP_COLORS, getColorConfig } from './data/keep_palette';
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

function StudioVaultApp() {
  const { user, loginWithGoogle, logout } = useAuth();
  const { items, setItems, categoriesDocs, setCategoriesDocs, loading } = useVaultData();

  const [renderedScheme, setRenderedScheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const meta = document.querySelector('meta[name="color-scheme"]')?.content;
    if (meta === 'dark' || meta === 'light') return meta;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Navegación principal
  const [activeItemId, setActiveItemId] = useState('');
  const [editorMode, setEditorMode] = useState('read'); // 'read' | 'split' | 'edit'
  const [viewMode, setViewMode] = useState('vault'); // 'vault' | 'analysis' | 'graph'
  const [inspectorTab, setInspectorTab] = useState('connections'); // 'connections' | 'agent'
  const [searchQuery, setSearchQuery] = useState('');
  const [fileKindFilter, setFileKindFilter] = useState('all');
  const [collapsedCats, setCollapsedCats] = useState({});

  // Borrador del editor Markdown
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Autocompletado [[WikiLink]]
  const [wikiSuggestQuery, setWikiSuggestQuery] = useState('');
  const [showWikiSuggest, setShowWikiSuggest] = useState(false);
  const editorTextareaRef = useRef(null);

  // Subida de archivos
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const quickFileInputRef = useRef(null);
  const attachFileInputRef = useRef(null);

  // Relación-Elemento manual
  const [relTargetId, setRelTargetId] = useState('');
  const [relLabel, setRelLabel] = useState('conecta con');

  // Agente IA Colaborador
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentAnalysisByItem, setAgentAnalysisByItem] = useState({});
  const [synthScope, setSynthScope] = useState('ALL');
  const [synthQuestion, setSynthQuestion] = useState('');
  const [synthBusy, setSynthBusy] = useState(false);
  const [synthResult, setSynthResult] = useState(null);

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
    colorKey: 'indigo',
    note: '',
    isPublic: true,
  });

  const [dragItemId, setDragItemId] = useState('');
  const searchInputRef = useRef(null);

  // Sincronía tema claro/oscuro
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

  // Atajos de teclado
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

  // Selección inicial / deep-link
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
      if (fileKindFilter === 'agent' && it.authorKind !== 'agent' && it.authorKind !== 'hybrid') {
        return false;
      }

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

  const categoryLists = useMemo(() => {
    const map = new Map();

    const ensureCat = (name) => {
      if (!map.has(name)) {
        const meta = categoriesDocs[name] || {};
        const color = getColorConfig(meta.colorKey || name);
        map.set(name, {
          name,
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

  const activeConnections = useMemo(
    () => computeVaultConnections(activeItem, visibleItems),
    [activeItem, visibleItems]
  );

  // Métricas analíticas de la bóveda para la Mesa IA
  const vaultAnalytics = useMemo(() => {
    let totalLinks = 0;
    const orphans = [];
    const pendingReviews = [];
    const agentDocs = [];

    visibleItems.forEach((it) => {
      const conns = computeVaultConnections(it, visibleItems);
      const degree = conns.outgoing.length + conns.backlinks.length + conns.relations.length;
      totalLinks += conns.outgoing.length;
      if (degree === 0) orphans.push(it);
      if (it.reviewStatus === 'pending') pendingReviews.push(it);
      if (it.authorKind === 'agent' || it.authorKind === 'hybrid') agentDocs.push(it);
    });

    return {
      totalFiles: visibleItems.length,
      totalLinks,
      orphans,
      pendingReviews,
      agentDocs,
      relationNodes: visibleItems.filter((it) => it.kind === 'relation').length,
    };
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
        authorKind: activeItem.authorKind === 'agent' ? 'hybrid' : activeItem.authorKind,
      });
      setDirty(false);
    } finally {
      setSavingDraft(false);
    }
  };

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
    authorKind = 'human',
    authorName = '',
    reviewStatus = 'verified',
    isPublic = true,
  }) => {
    if (!user) {
      await loginWithGoogle();
      return null;
    }
    const cleanTitle = String(title || 'Nueva nota').trim();
    const initialMd =
      markdownContent ||
      `# ${cleanTitle}\n\nEscribe aquí tu análisis en Markdown. Usa \`[[Nombre]]\` para enlazar archivos o \`![[archivo]]\` para incrustar multimedia.\n`;

    const payload = {
      title: cleanTitle,
      name: cleanTitle,
      type: url ? 'link' : 'phrase',
      kind,
      sourceId,
      targetId,
      relationLabel,
      authorKind,
      authorName: authorName || user.displayName || user.email || '',
      reviewStatus,
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

  const handleUploadNewFile = async (file, targetCategory = 'Multimedia & PDF') => {
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

  const createRelationBetween = async ({
    source,
    target,
    label = 'conecta con',
    authorKind = 'human',
    authorName = '',
    reviewStatus = 'verified',
    reason = '',
  }) => {
    if (!source || !target) return;
    const cleanLabel = label.trim() || 'conecta con';
    const relTitle = `${source.title} — ${cleanLabel} → ${target.title}`;
    const relMd = [
      `# Relación: ${source.title} ↔ ${target.title}`,
      '',
      `> **Tipo de relación**: \`${cleanLabel}\``,
      '',
      `- **Origen**: [[${source.title}]]`,
      `- **Destino**: [[${target.title}]]`,
      '',
      '## Análisis de la conexión',
      reason ||
        `Explica aquí por qué **[[${source.title}]]** *${cleanLabel}* **[[${target.title}]]** y adjunta evidencias si es necesario.`,
      '',
    ].join('\n');

    await createMarkdownFile({
      title: relTitle,
      category: source.category,
      markdownContent: relMd,
      kind: 'relation',
      sourceId: source.id,
      targetId: target.id,
      relationLabel: cleanLabel,
      authorKind,
      authorName,
      reviewStatus,
    });
  };

  const handleCreateRelationElement = async (e) => {
    e.preventDefault();
    if (!activeItem || !relTargetId || !user) return;
    const target = itemsById[relTargetId];
    if (!target) return;
    await createRelationBetween({
      source: activeItem,
      target,
      label: relLabel,
    });
    setRelTargetId('');
  };

  const handleRunAgentItemAnalysis = async () => {
    if (!activeItem || agentBusy) return;
    setAgentBusy(true);
    setInspectorTab('agent');
    try {
      const result = await AgentService.analyzeItemWithAgent(activeItem, visibleItems);
      setAgentAnalysisByItem((prev) => ({ ...prev, [activeItem.id]: result }));
    } finally {
      setAgentBusy(false);
    }
  };

  const handleRunVaultSynthesis = async (e) => {
    if (e) e.preventDefault();
    if (!synthQuestion.trim() || synthBusy) return;
    setSynthBusy(true);
    try {
      const scopeItems =
        synthScope === 'ALL'
          ? visibleItems
          : visibleItems.filter(
              (it) => it.category === synthScope || (it.extraCategories || []).includes(synthScope)
            );
      const label = synthScope === 'ALL' ? 'Toda la bóveda' : `Categoría: ${synthScope}`;
      const res = await AgentService.synthesizeVaultQuestion(
        synthQuestion.trim(),
        scopeItems,
        label
      );
      setSynthResult({ ...res, category: synthScope === 'ALL' ? 'Anticitera' : synthScope });
    } finally {
      setSynthBusy(false);
    }
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
    setDraftMarkdown(replacedBefore + after);
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
  const activeAgentReport = activeItem ? agentAnalysisByItem[activeItem.id] : null;

  return (
    <div className="studio-app">
      {/* =================================================================
          BARRA SUPERIOR TIPO COMMAND STUDIO
      ================================================================= */}
      <header className="studio-topbar">
        <div className="studio-brand">
          <div className="studio-logo" aria-hidden="true">
            <IconVault size={18} />
          </div>
          <div className="studio-brand-text">
            <div className="studio-brand-title-row">
              <h1 className="studio-brand-title">love.deft.work</h1>
              <span className="studio-collab-badge">
                <IconAgent size={12} /> Humano + Agentes
              </span>
            </div>
            <p className="studio-brand-metrics">
              {vaultAnalytics.totalFiles} archivos · {vaultAnalytics.totalLinks} enlaces ·{' '}
              {vaultAnalytics.relationNodes} relaciones
            </p>
          </div>
        </div>

        <search className="studio-search">
          <IconSearch size={15} />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar archivos .md, multimedia, relaciones… (Ctrl+K)"
            className="studio-search-input"
            aria-label="Buscar en la bóveda"
          />
          {searchQuery && (
            <button
              type="button"
              className="studio-ghost-icon"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </search>

        <div className="studio-topbar-right">
          <nav className="studio-segmented" aria-label="Vistas del sistema">
            <button
              type="button"
              className={`studio-seg-btn ${viewMode === 'vault' ? 'active' : ''}`}
              onClick={() => setViewMode('vault')}
            >
              <IconVault size={14} /> Bóveda
            </button>
            <button
              type="button"
              className={`studio-seg-btn ${viewMode === 'analysis' ? 'active' : ''}`}
              onClick={() => setViewMode('analysis')}
            >
              <IconAgent size={14} /> Mesa IA
              {vaultAnalytics.pendingReviews.length > 0 && (
                <span className="studio-count-dot">{vaultAnalytics.pendingReviews.length}</span>
              )}
            </button>
            <button
              type="button"
              className={`studio-seg-btn ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
            >
              <IconGraph size={14} /> Grafo
            </button>
          </nav>

          <button
            type="button"
            className="studio-btn studio-btn-primary"
            onClick={() => {
              setNewNoteForm((f) => ({
                ...f,
                category: activeItem?.category || categoryLists[0]?.name || 'Anticitera',
              }));
              setNewNoteModalOpen(true);
            }}
          >
            + Nota .md
          </button>

          <label
            htmlFor="studio-quick-upload"
            className="studio-btn studio-btn-secondary"
            title="Subir .md, .png, .pdf, .mp4, .svg…"
          >
            <IconUpload size={14} /> Subir
            <input
              ref={quickFileInputRef}
              id="studio-quick-upload"
              type="file"
              className="keep-sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleUploadNewFile(file, activeItem?.category || 'Multimedia & PDF');
                }
                e.target.value = '';
              }}
            />
          </label>

          <button
            type="button"
            className="studio-icon-btn"
            onClick={toggleColorScheme}
            title={renderedScheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label="Cambiar tema claro/oscuro"
          >
            {renderedScheme === 'dark' ? '☀️' : '🌙'}
          </button>

          {user ? (
            <button
              type="button"
              className="studio-user-pill"
              onClick={logout}
              title={`${user.email} · Cerrar sesión`}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="studio-avatar" />
              ) : (
                <IconHuman size={14} />
              )}
              <span>{user.displayName?.split(' ')[0] || 'Cuenta'}</span>
            </button>
          ) : (
            <button
              type="button"
              className="studio-btn studio-btn-primary"
              onClick={loginWithGoogle}
            >
              Entrar
            </button>
          )}
        </div>
      </header>

      {(uploadProgress !== null || uploadError) && (
        <div className="obsidian-upload-banner" role="status" aria-live="polite">
          {uploadProgress !== null && (
            <div className="keep-upload-progress-row">
              <span>Subiendo archivo a la bóveda…</span>
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
          VISTAS: GRAFO / MESA IA / BÓVEDA DE 3 PANELES
      ================================================================= */}
      {viewMode === 'graph' ? (
        <main className="studio-stage-wide">
          <div className="studio-stage-head">
            <div>
              <h2>Grafo de Conocimiento Humano + Agentes</h2>
              <p>
                Explora cómo se enlazan los archivos <code>.md</code>, recursos multimedia y{' '}
                <strong>Relaciones-Elemento</strong> en todas las categorías.
              </p>
            </div>
            <button
              type="button"
              className="studio-btn studio-btn-secondary"
              onClick={() => setViewMode('vault')}
            >
              Volver a la Bóveda
            </button>
          </div>
          <ConnectionsGraph
            items={visibleItems}
            categoriesMap={categoriesDocs}
            activeItemId={activeItemId}
            onSelectItem={(it) => openVaultItem(it)}
          />
        </main>
      ) : viewMode === 'analysis' ? (
        <main className="studio-stage-wide">
          <div className="studio-stage-head">
            <div>
              <h2>Mesa de Análisis Colaborativo (Humano + Agentes)</h2>
              <p>
                Sintetiza conocimiento entre categorías, detecta archivos aislados y revisa
                propuestas generadas por agentes antes de consolidarlas.
              </p>
            </div>
            <button
              type="button"
              className="studio-btn studio-btn-secondary"
              onClick={() => setViewMode('vault')}
            >
              Volver a la Bóveda
            </button>
          </div>

          <section className="studio-kpi-grid" aria-label="Métricas de la bóveda">
            <article className="studio-kpi-card">
              <span className="studio-kpi-label">Archivos en Bóveda</span>
              <strong className="studio-kpi-value">{vaultAnalytics.totalFiles}</strong>
            </article>
            <article className="studio-kpi-card">
              <span className="studio-kpi-label">Relaciones-Elemento</span>
              <strong className="studio-kpi-value">{vaultAnalytics.relationNodes}</strong>
            </article>
            <article className="studio-kpi-card">
              <span className="studio-kpi-label">Archivos sin conexiones</span>
              <strong className="studio-kpi-value">{vaultAnalytics.orphans.length}</strong>
            </article>
            <article className="studio-kpi-card">
              <span className="studio-kpi-label">Notas con Agente IA</span>
              <strong className="studio-kpi-value">{vaultAnalytics.agentDocs.length}</strong>
            </article>
          </section>

          <div className="studio-analysis-grid">
            <section className="studio-panel-card">
              <div className="studio-panel-card-head">
                <IconAgent size={18} />
                <h3>Síntesis Asistida por Agente</h3>
              </div>
              <p className="studio-muted">
                Formula una pregunta o elige una plantilla para que el agente analice tus archivos
                y redacte una nueva nota <code>.md</code> con enlaces <code>[[...]]</code>.
              </p>

              <div className="studio-prompt-chips">
                {[
                  'Sintetiza los conceptos clave y cómo se conectan entre categorías',
                  'Detecta huecos de evidencia o archivos que deberían relacionarse',
                  'Propón una estructura de mapa conceptual para esta lista',
                ].map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    className="studio-chip-btn"
                    onClick={() => setSynthQuestion(tpl)}
                  >
                    {tpl}
                  </button>
                ))}
              </div>

              <form onSubmit={handleRunVaultSynthesis} className="studio-synth-form">
                <div className="studio-synth-controls">
                  <select
                    value={synthScope}
                    onChange={(e) => setSynthScope(e.target.value)}
                    className="studio-select"
                    aria-label="Ámbito de análisis"
                  >
                    <option value="ALL">Toda la bóveda ({visibleItems.length} archivos)</option>
                    {categoryLists.map((c) => (
                      <option key={c.name} value={c.name}>
                        Lista: {c.name} ({c.files.length})
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={synthQuestion}
                  onChange={(e) => setSynthQuestion(e.target.value)}
                  placeholder="¿Qué quieres analizar, cruzar o sintetizar?"
                  className="studio-textarea-sm"
                  rows={3}
                />
                <button
                  type="submit"
                  disabled={!synthQuestion.trim() || synthBusy}
                  className="studio-btn studio-btn-primary"
                >
                  <IconAgent size={15} />
                  {synthBusy ? 'Analizando bóveda…' : 'Generar síntesis colaborativa'}
                </button>
              </form>

              {synthResult && (
                <div className="studio-synth-output">
                  <div className="studio-synth-output-head">
                    <span className="studio-agent-tag">
                      <IconAgent size={13} /> {synthResult.agentName}
                    </span>
                    <strong>{synthResult.title}</strong>
                    {user && (
                      <button
                        type="button"
                        className="studio-btn studio-btn-primary"
                        onClick={async () => {
                          await createMarkdownFile({
                            title: synthResult.title,
                            category: synthResult.category,
                            markdownContent: synthResult.markdown,
                            authorKind: 'agent',
                            authorName: synthResult.agentName,
                            reviewStatus: 'pending',
                          });
                          setSynthResult(null);
                        }}
                      >
                        Guardar como .md en Bóveda
                      </button>
                    )}
                  </div>
                  <div className="studio-synth-preview">
                    <MarkdownVaultView
                      markdown={synthResult.markdown}
                      allItems={visibleItems}
                      onOpenItem={(it) => openVaultItem(it)}
                    />
                  </div>
                </div>
              )}
            </section>

            <section className="studio-panel-stack">
              <div className="studio-panel-card">
                <div className="studio-panel-card-head">
                  <IconRelation size={17} />
                  <h3>Archivos huérfanos ({vaultAnalytics.orphans.length})</h3>
                </div>
                {vaultAnalytics.orphans.length === 0 ? (
                  <p className="studio-muted">
                    Excelente: todos los archivos tienen al menos una conexión.
                  </p>
                ) : (
                  <ul className="studio-compact-list">
                    {vaultAnalytics.orphans.map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          className="studio-list-link"
                          onClick={() => openVaultItem(it)}
                        >
                          <IconFileKind kind={getFileBadge(it).kind} size={14} />
                          <span>{getFileDisplayName(it)}</span>
                          <small>{it.category}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="studio-panel-card">
                <div className="studio-panel-card-head">
                  <IconAgent size={17} />
                  <h3>Propuestas pendientes ({vaultAnalytics.pendingReviews.length})</h3>
                </div>
                {vaultAnalytics.pendingReviews.length === 0 ? (
                  <p className="studio-muted">No hay propuestas pendientes de revisión humana.</p>
                ) : (
                  <ul className="studio-compact-list">
                    {vaultAnalytics.pendingReviews.map((it) => (
                      <li key={it.id} className="studio-review-row">
                        <button
                          type="button"
                          className="studio-list-link"
                          onClick={() => openVaultItem(it)}
                        >
                          <IconFileKind kind={getFileBadge(it).kind} size={14} />
                          <span>{getFileDisplayName(it)}</span>
                        </button>
                        {user && (
                          <button
                            type="button"
                            className="studio-btn studio-btn-secondary"
                            onClick={() => mutateItem(it.id, { reviewStatus: 'verified' })}
                          >
                            Aprobar
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </main>
      ) : (
        <main className="studio-workspace">
          {/* ---------------------------------------------------------------
              SIDEBAR IZQUIERDO: CATEGORÍAS COMO LISTAS DE ARCHIVOS
          --------------------------------------------------------------- */}
          <aside className="studio-sidebar" aria-label="Explorador de listas por categoría">
            <div className="studio-sidebar-head">
              <span className="studio-pane-eyebrow">Listas de Archivos</span>
              {user && (
                <button
                  type="button"
                  className="studio-mini-action"
                  onClick={() => setNewCategoryModalOpen(true)}
                  title="Nueva lista / categoría"
                >
                  + Lista
                </button>
              )}
            </div>

            <div className="studio-filter-pills" role="group" aria-label="Filtrar por tipo">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'markdown', label: '.md' },
                { id: 'media', label: 'Media' },
                { id: 'link', label: '.url' },
                { id: 'relation', label: 'Relaciones' },
                { id: 'agent', label: 'IA' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`studio-filter-pill ${fileKindFilter === t.id ? 'active' : ''}`}
                  onClick={() => setFileKindFilter(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="studio-tree-scroll">
              {loading && <p className="studio-muted-pad">Cargando bóveda…</p>}
              {!loading && categoryLists.length === 0 && (
                <p className="studio-muted-pad">No hay archivos que coincidan.</p>
              )}

              {categoryLists.map((cat) => {
                const isCollapsed = Boolean(collapsedCats[cat.name]);
                return (
                  <section
                    key={cat.name}
                    className="studio-folder"
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
                    <div className="studio-folder-header">
                      <button
                        type="button"
                        className="studio-folder-btn"
                        onClick={() =>
                          setCollapsedCats((prev) => ({
                            ...prev,
                            [cat.name]: !prev[cat.name],
                          }))
                        }
                      >
                        <span className="studio-chevron">{isCollapsed ? '▸' : '▾'}</span>
                        <span className="studio-cat-swatch" />
                        <span className="studio-folder-title">{cat.name}</span>
                        <span className="studio-folder-count">{cat.files.length}</span>
                      </button>

                      <div className="studio-folder-tools">
                        <button
                          type="button"
                          className="studio-ghost-icon"
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
                          className="studio-ghost-icon"
                          onClick={() =>
                            setShareTarget({
                              kind: 'category',
                              name: cat.name,
                              items: cat.files.map((f) => f.item),
                              isPublic: cat.isPublic,
                              sharedWith: cat.sharedWith,
                            })
                          }
                          title={`Compartir ${cat.name}`}
                        >
                          <IconShare size={13} />
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <ul className="studio-file-list">
                        {cat.files.map(({ item: it, isCrossRef }) => {
                          const badge = getFileBadge(it);
                          const ext = getFileExtension(it);
                          const isActive = it.id === activeItemId;
                          const isAgent =
                            it.authorKind === 'agent' || it.authorKind === 'hybrid';
                          return (
                            <li key={`${cat.name}-${it.id}`}>
                              <button
                                type="button"
                                draggable={Boolean(user)}
                                onDragStart={() => setDragItemId(it.id)}
                                onClick={() => openVaultItem(it)}
                                className={`studio-file-item ${isActive ? 'is-active' : ''}`}
                                title={getFileDisplayName(it)}
                              >
                                <span className="studio-file-icon">
                                  <IconFileKind kind={badge.kind} size={14} />
                                </span>
                                <span className="studio-file-label">{it.title}</span>
                                <span className="studio-ext-tag">{ext}</span>
                                {isAgent && (
                                  <span className="studio-ia-mini" title="Asistido por Agente IA">
                                    IA
                                  </span>
                                )}
                                {isCrossRef && (
                                  <span className="studio-xref-mini" title="Referencia cruzada">
                                    ↗
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
              PANEL CENTRAL: LECTOR / EDITOR EDITORIAL + VISOR MULTIMEDIA
          --------------------------------------------------------------- */}
          <section className="studio-editor-pane" aria-label="Documento activo">
            {!activeItem ? (
              <div className="studio-empty-state">
                <IconVault size={32} />
                <h3>Selecciona un archivo de tus listas</h3>
                <p>
                  Cada elemento es un archivo <code>.md</code>, multimedia o relación sobre el
                  que tú y tus agentes podéis trabajar juntos.
                </p>
                <button
                  type="button"
                  className="studio-btn studio-btn-primary"
                  onClick={() => setNewNoteModalOpen(true)}
                >
                  + Crear primer archivo .md
                </button>
              </div>
            ) : (
              <>
                <div className="studio-doc-bar">
                  <div className="studio-doc-meta">
                    <span className="studio-doc-cat">{activeItem.category}</span>
                    <span className="studio-doc-sep">/</span>
                    <span className="studio-doc-name">
                      <IconFileKind kind={activeBadge?.kind} size={15} />
                      {getFileDisplayName(activeItem)}
                    </span>

                    <span
                      className={`studio-author-pill is-${activeItem.authorKind || 'human'}`}
                      title="Autoría del elemento"
                    >
                      {activeItem.authorKind === 'agent' ? (
                        <>
                          <IconAgent size={12} /> {activeItem.authorName || 'Agente IA'}
                        </>
                      ) : activeItem.authorKind === 'hybrid' ? (
                        <>
                          <IconAgent size={12} /> Colaborativo
                        </>
                      ) : (
                        <>
                          <IconHuman size={12} /> Humano
                        </>
                      )}
                    </span>

                    {activeItem.reviewStatus === 'pending' && user && (
                      <button
                        type="button"
                        className="studio-approve-pill"
                        onClick={() => mutateItem(activeItem.id, { reviewStatus: 'verified' })}
                      >
                        ✓ Aprobar propuesta IA
                      </button>
                    )}

                    {dirty && <span className="studio-dirty-pill">Sin guardar</span>}
                  </div>

                  <div className="studio-doc-controls">
                    <div className="studio-segmented" role="group" aria-label="Modo de documento">
                      {[
                        { id: 'read', label: 'Lectura' },
                        { id: 'split', label: 'Dividido' },
                        { id: 'edit', label: 'Editar' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`studio-seg-btn ${editorMode === m.id ? 'active' : ''}`}
                          onClick={() => setEditorMode(m.id)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {user && dirty && (
                      <button
                        type="button"
                        className="studio-btn studio-btn-primary"
                        onClick={handleSaveActiveDraft}
                        disabled={savingDraft}
                      >
                        {savingDraft ? 'Guardando…' : 'Guardar'}
                      </button>
                    )}

                    {user && (
                      <button
                        type="button"
                        className={`studio-icon-btn ${activeItem.pinned ? 'is-pinned' : ''}`}
                        onClick={() => mutateItem(activeItem.id, { pinned: !activeItem.pinned })}
                        title={activeItem.pinned ? 'Quitar fijado' : 'Fijar archivo'}
                      >
                        <IconStar size={15} filled={Boolean(activeItem.pinned)} />
                      </button>
                    )}

                    <button
                      type="button"
                      className="studio-icon-btn"
                      onClick={() =>
                        setShareTarget({
                          kind: 'item',
                          item: activeItem,
                          relatedItems: activeConnections.outgoing.map((o) => o.item),
                        })
                      }
                      title="Compartir archivo"
                    >
                      <IconShare size={15} />
                    </button>

                    {user && (
                      <button
                        type="button"
                        className="studio-icon-btn is-danger"
                        onClick={() => handleDeleteItem(activeItem)}
                        title="Eliminar archivo"
                      >
                        <IconTrash size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de URL o Fichero Adjunto */}
                {(activeItem.url || activeItem.attachment?.url || user) && (
                  <div className="studio-resource-strip">
                    {activeItem.url && (
                      <a
                        href={activeItem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="studio-resource-chip"
                      >
                        {activeItem.favicon && (
                          <img src={activeItem.favicon} alt="" width="15" height="15" />
                        )}
                        <span>{activeItem.domain || activeItem.url} ↗</span>
                      </a>
                    )}

                    {activeItem.attachment?.url && (
                      <a
                        href={activeItem.attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="studio-resource-chip"
                      >
                        <IconFileKind kind={activeBadge?.kind} size={14} />
                        <span>{activeItem.attachment.name}</span>
                        <small>{AttachmentService.formatFileSize(activeItem.attachment.size)} ↗</small>
                      </a>
                    )}

                    {user && (
                      <label htmlFor="studio-attach-active" className="studio-attach-trigger">
                        <IconUpload size={13} />
                        {activeItem.attachment?.url ? 'Reemplazar fichero' : 'Adjuntar fichero'}
                        <input
                          ref={attachFileInputRef}
                          id="studio-attach-active"
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
                )}

                {activeItem.attachment?.url && (
                  <div className="studio-media-stage">
                    {AttachmentService.isImageAttachment(activeItem.attachment) && (
                      <img
                        src={activeItem.attachment.url}
                        alt={activeItem.attachment.name}
                        className="studio-stage-img"
                      />
                    )}
                    {(activeItem.attachment.contentType?.startsWith('video/') ||
                      /\.(mp4|webm|mov)$/i.test(activeItem.attachment.name)) && (
                      <video
                        src={activeItem.attachment.url}
                        controls
                        className="studio-stage-video"
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
                        className="studio-stage-pdf"
                      />
                    )}
                  </div>
                )}

                <div className={`studio-panes mode-${editorMode}`}>
                  {(editorMode === 'edit' || editorMode === 'split') && (
                    <div className="studio-edit-pane">
                      <div className="studio-edit-inputs">
                        <input
                          type="text"
                          value={draftTitle}
                          disabled={!user}
                          onChange={(e) => {
                            setDraftTitle(e.target.value);
                            setDirty(true);
                          }}
                          placeholder="Título del archivo…"
                          className="studio-title-input"
                        />
                        <input
                          type="url"
                          value={draftUrl}
                          disabled={!user}
                          onChange={(e) => {
                            setDraftUrl(e.target.value);
                            setDirty(true);
                          }}
                          placeholder="URL externa opcional…"
                          className="studio-url-input"
                        />
                      </div>

                      <div className="studio-textarea-box">
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
                          placeholder="Escribe en Markdown. Usa [[Archivo]] para enlazar o ![[Multimedia]] para incrustar…"
                          className="studio-markdown-textarea"
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
                                    <IconFileKind kind={b.kind} size={14} />
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
                    <div className="studio-read-pane">
                      <article className="studio-prose">
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
                      </article>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ---------------------------------------------------------------
              PANEL DERECHO: CONEXIONES + AGENTE IA COLABORADOR
          --------------------------------------------------------------- */}
          <aside className="studio-inspector" aria-label="Inspector de conexiones y agente">
            <div className="studio-inspector-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={inspectorTab === 'connections'}
                className={`studio-tab-btn ${inspectorTab === 'connections' ? 'active' : ''}`}
                onClick={() => setInspectorTab('connections')}
              >
                <IconRelation size={14} /> Conexiones
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inspectorTab === 'agent'}
                className={`studio-tab-btn ${inspectorTab === 'agent' ? 'active' : ''}`}
                onClick={() => setInspectorTab('agent')}
              >
                <IconAgent size={14} /> Agente IA
              </button>
            </div>

            {!activeItem ? (
              <p className="studio-muted-pad">Selecciona un archivo para ver sus conexiones.</p>
            ) : inspectorTab === 'connections' ? (
              <div className="studio-inspector-body">
                <section className="studio-insp-block">
                  <h3 className="studio-pane-eyebrow">
                    Relaciones-Elemento ({activeConnections.relations.length})
                  </h3>
                  {activeConnections.relations.length > 0 && (
                    <ul className="studio-conn-list">
                      {activeConnections.relations.map((rel) => (
                        <li key={rel.id}>
                          <button
                            type="button"
                            className="studio-conn-card"
                            onClick={() => openVaultItem(rel)}
                          >
                            <IconRelation size={14} />
                            <span>{rel.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {user && (
                    <form onSubmit={handleCreateRelationElement} className="studio-rel-form">
                      <select
                        value={relTargetId}
                        onChange={(e) => setRelTargetId(e.target.value)}
                        className="studio-select"
                        aria-label="Archivo destino"
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
                        placeholder="Etiqueta (ej: demuestra, refuta)"
                        className="studio-input-sm"
                      />
                      <button
                        type="submit"
                        disabled={!relTargetId}
                        className="studio-btn studio-btn-secondary"
                      >
                        + Crear Relación .md
                      </button>
                    </form>
                  )}
                </section>

                <section className="studio-insp-block">
                  <h3 className="studio-pane-eyebrow">
                    Enlaces salientes ({activeConnections.outgoing.length})
                  </h3>
                  {activeConnections.outgoing.length === 0 ? (
                    <p className="studio-muted">
                      Usa <code>[[Nombre]]</code> en el Markdown para enlazar.
                    </p>
                  ) : (
                    <ul className="studio-conn-list">
                      {activeConnections.outgoing.map(({ item: target, via }) => (
                        <li key={target.id}>
                          <button
                            type="button"
                            className="studio-conn-card"
                            onClick={() => openVaultItem(target)}
                          >
                            <IconFileKind kind={getFileBadge(target).kind} size={14} />
                            <span className="studio-conn-name">{getFileDisplayName(target)}</span>
                            <small className="studio-ext-tag">{via}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="studio-insp-block">
                  <h3 className="studio-pane-eyebrow">
                    Backlinks ({activeConnections.backlinks.length})
                  </h3>
                  {activeConnections.backlinks.length === 0 ? (
                    <p className="studio-muted">Sin menciones entrantes todavía.</p>
                  ) : (
                    <ul className="studio-conn-list">
                      {activeConnections.backlinks.map(({ item: src, snippet }) => (
                        <li key={src.id}>
                          <button
                            type="button"
                            className="studio-conn-card is-col"
                            onClick={() => openVaultItem(src)}
                          >
                            <div className="studio-conn-head">
                              <IconFileKind kind={getFileBadge(src).kind} size={14} />
                              <strong>{getFileDisplayName(src)}</strong>
                            </div>
                            {snippet && <p className="studio-conn-snippet">{snippet}</p>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : (
              <div className="studio-inspector-body">
                <section className="studio-insp-block">
                  <h3 className="studio-pane-eyebrow">Copiloto de Conocimiento</h3>
                  <p className="studio-muted">
                    El agente analiza <strong>{getFileDisplayName(activeItem)}</strong> frente al
                    resto de la bóveda para proponer conexiones y relaciones reificadas.
                  </p>
                  <button
                    type="button"
                    className="studio-btn studio-btn-primary"
                    onClick={handleRunAgentItemAnalysis}
                    disabled={agentBusy}
                  >
                    <IconAgent size={15} />
                    {agentBusy ? 'Analizando…' : 'Analizar y sugerir conexiones'}
                  </button>
                </section>

                {activeAgentReport && (
                  <section className="studio-insp-block">
                    <div className="studio-agent-box">
                      <span className="studio-agent-tag">
                        <IconAgent size={12} /> {activeAgentReport.agentName}
                      </span>
                      {activeAgentReport.summary && (
                        <p className="studio-agent-summary">{activeAgentReport.summary}</p>
                      )}
                    </div>

                    <h4 className="studio-pane-eyebrow">
                      Conexiones sugeridas ({activeAgentReport.suggestions.length})
                    </h4>
                    {activeAgentReport.suggestions.length === 0 ? (
                      <p className="studio-muted">
                        No se detectaron nuevas conexiones pendientes para este archivo.
                      </p>
                    ) : (
                      <ul className="studio-suggestion-list">
                        {activeAgentReport.suggestions.map((sug) => {
                          const target = itemsById[sug.targetId];
                          if (!target) return null;
                          return (
                            <li key={sug.targetId} className="studio-suggestion-card">
                              <div className="studio-suggestion-top">
                                <strong>{sug.targetTitle}</strong>
                                <span className="studio-rel-badge">{sug.relationLabel}</span>
                              </div>
                              <p className="studio-suggestion-reason">{sug.reason}</p>
                              {user && (
                                <div className="studio-suggestion-actions">
                                  <button
                                    type="button"
                                    className="studio-mini-action"
                                    onClick={async () => {
                                      const nextMd = `${draftMarkdown.trimEnd()}\n- [[${target.title}]] *(${sug.relationLabel})*\n`;
                                      setDraftMarkdown(nextMd);
                                      await mutateItem(activeItem.id, {
                                        markdownContent: nextMd,
                                        relatedIds: Array.from(
                                          new Set([...(activeItem.relatedIds || []), target.id])
                                        ),
                                        authorKind: 'hybrid',
                                      });
                                    }}
                                  >
                                    + Enlazar [[ ]]
                                  </button>
                                  <button
                                    type="button"
                                    className="studio-mini-action is-accent"
                                    onClick={() =>
                                      createRelationBetween({
                                        source: activeItem,
                                        target,
                                        label: sug.relationLabel,
                                        authorKind: 'agent',
                                        authorName: activeAgentReport.agentName,
                                        reviewStatus: 'pending',
                                        reason: sug.reason,
                                      })
                                    }
                                  >
                                    + Relación .md
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}

                <section className="studio-insp-block">
                  <button
                    type="button"
                    className="studio-btn studio-btn-secondary"
                    onClick={() => {
                      setSynthScope(activeItem.category);
                      setSynthQuestion(
                        `Analiza cómo encaja "${activeItem.title}" dentro de ${activeItem.category} y qué conexiones faltan.`
                      );
                      setViewMode('analysis');
                    }}
                  >
                    Abrir en Mesa de Análisis IA ↗
                  </button>
                </section>
              </div>
            )}
          </aside>
        </main>
      )}

      {/* =================================================================
          MODALES
      ================================================================= */}
      <LightDismissDialog
        open={newNoteModalOpen}
        onClose={() => setNewNoteModalOpen(false)}
        title="Nuevo archivo Markdown (.md)"
        subtitle="Se añadirá a la lista de la categoría seleccionada"
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
              list="studio-cat-options"
            />
            <datalist id="studio-cat-options">
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
            <button type="submit" className="studio-btn studio-btn-primary">
              Crear archivo .md
            </button>
          </div>
        </form>
      </LightDismissDialog>

      <LightDismissDialog
        open={newCategoryModalOpen}
        onClose={() => setNewCategoryModalOpen(false)}
        title="Nueva Lista / Categoría"
        subtitle="Organiza tus archivos .md, multimedia y relaciones"
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
              colorKey: 'indigo',
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
              placeholder="Ej: Investigación, Fuentes PDF, Agentes…"
              className="keep-input"
            />
          </div>
          <div className="share-section">
            <label className="share-label">Color identificador</label>
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
            <button type="submit" className="studio-btn studio-btn-primary">
              Crear lista
            </button>
          </div>
        </form>
      </LightDismissDialog>

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
      <StudioVaultApp />
    </AuthProvider>
  );
}
