$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot\..

python -m unittest discover -s tests
python -m py_compile app/server.py scripts/sync_supabase_to_sqlite.py tests/test_api.py tests/test_static_ui.py tests/test_transfer_package.py tests/test_sync_supabase.py
node --check app.js
npm run test:e2e
