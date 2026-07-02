# Reliability Lab Reservation MVP

This repository is now organized for a fully hosted deployment:

- `docs/`: production static site for GitHub Pages
- `app/static/`: source copy of the frontend for local development
- `supabase/manual/`: SQL scripts to run manually in Supabase SQL Editor
- `app/server.py`: legacy local fallback and test harness
- `tests/`: regression checks for UI and local API behavior

## Recommended GitHub Pages setup

Use:

- Branch: `main`
- Folder: `/docs`

Then the public site URL will be the repository root path instead of `/app/static/`.

## Deploy flow

1. Push the repository to GitHub.
2. In GitHub repository settings, open `Pages`.
3. Set source to `Deploy from a branch`.
4. Choose `main` and `/docs`.
5. Save and wait for publish.

## Supabase setup

Run these scripts in Supabase SQL Editor before using the hosted site:

1. browser grants and RLS policies:
   - [supabase/manual/20260702_hosted_web_policies.sql](C:/Users/105221/Documents/Codex/2026-07-01/new-chat/work/SNR.github.io/supabase/manual/20260702_hosted_web_policies.sql)
2. optional sample equipment seed:
   - [supabase/manual/20260702_sample_equipment_seed.sql](C:/Users/105221/Documents/Codex/2026-07-01/new-chat/work/SNR.github.io/supabase/manual/20260702_sample_equipment_seed.sql)

## Entry points

- Hosted site entry: [docs/index.html](C:/Users/105221/Documents/Codex/2026-07-01/new-chat/work/SNR.github.io/docs/index.html)
- Source frontend entry: [app/static/index.html](C:/Users/105221/Documents/Codex/2026-07-01/new-chat/work/SNR.github.io/app/static/index.html)

## Browser configuration

On first load, enter:

- Supabase project URL
- Supabase anon key

The hosted frontend stores them in browser `localStorage` for reconnect on refresh.

## Local verification

```powershell
python -m unittest discover -s tests
python -m py_compile app/server.py tests/test_api.py tests/test_static_ui.py
node --check app/static/app.js
```
