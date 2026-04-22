/**
 * Layered storage: FastAPI backend as primary, IndexedDB as local cache.
 * - Online: fetch from FastAPI, cache in IndexedDB
 * - Offline: serve from IndexedDB
 * - Save: write to both (FastAPI first, IndexedDB as fallback)
 */
import { type AnnoMeta } from './api'
import { apiGetPdf, apiGetAnnotations, apiGetDoc } from './api'
import { saveDocument, getDocument } from './db'
import { openDB, IDBPDatabase } from 'idb'

export interface DocMeta {
  id: string
  filename: string
  size: number
  created_at: string
}

// ─── Local cache for offline support ─────────────────────────────────────────
// Separate store from main documents — stores raw PDF bytes + annotation data
// keyed by docId, aligned with AnnoMeta field names { left, top, width, height }

const CACHE_DB = 'paper-annotator-cache'
const CACHE_STORE = 'doc-cache'

interface LocalDocCache {
  id: string
  filename: string
  data: Uint8Array
  annotations: AnnoMeta[]
  cachedAt: number
}

let cacheDB: IDBPDatabase | null = null

async function getCacheDB() {
  if (!cacheDB) {
    cacheDB = await openDB(CACHE_DB, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(CACHE_STORE)) {
          database.createObjectStore(CACHE_STORE, { keyPath: 'id' })
        }
      }
    })
  }
  return cacheDB
}

export async function cacheDoc(doc: LocalDocCache): Promise<void> {
  const db = await getCacheDB()
  await db.put(CACHE_STORE, doc)
}

export async function getCachedDoc(docId: string): Promise<LocalDocCache | undefined> {
  const db = await getCacheDB()
  return db.get(CACHE_STORE, docId) as Promise<LocalDocCache | undefined>
}

// ─── Load document with offline fallback ──────────────────────────────────────

export async function loadDocWithCache(
  docId: string
): Promise<{
  data: Uint8Array
  annos: AnnoMeta[]
  meta: DocMeta
  source: 'server' | 'cache'
}> {
  try {
    const [data, annos, meta] = await Promise.all([
      apiGetPdf(docId),
      apiGetAnnotations(docId),
      apiGetDoc(docId),
    ])
    // Cache to IndexedDB for offline use
    await cacheDoc({ id: docId, filename: meta.filename, data, annotations: annos, cachedAt: Date.now() })
    return { data, annos, meta, source: 'server' }
  } catch (err) {
    // Fallback to local cache
    const cached = await getCachedDoc(docId)
    if (!cached) throw new Error(`文档加载失败，且无本地缓存: ${(err as Error).message}`)
    return {
      data: cached.data,
      annos: cached.annotations,
      meta: {
        id: cached.id,
        filename: cached.filename,
        size: cached.data.length,
        created_at: new Date(cached.cachedAt).toISOString(),
      },
      source: 'cache',
    }
  }
}

// ─── Cache an annotation after saving ─────────────────────────────────────────

export async function cacheAnnotation(docId: string, anno: AnnoMeta): Promise<void> {
  try {
    const cached = await getCachedDoc(docId)
    if (cached) {
      const idx = cached.annotations.findIndex(a => a.id === anno.id)
      const updated = idx >= 0
        ? cached.annotations.map((a, i) => (i === idx ? anno : a))
        : [...cached.annotations, anno]
      await cacheDoc({ ...cached, annotations: updated })
    }
  } catch {
    // Silently ignore cache errors
  }
}
