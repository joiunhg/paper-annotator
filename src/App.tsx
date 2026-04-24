import React, { useState, useEffect, useRef } from 'react'
import PdfViewer from './components/PdfViewer'
import HomePage from './components/HomePage'
import { apiGetPdf, apiGetAnnotations, apiSaveAnnotation, apiDeleteAnnotation, apiGetDoc, type AnnoMeta } from './utils/api'
import type { Annotation } from './types'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? ''  // '' → relative, goes through Vite proxy

// ─── Server annotation ↔ local annotation ──────────────────────────────────────
function toLocal(ann: AnnoMeta): Annotation {
  return {
    id: ann.id,
    page: ann.page,
    text: ann.text,
    note: ann.note,
    color: ann.color,
    rects: ann.rects,
    createdAt: new Date(ann.created_at).getTime(),
  }
}

function toServer(ann: Annotation) {
  return {
    id: ann.id,
    page: ann.page,
    text: ann.text,
    note: ann.note,
    color: ann.color,
    rects: ann.rects,
  }
}

// ─── Read doc ID from URL ?doc=xxx ────────────────────────────────────────────
function getDocIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('doc')
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState<'loading' | 'home' | 'viewer'>('loading')
  const [docId, setDocId] = useState<string | null>(null)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [docName, setDocName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Check URL on mount
  useEffect(() => {
    const id = getDocIdFromUrl()
    if (id) {
      setDocId(id)
      loadDoc(id)
    } else {
      setMode('home')
    }
  }, [])

  async function loadDoc(id: string) {
    setLoading(true)
    setError('')
    try {
      const [data, annos, meta] = await Promise.all([
        apiGetPdf(id),
        apiGetAnnotations(id),
        apiGetDoc(id),
      ])
      setPdfData(data)
      setAnnotations(annos.map(toLocal))
      setDocName(meta.filename || 'document.pdf')
      setMode('viewer')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenDoc(id: string, filename: string) {
    setDocId(id)
    setDocName(filename)
    window.history.pushState({}, '', `?doc=${id}`)
    loadDoc(id)
  }

  function handleBackHome() {
    setMode('home')
    setDocId(null)
    setPdfData(null)
    setAnnotations([])
    setDocName('')
    window.history.pushState({}, '', window.location.pathname)
  }

  async function handleAddAnnotation(ann: Annotation) {
    if (!docId) return
    try {
      const result = await apiSaveAnnotation(docId, toServer(ann))
      const saved = { ...ann, id: result.id }
      setAnnotations(prev => [...prev, saved])
    } catch (e) {
      console.error('Save annotation failed:', e)
    }
  }

  async function handleDeleteAnnotation(annoId: string) {
    if (!docId) return
    try {
      await apiDeleteAnnotation(docId, annoId)
      setAnnotations(prev => prev.filter(a => a.id !== annoId))
    } catch (e) {
      console.error('Delete annotation failed:', e)
    }
  }

  async function handleExport() {
    if (annotations.length === 0) { alert('当前文档没有标注'); return }
    const container = document.createElement('div')
    container.style.cssText = `position:fixed;left:-9999px;top:0;width:210mm;background:white;padding:20mm;`
    container.innerHTML = `
      <h1 style="color:#1a1a2e;border-bottom:2px solid #4fc3f7;padding-bottom:10px;font-size:22px;margin-bottom:16px;">📄 ${escapeHtml(docName)}</h1>
      <p style="color:#666;font-size:13px;">标注数量：${annotations.length} 条 | 导出时间：${new Date().toLocaleString('zh-CN')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:16px;">
        <thead><tr style="background:#f5f5f5;">
          <th style="padding:8px;border:1px solid #ddd;width:40px;">#</th>
          <th style="padding:8px;border:1px solid #ddd;width:60px;">页码</th>
          <th style="padding:8px;border:1px solid #ddd;">标注文字</th>
          <th style="padding:8px;border:1px solid #ddd;">笔记</th>
        </tr></thead>
        <tbody>
          ${annotations.map((a, i) => `
            <tr>
              <td style="padding:8px;border:1px solid #ddd;text-align:center;">${i + 1}</td>
              <td style="padding:8px;border:1px solid #ddd;text-align:center;">第${a.page}页</td>
              <td style="padding:8px;border:1px solid #ddd;background:${a.color}20;">${escapeHtml(a.text)}</td>
              <td style="padding:8px;border:1px solid #ddd;">${a.note ? escapeHtml(a.note) : '<span style="color:#999">-</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:24px;font-size:11px;color:#888;text-align:center;">由 Paper Annotator 生成</div>
    `
    document.body.appendChild(container)
    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#fff' })
      const img = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = 210, ph = 297
      const iw = pw - 20, ih = (canvas.height * iw) / canvas.width
      let hl = ih, pos = 10
      pdf.addImage(img, 'PNG', 10, pos, iw, ih)
      hl -= (ph - 20)
      while (hl > 0) { pdf.addPage(); pos = hl - ih + 10; pdf.addImage(img, 'PNG', 10, pos, iw, ih); hl -= (ph - 20) }
      pdf.save(`${docName.replace('.pdf', '')}_标注报告.pdf`)
    } finally {
      document.body.removeChild(container)
    }
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  function copyLink() {
    const link = `${window.location.origin}${window.location.pathname}?doc=${docId}`
    navigator.clipboard.writeText(link).then(() => alert('✅ 链接已复制到剪贴板！'))
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0d1117', color:'#4fc3f7', fontSize:18 }}>
        {loading ? '正在加载文档...' : error ? `❌ ${error}` : '初始化中...'}
      </div>
    )
  }

  if (mode === 'home') {
    return <HomePage onOpenDoc={handleOpenDoc} />
  }

  return (
    <div className="app-server">
      {/* 顶栏 */}
      <div className="server-topbar">
        <button className="btn btn-secondary" onClick={handleBackHome} style={{ fontSize:13 }}>
          ← 上传新文档
        </button>
        <span className="server-docname" title={docName}>{docName.length > 40 ? docName.slice(0,38) + '…' : docName}</span>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="btn btn-secondary" onClick={copyLink} style={{ fontSize:13 }}>
            🔗 分享链接
          </button>
          <button className="btn btn-primary" onClick={handleExport} style={{ fontSize:13 }}>
            📥 导出报告
          </button>
        </div>
      </div>

      {/* PDF viewer area */}
      <div className="server-body">
        {loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#888' }}>加载中...</div>
        ) : pdfData ? (
          <PdfViewer
            pdfData={pdfData}
            annotations={annotations}
            onAddAnnotation={handleAddAnnotation}
          />
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#f85149' }}>
            ❌ 加载失败：{error}
          </div>
        )}
      </div>

      <style>{`
        .app-server { height:100vh; display:flex; flex-direction:column; background:#1a1a2e; overflow:hidden; }
        .server-topbar { display:flex; align-items:center; gap:12px; padding:10px 16px; background:#16213e; border-bottom:1px solid #0f3460; flex-wrap:wrap; }
        .server-docname { flex:1; color:#e0e0e0; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .server-body { flex:1; overflow:hidden; display:flex; flex-direction:column; }
        .btn { border:none; border-radius:6px; padding:6px 14px; cursor:pointer; font-size:14px; transition:opacity 0.2s; }
        .btn:hover { opacity:0.85; }
        .btn-primary { background:#4fc3f7; color:#0d1117; font-weight:600; }
        .btn-secondary { background:#21262d; color:#c9d1d9; border:1px solid #30363d; }
      `}</style>
    </div>
  )
}
