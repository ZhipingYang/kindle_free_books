#!/usr/bin/env python3
"""Read-only health checks for the ebook library and generated catalog."""

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS_DIR = ROOT / "books"
CATALOG_PATH = ROOT / "books.json"
SUPPORTED = {".epub", ".mobi", ".txt"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-file-mb",
        type=float,
        default=50,
        help="fail when a book exceeds this size (default: 50 MB)",
    )
    parser.add_argument(
        "--skip-hashes",
        action="store_true",
        help="skip content duplicate detection for a faster check",
    )
    args = parser.parse_args()

    files = sorted(
        path for path in BOOKS_DIR.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED
    )
    max_bytes = int(args.max_file_mb * 1024 * 1024)
    oversized = [path for path in files if path.stat().st_size > max_bytes]

    with CATALOG_PATH.open(encoding="utf-8") as stream:
        catalog = json.load(stream)
    catalog_books = catalog.get("books", [])
    catalog_paths = {item["path"] for item in catalog_books}
    disk_paths = {path.relative_to(ROOT).as_posix() for path in files}
    missing_from_catalog = sorted(disk_paths - catalog_paths)
    missing_from_disk = sorted(catalog_paths - disk_paths)
    duplicate_catalog_paths = sorted(
        path for path, count in Counter(item["path"] for item in catalog_books).items()
        if count > 1
    )
    invalid_entries = []
    for item in catalog_books:
        path = ROOT / item["path"]
        expected_id = hashlib.md5(item["path"].encode("utf-8")).hexdigest()[:10]
        if path.is_file() and item.get("size") != path.stat().st_size:
            invalid_entries.append(f"size mismatch: {item['path']}")
        if item.get("id") != expected_id:
            invalid_entries.append(f"id mismatch: {item['path']}")

    expected_categories = Counter(item.get("category", "未分类") for item in catalog_books)
    expected_formats = Counter(item.get("format", "") for item in catalog_books)
    expected_total_size = sum(path.stat().st_size for path in files)
    meta = catalog.get("meta", {})
    if meta.get("totalBooks") != len(catalog_books):
        invalid_entries.append("meta.totalBooks mismatch")
    if meta.get("totalSize") != expected_total_size:
        invalid_entries.append("meta.totalSize mismatch")
    if meta.get("categories") != dict(expected_categories):
        invalid_entries.append("meta.categories mismatch")
    if meta.get("formats") != dict(expected_formats):
        invalid_entries.append("meta.formats mismatch")

    duplicates = []
    if not args.skip_hashes:
        by_size = defaultdict(list)
        for path in files:
            by_size[path.stat().st_size].append(path)
        for candidates in by_size.values():
            if len(candidates) < 2:
                continue
            by_hash = defaultdict(list)
            for path in candidates:
                by_hash[sha256(path)].append(path)
            duplicates.extend(group for group in by_hash.values() if len(group) > 1)

    total_bytes = sum(path.stat().st_size for path in files)
    print(f"files: {len(files)}")
    print(f"size: {total_bytes / 1024 / 1024 / 1024:.2f} GiB")
    print(f"catalog entries: {len(catalog_books)}")
    duplicate_summary = "skipped" if args.skip_hashes else str(len(duplicates))
    print(f"exact duplicate groups: {duplicate_summary}")

    for group in duplicates:
        print("duplicate:")
        for path in group:
            print(f"  - {path.relative_to(ROOT)}")
    for path in oversized:
        print(f"oversized: {path.relative_to(ROOT)} ({path.stat().st_size / 1024 / 1024:.1f} MB)")
    for path in missing_from_catalog:
        print(f"not in catalog: {path}")
    for path in missing_from_disk:
        print(f"missing on disk: {path}")
    for path in duplicate_catalog_paths:
        print(f"duplicate catalog path: {path}")
    for issue in invalid_entries:
        print(f"invalid catalog entry: {issue}")

    return 1 if any((
        duplicates,
        oversized,
        missing_from_catalog,
        missing_from_disk,
        duplicate_catalog_paths,
        invalid_entries,
    )) else 0


if __name__ == "__main__":
    sys.exit(main())
