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

### Belum selesai / item terbuka
- Klasifikasi 3-jenis jump A1 (`isolated_outlier`/`single_axis`/`persistent_shift`) — prasyarat A2 & A8 supaya tidak tercampur noise.
- A4–A8, B1–B3 (kinematik, encounter refinement, konteks, korroborasi, Isolation Forest, GeoTrackNet-lite) — belum diimplementasi, lihat matriks kelayakan di tab pertama `/anomaly`.
- Keputusan `drop_logic` loitering (`and` vs `or`, ANOMALY_ALGORITHM.md/loitering.md Bagian 9) — belum diputuskan user.
- Repo git belum di-commit/push.
