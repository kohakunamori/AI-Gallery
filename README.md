# AI 画廊 (AI Gallery)

一个零依赖、纯前端的 AI 生成图像收藏管理器。单 HTML 文件，双击即用，数据全部存储在浏览器本地（LocalStorage + IndexedDB）。

## ✨ 核心功能

- **图像卡片管理** — 添加、编辑、删除、收藏，支持分类管理和右键删除分类
- **AI 绘画参数提取** — 自动从 PNG/JPEG/WebP 图片元数据中读取 Stable Diffusion、NovelAI、ComfyUI 等生成参数（模型、采样器、CFG Scale、Seed、Steps 等）
- **ComfyUI 工作流查看器** — 上传 ComfyUI 生成的图片时自动检测并展示完整工作流 JSON
- **Prompt 组合生成器** — 多选卡片，调整权重，一键复制组合 Prompt
- **AI 画风分析** — 接入 OpenAI 兼容 API，上传图片自动生成 6 字画风总结
- **多维度排序** — 默认 / 名称 / 热度 / 模型 / 收藏筛选
- **数据导入导出** — JSON 格式，含图片 Base64，支持跨设备迁移
- **批量元数据识别** — 一键扫描所有已有图片的生成参数

## 🎨 界面特性

- **iOS 26 Liquid Glass 主题** — 多层毛玻璃效果（SVG feTurbulence 折射 + 高光 + 噪点纹理），可在设置中切换
- **深色 / 浅色 / 午夜 / 樱花 / 海洋** 五套主题
- **自定义背景图** — 上传后自动检测亮度，文字颜色自适应
- **响应式布局** — 紧凑 / 平衡 / 展示 / 自定义四种磁贴预设，可调列数、间距、比例
- **NSFW 模糊** — 标记后自动模糊，悬停查看

## 🛠️ 技术栈

| 项目 | 说明 |
|------|------|
| HTML / CSS / JS | 单文件，无构建步骤 |
| Tailwind CSS | CDN 引入 |
| Lucide Icons | CDN 引入 |
| IndexedDB | 图片 Blob 存储 |
| LocalStorage | 元数据 + 配置持久化 |

## 🚀 使用方式

1. 下载 `artist manager.html`
2. 双击用浏览器打开（推荐 Chrome / Edge）
3. 开始使用

无需安装任何依赖，无需服务器。

## 📸 图片元数据支持

| 格式 | 读取方式 |
|------|----------|
| PNG | tEXt / zTXt / iTXt 块解析 |
| JPEG | EXIF UserComment 字段 |
| WebP | XMP + EXIF 块解析 |

支持的生成器元数据格式：
- Stable Diffusion WebUI (A1111) — `parameters` 文本
- ComfyUI — `prompt` / `workflow` JSON
- NovelAI — `Comment` / `Description` 字段

## 📄 License

MIT
