"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // 导入 PDF
  importPdf: () => electron.ipcRenderer.invoke("import-pdf"),
  // 导出标注（JSON）
  exportAnnotations: (data) => electron.ipcRenderer.invoke("export-annotations", data),
  // 导入标注
  importAnnotations: () => electron.ipcRenderer.invoke("import-annotations")
});
