$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot\..

python -m unittest discover -s tests
python -m py_compile app/server.py tests/test_api.py tests/test_static_ui.py
node --check app.js
