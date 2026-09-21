"""Guard integrasi login UVMS — README-INTEGRASI-AIS-STATISTIK.md.

Backend statistik TIDAK menangani login sendiri. Setiap request API (kecuali
/api/health) harus punya cookie sesi UVMS yang valid DAN hak akses modul
`statistik`, diverifikasi ulang ke backend UVMS pada SETIAP request (bukan
cache) — supaya logout/pencabutan akses/penonaktifan akun langsung berlaku.

Fail-closed: UVMS tidak terjangkau, timeout, response tidak terduga, atau
UVMS_INTERNAL_URL belum dikonfigurasi -> 503, BUKAN diloloskan sebagai akses
sah. Cookie sesi tidak pernah dicatat ke log (nilai token, bukan cuma nama
variabelnya, sengaja tidak pernah di-print/log di modul ini).

Status implementasi (lihat README-INTEGRASI-AIS-STATISTIK.md): backend UVMS
belum berjalan saat modul ini ditulis, jadi jalur sukses (200 dari UVMS) belum
bisa diuji end-to-end. Jalur gagal sudah bisa: tanpa cookie -> 401 tanpa
memanggil UVMS sama sekali; UVMS unreachable -> 503 (bisa diuji nyata karena
UVMS_INTERNAL_URL memang belum ada yang listen).

Catatan lingkup: dokumen menyebut filter data per-`company_id` di sisi query
untuk data yang dibatasi per perusahaan. Skema database modul ini (ais_position,
ais_vessel_static, dst.) adalah data surveillance nasional, tidak punya kolom
company_id — jadi tidak ada baris data yang perlu difilter per perusahaan di
sini. Guard ini hanya menjaga syarat "modul aktif + user berhak", bukan
row-level filtering (yang memang tidak berlaku untuk data ini).

Dev bypass: UVMS_AUTH_ENABLED=false (env, default) melewati verifikasi
sepenuhnya — dipakai supaya app masih bisa dites/didemokan lokal selagi UVMS
belum berjalan. Tiap request yang lewat jalur ini dicatat sbg WARNING (bukan
diam-diam) precisely supaya tidak luput kalau tanpa sengaja aktif di tempat
yang seharusnya production. HARUS true di production.

Nama env var disamakan dengan projek UVMS lain (ais-cri, ais-kpler, dst):
UVMS_AUTH_ENABLED, UVMS_INTERNAL_URL, UVMS_SESSION_COOKIE_NAME,
UVMS_AUTHORIZE_TIMEOUT_SEC.
"""
import logging

import httpx
from fastapi import HTTPException, Request
from pydantic import BaseModel

from app.config import get_settings

logger = logging.getLogger("uvms_auth")


class UvmsUser(BaseModel):
    id: int
    company_id: int | None = None
    company_name: str | None = None
    username: str
    role: str


DEV_BYPASS_USER = UvmsUser(id=0, company_id=None, company_name=None, username="dev-bypass", role="admin")


async def require_statistik(request: Request) -> UvmsUser:
    settings = get_settings()

    if not settings.uvms_auth_enabled:
        # Sengaja WARNING (bukan debug/info) tiap request, bukan sekali saat startup —
        # supaya tidak mungkin luput dilihat di log kalau ini tanpa sengaja aktif di
        # lingkungan yang seharusnya production.
        logger.warning(
            "UVMS_GUARD DIMATIKAN (UVMS_AUTH_ENABLED=false) — %s %s diloloskan tanpa "
            "verifikasi sesi/otorisasi. HANYA untuk dev lokal, JANGAN aktif di production.",
            request.method, request.url.path,
        )
        return DEV_BYPASS_USER

    session = request.cookies.get(settings.uvms_session_cookie_name)
    if not session:
        raise HTTPException(status_code=401, detail="login required")

    if not settings.uvms_internal_url:
        logger.error("UVMS_INTERNAL_URL belum dikonfigurasi — menolak akses (fail-closed)")
        raise HTTPException(status_code=503, detail="authorization unavailable")

    url = f"{settings.uvms_internal_url}/api/v1/auth/authorize/{settings.uvms_module_code}"
    try:
        async with httpx.AsyncClient(timeout=settings.uvms_authorize_timeout_sec) as client:
            response = await client.get(url, cookies={settings.uvms_session_cookie_name: session})
    except httpx.RequestError:
        logger.warning("UVMS tidak terjangkau saat verifikasi otorisasi (%s)", url)
        raise HTTPException(status_code=503, detail="UVMS unavailable")

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="login required")
    if response.status_code == 403:
        raise HTTPException(status_code=403, detail="module access required")
    if response.status_code != 200:
        logger.warning("Respons UVMS tak terduga: HTTP %s dari %s", response.status_code, url)
        raise HTTPException(status_code=503, detail="authorization unavailable")

    try:
        payload = response.json()
        return UvmsUser(**payload["user"])
    except (KeyError, ValueError, TypeError):
        logger.error("Bentuk respons UVMS tidak sesuai kontrak yang diharapkan")
        raise HTTPException(status_code=503, detail="authorization unavailable")
