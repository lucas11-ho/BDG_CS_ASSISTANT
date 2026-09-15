from pathlib import Path

path = Path('backend-api/src/server.js')
text = path.read_text()
old = "path.startsWith('/admin/content-bulk/') && method !== 'OPTIONS'"
new = "path.startsWith('/admin/content-bulk/') && request.method.toUpperCase() !== 'OPTIONS'"
if old not in text:
    raise SystemExit('legacy bulk-content dispatch anchor not found')
path.write_text(text.replace(old, new, 1))
