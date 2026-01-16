/**
 * File Persistence Service
 * Manages file handle storage (Chromium) and file content caching (all browsers)
 * using IndexedDB for cross-session persistence
 */

const DB_NAME = 'rsvp_reader_db';
const DB_VERSION = 1;
const STORES = {
  FILE_HANDLES: 'file_handles',
  FILE_CACHE: 'file_cache',
};

/**
 * Check if File System Access API is supported
 * @returns {boolean}
 */
export function supportsFileSystemAccess() {
  return 'showOpenFilePicker' in window && 'FileSystemFileHandle' in window;
}

/**
 * Open or create the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.FILE_HANDLES)) {
        db.createObjectStore(STORES.FILE_HANDLES, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.FILE_CACHE)) {
        db.createObjectStore(STORES.FILE_CACHE, { keyPath: 'id' });
      }
    };
  });
}

// ============================================
// File System Access API Methods (Chromium)
// ============================================

/**
 * Store a FileSystemFileHandle in IndexedDB
 * @param {FileSystemFileHandle} handle
 * @param {Object} metadata - { fileName, fileSize }
 * @returns {Promise<void>}
 */
async function saveFileHandle(handle, metadata) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILE_HANDLES, 'readwrite');
    const store = tx.objectStore(STORES.FILE_HANDLES);

    store.put({
      id: 'current_book',
      handle,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      savedAt: Date.now(),
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve the stored FileSystemFileHandle
 * @returns {Promise<{handle: FileSystemFileHandle, metadata: Object}|null>}
 */
async function getFileHandle() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILE_HANDLES, 'readonly');
    const store = tx.objectStore(STORES.FILE_HANDLES);
    const request = store.get('current_book');

    request.onsuccess = () => {
      const result = request.result;
      if (result && result.handle) {
        resolve({
          handle: result.handle,
          metadata: {
            fileName: result.fileName,
            fileSize: result.fileSize,
          },
        });
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Request permission and get File from stored handle
 * @returns {Promise<File|null>}
 */
async function loadFileFromHandle() {
  const stored = await getFileHandle();
  if (!stored) return null;

  const { handle } = stored;

  try {
    const permission = await handle.queryPermission({ mode: 'read' });

    if (permission === 'granted') {
      return await handle.getFile();
    }

    const newPermission = await handle.requestPermission({ mode: 'read' });
    if (newPermission === 'granted') {
      return await handle.getFile();
    }

    return null;
  } catch (error) {
    console.warn('Failed to load file from handle:', error);
    await clearFileHandle();
    return null;
  }
}

/**
 * Clear the stored file handle
 * @returns {Promise<void>}
 */
async function clearFileHandle() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILE_HANDLES, 'readwrite');
    const store = tx.objectStore(STORES.FILE_HANDLES);
    store.delete('current_book');

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================
// File Cache Methods (Firefox/Safari Fallback)
// ============================================

/**
 * Cache the file content in IndexedDB
 * @param {File} file
 * @returns {Promise<void>}
 */
async function cacheFileContent(file) {
  const arrayBuffer = await file.arrayBuffer();
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILE_CACHE, 'readwrite');
    const store = tx.objectStore(STORES.FILE_CACHE);

    store.put({
      id: 'current_book',
      content: arrayBuffer,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      savedAt: Date.now(),
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve cached file content and reconstruct File object
 * @returns {Promise<File|null>}
 */
async function loadCachedFile() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILE_CACHE, 'readonly');
    const store = tx.objectStore(STORES.FILE_CACHE);
    const request = store.get('current_book');

    request.onsuccess = () => {
      const result = request.result;
      if (result && result.content) {
        const file = new File([result.content], result.fileName, {
          type: result.fileType || 'application/epub+zip',
        });
        resolve(file);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if we have a cached file
 * @returns {Promise<boolean>}
 */
async function hasCachedFile() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILE_CACHE, 'readonly');
    const store = tx.objectStore(STORES.FILE_CACHE);
    const request = store.get('current_book');

    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear the cached file
 * @returns {Promise<void>}
 */
async function clearCachedFile() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.FILE_CACHE, 'readwrite');
    const store = tx.objectStore(STORES.FILE_CACHE);
    store.delete('current_book');

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================
// Unified Public Interface
// ============================================

/**
 * Save file access - uses File System Access API on Chromium, caches content elsewhere
 * @param {File} file
 * @param {FileSystemFileHandle|null} handle - Only available when using showOpenFilePicker
 * @returns {Promise<void>}
 */
export async function saveFileAccess(file, handle = null) {
  if (supportsFileSystemAccess() && handle) {
    await saveFileHandle(handle, {
      fileName: file.name,
      fileSize: file.size,
    });
  }
  // Always cache the file content as fallback
  await cacheFileContent(file);
}

/**
 * Load saved file - uses best available method
 * @returns {Promise<File|null>}
 */
export async function loadSavedFile() {
  // Try File System Access API first (may prompt for permission)
  if (supportsFileSystemAccess()) {
    const file = await loadFileFromHandle();
    if (file) return file;
  }

  // Fall back to cached file
  return await loadCachedFile();
}

/**
 * Check if we can potentially load a saved file
 * @returns {Promise<{available: boolean, requiresPermission: boolean}>}
 */
export async function checkSavedFileStatus() {
  // Check if we have a cached file (always available without permission)
  const cached = await hasCachedFile();
  if (cached) {
    return { available: true, requiresPermission: false };
  }

  // Check File System Access API handle
  if (supportsFileSystemAccess()) {
    const stored = await getFileHandle();
    if (stored) {
      try {
        const permission = await stored.handle.queryPermission({ mode: 'read' });
        return {
          available: true,
          requiresPermission: permission !== 'granted',
        };
      } catch {
        return { available: false, requiresPermission: false };
      }
    }
  }

  return { available: false, requiresPermission: false };
}

/**
 * Clear all saved file data
 * @returns {Promise<void>}
 */
export async function clearSavedFile() {
  await Promise.all([clearFileHandle(), clearCachedFile()]);
}
