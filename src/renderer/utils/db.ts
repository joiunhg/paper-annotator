import { openDB, IDBPDatabase } from 'idb'
import type { Document } from '../types'

const DB_NAME = 'paper-annotator'
const STORE_NAME = 'documents'

let db: IDBPDatabase | null = null

async function getDB() {
  if (!db) {
    db = await openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
    })
  }
  return db
}

export async function loadDocuments(): Promise<Document[]> {
  const database = await getDB()
  const docs = await database.getAll(STORE_NAME)
  return docs as Document[]
}

export async function saveDocument(doc: Document): Promise<void> {
  const database = await getDB()
  await database.put(STORE_NAME, doc)
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await getDB()
  await database.delete(STORE_NAME, id)
}

export async function getDocument(id: string): Promise<Document | undefined> {
  const database = await getDB()
  return await database.get(STORE_NAME, id) as Document | undefined
}