import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import AttachmentService from './AttachmentService';
import { getColorConfig } from '../data/keep_palette';
import {
  PLATFORM_ARCHITECTURE_SVG,
  PLATFORM_CATEGORIES,
  PLATFORM_ITEMS,
} from '../data/platform_vault';

/**
 * Purga el contenido de prueba previo en `discoveries` y `categories`
 * e inicializa de forma idempotente la bóveda real operativa y de crecimiento
 * de `love.deft.work` (incluyendo subida real de `mapa-arquitectura-v3.svg` a Storage).
 */
export async function seedPlatformVault({ user, purgeExisting = true, onProgressLog }) {
  if (!user) {
    throw new Error('Debes iniciar sesión con Google para sincronizar la bóveda en Firestore.');
  }

  onProgressLog?.('Iniciando migración limpia hacia Bóveda Operativa de Plataforma...');

  // 1. Subir diagrama vectorial real mapa-arquitectura-v3.svg a Firebase Storage
  let svgAttachment = null;
  try {
    const svgFile = new File([PLATFORM_ARCHITECTURE_SVG], 'mapa-arquitectura-v3.svg', {
      type: 'image/svg+xml',
    });
    svgAttachment = await AttachmentService.uploadAttachment(svgFile, user.uid);
    onProgressLog?.(`Artefacto vectorial subido a Storage: ${svgAttachment.name}`);
  } catch (err) {
    console.warn('[PlatformSeed] No se pudo subir SVG a Storage, usando inline markdown:', err);
  }

  // 2. Eliminar documentos previos de prueba en `discoveries` y `categories`
  if (purgeExisting) {
    const [oldItemsSnap, oldCatsSnap] = await Promise.all([
      getDocs(collection(db, 'discoveries')),
      getDocs(collection(db, 'categories')),
    ]);

    const delBatch = writeBatch(db);
    let deleteCount = 0;

    oldItemsSnap.docs.forEach((d) => {
      delBatch.delete(doc(db, 'discoveries', d.id));
      deleteCount += 1;
    });
    oldCatsSnap.docs.forEach((d) => {
      delBatch.delete(doc(db, 'categories', d.id));
      deleteCount += 1;
    });

    if (deleteCount > 0) {
      await delBatch.commit();
      onProgressLog?.(`Purgados ${deleteCount} documentos de prueba anteriores en Firestore.`);
    }
  }

  // 3. Escribir las 6 categorías reales y 18 nodos operativos/crecimiento con IDs deterministas
  const batch = writeBatch(db);

  PLATFORM_CATEGORIES.forEach((cat) => {
    const color = getColorConfig(cat.colorKey);
    batch.set(doc(db, 'categories', cat.name), {
      name: cat.name,
      colorKey: color.key,
      pinned: Boolean(cat.pinned),
      order: cat.order,
      isPublic: true,
      sharedWith: [],
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      updatedAt: serverTimestamp(),
    });
  });

  PLATFORM_ITEMS.forEach((item, index) => {
    const attachment = item.attachmentKind === 'arch_svg' ? svgAttachment : null;
    const color = getColorConfig(
      PLATFORM_CATEGORIES.find((c) => c.name === item.category)?.colorKey || 'cyan'
    );

    batch.set(doc(db, 'discoveries', item.id), {
      title: item.title,
      name: item.title,
      type: item.type || 'phrase',
      kind: item.kind || 'file',
      sourceId: item.sourceId || '',
      targetId: item.targetId || '',
      relationLabel: item.relationLabel || '',
      authorKind: item.authorKind || 'human',
      authorName: item.authorName || user.displayName || user.email || '',
      reviewStatus: item.reviewStatus || 'verified',
      url: item.url || '',
      domain: item.domain || '',
      favicon: '',
      attachment,
      markdownContent: item.markdownContent,
      note: item.note || '',
      description: item.note || '',
      category: item.category,
      extraCategories: [],
      relatedIds: item.relatedIds || [],
      pinned: Boolean(item.pinned),
      checked: false,
      order: Date.now() - index * 1000,
      clicks: 0,
      relevance_score: item.pinned ? 95 : 85,
      colorKey: color.key,
      isPublic: true,
      sharedWith: [],
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  onProgressLog?.(
    `Sincronizados ${PLATFORM_CATEGORIES.length} directorios y ${PLATFORM_ITEMS.length} nodos reales de crecimiento.`
  );
  return {
    categoriesCount: PLATFORM_CATEGORIES.length,
    itemsCount: PLATFORM_ITEMS.length,
  };
}
