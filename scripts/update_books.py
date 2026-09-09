#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
open-cloud-bookshelf: Automated Books Catalog Generator.
Scans the `books/` directory, extracts metadata (EPUB, MOBI, TXT),
and generates a fresh `books.json` for the static website.

Usage:
    python3 scripts/update_books.py          # Fast update (reuses existing metadata if files unchanged)
    python3 scripts/update_books.py --rebuild # Full re-scan of all files
    python3 scripts/update_books.py --check   # Verify books.json is current without rewriting it
"""

import os
import re
import sys
import json
import time
import struct
import hashlib
import zipfile
from pathlib import Path
from collections import defaultdict

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BOOKS_DIR = os.path.join(REPO_ROOT, 'books')
CATALOG_PATH = os.path.join(REPO_ROOT, 'books.json')
README_PATH = os.path.join(REPO_ROOT, 'README.md')
INDEX_HTML_PATH = os.path.join(REPO_ROOT, 'index.html')
STATS_SVG_PATH = os.path.join(REPO_ROOT, 'assets', 'images', 'library-stats.svg')

# Palette for SVG visualization and category badges
CATEGORY_PALETTE = [
    "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
    "#06b6d4", "#d97706", "#14b8a6", "#e11d48", "#6366f1",
    "#84cc16", "#a855f7", "#0ea5e9", "#f97316", "#059669"
]

# Supported eBook extensions
SUPPORTED_EXTENSIONS = {'.epub', '.mobi', '.txt'}

# 24 Histories author mapping
TWENTY_FOUR_HISTORIES = {
    '史记': '司马迁', '汉书': '班固', '后汉书': '范晔', '三国志': '陈寿',
    '晋书': '房玄龄等', '宋书': '沈约', '南齐书': '萧子显', '梁书': '姚思廉',
    '陈书': '姚思廉', '魏书': '魏收', '北齐书': '李百药', '周书': '令狐德棻等',
    '隋书': '魏征等', '南史': '李延寿', '北史': '李延寿', '旧唐书': '刘昫等',
    '新唐书': '欧阳修、宋祁', '旧五代史': '薛居正等', '新五代史': '欧阳修',
    '宋史': '脱脱等', '辽史': '脱脱等', '金史': '脱脱等', '元史': '宋濂等',
    '明史': '张廷玉等'
}

FAMOUS_AUTHORS_MAP = {
    '明朝那些事儿': '当年明月',
    '中国大历史': '黄仁宇',
    '万历十五年': '黄仁宇',
    '一口气读完世界历史': '段金',
    '货币战争': '宋鸿兵',
    '货币战争2：金权天下': '宋鸿兵',
    '中国哲学简史': '冯友兰',
    '西方哲学史': '罗素',
    '天才在左疯子在右': '高铭',
    '把时间当朋友': '李笑来',
    '金字塔原理': '芭霸拉·明托',
    '资治通鉴': '司马光',
    '资治通鉴（柏杨版）': '柏杨',
    '唐诗三百首': '蘅塘退士编',
    '全宋词': '唐圭璋编',
    '乐府诗集': '郭茂倩编',
    '金庸全集': '金庸',
    '古龙作品集': '古龙',
    '古龙全集': '古龙',
    '梁羽生武侠全集': '梁羽生',
    '神墓': '辰东',
    '诛仙': '萧鼎',
    '佣兵天下': '说不得大师',
    '动物庄园': '乔治·奥威尔',
    '1984': '乔治·奥威尔',
    '百年孤独': '加西亚·马尔克斯',
    '追风筝的人': '卡勒德·胡赛尼',
    '挪威的森林': '村上春树',
    '当我谈跑步时，我谈些什么': '村上春树',
    '乔布斯传': '沃尔特·艾萨克森',
    '曾国藩家书': '曾国藩',
    '诡秘之主': '爱潜水的乌贼',
    '玄鉴仙族': '季越人',
    '全职高手': '蝴蝶蓝',
    '魔道祖师': '墨香铜臭',
    '放开那个女巫': '二目',
    '十日终焉': '杀虫队队员',
    '赤心巡天': '情何以甚',
    '我在精神病院学斩神': '三九音域',
    '宿命之环': '爱潜水的乌贼',
    '破云2吞海': '淮上',
    '1979黄金时代': '睡觉会变白',
    '伪装学渣': '木瓜黄',
    '异度旅社': '远瞳',
    '轮回乐园': '那一只蚊子',
    '最强反套路系统': '太上布衣',
    '我不是戏神': '三九音域',
    '一级律师[星际]': '木苏里',
    'FOG[电竞]': '漫漫何其多',
    '兼职无常后我红了': '拉棉花糖的兔子',
    '我在惊悚游戏里封神（无限）': '壶鱼辣椒',
    '长夜君主': '风凌天下',
    '尸生子，鬼抬棺': '爱吃糯米红糖粥的界玉',
    '我以狐仙镇百鬼': '紫梦游龙',
    '捞尸人': '陈十三',
    '真实的克苏鲁跑团游戏': '我要搞事情',
    '今日离港': '鱼宰',
    '非职业半仙': '拉棉花糖的兔子',
    '花千骨': 'Fresh果果',
    '种田文之女配人生': '春未绿',
    '平步青云': '御史大夫',
    '开局停职？我转投纪委调查组': '江门二爷',
    # 殿堂级/现象级精选新增
    '仙逆': '耳根',
    '光阴之外': '耳根',
    '莽荒纪': '我吃西红柿',
    '择天记': '猫腻',
    '万相之王': '天蚕土豆',
    '大梦主': '忘语',
    '天域苍穹': '风凌天下',
    '嘉佑嬉事': '血红',
    '造化之门': '鹅是老五',
    '逆天邪神': '火星引力',
    '斩仙': '任怨',
    '我有一个修仙世界': '纯九莲宝灯',
    '圣女来时不纳粮': '恶魔奶爸',
    '俗人回档': '庚新',
    '天才医生': '柳下挥',
    '首席御医': '银鱼',
    '夫人你马甲又掉了': '一路烦花',
    '重生之将门毒后': '千山茶客',
    '良陈美锦': '沉香灰烬',
    '山河枕': '墨书白',
    '重生之人渣反派自救系统': '墨香铜臭',
    '深空彼岸': '辰东',
    '欢迎进入梦魇直播间': '桑沃',
    '雪中悍刀行': '烽火戏诸侯',
    '灵境行者': '卖报小郎君',
    '黄昏分界': '黑山老鬼',
    '牧神记': '宅猪',
    # wxnacy/book 精选名篇
    '长安十二时辰': '马伯庸',
    '风起陇西': '马伯庸',
    '高智商犯罪': '紫金陈',
    '低智商犯罪': '紫金陈',
    '暗黑者四部曲': '周浩晖',
    '暗黑者外传：惩罚': '周浩晖',
    '斗宴': '周浩晖',
    '网内人': '陈浩基',
    '无名之町': '东野圭吾',
    '巨人的陨落': '肯·福莱特',
    '你当像鸟飞往你的山': '塔拉·韦斯特弗',
    '追寻逝去的时光': '马塞尔·普鲁斯特',
    '喜鹊谋杀案': '安东尼·赫洛维兹',
    '全员嫌疑人': '大山诚一郎',
    '字母表谜案': '大山诚一郎',
    '紧闭的门扉': '石持浅海',
    '美国陷阱': '弗雷德里克·皮耶鲁齐',
    '下流社会': '三浦展',
    '一往无前': '范海涛',
    '贫穷的本质': '阿比吉特·班纳吉',
    '拖延心理学': '简·博克',
    '了不起的我': '陈海贤',
    '跃迁：成为高手的技术': '古典',
    '微习惯': '斯蒂芬·盖斯',
    '早起的奇迹': '哈尔·埃尔罗德',
    '你的孩子不是你的孩子': '吴晓乐',
    '那些古怪又让人忧心的问题': '兰道尔·门罗',
    '如何不切实际地解决实际问题': '兰道尔·门罗',
    '流畅的Python': '卢西亚诺·拉马略',
    '学习的方法': '圣地亚哥·拉蒙-卡哈尔',
    '我在100天内自学英文翻转人生': '姜声泰',
    '庆余年': '猫腻',
    '坏蛋是怎样炼成的': '六道',
    '坏蛋是怎样炼成的2': '六道',
    '侯大利刑侦笔记': '小桥老树',
    '侯大利刑侦笔记2': '小桥老树',
    '弹弓神警': '常书欣',
    '弹弓神警2': '常书欣',
    '猎头局中局1': '萧东楼',
    '猎头局中局2': '萧东楼',
}

KNOWN_SUBDIR_AUTHORS = {
    '阿加莎.克里斯蒂': '阿加莎·克里斯蒂',
    '东野圭吾': '东野圭吾',
    '亦舒文集': '亦舒',
}

def format_size(size_bytes):
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"
    elif size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes} B"

def decompress_palmdoc(data):
    out = bytearray()
    i = 0
    n = len(data)
    while i < n:
        c = data[i]
        i += 1
        if 1 <= c <= 8:
            out.extend(data[i:i+c])
            i += c
        elif c < 128:
            out.append(c)
        elif c >= 192:
            out.append(32)
            out.append(c ^ 128)
        else:
            if i >= n: break
            c2 = data[i]
            i += 1
            dist = (((c << 8) | c2) >> 3) & 0x7ff
            length = (c2 & 7) + 3
            for _ in range(length):
                pos = len(out) - dist
                if 0 <= pos < len(out):
                    out.append(out[pos])
                else:
                    out.append(32)
    return bytes(out)

def clean_text_excerpt(text, max_len=300):
    if not text: return ""
    text = re.sub(r'<style[^>]*>.*?</style>', ' ', text, flags=re.DOTALL|re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', ' ', text, flags=re.DOTALL|re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&[a-zA-Z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:max_len]

def parse_mobi(path):
    meta = {'title': '', 'author': '', 'description': '', 'excerpt': ''}
    try:
        with open(path, 'rb') as f:
            header = f.read(1024)
            if len(header) < 92: return meta
            num_records = struct.unpack('>H', header[76:78])[0]
            rec0_offset = struct.unpack('>I', header[78:82])[0]
            f.seek(rec0_offset)
            rec0 = f.read(8192)
            if len(rec0) < 132: return meta
            if rec0[16:20] == b'MOBI':
                header_len = struct.unpack('>I', rec0[20:24])[0]
                title_offset = struct.unpack('>I', rec0[84:88])[0]
                title_len = struct.unpack('>I', rec0[88:92])[0]
                if title_offset + title_len <= len(rec0):
                    meta['title'] = rec0[title_offset:title_offset+title_len].decode('utf-8', errors='ignore').strip()
                exth_flag = struct.unpack('>I', rec0[128:132])[0]
                if exth_flag & 0x40:
                    exth_offset = 16 + header_len
                    if exth_offset + 12 <= len(rec0) and rec0[exth_offset:exth_offset+4] == b'EXTH':
                        count = struct.unpack('>I', rec0[exth_offset+8:exth_offset+12])[0]
                        pos = exth_offset + 12
                        for _ in range(count):
                            if pos + 8 > len(rec0): break
                            rtype, rlen = struct.unpack('>II', rec0[pos:pos+8])
                            rdata = rec0[pos+8:pos+rlen]
                            pos += rlen
                            try:
                                text = rdata.decode('utf-8', errors='ignore').strip()
                                if rtype == 100: meta['author'] = text
                                elif rtype == 103: meta['description'] = clean_text_excerpt(text, 500)
                            except: pass

            if num_records > 1:
                rec1_offset = struct.unpack('>I', header[86:90])[0]
                rec2_offset = struct.unpack('>I', header[94:98])[0] if num_records > 2 else rec1_offset + 4096
                f.seek(rec1_offset)
                raw_len = min(8192, max(0, rec2_offset - rec1_offset))
                if raw_len > 0:
                    raw_rec1 = f.read(raw_len)
                    decomp = decompress_palmdoc(raw_rec1)
                    excerpt = clean_text_excerpt(decomp.decode('utf-8', errors='ignore'), 320)
                    if len(excerpt) > 20:
                        meta['excerpt'] = excerpt
    except Exception:
        pass
    return meta

def parse_epub(path):
    import xml.etree.ElementTree as ET
    meta = {'title': '', 'author': '', 'description': '', 'excerpt': ''}
    try:
        with zipfile.ZipFile(path, 'r') as z:
            opf_name = None
            for name in z.namelist():
                if name.endswith('.opf'):
                    opf_name = name
                    break
            if opf_name:
                content = z.read(opf_name)
                root = ET.fromstring(content)
                for elem in root.iter():
                    tag = elem.tag.split('}')[-1].lower()
                    if tag == 'title' and elem.text and not meta['title']:
                        meta['title'] = elem.text.strip()
                    elif tag == 'creator' and elem.text and not meta['author']:
                        meta['author'] = elem.text.strip()
                    elif tag == 'description' and elem.text and not meta['description']:
                        meta['description'] = clean_text_excerpt(elem.text, 500)

            for name in z.namelist():
                if re.search(r'\.(x?html|htm)$', name, re.IGNORECASE) and not re.search(r'(cover|title|toc)', name, re.IGNORECASE):
                    html_content = z.read(name).decode('utf-8', errors='ignore')
                    excerpt = clean_text_excerpt(html_content, 320)
                    if len(excerpt) > 40:
                        meta['excerpt'] = excerpt
                        break
    except Exception:
        pass
    return meta

def parse_txt(path):
    meta = {'title': '', 'author': '', 'description': '', 'excerpt': ''}
    try:
        with open(path, 'rb') as f:
            raw = f.read(4096)
            for enc in ['utf-8', 'gb18030', 'gbk', 'big5']:
                try:
                    text = raw.decode(enc)
                    meta['excerpt'] = clean_text_excerpt(text, 300)
                    break
                except UnicodeDecodeError:
                    # If it failed only due to trailing incomplete multibyte character, try with ignore
                    try:
                        text = raw.decode(enc, errors='ignore')
                        if len(text.strip()) > 10:
                            meta['excerpt'] = clean_text_excerpt(text, 300)
                            break
                    except Exception:
                        continue
                except Exception:
                    continue
    except Exception:
        pass
    return meta

def clean_title_and_author(filename_no_ext, category, sub_dir, parsed_meta):
    name = filename_no_ext.strip()

    # 百家讲坛 series
    if category == '百家讲坛' or name.startswith(('百家讲坛-', '百家讲坛_', '百家讲坛：', '百家讲坛:')):
        topic = re.sub(r'^百家讲坛[：:\-_]+', '', name).strip()
        topic = re.sub(r'-\d{10,}', '', topic).strip()
        author = '百家讲坛'
        for spk in ['刘心武', '易中天', '阎崇年', '王立群', '于丹', '钱文忠', '纪连海', '蒙曼', '郦波', '金正昆']:
            if spk in topic:
                author = spk
                break
        return f"百家讲坛：{topic}", author

    # 二十四史
    if category == '二十四史':
        clean_hist = re.sub(r'^[0-9]{2}', '', name).strip()
        for hist_key, hist_author in TWENTY_FOUR_HISTORIES.items():
            if hist_key in clean_hist:
                return hist_key, hist_author

    # Remove country brackets like [日], [美]
    name = re.sub(r'^\[[^\]]+\]', '', name).strip()
    name = re.sub(r'^[【\[（\(]([^】\]）\)]+)[】\]）\)]', '', name).strip()

    book_title_match = re.search(r'《([^》]+)》', name)
    extracted_book_title = book_title_match.group(1).strip() if book_title_match else ''

    author = ''
    if sub_dir in KNOWN_SUBDIR_AUTHORS:
        author = KNOWN_SUBDIR_AUTHORS[sub_dir]

    for bk, auth in FAMOUS_AUTHORS_MAP.items():
        if bk in name or (extracted_book_title and bk in extracted_book_title):
            author = auth
            break

    if not author and parsed_meta.get('author'):
        pa = parsed_meta['author'].strip()
        if 1 < len(pa) <= 15:
            clean_pa = re.sub(r'^(著|编|译|作者|撰)[:：]?', '', pa).strip()
            clean_pa = re.sub(r'[\[\(（].*?[\]\)）]', '', clean_pa).strip()
            if clean_pa and not any(w in clean_pa for w in ['出版社', '文库', '书友', 'txt', 'mobi', 'epub']):
                author = clean_pa

    # Pattern: 书名 - 作者
    if author:
        pat = r'[\-—_]\s*' + re.escape(author) + r'$'
        name = re.sub(pat, '', name).strip()

    m_dash = re.search(r'[\-—_]\s*([^\s\-—_()（）\[\]]+)$', name)
    if m_dash:
        cand = m_dash.group(1).strip()
        is_valid_author = (1 < len(cand) <= 8 or (len(cand) <= 20 and '·' in cand)) and (
            not cand.isdigit() and not any(w in cand for w in ['全集', '完整', '精校', '上卷', '下卷', '册', '版'])
        )
        if is_valid_author or (author and cand == author):
            if not author: author = cand
            name = name[:m_dash.start()].strip()

    title = extracted_book_title if extracted_book_title else name.replace('《', '').replace('》', '').strip()
    title = re.sub(r'实体书精校版', '', title).strip()
    title = re.sub(r'三联版\d*', '', title).strip()
    title = re.sub(r'全十册\d*', '', title).strip()

    author = author.replace('《', '').replace('》', '').replace('[', '').replace(']', '').replace('/', '、').replace('\\', '、').strip()
    return title.strip(), author.strip()

def generate_tags(title, author, category, sub_category):
    tags = set()
    cat_tag_map = {
        '二十四史': ['正史典籍', '纪传体', '史学经典'],
        '历史人文': ['历史通识', '人文社科'],
        '古典文学': ['古典文学', '古代经典'],
        '现代文学': ['现当代文学'],
        '外国文学': ['外国文学', '世界名著'],
        '哲学宗教': ['哲学宗教', '思想国学'],
        '百家讲坛': ['名家讲坛', '通俗讲史'],
        '天天向上': ['成长励志', '思维认知'],
        '学习资料': ['学习参考', '实用资料'],
        '网络小说': ['网络畅销', '流行小说']
    }
    for t in cat_tag_map.get(category, []):
        tags.add(t)

    if sub_category:
        if '武侠' in sub_category: tags.add('武侠江湖')
        elif '亦舒' in sub_category: tags.add('言情都市')
        elif '东野圭吾' in sub_category: tags.add('推理悬疑')
        elif '阿加莎' in sub_category: tags.add('英伦推理')

    if author:
        tags.add(author)
        if author in ['金庸', '古龙', '梁羽生', '温瑞安']:
            tags.add('武侠江湖')
            tags.add('大师全集')
        elif author in ['东野圭吾', '阿加莎·克里斯蒂', '柯南·道尔']:
            tags.add('推理悬疑')
        elif author in ['鲁迅', '老舍', '沈从文', '汪曾祺', '张爱玲', '王小波', '钱钟书', '路遥', '余华']:
            tags.add('文学大师')
        elif author in ['司马迁', '班固', '司马光', '黄仁宇']:
            tags.add('史学宗师')

    if any(k in title for k in ['史记', '汉书', '三国志', '资治通鉴', '二十四史']):
        tags.add('正史典籍')
    if any(k in title for k in ['诗', '词', '曲', '赋']):
        tags.add('诗词歌赋')
    if any(k in title for k in ['全集', '作品集', '文集', '全册']):
        tags.add('经典合集')
    if any(k in title for k in ['经济', '货币', '金融', '资本', '投资']):
        tags.add('经济金融')
    if any(k in title for k in ['哲学', '论语', '道德经', '庄子', '佛经', '禅']):
        tags.add('哲学思辨')

    return sorted(list(tags))[:4]

def load_existing_catalog():
    if not os.path.exists(CATALOG_PATH):
        return {}
    try:
        with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            catalog = {}
            for b in data.get('books', []):
                p = b.get('path', '')
                if p:
                    catalog[p] = b
                    if p.startswith('books/'):
                        catalog[p[6:]] = b
                    else:
                        catalog[f"books/{p}"] = b
            return catalog
    except Exception as e:
        print(f"Warning: Failed to load existing catalog: {e}")
        return {}

def scan_books(rebuild=False, check_only=False):
    existing_catalog = {} if rebuild else load_existing_catalog()
    books = []
    start_time = time.time()

    if not os.path.isdir(BOOKS_DIR):
        print(f"Error: Books directory not found at {BOOKS_DIR}")
        sys.exit(1)

    added_count = 0
    cached_count = 0

    for root, dirs, files in os.walk(BOOKS_DIR):
        dirs.sort()
        for filename in sorted(files):
            if filename.startswith('.'):
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue

            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, REPO_ROOT).replace('\\', '/')
            size_bytes = os.path.getsize(full_path)
            if size_bytes == 0:
                print(f"Skipping empty 0KB file: {rel_path}")
                continue
            book_id = hashlib.md5(rel_path.encode('utf-8')).hexdigest()[:10]

            # Path format: books/<category>/[<subCategory>/]<filename>
            rel_parts = Path(rel_path).parts
            category = rel_parts[1] if len(rel_parts) > 2 else '未分类'
            sub_category = rel_parts[2] if len(rel_parts) > 3 else ''

            # Check if we can reuse cached metadata
            existing = existing_catalog.get(rel_path)
            if existing and existing.get('size') == size_bytes and not rebuild:
                entry = dict(existing)
                entry['id'] = book_id
                entry['path'] = rel_path
                entry['category'] = category
                entry['subCategory'] = sub_category
                entry['size'] = size_bytes
                entry['sizeFormatted'] = format_size(size_bytes)
                books.append(entry)
                cached_count += 1
                continue

            added_count += 1
            filename_no_ext = os.path.splitext(filename)[0]
            parsed_meta = {}
            if ext == '.mobi':
                parsed_meta = parse_mobi(full_path)
            elif ext == '.epub':
                parsed_meta = parse_epub(full_path)
            elif ext == '.txt':
                parsed_meta = parse_txt(full_path)

            title, author = clean_title_and_author(filename_no_ext, category, sub_category, parsed_meta)
            description = parsed_meta.get('description', '')
            excerpt = parsed_meta.get('excerpt', '')
            if not description and excerpt:
                description = excerpt
            if not description:
                description = f"《{title}》是收录于{category}门类的经典读物，由 {author if author else '名家'} 所作，具有深厚的阅读与收藏价值。"

            tags = generate_tags(title, author, category, sub_category)

            books.append({
                'id': book_id,
                'title': title,
                'originalName': filename_no_ext,
                'author': author if author else '佚名',
                'category': category,
                'subCategory': sub_category,
                'format': ext.lstrip('.'),
                'size': size_bytes,
                'sizeFormatted': format_size(size_bytes),
                'path': rel_path,
                'description': description[:400],
                'excerpt': excerpt[:300] if excerpt else "",
                'tags': tags
            })

def generate_stats_svg_content(catalog, date_str=None):
    """Generate modern, responsive SVG stats card for README and documentation."""
    meta = catalog.get('meta', {})
    books = catalog.get('books', [])
    total_books = meta.get('totalBooks', len(books))
    unique_works = len(set(b.get('title', '') for b in books)) if books else total_books
    total_size_str = meta.get('totalSizeFormatted', '0 B')
    formats = meta.get('formats', {})
    categories = meta.get('categories', {})

    format_summary = f"MOBI:{formats.get('mobi', 0)} EPUB:{formats.get('epub', 0)} TXT:{formats.get('txt', 0)}"

    sorted_cats = sorted(categories.items(), key=lambda x: x[1], reverse=True)
    num_cats = len(sorted_cats)
    rows = (num_cats + 4) // 5 if num_cats > 0 else 1
    svg_height = max(320, 225 + rows * 42 + 15)

    display_date = date_str or time.strftime('%Y-%m-%d')

    bar_rects = []
    curr_x = 40.0
    bar_total_width = 800.0
    for idx, (cat, count) in enumerate(sorted_cats):
        color = CATEGORY_PALETTE[idx % len(CATEGORY_PALETTE)]
        w = round((count / total_books) * bar_total_width, 1) if total_books > 0 else 0
        bar_rects.append(f'<rect x="{curr_x}" y="180" width="{w}" height="12" fill="{color}" rx="2" />')
        curr_x += w

    cat_items = []
    for idx, (cat, count) in enumerate(sorted_cats):
        color = CATEGORY_PALETTE[idx % len(CATEGORY_PALETTE)]
        col = idx % 5
        row = idx // 5
        x = 40 + col * 160
        y = 225 + row * 42
        pct = (count / total_books * 100) if total_books > 0 else 0.0
        cat_items.append(f"""    <g transform="translate({x}, {y})">
      <circle cx="6" cy="6" r="5" fill="{color}" />
      <text x="16" y="9" class="cat-name">{cat}</text>
      <text x="16" y="24" class="cat-count">{count} 本 <tspan class="cat-pct">({pct:.1f}%)</tspan></text>
    </g>""")

    bar_svg = "".join(bar_rects)
    cat_svg = "\n".join(cat_items)

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 {svg_height}" width="100%" height="100%">
  <style>
    .bg {{ fill: #0f172a; stroke: #334155; stroke-width: 1px; }}
    .card {{ fill: #1e293b; stroke: #334155; stroke-width: 1px; rx: 10px; }}
    .title {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; font-size: 16px; font-weight: 700; fill: #f8fafc; }}
    .subtitle {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 12px; fill: #64748b; }}
    .stat-label {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; font-size: 11px; fill: #94a3b8; }}
    .stat-value {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 22px; font-weight: 700; fill: #f8fafc; }}
    .stat-sub {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; font-size: 10px; fill: #64748b; }}
    .cat-name {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; font-size: 12px; font-weight: 600; fill: #cbd5e1; }}
    .cat-count {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11px; font-weight: 600; fill: #94a3b8; }}
    .cat-pct {{ fill: #64748b; font-weight: 400; font-size: 10px; }}
    @media (prefers-color-scheme: light) {{
      .bg {{ fill: #ffffff; stroke: #e2e8f0; }}
      .card {{ fill: #f8fafc; stroke: #e2e8f0; }}
      .title {{ fill: #0f172a; }}
      .stat-value {{ fill: #0f172a; }}
      .stat-label {{ fill: #475569; }}
      .cat-name {{ fill: #1e293b; }}
      .cat-count {{ fill: #475569; }}
    }}
  </style>

  <!-- Background -->
  <rect width="880" height="{svg_height}" rx="16" class="bg" />

  <!-- Header -->
  <g transform="translate(40, 36)">
    <text class="title">📚 云端开放书架 · 馆藏全景数据</text>
    <text x="800" y="0" text-anchor="end" class="subtitle">更新时间: {display_date}</text>
  </g>

  <!-- 4 Top Cards -->
  <!-- Card 1: Total Books -->
  <g transform="translate(40, 56)">
    <rect width="188" height="96" rx="8" class="card" />
    <text x="14" y="26" class="stat-label">全库资源文件</text>
    <text x="14" y="58" class="stat-value">{total_books}</text>
    <text x="14" y="80" class="stat-sub">{format_summary}</text>
  </g>

  <!-- Card 2: Unique Works -->
  <g transform="translate(244, 56)">
    <rect width="188" height="96" rx="8" class="card" />
    <text x="14" y="26" class="stat-label">聚合独立作品</text>
    <text x="14" y="58" class="stat-value">{unique_works} <tspan font-size="14" font-weight="400" fill="#94a3b8">部</tspan></text>
    <text x="14" y="80" class="stat-sub">跨格式聚合去重</text>
  </g>

  <!-- Card 3: Total Size -->
  <g transform="translate(448, 56)">
    <rect width="188" height="96" rx="8" class="card" />
    <text x="14" y="26" class="stat-label">藏书总容量</text>
    <text x="14" y="58" class="stat-value">{total_size_str}</text>
    <text x="14" y="80" class="stat-sub">纯净可缩放流式排版</text>
  </g>

  <!-- Card 4: Categories -->
  <g transform="translate(652, 56)">
    <rect width="188" height="96" rx="8" class="card" />
    <text x="14" y="26" class="stat-label">馆藏细分门类</text>
    <text x="14" y="58" class="stat-value">{num_cats} <tspan font-size="14" font-weight="400" fill="#94a3b8">大类</tspan></text>
    <text x="14" y="80" class="stat-sub">正史/文学/经管/科技/通俗</text>
  </g>

  <!-- Stacked Distribution Bar -->
  <g>
    {bar_svg}
  </g>

  <!-- Category Legend -->
  <g>
{cat_svg}
  </g>
</svg>
"""
    return svg


def sync_readme_content(content, catalog):
    """Synchronize badges, hero text, SVG embed, and category statistics table in README.md."""
    meta = catalog.get('meta', {})
    books = catalog.get('books', [])
    total_books = meta.get('totalBooks', len(books))
    unique_works = len(set(b.get('title', '') for b in books)) if books else total_books
    total_size_str = meta.get('totalSizeFormatted', '0 B')
    formats = meta.get('formats', {})
    mobi_cnt = formats.get('mobi', 0)
    epub_cnt = formats.get('epub', 0)
    txt_cnt = formats.get('txt', 0)
    categories = meta.get('categories', {})

    cat_formats_map = defaultdict(set)
    for b in books:
        cat_formats_map[b.get('category', '')].add(b.get('format', '').lower())

    # 1. Update shields badges
    content = re.sub(
        r'\[!\[Books\]\(https://img\.shields\.io/badge/全库资源-[^%-]+%20本-2563eb\?style=flat-square&logo=gitbook&logoColor=white\)\]',
        f'[![Books](https://img.shields.io/badge/全库资源-{total_books}%20本-2563eb?style=flat-square&logo=gitbook&logoColor=white)]',
        content
    )
    content = re.sub(
        r'\[!\[Works\]\(https://img\.shields\.io/badge/独立作品-[^%-]+%20部-059669\?style=flat-square&logo=bookmeter&logoColor=white\)\]',
        f'[![Works](https://img.shields.io/badge/独立作品-{unique_works}%20部-059669?style=flat-square&logo=bookmeter&logoColor=white)]',
        content
    )

    # 2. Update feature highlights list
    content = re.sub(
        r'-\s+\*\*\d+\s*本优质馆藏\*\*：',
        f'- **{total_books} 本优质馆藏**：',
        content
    )

    # 3. Ensure SVG dashboard card is embedded under distribution heading
    svg_embed = '<p align="center">\n  <img src="assets/images/library-stats.svg" alt="馆藏全景数据" width="100%">\n</p>'
    if 'assets/images/library-stats.svg' not in content:
        content = re.sub(
            r'(## 🗂 馆藏门类分布统计\s*\n+)',
            r'\1' + svg_embed + '\n\n',
            content
        )

    # 4. Update summary paragraph
    summary_pattern = r'全库现收录\s+\*\*\d+\s*个资源文件\*\*，聚合为\s+\*\*\d+\s*部独立作品\*\*（[^）]+），总数据体积约\s+\*\*[^*]+\*\*：'
    summary_replacement = f'全库现收录 **{total_books} 个资源文件**，聚合为 **{unique_works} 部独立作品**（MOBI: {mobi_cnt} 个, EPUB: {epub_cnt} 个, TXT: {txt_cnt} 个），总数据体积约 **{total_size_str}**：'
    content = re.sub(summary_pattern, summary_replacement, content)

    # 5. Update category table rows
    fmt_order = ['mobi', 'epub', 'txt']
    for cat, count in categories.items():
        cat_fmts = cat_formats_map.get(cat, set())
        ordered_fmts = [f.upper() for f in fmt_order if f in cat_fmts]
        for f in sorted(cat_fmts):
            if f.upper() not in ordered_fmts:
                ordered_fmts.append(f.upper())
        fmt_str = ' / '.join(ordered_fmts) if ordered_fmts else 'MOBI'

        pattern = rf'(\|\s*\*\*{re.escape(cat)}\*\*\s*\|\s*)\*\*\d+\s*本\*\*\s*\|\s*[^|]+\s*\|'
        if re.search(pattern, content):
            replacement = rf'\g<1>**{count} 本** | {fmt_str} |'
            content = re.sub(pattern, replacement, content)
        elif f'**{cat}**' not in content:
            # If category is brand new, append before the end of table separator
            new_row = f"| **{cat}** | **{count} 本** | {fmt_str} | 经典读物精选收录 |"
            content = re.sub(
                r'(\|\s*\*\*哲学宗教\*\*[^\n]+\n)',
                rf'\g<1>{new_row}\n',
                content
            )

    return content


def sync_index_html_content(content, catalog):
    """Synchronize meta description, nav badge, and hero stats in index.html."""
    meta = catalog.get('meta', {})
    books = catalog.get('books', [])
    total_books = meta.get('totalBooks', len(books))
    unique_works = len(set(b.get('title', '') for b in books)) if books else total_books
    total_size_str = meta.get('totalSizeFormatted', '0 B')
    cat_count = len(meta.get('categories', {}))

    # Meta description
    content = re.sub(
        r'(<meta\s+name="description"\s+content="[^"]*?)\d+\s*部作品[、,]\s*\d+\s*个电子书资源',
        rf'\g<1>{unique_works} 部作品、{total_books} 个电子书资源',
        content
    )
    # Nav badge
    content = re.sub(
        r'(id="nav-book-badge"[^>]*>)\s*\d+\s*部作品\s*(</span>)',
        rf'\g<1>{unique_works} 部作品\g<2>',
        content
    )
    # Hero stats
    content = re.sub(
        r'(id="stat-total-books"[^>]*>)\s*\d+\s*(</span>)',
        rf'\g<1>{unique_works}\g<2>',
        content
    )
    content = re.sub(
        r'(id="stat-total-categories"[^>]*>)\s*\d+\s*(</span>)',
        rf'\g<1>{cat_count}\g<2>',
        content
    )
    content = re.sub(
        r'(id="stat-total-size"[^>]*>)\s*[^<]+\s*(</span>)',
        rf'\g<1>{total_size_str}\g<2>',
        content
    )
    # Footer
    content = re.sub(
        r'全库共收录\s+\d+\s*个资源文件[，,]\s*聚合为\s+\d+\s*部作品',
        rf'全库共收录 {total_books} 个资源文件，聚合为 {unique_works} 部作品',
        content
    )
    return content


def scan_books(rebuild=False, check_only=False):
    existing_catalog = {} if rebuild else load_existing_catalog()
    books = []
    start_time = time.time()

    if not os.path.isdir(BOOKS_DIR):
        print(f"Error: Books directory not found at {BOOKS_DIR}")
        sys.exit(1)

    added_count = 0
    cached_count = 0

    for root, dirs, files in os.walk(BOOKS_DIR):
        dirs.sort()
        for filename in sorted(files):
            if filename.startswith('.'):
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue

            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, REPO_ROOT).replace('\\', '/')
            size_bytes = os.path.getsize(full_path)
            if size_bytes == 0:
                print(f"Skipping empty 0KB file: {rel_path}")
                continue
            book_id = hashlib.md5(rel_path.encode('utf-8')).hexdigest()[:10]

            # Path format: books/<category>/[<subCategory>/]<filename>
            rel_parts = Path(rel_path).parts
            category = rel_parts[1] if len(rel_parts) > 2 else '未分类'
            sub_category = rel_parts[2] if len(rel_parts) > 3 else ''

            # Check if we can reuse cached metadata
            existing = existing_catalog.get(rel_path)
            if existing and existing.get('size') == size_bytes and not rebuild:
                entry = dict(existing)
                entry['id'] = book_id
                entry['path'] = rel_path
                entry['category'] = category
                entry['subCategory'] = sub_category
                entry['size'] = size_bytes
                entry['sizeFormatted'] = format_size(size_bytes)
                books.append(entry)
                cached_count += 1
                continue

            added_count += 1
            filename_no_ext = os.path.splitext(filename)[0]
            parsed_meta = {}
            if ext == '.mobi':
                parsed_meta = parse_mobi(full_path)
            elif ext == '.epub':
                parsed_meta = parse_epub(full_path)
            elif ext == '.txt':
                parsed_meta = parse_txt(full_path)

            title, author = clean_title_and_author(filename_no_ext, category, sub_category, parsed_meta)
            description = parsed_meta.get('description', '')
            excerpt = parsed_meta.get('excerpt', '')
            if not description and excerpt:
                description = excerpt
            if not description:
                description = f"《{title}》是收录于{category}门类的经典读物，由 {author if author else '名家'} 所作，具有深厚的阅读与收藏价值。"

            tags = generate_tags(title, author, category, sub_category)

            books.append({
                'id': book_id,
                'title': title,
                'originalName': filename_no_ext,
                'author': author if author else '佚名',
                'category': category,
                'subCategory': sub_category,
                'format': ext.lstrip('.'),
                'size': size_bytes,
                'sizeFormatted': format_size(size_bytes),
                'path': rel_path,
                'description': description[:400],
                'excerpt': excerpt[:300] if excerpt else "",
                'tags': tags
            })

    books.sort(key=lambda b: (b['category'], b['subCategory'], b['title']))

    categories = {}
    formats = {}
    tags_count = {}
    total_size = sum(b['size'] for b in books)

    for b in books:
        cat = b['category']
        fmt = b['format']
        categories[cat] = categories.get(cat, 0) + 1
        formats[fmt] = formats.get(fmt, 0) + 1
        for t in b.get('tags', []):
            tags_count[t] = tags_count.get(t, 0) + 1

    top_tags = sorted(tags_count.items(), key=lambda x: x[1], reverse=True)[:30]

    catalog = {
        'meta': {
            'totalBooks': len(books),
            'totalSize': total_size,
            'totalSizeFormatted': format_size(total_size),
            'categories': categories,
            'formats': formats,
            'popularTags': [{'tag': t, 'count': c} for t, c in top_tags],
            'updatedAt': time.strftime('%Y-%m-%d %H:%M:%S')
        },
        'books': books
    }

    # 1. Compare books.json
    old_catalog = None
    try:
        with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
            old_catalog = json.load(f)
    except (OSError, json.JSONDecodeError):
        pass

    books_json_changed = True
    if old_catalog:
        old_comp = json.loads(json.dumps(old_catalog, ensure_ascii=False))
        new_comp = json.loads(json.dumps(catalog, ensure_ascii=False))
        old_comp.get('meta', {}).pop('updatedAt', None)
        new_comp.get('meta', {}).pop('updatedAt', None)
        if old_comp == new_comp:
            books_json_changed = False
            catalog['meta']['updatedAt'] = old_catalog.get('meta', {}).get('updatedAt', catalog['meta']['updatedAt'])

    # 2. Compare SVG stats card
    svg_changed = False
    existing_svg = ""
    existing_svg_date = None
    if os.path.exists(STATS_SVG_PATH):
        try:
            with open(STATS_SVG_PATH, 'r', encoding='utf-8') as f:
                existing_svg = f.read()
            date_match = re.search(r'更新时间:\s*(\d{4}-\d{2}-\d{2})', existing_svg)
            if date_match:
                existing_svg_date = date_match.group(1)
        except OSError:
            pass
    else:
        svg_changed = True

    expected_svg_date = existing_svg_date if (not books_json_changed and existing_svg_date) else time.strftime('%Y-%m-%d')
    expected_svg = generate_stats_svg_content(catalog, date_str=expected_svg_date)
    if existing_svg.strip() != expected_svg.strip():
        svg_changed = True

    # 3. Compare README.md
    readme_changed = False
    existing_readme = ""
    expected_readme = ""
    if os.path.exists(README_PATH):
        with open(README_PATH, 'r', encoding='utf-8') as f:
            existing_readme = f.read()
        expected_readme = sync_readme_content(existing_readme, catalog)
        if existing_readme != expected_readme:
            readme_changed = True
    else:
        readme_changed = True

    # 4. Compare index.html
    html_changed = False
    existing_html = ""
    expected_html = ""
    if os.path.exists(INDEX_HTML_PATH):
        with open(INDEX_HTML_PATH, 'r', encoding='utf-8') as f:
            existing_html = f.read()
        expected_html = sync_index_html_content(existing_html, catalog)
        if existing_html != expected_html:
            html_changed = True
    else:
        html_changed = True

    # Handle check mode
    if check_only:
        mismatches = []
        if books_json_changed:
            mismatches.append(f"{os.path.relpath(CATALOG_PATH, REPO_ROOT)} is out of date")
        if svg_changed:
            mismatches.append(f"{os.path.relpath(STATS_SVG_PATH, REPO_ROOT)} is out of date or missing")
        if readme_changed:
            mismatches.append(f"{os.path.relpath(README_PATH, REPO_ROOT)} is out of date")
        if html_changed:
            mismatches.append(f"{os.path.relpath(INDEX_HTML_PATH, REPO_ROOT)} is out of date")

        if mismatches:
            print("❌ The following artifacts are out of sync:")
            for m in mismatches:
                print(f"   - {m}")
            print("\n👉 Run 'python3 scripts/update_books.py' or 'make catalog' to synchronize all artifacts.")
            return False
        else:
            print("✅ All artifacts (books.json, library-stats.svg, README.md, index.html) are synchronized!")
            return True

    # Write Mode: Update all out-of-date artifacts
    if books_json_changed or not os.path.exists(CATALOG_PATH):
        temp_path = f"{CATALOG_PATH}.tmp"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(catalog, f, ensure_ascii=False, indent=2)
            f.write('\n')
        os.replace(temp_path, CATALOG_PATH)
        print(f"✨ Updated {os.path.relpath(CATALOG_PATH, REPO_ROOT)}")
    else:
        print(f"✅ {os.path.relpath(CATALOG_PATH, REPO_ROOT)} is already up to date")

    if svg_changed or not os.path.exists(STATS_SVG_PATH):
        os.makedirs(os.path.dirname(STATS_SVG_PATH), exist_ok=True)
        final_svg = generate_stats_svg_content(catalog, date_str=time.strftime('%Y-%m-%d'))
        with open(STATS_SVG_PATH, 'w', encoding='utf-8') as f:
            f.write(final_svg)
        print(f"🎨 Generated {os.path.relpath(STATS_SVG_PATH, REPO_ROOT)}")
    else:
        print(f"✅ {os.path.relpath(STATS_SVG_PATH, REPO_ROOT)} is already up to date")

    if readme_changed:
        with open(README_PATH, 'w', encoding='utf-8') as f:
            f.write(expected_readme)
        print(f"📝 Synchronized {os.path.relpath(README_PATH, REPO_ROOT)}")
    else:
        print(f"✅ {os.path.relpath(README_PATH, REPO_ROOT)} is already up to date")

    if html_changed:
        with open(INDEX_HTML_PATH, 'w', encoding='utf-8') as f:
            f.write(expected_html)
        print(f"🌐 Synchronized {os.path.relpath(INDEX_HTML_PATH, REPO_ROOT)}")
    else:
        print(f"✅ {os.path.relpath(INDEX_HTML_PATH, REPO_ROOT)} is already up to date")

    elapsed = time.time() - start_time
    print(f"\n🚀 Pipeline complete in {elapsed:.2f}s!")
    print(f"📚 Total books: {len(books)} (cached: {cached_count}, newly processed: {added_count})")
    print(f"📦 Total size: {format_size(total_size)}")
    print(f"📂 Categories: {len(categories)} categories")
    print(f"📄 Formats: {formats}")
    return True


if __name__ == '__main__':
    rebuild_flag = '--rebuild' in sys.argv
    check_flag = '--check' in sys.argv
    sys.exit(0 if scan_books(rebuild=rebuild_flag, check_only=check_flag) else 1)

