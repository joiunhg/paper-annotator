// 内部引用，用于直接触发文件选择
let _pdfInput: HTMLInputElement | null = null
let _pdfResolver: ((v: { name: string; data: string } | null) => void) | null = null

function ensurePdfInput() {
  if (_pdfInput) return
  _pdfInput = document.createElement('input')
  _pdfInput.type = 'file'
  _pdfInput.accept = '.pdf'
  _pdfInput.style.display = 'none'
  _pdfInput.onchange = async (e) => {
    const file = (_pdfInput as HTMLInputElement).files?.[0]
    const result: { name: string; data: string } | null = file
      ? { name: file.name, data: btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))) }
      : null
    if (_pdfResolver) _pdfResolver(result)
    _pdfResolver = null
    ;(_pdfInput as HTMLInputElement).value = ''
  }
  document.body.appendChild(_pdfInput)
}

// 网页版兼容层 - 在浏览器中使用原生文件 API
export const webAPI = {
  // 导入 PDF - 使用原生文件选择器
  importPdf: async (): Promise<{ name: string; data: string } | null> => {
    return new Promise((resolve) => {
      ensurePdfInput()
      _pdfResolver = resolve
      _pdfInput!.click()
    })
  },

  // 导出标注 - 使用原生下载
  exportAnnotations: async (data: string): Promise<boolean> => {
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `annotations_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    return true
  },

  // 导入标注 - 使用原生文件选择器
  importAnnotations: async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) {
          resolve(null)
          return
        }
        const text = await file.text()
        resolve(text)
      }
      input.click()
    })
  }
}

// 检测环境并返回合适的 API
export const getAPI = () => {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return (window as any).electronAPI
  }
  return webAPI
}
