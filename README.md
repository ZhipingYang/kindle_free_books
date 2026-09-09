# 📚 Kindle 藏书阁 (Kindle Free Books)

[![Books](https://img.shields.io/badge/资源-711%20个-blue.svg)](https://zhipingyang.github.io/kindle_free_books/)
[![Format](https://img.shields.io/badge/格式-MOBI%20%7C%20EPUB%20%7C%20TXT-brightgreen.svg)](https://zhipingyang.github.io/kindle_free_books/)
[![Reader](https://img.shields.io/badge/在线阅读-MOBI%20%2B%20EPUB%20%2B%20TXT-ff69b4.svg)](https://zhipingyang.github.io/kindle_free_books/)
[![Offline](https://img.shields.io/badge/离线缓存-IndexedDB%20%2B%20Storage-orange.svg)](https://zhipingyang.github.io/kindle_free_books/)
[![GitHub Pages](https://img.shields.io/badge/在线书房-GitHub%20Pages-blueviolet.svg)](https://zhipingyang.github.io/kindle_free_books/)

精心整理的经典免费电子书典藏库，全库书籍均采用流式重排纯净格式（**MOBI / EPUB / TXT**），剔除一切扫描件与杂质文件。已建立规范化命名标准（`书名 - 作者.格式`），配备**纯前端免插件在线阅读引擎**、**书房收藏**、**自动进度持久化恢复**、**IndexedDB 离线缓存**及现代化多端自适应检索站点。

---

## 🌐 在线藏书阁、独立书架与阅读器

无需克隆数以千计的仓库文件，直接打开网页即可在线阅读、检索与下载：

👉 **藏书阁入口**：[https://zhipingyang.github.io/kindle_free_books/](https://zhipingyang.github.io/kindle_free_books/)
⭐ **独立书架入口**：[https://zhipingyang.github.io/kindle_free_books/bookshelf.html](https://zhipingyang.github.io/kindle_free_books/bookshelf.html)
📖 **独立阅读器直达**：`reader.html?id=<bookId>&chapter=<chapterNum>`（直接分享/书签收藏指定书籍与章节）

### 核心功能：
- 📖 **免插件纯静态在线阅读**：原生纯 JS 解析 MOBI（PalmDOC LZ77 流式解压）、EPUB（JSZip 目录与内联图片重构）及 TXT（智能分章与排版），打开即读。
- 🔗 **独立专属阅读 URL (`reader.html`)**：每本图书均具备专属直达链接，支持按章节定位与分享，浏览器原生前进后退顺畅无阻。
- 📱 **移动端视口与细节交互极致调优**：
  - **动态视口无抖动**：完美适配移动端 Safari/Chrome 动态地址栏伸缩（`100dvh`），无双重滚动条，无上下拉扯回弹抖动。
  - **沉浸式智能感知隐藏**：向下阅读滚动时自动滑出收起顶部/底部控制条，向上回滚或轻触正文即刻温润唤出，100% 屏幕净空留给文字。
  - **防遮挡安全间距**：顶部与底部预留充分呼吸内边距（Safe-area Insets）与文末弹性间距，彻底消除导航栏遮挡文案首行/尾段的体验痛点。
  - **手势翻页**：支持单指左右滑动手势翻页（Touch Swipe），沉浸阅读如丝顺滑。
- ⭐ **独立书架专页 (`bookshelf.html`)**：支持直达专属书架 URL，按「我的收藏」、「阅读记录」、「离线可用」、「本地导入」分栏管理，支持检索与一键清空。
- ⏳ **阅读进度记忆与一键恢复**：自动记录阅读章节与精确滚动百分比至 `localStorage`。重启浏览器后通过“最近在读”卡片或书架一键秒级续读。
- 💾 **IndexedDB 本地全本离线缓存**：首次加载或点击离线下载按钮，即可将整本电子书持久化缓存到浏览器本地数据库。即使在飞机、高铁等断网离线环境下，依然秒开畅读。
- ➕ **本地电子书导入**：支持将用户电脑/手机本地的 `.epub` / `.mobi` / `.txt` 文件导入本地私人书房，持久化保存在本地 IndexedDB 中进行阅读。
- 🎨 **专业排版与主题定制**：
  - **4 套护眼主题**：羊皮纸（浅白）、护眼暖黄、雅致暗灰、OLED 纯黑。
  - **3 种精选排版字体**：宋体/明体（墨香古典）、黑体无衬线（现代清晰）、国风楷体（雅致舒展）。
  - **自由版式调节**：支持字号（14px~32px）、行间距、版心宽度自由切换。
- 🔍 **秒级即时搜索**：支持书名、作者、标签、简介关键词实时模糊检索，按 `/` 键秒级聚焦。
- 🏷 **双维度分类与标签云**：内置 10 大核心门类与 30+ 热门主题标签（#推理悬疑、#武侠江湖、#正史典籍、#东野圭吾 等）。
- 📥 **极速下载与直链复制**：每部作品均提供直链复制与高速下载。

---

## 🗂 馆藏门类分布统计

全库现收录 **711 个资源文件**，聚合为 **661 部独立作品**（MOBI: 611 个, EPUB: 78 个, TXT: 22 个），总数据体积约 1.21 GB：

| 分类门类 | 数量 | 格式分布 | 代表作品 / 作者 |
| :--- | :--- | :--- | :--- |
| **外国文学** | **235 本** | MOBI / EPUB / TXT | 东野圭吾全集（《白夜行》《嫌疑人X》）、阿加莎·克里斯蒂探案集、《百年孤独》、《追风筝的人》、《挪威的森林》等 |
| **现代文学** | **149 本** | MOBI | 亦舒文集（80余部）、金庸武侠、古龙作品集、梁羽生武侠全集、鲁迅、沈从文、王小波等 |
| **历史人文** | **82 本** | MOBI / EPUB | 《万历十五年》、《中国大历史》、《中国历史通俗演义》、《剑桥中国史》全系列、各界历史通识与名人传记 |
| **百家讲坛** | **61 本** | MOBI / EPUB | 易中天品三国/先秦诸子、阎崇年清十二帝、刘心武谈红楼、金正昆谈礼仪、王立群读史记等经典名家实录 |
| **天天向上** | **48 本** | MOBI | 《金字塔原理》、《把时间当朋友》、《天才在左疯子在右》、《怪诞行为学》、《富爸爸穷爸爸》等成长经管读物 |
| **古典文学** | **42 本** | MOBI / EPUB | 《四大名著》、《全宋词》、《唐诗三百首》、《乐府诗集》、《四书五经》、《资治通鉴》（文白对照与柏杨版）等 |
| **学习资料** | **32 本** | MOBI / EPUB | 《营销管理》、《定位》、英语词汇、逻辑思维与工具参考手册 |
| **二十四史** | **25 本** | MOBI / EPUB | 司马迁《史记》、班固《汉书》至张廷玉《明史》全 24 部纪传体正史典籍 + 二十四史全集 EPUB 精装版 |
| **哲学宗教** | **13 本** | MOBI / TXT | 《中国哲学简史》、《西方哲学史》、《道德经》、《庄子》、《南怀瑾系列讲座》等 |
| **网络小说** | **24 本** | MOBI / EPUB / TXT | 《全职高手》、《魔道祖师》、《放开那个女巫》、《十日终焉》、《赤心巡天》、《诡秘之主》、《玄鉴仙族》、《斩神》、《宿命之环》等 |

---

## 📖 整理与规范化说明

全库书籍经过自动化管道的深度清洗与校验：

1. **命名标准化**：
   - 统一遵循 **`书名 - 作者.格式`**（如 `白夜行 - 东野圭吾.mobi`、`史记 - 司马迁.mobi`、`民主的细节 - 刘瑜.mobi`）。
   - 去除了书名号《》、`[日]`、`【...】` 等冗余字符；纠正了历史遗留的拼音文件名及抓取时间戳。
2. **内容真伪与重复验证**：
   - 通过原生 Python 解压 MOBI（PalmDOC LZ77）与 EPUB（OPF/XHTML），逐本提取第一章正文前 300 字作为内容比对证据，确认书名与内容 100% 真实对齐。
   - 清理了完全重复的文件副本，并剔除了不安全的 `.exe`、`.docx` 及已淘汰的 `.chm` 文件。
3. **格式纯进化**：
   - 全库仅保留 **MOBI**、**EPUB** 与 **TXT**，告别繁杂不便缩放的扫描版 PDF。

---

## 📱 Kindle 与电子阅读器导入指南

### 方式一：USB 数据线直传（最快、推荐 MOBI）
1. 使用 USB 数据线将 Kindle 连接至电脑。
2. 打开识别出的 Kindle 磁盘，进入 **`documents`** 文件夹。
3. 将下载的 `.mobi` 电子书直接复制到 `documents` 目录下，弹出 Kindle 即可在书架阅读。

### 方式二：亚马逊官方 Send to Kindle（推荐 EPUB / MOBI）
- **网页版推送**：访问 [Amazon Send to Kindle 网页端](https://www.amazon.com/sendtokindle)（支持最大 200MB 文件），拖拽书籍即可自动同步至您的 Kindle 设备与手机 App。
- **邮箱推送**：将文件通过电子邮箱附件发送至您的 `@kindle.com` 个人专用邮箱。

### 方式三：微信读书 / 手机阅读 App
- 支持直接通过微信传输或系统分享菜单将 `.epub` 或 `.mobi` 文件选择由“微信读书”、“多看阅读”或“Apple Books”打开。

---

## 🛠 本地运行与二次开发

本项目为纯静态结构，零依赖、免打包构建：

```bash
# 1. 克隆代码仓库
git clone https://github.com/ZhipingYang/kindle_free_books.git
cd kindle_free_books

# 2. 本地启动 HTTP 预览服务器
python3 -m http.server 8000

# 3. 浏览器打开
open http://localhost:8000
```

若后续在 `books/` 目录下新增或删除图书，运行：
```bash
make catalog
```
提交前执行完整检查：
```bash
make check
```
文件命名、分类、索引生成、本地预览、提交和发布的完整步骤见 [书籍新增与网站更新流程](docs/MAINTENANCE.md)。书籍资源增长后的 Git、GitHub Pages 与对象存储拆分方案见 [仓库与书籍资源治理方案](docs/REPOSITORY_STRATEGY.md)。网站已通过 `assets/js/config.js` 集中管理目录与书籍资源地址，迁移到 CDN 时无需修改阅读器业务代码。

---

## 📄 免责声明

本仓库所有图书资源均由网络公开渠道收集整理，仅供个人技术研究、数据检索测试及 Kindle 阅读排版体验交流使用。版权归原作者及出版机构所有，请在下载后 24 小时内删除。若有侵权争议，请提交 Issue 联系维护者清理。
