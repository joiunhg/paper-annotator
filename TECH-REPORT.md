# Paper Annotator 技术路线分析报告

> 生成时间：2026-04-22
> 当前项目：paper-annotator-electron（~/workspace/paper-annotator-electron/）

---

## 一、当前架构总览

```
用户浏览器 ── :5173 (Vite Dev Server)
                │
                ├─ /docs/* → proxy ── :3456 (FastAPI 后端)
                │                            ├─ PDF 存储 (SQLite)
                │                            ├─ 标注存储 (SQLite)
                │                            └─ 翻译代理 (有道 API)
                │
                ├─ /pdf_viewer.css  (public static)
                └─ /pdf.worker.min.mjs  (public static)

本地 IndexedDB ── db.ts (已存在但未实际使用)
```

---

## 二、每块需求用的技术路线

| 需求 | 技术路线 | 文件 |
|------|----------|------|
| PDF 渲染 | PDF.js v4.10.38 canvas 渲染 | PdfViewer.tsx |
| 文字选字 | PDF.js v4 `TextLayerBuilder`（新增代码） | PdfViewer.tsx |
| 标注存储 | FastAPI + SQLite（后端） | backend/main.py |
| 前端缓存 | IndexedDB `db.ts`（存在但未使用） | db.ts |
| 翻译 | FastAPI 代理 → 有道 API | backend/main.py + translate.ts |
| PDF 上传 | FastAPI multipart → 磁盘存储 | backend/main.py |
| 导出报告 | jsPDF + html2canvas（前端 DOM 转 PDF） | App.tsx |
| 前端构建 | Vite 5 | vite.config.ts |
| 注释层高亮 | 绝对定位 div（坐标 scaling） | PdfViewer.tsx |

---

## 三、当前暴露的两个 Bug 分析

### Bug 1：导入 PDF 后一片黑

**可能原因（按可能性排序）：**

1. **PDF.js v4 TextLayerBuilder 渲染失败但不报错**
   - 代码中 `textLayerBuilder.render()` 是异步的，如果 `textContent` 为空（扫描版 PDF 没有文字），`TextLayerBuilder` 会静默完成但不显示任何内容，canvas 应该正常渲染。
   - 如果 canvas 本身没问题但看不到，是因为文字 span 都是透明色（`color:transparent`）——这是设计如此，但如果 canvas 本身就是黑色/空白，说明 PDF.js 渲染出了问题。

2. **PDF.js v4 worker 加载失败**
   - `workerSrc = "/pdf.worker.min.mjs"` —— 这个文件在 `public/` 目录下，Vite 应该直接 serve，但需要确认文件存在且可访问。

3. **PDF.js v4 渲染 API 不兼容**
   - v4 的 `page.render()` API 可能有变化，需要确认参数格式。

4. **CSS 加载失败**
   - `await fetch("/pdf_viewer.css")` 如果失败，textLayer 会缺少样式，但应该不影响 canvas。

**建议排查：**
- 打开浏览器控制台，看是否有红色报错
- 在 `page.render()` 之后加个 `console.log` 确认 canvas 有内容

---

### Bug 2：刷新后无法连接网络

**可能原因：**

1. **最可能：Vite dev server 被关闭了**
   - 之前开的 `vite --port 5173` 进程可能因为电脑休眠、IDE 重启等原因消失了。
   - **解决方案**：重新启动 `npm run dev` 或 `npx vite --port 5173`

2. **URL 问题**
   - 打开的是 `http://localhost:5173` 还是 `http://192.168.120.x:5173`？
   - 如果是后者，要确认是在同一局域网内。

3. **Vite HMR websocket 断开**
   - Vite 热更新依赖 websocket，如果断开了，浏览器认为"网络问题"。

---

## 四、技术路线互相排斥分析

### 冲突 1：文字选字 vs PDF 渲染（核心矛盾）⚠️ 严重

**问题本质：** PDF.js 在 canvas 上渲染文字为像素，同时又在 DOM 上用 span 覆盖同样位置。

- Canvas 渲染文字：文字不可选中，但视觉正常
- span 层渲染文字：文字可选，但需要 `color:transparent` 让 canvas 文字透出来
- 两个叠加 → 重影

**我们尝试过的方案：**

| 方案 | 做法 | 结果 |
|------|------|------|
| mix-blend-mode: multiply | canvas 文字变黑，无法使用 | ❌ 失败 |
| Proxy 拦截 fillText | 整页变白（fillText 也画图形） | ❌ 失败 |
| Canvas 渲染后填白矩形 | 裁剪不精确 | ❌ 失败 |
| span 完全透明（v4 TextLayerBuilder）| TextLayerBuilder 官方方案 | 🔧 刚写入，待验证 |
| **官方方案（v4 内置）** | Canvas + 官方 textLayer | ⏳ **待验证** |

**PDF.js v4 官方方案原理：**
- `TextLayerBuilder` 负责所有 span 定位和样式
- 官方 CSS 设置 `.textLayer span { color:transparent }` —— 让 canvas 文字透出来
- span 只用于选字，不重复显示文字
- 选字高亮用 CSS `::selection` + `.highlight` 样式

**✅ 不排斥**：如果 TextLayerBuilder 工作正常，这是正确方案。

---

### 冲突 2：坐标系统不统一 ⚠️ 严重

**两套 rect 定义：**

```typescript
// src/types.ts（前端的 rect）
rects?: Array<{
  left: number    // x
  top: number     // y（从上往下）
  width: number
  height: number
}>

// backend/main.py（后端的 rect）—— 字段名不同！
rects: Array({
  x: number       // ← 后端用 x/y
  y: number
  w: number
  h: number
})
```

**两套 scale 补偿：**
- `PdfViewer.tsx` 渲染时：`left: r.left * scale` —— 乘以 scale
- `apiSaveAnnotation` 的 `toServer()` 没有做 scale 补偿 —— **直接存原始坐标**

**后果：**
- 同一个标注在不同缩放级别下，保存时 scale=1，渲染时乘以当前 scale
- 如果用户标注时 scale=1.2，保存时 rects 是 scale=1 的坐标；之后重新打开时如果 scale=1.2，矩形会变成 1.44 倍宽

**✅ 部分不排斥**：但存在 save/load 坐标不一致 bug。

---

### 冲突 3：IndexedDB vs FastAPI 双存储 ⚠️ 中等

**当前状态：**
- `db.ts`（IndexedDB）完整实现，但 App.tsx 从未调用
- 所有数据都通过 FastAPI（`api.ts`）
- `db.ts` 里的 `rects` 字段名和 API `AnnoMeta` 不一致

**问题：**
- 两套存储逻辑维护成本高
- `api.ts` 的 `AnnoMeta` 用 `x/y/w/h`，`db.ts` 里的字段结构不明
- 如果以后要离线支持，需要搞清楚哪套是主数据源

**✅ 不排斥**：目前只用 FastAPI，IndexedDB 是死代码。但需决定哪个是主数据源。

---

### 冲突 4：翻译路径 ⚠️ 低（但有）

**当前翻译路径：**
```
用户选字 → translate.ts → fetch('http://localhost:3456/translate')
                                        ↓
                              FastAPI backend/main.py
                                        ↓
                              有道 API (需网络)
```

**问题：**
- `translate.ts` 里写死了 `http://localhost:3456`，不是通过 Vite 代理
- 如果前端部署到其他域名（CORS 问题），翻译会 404
- 如果用户直接打开分享链接（无 FastAPI 后端），翻译完全不可用

**✅ 不排斥**：但有部署/跨域问题。

---

### 冲突 5：导出逻辑 ⚠️ 低

**当前导出方式：**
- 把 HTML 表格渲染到虚拟 DOM → html2canvas 截图 → jsPDF 生成 PDF
- 问题：如果标注很多，导出可能不完整（虚拟 DOM 尺寸限制）

**✅ 不排斥**

---

## 五、推荐技术路线（统一方案）

```
PDF 渲染           PDF.js v4 canvas + 官方 TextLayerBuilder ✅
文字选字           TextLayerBuilder span（透明）+ mouseup 监听 ✅
标注存储           FastAPI + SQLite（去掉 db.ts）
坐标系统           统一用 {left, top, width, height}，渲染时 × scale
翻译              浏览器直连有道 API（去掉 FastAPI 中间层）
PDF 上传/下载      FastAPI（文件存储）
导出报告           jsPDF + html2canvas
前端构建           Vite 5 + 纯静态部署
离线支持           IndexedDB 作为前端缓存（可选，后续做）
```

**最关键的事：**
1. 先确认 Vite dev server 在运行 → `npx vite --port 5173`
2. 测试 TextLayerBuilder 方案是否正常工作（解决"一片黑"）
3. 统一 rect 坐标系统（解决标注位置漂移）
4. 清理 `db.ts`（或保留但明确只做离线缓存）

---

## 六、立即可执行的检查

```bash
# 1. 确认 Vite 在运行
lsof -i :5173

# 2. 重新启动 Vite
cd ~/workspace/paper-annotator-electron
npx vite --port 5173

# 3. 确认 FastAPI 在运行
lsof -i :3456

# 4. 重新启动 FastAPI
cd ~/workspace/paper-annotator-electron/backend
python3 -c "import sys; print(sys.executable)"
# 然后用正确路径运行
```

---

## 七、当前代码状态总结

| 文件 | 状态 |
|------|------|
| PdfViewer.tsx | 已升级 v4 TextLayerBuilder（刚写入，未验证） |
| vite.config.ts | ✅ 正确（proxy 配置） |
| translate.ts | ⚠️ 硬编码 localhost:3456 |
| api.ts | ⚠️ 坐标字段名不统一 |
| db.ts | ⚠️ 死代码，但存在 |
| backend/main.py | ✅ 基本正常 |
| types.ts | ⚠️ rect 字段名混乱 |
| App.tsx | ✅ 基本正常 |
| HomePage.tsx | ✅ 正常 |
