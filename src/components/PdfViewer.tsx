import React, { useEffect, useRef, useState, useCallback } from "react"
import * as pdfjsLib from "pdfjs-dist"
import { TextLayerBuilder } from "pdfjs-dist/web/pdf_viewer.mjs"
import type { Annotation } from "../types"
import { translate } from "../utils/translate"

// PDF.js v4 配置
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

interface PdfViewerProps {
  pdfData: Uint8Array
  annotations: Annotation[]
  onAddAnnotation: (ann: Annotation) => void
}

const HIGHLIGHT_COLORS = ["#ffeb3b", "#4fc3f7", "#81c784", "#ff8a65", "#ce93d8"]

export default function PdfViewer({ pdfData, annotations, onAddAnnotation }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)

  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [status, setStatus] = useState("加载中...")
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0])
  const [selBounds, setSelBounds] = useState<{ l: number; t: number; w: number; h: number } | null>(null)
  const [selText, setSelText] = useState("")

  // ─── 加载 PDF ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfData) return
    setStatus("正在加载 PDF...")
    const task = pdfjsLib.getDocument({ data: pdfData })
    task.promise
      .then((doc) => {
        setPdf(doc)
        setNumPages(doc.numPages)
        setPageNum(1)
        setStatus("")
      })
      .catch((err) => setStatus("PDF 加载失败: " + err.message))
    return () => {
      task.destroy()
    }
  }, [pdfData])

  // ─── 渲染页面 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdf || !containerRef.current) return

    const container = containerRef.current
    container.innerHTML = ""
    wrapperRef.current = null
    textLayerRef.current = null
    setSelBounds(null)
    setSelText("")

    ;(async () => {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      // wrapper：position:relative，绝对定位子元素的基准
      const wrapper = document.createElement("div")
      wrapper.style.cssText =
        `position:relative;width:${viewport.width}px;height:${viewport.height}px;` +
        `background:white;box-shadow:0 2px 8px rgba(0,0,0,.3);margin-bottom:20px;overflow:visible;`
      wrapperRef.current = wrapper

      // Canvas（PDF 渲染层）
      const canvas = document.createElement("canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height
      wrapper.appendChild(canvas)

      // 文字层容器 - 使用 PDF.js v4 官方样式
      const textLayerEl = document.createElement("div")
      textLayerEl.className = "textLayer"
      textLayerEl.style.cssText =
        `position:absolute;left:0;top:0;width:${viewport.width}px;height:${viewport.height}px;`
      wrapper.appendChild(textLayerEl)
      textLayerRef.current = textLayerEl

      // 加载官方 textLayer CSS
      let styleEl = document.querySelector("#pdf-viewer-css") as HTMLStyleElement
      if (!styleEl) {
        styleEl = document.createElement("style")
        styleEl.id = "pdf-viewer-css"
        styleEl.textContent = await fetch("/pdf_viewer.css").then((r) => r.text())
        document.head.appendChild(styleEl)
      }

      // 渲染 PDF 到 Canvas
      const rawCtx = canvas.getContext("2d")!
      await page.render({ canvasContext: rawCtx, viewport }).promise

      // ─── 使用 PDF.js v4 官方 TextLayerBuilder ─────────────────────────────────
      const textContent = await page.getTextContent()
      const textLayerBuilder = new TextLayerBuilder({
        textLayerDiv: textLayerEl,
        pageIndex: page.pageNumber - 1,
        viewport: viewport,
      })

      // v4 API: render 直接接受 textContentSource
      await textLayerBuilder.render({ textContentSource: textContent })

      // 选字后的事件监听
      textLayerEl.addEventListener("mouseup", handleTextSelection)

      // ─── 渲染已有标注 ──────────────────────────────────────────────────────
      annotations
        .filter((a) => a.page === pageNum)
        .forEach((ann) => {
          const rects = ann.rects || (ann.rect ? [ann.rect] : [])
          rects.forEach((r) => {
            if (!r || r.width < 1 || r.height < 1) return
            const el = document.createElement("div")
            el.style.cssText =
              `position:absolute;left:${r.left * scale}px;top:${r.top * scale}px;` +
              `width:${r.width * scale}px;height:${r.height * scale}px;` +
              `background:${ann.color}99;border-radius:2px;pointer-events:none;z-index:5;`
            el.title = ann.note || ann.text
            wrapper.appendChild(el)
          })
        })

      container.appendChild(wrapper)
    })()

    return () => {
      wrapperRef.current = null
    }
  }, [pdf, pageNum, scale, annotations])

  // ─── 选字处理 ────────────────────────────────────────────────────────────────
  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return

    const rawText = sel.toString().trim()
    if (!rawText) return

    const range = sel.getRangeAt(0)
    const clientRects = Array.from(range.getClientRects())
    if (clientRects.length === 0) {
      sel.removeAllRanges()
      return
    }

    const wrapper = wrapperRef.current
    if (!wrapper) return

    const off = wrapper.getBoundingClientRect()
    let minL = Infinity,
      minT = Infinity,
      maxR = -Infinity,
      maxB = -Infinity
    for (const r of clientRects) {
      minL = Math.min(minL, r.left - off.left)
      minT = Math.min(minT, r.top - off.top)
      maxR = Math.max(maxR, r.right - off.left)
      maxB = Math.max(maxB, r.bottom - off.top)
    }
    const left = minL
    const top = minT
    const width = maxR - minL
    const height = maxB - minT
    if (width < 1 || height < 1) {
      sel.removeAllRanges()
      return
    }

    sel.removeAllRanges()
    setSelBounds({ l: left, t: top, w: width, h: height })
    setSelText(rawText)

    // 显示翻译弹窗
    showPopup(wrapper, left, top, width, height, rawText)
  }, [])

  // ─── 翻译弹窗 ────────────────────────────────────────────────────────────────
  const showPopup = (
    wrapper: HTMLElement,
    left: number,
    top: number,
    width: number,
    height: number,
    text: string
  ) => {
    // 清除旧弹窗
    const oldPopup = wrapper.querySelector(".sel-popup")
    if (oldPopup) oldPopup.remove()
    const oldOverlay = wrapper.querySelector(".sel-overlay")
    if (oldOverlay) oldOverlay.remove()

    // 高亮覆盖层
    const selOverlay = document.createElement("div")
    selOverlay.className = "sel-overlay"
    selOverlay.style.cssText =
      `position:absolute;left:${left}px;top:${top}px;` +
      `width:${width}px;height:${height}px;` +
      `background:rgba(79,195,247,.25);border:1px solid rgba(79,195,247,.5);` +
      `pointer-events:none;z-index:90;`
    wrapper.appendChild(selOverlay)

    // 弹窗
    const selPopup = document.createElement("div")
    selPopup.className = "sel-popup"
    selPopup.style.cssText =
      `position:absolute;left:${left}px;top:${top + height + 4}px;` +
      `background:#16213e;border:1px solid #4fc3f7;border-radius:8px;` +
      `padding:12px;min-width:220px;max-width:320px;z-index:200;` +
      `box-shadow:0 4px 20px rgba(0,0,0,.4);color:#4fc3f7;font-size:14px;`

    const txtDiv = document.createElement("div")
    txtDiv.style.cssText =
      "margin-bottom:8px;font-style:italic;word-break:break-all;color:#e0e0e0"
    txtDiv.textContent = `"${text}"`
    selPopup.appendChild(txtDiv)

    const loadDiv = document.createElement("div")
    loadDiv.style.cssText = "color:#888;font-size:13px"
    loadDiv.textContent = "翻译中..."
    selPopup.appendChild(loadDiv)

    // 按钮行
    const btnRow = document.createElement("div")
    btnRow.style.cssText =
      "display:flex;gap:8px;justify-content:flex-end;border-top:1px solid #333;padding-top:8px;margin-top:8px"

    const hlBtn = document.createElement("button")
    hlBtn.style.cssText =
      "padding:4px 10px;font-size:12px;background:#4fc3f7;color:#16213e;border:none;border-radius:4px;cursor:pointer;font-weight:600"
    hlBtn.textContent = "✨ 高亮"
    hlBtn.onclick = () => {
      handleHighlight(left, top, width, height, text)
      selOverlay.remove()
      selPopup.remove()
    }

    const closeBtn = document.createElement("button")
    closeBtn.style.cssText =
      "padding:4px 10px;font-size:12px;background:#333;color:#ccc;border:none;border-radius:4px;cursor:pointer"
    closeBtn.textContent = "关闭"
    closeBtn.onclick = () => {
      selOverlay.remove()
      selPopup.remove()
      setSelBounds(null)
      setSelText("")
    }

    btnRow.appendChild(hlBtn)
    btnRow.appendChild(closeBtn)
    selPopup.appendChild(btnRow)
    wrapper.appendChild(selPopup)

    // 翻译
    translate(text).then((result) => {
      const res = result as any
      loadDiv.textContent = ""
      if (res?.basic?.phonetic) {
        const ph = document.createElement("div")
        ph.style.cssText = "color:#888;font-size:12px;margin-bottom:4px"
        ph.textContent = `[${res.basic.phonetic}]`
        selPopup.insertBefore(ph, loadDiv)
      }
      ;(res?.basic?.explains || []).slice(0, 3).forEach((e: string) => {
        const ex = document.createElement("div")
        ex.style.cssText = "font-size:13px;color:#ccc;margin-bottom:2px"
        ex.textContent = `• ${e}`
        selPopup.insertBefore(ex, loadDiv)
      })
      ;(res?.translation || []).forEach((t: string) => {
        const tr = document.createElement("div")
        tr.style.cssText = "font-size:15px;color:#81c784;font-weight:600;margin-top:6px"
        tr.textContent = t
        selPopup.insertBefore(tr, loadDiv)
      })
    })
  }

  // ─── 保存高亮 ────────────────────────────────────────────────────────────────
  const handleHighlight = useCallback(
    (l: number, t: number, w: number, h: number, txt: string) => {
      onAddAnnotation({
        id: Date.now().toString(),
        page: pageNum,
        text: txt,
        note: "",
        color: highlightColor,
        createdAt: Date.now(),
        rects: [
          {
            left: l / scale,
            top: t / scale,
            width: w / scale,
            height: h / scale,
          },
        ],
      })
      setSelBounds(null)
      setSelText("")
    },
    [pageNum, highlightColor, scale, onAddAnnotation]
  )

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#525659",
        position: "relative",
      }}
    >
      {/* 工具栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          background: "#16213e",
          borderBottom: "1px solid #0f3460",
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn btn-secondary"
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          disabled={pageNum <= 1}
        >
          ◀ 上一页
        </button>
        <span>
          <input
            type="number"
            min={1}
            max={numPages}
            value={pageNum}
            onChange={(e) => {
              const v = parseInt(e.target.value)
              if (v >= 1 && v <= numPages) setPageNum(v)
            }}
            style={{
              width: 42,
              textAlign: "center",
              background: "#2a2a3e",
              color: "#e0e0e0",
              border: "1px solid #444",
              borderRadius: 4,
              padding: "2px 4px",
              fontSize: 13,
            }}
          />
          <span style={{ margin: "0 4px", color: "#888" }}>/ {numPages}</span>
        </span>
        <button
          className="btn btn-secondary"
          onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
          disabled={pageNum >= numPages}
        >
          下一页 ▶
        </button>
        <div
          style={{ width: 1, height: 24, background: "#333", margin: "0 8px" }}
        />
        <button
          className="btn btn-secondary"
          onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
        >
          ➖
        </button>
        <span style={{ color: "#e0e0e0" }}>{Math.round(scale * 100)}%</span>
        <button
          className="btn btn-secondary"
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
        >
          ➕
        </button>
        <div
          style={{ width: 1, height: 24, background: "#333", margin: "0 8px" }}
        />
        <span style={{ color: "#aaa", fontSize: 13 }}>颜色：</span>
        <div style={{ display: "flex", gap: 4 }}>
          {HIGHLIGHT_COLORS.map((c) => (
            <div
              key={c}
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                cursor: "pointer",
                border:
                  highlightColor === c
                    ? "2px solid white"
                    : "2px solid transparent",
                background: c,
              }}
              onClick={() => setHighlightColor(c)}
            />
          ))}
        </div>
      </div>

      {/* PDF 内容区 */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {status && (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  )
}


