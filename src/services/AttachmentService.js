import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(attachment) {
  if (!attachment) return false;
  if (attachment.contentType && attachment.contentType.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(attachment.name || '');
}

export function getAttachmentIcon(contentType = '', name = '') {
  const mime = String(contentType).toLowerCase();
  const lowerName = String(name).toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(lowerName)) return '🖼️';
  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) return '📕';
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/.test(lowerName)) return '🎵';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov)$/.test(lowerName)) return '🎬';
  if (/\.(zip|tar|gz|rar|7z)$/.test(lowerName)) return '📦';
  if (/\.(csv|xlsx?|ods)$/.test(lowerName)) return '📊';
  if (/\.(md|txt|docx?|odt|rtf)$/.test(lowerName)) return '📄';
  return '📎';
}

export function cleanFileTitle(fileName) {
  return String(fileName || 'Archivo adjunto')
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'Archivo adjunto';
}

/**
 * Sube un fichero a Firebase Storage en `love_attachments/<uid>/...`
 * reportando el progreso (0-100) al callback `onProgress`.
 */
export function uploadAttachment(file, uid, onProgress) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No se ha seleccionado ningún fichero.'));
      return;
    }
    if (!uid) {
      reject(new Error('Debes iniciar sesión para adjuntar ficheros.'));
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error('El fichero supera el límite de 15 MB.'));
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `love_attachments/${uid}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
    });

    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && typeof onProgress === 'function') {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({
            name: file.name,
            url,
            size: file.size,
            contentType: file.type || 'application/octet-stream',
            storagePath,
          });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function deleteAttachment(storagePath) {
  if (!storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    // Si el archivo ya no existe en Storage, ignorar sin bloquear el flujo
    void err;
  }
}

const AttachmentService = {
  uploadAttachment,
  deleteAttachment,
  formatFileSize,
  isImageAttachment,
  getAttachmentIcon,
  cleanFileTitle,
  MAX_ATTACHMENT_BYTES,
};

export default AttachmentService;
