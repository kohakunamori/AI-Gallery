# AI Gallery

单 HTML 文件的 AI 图像收藏管理器。双击打开，数据存在浏览器本地，不需要服务器和依赖。

## 功能

- 图像卡片的添加、编辑、删除、收藏，支持分类管理
- 从 PNG/JPEG/WebP 图片元数据中自动读取 Stable Diffusion、NovelAI、ComfyUI 的生成参数（模型、采样器、CFG Scale、Seed、Steps 等）
- 上传 ComfyUI 图片时自动检测并展示工作流 JSON
- 多选卡片组合 Prompt，可调权重，一键复制
- 接入 OpenAI 兼容 API，上传图片自动生成画风总结
- 按名称、热度、模型、收藏等维度排序筛选
- JSON 格式导入导出，含图片 Base64，可跨设备迁移
- 批量扫描已有图片的生成参数

## 界面

- iOS 26 Liquid Glass 风格的毛玻璃主题（SVG feTurbulence 折射 + 高光 + 噪点），可在设置中切换
- 深色、浅色、午夜、樱花、海洋五套主题
- 支持自定义背景图，上传后自动检测亮度适配文字颜色
- 四种磁贴预设（紧凑 / 平衡 / 展示 / 自定义），可调列数、间距、比例
- NSFW 标记后自动模糊，悬停查看

## 技术栈

| 项目 | 说明 |
|------|------|
| HTML / CSS / JS | 单文件，无构建步骤 |
| Tailwind CSS | CDN 引入 |
| Lucide Icons | CDN 引入 |
| IndexedDB | 图片 Blob 存储 |
| LocalStorage | 元数据和配置持久化 |

## 使用

1. 下载 `artist manager.html`
2. 用浏览器打开（推荐 Chrome / Edge）
3. 开始用

## 图片元数据支持

| 格式 | 读取方式 |
|------|----------|
| PNG | tEXt / zTXt / iTXt 块解析 |
| JPEG | EXIF UserComment 字段 |
| WebP | XMP + EXIF 块解析 |

支持的生成器：
- Stable Diffusion WebUI (A1111) — `parameters` 文本
- ComfyUI — `prompt` / `workflow` JSON
- NovelAI — `Comment` / `Description` 字段

## License

MIT
