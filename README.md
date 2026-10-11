# 🎨 GPT Image 2 提示词画廊

纯静态画廊站点：瀑布流浏览、分类筛选、语言筛选、全文搜索、一键复制提示词、详情弹窗。

数据来源：[YouMind-OpenLab/awesome-gpt-image-2](https://github.com/YouMind-OpenLab/awesome-gpt-image-2)（README_zh.md，提示词遵循 CC BY 4.0，由社区收集、仅作教育用途）。

## 本地使用

无需安装任何依赖，数据已内嵌在 `data.js` 中：

- **直接双击 `index.html` 即可**（支持 `file://` 打开），或
- 起个本地服务：`npx serve .` 或 `python -m http.server`，访问对应地址。

## 重新生成数据

当上游仓库更新提示词后，重新拉取 README 并运行：

```bash
git -C ../awesome-gpt-image-2 pull   # 或重新 clone
node build.mjs                        # 默认读取 ../awesome-gpt-image-2/README_zh.md
node build.mjs /path/to/README_zh.md  # 也可显式指定路径
node download-images.mjs              # 下载新增图片到 images/（可重复执行，断点续传）
```

脚本会输出分类分布统计，并重新生成 `data.js`；`download-images.mjs` 会把所有远程图片本地化并改写 `data.js` 中的路径，使站点不依赖外链 CDN。

## 部署

整个目录就是静态站点（含 `images/` 本地图片，约 60 MB），任何静态托管都能直接部署：

| 方式 | 说明 |
|------|------|
| GitHub Pages | 仓库 Settings → Pages → 部署分支根目录（60 MB 远小于 1 GB 限制） |
| Vercel / Netlify | 导入仓库，构建命令留空，输出目录 `.` |
| Cloudflare Pages | 上传目录或连接仓库即可 |

## 文件结构

```
.
├── index.html            # 页面骨架（含详情弹窗）
├── style.css             # 深色主题、响应式瀑布流
├── app.js                # 筛选/搜索/排序/弹窗/复制逻辑（无依赖原生 JS）
├── data.js               # build.mjs 生成，window.GALLERY_DATA 内嵌数据
├── build.mjs             # README_zh.md → data.js 解析脚本（Node 18+，零依赖）
├── download-images.mjs   # 远程图片本地化脚本（断点续传）
└── images/               # 下载的生成图片
```

## 功能

- 🔍 全文搜索：标题、描述、提示词正文、作者
- 🏷️ 分类筛选（10 个使用场景分类 + 精选）、语言筛选（中文/English/日本語）
- 🔃 排序：最新优先 / 最早优先 / 精选优先
- 📋 卡片上一键复制提示词；详情弹窗可查看全部生成图片与完整提示词
- 🔗 URL 同步筛选状态与打开的详情（`#cat=...&q=...&p=...`），可分享深链
- 📱 响应式布局，图片懒加载
