# 仓库与书籍资源治理方案

## 结论

网站代码与书籍二进制文件应当隔离，但不建议用两个长期分支隔离。Git 分支共享同一套对象库，无法降低克隆体积；部署时还会增加跨分支同步成本。

推荐的最终结构：

```text
open-cloud-bookshelf/     网站、阅读器、books.json、脚本、文档
object storage + CDN/     books/<分类>/<书名>.<格式>
```

`books.json` 继续保留相对路径。迁移资源后，只需修改 `assets/js/config.js` 中的 `assetBaseUrl`，搜索、下载、阅读和离线缓存会统一使用新地址。

## 为什么不使用独立分支或 Git LFS

- `website` / `books` 两个分支依然共享 Git 对象；普通克隆仍会承受历史体积，且目录变更需要跨分支同步。
- Git LFS 很适合开发仓库中的大型二进制文件，但 GitHub Pages 不支持从 Pages 站点直接使用 Git LFS 对象，因此不适合本站当前的在线阅读路径。
- 独立书籍仓库可以隔离权限，但仍会把 1 GB 二进制历史交给 Git 管理。它只适合作为短期过渡，不是最终存储层。

## 推荐迁移顺序

1. 建立支持 HTTPS、CORS 和 Range 请求的对象存储桶/CDN；保持 `books/...` 对象键不变。
2. 上传资源并抽样校验 SHA-256、下载、EPUB/MOBI/TXT 在线解析和跨域响应头。
3. 将 `assets/js/config.js` 的 `assetBaseUrl` 指向资源域名，先在预览环境验证。
4. 发布网站后，再从 Git 的当前树中移除 `books/`，并将其加入 `.gitignore`。
5. 最后在完整备份和维护窗口中使用 `git filter-repo` 清除历史里的 `books/`，再协调强制推送与协作者重新克隆。

第 4、5 步会改变公开下载地址或重写历史，不能在资源域名就绪前执行。

## 日常维护流程

新增或替换书籍时：

```bash
make catalog
make check
```

审计会检查目录与 `books.json` 是否一致、是否存在内容完全相同的文件，以及是否出现超过 50 MB 的单文件。CI 会在每次推送和拉取请求中执行同样的检查。

日常新增、预览与发布的完整闭环见 [书籍新增与网站更新流程](MAINTENANCE.md)。

## 历史瘦身（迁移完成后执行）

以下命令仅作为维护手册，不应在日常开发中直接运行：

```bash
# 先在仓库外制作可恢复备份，并通知所有协作者
git filter-repo --path books --invert-paths
git push --force --all origin
git push --force --tags origin
```

历史重写后，旧克隆不应继续 push；协作者需要重新 clone。网站仓库应只保留代码、目录元数据和小型静态资源。
