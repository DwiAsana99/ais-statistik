# Changelog

Catatan kerja harian proyek UVMS Modul Statistik AIS. Detail status per-fase ada di `development-plan.md`; file ini adalah log kronologis apa yang dikerjakan tiap sesi.

---

## 2026-09-20

### 1. Setup jalan tanpa Docker
- Dibuatkan virtual environment Python di `backend/venv`, semua dependency `requirements.txt` terinstal.
- Diverifikasi backend (`uvicorn`) dan frontend (`npm run dev`) jalan langsung tanpa Docker — DB/Redis memang server eksternal, bukan container, jadi tidak ada ketergantungan Docker di situ.
- Dibuat [run-dev.ps1](run-dev.ps1) (jalankan backend+frontend sekaligus) dan `backend/.gitignore`.

### 2. Audit & sinkronisasi Fase 8–11 (kode vs `development-plan.md`)
- **Fase 8**: ditemukan & diperbaiki bug — `search.py` query kolom `vessel_name` yang tidak ada (kolom asli `name`), menyebabkan `/api/search` selalu 500.
- **Fase 9 (Statistik Pesan)**: diaudit, sudah benar — tidak ada bug.
- **Fase 10 (Performa Stasiun)** — ditemukan kesalahan asumsi arsitektur besar: `ais_base_station` **bukan** daftar stasiun penerima UVMS (itu siaran base station dari kapal lain). Stasiun penerima asli cuma **2**: `turyapada` & `unud` (dari `vessel_states.last_station_id`). **Diperbaiki**: `stations.py` ditulis ulang total pakai master list yang benar; status online/offline dihitung dari `MAX(last_received_at)` bukan `ais_base_station.last_report_at`.
- **Fase 11 (Kualitas Data)**: ditemukan & diperbaiki bug — `quality.py` query kolom `error_type` yang tidak ada di `ais_errors` (excepted diam-diam), sehingga breakdown parse/duplikat/mmsi-invalid selalu 0. Diganti kategorisasi via `ILIKE` pada `error_message`.

### 3. Git
- Repo di-`init`, `.gitignore` root dibuat (`.claude/`, backend venv/`.env`, frontend `node_modules`/`dist`, `Dockerfile`) — belum di-commit/push (menunggu instruksi).

### 4. Fase 12 — Loitering Detection (`loitering.md`)
- Diimplementasi ulang total mengikuti algoritma P1 (Setiawan dkk., ICEREAM 2025): ekstraksi trajektori 4 jam per kapal → cleaning → fitur → label (`avg_sog<2kn AND durasi>2jam AND jarak_pelabuhan>37,04km`).
- Data pelabuhan: **World Port Index** (NGA Pub 150, 3.630 pelabuhan) diambil dari mirror publik → `data/ports.csv`.
- **2 bug ditemukan & diperbaiki**: (1) window function bersarang di SQL (`LAG` di dalam `SUM() OVER`) — dipisah ke CTE. (2) Memory error — satu trajektori kandidat 55.519 titik bikin matriks jarak-ke-pelabuhan minta 1,5GB RAM sekaligus — diperbaiki dengan hitung rata-rata per-batch.
- **Tervalidasi live**: 40 event loitering/7 hari, termasuk kapal yang diam 5,3 hari jauh dari pelabuhan.
- `AnalisisPerilakuPage.tsx` (tab Loitering) disesuaikan ke algoritma baru; endpoint `/api/behavior/loitering` diganti total.

### 5. Deteksi Anomali (`ANOMALY_ALGORITHM.md`) — modul baru, Fase 12b
- Audit kelayakan penuh 11 detektor aturan (A0–A8) + 3 lapisan statistik (B1–B3) terhadap skema database live — hasil: sebagian besar layak, **A3 awalnya terhambat** karena 2 stasiun kita tak punya koordinat receiver di database manapun.
- **Tabel `anomaly_events`** dirancang (DDL `backend/sql/001_anomaly_events.sql`) — satu tabel untuk semua jenis anomali + loitering, natural key untuk upsert, `GRANT` khusus tabel ini ke role `uvms` (tabel AIS mentah tetap read-only). **User sudah menjalankan DDL ini di server** dan izin sudah diverifikasi.
- **A0 (kualitas/identitas)** + **A1 (lompatan posisi & SOG mismatch)** diimplementasi, dites live: 115 event (53 JUMP + 62 SOG_MISMATCH) tersimpan dari window 1 hari.
- **A2 (duplikasi MMSI)** + **A3 (AIS gap)** ditambahkan, digabung dengan A1 jadi satu fungsi `detect_all()` (satu fetch data posisi per kapal dipakai ulang oleh ketiganya, bukan 3x fetch terpisah).
  - A2: ditemukan bug ambang terlalu longgar (`min_msgs_per_track=5`) yang menghasilkan banyak "trek hantu" palsu dari titik data korup — dinaikkan ke 30. Sebagian noise masih tersisa (butuh klasifikasi `isolated_outlier` A1 dulu untuk fix sempurna — belum dikerjakan).
  - A3: kriteria asli "jarak ke receiver" dihapus (tidak ada koordinat), diganti proxy data-driven (kapal lain yang tetap terlihat di sel yang sama). Ditemukan & diperbaiki bug: tanpa syarat durasi minimum, gap pendek di area ramai salah ditandai "kandidat sengaja" — ditambah syarat durasi ≥2 jam, hasil jadi jauh lebih masuk akal (12% vs ~45% sebelumnya).
- Backend: `app/services/anomaly_service.py`, `app/api/anomaly.py` (`/api/anomaly/a0-summary`, `/summary`, `/events`), worker task `_refresh_anomaly` (SLOW_TASK, ~24 menit).
- Frontend: halaman baru `AnomalyPage.tsx`, route `/anomaly`, nav "Deteksi Anomali" — **5 tab** (Kelayakan Modul, A0, A1, A2, A3), semua tab data baca live dari API, styling & palet 100% reuse komponen yang sudah ada (`THEME_COLORS`, `KpiCard`, `BarChartCard`).

### 6. Setup Docker (permintaan devops)
- `docker-compose.yml` sudah ada sebelumnya tapi `backend/Dockerfile` dan `frontend/Dockerfile` belum pernah dibuat (sempat ke-gitignore duluan tanpa filenya) — dibuat sekarang.
- [backend/Dockerfile](backend/Dockerfile): `python:3.12-slim`, install `gcc`/`libpq-dev` untuk build dependency, jalan `uvicorn --reload` (kode di-mount live lewat volume).
- [frontend/Dockerfile](frontend/Dockerfile): multi-stage — build Vite di `node:22-alpine`, hasil `dist/` disajikan `nginx:alpine` pakai `nginx.conf` yang sudah ada (termasuk proxy `/api/` ke service `backend`).
- Dibuat `backend/.env` (gitignored, default sama seperti fallback di `config.py`) — sebelumnya tidak ada, `docker-compose.yml` gagal start tanpa file ini karena `env_file` mensyaratkan filenya ada.
- [docker-compose.yml](docker-compose.yml): tambah volume `./data:/data` — dibutuhkan karena `loitering_ports_file` di config resolve ke `../data/ports.csv` relatif dari `/app` di container.
- Ditambah `.dockerignore` di `backend/` dan `frontend/` (exclude `venv`/`node_modules`/dll).
- **Bug ditemukan saat build**: `npm run build` (`tsc -b && vite build`) gagal — tidak ketauan sebelumnya karena `npm run dev` (dipakai di `run-dev.ps1`) tidak strict type-check. Diperbaiki di `MonthlyReportPage.tsx`:
  - Import icon salah: `ErrorOutline` (tidak ada di `@mui/icons-material` versi terinstal) → `ErrorOutlined`.
  - Type mismatch di `Tooltip formatter` Recharts: parameter diketik `number` padahal Recharts kirim `ValueType | undefined` — diperbaiki dengan `Number(value)`.
- **Tervalidasi live**: `docker compose up -d --build` sukses, `GET /api/health` via backend langsung (`:8001`) dan via proxy nginx frontend (`:3000/api/health`) sama-sama `{"status":"ok","database":true,"redis":true}`.

### 7. Menu Loitering khusus di sidebar
- Sebelumnya Loitering cuma tab di dalam "Analisis Perilaku". Diekstrak jadi halaman standalone [LoiteringPage.tsx](frontend/src/pages/LoiteringPage.tsx) (dipakai ulang di tab lama juga, tidak duplikat kode).
- Route baru `/loitering`, menu sidebar "Loitering" (icon `Anchor`) di bawah "Pertemuan Kapal".
- Label grup sidebar "ANALISIS" diganti jadi "ANALISIS & DETEKSI ANOMALI".

### 8. Fase 12b lanjutan — A4 Anomali Kinematik (SCA)
- Diimplementasi di `anomaly_service.py`: `_detect_a4_for_vessel()`, 3 sub-jenis sesuai ANOMALY_ALGORITHM.md Bagian 5 A4 — `speed_change` (`|ΔSOG|/Δt > 5kn/menit`), `course_change` (`|ΔCOG| sirkular > 90°` saat SOG>3kn), `heading_cog_mismatch` (`|heading−COG| > 45°` saat SOG>3kn). Ambang tetap `[ADAPT]` (bukan quantile/mad per konteks — belum dikerjakan). TA (U-turn/berputar, butuh agregasi jendela) belum diimplementasi.
- Query `detect_all()` diperluas ambil `cog_deg`, `heading_deg` — tuple row dari 4 jadi 6 kolom; semua unpacking A1/A2/A3 lama disesuaikan (`*_` trailing catch-all) supaya tidak pecah.
- **Bug ditemukan & diperbaiki saat verifikasi live** (pola sama seperti noise A1/A2 sebelumnya): tanpa batas bawah Δt, laporan `dt_s=1` (umum di data kita) bikin jitter SOG 0,1kn diekstrapolasi jadi "akselerasi" 6kn/menit — 2281 dari 2616 kandidat awal semuanya di `dt_s=1`, pola seragam khas artefak, bukan akselerasi nyata. Ditambah `KINEMATIC_MIN_DT_S=10.0` (median interval lapor lokal) → total turun ke 818 event/hari, nilai jadi masuk akal (mis. `course_change` sekarang isinya U-turn asli Δ178-179°).
- Halaman baru [KinematicAnomalyPage.tsx](frontend/src/pages/KinematicAnomalyPage.tsx), route `/anomaly/kinematic`, menu sidebar "Anomali Kinematik" (icon `Speed`) di bawah "Loitering".
- Tab "Kelayakan Modul" di `/anomaly` diupdate: status A4 dari "belum dikerjakan" jadi live (status `warn` — karena TA belum ada).
- Menu "Analisis Perilaku" **dihapus dari sidebar** (route `/behavior` tetap ada, cuma sudah tidak ada tautannya di menu — Pertemuan Kapal & Loitering yang tadinya jadi tab di situ sudah masing-masing punya menu sendiri).
- Fix bug sidebar: `isActive` sebelumnya pakai `location.pathname.startsWith(item.path)` — akan salah nge-highlight dua menu sekaligus begitu ada path bersarang (`/anomaly` adalah prefix dari `/anomaly/kinematic`). Diganti exact-match.
- Dokumen baru [TRANSSHIPMENT_ALGORITHM.md](TRANSSHIPMENT_ALGORITHM.md) — spesifikasi riset deteksi kandidat transshipment (encounter 2-kapal + loitering 1-kapal + klasifikasi K-means tingkat kecurigaan), disalin dari draft user; belum diimplementasi.

### 9. Fase 13 — Menu Track Kapal di sidebar
- **Temuan**: backend (`GET /api/vessels/{mmsi}/track`, downsample maks 2000 titik/48 jam, cache 15 menit) dan UI-nya (`VesselTrackDialog.tsx` — peta+polyline+playback slider+info SOG/COG/heading/nav-status) **sudah lengkap dari sesi sebelumnya**, dipicu tombol "Lihat Track" di tabel kapal (`/vessels` tab Tabel). Checklist Fase 13 di `development-plan.md` cuma belum di-centang (stale), bukan belum dikerjakan.
- Diekstrak inti tampilan (peta, playback, panel info) dari `VesselTrackDialog.tsx` ke komponen reusable [VesselTrackViewer.tsx](frontend/src/components/vessel/VesselTrackViewer.tsx) — dipakai ulang oleh dialog (tetap ada, tak ada regresi di tabel kapal) dan halaman baru.
- Halaman baru [VesselTrackPage.tsx](frontend/src/pages/VesselTrackPage.tsx) — pencarian kapal (`Autocomplete` + debounce 400ms ke `/api/vessels?search=`) lalu render `VesselTrackViewer` untuk kapal terpilih.
- Route `/map/track`, menu sidebar "Track Kapal" (icon `Route`) tepat di bawah "Peta".
- Bug kecil saat build: `params.InputProps` di `Autocomplete renderInput` tidak ada di versi MUI terpasang (tipe berubah) — disederhanakan, tidak gantung ke bentuk internal versi tertentu.
- Docker frontend build sukses, `/map/track` dan `/api/vessels?search=` tervalidasi live.

### 10. Migrasi UI total: MUI → Tailwind CSS v4 + DaisyUI, palet maritime
- Permintaan user: ganti seluruh style & komponen frontend ke DaisyUI dengan palet `#003B5C` (navy) `#0C7B93` (teal) `#94D2BD` (seafoam) `#EE9B00` (amber) `#F6F8FF` (mist). Scope-nya ternyata gede — 29 dari ~30 file `frontend/src` pakai `@mui/material`/`@mui/icons-material` — jadi dibuatkan plan dulu (`EnterPlanMode`/`ExitPlanMode`) sebelum eksekusi, disetujui user termasuk 2 keputusan: icon pakai **lucide-react**, dan toggle dark/light **dipertahankan** (bukan 1 tema saja).
- **Stack baru**: `tailwindcss@4`, `@tailwindcss/vite`, `daisyui@5`, `lucide-react` — install via npm langsung di host (bukan cuma di container), `vite.config.ts` ditambah plugin `tailwindcss()`.
- **Tema**: 2 varian DaisyUI (`maritime` terang / `maritime-dark` gelap) didefinisikan sebagai CSS custom properties di `src/index.css` lewat `@plugin "daisyui/theme"` — brand color (primary/secondary/accent/warning) sama persis di kedua tema, cuma base-100/200/300 & content yang beda per mode. `stores/themeStore.ts` diganti dari `Object.assign` ke objek JS mutable (`THEME_COLORS`, workaround lama) jadi `document.documentElement.setAttribute("data-theme", ...)` — reaktivitas asli lewat CSS var, bukan `key={mode}` remount hack lagi (dihapus dari `MainLayout.tsx`).
- **`THEME_COLORS`/`DARK_COLORS`/`LIGHT_COLORS`/`applyThemeColors` dihapus total** dari `utils/constants.ts` — komponen sekarang pakai class Tailwind (`bg-base-100`, `text-base-content`, dst) atau `var(--color-*)` di context yang butuh string warna mentah (Recharts).
- **Palet warna chart divalidasi pakai skill `dataviz`** (bukan asal comot hex): `validate_palette.js` — 7 warna kategorikal (teal/amber/magenta/blue/seagreen/violet/coral-red) dicari urutannya lewat brute-force permutation search (circular, karena dipakai juga di DonutChart yang berbentuk cincin) sampai lolos semua gate (lightness band, chroma floor, CVD delta-E, normal-vision floor, kontras) di kedua tema — tersimpan sebagai `--chart-1..7` per tema di `index.css` + `utils/chartColors.ts`. Heatmap traffic pakai ramp sekuensial 1-hue (teal) terpisah utk tiap tema (bukan 2-hue navy→amber seperti sebelumnya).
- **Komponen bersama ditulis ulang**: `Sidebar`/`Header`/`MainLayout`/`ErrorBoundary` (shell), `KpiCard`, `BarChartCard`/`DonutChart`/`LineChartCard`/`HeatmapChart`, `DataTable` (sort+pagination+search+select custom, tanpa MUI Table*/TablePagination), `VesselTrackViewer`+`VesselTrackDialog` (native `<dialog>`+`modal-box`, bukan MUI Dialog), `VesselMap` (chrome legend/badge saja, layer Leaflet tak disentuh).
- **15 halaman dimigrasi** — `AnomalyPage.tsx` (587 baris, 5 sub-tab) + `MapPage.tsx` + `AnalisisPerilakuPage.tsx` dikerjakan langsung; 12 sisanya didelegasikan ke **3 subagent paralel** (batch ~1000-1400 baris masing-masing) dibekali tabel padanan komponen MUI→Tailwind/DaisyUI + file referensi yang sudah jadi. `VesselTrackPage.tsx` butuh combobox custom (DaisyUI tak punya Autocomplete) — input+dropdown absolute-positioned pakai state debounce yang sudah ada.
- **Bug ditemukan & diperbaiki selama migrasi**:
  - `Sidebar.tsx` `isActive` awalnya `location.pathname.startsWith(item.path)` — begitu ada path bersarang (`/anomaly` prefix dari `/anomaly/kinematic`, `/map` prefix dari `/map/track`) dua menu ke-highlight sekaligus. Diganti exact-match.
  - Satu `mb-0.75` invalid (bukan step asli skala spacing Tailwind, no-op) ketemu subagent saat migrasi `MonthlyReportPage.tsx` — diganti `mb-1.5` (6px, sama kayak MUI `mb: 0.75` × 8px).
- **Verifikasi**: `grep -r "@mui\|THEME_COLORS" frontend/src` → nol hasil. `npm uninstall @mui/material @mui/icons-material @emotion/react @emotion/styled` (68 package kehapus). `docker compose up -d --build frontend` → `tsc -b && vite build` sukses tanpa error, bundle JS utama turun ~310KB→~248KB tanpa MUI+Emotion. 15 route sidebar di-curl semua balas 200. 5 hex brand dikonfirmasi ada di CSS hasil build (`grep -o "003b5c\|0c7b93\|94d2bd\|ee9b00\|f6f8ff"`).
- **Belum diverifikasi**: tidak ada tool screenshot/browser di environment ini — belum dicek visual langsung di browser sungguhan (cuma otomatis: build, route 200, CSS var). User disarankan buka sendiri buat cek polish visual & interaksi (sort tabel, playback slider, modal, dark/light toggle).

### Belum selesai / item terbuka
- Klasifikasi 3-jenis jump A1 (`isolated_outlier`/`single_axis`/`persistent_shift`) — prasyarat A2 & A8 supaya tidak tercampur noise.
- A4 TA (turning/U-turn, jendela geser), A5 (sudah ada versi loitering trajektori tersendiri, beda dari definisi TRANSSHIPMENT_ALGORITHM.md), A6–A8, B1–B3 — belum diimplementasi, lihat matriks kelayakan di tab pertama `/anomaly`.
- Keputusan `drop_logic` loitering (`and` vs `or`, ANOMALY_ALGORITHM.md/loitering.md Bagian 9) — belum diputuskan user.
- TRANSSHIPMENT_ALGORITHM.md — dokumen baru, belum ada baris implementasi (checklist Bagian 14 semua kosong).
- Migrasi UI DaisyUI — belum dicek visual di browser sungguhan (lihat poin di atas).
- Repo git belum di-commit/push (termasuk seluruh migrasi UI ini).
