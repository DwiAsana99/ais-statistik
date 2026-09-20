# Integrasi login UVMS untuk modul `ais-statistik`

Dokumen ini ditujukan kepada pengembang `ais-statistik`. Aplikasi utama UVMS
menangani login, sesi, dan pemberian akses modul. `ais-statistik` perlu memeriksa
sesi serta hak akses tersebut sebelum menyajikan halaman maupun API statistik.
Kode contoh di bawah adalah panduan implementasi; guard ini belum terpasang di
repo `ais-statistik` saat dokumen ini dibuat.

## Kontrak aplikasi utama

1. Pengguna login di portal UVMS melalui `POST /api/v1/auth/login`. Browser
   menerima cookie `uvms_session` yang bersifat `HttpOnly` dan berlaku 24 jam.
2. Admin pusat menambahkan modul dengan **kode persis `statistik`**, URL
   `/statistik/`, dan memberi akses modul itu kepada perusahaan yang berhak.
   Admin pusat dapat mengakses modul aktif tanpa grant perusahaan.
3. Portal membuka URL modul dari katalog. Pembukaan tautan saja **belum**
   mengautentikasi atau melindungi aplikasi tujuan.
4. Backend statistik memanggil
   `GET /api/v1/auth/authorize/statistik` pada backend UVMS, dengan meneruskan
   cookie `uvms_session` dari permintaan pengguna. Endpoint ini memeriksa sesi,
   status akun, status modul, dan hak akses perusahaan setiap kali dipanggil.

Respons berhasil (`200`):

```json
{
  "user": {
    "id": 12,
    "company_id": 3,
    "company_name": "Contoh Perusahaan",
    "username": "contoh",
    "role": "company"
  }
}
```

Untuk admin pusat, `role` adalah `admin` dan `company_id` serta `company_name`
bernilai `null`. `401 {"error":"login required"}` berarti cookie tidak ada,
invalid, kedaluwarsa, atau akun sudah nonaktif. `403
{"error":"module access required"}` berarti sesi valid, tetapi modul tidak
aktif atau pengguna tidak memiliki akses. Respons `5xx`/kegagalan jaringan
harus menutup akses dan ditampilkan sebagai gangguan layanan.

`GET /api/v1/auth/me` hanya memeriksa login. Gunakan endpoint `authorize/statistik`
untuk memutuskan akses modul. Jangan menerima `company_id`, `role`, atau daftar
hak akses yang dikirim browser sebagai bukti otorisasi. Cookie ini adalah sesi
server UVMS, bukan JWT dan bukan token untuk disimpan di `localStorage`.

## Rekomendasi alamat dan proxy

Gunakan satu host HTTPS untuk portal dan statistik, misalnya:

| URL publik | Tujuan |
| --- | --- |
| `/` | Portal UVMS |
| `/api/v1/*` | Backend utama UVMS |
| `/statistik/*` | Frontend `ais-statistik` |
| `/statistik/api/*` | Backend FastAPI statistik, dengan prefix `/statistik` dihapus |

Cookie UVMS tidak menetapkan atribut `Domain` dan memakai `Path=/`. Karena itu,
host yang berbeda tidak otomatis berbagi sesi. Subpath pada host yang sama
memudahkan browser mengirim cookie ke frontend dan API statistik. Gunakan host
yang konsisten juga saat development (`localhost` dan `127.0.0.1` dianggap host
berbeda). Pada HTTPS, backend utama perlu menerbitkan cookie `Secure`; set
`WEB_COOKIE_SECURE=true` atau pastikan reverse proxy mengirim
`X-Forwarded-Proto: https`.

Backend statistik dapat memanggil backend UVMS lewat alamat internal, misalnya
`http://127.0.0.1:8081` bila keduanya berjalan pada host yang sama. Alamat
internal tersebut hanya dipakai server statistik dan tidak perlu dibuka ke
browser. Reverse proxy harus meneruskan header `Cookie` dan tidak boleh
men-cache respons otorisasi. Jika memakai HTTPS lintas origin untuk panggilan
browser, daftarkan origin frontend secara eksplisit pada `WEB_ALLOWED_ORIGINS`
di UVMS dan aktifkan pengiriman credential pada klien; deployment lintas host
memerlukan rancangan sesi tersendiri.

## Perubahan yang perlu dibuat di `ais-statistik`

### 1. Lindungi API FastAPI di server

Tambahkan dependensi untuk meminta keputusan UVMS dari backend statistik.
`httpx` perlu ditambahkan ke `backend/requirements.txt` bila belum ada.
Contoh inti:

```python
import httpx
from fastapi import HTTPException, Request

UVMS_INTERNAL_URL = "http://127.0.0.1:8081"  # pindahkan ke environment

async def require_statistik(request: Request) -> dict:
    session = request.cookies.get("uvms_session")
    if not session:
        raise HTTPException(status_code=401, detail="login required")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{UVMS_INTERNAL_URL}/api/v1/auth/authorize/statistik",
                cookies={"uvms_session": session},
            )
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="UVMS unavailable")

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="login required")
    if response.status_code == 403:
        raise HTTPException(status_code=403, detail="module access required")
    if response.status_code != 200:
        raise HTTPException(status_code=503, detail="authorization unavailable")
    return response.json()["user"]
```

Pasang dependensi itu pada seluruh router data di
`backend/app/api/router.py`, misalnya memakai `dependencies=[Depends(require_statistik)]`
pada `include_router`. Dengan begitu `/api/dashboard`, `/api/vessels`, laporan,
ekspor, dan endpoint data lain mengikuti pemeriksaan yang sama. Biarkan
`/api/health` publik bila dipakai health check. Aturan ini berlaku juga untuk
endpoint baru yang ditambahkan nanti.

Pemeriksaan dilakukan pada **setiap request API** agar logout, perubahan hak
akses, penonaktifan akun/modul, dan kedaluwarsa sesi segera berlaku. Jika suatu
saat hasilnya di-cache, batas waktu dan mekanisme pencabutan akses perlu
dirancang khusus. Untuk data yang dibatasi per perusahaan, gunakan
`company_id` dari respons UVMS di sisi server dan terapkan filter pada query;
pemeriksaan modul saja tidak membatasi baris data perusahaan.

### 2. Lindungi halaman frontend

Saat aplikasi statistik dibuka, frontend boleh memanggil
`/api/v1/auth/authorize/statistik` untuk menentukan tampilan awal. Pada `401`,
arahkan ke portal login, misalnya `/?next=/statistik/`. Portal saat ini
memproses `next` setelah login bila nilainya cocok dengan URL modul di katalog.
Pada `403`, tampilkan pesan tidak punya akses. Pastikan URL katalog dan nilai
`next` sama persis, termasuk trailing slash.

Gunakan `credentials: "include"` pada `fetch`, atau `withCredentials: true`
pada Axios, untuk request browser yang perlu membawa cookie. Saat ini
`frontend/src/api/client.ts` membuat Axios tanpa `withCredentials`; set opsi
itu jika frontend dan API berada pada origin berbeda. Pada origin yang sama,
cookie tetap terkirim secara default. Tidak perlu menampilkan form login kedua
di statistik.

Pemeriksaan frontend hanya mengatur tampilan. Backend tetap harus menolak
request langsung ke API tanpa sesi atau hak modul. Jika HTML/JS statistik juga
harus tertutup bagi pengguna anonim, reverse proxy perlu melakukan auth check
sebelum menyajikan aset statis; guard React sendiri tidak melindungi aset.

### 3. Sesuaikan path build dan routing

Frontend statistik saat ini menggunakan Vite, `BrowserRouter`, dan path `/`.
Untuk dipasang pada `/statistik/`, atur `base: "/statistik/"` di
`frontend/vite.config.ts`, `basename="/statistik"` pada `BrowserRouter`, dan
base URL API sesuai mapping proxy, misalnya `/statistik` bila panggilan Axios
memakai path `/api/...`. Pada Nginx/development proxy, hapus prefix
`/statistik` sebelum meneruskan request ke frontend atau FastAPI sesuai
konfigurasi layanan. Pastikan refresh langsung pada `/statistik/reports`
mengembalikan `index.html` statistik.

Saat development, Vite portal saat ini mem-proxy `/statistik` ke
`127.0.0.1:8082`. Server frontend statistik perlu berjalan di port 8082 atau
target proxy itu disesuaikan. Vite statistik saat ini memakai port 5173 dan
mem-proxy `/api` ke port 8001, sehingga kedua konfigurasi development harus
diselaraskan sebelum alur subpath dapat diuji.

## Uji penerimaan

1. Daftarkan modul `statistik` dan beri satu akun perusahaan aksesnya.
2. Login di portal, buka statistik, lalu akses satu API statistik. Keduanya
   harus berhasil dengan `user.company_id` yang sesuai.
3. Coba tanpa cookie: endpoint otorisasi UVMS dan API statistik harus `401`.
4. Cabut grant perusahaan atau nonaktifkan modul: keduanya harus `403` meski
   cookie masih ada.
5. Logout, nonaktifkan akun, atau biarkan sesi habis: akses berikutnya harus
   `401`.
6. Uji URL halaman statistik secara langsung dan setelah refresh. Uji juga
   panggilan langsung ke API, bukan hanya klik dari portal.

Dokumen ini menjelaskan kontrak yang tersedia pada kode saat ini. Integrasi
baru dianggap selesai setelah guard backend, routing/proxy, dan pengujian di
`ais-statistik` diterapkan oleh pemilik proyek tersebut.
