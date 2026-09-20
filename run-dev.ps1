# Jalankan backend (FastAPI) dan frontend (Vite) tanpa Docker.
# Database PostgreSQL dan Redis tetap dipakai dari server eksternal (lihat backend/.env).

$root = $PSScriptRoot

Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "cd '$root\backend'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload"
)

Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "cd '$root\frontend'; npm run dev"
)

Write-Host "Backend  -> http://localhost:8001 (docs: /docs)"
Write-Host "Frontend -> http://localhost:5173"
