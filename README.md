## 项目简介

基于 Vue 3 + TypeScript + Vite 的前端项目，集成画布编辑（`CanvasEditor`）、图片生成（`ImageGenerator`）与背景移除（`backgroundRemoval`）等能力。使用 `<script setup>` 语法与现代构建工具链，开箱即用。

## 技术栈

- **框架**: Vue 3
- **语言**: TypeScript
- **构建**: Vite
- **样式**: Tailwind CSS
- **画布**: fabric.js
- **图编辑/节点**: litegraph.js

## 环境要求

- Node.js ≥ 18（推荐 20+）
- pnpm（项目包含 `pnpm-lock.yaml`，建议使用 pnpm）

## 快速开始

1. 安装依赖

```bash
pnpm install
```

2. 启动开发服务器

```bash
pnpm dev
```

浏览器访问开发地址（终端会输出，通常为 `http://localhost:5173`）。

## 构建与预览

- 生产构建

```bash
pnpm build
```

- 本地预览构建产物

```bash
pnpm preview
```

构建输出位于 `dist/` 目录，可直接部署为静态站点。

## 目录结构（简要）

```
.
├─ src/
│  ├─ api/
│  │  ├─ backgroundRemoval.ts     # 背景移除相关接口
│  │  └─ imageGeneration.ts       # 图片生成相关接口
│  ├─ components/
│  │  ├─ CanvasEditor.vue         # 画布编辑器
│  │  ├─ ImageGenerator.vue       # 图片生成器
│  │  └─ HelloWorld.vue
│  ├─ App.vue
│  ├─ main.ts
│  └─ style.css
├─ public/
├─ dist/                          # 构建产物
├─ vite.config.ts
├─ tailwind.config.js
└─ package.json
```

## 核心功能

- **画布编辑器（`CanvasEditor.vue`）**
  - **拖拽/上传图片**: 支持将图片文件直接拖拽到全屏画布或通过隐藏的 `<input type="file" multiple>` 选择上传。
  - **自适应放置**: 单图/多图导入会按画布尺寸自动缩放与布局，避免重叠，并在首次导入时重绘“星空背景”。
  - **缩放与视图**: 鼠标滚轮以指针为中心平滑缩放（最小 0.2，最大 4.0）。
  - **选中与删除**: 支持对象选中状态管理；按 Delete/Backspace 删除当前选中对象，若无选中则删除最后一个对象。
  - **右键菜单（针对选中图片）**:
    - 去除背景：调用 `removeBackground(dataURL, filename)`，在处理期间叠加动态“AI 处理中”蒙版动画；完成后以等效显示尺寸替换原图。
    - 裁剪图片：弹出裁剪弹窗，基于独立的 fabric 画布进行可视化裁剪框编辑（可缩放拖拽），确认后生成裁剪结果并回填到主画布（不覆盖原图）。
    - 下载图片：优先下载当前选中图片的 PNG；若无选中对象则导出整个画布 PNG。
    - AI 修图：占位项（待接入实际服务）。
  - **生成占位/替换**: 与图片生成组件协同：
    - 生成开始：在画布中心创建带虚线流动描边的占位框与“生成中...”标签，并启动动画。
    - 生成完成：用最终图片按占位区域尺寸与位置进行替换；若无占位则作为普通新增。
  - **与生成器的桥接能力**:
    - `hasActiveImage`: 暴露是否有选中图片，驱动生成器模式切换。
    - `getActiveImageDataURL()`: 返回选中图片的 DataURL（供图生图参考）。
    - `replaceActiveImageWith(url)`: 将选中图片以等效显示尺寸替换为新图。

- **图片生成（`ImageGenerator.vue` + `src/api/imageGeneration.ts`）**
  - **两种模式**:
    - 文生图（text-to-image）：仅需输入提示词。
    - 图生图（image-to-image）：输入提示词并提供参考图；若画布已选中图片则自动切换到图生图并使用该选中图作为参考，无需再上传。
  - **参数与默认值**:
    - 文生图：`num_inference_steps=1`，`guidance_scale=0.0`，`width=512`，`height=512`。
    - 图生图：`num_inference_steps=2`，`strength=0.5`（且满足 `steps*strength ≥ 1`），`guidance_scale=0.0`，`width=512`，`height=512`。
  - **调用与规范化**:
    - 文生图接口：`POST http://localhost:8080/api/text-to-image`，返回 `base64`；统一通过 `base64ToDataURL` 规范为 DataURL。
    - 图生图接口：`POST http://localhost:8080/api/image-to-image`，请求体内图片会由 `dataURLToBase64` 转换为纯 `base64`。
  - **交互与回填**:
    - 发起生成时若画布无选中图，则向画布发出 `generation-start` 事件以创建占位。
    - 生成成功：
      - 若画布有选中图：直接调用 `replaceActiveImageWith` 替换原图。
      - 无选中图：发出 `generation-complete`，由画布以占位框替换为最终图片。
    - 生成历史：最近 8 条记录持久化于 `localStorage`（键名 `imageGenerator.history`），支持再次点击添加到画布。

- **背景移除（`src/api/backgroundRemoval.ts`）**
  - **上传流程**: 将 DataURL 转为 Blob 后，以 `multipart/form-data` 上传至 `POST http://localhost:8080/api/upload`。
  - **结果处理**: 成功返回 `{ success, image, filename }`；前端以新图对象替换原图并保持位置/旋转/等效显示大小。
  - **批量接口**: `batchRemoveBackground(imageDataURLs)` 并行处理多张图片。
  - **健康检查**: `checkApiHealth()`（默认请求 `/api/health`）。

> 注意：图片生成与背景移除均依赖本地后端服务（默认 `http://localhost:8080`）。请确保后端已启动并允许跨域访问。

## 常用脚本

```bash
pnpm dev       # 启动开发
pnpm build     # 生产构建（包含类型检查）
pnpm preview   # 预览生产构建
```

## 开发建议

- 使用 VS Code + Volar（或同类插件）获取更佳的 Vue + TS 体验。
- 若引入新依赖，优先使用 `pnpm add` 保持锁定文件一致。
- 统一使用 `<script setup>` 与 Composition API，保持代码风格一致。

## 参考文档

- Vue 3 文档: `https://vuejs.org/`
- `<script setup>`: `https://vuejs.org/api/sfc-script-setup.html`
- Vite: `https://vitejs.dev/`
- Tailwind CSS: `https://tailwindcss.com/`
