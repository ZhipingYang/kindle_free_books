# 书籍新增与网站更新流程

本文是日常维护的唯一操作手册。正常新增书籍只使用 `update_books.py` 和 `audit_library.py`，不要手工编辑 `books.json`。

## 1. 准备书籍

- 只添加确认允许分发的资源。
- 支持 `.epub`、`.mobi`、`.txt`，扩展名使用小写。
- 放入现有分类：`books/<分类>/`。同一作者书籍较多时，可以再建立一层作者目录。
- 文件名优先使用 `书名 - 作者.格式`，例如 `白夜行 - 东野圭吾.mobi`。
- 同一作品的不同格式使用完全相同的书名和作者，网站会自动聚合为一部作品。
- 已发布文件不要随意改名或移动。图书 ID 由相对路径生成，改路径会让既有收藏、阅读进度和旧链接失效。

## 2. 更新目录

在仓库根目录运行：

```bash
make catalog
```

它会扫描 `books/`，复用未变化文件的元数据，只解析新增或变化的文件，并一键自动更新 `books.json`、`meta.json` 以及全套自适应矢量资产（`assets/badges/` 徽标、`assets/images/library-stats.svg` 全景看板、`assets/images/library-compact.svg` 紧凑横幅）。**`README.md` 与 `index.html` 已彻底解耦，增删书籍时永远无需改动文档与页面源码**。如果内容没有变化，脚本不会重写任何文件，保证纯幂等与零无效 Git diff。

只有修改了元数据解析或清洗规则时，才执行完整重建：

```bash
make rebuild
```

完整重建会重新解析全部书籍，提交前应重点检查 `books.json` 中书名、作者和简介的变化。

## 3. 提交前检查

```bash
make check
git diff --check
git status --short
```

检查项包括：

- `books.json` 是否需要重新生成；
- 磁盘文件、目录条目、文件大小和稳定 ID 是否一致；
- 分类、格式数量和总大小统计是否一致；
- 是否存在内容完全相同的重复文件；
- 是否出现超过 50 MB、需要单独评估存储方式的文件。

CI 会在推送和拉取请求中重复执行目录与资源审计。

## 4. 本地预览

```bash
make serve
```

访问 `http://localhost:8000`，至少抽查以下路径：

1. 首页能显示正确的文件数、分类和格式统计；
2. 新书可以通过书名、作者、分类和格式找到；
3. 详情抽屉的下载链接可用；
4. EPUB、MOBI、TXT 各抽一本进入 `reader.html`，确认解析和章节导航正常；
5. 在约 390px 手机视口和常规桌面视口检查首页与书架页；
6. 明暗主题下检查文字对比度。

如果修改了带版本参数的 CSS 或页面脚本，同时更新 HTML 引用后的 `?v=` 值，避免浏览器继续使用旧缓存。

## 5. 提交与发布

```bash
git add books books.json meta.json assets/badges assets/images
git commit -m "books: add <书名或批次说明>"
git push origin master
```

若 GitHub Pages 配置为从 `master` 根目录发布，推送后等待 Pages 部署完成，再在线重复下载和阅读抽查。不要把未经验证的目录更新直接强制推送到稳定分支。

## 6. 资源迁移到 CDN 后

保持对象键仍为 `books/<分类>/<文件名>`，并修改 `assets/js/config.js` 中的 `assetBaseUrl`。资源域名必须提供 HTTPS、CORS，并允许浏览器获取完整文件；上线前应验证下载、在线阅读和离线缓存。

完整迁移与 Git 历史瘦身步骤见 [仓库与书籍资源治理方案](REPOSITORY_STRATEGY.md)。
