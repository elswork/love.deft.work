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
import {
  compileLmWikiIndex,
  extractCodeSymbols,
  injectWikiLinkIntoMarkdown,
  parseImportedLocalFile,
} from './services/LmWikiEngine';
import {
  DEFAULT_LM_CONFIG,
  appendWikiLogEntry,
  getStorageTelemetry,
  loadLmConfig,
  loadLocalVaultSnapshot,
  loadSavedSyntheses,
  loadWikiLog,
  saveLmConfig,
  saveLocalVaultSnapshot,
  saveSyntheses,
} from './services/LocalFirstWikiStore';
import { buildLocalPlatformSnapshot } from './data/platform_vault';
import { KEEP_COLORS, getColorConfig } from './data/keep_palette';
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

  // Hidratación instantánea Local-First desde IndexedDB antes de esperar a la red
  useEffect(() => {
    let active = true;
    loadLocalVaultSnapshot().then((cached) => {
      if (!active || !cached?.items?.length || initializedRef.current) return;
      initializedRef.current = true;
      setItems(cached.items);
      if (cached.categoriesDocs && Object.keys(cached.categoriesDocs).length > 0) {
        setCategoriesDocs(cached.categoriesDocs);
      }
      setLoading(false);
      onFirstLoad?.(cached.items);
    });
    return () => {
      active = false;
    };
  }, [onFirstLoad]);

  // Espejo continuo a IndexedDB para garantizar persistencia offline local-first
  useEffect(() => {
    if (items.length === 0) return;
    void saveLocalVaultSnapshot({ items, categoriesDocs });
  }, [items, categoriesDocs]);

  useEffect(() => {
    const q = query(collection(db, 'discoveries'), orderBy('createdAt', 'desc'));
    const unsubItems = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.docs.length === 0) {
          setItems((prev) => {
            if (prev.length > 0) return prev;
            const fallback = buildLocalPlatformSnapshot(
              EnrichmentService.normalizeDiscoveryDoc,
              getColorConfig
            );
            setCategoriesDocs((catPrev) =>
              Object.keys(catPrev).length > 0 ? catPrev : fallback.categoriesMap
            );
            if (!initializedRef.current) {
              initializedRef.current = true;
              onFirstLoad?.(fallback.items);
            }
            return fallback.items;
          });
          setIsLocalOnly(true);
          setLoading(false);
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
        console.warn('[Vault] Error escuchando discoveries (continuando en modo Local-First):', err);
        setItems((prev) => {
          if (prev.length > 0) return prev;
          const fallback = buildLocalPlatformSnapshot(
            EnrichmentService.normalizeDiscoveryDoc,
            getColorConfig
          );
          setCategoriesDocs((catPrev) =>
            Object.keys(catPrev).length > 0 ? catPrev : fallback.categoriesMap
          );
          if (!initializedRef.current) {
            initializedRef.current = true;
            onFirstLoad?.(fallback.items);
          }
          return fallback.items;
        });
        setIsLocalOnly(true);
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

  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'wiki';
    const param = new URLSearchParams(window.location.search).get('view');
    if (['stream', 'studio', 'graph', 'wiki'].includes(param)) return param;
    return 'wiki';
  }); // 'stream' | 'studio' | 'graph' | 'wiki'
  const [studioSubMode, setStudioSubMode] = useState('split'); // 'preview' | 'split' | 'edit'
  const [lmConfig, setLmConfig] = useState(DEFAULT_LM_CONFIG);
  const [savedSyntheses, setSavedSyntheses] = useState([]);
  const [wikiLog, setWikiLog] = useState([]);
  const [storageTelemetry, setStorageTelemetry] = useState(null);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [indexEpoch, setIndexEpoch] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState('04 · Hoja de Ruta & Backlog Vivo');
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('cyan');
  const [deleteCatTarget, setDeleteCatTarget] = useState(null);
  const [deleteCatMode, setDeleteCatMode] = useState('move'); // 'move' | 'purge'
  const [deleteCatFallback, setDeleteCatFallback] = useState('');
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

  // Motor LM Wiki: índice semántico BM25 + conceptos auto-compilados + auto-enlaces + código
  const wikiIndex = useMemo(
    () =>
      compileLmWikiIndex(visibleItems, {
        autoLinkThreshold: lmConfig.autoLinkThreshold,
        epoch: indexEpoch,
      }),
    [visibleItems, lmConfig.autoLinkThreshold, indexEpoch]
  );

  // Hidratación Local-First del estado LM Wiki (IndexedDB) + estado online/offline
  useEffect(() => {
    let active = true;
    Promise.all([
      loadLmConfig(),
      loadSavedSyntheses(),
      loadWikiLog(),
      getStorageTelemetry(),
    ]).then(([cfg, syns, wlog, telem]) => {
      if (!active) return;
      setLmConfig(cfg);
      setSavedSyntheses(syns);
      setWikiLog(wlog);
      setStorageTelemetry(telem);
    });

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

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

  // Subida y edición de archivos (Local-First: persiste en IndexedDB aunque no haya sesión remota)
  const handleSaveActiveDraft = useCallback(async () => {
    if (!activeItem) return;
    setSaving(true);
    try {
      await mutateItem(activeItem.id, {
        title: draftTitle.trim() || activeItem.title,
        name: draftTitle.trim() || activeItem.title,
        markdownContent: draftMarkdown,
      });
      setDirty(false);
      appendLog(
        createLogEntry(
          'done',
          'VAULT',
          `Archivo guardado (${user ? 'Local + Firestore' : 'Local-First'}): ${draftTitle.trim() || activeItem.title}`
        )
      );
      const nextLog = await appendWikiLogEntry({
        action: 'EDIT',
        summary: `Editado y reindexado «${draftTitle.trim() || activeItem.title}».`,
      });
      setWikiLog(nextLog);
    } finally {
      setSaving(false);
    }
  }, [activeItem, appendLog, draftMarkdown, draftTitle, mutateItem, user]);

  // Handlers del Motor LM Wiki Autoorganizado & Local-First
  const handleSaveLmConfig = useCallback(
    async (nextCfg) => {
      const saved = await saveLmConfig(nextCfg);
      setLmConfig(saved);
      const nextLog = await appendWikiLogEntry({
        action: 'ENGINE',
        summary: `Motor LM configurado: ${saved.provider} (umbral auto-enlace ${Math.round(saved.autoLinkThreshold * 100)}%).`,
      });
      setWikiLog(nextLog);
      appendLog(createLogEntry('info', 'LMWIKI', `Motor LM actualizado → ${saved.provider}`));
    },
    [appendLog]
  );

  const handleSaveSynthesis = useCallback(
    async (article) => {
      setSavedSyntheses((prev) => {
        const next = [article, ...prev.filter((a) => a.id !== article.id)].slice(0, 80);
        void saveSyntheses(next);
        return next;
      });
      const nextLog = await appendWikiLogEntry({
        action: 'SYNTH',
        summary: `Artículo compilado: «${article.title}» (${article.engine}).`,
      });
      setWikiLog(nextLog);
      const telem = await getStorageTelemetry();
      setStorageTelemetry(telem);
      appendLog(createLogEntry('done', 'LMWIKI', `Síntesis compilada: ${article.title}`));
    },
    [appendLog]
  );

  const handlePromoteArticleToVault = useCallback(
    async (article) => {
      if (!article) return;
      await createMarkdownFile({
        title: article.title,
        category: '00 · LM Wiki · Síntesis',
        markdownContent: article.markdown,
        authorKind: 'hybrid',
        authorName: article.engine || 'LM Wiki',
        reviewStatus: 'verified',
        openInStudio: true,
      });
      const nextLog = await appendWikiLogEntry({
        action: 'PROMOTE',
        summary: `Artículo «${article.title}» promovido a bóveda permanente (.md).`,
      });
      setWikiLog(nextLog);
      appendLog(createLogEntry('done', 'LMWIKI', `Promovido a bóveda: ${article.title}`));
    },
    [appendLog, createMarkdownFile]
  );

  const handleApplyAutoLink = useCallback(
    async (suggestion) => {
      if (!suggestion?.source || !suggestion?.target) return;
      const src = itemsById[suggestion.source.id] || suggestion.source;
      const dst = itemsById[suggestion.target.id] || suggestion.target;
      const currentMd = buildInitialMarkdown(src, itemsById);
      const nextMd = injectWikiLinkIntoMarkdown(
        currentMd,
        dst.title,
        suggestion.suggestedLabel || 'conecta con'
      );
      const nextRelated = Array.from(new Set([...(src.relatedIds || []), dst.id]));
      await mutateItem(src.id, {
        markdownContent: nextMd,
        relatedIds: nextRelated,
      });
      if (activeItem?.id === src.id) {
        setDraftMarkdown(nextMd);
      }
      const nextLog = await appendWikiLogEntry({
        action: 'AUTOLINK',
        summary: `Enlazado [[${src.title}]] → [[${dst.title}]] (${suggestion.confidencePct}% · ${suggestion.sharedTerms.join(', ')}).`,
      });
      setWikiLog(nextLog);
      appendLog(
        createLogEntry(
          'done',
          'LMWIKI',
          `Auto-enlace inyectado: ${src.title} → [[${dst.title}]]`
        )
      );
    },
    [activeItem?.id, appendLog, itemsById, mutateItem]
  );

  const handleApplyBatchAutoLinks = useCallback(
    async (suggestions = []) => {
      let count = 0;
      for (const sug of suggestions) {
        await handleApplyAutoLink(sug);
        count += 1;
      }
      return count;
    },
    [handleApplyAutoLink]
  );

  const handleImportLocalFiles = useCallback(
    async (files = []) => {
      let importedCount = 0;
      for (const file of files) {
        const parsed = await parseImportedLocalFile(file, visibleItems);
        await createMarkdownFile({
          title: parsed.title,
          category: parsed.category,
          markdownContent: parsed.markdownContent,
          authorKind: 'human',
          openInStudio: false,
        });
        importedCount += 1;
      }
      if (importedCount > 0) {
        const nextLog = await appendWikiLogEntry({
          action: 'IMPORT',
          summary: `Importados ${importedCount} archivo(s) locales con indexación y auto-enlazado.`,
        });
        setWikiLog(nextLog);
        const telem = await getStorageTelemetry();
        setStorageTelemetry(telem);
        appendLog(
          createLogEntry('done', 'LMWIKI', `${importedCount} archivo(s) locales importados a la bóveda.`)
        );
      }
      return importedCount;
    },
    [appendLog, createMarkdownFile, visibleItems]
  );

  const handleQuickCaptureCode = useCallback(
    async ({ title, lang, code }) => {
      const symbols = extractCodeSymbols(code);
      const md = [
        `# ${title}`,
        '',
        `> **Fragmento de código indexado** · Lenguaje: \`${lang}\``,
        '',
        ...(symbols.length > 0
          ? ['## Símbolos detectados', symbols.map((s) => `- \`${s}\``).join('\n'), '']
          : []),
        '## Implementación',
        `\`\`\`${lang}`,
        code.trim(),
        '```',
        '',
      ].join('\n');

      await createMarkdownFile({
        title,
        category: '01 · Arquitectura & Núcleo',
        markdownContent: md,
        authorKind: 'human',
        openInStudio: false,
      });
      const nextLog = await appendWikiLogEntry({
        action: 'CODE',
        summary: `Fragmento «${title}» (${lang}) capturado e indexado (${symbols.length} símbolos).`,
      });
      setWikiLog(nextLog);
      appendLog(createLogEntry('done', 'LMWIKI', `Código indexado: ${title} (${lang})`));
    },
    [appendLog, createMarkdownFile]
  );

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
  }, [activeItemId, appendLog, setItems, user]);

  const handleSubmitNewCategory = async (e) => {
    e.preventDefault();
    const cleanName = newCatName.trim();
    if (!cleanName || !user) return;
    const color = getColorConfig(newCatColor);
    const meta = {
      name: cleanName,
      colorKey: color.key,
      pinned: false,
      order: Date.now(),
      isPublic: true,
      sharedWith: [],
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      updatedAt: serverTimestamp(),
    };
    setCategoriesDocs((prev) => ({
      ...prev,
      [cleanName]: { id: cleanName, ...meta },
    }));
    setExpandedCats((prev) => ({ ...prev, [cleanName]: true }));
    setNewCatName('');
    setNewCatOpen(false);
    try {
      await setDoc(doc(db, 'categories', cleanName), meta, { merge: true });
      appendLog(createLogEntry('done', 'VAULT', `Categoría creada: ${cleanName}`));
    } catch (err) {
      console.error('[Vault] Error creando categoría:', err);
    }
  };

  const handleRequestDeleteCategory = (cat) => {
    if (!cat || !user) return;
    const otherCats = categories.filter((c) => c.name !== cat.name).map((c) => c.name);
    setDeleteCatFallback(otherCats[0] || 'General');
    setDeleteCatMode(cat.files.length > 0 && otherCats.length > 0 ? 'move' : 'purge');
    setDeleteCatTarget(cat);
  };

  const handleConfirmDeleteCategory = async (e) => {
    e.preventDefault();
    if (!deleteCatTarget || !user) return;
    const catName = deleteCatTarget.name;
    const targetFallback = deleteCatFallback.trim() || 'General';

    const primaryItems = items.filter((it) => it.category === catName);
    const crossItems = items.filter((it) => (it.extraCategories || []).includes(catName));

    try {
      if (deleteCatMode === 'move' && primaryItems.length > 0) {
        await ensureCategoryDoc(targetFallback);
        await Promise.all(
          primaryItems.map((it) =>
            updateDoc(doc(db, 'discoveries', it.id), {
              category: targetFallback,
              updatedAt: serverTimestamp(),
            })
          )
        );
        setItems((prev) =>
          prev.map((it) => (it.category === catName ? { ...it, category: targetFallback } : it))
        );
      } else if (deleteCatMode === 'purge' && primaryItems.length > 0) {
        await Promise.all(
          primaryItems.map(async (it) => {
            await deleteDoc(doc(db, 'discoveries', it.id));
            if (it.attachment?.storagePath) {
              await AttachmentService.deleteAttachment(it.attachment.storagePath).catch(() => {});
            }
          })
        );
        const removedIds = new Set(primaryItems.map((it) => it.id));
        setItems((prev) => prev.filter((it) => !removedIds.has(it.id)));
        if (removedIds.has(activeItemId)) setActiveItemId('');
      }

      if (crossItems.length > 0) {
        await Promise.all(
          crossItems.map((it) =>
            updateDoc(doc(db, 'discoveries', it.id), {
              extraCategories: (it.extraCategories || []).filter((c) => c !== catName),
              updatedAt: serverTimestamp(),
            })
          )
        );
        setItems((prev) =>
          prev.map((it) =>
            (it.extraCategories || []).includes(catName)
              ? {
                  ...it,
                  extraCategories: (it.extraCategories || []).filter((c) => c !== catName),
                }
              : it
          )
        );
      }

      await deleteDoc(doc(db, 'categories', catName));
      setCategoriesDocs((prev) => {
        const next = { ...prev };
        delete next[catName];
        return next;
      });
      appendLog(createLogEntry('warn', 'VAULT', `Categoría eliminada: ${catName}`));
    } catch (err) {
      console.error('[Vault] Error eliminando categoría:', err);
    } finally {
      setDeleteCatTarget(null);
    }
  };

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
      } else if (key === '4') {
        e.preventDefault();
        setViewMode('wiki');
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
            <span className="cc-env-badge">LM WIKI · LOCAL-FIRST</span>
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
          onCreateCategory={() => setNewCatOpen(true)}
          onRequestDeleteCategory={handleRequestDeleteCategory}
          canEdit={Boolean(user)}
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
            wikiIndex={wikiIndex}
            savedSyntheses={savedSyntheses}
            wikiLog={wikiLog}
            lmConfig={lmConfig}
            storageTelemetry={storageTelemetry}
            isOnline={isOnline}
            onSaveLmConfig={handleSaveLmConfig}
            onSaveSynthesis={handleSaveSynthesis}
            onPromoteArticleToVault={handlePromoteArticleToVault}
            onApplyAutoLink={handleApplyAutoLink}
            onApplyBatchAutoLinks={handleApplyBatchAutoLinks}
            onImportLocalFiles={handleImportLocalFiles}
            onQuickCaptureCode={handleQuickCaptureCode}
            onRecompileIndex={() => setIndexEpoch((n) => n + 1)}
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
        onCreateCategory={() => setNewCatOpen(true)}
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

      {/* Diálogo para crear nueva categoría */}
      <LightDismissDialog
        open={newCatOpen}
        onClose={() => setNewCatOpen(false)}
        title="Nueva categoría"
        subtitle="Organiza archivos .md, multimedia, enlaces y relaciones en una nueva lista"
        maxWidth="440px"
      >
        <form className="cc-new-note-form" onSubmit={handleSubmitNewCategory}>
          <label className="cc-form-field">
            <span>Nombre de la categoría</span>
            <input
              type="text"
              className="keep-input"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Ej: 07 · Experimentos & Métricas"
              autoFocus
            />
          </label>

          <div className="cc-form-field">
            <span>Color identificador</span>
            <div className="cc-color-picker">
              {KEEP_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`cc-color-swatch ${newCatColor === c.key ? 'is-selected' : ''}`}
                  style={{ backgroundColor: c.accent }}
                  onClick={() => setNewCatColor(c.key)}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
          </div>

          <div className="cc-form-actions">
            <button
              type="button"
              className="keep-btn keep-btn-tonal"
              onClick={() => setNewCatOpen(false)}
            >
              Cancelar
            </button>
            <button type="submit" className="keep-btn keep-btn-primary" disabled={!newCatName.trim()}>
              Crear categoría
            </button>
          </div>
        </form>
      </LightDismissDialog>

      {/* Diálogo seguro para eliminar categoría */}
      <LightDismissDialog
        open={Boolean(deleteCatTarget)}
        onClose={() => setDeleteCatTarget(null)}
        title={deleteCatTarget ? `Eliminar "${deleteCatTarget.name}"` : 'Eliminar categoría'}
        subtitle={
          deleteCatTarget?.files?.length
            ? `Esta categoría contiene ${deleteCatTarget.files.length} archivo(s). Elige qué hacer con ellos:`
            : 'Esta categoría está vacía y se eliminará de Firestore.'
        }
        maxWidth="460px"
      >
        {deleteCatTarget && (
          <form className="cc-new-note-form" onSubmit={handleConfirmDeleteCategory}>
            {deleteCatTarget.files.length > 0 && (
              <>
                <label className="cc-form-field">
                  <span>Acción sobre los archivos</span>
                  <select
                    className="keep-input"
                    value={deleteCatMode}
                    onChange={(e) => setDeleteCatMode(e.target.value)}
                  >
                    <option value="move">Mover archivos a otra categoría (recomendado)</option>
                    <option value="purge">Eliminar también todos sus archivos</option>
                  </select>
                </label>

                {deleteCatMode === 'move' && (
                  <label className="cc-form-field">
                    <span>Categoría destino</span>
                    <select
                      className="keep-input"
                      value={deleteCatFallback}
                      onChange={(e) => setDeleteCatFallback(e.target.value)}
                    >
                      {categories
                        .filter((c) => c.name !== deleteCatTarget.name)
                        .map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      {categories.filter((c) => c.name !== deleteCatTarget.name).length === 0 && (
                        <option value="General">General</option>
                      )}
                    </select>
                  </label>
                )}
              </>
            )}

            <div className="cc-form-actions">
              <button
                type="button"
                className="keep-btn keep-btn-tonal"
                onClick={() => setDeleteCatTarget(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="keep-btn cc-btn-reject">
                Confirmar eliminación
              </button>
            </div>
          </form>
        )}
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
