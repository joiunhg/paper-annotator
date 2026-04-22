import React from 'react'
import type { Document } from '../types'

interface SidebarProps {
  documents: Document[]
  currentDoc: Document | null
  onSelectDoc: (doc: Document) => void
  onImportPdf: () => void
  onDeleteDoc: (id: string) => void
  onExport: () => void
  onImport: () => void
}

export default function Sidebar({
  documents,
  currentDoc,
  onSelectDoc,
  onImportPdf,
  onDeleteDoc,
  onExport,
  onImport
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>📚 文献</h2>
      </div>
      
      <div className="sidebar-actions">
        <button className="btn btn-primary" onClick={onImportPdf}>
          导入 PDF
        </button>
        <button className="btn btn-secondary" onClick={onImport}>
          导入标注
        </button>
        <button className="btn btn-secondary" onClick={onExport}>
          导出标注
        </button>
      </div>
      
      <div className="document-list">
        {documents.length === 0 ? (
          <p className="empty-text">暂无文献</p>
        ) : (
          documents.map(doc => (
            <div
              key={doc.id}
              className={`document-item ${currentDoc?.id === doc.id ? 'active' : ''}`}
              onClick={() => onSelectDoc(doc)}
            >
              <div className="doc-name">{doc.name}</div>
              <div className="doc-info">
                {doc.annotations.length} 个标注
              </div>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteDoc(doc.id)
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      
      {currentDoc && (
        <div className="annotations-section">
          <h3>📝 标注 ({currentDoc.annotations.length})</h3>
          <div className="annotation-list">
            {currentDoc.annotations.length === 0 ? (
              <p className="empty-text">暂无标注</p>
            ) : (
              currentDoc.annotations.map(ann => (
                <div key={ann.id} className="annotation-item">
                  <div className="ann-page">第 {ann.page} 页</div>
                  <div className="ann-text">{ann.text.slice(0, 50)}...</div>
                  {ann.note && (
                    <div className="ann-note">{ann.note}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      <style>{`
        .sidebar {
          width: 260px;
          background: #16213e;
          border-right: 1px solid #0f3460;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .sidebar-header {
          padding: 16px;
          border-bottom: 1px solid #0f3460;
        }
        
        .sidebar-header h2 {
          font-size: 18px;
          color: #4fc3f7;
        }
        
        .sidebar-actions {
          padding: 12px 16px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          border-bottom: 1px solid #0f3460;
        }
        
        .document-list {
          flex: 1;
          overflow: auto;
          padding: 8px;
        }
        
        .empty-text {
          color: #666;
          font-size: 14px;
          text-align: center;
          padding: 20px;
        }
        
        .document-item {
          padding: 12px;
          background: #1a1a2e;
          border-radius: 6px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }
        
        .document-item:hover {
          background: #0f3460;
        }
        
        .document-item.active {
          background: #0f3460;
          border: 1px solid #4fc3f7;
        }
        
        .doc-name {
          font-size: 14px;
          color: #eee;
          word-break: break-all;
        }
        
        .doc-info {
          font-size: 12px;
          color: #888;
          margin-top: 4px;
        }
        
        .delete-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          background: #ff6b6b;
          color: white;
          border: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          font-size: 14px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.2s;
        }
        
        .document-item:hover .delete-btn {
          opacity: 1;
        }
        
        .annotations-section {
          padding: 16px;
          border-top: 1px solid #0f3460;
          max-height: 200px;
          overflow: auto;
        }
        
        .annotations-section h3 {
          font-size: 14px;
          color: #4fc3f7;
          margin-bottom: 12px;
        }
        
        .annotation-item {
          padding: 8px;
          background: #1a1a2e;
          border-radius: 4px;
          margin-bottom: 8px;
        }
        
        .ann-page {
          font-size: 12px;
          color: #4fc3f7;
        }
        
        .ann-text {
          font-size: 13px;
          color: #eee;
          margin-top: 4px;
        }
        
        .ann-note {
          font-size: 12px;
          color: #888;
          margin-top: 4px;
          padding: 4px;
          background: #333;
          border-radius: 4px;
        }
      `}</style>
    </div>
  )
}