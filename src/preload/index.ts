import { contextBridge, ipcRenderer } from 'electron'

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 导入 PDF
  importPdf: () => ipcRenderer.invoke('import-pdf'),
  
  // 导出标注（JSON）
  exportAnnotations: (data: string) => ipcRenderer.invoke('export-annotations', data),
  
  // 导入标注
  importAnnotations: () => ipcRenderer.invoke('import-annotations')
})

// TypeScript 类型声明
export interface ElectronAPI {
  importPdf: () => Promise<{ name: string; data: string } | null>
  exportAnnotations: (data: string) => Promise<boolean>
  importAnnotations: () => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}