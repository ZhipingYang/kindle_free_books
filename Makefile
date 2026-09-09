.PHONY: catalog rebuild check serve

catalog:
	python3 scripts/update_books.py

rebuild:
	python3 scripts/update_books.py --rebuild

check:
	python3 scripts/update_books.py --check
	python3 scripts/audit_library.py --max-file-mb 50

serve:
	python3 -m http.server 8000
