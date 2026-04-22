/**
 * API client for paper-annotator backend
 * 
 * Dev:   BASE='/docs' → Vite proxy /docs/* → localhost:3456/docs/*
 * Prod:  BASE from env, or relative path if hosted on same origin
 */

export interface DocMeta {
  id: string
  filename: string
  size: number
  created_at: string
}

export interface AnnoMeta {
  id: string
  page: number
  text: string
  note: string
  color: string
  rects: Array<{ x: number; y: number; w: number; h: number }>
  created_at: string
}

const BASE = '/docs'

export async function apiUploadPdf(file: File): Promise<{ docId: string; filename: string; size: number }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Upload failed: ${res.status}`)
  }
  return res.json()
}

export async function apiGetDoc(docId: string): Promise<DocMeta> {
  const res = await fetch(`${BASE}/${docId}`)
  if (!res.ok) throw new Error(`Document not found (${res.status})`)
  return res.json()
}

export async function apiGetPdf(docId: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/${docId}/pdf`)
  if (!res.ok) throw new Error(`PDF not found (${res.status})`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

export async function apiGetAnnotations(docId: string): Promise<AnnoMeta[]> {
  const res = await fetch(`${BASE}/${docId}/annotations`)
  if (!res.ok) throw new Error(`Failed to load annotations (${res.status})`)
  return res.json()
}

export async function apiSaveAnnotation(docId: string, payload: {
  id: string
  page: number
  text: string
  note: string
  color: string
  rects: Array<{ x: number; y: number; w: number; h: number }>
}): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/${docId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Save failed (${res.status})`)
  return res.json()
}

export async function apiDeleteAnnotation(docId: string, annoId: string): Promise<void> {
  const res = await fetch(`${BASE}/${docId}/annotations/${annoId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed (${res.status})`)
}

export async function apiDeleteDoc(docId: string): Promise<void> {
  const res = await fetch(`${BASE}/${docId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed (${res.status})`)
}
