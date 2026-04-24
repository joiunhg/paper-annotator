---
# Paper Annotator 技术架构审计报告

> 生成时间：2026-04-23 07:20
> 项目路径：~/.qclaw/workspace-agent-81f4f928/paper-annotator-electron/

## 一、问题概述

项目存在 **严重的技术路径冲突**：从 Electron 桌面应用转型为纯网页应用的过程中，旧代码和新代码并存，导致多套配置互相干扰、文件引用混乱、无法确定哪个是"正在运行"的版本。

用户反馈的"无法连接服务器"和"一片黑"很可能不是 bug，而是**跑错了代码版本**。

---

## 二、并存的四套技术路径（核心问题）

| # | 路径名称 | 入口文件 | Vite配置 | 状态 |
|---|---------|---------|---------|------|
| A | 纯网页（新） | src/App.tsx + src/main.tsx | vite.config.ts | ✅ 当前运行 |
| B | Electron 渲染进程（旧） | src/renderer/App.tsx + src/renderer/main.tsx | electron.vite.config.ts | ⚠️ 残留 |
| C | 纯网页（备用） | src/renderer/App.tsx + src/renderer/main.tsx | vite.web.config.ts | ⚠️ 残留 |
| D | Electron 主进程 | src/main/index.ts | electron.vite.config.ts | ⚠️ 残留 |

### 冲突分析

**1. 四个 Vite 配置文件同时存在**

```
vite.config.ts              → root: "src", proxy → :3456        ← 当前 npx vite 用这个
vite.web.config.ts          → root: "src/renderer", proxy → :3456 ← 无人调用
vite.preview.config.ts      → root: "src/renderer", 无 proxy      ← 无人调用
electron.vite.config.ts     → root: "src/renderer"               ← 无人调用（需 electron-vite）
```

`npx vite` 默认读 `vite.config.ts`，所以当前实际跑的是 **路径 A**（src/ 根目录）。
但 `src/renderer/` 下的代码还是旧版本，两套代码并存容易混淆。

**2. 两套 types.ts 字段定义不一致**

| 字段 | src/types.ts（新，路径A） | src/renderer/types.ts（旧，路径B/C） |
|------|------------------------|----------------------------------|
| rects | Array<{left, top, width, height}> | Array<{left, top, width, height}> ✅ 一致 |
| rect（旧字段） | ❌ 已删除 | ✅ 还在（兼容旧数据） |
| textItems | ❌ 已删除 | ✅ 还在 |

**3. 两套 api.ts AnnoMeta 接口不一致**

| 字段 | src/utils/api.ts（新） | src/renderer/utils/api.ts（旧） |
|------|---------------------|------------------------------|
| AnnoRect 类型 | ✅ 独立接口 {left,top,width,height} | ❌ 无独立接口 |
| rects 字段 | AnnoRect[] | Array<{x, y, w, h}> ← **字段名不同！** |

⚠️ 这是最危险的冲突：如果旧代码把 {x, y, w, h} 发给后端，后端存到数据库里，新代码读出来按 {left, top, width, height} 解析，**所有矩形坐标全是 undefined**，标注渲染必然一片空白。

**4. 两套 PdfViewer.tsx 差异巨大**

| 差异点 | src/（新） | src/renderer/（旧） |
|--------|----------|-------------------|
| TextLayerBuilder | ✅ 使用 v4 API | ❌ 无（纯 Canvas，无文字选择） |
| 文字选择 | ✅ 支持 | ❌ 不支持 |
| 翻译弹窗 | ✅ 有 | ✅ 有 |
| worker 文件 | pdf.worker.min.mjs | pdf.worker.min.js |
| 调试面板 | ✅ 有 | ❌ 无 |

**5. translate.ts 硬编码 localhost:3456**

两个版本的 translate.ts **都直接写死了** `http://localhost:3456/translate`：

```typescript
const API_URL = 'http://localhost:3456/translate'
```

但 Vite proxy 只代理 `/docs/*`，**不代理 `/translate`**。这意味着：
- 本地开发时翻译走直连（跨端口请求，依赖 CORS）
- 部署到 Vercel 后翻译**必定失败**（没有 localhost:3456）

---

## 三、目录结构全景

```
paper-annotator-electron/
├── index.html                    ← 根目录多余文件
├── src/
│   ├── index.html               ← 路径A 的 HTML 入口
│   ├── main.tsx                 ← 路径A 的 React 入口
│   ├── App.tsx                  ← 路径A 的主组件 ✅ 正在使用
│   ├── types.ts                 ← 路径A 类型 ✅ 已清理
│   ├── style.css
│   ├── components/
│   │   ├── PdfViewer.tsx        ← 路径A ✅ v4 TextLayer + 调试面板
│   │   ├── HomePage.tsx
│   │   └── Sidebar.tsx
│   ├── utils/
│   │   ├── api.ts               ← 路径A ✅ AnnoRect 接口，rects: {left,top,w,h}
│   │   ├── db.ts                ← IndexedDB（纯网页用）
│   │   ├── sync.ts              ← 离线缓存层
│   │   ├── translate.ts         ← ⚠️ 硬编码 localhost:3456
│   │   └── web-api.ts           ← ⚠️ Electron 兼容层（网页版不需要）
│   ├── main/index.ts            ← Electron 主进程（遗留）
│   ├── preload/index.ts         ← Electron preload（遗留）
│   └── renderer/                ← ⚠️ 整个目录是旧代码
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx              ← 旧版 App（rect 兼容代码还在）
│       ├── types.ts             ← 旧版类型（有 rect, textItems 残留）
│       ├── style.css
│       ├── components/
│       │   ├── PdfViewer.tsx    ← 旧版（无 TextLayer，无文字选择）
│       │   ├── HomePage.tsx
│       │   └── Sidebar.tsx
│       ├── utils/
│       │   ├── api.ts           ← 旧版（rects: {x,y,w,h} 字段名不同！）
│       │   ├── db.ts
│       │   ├── translate.ts     ← 同样硬编码 localhost
│       │   └── web-api.ts
│       ├── public/              ← 旧版静态资源
│       └── dist/                ← git submodule（不应该提交）
├── backend/
│   ├── main.py                  ← FastAPI 后端 ✅
│   ├── data/paper_annotator.db
│   ├── pdfs/*.pdf
│   └── requirements.txt
├── public/
│   ├── pdf.worker.min.mjs       ← 路径A 使用
│   ├── pdf.worker.min.js        ← 路径B 使用
│   └── pdf_viewer.css
├── dist/                        ← 构建产物
├── out/                         ← Electron 构建产物
├── vite.config.ts               ← 路径A 配置 ✅ 当前使用
├── vite.web.config.ts           ← 路径C 配置 ⚠️ 冗余
├── vite.preview.config.ts       ← 预览配置 ⚠️ 冗余
├── electron.vite.config.ts      ← Electron 配置 ⚠️ 冗余
├── package.json                 ← 还写着 electron-vite
└── .gitignore
```

---

## 四、"无法连接服务器"根因分析

### 最可能的原因

当前运行 `npx vite`（vite.config.ts），前端发 `/docs/upload` 等请求到 Vite proxy，proxy 转发到 `localhost:3456`。

**但**，如果 FastAPI（:3456）挂了或没启动，proxy 返回 502 → 前端显示"无法连接服务器"。

### 其他可能原因

1. **Vite proxy 规则覆盖不足** — translate.ts 直连 :3456 绕过了 proxy，CORS 可能拦截
2. **跑错了 Vite 配置** — 如果有人用 `npx vite --config vite.web.config.ts`，root 指向 src/renderer/，加载的是旧代码

---

## 五、"一片黑"根因分析

### 可能原因 1：Canvas 渲染失败
如果 PDF.js worker 加载失败，canvas 可能渲染为全黑/全白。当前用了 pdf.worker.min.mjs，文件存在（1.3MB），HTTP 200，应该没问题。

### 可能原因 2：TextLayer 覆盖 Canvas
pdf_viewer.css 中的 `.textLayer` 样式如果设置不当（比如不透明背景），会遮住 canvas。这个需要实际在浏览器中检查 CSS 计算样式。

### 可能原因 3：跑错了代码版本
如果实际加载的是 src/renderer/ 下的旧 PdfViewer.tsx（无 TextLayer），PDF 能渲染但无法选择文字，用户可能描述为"一片黑"。

---

## 六、建议方案：只保留一条路径

### 第 1 步：删除所有冗余代码

```
删除：
  src/renderer/          ← 整个目录（旧 Electron 渲染进程）
  src/main/              ← Electron 主进程
  src/preload/           ← Electron preload
  src/utils/web-api.ts   ← Electron 兼容层
  vite.web.config.ts     ← 冗余配置
  vite.preview.config.ts ← 冗余配置
  electron.vite.config.ts← 冗余配置
  out/                   ← Electron 构建产物
  dist/                  ← 旧构建产物
  index.html             ← 根目录多余文件
```

### 第 2 步：只保留这些文件

```
src/
├── index.html
├── main.tsx
├── App.tsx
├── types.ts
├── style.css
├── components/
│   ├── PdfViewer.tsx
│   ├── HomePage.tsx
│   └── Sidebar.tsx
└── utils/
    ├── api.ts
    ├── db.ts
    ├── sync.ts
    └── translate.ts    ← 需改为相对路径 /translate

backend/
├── main.py
├── data/
└── pdfs/

public/
├── pdf.worker.min.mjs
└── pdf_viewer.css

vite.config.ts          ← 唯一的 Vite 配置
package.json            ← 清理 electron 依赖
```

### 第 3 步：修复 translate.ts

```typescript
// Before（硬编码）
const API_URL = 'http://localhost:3456/translate'

// After（走 Vite proxy）
const API_URL = '/translate'
```

并在 vite.config.ts 加一条 proxy：
```typescript
proxy: {
  '/docs': { target: 'http://localhost:3456', changeOrigin: true },
  '/translate': { target: 'http://localhost:3456', changeOrigin: true },
}
```

### 第 4 步：清理 package.json

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "html2canvas": "^1.4.1",
    "idb": "^8.0.0",
    "jspdf": "^4.2.1",
    "pdfjs-dist": "^4.10.38",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

---

## 七、总结

| 问题 | 严重性 | 状态 |
|------|--------|------|
| 四套技术路径并存 | 🔴 高 | 需清理 |
| rect 字段名不一致 {x,y,w,h} vs {left,top,w,h} | 🔴 高 | 新代码已修复，旧代码残留 |
| translate.ts 硬编码 localhost | 🟡 中 | 部署后必崩 |
| Electron 遗留代码未清理 | 🟡 中 | 可删 |
| git 误提交 node_modules | 🟢 低 | 已清理 |
| src/renderer/dist submodule | 🟢 低 | 可删 |

**一句话总结**：项目里堆了 Electron 时代的旧代码和新代码两套，只要清理干净旧代码、统一只剩一条路径，大部分问题自然消失。
