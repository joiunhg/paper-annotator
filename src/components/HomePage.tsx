import React, { useRef, useState } from 'react'
import { apiUploadPdf } from '../utils/api'

interface HomePageProps {
  onOpenDoc: (docId: string, filename: string) => void
}

export default function HomePage({ onOpenDoc }: HomePageProps) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('只支持 PDF 文件')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('文件不能超过 50MB')
      return
    }

    setUploading(true)
    setError('')
    try {
      const result = await apiUploadPdf(file)
      onOpenDoc(result.docId, result.filename)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  return (
    <div className="home-page">
      <div className="home-hero">
        <div className="home-badge">📄 Paper Annotator</div>
        <h1>上传文献，生成<br /><span className="gradient-text">分享链接</span></h1>
        <p className="home-desc">
          上传 PDF → 获得链接 → 分享给任何人<br />
          无需注册，匿名使用，多人协作标注
        </p>

        {/* 上传区 */}
        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          style={{ cursor: uploading ? 'wait' : 'pointer' }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
          />
          {uploading ? (
            <>
              <div className="upload-spinner" />
              <p className="upload-label">正在上传...</p>
            </>
          ) : (
            <>
              <div className="upload-icon">📤</div>
              <p className="upload-label">
                {dragOver ? '松开以上传' : '点击或拖拽 PDF 文件到这里'}
              </p>
              <p className="upload-hint">支持 PDF 文件，最大 50MB</p>
            </>
          )}
        </div>

        {error && (
          <div className="upload-error">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* 功能介绍 */}
      <div className="home-features">
        <div className="feature-card">
          <span className="feature-icon">✏️</span>
          <h3>高亮 + 笔记</h3>
          <p>拖动选字，添加高亮和笔记，标注永久保存</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">🌐</span>
          <h3>实时翻译</h3>
          <p>选中英文单词或段落，自动翻译成中文</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">🔗</span>
          <h3>一键分享</h3>
          <p>上传后生成链接，对方打开即可查看和标注</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">📊</span>
          <h3>导出报告</h3>
          <p>将标注导出为 PDF 报告，方便整理和分享</p>
        </div>
      </div>

      <style>{`
        .home-page {
          min-height: 100vh;
          background: #0d1117;
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 60px 20px 40px;
          box-sizing: border-box;
          overflow-y: auto;
        }
        .home-hero {
          max-width: 560px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin-bottom: 60px;
        }
        .home-badge {
          background: rgba(79,195,247,0.12);
          color: #4fc3f7;
          border: 1px solid rgba(79,195,247,0.3);
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 13px;
          margin-bottom: 20px;
          letter-spacing: 0.5px;
        }
        .home-hero h1 {
          font-size: 40px;
          font-weight: 800;
          margin: 0 0 16px;
          line-height: 1.3;
          color: #e6edf3;
        }
        .gradient-text {
          background: linear-gradient(90deg, #4fc3f7, #81c784);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .home-desc {
          color: #8b949e;
          font-size: 16px;
          line-height: 1.8;
          margin: 0 0 36px;
        }
        .upload-zone {
          width: 100%;
          border: 2px dashed #30363d;
          border-radius: 16px;
          padding: 48px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: border-color 0.2s, background 0.2s;
          background: #161b22;
          box-sizing: border-box;
        }
        .upload-zone.drag-over {
          border-color: #4fc3f7;
          background: rgba(79,195,247,0.06);
        }
        .upload-zone.uploading {
          border-color: #58a6ff;
          background: rgba(88,166,255,0.06);
        }
        .upload-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
        .upload-label {
          font-size: 15px;
          color: #c9d1d9;
          margin: 0 0 6px;
        }
        .upload-hint {
          font-size: 12px;
          color: #484f58;
          margin: 0;
        }
        .upload-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(79,195,247,0.2);
          border-top-color: #4fc3f7;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 12px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .upload-error {
          margin-top: 14px;
          padding: 8px 16px;
          background: rgba(248,81,73,0.1);
          border: 1px solid rgba(248,81,73,0.3);
          border-radius: 8px;
          color: #f85149;
          font-size: 13px;
        }
        .home-features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          max-width: 880px;
          width: 100%;
        }
        .feature-card {
          background: #161b22;
          border: 1px solid #21262d;
          border-radius: 12px;
          padding: 24px 20px;
          text-align: left;
          transition: border-color 0.2s;
        }
        .feature-card:hover {
          border-color: #30363d;
        }
        .feature-icon {
          font-size: 28px;
          display: block;
          margin-bottom: 10px;
        }
        .feature-card h3 {
          margin: 0 0 8px;
          font-size: 15px;
          color: #c9d1d9;
        }
        .feature-card p {
          margin: 0;
          font-size: 13px;
          color: #6e7681;
          line-height: 1.6;
        }
      `}</style>
    </div>
  )
}
