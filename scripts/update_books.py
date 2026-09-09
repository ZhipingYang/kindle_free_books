#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
kindle_free_books: Automated Books Catalog Generator.
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
    m_dash = re.search(r'[\-—_]\s*([^\s\-—_()（）\[\]]+)$', name)
    if m_dash:
        cand = m_dash.group(1).strip()
        if 1 < len(cand) <= 8 and not cand.isdigit() and not any(w in cand for w in ['全集', '完整', '精校', '上卷', '下卷', '册', '版']):
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

    old_catalog = None
    try:
        with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
            old_catalog = json.load(f)
    except (OSError, json.JSONDecodeError):
        pass

    if old_catalog:
        old_comparable = json.loads(json.dumps(old_catalog, ensure_ascii=False))
        new_comparable = json.loads(json.dumps(catalog, ensure_ascii=False))
        old_comparable.get('meta', {}).pop('updatedAt', None)
        new_comparable.get('meta', {}).pop('updatedAt', None)
        if old_comparable == new_comparable:
            print(f"✅ Catalog is already up to date: {CATALOG_PATH}")
            return True

    if check_only:
        print("❌ books.json is out of date. Run: python3 scripts/update_books.py")
        return False

    temp_path = f"{CATALOG_PATH}.tmp"
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(temp_path, CATALOG_PATH)

    elapsed = time.time() - start_time
    print(f"✨ Successfully generated {CATALOG_PATH}")
    print(f"📚 Total books: {len(books)} (cached: {cached_count}, newly processed: {added_count})")
    print(f"📦 Total size: {format_size(total_size)}")
    print(f"⏱️ Finished in {elapsed:.2f}s")
    print(f"📂 Categories: {categories}")
    print(f"📄 Formats: {formats}")
    return True

if __name__ == '__main__':
    rebuild_flag = '--rebuild' in sys.argv
    check_flag = '--check' in sys.argv
    sys.exit(0 if scan_books(rebuild=rebuild_flag, check_only=check_flag) else 1)
