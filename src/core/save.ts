import type { SaveData } from '../meta/types.ts';

const DB_NAME = 'kaelora';
const STORE = 'saves';
const KEY = 'main';
const LS_KEY = 'kaelora-save';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return (dbPromise ??= openDb());
}

/**
 * Save local em IndexedDB (com fallback para localStorage em navegadores
 * que bloqueiam IndexedDB, como algumas abas privadas).
 */
export async function loadSave(): Promise<SaveData | null> {
  try {
    const d = await db();
    const data = await new Promise<SaveData | undefined>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as SaveData | undefined);
      req.onerror = () => reject(req.error);
    });
    if (data) return data;
  } catch {
    // cai para o localStorage
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

export async function writeSave(data: SaveData): Promise<void> {
  const copy = JSON.parse(JSON.stringify(data)) as SaveData;
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(copy, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  } catch {
    // cai para o localStorage
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(copy));
  } catch {
    // sem espaço: nada a fazer além de não quebrar o jogo
  }
}

export async function deleteSave(): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignora
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignora
  }
}

/** Exporta o save como texto (backup manual nas Configurações). */
export function exportSave(data: SaveData): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

export function importSave(text: string): SaveData | null {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(text.trim())))) as SaveData;
    if (typeof data !== 'object' || !data || typeof data.version !== 'number' || !data.profile) return null;
    return data;
  } catch {
    return null;
  }
}
