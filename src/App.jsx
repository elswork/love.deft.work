import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import EnrichmentService from './services/EnrichmentService';
import AttachmentService from './services/AttachmentService';
import {
  buildInitialMarkdown,
  computeVaultConnections,
  getFileBadge,
  getFileDisplayName,
} from './services/MarkdownVaultService';
import {
  connectAgentTransport,
  createInitialAgents,
  createLogEntry,
  runStreamingAgentTask,
} from './services/AgentStreamAdapter';
import { seedPlatformVault } from './services/PlatformSeedService';
import { buildLocalPlatformSnapshot } from './data/platform_vault';
import { getColorConfig } from './data/keep_palette';
import SidebarExplorer from './components/SidebarExplorer';
import AgentWorkspaceCanvas from './components/AgentWorkspaceCanvas';
import TelemetryInspector from './components/TelemetryInspector';
import AgentCommandPalette from './components/AgentCommandPalette';
import LightDismissDialog from './components/LightDismissDialog';
import {
  IconCommand,
  IconFolder,
  IconMoon,
  IconSun,
  IconTerminal,
  IconVault,
} from './components/VaultIcons';

const ShareModal = lazy(() => import('./components/ShareModal'));

/**
 * Sincronización reactiva con Firestore (`discoveries` y `categories`).
 * Si Firestore está limpio tras purgar contenido de prueba, carga la instantánea
 * operativa de plataforma en memoria mientras se sincroniza persistentemente.
 */
function useVaultData(onFirstLoad) {
  const [items, setItems] = useState([]);
  const [categoriesDocs, setCategoriesDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [isLocalOnly, setIsLocalOnly] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    const q = query(collection(db, 'discoveries'), orderBy('createdAt', 'desc'));
    const unsubItems = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.docs.length === 0) {
          const fallback = buildLocalPlatformSnapshot(
            EnrichmentService.normalizeDiscoveryDoc,
            getColorConfig
          );
          setItems(fallback.items);
          setCategoriesDocs((prev) =>
            Object.keys(prev).length > 0 ? prev : fallback.categoriesMap
          );
          setIsLocalOnly(true);
          setLoading(false);
          if (!initializedRef.current) {
            initializedRef.current = true;
            onFirstLoad?.(fallback.items);
          }
          return;
        }

        const docs = snapshot.docs.map((d) =>
          EnrichmentService.normalizeDiscoveryDoc({ id: d.id, ...d.data() })
        );
        setItems(docs);
        setIsLocalOnly(false);
        setLoading(false);
        if (!initializedRef.current) {
          initializedRef.current = true;
          onFirstLoad?.(docs);
        }
      },
      (err) => {
        console.warn('[Vault] Error escuchando discoveries:', err);
        setLoading(false);
      }
    );

    const unsubCats = onSnapshot(
      collection(db, 'categories'),
      (snapshot) => {
        if (snapshot.docs.length === 0) return;
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
  }, [onFirstLoad]);

  return { items, setItems, categoriesDocs, setCategoriesDocs, loading, isLocalOnly };
}

function CommandCenterApp() {
  const { user, loginWithGoogle, logout } = useAuth();

  // Estados de interfaz & tema (dark-first Precision Engineering)
  const [renderedScheme, setRenderedScheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('color-scheme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'dark';
  });

  const [viewMode, setViewMode] = useState('stream'); // 'stream' | 'studio' | 'graph'
  const [studioSubMode, setStudioSubMode] = useState('split'); // 'preview' | 'split' | 'edit'
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState('04 · Hoja de Ruta & Backlog Vivo');
  const [seedingPlatform, setSeedingPlatform] = useState(false);

  // Filtros y selección de Bóveda
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [expandedCats, setExpandedCats] = useState({});
  const [dragTargetCategory, setDragTargetCategory] = useState('');
  const [activeItemId, setActiveItemId] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // WikiLink autocomplete
  const [wikiSuggestQuery, setWikiSuggestQuery] = useState('');
  const [showWikiSuggest, setShowWikiSuggest] = useState(false);
  const editorTextareaRef = useRef(null);

  // Upload & Share
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const uploadInputRef = useRef(null);
  const [shareTarget, setShareTarget] = useState(null);

  // Runtime de Agentes & Streaming
  const [agents, setAgents] = useState(() => createInitialAgents([]));
  const [activeAgentId, setActiveAgentId] = useState('athena');
  const [logs, setLogs] = useState(() => [
    createLogEntry('info', 'SYSTEM', 'Command Center inicializado · Stream SSE/WS listo.'),
    createLogEntry('hitl', 'ATH-01', 'ATH-01 · Propuesta de crecimiento lista (Web Clipper MV3 + Ingesta): esperando [A] Aprobar.'),
  ]);
  const [transportMode, setTransportMode] = useState('simulator');
  const [transportEndpoint, setTransportEndpoint] = useState('');

  // Control de pausa / cancelación de streams activos por agente
  const runControlRef = useRef({});

  const appendLog = useCallback((entry) => {
    setLogs((prev) => [entry, ...prev].slice(0, 120));
  }, []);

  const patchAgent = useCallback((agentId, updater) => {
    setAgents((prev) =>
      prev.map((ag) => {
        if (ag.id !== agentId) return ag;
        const patch = typeof updater === 'function' ? updater(ag) : updater;
        return { ...ag, ...patch };
      })
    );
  }, []);

  const handleFirstVaultLoad = useCallback((docs) => {
    const first = docs[0];
    if (first) {
      const byId = Object.fromEntries(docs.map((d) => [d.id, d]));
      setActiveItemId(first.id);
      setDraftTitle(first.title);
      setDraftMarkdown(buildInitialMarkdown(first, byId));
    }
    setAgents(createInitialAgents(docs));
  }, []);

  const { items, setItems, categoriesDocs, setCategoriesDocs, loading, isLocalOnly } =
    useVaultData(handleFirstVaultLoad);

  const itemsById = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, it])),
    [items]
  );

  // Filtrado por visibilidad pública / privada
  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (it.isPublic !== false) return true;
      if (!user) return false;
      if (user.email === 'elswork@gmail.com') return true;
      if (it.ownerUid === user.uid) return true;
      if (it.sharedWith?.includes(user.email)) return true;
      return false;
    });
  }, [items, user]);

  // Filtro de búsqueda + tipo en barra lateral
  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleItems.filter((it) => {
      const badge = getFileBadge(it);
      if (filterType === 'md' && badge.kind !== 'markdown') return false;
      if (
        filterType === 'media' &&
        !['image', 'pdf', 'video', 'audio'].includes(badge.kind)
      ) {
        return false;
      }
      if (filterType === 'relations' && it.kind !== 'relation') return false;
      if (
        filterType === 'agent' &&
        it.authorKind !== 'agent' &&
        it.authorKind !== 'hybrid'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        getFileDisplayName(it).toLowerCase().includes(q) ||
        (it.note || '').toLowerCase().includes(q) ||
        (it.markdownContent || '').toLowerCase().includes(q) ||
        (it.category || '').toLowerCase().includes(q)
      );
    });
  }, [visibleItems, filterType, searchQuery]);

  // Construcción de categorías estilo Obsidian (todas las extensiones unificadas)
  const categories = useMemo(() => {
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

  const categoriesMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c])),
    [categories]
  );

  const activeItem =
    visibleItems.find((it) => it.id === activeItemId) || visibleItems[0] || null;

  const activeAgent =
    agents.find((ag) => ag.id === activeAgentId) || agents[0] || null;

  const activeConnections = useMemo(
    () => computeVaultConnections(activeItem, visibleItems),
    [activeItem, visibleItems]
  );

  const vaultAnalytics = useMemo(() => {
    let totalLinks = 0;
    const orphans = [];
    visibleItems.forEach((it) => {
      const conns = computeVaultConnections(it, visibleItems);
      const degree =
        conns.outgoing.length + conns.backlinks.length + conns.relations.length;
      totalLinks += conns.outgoing.length;
      if (degree === 0) orphans.push(it);
    });
    return {
      totalFiles: visibleItems.length,
      totalLinks,
      orphans,
    };
  }, [visibleItems]);

  // Selección explícita de archivo (actualiza editor sin setState-in-effect)
  const handleSelectFile = useCallback(
    (item) => {
      if (!item) return;
      setActiveItemId(item.id);
      setDraftTitle(item.title || '');
      setDraftMarkdown(buildInitialMarkdown(item, itemsById));
      setDirty(false);
      setShowWikiSuggest(false);
    },
    [itemsById]
  );

  // Cambio de tema Dark/Light
  const handleToggleTheme = useCallback(() => {
    const next = renderedScheme === 'dark' ? 'light' : 'dark';
    setRenderedScheme(next);
    try {
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.content = next;
      localStorage.setItem('color-scheme', next);
    } catch {
      // ignore storage failure
    }
  }, [renderedScheme]);

  // Conexión de transporte SSE / WebSocket si el usuario configura un endpoint externo
  useEffect(() => {
    if (transportMode === 'simulator' || !transportEndpoint.trim()) return;
    const conn = connectAgentTransport({
      mode: transportMode,
      endpoint: transportEndpoint.trim(),
      onEvent: (frame) => {
        if (frame?.agentId) {
          patchAgent(frame.agentId, frame.patch || {});
        }
        if (frame?.log) {
          appendLog(createLogEntry('tool', frame.agentId || 'REMOTE', frame.log));
        }
      },
      onError: () => {
        appendLog(
          createLogEntry(
            'warn',
            transportMode.toUpperCase(),
            `Error de conexión en ${transportEndpoint}`
          )
        );
      },
    });
    return () => conn.disconnect();
  }, [transportMode, transportEndpoint, patchAgent, appendLog]);

  // Mutaciones Firestore
  const mutateItem = useCallback(
    async (id, patch) => {
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
    },
    [setItems, user]
  );

  const ensureCategoryDoc = useCallback(
    async (catName) => {
      if (!catName || categoriesDocs[catName]) return;
      const color = getColorConfig(catName);
      setCategoriesDocs((prev) => ({
        ...prev,
        [catName]: { id: catName, name: catName, colorKey: color.key, isPublic: true },
      }));
      if (!user) return;
      try {
        await setDoc(
          doc(db, 'categories', catName),
          {
            name: catName,
            colorKey: color.key,
            isPublic: true,
            sharedWith: [],
            ownerUid: user.uid,
            ownerEmail: user.email || '',
            order: Date.now(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // ignore if offline
      }
    },
    [categoriesDocs, setCategoriesDocs, user]
  );

  const createMarkdownFile = useCallback(
    async ({
      title,
      category = 'Anticitera',
      markdownContent = '',
      attachment = null,
      kind = 'file',
      sourceId = '',
      targetId = '',
      relationLabel = '',
      authorKind = 'human',
      authorName = '',
      reviewStatus = 'verified',
      openInStudio = true,
    }) => {
      const cleanTitle = String(title || 'nueva-nota').trim();
      await ensureCategoryDoc(category);
      const initialMd =
        markdownContent || `# ${cleanTitle}\n\n## Notas y conexiones\n`;

      const tempId = `local-${Date.now()}`;
      const localItem = EnrichmentService.normalizeDiscoveryDoc({
        id: tempId,
        title: cleanTitle,
        name: cleanTitle,
        type: 'phrase',
        kind,
        sourceId,
        targetId,
        relationLabel,
        authorKind,
        authorName: authorName || user?.displayName || user?.email || 'Humano',
        reviewStatus,
        attachment,
        markdownContent: initialMd,
        category,
        relatedIds: [sourceId, targetId].filter(Boolean),
        colorKey: getColorConfig(category).key,
        isPublic: true,
        sharedWith: [],
      });

      if (!user) {
        setItems((prev) => [localItem, ...prev]);
        handleSelectFile(localItem);
        if (openInStudio) setViewMode('studio');
        return tempId;
      }

      const payload = {
        title: cleanTitle,
        name: cleanTitle,
        type: 'phrase',
        kind,
        sourceId,
        targetId,
        relationLabel,
        authorKind,
        authorName: authorName || user.displayName || user.email || '',
        reviewStatus,
        url: '',
        domain: '',
        favicon: '',
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
        isPublic: true,
        sharedWith: [],
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, 'discoveries'), payload);
      handleSelectFile({ ...localItem, id: ref.id });
      if (openInStudio) setViewMode('studio');
      return ref.id;
    },
    [ensureCategoryDoc, handleSelectFile, setItems, user]
  );

  // Flujos HITL: Aprobar, Rechazar/Pedir revisión, Pausar/Reanudar, Dispatch/Redirección
  const handleApproveAgent = useCallback(
    async (agentId) => {
      const ag = agents.find((a) => a.id === agentId);
      if (!ag) return;

      patchAgent(agentId, {
        status: 'completed',
        progress: 100,
        currentTool: 'hitl.approved',
      });
      appendLog(
        createLogEntry('done', ag.codename, `Aprobación HITL confirmada para "${ag.proposal?.title || ag.name}".`)
      );

      if (ag.proposal?.markdownContent) {
        const isRelation = ag.proposal.kind === 'create_relation' && ag.proposal.targetId;
        await createMarkdownFile({
          title: ag.proposal.title,
          category: ag.proposal.category || '03 · Motor de Crecimiento & Ingesta',
          markdownContent: ag.proposal.markdownContent,
          kind: isRelation ? 'relation' : 'file',
          sourceId: ag.proposal.sourceId || '',
          targetId: ag.proposal.targetId || '',
          relationLabel: ag.proposal.relationLabel || '',
          authorKind: 'hybrid',
          authorName: ag.name,
          reviewStatus: 'verified',
          openInStudio: false,
        });
      }
      patchAgent(agentId, { proposal: null });
    },
    [agents, appendLog, createMarkdownFile, patchAgent]
  );

  const handleRejectAgent = useCallback(
    (agentId) => {
      const ag = agents.find((a) => a.id === agentId);
      if (!ag) return;
      patchAgent(agentId, {
        status: 'rejected',
        currentTool: 'hitl.revision_requested',
      });
      appendLog(
        createLogEntry(
          'warn',
          ag.codename,
          `Revisión humana solicitada sobre "${ag.proposal?.title || ag.targetTitle}".`
        )
      );
    },
    [agents, appendLog, patchAgent]
  );

  const handleTogglePauseAgent = useCallback(
    (agentId) => {
      const ag = agents.find((a) => a.id === agentId);
      if (!ag) return;
      const ctrl = runControlRef.current[agentId] || { paused: false, aborted: false };
      if (ag.status === 'paused') {
        ctrl.paused = false;
        runControlRef.current[agentId] = ctrl;
        patchAgent(agentId, { status: 'thinking', currentTool: 'resumed' });
        appendLog(createLogEntry('info', ag.codename, 'Ejecución reanudada por operador humano.'));
      } else {
        ctrl.paused = true;
        runControlRef.current[agentId] = ctrl;
        patchAgent(agentId, { status: 'paused', currentTool: 'paused_by_human' });
        appendLog(createLogEntry('warn', ag.codename, 'Agente pausado por control humano.'));
      }
    },
    [agents, appendLog, patchAgent]
  );

  const handleDispatchPrompt = useCallback(
    async (agentId, promptText, scope = 'ACTIVE_ITEM') => {
      if (runControlRef.current[agentId]) {
        runControlRef.current[agentId].aborted = true;
      }
      const tokenCtrl = { paused: false, aborted: false };
      runControlRef.current[agentId] = tokenCtrl;

      const scopeItems =
        scope === 'ACTIVE_ITEM'
          ? visibleItems
          : scope === 'ALL'
          ? visibleItems
          : visibleItems.filter(
              (it) =>
                it.category === scope || (it.extraCategories || []).includes(scope)
            );
      const scopeLabel =
        scope === 'ACTIVE_ITEM'
          ? activeItem
            ? getFileDisplayName(activeItem)
            : 'Toda la bóveda'
          : scope === 'ALL'
          ? 'Toda la bóveda'
          : `Categoría: ${scope}`;

      await runStreamingAgentTask({
        agentId,
        prompt: promptText,
        taskType: scope === 'ACTIVE_ITEM' && activeItem ? 'analyze_item' : 'synthesize',
        activeItem: scope === 'ACTIVE_ITEM' ? activeItem : null,
        allItems: scopeItems,
        scopeLabel,
        shouldAbort: () => tokenCtrl.aborted,
        isPaused: () => tokenCtrl.paused,
        onPatchAgent: patchAgent,
        onLog: appendLog,
      });
    },
    [activeItem, appendLog, patchAgent, visibleItems]
  );

  const handleAnalyzeActiveItem = useCallback(() => {
    if (!activeItem) return;
    setViewMode('stream');
    handleDispatchPrompt(
      activeAgentId,
      `Analiza en profundidad ${getFileDisplayName(activeItem)} y propón enlaces o mejoras.`,
      'ACTIVE_ITEM'
    );
  }, [activeAgentId, activeItem, handleDispatchPrompt]);

  // Subida y edición de archivos
  const handleSaveActiveDraft = useCallback(async () => {
    if (!activeItem || !user) return;
    setSaving(true);
    try {
      await mutateItem(activeItem.id, {
        title: draftTitle.trim() || activeItem.title,
        name: draftTitle.trim() || activeItem.title,
        markdownContent: draftMarkdown,
      });
      setDirty(false);
      appendLog(
        createLogEntry('done', 'VAULT', `Archivo guardado: ${draftTitle.trim() || activeItem.title}`)
      );
    } finally {
      setSaving(false);
    }
  }, [activeItem, appendLog, draftMarkdown, draftTitle, mutateItem, user]);

  const handleUploadNewFile = useCallback(
    async (file, targetCategory = 'Multimedia & PDF') => {
      if (!file) return;
      if (!user) {
        await loginWithGoogle();
        return;
      }
      setUploadError('');
      try {
        setUploadProgress(0);
        const uploaded = await AttachmentService.uploadAttachment(file, user.uid, (pct) =>
          setUploadProgress(pct)
        );
        const initialMd =
          file.name.toLowerCase().endsWith('.md') || file.type === 'text/markdown'
            ? await file.text()
            : `# ${AttachmentService.cleanFileTitle(file.name)}\n\n![[${file.name}]]\n\n## Notas y conexiones\n`;

        await createMarkdownFile({
          title: file.name.toLowerCase().endsWith('.md')
            ? AttachmentService.cleanFileTitle(file.name)
            : file.name,
          category: targetCategory,
          markdownContent: initialMd,
          attachment: uploaded,
        });
        appendLog(createLogEntry('done', 'STORAGE', `Subido ${file.name} → ${targetCategory}`));
      } catch (err) {
        setUploadError(err?.message || 'Error al subir el archivo.');
      } finally {
        setUploadProgress(null);
      }
    },
    [appendLog, createMarkdownFile, loginWithGoogle, user]
  );

  const handleAttachToActiveItem = useCallback(
    async (file) => {
      if (!file || !activeItem || !user) return;
      setUploadError('');
      try {
        setUploadProgress(0);
        const prevPath = activeItem.attachment?.storagePath;
        const uploaded = await AttachmentService.uploadAttachment(file, user.uid, (pct) =>
          setUploadProgress(pct)
        );
        await mutateItem(activeItem.id, { attachment: uploaded });
        if (prevPath) await AttachmentService.deleteAttachment(prevPath);
        appendLog(createLogEntry('done', 'STORAGE', `Adjunto vinculado: ${file.name}`));
      } catch (err) {
        setUploadError(err?.message || 'Error al adjuntar.');
      } finally {
        setUploadProgress(null);
      }
    },
    [activeItem, appendLog, mutateItem, user]
  );

  const handleCreateRelation = useCallback(
    async (source, targetId, label = 'complementa') => {
      const target = itemsById[targetId];
      if (!source || !target) return;
      const cleanLabel = String(label || 'conecta con').trim();
      const relTitle = `${source.title} — ${cleanLabel} → ${target.title}`;
      const relMd = [
        `# ${relTitle}`,
        '',
        `- **Origen**: [[${source.title}]] (${source.category})`,
        `- **Tipo de relación**: \`${cleanLabel}\``,
        `- **Destino**: [[${target.title}]] (${target.category})`,
        '',
        '## Contexto de la relación',
        `Relación reificada entre [[${source.title}]] y [[${target.title}]].`,
      ].join('\n');

      await createMarkdownFile({
        title: relTitle,
        category: '06 · Relaciones Estructurales',
        markdownContent: relMd,
        kind: 'relation',
        sourceId: source.id,
        targetId: target.id,
        relationLabel: cleanLabel,
        authorKind: 'human',
        openInStudio: false,
      });
      appendLog(createLogEntry('done', 'GRAPH', `Relación creada: ${source.title} —[${cleanLabel}]→ ${target.title}`));
    },
    [appendLog, createMarkdownFile, itemsById]
  );

  const handleResetToPlatformVault = useCallback(async () => {
    if (seedingPlatform) return;
    if (!user) {
      await loginWithGoogle();
      return;
    }
    setSeedingPlatform(true);
    try {
      const res = await seedPlatformVault({
        user,
        purgeExisting: true,
        onProgressLog: (msg) => appendLog(createLogEntry('info', 'BOOTSTRAP', msg)),
      });
      setActiveItemId('plat-vision-v3');
      setDirty(false);
      setAgents(createInitialAgents([]));
      appendLog(
        createLogEntry(
          'done',
          'BOOTSTRAP',
          `Bóveda real cargada: ${res.categoriesCount} categorías, ${res.itemsCount} nodos operativos.`
        )
      );
    } catch (err) {
      appendLog(
        createLogEntry('warn', 'BOOTSTRAP', err?.message || 'Error al cargar bóveda real.')
      );
    } finally {
      setSeedingPlatform(false);
    }
  }, [appendLog, loginWithGoogle, seedingPlatform, user]);

  const hasLegacyDemoItems = useMemo(
    () => items.some((it) => String(it.id).startsWith('demo-') || it.id === '8lSZrcwFSKS4e7MBLyP2'),
    [items]
  );

  const autoSeedTriggeredRef = useRef(false);
  useEffect(() => {
    if (!isLocalOnly || user?.email !== 'elswork@gmail.com' || autoSeedTriggeredRef.current) {
      return;
    }
    autoSeedTriggeredRef.current = true;
    void seedPlatformVault({
      user,
      purgeExisting: false,
      onProgressLog: (msg) => appendLog(createLogEntry('info', 'BOOTSTRAP', msg)),
    }).catch((err) => {
      console.warn('[AutoSeed]', err);
    });
  }, [appendLog, isLocalOnly, user]);

  const handleDeleteItem = useCallback(
    async (it) => {
      if (!user || !it) return;
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      if (activeItemId === it.id) setActiveItemId('');
      try {
        await deleteDoc(doc(db, 'discoveries', it.id));
        if (it.attachment?.storagePath) {
          await AttachmentService.deleteAttachment(it.attachment.storagePath);
        }
        appendLog(createLogEntry('warn', 'VAULT', `Archivo eliminado: ${getFileDisplayName(it)}`));
      } catch (err) {
        console.error('[Vault] Error al eliminar:', err);
      }
    },
    [activeItemId, appendLog, setItems, user]
  );

  // Autocompletado de WikiLinks [[
  const handleEditorChange = (val) => {
    setDraftMarkdown(val);
    setDirty(true);
    const ta = editorTextareaRef.current;
    const pos = ta ? ta.selectionStart : val.length;
    const match = val.slice(0, pos).match(/\[\[([^\]\n]*)$/);
    if (match) {
      setWikiSuggestQuery(match[1]);
      setShowWikiSuggest(true);
    } else {
      setShowWikiSuggest(false);
    }
  };

  const wikiSuggestions = useMemo(() => {
    if (!showWikiSuggest) return [];
    const q = wikiSuggestQuery.trim().toLowerCase();
    return visibleItems
      .filter((it) => it.id !== activeItem?.id)
      .filter((it) => !q || getFileDisplayName(it).toLowerCase().includes(q))
      .slice(0, 6);
  }, [activeItem?.id, showWikiSuggest, visibleItems, wikiSuggestQuery]);

  const handleInsertWikiSuggestion = (targetItem) => {
    const ta = editorTextareaRef.current;
    const pos = ta ? ta.selectionStart : draftMarkdown.length;
    const before = draftMarkdown.slice(0, pos).replace(/\[\[([^\]\n]*)$/, `[[${targetItem.title}]]`);
    const after = draftMarkdown.slice(pos);
    setDraftMarkdown(before + after);
    setDirty(true);
    setShowWikiSuggest(false);
  };

  // Atajos globales de Command Center (Cmd+K, 1/2/3, A/R/P, J/K, N)
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
        return;
      }

      if (commandOpen || newNoteOpen || shareTarget) return;

      const tag = document.activeElement?.tagName;
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        document.activeElement?.isContentEditable;
      if (isTyping || e.isComposing || e.keyCode === 229) return;

      const key = e.key.toLowerCase();
      if (key === '1') {
        e.preventDefault();
        setViewMode('stream');
      } else if (key === '2') {
        e.preventDefault();
        setViewMode('studio');
      } else if (key === '3') {
        e.preventDefault();
        setViewMode('graph');
      } else if (key === 'a' && activeAgent?.status === 'awaiting_approval') {
        e.preventDefault();
        handleApproveAgent(activeAgent.id);
      } else if (key === 'r' && activeAgent?.status === 'awaiting_approval') {
        e.preventDefault();
        handleRejectAgent(activeAgent.id);
      } else if (key === 'p' && activeAgent) {
        e.preventDefault();
        handleTogglePauseAgent(activeAgent.id);
      } else if (key === 'n') {
        e.preventDefault();
        setNewNoteOpen(true);
      } else if ((key === 'j' || key === 'k') && viewMode === 'stream' && agents.length > 0) {
        e.preventDefault();
        const cur = agents.findIndex((a) => a.id === activeAgentId);
        const delta = key === 'j' ? 1 : -1;
        const nextIdx = (cur + delta + agents.length) % agents.length;
        setActiveAgentId(agents[nextIdx].id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeAgent,
    activeAgentId,
    agents,
    commandOpen,
    handleApproveAgent,
    handleRejectAgent,
    handleTogglePauseAgent,
    newNoteOpen,
    shareTarget,
    viewMode,
  ]);

  const handleSubmitNewNote = async (e) => {
    e.preventDefault();
    const title = newNoteTitle.trim();
    if (!title) return;
    await createMarkdownFile({
      title,
      category: newNoteCategory || 'Anticitera',
    });
    setNewNoteTitle('');
    setNewNoteOpen(false);
  };

  return (
    <div className="cc-shell">
      {/* Barra superior ultra-compacta Precision Engineering */}
      <header className="cc-topbar">
        <div className="cc-brand-group">
          <button
            type="button"
            className="cc-mobile-menu-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Abrir explorador de agentes y bóveda"
          >
            <IconFolder size={16} />
          </button>

          <div className="cc-brand">
            <span className="cc-brand-icon">
              <IconVault size={16} />
            </span>
            <span className="cc-brand-name">love.deft.work</span>
            <span className="cc-env-badge">COMMAND v3</span>
          </div>
        </div>

        <button
          type="button"
          className="cc-cmd-trigger"
          onClick={() => setCommandOpen(true)}
          aria-label="Abrir paleta de comandos"
        >
          <IconCommand size={13} />
          <span>Buscar archivo o ejecutar comando...</span>
          <kbd className="cc-kbd">⌘K</kbd>
        </button>

        <div className="cc-topbar-right">
          <button
            type="button"
            className="cc-icon-btn"
            onClick={handleToggleTheme}
            title={renderedScheme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            aria-label="Alternar tema"
          >
            {renderedScheme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
          </button>

          <button
            type="button"
            className="cc-mobile-inspector-btn"
            onClick={() => setInspectorOpen((v) => !v)}
            aria-label="Abrir inspector de logs y conexiones"
          >
            <IconTerminal size={15} />
          </button>

          {user ? (
            <button type="button" className="cc-user-pill" onClick={logout} title="Cerrar sesión">
              <span className="cc-status-dot tone-emerald" />
              <span>{user.displayName?.split(' ')[0] || user.email}</span>
            </button>
          ) : (
            <button
              type="button"
              className="cc-btn cc-btn-primary cc-btn-sm"
              onClick={loginWithGoogle}
            >
              Conectar Google
            </button>
          )}
        </div>
      </header>

      {user && (hasLegacyDemoItems || isLocalOnly) && (
        <div className="cc-migration-banner">
          <span>
            {hasLegacyDemoItems
              ? 'Contenido de prueba detectado en Firestore. Reemplázalo por la bóveda real de operación y crecimiento de la plataforma (18 nodos + diagrama SVG).'
              : 'Bóveda real de plataforma activa en cliente (18 nodos). Sincronízala ahora con Firestore y Storage de free-deft-work.'}
          </span>
          <button
            type="button"
            className="cc-btn cc-btn-primary cc-btn-sm"
            disabled={seedingPlatform}
            onClick={handleResetToPlatformVault}
          >
            {seedingPlatform
              ? 'Sincronizando bóveda...'
              : hasLegacyDemoItems
              ? 'Purgar pruebas y cargar Bóveda de Plataforma'
              : 'Persistir Bóveda Real en Firestore'}
          </button>
        </div>
      )}

      {/* Grid 3-paneles: Sidebar | Workspace Canvas | Telemetry Inspector */}
      <div className="cc-workbench">
        <SidebarExplorer
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          agents={agents}
          activeAgentId={activeAgentId}
          onSelectAgent={(id) => {
            setActiveAgentId(id);
            setViewMode('stream');
          }}
          onTogglePauseAgent={handleTogglePauseAgent}
          categories={categories}
          expandedCats={expandedCats}
          onToggleCategory={(name) =>
            setExpandedCats((prev) => ({
              ...prev,
              [name]: prev[name] === false,
            }))
          }
          activeItemId={activeItem?.id}
          onSelectFile={(it) => {
            handleSelectFile(it);
            setViewMode('studio');
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          onCreateNewMarkdown={() => setNewNoteOpen(true)}
          onUploadFileTrigger={() => uploadInputRef.current?.click()}
          onDropFileOnCategory={handleUploadNewFile}
          dragTargetCategory={dragTargetCategory}
          onSetDragTargetCategory={setDragTargetCategory}
        />

        {loading && visibleItems.length === 0 ? (
          <main className="cc-canvas cc-canvas-loading">
            <div className="cc-skeleton-line" />
            <div className="cc-skeleton-block" />
          </main>
        ) : (
          <AgentWorkspaceCanvas
            viewMode={viewMode}
            onSetViewMode={setViewMode}
            agents={agents}
            activeAgent={activeAgent}
            onSelectAgent={(id) => setActiveAgentId(id)}
            onApproveAgent={handleApproveAgent}
            onRejectAgent={handleRejectAgent}
            onTogglePauseAgent={handleTogglePauseAgent}
            onDispatchPrompt={handleDispatchPrompt}
            categories={categories}
            categoriesMap={categoriesMap}
            allItems={visibleItems}
            activeItem={activeItem}
            vaultAnalytics={vaultAnalytics}
            draftTitle={draftTitle}
            onDraftTitleChange={(v) => {
              setDraftTitle(v);
              setDirty(true);
            }}
            draftMarkdown={draftMarkdown}
            onEditorChange={handleEditorChange}
            editorTextareaRef={editorTextareaRef}
            studioSubMode={studioSubMode}
            onSetStudioSubMode={setStudioSubMode}
            dirty={dirty}
            saving={saving}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
            showWikiSuggest={showWikiSuggest}
            wikiSuggestions={wikiSuggestions}
            onInsertWikiSuggestion={handleInsertWikiSuggestion}
            onSaveDraft={handleSaveActiveDraft}
            onSelectItem={handleSelectFile}
            onCreateMissingNote={(title) =>
              createMarkdownFile({ title, category: activeItem?.category || 'Anticitera' })
            }
            onAnalyzeActiveItem={handleAnalyzeActiveItem}
            onShareItem={(it) =>
              setShareTarget({
                kind: 'item',
                item: it,
                relatedItems: activeConnections.outgoing.map((o) => o.item),
              })
            }
            onTogglePinItem={(it) => mutateItem(it.id, { pinned: !it.pinned })}
            onVerifyPendingItem={(id) => mutateItem(id, { reviewStatus: 'verified' })}
            onDeleteItem={handleDeleteItem}
            onAttachFile={handleAttachToActiveItem}
            canEdit={Boolean(user)}
          />
        )}

        <TelemetryInspector
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          activeAgent={activeAgent}
          logs={logs}
          transportMode={transportMode}
          transportEndpoint={transportEndpoint}
          onChangeTransport={(m, ep) => {
            setTransportMode(m);
            if (typeof ep === 'string') setTransportEndpoint(ep);
          }}
          activeItem={activeItem}
          allItems={visibleItems}
          activeConnections={activeConnections}
          onSelectFile={(it) => {
            handleSelectFile(it);
            setViewMode('studio');
          }}
          onCreateRelation={handleCreateRelation}
          canEdit={Boolean(user)}
        />
      </div>

      {/* Input oculto para subida rápida de multimedia/md */}
      <input
        ref={uploadInputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadNewFile(f, activeItem?.category || '01 · Arquitectura & Núcleo');
          e.target.value = '';
        }}
      />

      {/* Paleta Cmd/Ctrl + K */}
      <AgentCommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        items={visibleItems}
        agents={agents}
        activeAgent={activeAgent}
        activeItem={activeItem}
        onSelectItem={(it) => handleSelectFile(it)}
        onSelectAgent={(id) => setActiveAgentId(id)}
        onSwitchView={(m) => setViewMode(m)}
        onApproveAgent={handleApproveAgent}
        onRejectAgent={handleRejectAgent}
        onTogglePauseAgent={handleTogglePauseAgent}
        onAnalyzeActiveItem={handleAnalyzeActiveItem}
        onCreateNewNote={() => setNewNoteOpen(true)}
        onToggleTheme={handleToggleTheme}
        onResetToPlatformVault={handleResetToPlatformVault}
        canEdit={Boolean(user)}
      />

      {/* Diálogo ligero para crear nueva nota .md */}
      <LightDismissDialog
        open={newNoteOpen}
        onClose={() => setNewNoteOpen(false)}
        title="Nueva nota Markdown (.md)"
        subtitle="Se añadirá inmediatamente al grafo y a la categoría elegida"
        maxWidth="440px"
      >
        <form className="cc-new-note-form" onSubmit={handleSubmitNewNote}>
          <label className="cc-form-field">
            <span>Nombre del archivo</span>
            <input
              type="text"
              className="keep-input"
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.isComposing || e.keyCode === 229) return;
              }}
              placeholder="Ej: Protocolo de Handoff Multi-Agente"
              autoFocus
            />
          </label>

          <label className="cc-form-field">
            <span>Categoría</span>
            <select
              className="keep-input"
              value={newNoteCategory}
              onChange={(e) => setNewNoteCategory(e.target.value)}
            >
              {Array.from(
                new Set([
                  '01 · Arquitectura & Núcleo',
                  '03 · Motor de Crecimiento & Ingesta',
                  '04 · Hoja de Ruta & Backlog Vivo',
                  ...categories.map((c) => c.name),
                ])
              ).map(
                (name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                )
              )}
            </select>
          </label>

          <div className="cc-form-actions">
            <button
              type="button"
              className="keep-btn keep-btn-tonal"
              onClick={() => setNewNoteOpen(false)}
            >
              Cancelar
            </button>
            <button type="submit" className="keep-btn keep-btn-primary">
              Crear .md
            </button>
          </div>
        </form>
      </LightDismissDialog>

      {/* Modal de compartición (lazy-loaded) */}
      <Suspense fallback={null}>
        <ShareModal
          open={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
          target={shareTarget}
          canEdit={Boolean(user)}
          onUpdateSharing={async ({ isPublic, sharedWith }) => {
            if (!shareTarget?.item) return;
            await mutateItem(shareTarget.item.id, { isPublic, sharedWith });
          }}
        />
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CommandCenterApp />
    </AuthProvider>
  );
}
