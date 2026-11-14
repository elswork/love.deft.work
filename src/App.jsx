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
import DiscoveryForm from './components/DiscoveryForm';
import LightDismissDialog from './components/LightDismissDialog';
import ShareModal from './components/ShareModal';
import ConnectionsGraph from './components/ConnectionsGraph';
import EnrichmentService from './services/EnrichmentService';
import { KEEP_COLORS, getColorConfig, getCategoryIcon } from './data/keep_palette';
import { AuthProvider, useAuth } from './context/AuthContext';

const FALLBACK_SEEDS = [
  {
    id: 'seed-1',
    type: 'link',
    title: 'Mecanismo de Anticitera · Wikipedia',
    url: 'https://es.wikipedia.org/wiki/Mecanismo_de_Anticitera',
    domain: 'es.wikipedia.org',
    favicon: 'https://www.google.com/s2/favicons?domain=es.wikipedia.org&sz=64',
    category: 'Anticitera',
    extraCategories: ['Tecnología'],
    relatedIds: ['seed-2', 'seed-4'],
    note: 'Primer computador analógico astronómico conocido.',
    pinned: true,
    checked: false,
    order: 100,
    clicks: 12,
    isPublic: true,
  },
  {
    id: 'seed-2',
    type: 'word',
    title: 'Episteme',
    category: 'Palabras & Léxico',
    extraCategories: ['Anticitera'],
    relatedIds: ['seed-1', 'seed-3'],
    note: 'Conocimiento justificado como verdad científica frente a la mera doxa.',
    pinned: true,
    checked: false,
    order: 90,
    clicks: 8,
    isPublic: true,
  },
  {
    id: 'seed-3',
    type: 'phrase',
    title: '«Dadme un punto de apoyo y moveré el mundo.» — Arquímedes',
    category: 'Ideas & Citas',
    extraCategories: ['Anticitera'],
    relatedIds: ['seed-2'],
    note: 'Principio de la palanca y soberanía técnica.',
    pinned: true,
    checked: false,
    order: 80,
    clicks: 15,
    isPublic: true,
  },
  {
    id: 'seed-4',
    type: 'link',
    title: 'Hugging Face · Modelos Abiertos IA',
    url: 'https://huggingface.co',
    domain: 'huggingface.co',
    favicon: 'https://www.google.com/s2/favicons?domain=huggingface.co&sz=64',
    category: 'Tecnología',
    extraCategories: [],
    relatedIds: ['seed-1'],
    note: 'Repositorio de modelos Gemma, pesos y datasets.',
    pinned: false,
    checked: false,
    order: 70,
    clicks: 9,
    isPublic: true,
  },
];

function useKeepData() {
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
        setItems(docs.length > 0 ? docs : FALLBACK_SEEDS);
        setLoading(false);
      },
      (error) => {
        console.warn('[Firestore] Usando semillas locales por permisos/red:', error);
        setItems(FALLBACK_SEEDS);
        setLoading(false);
      }
    );

    const unsubCats = onSnapshot(
      collection(db, 'categories'),
      (snapshot) => {
        const map = {};
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const key = data.name || d.id;
          map[key] = { id: d.id, ...data };
        });
        setCategoriesDocs(map);
      },
      () => {}
    );

    return () => {
      unsubItems();
      unsubCats();
    };
  }, []);

  return { items, setItems, categoriesDocs, loading };
}

function catDocId(name) {
  return (
    String(name || 'general')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñ_-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'general'
  );
}

function LoveKeepApp() {
  const { items, setItems, categoriesDocs, loading } = useKeepData();
  const { user, loginWithGoogle, logout } = useAuth();

  // URL Deep-link params (?cat=... & ?item=...)
  const initialParams = useMemo(() => {
    if (typeof window === 'undefined') return { cat: 'All', item: '' };
    const sp = new URLSearchParams(window.location.search);
    return {
      cat: sp.get('cat') || 'All',
      item: sp.get('item') || '',
    };
  }, []);

  const [selectedCategories, setSelectedCategories] = useState(() =>
    initialParams.cat && initialParams.cat !== 'All' ? [initialParams.cat] : []
  );
  const [focusedItemId, setFocusedItemId] = useState(initialParams.item);
  const [hoveredItemId, setHoveredItemId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'link' | 'word' | 'phrase'
  const [sortBy, setSortBy] = useState('smart'); // 'smart' | 'recent' | 'alpha' | 'clicks'
  const [viewMode, setViewMode] = useState('board'); // 'board' | 'graph'
  const [quickInlineByCat, setQuickInlineByCat] = useState({});
  const [copiedId, setCopiedId] = useState('');

  // Modales
  const [shareTarget, setShareTarget] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [expandedCategoryName, setExpandedCategoryName] = useState('');
  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false);
  const [newCatForm, setNewCatForm] = useState({
    name: '',
    icon: '📌',
    colorKey: 'emerald',
    note: '',
    isPublic: true,
  });

  // Drag & Drop state
  const [dragState, setDragState] = useState(null); // { kind: 'item' | 'category', id: string }
  const searchInputRef = useRef(null);

  // Dark/Light mode state synced with <meta name="color-scheme"> per modern-web-guidance
  const [renderedScheme, setRenderedScheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const meta = document.querySelector('meta[name="color-scheme"]')?.content;
    if (meta === 'light' || meta === 'dark') return meta;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const syncScheme = () => {
      const stored = localStorage.getItem('color-scheme');
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        meta.content = stored ?? 'light dark';
      }
      if (stored === 'light' || stored === 'dark') {
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
    if (typeof window === 'undefined') return;
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

  // Atajo global Ctrl+K o '/' para buscar
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

  // Filtro de visibilidad según sesión
  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      const catMeta = categoriesDocs[it.category];
      const catPublic = catMeta ? catMeta.isPublic !== false : true;
      if (it.isPublic && catPublic) return true;
      if (!user) return false;
      if (user.email === 'elswork@gmail.com') return true;
      if (it.ownerUid && it.ownerUid === user.uid) return true;
      if (it.ownerEmail && it.ownerEmail === user.email) return true;
      if (Array.isArray(it.sharedWith) && it.sharedWith.includes(user.email)) {
        return true;
      }
      if (
        catMeta &&
        Array.isArray(catMeta.sharedWith) &&
        catMeta.sharedWith.includes(user.email)
      ) {
        return true;
      }
      return true;
    });
  }, [items, categoriesDocs, user]);

  const itemsById = useMemo(() => {
    const map = {};
    visibleItems.forEach((it) => {
      map[it.id] = it;
    });
    return map;
  }, [visibleItems]);

  // Mapa simétrico de relaciones entre elementos (si A apunta a B, B también muestra A)
  const relatedMap = useMemo(() => {
    const map = {};
    visibleItems.forEach((it) => {
      if (!map[it.id]) map[it.id] = new Set();
      (it.relatedIds || []).forEach((targetId) => {
        if (itemsById[targetId] && targetId !== it.id) {
          map[it.id].add(targetId);
          if (!map[targetId]) map[targetId] = new Set();
          map[targetId].add(it.id);
        }
      });
    });
    return map;
  }, [visibleItems, itemsById]);

  const activeHighlightId = hoveredItemId || focusedItemId;
  const highlightedRelatedIds = useMemo(() => {
    if (!activeHighlightId || !relatedMap[activeHighlightId]) return new Set();
    return relatedMap[activeHighlightId];
  }, [activeHighlightId, relatedMap]);

  // Función de ordenación de elementos
  const sortItemsList = useMemo(() => {
    return (list) => {
      return [...list].sort((a, b) => {
        // 1. Los completados (checked) siempre van al final de la lista
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        // 2. Los fijados (pinned) siempre van arriba
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

        if (sortBy === 'alpha') {
          return a.title.localeCompare(b.title, 'es');
        }
        if (sortBy === 'clicks') {
          return (b.clicks || 0) - (a.clicks || 0);
        }
        if (sortBy === 'recent') {
          return (b.createdAtMs || b.order || 0) - (a.createdAtMs || a.order || 0);
        }
        // 'smart' / manual order
        if ((b.order || 0) !== (a.order || 0)) {
          return (b.order || 0) - (a.order || 0);
        }
        return (b.relevance_score || 0) - (a.relevance_score || 0);
      });
    };
  }, [sortBy]);

  // Nivel Superior: Construcción de Tarjetas-Categoría
  const categoryCards = useMemo(() => {
    const byCat = {};

    // Incluir categorías definidas explícitamente en Firestore `categories`
    Object.values(categoriesDocs).forEach((catDoc) => {
      if (!catDoc?.name) return;
      if (catDoc.isPublic === false && !user) return;
      byCat[catDoc.name] = {
        name: catDoc.name,
        meta: catDoc,
        items: [],
      };
    });

    // Agrupar ítems por categoría principal y por referencias cruzadas (extraCategories)
    visibleItems.forEach((it) => {
      const allCats = [it.category, ...(it.extraCategories || [])].filter(Boolean);
      allCats.forEach((catName) => {
        if (!byCat[catName]) {
          byCat[catName] = {
            name: catName,
            meta: categoriesDocs[catName] || null,
            items: [],
          };
        }
        if (!byCat[catName].items.some((x) => x.id === it.id)) {
          byCat[catName].items.push(it);
        }
      });
    });

    const list = Object.values(byCat).map((entry) => {
      const meta = entry.meta || {};
      const color = getColorConfig(meta.colorKey || entry.name);
      const sorted = sortItemsList(entry.items);
      const linksCount = sorted.filter((i) => i.type === 'link').length;
      const wordsCount = sorted.filter((i) => i.type === 'word').length;
      const phrasesCount = sorted.filter((i) => i.type === 'phrase').length;
      const hasHighlightedItem =
        activeHighlightId &&
        sorted.some(
          (i) => i.id === activeHighlightId || highlightedRelatedIds.has(i.id)
        );

      return {
        name: entry.name,
        icon: getCategoryIcon(entry.name, meta.icon),
        color,
        colorKey: color.key,
        pinned: Boolean(meta.pinned),
        order: typeof meta.order === 'number' ? meta.order : 0,
        isPublic: meta.isPublic !== undefined ? Boolean(meta.isPublic) : true,
        sharedWith: Array.isArray(meta.sharedWith) ? meta.sharedWith : [],
        note: meta.note || '',
        items: sorted,
        linksCount,
        wordsCount,
        phrasesCount,
        hasHighlightedItem,
      };
    });

    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.order !== b.order) return b.order - a.order;
      return b.items.length - a.items.length;
    });
  }, [visibleItems, categoriesDocs, user, sortItemsList, activeHighlightId, highlightedRelatedIds]);

  // Nivel Inferior: Muro filtrado de Mini-Tarjetas
  const filteredWallItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = visibleItems.filter((it) => {
      if (selectedCategories.length > 0) {
        const inPrimary = selectedCategories.includes(it.category);
        const inExtra = (it.extraCategories || []).some((c) =>
          selectedCategories.includes(c)
        );
        if (!inPrimary && !inExtra) return false;
      }
      if (typeFilter !== 'all' && it.type !== typeFilter) return false;
      if (q) {
        const hay = [
          it.title,
          it.note,
          it.category,
          ...(it.extraCategories || []),
          it.domain,
          it.url,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return sortItemsList(filtered);
  }, [visibleItems, selectedCategories, typeFilter, searchQuery, sortItemsList]);

  // Acciones Firestore / Estado optimista
  const mutateItem = async (itemId, patch) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
    );
    if (String(itemId).startsWith('seed-')) return;
    try {
      await updateDoc(doc(db, 'discoveries', itemId), patch);
    } catch (err) {
      console.error('[Keep] Error actualizando elemento:', err);
    }
  };

  const mutateCategory = async (categoryName, patch) => {
    const id = catDocId(categoryName);
    try {
      await setDoc(
        doc(db, 'categories', id),
        {
          name: categoryName,
          ...patch,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[Keep] Error actualizando categoría:', err);
    }
  };

  const handleToggleItemPin = (it) => {
    if (!user) return;
    mutateItem(it.id, { pinned: !it.pinned });
  };

  const handleToggleItemCheck = (it) => {
    if (!user) return;
    mutateItem(it.id, { checked: !it.checked });
  };

  const handleItemAction = async (it) => {
    if (it.type === 'link' && it.url) {
      window.open(it.url, '_blank', 'noopener,noreferrer');
    } else {
      try {
        await navigator.clipboard.writeText(it.title);
        setCopiedId(it.id);
        setTimeout(() => setCopiedId(''), 1800);
      } catch (err) {
        void err;
      }
    }

    if (user && !String(it.id).startsWith('seed-')) {
      try {
        await updateDoc(doc(db, 'discoveries', it.id), {
          clicks: increment(1),
        });
      } catch (err) {
        void err;
      }
    }
  };

  const handleCopyItem = async (it, e) => {
    if (e) e.stopPropagation();
    const content = it.type === 'link' && it.url ? it.url : it.title;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(it.id);
      setTimeout(() => setCopiedId(''), 1800);
    } catch (err) {
      void err;
    }
  };

  const handleDeleteItem = async (it, e) => {
    if (e) e.stopPropagation();
    if (!user) return;
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    if (String(it.id).startsWith('seed-')) return;
    try {
      await deleteDoc(doc(db, 'discoveries', it.id));
    } catch (err) {
      console.error('[Keep] Error al eliminar:', err);
    }
  };

  // Añadir ítem rápido desde dentro de una Tarjeta-Categoría
  const handleQuickAddInCategory = async (categoryName, e) => {
    e.preventDefault();
    if (!user) return;
    const text = (quickInlineByCat[categoryName] || '').trim();
    if (!text) return;

    const parsed = EnrichmentService.parseQuickInput(text, visibleItems);
    const payload = {
      name: parsed.title,
      title: parsed.title,
      type: parsed.type,
      url: parsed.url,
      domain: parsed.domain,
      favicon: parsed.favicon,
      category: categoryName,
      extraCategories: parsed.extraCategories,
      relatedIds: parsed.relatedIds,
      note: '',
      description: '',
      pinned: false,
      checked: false,
      order: Date.now(),
      clicks: 0,
      relevance_score: 75,
      colorKey: getColorConfig(categoryName).key,
      isPublic: true,
      sharedWith: [],
      ownerUid: user.uid || '',
      ownerEmail: user.email || '',
      status: 'completed',
      createdAt: serverTimestamp(),
    };

    setQuickInlineByCat((prev) => ({ ...prev, [categoryName]: '' }));
    try {
      await addDoc(collection(db, 'discoveries'), payload);
    } catch (err) {
      console.error('[Keep] Error añadiendo en lista:', err);
    }
  };

  // Drag & Drop handlers (tanto para ítems como para categorías)
  const handleDropOnCategory = (targetCategoryName, e) => {
    e.preventDefault();
    if (!user || !dragState) return;

    if (dragState.kind === 'item') {
      const draggedItem = itemsById[dragState.id];
      if (!draggedItem) return;

      if (e.altKey || e.shiftKey) {
        // Con Alt/Shift: añade referencia cruzada a esa categoría sin quitar la principal
        if (
          draggedItem.category !== targetCategoryName &&
          !(draggedItem.extraCategories || []).includes(targetCategoryName)
        ) {
          mutateItem(draggedItem.id, {
            extraCategories: [...(draggedItem.extraCategories || []), targetCategoryName],
          });
        }
      } else if (draggedItem.category !== targetCategoryName) {
        mutateItem(draggedItem.id, {
          category: targetCategoryName,
        });
      }
    } else if (dragState.kind === 'category' && dragState.id !== targetCategoryName) {
      const targetCard = categoryCards.find((c) => c.name === targetCategoryName);
      const nextOrder = (targetCard?.order || 100) + 10;
      mutateCategory(dragState.id, { order: nextOrder });
    }
    setDragState(null);
  };

  const handleDropOnItem = (targetItem, e) => {
    e.preventDefault();
    if (!user || !dragState || dragState.kind !== 'item') return;
    if (dragState.id === targetItem.id) return;

    const nextOrder = (targetItem.order || 100) + 5;
    mutateItem(dragState.id, { order: nextOrder });
    setDragState(null);
  };

  const toggleCategorySelection = (catName, multi = false) => {
    setSelectedCategories((prev) => {
      if (prev.includes(catName)) {
        return prev.filter((c) => c !== catName);
      }
      return multi ? [...prev, catName] : [catName];
    });
  };

  const handleCreateNewCategory = async (e) => {
    e.preventDefault();
    const cleanName = newCatForm.name.trim();
    if (!cleanName || !user) return;
    await mutateCategory(cleanName, {
      name: cleanName,
      icon: newCatForm.icon || '📌',
      colorKey: newCatForm.colorKey || 'emerald',
      note: newCatForm.note.trim(),
      isPublic: newCatForm.isPublic,
      pinned: true,
      order: Date.now(),
      ownerUid: user.uid || '',
      ownerEmail: user.email || '',
    });
    setNewCatForm({
      name: '',
      icon: '📌',
      colorKey: 'emerald',
      note: '',
      isPublic: true,
    });
    setNewCategoryModalOpen(false);
  };

  const expandedCategoryCard = useMemo(
    () => categoryCards.find((c) => c.name === expandedCategoryName) || null,
    [categoryCards, expandedCategoryName]
  );

  return (
    <div className="keep-app">
      {/* ===================================================================
          BARRA SUPERIOR (HEADER ESTILO GOOGLE KEEP MODERNO)
      =================================================================== */}
      <header className="keep-topbar">
        <div className="keep-topbar-left">
          <div
            className="keep-brand"
            onClick={() => {
              setSelectedCategories([]);
              setFocusedItemId('');
              setSearchQuery('');
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSelectedCategories([]);
            }}
          >
            <span className="keep-brand-logo">✦</span>
            <div>
              <h1 className="keep-brand-title">love.deft.work</h1>
              <span className="keep-brand-sub">
                Listas por Categorías · Links, Palabras y Frases Conectadas
              </span>
            </div>
          </div>
        </div>

        {/* Buscador instantáneo Ctrl+K */}
        <div className="keep-search-box">
          <span className="keep-search-icon">🔍</span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar links, palabras, frases o #categorías… (Ctrl+K)"
            className="keep-search-input"
            aria-label="Buscar en love.deft.work"
          />
          {searchQuery && (
            <button
              type="button"
              className="keep-icon-btn"
              onClick={() => setSearchQuery('')}
              title="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Controles globales: Vista, Tema y Sesión */}
        <div className="keep-topbar-actions">
          <div className="keep-pill-group" role="group" aria-label="Modo de vista">
            <button
              type="button"
              className={`keep-mini-pill ${viewMode === 'board' ? 'active' : ''}`}
              onClick={() => setViewMode('board')}
            >
              🗂️ Tablero
            </button>
            <button
              type="button"
              className={`keep-mini-pill ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
            >
              🕸️ Conexiones
            </button>
          </div>

          <button
            type="button"
            className="keep-icon-btn"
            onClick={toggleColorScheme}
            title={
              renderedScheme === 'dark'
                ? 'Cambiar a modo claro'
                : 'Cambiar a modo oscuro'
            }
            aria-label={
              renderedScheme === 'dark'
                ? 'Cambiar a modo claro'
                : 'Cambiar a modo oscuro'
            }
          >
            {renderedScheme === 'dark' ? '☀️' : '🌙'}
          </button>

          {user ? (
            <div className="keep-user-chip">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Usuario'}
                  className="keep-avatar"
                />
              ) : (
                <span className="keep-avatar-fallback">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </span>
              )}
              <span className="keep-user-name">
                {user.displayName || user.email?.split('@')[0]}
              </span>
              <button
                type="button"
                onClick={logout}
                className="keep-btn-ghost"
              >
                Salir
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={loginWithGoogle}
              className="keep-btn keep-btn-primary"
            >
              Entrar con Google
            </button>
          )}
        </div>
      </header>

      <main className="keep-main">
        {/* ===================================================================
            BARRA DE CAPTURA RÁPIDA (LINKS, PALABRAS Y FRASES)
        =================================================================== */}
        {user ? (
          <DiscoveryForm
            categories={categoryCards.map((c) => c.name)}
            allItems={visibleItems}
            user={user}
            activeCategoryFilter={
              selectedCategories.length === 1 ? selectedCategories[0] : 'All'
            }
          />
        ) : (
          <div className="keep-guest-banner">
            <span>
              Estás viendo el tablero público de <strong>love.deft.work</strong>. Inicia sesión para añadir links, palabras o frases, reordenar listas y crear conexiones.
            </span>
            <button
              type="button"
              onClick={loginWithGoogle}
              className="keep-btn keep-btn-tonal"
            >
              Iniciar sesión
            </button>
          </div>
        )}

        {/* ===================================================================
            MAPA DE CONEXIONES (VISTA GRAFO OPCIONAL)
        =================================================================== */}
        {viewMode === 'graph' && (
          <ConnectionsGraph
            items={visibleItems}
            categoriesMap={categoriesDocs}
            activeItemId={activeHighlightId}
            onSelectItem={(it) => {
              setFocusedItemId(it.id === focusedItemId ? '' : it.id);
              setEditingItem(it);
            }}
            onSelectCategory={(catName) => {
              setSelectedCategories([catName]);
              setViewMode('board');
            }}
          />
        )}

        {/* ===================================================================
            NIVEL SUPERIOR: TARJETAS DE CATEGORÍA (LISTAS ORDENADAS)
        =================================================================== */}
        <section className="keep-section" aria-label="Tarjetas de Categoría">
          <div className="keep-section-header">
            <div className="keep-section-title-group">
              <h2>1. Tarjetas de Categoría</h2>
              <span className="keep-badge">
                {categoryCards.length} listas · Arrastra para ordenar o pulsa para filtrar
              </span>
            </div>
            <div className="keep-section-actions">
              {selectedCategories.length > 0 && (
                <button
                  type="button"
                  className="keep-mini-pill active"
                  onClick={() => setSelectedCategories([])}
                >
                  ✕ Mostrar todas las categorías ({visibleItems.length})
                </button>
              )}
              {user && (
                <button
                  type="button"
                  className="keep-btn keep-btn-tonal"
                  onClick={() => setNewCategoryModalOpen(true)}
                >
                  + Nueva Categoría
                </button>
              )}
            </div>
          </div>

          <div className="keep-categories-grid">
            {categoryCards.map((cat) => {
              const isSelected = selectedCategories.includes(cat.name);
              const previewItems = cat.items.slice(0, 4);

              return (
                <article
                  key={cat.name}
                  draggable={Boolean(user)}
                  onDragStart={() =>
                    setDragState({ kind: 'category', id: cat.name })
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropOnCategory(cat.name, e)}
                  className={`keep-category-card keep-tone-${cat.colorKey} ${
                    isSelected ? 'is-selected' : ''
                  } ${cat.hasHighlightedItem ? 'is-related-glow' : ''}`}
                  style={{ '--card-accent': cat.color.accent }}
                >
                  {/* Cabecera de la Tarjeta-Categoría */}
                  <div
                    className="keep-cat-card-header"
                    onClick={(e) =>
                      toggleCategorySelection(cat.name, e.metaKey || e.ctrlKey || e.shiftKey)
                    }
                  >
                    <div className="keep-cat-title-row">
                      <span className="keep-cat-icon">{cat.icon}</span>
                      <h3 className="keep-cat-title">{cat.name}</h3>
                      <span
                        className="keep-privacy-dot"
                        title={cat.isPublic ? 'Categoría pública' : 'Categoría privada'}
                      >
                        {cat.isPublic ? '🌍' : '🔒'}
                      </span>
                    </div>

                    <div
                      className="keep-cat-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {user && (
                        <button
                          type="button"
                          className={`keep-icon-btn ${cat.pinned ? 'is-active' : ''}`}
                          onClick={() =>
                            mutateCategory(cat.name, { pinned: !cat.pinned })
                          }
                          title={cat.pinned ? 'Desfijar categoría' : 'Fijar categoría arriba'}
                        >
                          📌
                        </button>
                      )}
                      <button
                        type="button"
                        className="keep-icon-btn"
                        onClick={() => setExpandedCategoryName(cat.name)}
                        title="Abrir vista completa de lista"
                      >
                        ⤢
                      </button>
                      <button
                        type="button"
                        className="keep-icon-btn"
                        onClick={() =>
                          setShareTarget({
                            kind: 'category',
                            name: cat.name,
                            isPublic: cat.isPublic,
                            sharedWith: cat.sharedWith,
                            items: cat.items,
                          })
                        }
                        title="Compartir esta categoría"
                      >
                        📤
                      </button>
                    </div>
                  </div>

                  {/* Contadores por tipo */}
                  <div className="keep-cat-counters">
                    <span className="keep-cat-count-chip">
                      Total: <strong>{cat.items.length}</strong>
                    </span>
                    {cat.linksCount > 0 && (
                      <span className="keep-cat-count-chip">🔗 {cat.linksCount}</span>
                    )}
                    {cat.wordsCount > 0 && (
                      <span className="keep-cat-count-chip">🏷️ {cat.wordsCount}</span>
                    )}
                    {cat.phrasesCount > 0 && (
                      <span className="keep-cat-count-chip">💬 {cat.phrasesCount}</span>
                    )}
                  </div>

                  {/* Lista compacta de elementos dentro de la Tarjeta-Categoría */}
                  <ul className="keep-cat-preview-list">
                    {previewItems.map((it) => {
                      const isRel =
                        activeHighlightId === it.id || highlightedRelatedIds.has(it.id);
                      const relCount = relatedMap[it.id]?.size || 0;
                      return (
                        <li
                          key={it.id}
                          className={`keep-cat-preview-item ${
                            it.checked ? 'is-checked' : ''
                          } ${isRel ? 'is-highlighted' : ''}`}
                          onMouseEnter={() => setHoveredItemId(it.id)}
                          onMouseLeave={() => setHoveredItemId('')}
                        >
                          {user && (
                            <input
                              type="checkbox"
                              checked={it.checked}
                              onChange={() => handleToggleItemCheck(it)}
                              className="keep-checkbox"
                              title="Marcar como visto / completado"
                            />
                          )}
                          <button
                            type="button"
                            className="keep-cat-item-main"
                            onClick={() => handleItemAction(it)}
                            title={
                              it.type === 'link'
                                ? `Abrir ${it.url}`
                                : 'Clic para copiar texto'
                            }
                          >
                            {it.type === 'link' && it.favicon ? (
                              <img
                                src={it.favicon}
                                alt=""
                                width="14"
                                height="14"
                                className="keep-favicon-sm"
                              />
                            ) : (
                              <span className="keep-type-mini">
                                {it.type === 'link'
                                  ? '🔗'
                                  : it.type === 'word'
                                  ? '🏷️'
                                  : '💬'}
                              </span>
                            )}
                            <span className="keep-cat-item-text">{it.title}</span>
                          </button>

                          {relCount > 0 && (
                            <button
                              type="button"
                              className="keep-rel-indicator"
                              onClick={() =>
                                setFocusedItemId(
                                  focusedItemId === it.id ? '' : it.id
                                )
                              }
                              title={`${relCount} conexión(es) con otras listas`}
                            >
                              ↔{relCount}
                            </button>
                          )}
                        </li>
                      );
                    })}
                    {cat.items.length === 0 && (
                      <li className="keep-cat-empty-item">
                        Lista vacía · Añade un link, palabra o frase abajo
                      </li>
                    )}
                  </ul>

                  {cat.items.length > 4 && (
                    <button
                      type="button"
                      className="keep-cat-more-btn"
                      onClick={() => setExpandedCategoryName(cat.name)}
                    >
                      Ver los {cat.items.length} elementos de «{cat.name}» →
                    </button>
                  )}

                  {/* Input rápido directo dentro de la Tarjeta-Categoría */}
                  {user && (
                    <form
                      onSubmit={(e) => handleQuickAddInCategory(cat.name, e)}
                      className="keep-cat-quick-form"
                    >
                      <input
                        type="text"
                        placeholder={`+ Añadir a ${cat.name}…`}
                        value={quickInlineByCat[cat.name] || ''}
                        onChange={(e) =>
                          setQuickInlineByCat((prev) => ({
                            ...prev,
                            [cat.name]: e.target.value,
                          }))
                        }
                        className="keep-cat-quick-input"
                      />
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* ===================================================================
            NIVEL INFERIOR: MURO DE MINI-TARJETAS Y BARRA DE ORDENACIÓN
        =================================================================== */}
        <section className="keep-section" aria-label="Muro de Mini-Tarjetas">
          <div className="keep-wall-toolbar">
            <div className="keep-section-title-group">
              <h2>
                2. Muro de Mini-Tarjetas{' '}
                {selectedCategories.length > 0
                  ? `(${selectedCategories.join(' + ')})`
                  : '(Todas las listas)'}
              </h2>
              <span className="keep-badge">
                {filteredWallItems.length} elementos cortos
              </span>
            </div>

            {/* Filtros por Tipo (Link / Palabra / Frase) */}
            <div className="keep-wall-controls">
              <div className="keep-pill-group" role="group" aria-label="Filtrar por tipo">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'link', label: '🔗 Links' },
                  { id: 'word', label: '🏷️ Palabras' },
                  { id: 'phrase', label: '💬 Frases' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`keep-mini-pill ${typeFilter === t.id ? 'active' : ''}`}
                    onClick={() => setTypeFilter(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Ordenación en 1 clic */}
              <div className="keep-pill-group" role="group" aria-label="Ordenar por">
                {[
                  { id: 'smart', label: '↕ Manual / Pin' },
                  { id: 'recent', label: '🕒 Recientes' },
                  { id: 'alpha', label: '🔤 A–Z' },
                  { id: 'clicks', label: '🔥 Más usados' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`keep-mini-pill ${sortBy === s.id ? 'active' : ''}`}
                    onClick={() => setSortBy(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="keep-empty-state">Cargando elementos…</div>
          ) : filteredWallItems.length === 0 ? (
            <div className="keep-empty-state">
              <p>No hay elementos que coincidan con el filtro actual.</p>
            </div>
          ) : (
            <div className="keep-microcards-grid">
              {filteredWallItems.map((it) => {
                const color = getColorConfig(
                  categoriesDocs[it.category]?.colorKey || it.colorKey || it.category
                );
                const siblingIds = Array.from(relatedMap[it.id] || []);
                const siblingItems = siblingIds
                  .map((id) => itemsById[id])
                  .filter(Boolean);
                const isFocusedOrHovered = activeHighlightId === it.id;
                const isRelatedToActive = highlightedRelatedIds.has(it.id);

                return (
                  <article
                    key={it.id}
                    draggable={Boolean(user)}
                    onDragStart={() => setDragState({ kind: 'item', id: it.id })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDropOnItem(it, e)}
                    onMouseEnter={() => setHoveredItemId(it.id)}
                    onMouseLeave={() => setHoveredItemId('')}
                    className={`keep-microcard keep-type-${it.type} keep-tone-${
                      color.key
                    } ${it.pinned ? 'is-pinned' : ''} ${
                      it.checked ? 'is-checked' : ''
                    } ${isFocusedOrHovered ? 'is-focused' : ''} ${
                      isRelatedToActive ? 'is-related-glow' : ''
                    }`}
                    style={{ '--card-accent': color.accent }}
                  >
                    {/* Fila superior de la Mini-Tarjeta: Categoría + Acciones rápidas */}
                    <div className="keep-micro-top">
                      <div className="keep-micro-tags">
                        <button
                          type="button"
                          className="keep-micro-cat-chip"
                          onClick={() => toggleCategorySelection(it.category)}
                          title={`Filtrar por ${it.category}`}
                        >
                          {getCategoryIcon(it.category)} {it.category}
                        </button>
                        {(it.extraCategories || []).map((xCat) => (
                          <button
                            key={xCat}
                            type="button"
                            className="keep-micro-cat-chip is-secondary"
                            onClick={() => toggleCategorySelection(xCat)}
                            title={`También en ${xCat}`}
                          >
                            +{xCat}
                          </button>
                        ))}
                        {!it.isPublic && (
                          <span className="keep-lock-tag" title="Elemento privado">
                            🔒
                          </span>
                        )}
                      </div>

                      <div className="keep-micro-actions">
                        {user && (
                          <input
                            type="checkbox"
                            checked={it.checked}
                            onChange={() => handleToggleItemCheck(it)}
                            className="keep-checkbox"
                            title="Marcar como visto/completado"
                          />
                        )}
                        {user && (
                          <button
                            type="button"
                            className={`keep-icon-btn-sm ${it.pinned ? 'is-active' : ''}`}
                            onClick={() => handleToggleItemPin(it)}
                            title={it.pinned ? 'Quitar fijado' : 'Fijar arriba'}
                          >
                            ★
                          </button>
                        )}
                        <button
                          type="button"
                          className="keep-icon-btn-sm"
                          onClick={(e) => handleCopyItem(it, e)}
                          title="Copiar en 1 clic"
                        >
                          {copiedId === it.id ? '✓' : '📋'}
                        </button>
                        <button
                          type="button"
                          className="keep-icon-btn-sm"
                          onClick={() => setEditingItem(it)}
                          title="Editar o relacionar con elementos de otras listas"
                        >
                          🕸️
                        </button>
                        <button
                          type="button"
                          className="keep-icon-btn-sm"
                          onClick={() =>
                            setShareTarget({
                              kind: 'item',
                              item: it,
                              relatedItems: siblingItems,
                            })
                          }
                          title="Compartir este elemento"
                        >
                          📤
                        </button>
                        {user && (
                          <button
                            type="button"
                            className="keep-icon-btn-sm is-danger"
                            onClick={(e) => handleDeleteItem(it, e)}
                            title="Eliminar elemento"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Cuerpo principal adaptado según Tipo: Link, Palabra o Frase */}
                    <div
                      className="keep-micro-body"
                      onClick={() => handleItemAction(it)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleItemAction(it);
                      }}
                    >
                      {it.type === 'link' ? (
                        <div className="keep-link-row">
                          {it.favicon ? (
                            <img
                              src={it.favicon}
                              alt=""
                              width="20"
                              height="20"
                              className="keep-favicon"
                            />
                          ) : (
                            <span className="keep-link-fallback">🔗</span>
                          )}
                          <div className="keep-link-texts">
                            <span className="keep-micro-title">{it.title}</span>
                            {it.domain && (
                              <span className="keep-domain-pill">
                                {it.domain} ↗
                              </span>
                            )}
                          </div>
                        </div>
                      ) : it.type === 'word' ? (
                        <div className="keep-word-row">
                          <span className="keep-word-chip">{it.title}</span>
                        </div>
                      ) : (
                        <p className="keep-phrase-text">{it.title}</p>
                      )}

                      {it.note && (
                        <p className="keep-micro-note">{it.note}</p>
                      )}
                    </div>

                    {/* Chips de Relaciones Cruzadas con elementos de otras listas */}
                    {siblingItems.length > 0 && (
                      <div className="keep-micro-relations">
                        {siblingItems.map((rel) => (
                          <button
                            key={rel.id}
                            type="button"
                            className="keep-sibling-chip"
                            onClick={() => {
                              setFocusedItemId(
                                focusedItemId === rel.id ? '' : rel.id
                              );
                              if (
                                selectedCategories.length > 0 &&
                                !selectedCategories.includes(rel.category)
                              ) {
                                setSelectedCategories((prev) => [
                                  ...prev,
                                  rel.category,
                                ]);
                              }
                            }}
                            title={`Conectado con «${rel.title}» en la lista ${rel.category}`}
                          >
                            ↔ {rel.title}{' '}
                            <small>· {rel.category}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ===================================================================
          MODAL: COMPARTIR (A NIVEL DE CATEGORÍA O DE ELEMENTO)
      =================================================================== */}
      <ShareModal
        open={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        target={shareTarget}
        canEdit={Boolean(user)}
        onUpdateSharing={async ({ isPublic, sharedWith }) => {
          if (!shareTarget) return;
          if (shareTarget.kind === 'category') {
            await mutateCategory(shareTarget.name, { isPublic, sharedWith });
            setShareTarget((prev) =>
              prev ? { ...prev, isPublic, sharedWith } : null
            );
          } else if (shareTarget.kind === 'item') {
            await mutateItem(shareTarget.item.id, { isPublic, sharedWith });
            setShareTarget((prev) =>
              prev
                ? {
                    ...prev,
                    item: { ...prev.item, isPublic, sharedWith },
                  }
                : null
            );
          }
        }}
      />

      {/* ===================================================================
          MODAL: VISTA EXPANDIDA DE UNA CATEGORÍA (CHECKLIST + ORDEN + COLOR)
      =================================================================== */}
      <LightDismissDialog
        open={Boolean(expandedCategoryCard)}
        onClose={() => setExpandedCategoryName('')}
        title={
          expandedCategoryCard
            ? `${expandedCategoryCard.icon} ${expandedCategoryCard.name}`
            : 'Categoría'
        }
        subtitle={
          expandedCategoryCard
            ? `${expandedCategoryCard.items.length} elementos en esta lista · Arrastra, marca o comparte`
            : ''
        }
        maxWidth="660px"
      >
        {expandedCategoryCard && (
          <div className="keep-expanded-cat-modal">
            {user && (
              <div className="keep-expanded-cat-settings">
                <span className="keep-sub-label">Color de la tarjeta:</span>
                <div className="keep-color-dots">
                  {KEEP_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`keep-color-dot ${
                        expandedCategoryCard.colorKey === c.key ? 'selected' : ''
                      }`}
                      style={{ backgroundColor: c.accent }}
                      onClick={() =>
                        mutateCategory(expandedCategoryCard.name, {
                          colorKey: c.key,
                        })
                      }
                      title={c.label}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="keep-btn keep-btn-tonal"
                  onClick={() => {
                    const cat = expandedCategoryCard;
                    setExpandedCategoryName('');
                    setShareTarget({
                      kind: 'category',
                      name: cat.name,
                      isPublic: cat.isPublic,
                      sharedWith: cat.sharedWith,
                      items: cat.items,
                    });
                  }}
                >
                  📤 Compartir lista
                </button>
              </div>
            )}

            {user && (
              <form
                onSubmit={(e) =>
                  handleQuickAddInCategory(expandedCategoryCard.name, e)
                }
                className="share-url-row"
              >
                <input
                  type="text"
                  placeholder={`Añadir link, palabra o frase en ${expandedCategoryCard.name}…`}
                  value={quickInlineByCat[expandedCategoryCard.name] || ''}
                  onChange={(e) =>
                    setQuickInlineByCat((prev) => ({
                      ...prev,
                      [expandedCategoryCard.name]: e.target.value,
                    }))
                  }
                  className="keep-input"
                />
                <button type="submit" className="keep-btn keep-btn-primary">
                  + Añadir
                </button>
              </form>
            )}

            <ul className="keep-expanded-items-list">
              {expandedCategoryCard.items.map((it) => (
                <li
                  key={it.id}
                  className={`keep-expanded-row ${
                    it.checked ? 'is-checked' : ''
                  }`}
                >
                  {user && (
                    <input
                      type="checkbox"
                      checked={it.checked}
                      onChange={() => handleToggleItemCheck(it)}
                      className="keep-checkbox"
                    />
                  )}
                  <div
                    className="keep-expanded-row-main"
                    onClick={() => handleItemAction(it)}
                  >
                    <strong>{it.title}</strong>
                    {it.domain && (
                      <span className="keep-domain-pill">{it.domain}</span>
                    )}
                    {it.note && <p className="keep-micro-note">{it.note}</p>}
                  </div>
                  <div className="keep-micro-actions">
                    <button
                      type="button"
                      className="keep-icon-btn-sm"
                      onClick={(e) => handleCopyItem(it, e)}
                      title="Copiar"
                    >
                      📋
                    </button>
                    <button
                      type="button"
                      className="keep-icon-btn-sm"
                      onClick={() => {
                        setExpandedCategoryName('');
                        setEditingItem(it);
                      }}
                      title="Relacionar / Editar"
                    >
                      🕸️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </LightDismissDialog>

      {/* ===================================================================
          MODAL: EDITAR MINI-TARJETA Y GESTIONAR CONEXIONES ENTRE LISTAS
      =================================================================== */}
      <LightDismissDialog
        open={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        title={editingItem ? `Editar y Conectar «${editingItem.title}»` : ''}
        subtitle="Vincula este elemento con elementos de otras listas o añade referencias cruzadas"
      >
        {editingItem && (
          <div className="share-modal-stack">
            <div className="share-section">
              <label className="share-label">Texto / Título corto</label>
              <input
                type="text"
                value={editingItem.title}
                disabled={!user}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, title: e.target.value })
                }
                className="keep-input"
              />
            </div>

            {editingItem.type === 'link' && (
              <div className="share-section">
                <label className="share-label">URL del enlace</label>
                <input
                  type="url"
                  value={editingItem.url || ''}
                  disabled={!user}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      url: e.target.value,
                      domain: EnrichmentService.extractDomain(e.target.value),
                      favicon: EnrichmentService.getFaviconUrl(e.target.value),
                    })
                  }
                  className="keep-input"
                />
              </div>
            )}

            <div className="share-section">
              <label className="share-label">Nota breve o contexto (1 línea)</label>
              <input
                type="text"
                value={editingItem.note || ''}
                disabled={!user}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, note: e.target.value })
                }
                className="keep-input"
              />
            </div>

            <div className="share-section">
              <label className="share-label">
                Categoría principal y listas secundarias
              </label>
              <div className="keep-relations-chips">
                {categoryCards.map((c) => {
                  const isPrimary = editingItem.category === c.name;
                  const isExtra = (editingItem.extraCategories || []).includes(
                    c.name
                  );
                  return (
                    <button
                      key={c.name}
                      type="button"
                      disabled={!user}
                      className={`keep-relation-chip ${
                        isPrimary || isExtra ? 'active' : ''
                      }`}
                      onClick={() => {
                        if (isPrimary) return;
                        const nextExtra = isExtra
                          ? (editingItem.extraCategories || []).filter(
                              (x) => x !== c.name
                            )
                          : [...(editingItem.extraCategories || []), c.name];
                        setEditingItem({
                          ...editingItem,
                          extraCategories: nextExtra,
                        });
                      }}
                    >
                      {c.icon} {c.name} {isPrimary ? '(Principal)' : isExtra ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="share-section">
              <label className="share-label">
                🕸️ Elementos relacionados en otras listas (clic para enlazar/desenlazar)
              </label>
              <div className="keep-relations-chips">
                {visibleItems
                  .filter((cand) => cand.id !== editingItem.id)
                  .slice(0, 24)
                  .map((cand) => {
                    const linked =
                      (editingItem.relatedIds || []).includes(cand.id) ||
                      (cand.relatedIds || []).includes(editingItem.id);
                    return (
                      <button
                        key={cand.id}
                        type="button"
                        disabled={!user}
                        className={`keep-relation-chip ${linked ? 'active' : ''}`}
                        onClick={() => {
                          const current = new Set(editingItem.relatedIds || []);
                          if (current.has(cand.id)) {
                            current.delete(cand.id);
                          } else {
                            current.add(cand.id);
                          }
                          setEditingItem({
                            ...editingItem,
                            relatedIds: Array.from(current),
                          });
                        }}
                      >
                        {linked ? '↔ ' : '+ '}
                        {cand.title} <small>({cand.category})</small>
                      </button>
                    );
                  })}
              </div>
            </div>

            {user && (
              <div className="share-actions-row">
                <button
                  type="button"
                  className="keep-btn keep-btn-primary"
                  onClick={async () => {
                    await mutateItem(editingItem.id, {
                      title: editingItem.title,
                      name: editingItem.title,
                      url: editingItem.url || '',
                      domain: editingItem.domain || '',
                      favicon: editingItem.favicon || '',
                      note: editingItem.note || '',
                      description: editingItem.note || '',
                      extraCategories: editingItem.extraCategories || [],
                      relatedIds: editingItem.relatedIds || [],
                    });
                    setEditingItem(null);
                  }}
                >
                  Guardar cambios
                </button>
              </div>
            )}
          </div>
        )}
      </LightDismissDialog>

      {/* ===================================================================
          MODAL: CREAR NUEVA CATEGORÍA
      =================================================================== */}
      <LightDismissDialog
        open={newCategoryModalOpen}
        onClose={() => setNewCategoryModalOpen(false)}
        title="Nueva Tarjeta de Categoría"
        subtitle="Crea una nueva lista temática para tus links, palabras o frases"
      >
        <form onSubmit={handleCreateNewCategory} className="share-modal-stack">
          <div className="share-section">
            <label className="share-label">Nombre de la categoría</label>
            <input
              type="text"
              required
              placeholder="Ej. Cine Clásico, Prompts IA, Vinos Atlánticos…"
              value={newCatForm.name}
              onChange={(e) =>
                setNewCatForm({ ...newCatForm, name: e.target.value })
              }
              className="keep-input"
            />
          </div>

          <div className="share-section">
            <label className="share-label">Icono e identificador visual</label>
            <div className="keep-relations-chips">
              {['📌', '⚡', '🎬', '🍷', '🏎️', '📖', '🔤', '💡', '🎧', '🛠️', '🏛️', '🌍'].map(
                (ic) => (
                  <button
                    key={ic}
                    type="button"
                    className={`keep-relation-chip ${
                      newCatForm.icon === ic ? 'active' : ''
                    }`}
                    onClick={() => setNewCatForm({ ...newCatForm, icon: ic })}
                  >
                    {ic}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="share-section">
            <label className="share-label">Color de la tarjeta</label>
            <div className="keep-color-dots">
              {KEEP_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`keep-color-dot ${
                    newCatForm.colorKey === c.key ? 'selected' : ''
                  }`}
                  style={{ backgroundColor: c.accent }}
                  onClick={() =>
                    setNewCatForm({ ...newCatForm, colorKey: c.key })
                  }
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="share-actions-row">
            <button type="submit" className="keep-btn keep-btn-primary">
              Crear Categoría
            </button>
          </div>
        </form>
      </LightDismissDialog>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LoveKeepApp />
    </AuthProvider>
  );
}
