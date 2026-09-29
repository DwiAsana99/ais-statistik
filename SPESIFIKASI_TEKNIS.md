# Spesifikasi Teknis Aplikasi — UVMS Modul Statistik AIS

> Dokumen ini merangkum arsitektur sistem, tech stack, skema data, dan metode/algoritma yang diimplementasikan pada aplikasi **UVMS Modul Statistik AIS**, sebagai bahan bagian metodologi/implementasi laporan penelitian. Disusun dari pembacaan langsung kode sumber di `backend/` dan `frontend/`, serta dokumen pendukung (`development-plan.md`, `CHANGELOG.md`, `ANOMALY_ALGORITHM.md`, `loitering.md`) per 2026-09-29.

---

## 1. Ringkasan Aplikasi

UVMS Modul Statistik AIS adalah aplikasi web full-stack untuk analisis statistik dan deteksi perilaku anomali dari data **AIS (Automatic Identification System)** kapal laut. Aplikasi ini merupakan pembangunan ulang (*rebuild*) dari dashboard HTML monolitik lama (`UVMS Dashboard (Standalone).html`, masih disimpan sebagai referensi di root repo) menjadi aplikasi modern berbasis **React + FastAPI**, sekaligus menambahkan modul analitis baru yang tidak ada di versi lama: deteksi *loitering*, deteksi *encounter* (pertemuan kapal), dan deteksi anomali data/kinematik berbasis literatur riset maritime surveillance.

Aplikasi dirancang sebagai **modul** (`statistik`) yang dipasang di dalam portal UVMS (Unit Vessel Monitoring System) yang lebih besar — bukan produk berdiri sendiri. Autentikasi, base path (`/statistik`), dan konvensi port mengikuti kontrak integrasi dengan portal induk tersebut (lihat §6).

Sumber data adalah basis data PostgreSQL **eksternal dan read-only** (`dbais`) berisi data AIS mentah berskala besar (puluhan juta baris posisi kapal), sehingga sebagian besar upaya rekayasa difokuskan pada strategi *caching* dan *precomputation* agar kueri tetap responsif.

---

## 2. Arsitektur Sistem

```
┌──────────────────┐        ┌───────────────────────┐        ┌──────────────────────┐
│   React SPA       │──REST─▶│   FastAPI Backend      │──SQL──▶│  PostgreSQL + PostGIS │
│  (Vite + TS,       │◀──────│   (Python 3.12)         │◀───────│  "dbais" — READ ONLY  │
│  base /statistik)   │        │                         │        │  (server eksternal)   │
└──────────────────┘        │  ┌───────────────────┐  │        └──────────────────────┘
                             │  │ Redis cache layer   │  │
                             │  └───────────────────┘  │
                             │  ┌───────────────────┐  │        ┌──────────────────────┐
                             │  │ asyncio worker      │──write─▶│ anomaly_events (satu   │
                             │  │ (precompute loop)   │  │        │ tabel app-owned)       │
                             │  └───────────────────┘  │        └──────────────────────┘
                             │  ┌───────────────────┐  │
                             │  │ auth guard          │──HTTP──▶  UVMS Portal (SSO,
                             │  │ (require_statistik) │           validasi sesi per-request)
                             │  └───────────────────┘  │
                             └───────────────────────┘
```

**Alur data baca:** Frontend meminta endpoint REST → FastAPI mengecek Redis → *cache hit* → kembalikan JSON; *cache miss* → jalankan kueri SQL ke PostgreSQL → simpan hasil ke Redis (TTL sesuai jenis data) → kembalikan JSON. Karena tabel utama (`ais_position`) berukuran puluhan juta baris tanpa partisi, worker latar belakang secara proaktif me-*refresh* cache setiap beberapa menit sehingga permintaan pengguna hampir selalu berupa *cache hit*.

**Alur autentikasi:** Setiap permintaan API (kecuali `/api/health`) divalidasi ulang terhadap portal UVMS pusat melalui cookie sesi — tidak ada sesi lokal, dan desainnya *fail-closed* (lihat §6).

---

## 3. Tech Stack

### 3.1 Backend (`backend/`)

| Komponen | Teknologi | Versi | Keterangan |
|---|---|---|---|
| Bahasa/runtime | Python | 3.12 | image Docker `python:3.12-slim` |
| Framework web | FastAPI | 0.115.6 | REST API, async |
| ASGI server | Uvicorn (`[standard]`) | 0.34.0 | dijalankan dengan `--reload` di dev/docker |
| Driver DB async | asyncpg | 0.30.0 | koneksi utama aplikasi |
| Driver DB sync | psycopg2-binary | 2.9.10 | cadangan untuk tooling |
| ORM | SQLAlchemy (`[asyncio]`) | 2.0.36 | model untuk join sederhana; kueri agregasi berat memakai SQL mentah (`text()`) dengan CTE/window function |
| Ekstensi spasial | GeoAlchemy2 | 0.17.1 | kolom geometry PostGIS (`ST_Distance`, `ST_DWithin`, dst.) |
| Cache | redis (`[hiredis]`) | 5.2.1 | client Redis async |
| Validasi/konfigurasi | Pydantic + pydantic-settings | 2.10.3 / 2.7.0 | schema request/response & `Settings` dari env |
| Serialisasi | orjson | 3.10.12 | response JSON cepat, payload cache |
| HTTP client | httpx | 0.28.1 | memanggil endpoint otorisasi UVMS |
| Ekspor laporan | reportlab, openpyxl | 4.2.5 / 3.1.5 | PDF & Excel |
| Numerik | numpy | 2.2.1 | perhitungan haversine vektorisasi (fitur loitering) |

### 3.2 Frontend (`frontend/`)

| Komponen | Teknologi | Versi | Keterangan |
|---|---|---|---|
| Framework UI | React | 19.2.7 | dengan TypeScript 6.0.2 |
| Build tool | Vite | 8.1.0 | `base: "/statistik/"`, proxy dev `/api → :8001` |
| Routing | React Router DOM | 7.18.0 | `BrowserRouter basename="/statistik"`, 15 route, lazy-loaded (`React.lazy`/`Suspense`) |
| State management | Zustand | 5.0.14 | filter global & tema (persist ke localStorage) |
| HTTP client | Axios | 1.18.1 | instance tunggal + interceptor 401/403/503 |
| Styling/UI | Tailwind CSS v4 + DaisyUI | 4.3.3 / 5.7.42 | tema kustom "maritime" (light/dark), migrasi dari Material UI |
| Ikon | lucide-react | 1.47.0 | pengganti MUI Icons |
| Peta | Leaflet + react-leaflet | 1.9.4 / 5.0.0 | 3 basemap (CartoDB Dark, OSM, Esri Satelit) |
| Chart | Recharts | 3.9.0 | palet warna divalidasi untuk aksesibilitas (colorblind-safe) |
| Tanggal | dayjs | 1.11.21 | — |
| Unduh file | file-saver | 2.0.5 | ekspor CSV/Excel/PDF |
| Linter | oxlint | 1.69.0 | pengganti ESLint |

> **Catatan metodologis:** Rencana awal proyek (`development-plan.md`) mencantumkan MUI/Ant Design sebagai UI framework. Selama pengembangan, seluruh UI dimigrasi ke Tailwind CSS v4 + DaisyUI dengan palet warna kustom (`#003B5C` navy, `#0C7B93` teal, `#94D2BD` seafoam, `#EE9B00` amber, `#F6F8FF` mist), termasuk validasi formal palet chart untuk kontras dan defisiensi penglihatan warna (CVD).

### 3.3 Basis Data & Infrastruktur

| Komponen | Detail |
|---|---|
| DBMS | PostgreSQL + ekstensi **PostGIS** |
| Akses | **Read-only** terhadap seluruh tabel AIS mentah (hanya `SELECT`); satu tabel app-owned (`anomaly_events`) memiliki hak `INSERT`/`UPDATE` |
| Skala data | `ais_position` ≈ 41 juta baris (terus bertambah, awal estimasi 26,4 juta/6,7 GB), `ais_raw_message` ≈ 27,5 juta baris, `ais_vessel_static` ≈ 3.256 kapal, **tanpa partisi tabel** |
| Cache | Redis 7 (server eksternal) |
| Kontainerisasi | Docker multi-stage: backend (`python:3.12-slim`), frontend (`node:22-alpine` build → `nginx:alpine` serve) |
| Reverse proxy | Nginx — serve SPA di `/statistik/`, proksi `/statistik/api/ → backend:8001/api/` |
| Dev tanpa Docker | `run-dev.ps1` menjalankan `uvicorn --reload` (:8001) dan `npm run dev` (Vite, :5173) langsung di host Windows |

---

## 4. Skema Basis Data (Ringkasan)

Basis data `dbais` sudah ada sebelumnya dan tidak dimodifikasi strukturnya oleh aplikasi ini (kecuali penambahan satu tabel baru, lihat §4.2).

### 4.1 Tabel AIS Mentah (Read-Only)

| Tabel | Skala | Deskripsi |
|---|---|---|
| `ais_position` | ~41 juta baris | Posisi kapal per laporan: `lat, lon, sog_knots, cog_deg, heading_deg, rot_deg_per_min, nav_status_code, geom (PostGIS)` |
| `ais_raw_message` | ~27,5 juta baris | Pesan NMEA mentah |
| `ais_vessel_static` | ~3.256 kapal | Data statis kapal: IMO, call sign, nama, tipe, dimensi, tujuan, ETA |
| `vessel_states` | ~3.600–5.000 kapal | Posisi & status terakhir per kapal (near real-time) |
| `ais_errors` | 287 ribu+ baris | Log error parsing AIS (kategori disimpulkan dari teks `error_message`, tidak ada kolom `error_type`) |
| `ais_base_station`, `ais_aton`, `ais_station` | kecil | Stasiun siaran AIS pihak lain, Aids-to-Navigation, referensi stasiun |
| `ais_ship_type`, `ais_nav_status`, `ais_msg_type` | referensi | Tabel lookup kode → nama |

**Catatan audit penting:** stasiun penerima UVMS yang sebenarnya digunakan hanya **2** (`turyapada`, `unud`), diidentifikasi dari kolom teks `vessel_states.last_station_id` — bukan dari tabel `ais_base_station` seperti asumsi awal (tabel tersebut ternyata berisi siaran base station dari kapal/pemancar lain, bukan daftar stasiun penerima milik sistem).

### 4.2 Tabel Milik Aplikasi

| Tabel | Fungsi |
|---|---|
| `anomaly_events` | Satu tabel untuk seluruh hasil deteksi (anomali A1–A4 dan loitering/A5), *natural key* `(mmsi, type, detector, t_start)` untuk *upsert*, kolom `evidence JSONB`, `status` (mis. `candidate`), indeks spasial GIST dan indeks pada `t_start`/`mmsi`/`type`/`severity`. Hak akses `INSERT/UPDATE` role aplikasi **dibatasi khusus tabel ini**. |

### 4.3 Data Pendukung

| File | Isi |
|---|---|
| `data/ports.csv` | World Port Index (NGA Pub 150, edisi 2019), 3.630 pelabuhan — dipakai fitur "jarak ke pelabuhan terdekat" pada deteksi loitering |
| `frontend/public/geojson/wpp.geojson` | Batas WPP (Wilayah Pengelolaan Perikanan) |
| `frontend/public/geojson/alki.geojson` | Alur Laut Kepulauan Indonesia (ALKI) |

---

## 5. Cakupan Fungsional & API

Backend mengekspos ±40 endpoint REST di bawah prefix `/api`, dikelompokkan per domain. Seluruh endpoint (kecuali `/api/health`) dilindungi *auth guard* (§6).

| Domain | Contoh Endpoint | Fungsi |
|---|---|---|
| Dashboard | `GET /api/dashboard/overview` | KPI ringkasan (total kapal, status navigasi, pesan hari ini, stasiun online, error rate) |
| Kapal | `GET /api/vessels`, `/api/vessels/{mmsi}/track` | Daftar kapal (cari/urut/paginasi), riwayat trek posisi (maks 48 jam, downsample ≤2000 titik) |
| Statistik | `GET /api/statistics/by-ship-type`, `/by-size`, `/by-flag` | Distribusi tipe, ukuran, bendera kapal |
| Trafik | `GET /api/traffic/trend`, `/hourly`, `/heatmap`, `/sog-distribution` | Tren trafik harian/jam, distribusi kecepatan |
| Peta | `GET /api/maps/vessels`, `/heatmap`, `/base-stations`, `/aton` | GeoJSON untuk visualisasi peta |
| Pertemuan Kapal | `GET /api/encounters` | Deteksi *encounter* berbasis kedekatan jarak/waktu |
| Perilaku (Loitering) | `GET /api/behavior/loitering` | Deteksi loitering (§7.1) |
| Deteksi Anomali | `GET /api/anomaly/a0-summary`, `/summary`, `/events` | Hasil deteksi anomali A0–A4 (§7.2) |
| Statistik Pesan | `GET /api/messages/summary`, `/by-type` | Volume & tipe pesan AIS |
| Performa Stasiun | `GET /api/stations/performance`, `/status` | Status online/degraded/offline 2 stasiun penerima |
| Kualitas Data | `GET /api/quality/summary`, `/by-type` | Tingkat error parsing, kategori error |
| Laporan | `GET /api/reports/export`, `/monthly` | Ekspor CSV/Excel/PDF, ringkasan bulanan |
| Pencarian | `GET /api/search` | Pencarian cepat kapal (nama/MMSI/call sign) |

Frontend memetakan setiap domain ke halaman React tersendiri (15 route: Dashboard, Statistik Kapal, Trafik, Peta, Track Kapal, Pertemuan Kapal, Loitering, Anomali Kinematik, Deteksi Anomali, Statistik Pesan, Performa Stasiun, Kualitas Data, Laporan Bulanan, Ekspor Laporan).

---

## 6. Strategi Performa & Caching

Karena `ais_position` berskala puluhan juta baris tanpa partisi, kueri agregasi langsung terlalu lambat untuk permintaan real-time. Strategi yang diterapkan:

1. **Caching Redis** — hampir seluruh endpoint baca melalui cache-aside dengan TTL bervariasi (2 menit untuk posisi peta hingga 1 jam untuk statistik distribusi kapal).
2. **Worker precompute in-process** (`asyncio` task dalam siklus hidup FastAPI, bukan Celery/RQ terpisah) — dua tingkat tugas:
   - *Fast tasks* (~tiap 4 menit): dashboard, trafik, peta, pesan, stasiun, kualitas data.
   - *Slow tasks* (~tiap 24 menit): statistik berat, KPI trafik (median SOG dari puluhan juta baris), laporan bulanan, **deteksi loitering**, **deteksi anomali** — worker inilah yang menulis hasil deteksi ke tabel `anomaly_events`.
3. **Query berjendela terbatas** — endpoint trek kapal dan *encounter* dibatasi jendela waktu (maks 48 jam / 24 jam) untuk menghindari *full table scan*.
4. Query berat memakai SQL mentah dengan *window function* (CTE) alih-alih ORM, agar rencana eksekusi dapat dikendalikan langsung.

---

## 7. Metode Analitis (Algoritma Deteksi)

Bagian ini menjadi inti metodologi untuk laporan penelitian: tiga modul analitis diimplementasikan berdasarkan studi literatur maritime surveillance, dengan ambang batas dikalibrasi ulang terhadap karakteristik data live.

### 7.1 Deteksi Loitering (Modul A5)

**Sumber:** Setiawan dkk., *Detecting Potential Vessel Loitering Behavior from Ship Trajectories Using a Hybrid Rule-Based and Neural Network Approach*, ICEREAM 2025 (disebut **P1** dalam dokumentasi internal `loitering.md`), dengan aturan *preprocessing* tambahan dari Setiawan dkk., *Ship Trajectory Prediction Based on Spatial-temporal Data Using LSTM*, JOIV 9(3) 2025 (**P2**).

**Definisi:** kapal yang bergerak sangat lambat/berhenti/berputar dalam durasi tidak wajar, jauh dari pelabuhan — indikasi potensial *illegal fishing*, *smuggling*, atau *transshipment*.

**Pipeline (diadaptasi dari Parquet/Dask di paper asli menjadi SQL window function murni terhadap PostgreSQL, karena skala data ~41 juta baris jauh lebih kecil dari target paper ~230 juta baris):**

1. **Cleansing titik** — buang lat/lon/SOG/COG tidak valid.
2. **Ekstraksi trajektori** — pisahkan trek per MMSI bila jeda waktu antar titik > 4 jam (`LAG()` + `SUM() OVER` berjendela, dipisah ke CTE karena PostgreSQL tidak mengizinkan *nested window function*).
3. **Cleaning trajektori** — minimal 10 titik; buang trajektori "*stationary-like*" (varians SOG/COG mendekati nol dianggap noise, bukan sinyal).
4. **Ekstraksi fitur** (dua tahap untuk efisiensi):
   - Tahap 1 (murah, di SQL): rata-rata SOG dan durasi trajektori — memfilter kandidat secara agresif sebelum tahap mahal.
   - Tahap 2 (hanya untuk kandidat lolos tahap 1): jarak rata-rata ke pelabuhan terdekat, dihitung dengan haversine vektorisasi NumPy terhadap 3.630 pelabuhan (World Port Index), diproses per-batch (4.000 titik/batch) untuk menghindari kebutuhan memori berlebih pada trajektori dengan puluhan ribu titik.
5. **Aturan label loitering:** `rata-rata SOG < 2 knot` **DAN** `durasi > 2 jam` **DAN** `jarak rata-rata ke pelabuhan terdekat > 37,04 km (20 mil laut)`.

**Validasi:** diuji langsung terhadap data live (window 7 hari) — 40 event loitering terdeteksi, termasuk satu kapal diam ~127 jam (5,3 hari) pada jarak 103,6 km dari pelabuhan terdekat, konsisten dengan pola yang secara kualitatif masuk akal (bukan aktivitas berlabuh normal).

**Keterbatasan yang didokumentasikan:** pilihan logika penggabungan filter "stationary-like" (`AND` vs `OR`) berpotensi menghilangkan kapal yang bergerak sangat lambat dengan *heading* nyaris konstan — belum diputuskan/divalidasi lebih lanjut oleh pengguna sistem.

### 7.2 Deteksi Anomali Data & Kinematik (Modul A0–A4)

**Sumber:** kompilasi ~18 sumber literatur (ditandai `[S1]`–`[S18]` di `ANOMALY_ALGORITHM.md`), mengikuti taksonomi anomali maritim dari Riveiro dkk. (via review Ribeiro 2023) — anomali *positional*, *contextual*, *kinematic*, *complex*, *data-related* — dan klasifikasi Chandola dkk. (*point*, *contextual*, *collective*).

**Arsitektur berlapis:**
```
AIS mentah → cleansing → raw_flagged (titik "aneh" TIDAK dibuang — justru sinyal)
                │
        ┌───────┴────────┐
        ▼                ▼
  LAPISAN A (aturan,       LAPISAN B (statistik/unsupervised,
  interpretable)            belum diimplementasi — Isolation Forest,
  A0–A8                     a contrario per grid-sel, dsb.)
```

Setiap ambang batas ditandai eksplisit di dokumen spesifikasi dengan tag asal: `[S#]` (dari sumber literatur), `[ADAPT]` (usulan penulis, bukan dari paper), atau `[PARAM]` (wajib dikalibrasi dari data). Seluruh output detektor berstatus **`candidate`** — bukan bukti pelanggaran — disertai kolom `evidence` untuk keterlacakan.

**Modul yang telah diimplementasikan (A0–A4 dari total rencana A0–A8 + B1–B3):**

| Modul | Nama | Metode |
|---|---|---|
| **A0** | Kualitas & identitas data | Deteksi MMSI tidak valid/placeholder (`000000`/`999999`), nilai sentinel SOG (102,3 kn)/COG (360°) "tidak tersedia", lat/lon di luar rentang — ringkasan on-demand, tidak disimpan permanen |
| **A1** | Lompatan posisi & mismatch SOG | Kecepatan tersirat (`v_imp`, dari jarak haversine ÷ selisih waktu) dibandingkan dengan SOG yang dilaporkan; deteksi kecepatan tersirat >60 kn (teleportasi) dan selisih >10 kn dalam jendela 600 detik |
| **A2** | Duplikasi MMSI | Metode ala Global Fishing Watch: kelompokkan pesan per-MMSI menjadi beberapa "trek" berdasar kontinuitas kecepatan wajar (≤60 kn); ≥2 trek besar yang tumpang tindih waktu → kandidat satu MMSI disiarkan dua kapal berbeda |
| **A3** | AIS gap (kemungkinan mematikan transponder) | Deteksi jeda pelaporan >30 menit; klasifikasi "kemungkinan disengaja" memakai proksi *data-driven* (kapal lain masih terlihat pada sel grid 0,1°×0,1°/jam yang sama sebelum & selama gap → area tetap tercakup, bukan receiver padam), karena tidak tersedia koordinat receiver di basis data |
| **A4** | Anomali kinematik (Speed & Course Anomaly) | 3 sub-jenis: perubahan kecepatan mendadak (`\|ΔSOG\|/Δt > 5 kn/menit`), perubahan haluan mendadak (`\|ΔCOG\|` sirkular >90° saat SOG>3kn), ketidaksesuaian *heading* vs COG (>45° saat SOG>3kn) |

**Modul yang belum diimplementasikan:** A5 (loitering — sudah ada dalam bentuk modul terpisah §7.1), A6 (encounter — sudah ada dalam bentuk modul terpisah §7.3), A7 (konsistensi status/tipe vs perilaku), A8 (korroborasi lompatan multi-kapal → indikasi interferensi GNSS), dan seluruh lapisan B (B1 Isolation Forest per konteks, B2 grid-sel + *a contrario*, B3 deep learning/autoencoder).

**Contoh kalibrasi berbasis temuan data live (metodologi "deteksi bug → root-cause → perbaikan → validasi ulang" yang diterapkan konsisten pada setiap detektor):**
- A2: ambang minimal pesan per trek dinaikkan dari 5 (default paper) menjadi 30 setelah ditemukan "trek hantu" (5–40 titik) dari data korup mendominasi hasil pada ambang default.
- A3: ditambahkan syarat durasi gap minimum 2 jam setelah ditemukan ~40–50% kandidat awal sebenarnya jeda pelaporan wajar (~30–60 menit) saat kapal diam di area ramai dekat pelabuhan — setelah perbaikan, proporsi kandidat "disengaja" turun dari ~45% menjadi 12% dari total gap.
- A4: ditambahkan ambang minimum selisih waktu 10 detik setelah ditemukan laporan berinterval 1 detik menghasilkan "akselerasi" palsu 6 kn/menit dari *jitter* GPS/SOG kecil yang diekstrapolasi berlebihan.

### 7.3 Deteksi Pertemuan Kapal (Encounter/Rendezvous)

**Metode:** *self-join* spasial-temporal murni PostGIS pada tabel `ais_position` — dua kapal dianggap "bertemu" bila berada dalam jarak (`ST_DWithin`, default 500 m) dan jendela waktu (default 600 detik) yang dapat dikonfigurasi. Dibatasi tegas ke jendela pemindaian 24 jam untuk menjaga performa (tidak ada indeks waktu independen pada `ais_position`, hanya indeks komposit `(mmsi, time)`).

Modul ini, bersama deteksi loitering (§7.1), menjadi dua blok pembangun untuk rencana pengembangan lanjutan **deteksi kandidat transshipment** (dispesifikasikan di `TRANSSHIPMENT_ALGORITHM.md` — kombinasi *encounter* dua-kapal + *loitering* satu-kapal + klasifikasi tingkat kecurigaan berbasis K-means) — **belum diimplementasikan**.

---

## 8. Integrasi & Keamanan

- Backend **tidak** mengimplementasikan login sendiri; setiap permintaan API (kecuali `/api/health`) divalidasi ulang **pada setiap request** (bukan hasil cache) terhadap endpoint otorisasi portal UVMS pusat, menggunakan cookie sesi (`uvms_session`).
- Desain *fail-closed*: URL UVMS tidak terkonfigurasi, tidak terjangkau, atau merespons di luar kontrak → HTTP 503 (tidak ada jalur yang diam-diam meloloskan akses); cookie tidak ada → 401.
- Tersedia *dev bypass* (`UVMS_AUTH_ENABLED=false`) untuk pengembangan lokal, yang mencatat *warning* log pada **setiap** permintaan yang dilewatkan agar tidak luput bila tidak sengaja aktif di lingkungan produksi.
- Backend hanya memiliki akses `SELECT` ke seluruh tabel AIS mentah; akses tulis (`INSERT`/`UPDATE`) dibatasi eksplisit hanya pada tabel `anomaly_events` melalui `GRANT` khusus di level basis data.
- Kredensial (DB, Redis, URL internal UVMS) dikonfigurasi melalui environment variable (`.env`, tidak disertakan dalam repo), tanpa nilai default hardcoded di kode sumber.

---

## 9. Ringkasan untuk Laporan Penelitian

| Aspek | Ringkasan |
|---|---|
| **Jenis sistem** | Aplikasi web analitik untuk data AIS kapal laut (maritime domain awareness) |
| **Arsitektur** | Three-tier: SPA React ↔ REST API FastAPI ↔ PostgreSQL/PostGIS (read-only) + Redis (cache) |
| **Skala data** | ~41 juta baris posisi kapal, ~3.600–5.000 kapal aktif, 2 stasiun penerima |
| **Kontribusi metodologis utama** | (1) Adaptasi algoritma deteksi loitering berbasis paper akademik (Setiawan dkk. 2025) dari desain Parquet/Dask ke SQL window function untuk skala data lebih kecil; (2) implementasi bertahap 5 dari 11 modul rule-based deteksi anomali AIS berdasarkan sintesis ~18 sumber literatur, dengan seluruh ambang batas dikalibrasi ulang dan divalidasi terhadap data live; (3) deteksi *encounter* kapal berbasis PostGIS sebagai fondasi untuk analisis transshipment lanjutan |
| **Validasi** | Seluruh hasil deteksi berstatus "kandidat" (bukan ground truth), divalidasi secara kualitatif terhadap data live dengan metodologi iteratif (deteksi anomali hasil → root-cause → perbaikan ambang batas → validasi ulang), didokumentasikan lengkap di `CHANGELOG.md` |
| **Keterbatasan utama** | Basis data sumber tanpa partisi tabel (bottleneck performa), tidak ada koordinat receiver (memengaruhi akurasi A3), beberapa modul deteksi anomali (A5–A8, B1–B3) dan klasifikasi jenis lompatan A1 belum diimplementasikan, integrasi SSO UVMS belum diuji end-to-end (portal induk belum berjalan saat dokumentasi ini disusun) |

---

*Dokumen disusun berdasarkan pembacaan langsung kode sumber `backend/` dan `frontend/` per commit terakhir repo (2026-09-29). Untuk detail kronologis pengembangan dan temuan bug/perbaikan, lihat `CHANGELOG.md`; untuk spesifikasi algoritma lengkap dengan sitasi sumber per-baris, lihat `ANOMALY_ALGORITHM.md` dan `loitering.md`.*
