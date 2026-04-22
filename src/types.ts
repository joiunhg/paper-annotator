export interface Annotation {
  id: string
  page: number
  text: string
  note: string
  color: string
  createdAt: number
  // PDF viewport 坐标，渲染时 × scale
  rects?: Array<{
    left: number
    top: number
    width: number
    height: number
  }>
}

export interface PdfDocument {
  id: string
  name: string
  data: Uint8Array
  annotations: Annotation[]
  createdAt: number
  lastModified: number
}

export type Document = PdfDocument

export interface YoudaoResult {
  code: number
  msg: string
  translation?: string[]
  basic?: {
    phonetic?: string
    explains?: string[]
  }
}
