# LOITERING_ALGORITHM.md — Spesifikasi Deteksi Loitering & Statistik (AIS)

> **Untuk Claude Code.** Dokumen ini adalah spesifikasi kerja. Baca seluruhnya sebelum menulis kode.
> Working dir: `D:\Project\ais-statistik` (Windows). Gunakan `pathlib`, jangan pakai path/perintah khusus bash.
> Tujuan akhir: **menghasilkan data statistik loitering** dari data AIS historis.

---

## 0. Aturan kerja (wajib)

1. Kerjakan sesuai urutan di **Bagian 10 (Checklist)**. Selesaikan dan uji satu tahap sebelum lanjut.
2. Semua ambang batas ada di `config.yaml` (Bagian 4). **Jangan hardcode** angka di kode.
3. Jangan memuat seluruh data (±200 juta baris) ke memori sekaligus. Proses **per partisi MMSI** (Bagian 5.0).
4. Jangan mengarang data pelabuhan. Jika `data/ports.csv` tidak ada, **tanyakan ke user** (Bagian 3.2).
5. Jika kolom/format data user berbeda dari Bagian 3, sesuaikan lewat `config.yaml` (mapping kolom), jangan ubah logika algoritma.
6. Setiap tahap mencatat **jumlah baris/MMSI/trajektori masuk dan keluar** (funnel) ke `output/funnel.csv`.
7. Bagian 9 berisi ambiguitas pada paper. Pakai nilai default yang tertulis, dan **laporkan ke user** bila hasil sensitif terhadap pilihan tersebut.

---

## 1. Sumber & ruang lingkup

| Kode | Paper | Dipakai untuk |
|---|---|---|
| **P1** | Setiawan dkk., *Detecting Potential Vessel Loitering Behavior from Ship Trajectories Using a Hybrid Rule-Based and Neural Network Approach*, ICEREAM 2025 | **Algoritma utama** (level trajektori): ekstraksi trajektori 4 jam, cleaning, aturan loitering, NN opsional |
| **P2** | Setiawan dkk., *Ship Trajectory Prediction Based on Spatial-temporal Data Using LSTM*, JOIV 9(3) 2025 | Aturan cleansing AIS, filter loitering & anchoring level segmen (opsional), pemrosesan paralel (Dask) |

**Dalam ruang lingkup:** cleansing → ekstraksi trajektori → cleaning trajektori → fitur → label loitering (aturan) → **statistik**.
**Opsional (Fase 2):** klasifikasi NN (Bagian 8), deteksi segmen loitering (Bagian 7).
**Di luar ruang lingkup:** prediksi trajektori LSTM (P2 hanya dipakai untuk aturan preprocessing-nya).

Definisi loitering (P1): kapal bergerak lambat/berputar/berhenti dalam waktu tidak wajar **jauh dari pelabuhan** (indikasi illegal fishing, smuggling, transshipment).

---

## 2. Ringkasan algoritma (level trajektori, P1)

```
AIS mentah
  → [1] Cleansing titik            (duplikat, null, MMSI/rentang nilai tidak valid)
  → [2] Ekstraksi trajektori       (pisah bila selisih waktu antar titik > 4 jam)
  → [3] Cleaning trajektori        (n_titik >= 10, buang trajektori "tidak natural")
  → [4] Ekstraksi fitur            (rata-rata SOG, durasi, rata-rata jarak ke pelabuhan terdekat)
  → [5] Label loitering (aturan)   avg_sog < 2 kn  AND  durasi > 2 jam  AND  avg_jarak_pelabuhan > 20 nm (37.04 km)
  → [6] Statistik & ekspor
  → [7] (opsional) NN 3-32-16-8-1 meniru label aturan
```

---

## 3. Data masukan

### 3.1 Skema minimum (satu baris = satu laporan posisi AIS)

| Kolom logis | Tipe | Catatan |
|---|---|---|
| `mmsi` | int64 | 9 digit |
| `ts` | datetime (UTC) | waktu penerimaan/posisi |
| `lat`, `lon` | float | derajat desimal |
| `sog` | float | **knot**. Pastikan sudah didekode (nilai mentah AIS satuan 1/10 knot; 102.3 = tidak tersedia) |
| `cog` | float | derajat 0–359.9 (360 = tidak tersedia) |

Kolom lain (mis. `ship_type`, `nav_status`) diabaikan pipeline inti, tetapi bila ada, dipakai untuk statistik tambahan (Bagian 6).

Sumber data dapat berupa Parquet/CSV atau PostgreSQL. Mapping nama kolom dan lokasi diatur di `config.yaml → input`.
**Langkah pertama Claude Code:** inspeksi data (skema, rentang waktu, jumlah baris, satuan `sog`), tampilkan ringkasan ke user, baru lanjut.

### 3.2 Data pelabuhan (wajib)

`data/ports.csv` dengan kolom `name,lat,lon`. Paper tidak menyebut sumbernya. Jika file belum ada, tanyakan ke user
apakah memakai daftar pelabuhan miliknya sendiri atau sumber publik (mis. World Port Index). **Jangan mengisi koordinat dari ingatan.**

---

## 4. Konfigurasi (`config.yaml`)

```yaml
input:
  source: parquet            # parquet | csv | postgres
  path: data/ais/            # folder/berkas, atau DSN bila postgres
  columns: {mmsi: mmsi, ts: timestamp, lat: lat, lon: lon, sog: sog, cog: cog}
ports_file: data/ports.csv

cleansing:                   # P1 (umum) + P2 (rentang nilai)
  drop_duplicates_on: [mmsi, ts]
  mmsi_digits: 9
  lat_range: [-90, 90]
  lon_range: [-180, 180]
  sog_range: [0, 70]         # P2: 0<SOG<70. LIHAT Bagian 9 #3 (default di sini inklusif 0)
  sog_min_inclusive: true
  cog_range: [0, 360]        # 360 = tidak tersedia -> dibuang; 0 dipertahankan
  cog_max_exclusive: true

trajectory:
  gap_hours: 4.0             # P1: pemisah trajektori
  min_points: 10             # P1 cleaning

trajectory_cleaning:         # P1
  sog_std_max: 2.0
  cog_std_eps: 1.0e-9        # "COG std = 0" dianggap std <= eps
  drop_logic: "and"          # "and" | "or"  -> LIHAT Bagian 9 #2

loitering_rule:              # P1
  avg_sog_kn_lt: 2.0
  duration_h_gt: 2.0
  avg_dist_port_km_gt: 37.04 # 20 nm

segment_mode:                # opsional (Bagian 7), P2
  enabled: false
  loiter_sog_kn_lt: 2.0
  loiter_min_minutes: 10
  anchor_max_displacement_m: 50
  anchor_min_minutes: 30

stats:
  grid_deg: 0.5              # ukuran sel hotspot
  top_n_vessels: 50

runtime:
  n_partitions: 64           # jumlah bucket MMSI
  engine: pandas             # pandas | dask | polars (dask dipakai pada P2)
```

---

## 5. Spesifikasi tahap

### 5.0 Partisi (skala data)

P1 memproses ±230 juta baris. Tulis data ke `work/parts/part=<k>.parquet` dengan `k = mmsi % n_partitions`.
Semua trajektori satu kapal berada pada satu partisi, sehingga tahap 5.2–5.4 dapat dijalankan per partisi (paralel bila perlu),
lalu hasil fitur digabung. **Hanya tabel fitur per-trajektori yang digabung**, bukan titik mentah.

### 5.1 Cleansing titik (P1 + P2)

Buang baris jika salah satu benar:
- kolom kunci null;
- duplikat pada `(mmsi, ts)` (pertahankan yang pertama);
- `mmsi` bukan `mmsi_digits` digit (P2: "MMSI = 9 bit" adalah maksud 9 digit);
- `lat`/`lon` di luar rentang;
- `sog` di luar `sog_range`; `cog` di luar `cog_range` (lihat opsi inklusivitas di config).

Catat funnel: `raw_rows, raw_mmsi → valid_mmsi_rows → cleansed_rows, cleansed_mmsi` (setara Tabel 1 P1).

### 5.2 Ekstraksi trajektori (P1)

Urutkan per `(mmsi, ts)`. Titik baru memulai trajektori baru jika selisih waktu dengan titik sebelumnya **> `gap_hours`** (4 jam).

```python
df = df.sort_values(["mmsi", "ts"])
gap = df.groupby("mmsi")["ts"].diff()
new = (gap.isna() | (gap > pd.Timedelta(hours=cfg.trajectory.gap_hours))).astype("int8")
df["traj_idx"] = new.groupby(df["mmsi"]).cumsum() - 1
df["traj_id"] = df["mmsi"].astype(str) + "-" + df["traj_idx"].astype(str)   # contoh: 200000000-3
```

Catat funnel: `n_points, n_mmsi, n_trajectories` (setara Tabel 2 P1).

### 5.3 Cleaning trajektori (P1)

Hitung per `traj_id`: `n_points`, `sog_std`, `cog_std`. Lalu:
1. Pertahankan hanya `n_points >= min_points`.
2. Definisikan `stationary_like`:
   - `drop_logic = "and"` → `(sog_std < 2.0) & (cog_std <= eps)`  ← sesuai teks bagian Method P1
   - `drop_logic = "or"`  → `(sog_std < 2.0) | (cog_std <= eps)`  ← sesuai header Tabel 3 P1
3. Buang trajektori `stationary_like` (alasan P1: kapal sekadar berlabuh/bergerak sangat lambat dengan arah tetap — tidak natural).

Catat funnel (setara Tabel 3 P1). Simpan juga jumlah trajektori yang dibuang **per alasan** (n_points, sog_std, cog_std).

### 5.4 Ekstraksi fitur (P1)

Hanya untuk trajektori yang lolos 5.3 (hemat komputasi):

| Fitur | Definisi |
|---|---|
| `avg_sog_kn` | rata-rata `sog` semua titik trajektori |
| `duration_h` | `(ts_max − ts_min)` dalam jam |
| `avg_dist_port_km` | rata-rata, atas semua titik, jarak haversine ke **pelabuhan terdekat** |

Tambahan untuk statistik (bukan bagian rule): `mmsi, t_start, t_end, n_points, lat_mean, lon_mean, sog_std, cog_std, dist_port_min_km`.

Jarak ke pelabuhan terdekat (vektorisasi, jangan loop titik×pelabuhan):

```python
from sklearn.neighbors import BallTree
EARTH_R_KM = 6371.0088
tree = BallTree(np.radians(ports[["lat", "lon"]].to_numpy()), metric="haversine")
d_rad, _ = tree.query(np.radians(pts[["lat", "lon"]].to_numpy()), k=1)
pts["dist_port_km"] = d_rad[:, 0] * EARTH_R_KM
```

### 5.5 Label loitering (P1 — inti algoritma)

```python
r = cfg.loitering_rule
feat["is_loitering"] = (
    (feat.avg_sog_kn      <  r.avg_sog_kn_lt) &      # 2 knot
    (feat.duration_h      >  r.duration_h_gt) &      # 2 jam
    (feat.avg_dist_port_km > r.avg_dist_port_km_gt)  # 20 nm = 37.04 km
)
```

Alasan tiap syarat (P1): kecepatan rendah = gerak lambat; durasi > 2 jam = tidak sesaat; jauh dari pelabuhan = menyingkirkan
aktivitas normal seperti berlabuh di sekitar pelabuhan.

### 5.6 Statistik & ekspor → Bagian 6.

---

## 6. Keluaran statistik (`output/`)

| Berkas | Isi |
|---|---|
| `funnel.csv` | Jumlah tiap tahap: raw → valid MMSI → cleansed → trajektori → setelah cleaning → loitering (baris, MMSI, trajektori) |
| `trajectory_features.parquet` | Semua trajektori lolos cleaning + fitur + `is_loitering` |
| `loitering_events.csv` | Hanya `is_loitering = True`: `traj_id, mmsi, t_start, t_end, duration_h, avg_sog_kn, avg_dist_port_km, lat_mean, lon_mean, n_points` |
| `stats_summary.json` | Total kejadian, jumlah kapal unik, **rasio loitering = loitering / trajektori lolos cleaning**, mean/median/p90 durasi, mean/median kecepatan, mean/median jarak ke pelabuhan |
| `stats_by_month.csv`, `stats_by_day.csv` | Jumlah kejadian & kapal unik per periode (berdasar `t_start`, UTC) |
| `stats_by_hour.csv` | Distribusi jam mulai (UTC dan WITA/UTC+8) |
| `stats_by_vessel.csv` | Per MMSI: jumlah kejadian, total jam loitering, kejadian pertama/terakhir (top N di config; simpan lengkap juga) |
| `stats_by_grid.csv` | Hotspot: sel `grid_deg`×`grid_deg`, jumlah kejadian, kapal unik, total jam |
| `stats_by_shiptype.csv` | **Hanya bila** ada kolom tipe kapal |
| `hist_*.csv` | Histogram durasi, kecepatan rata-rata, jarak ke pelabuhan |
| `figures/` (opsional) | Peta sebaran kejadian, grafik tren bulanan |

Semua CSV memakai UTF-8, pemisah koma, waktu ISO-8601 UTC. Tambahkan `run_metadata.json` (tanggal run, hash config, rentang data, versi paket).

---

## 7. Opsional — mode segmen (P2)

Mendeteksi **potongan** waktu loitering di dalam trajektori (lebih halus dari label trajektori). Aktifkan via `segment_mode.enabled`.
P2 memakai aturan ini sebagai *filter pembuangan* untuk data prediksi; di sini dipakai sebagai *detektor*.

- **Loitering segmen:** rangkaian titik berurutan dengan `sog < 2 kn` selama `> 10 menit`.
- **Anchoring:** rangkaian titik dengan selisih koordinat `< 50 m` selama `≥ 30 menit`.
- Segmen yang tergolong anchoring dapat dikecualikan dari loitering (`exclude_anchoring: true`).
- Keluaran terpisah: `output/segment_events.csv`. **Jangan mencampur** hitungan mode segmen dengan mode trajektori dalam satu statistik.

Catatan: ambang P2 (10 menit, trajektori dipecah pada gap 45 menit, minimal 400 titik) berbeda dari P1 karena tujuannya prediksi, bukan statistik.

---

## 8. Opsional — model NN (P1, Fase 2)

Hanya dikerjakan jika user meminta. **Tidak diperlukan untuk statistik.**

- Input 3 fitur: `avg_sog_kn, duration_h, avg_dist_port_km` (standardisasi).
- Arsitektur: Dense 32 → 16 → 8 → 1 (output sigmoid). Aktivasi ReLU pada lapisan tersembunyi; loss binary cross-entropy; optimizer Adam (rincian ini disimpulkan, P1 tidak merinci selain jumlah neuron).
- Label = `is_loitering` dari aturan. Split ±80/20 (P1: 346.788 train / 86.697 test), stratified.
- Metrik: confusion matrix, accuracy, precision, recall, F1.
- **Peringatan (sampaikan ke user):** label dibuat dari tiga fitur yang sama dengan input NN, jadi NN hanya mempelajari ulang aturan (kebocoran label). Metrik ±99,9% P1 tidak membuktikan kemampuan mendeteksi loitering nyata. Untuk validasi sesungguhnya diperlukan label independen (mis. verifikasi manual/data VMS).

---

## 9. Ambiguitas & ketidakkonsistenan pada paper

| # | Temuan | Keputusan default | Tindakan |
|---|---|---|---|
| 1 | P1 Tabel 2 melaporkan **98.594 MMSI** pada tahap ekstraksi, padahal setelah cleansing hanya 38.273 MMSI. Tabel 6 memuat 433.485 trajektori, padahal Tabel 3 hanya 156.355. Kesimpulan menyebut filter *navigation status* yang tidak ada di Method. | Angka absolut paper **tidak dipakai sebagai target**. | Hanya jadikan pembanding rasio kasar (loitering ≈ 15,4% dari trajektori lolos cleaning; lolos cleaning ≈ 20,6% dari trajektori awal). Data user berbeda periode/receiver, selisih wajar. |
| 2 | Cleaning: teks Method = SOG std < 2 **dan** COG std = 0; header Tabel 3 = **atau**. Hasil P1 (757.807 → 156.355) menyiratkan penyaringan sangat agresif. | `drop_logic: "and"` | Jalankan **kedua** varian, laporkan funnel keduanya ke user, minta user memilih. Catat: kedua varian bisa membuang kapal lambat yang justru kandidat loitering, sehingga statistik cenderung *terlalu rendah*. |
| 3 | P2 memakai `0 < SOG < 70` dan `0 < COG < 360`. Titik SOG = 0 (kapal diam) menaikkan rata-rata kecepatan bila dibuang → bias terhadap loitering. | Inklusif 0 untuk SOG dan COG (`sog_min_inclusive: true`); 360 dibuang | Beri tahu user; sediakan switch di config untuk mengikuti P2 secara harfiah. |
| 4 | Syarat jarak pelabuhan: daftar P1 menulis "20 nm", teks menulis "lebih dari 37,04 km". | `> 37.04 km` (strict) | — |
| 5 | Sumber data pelabuhan tidak disebut. | Wajib disediakan user | Lihat Bagian 3.2. |
| 6 | "Rata-rata jarak" dan "durasi" tidak didefinisikan rumus eksplisit. | Rata-rata aritmetika seluruh titik; durasi = `t_max − t_min` trajektori | Dokumentasikan di `run_metadata.json`. |
| 7 | Durasi loitering P1 = durasi **seluruh trajektori**, bukan durasi segmen lambat. Trajektori panjang yang sebagian besar berlayar cepat tidak lolos `avg_sog < 2`, tetapi kapal yang loitering singkat di tengah pelayaran tidak terdeteksi. | Ikuti P1 | Bila user butuh cakupan lebih baik, sarankan mode segmen (Bagian 7). |

---

## 10. Struktur proyek & checklist

```
D:\Project\ais-statistik\
├─ config.yaml
├─ data\ (ais\, ports.csv)          # input, jangan di-commit bila besar
├─ work\parts\                      # partisi sementara
├─ output\                          # hasil (Bagian 6)
├─ src\loitering\
│   ├─ config.py        # muat & validasi config.yaml
│   ├─ io.py            # baca sumber (parquet/csv/postgres), tulis partisi
│   ├─ cleanse.py       # 5.1
│   ├─ trajectory.py    # 5.2 + 5.3
│   ├─ features.py      # 5.4 (jarak pelabuhan)
│   ├─ rules.py         # 5.5
│   ├─ stats.py         # Bagian 6
│   ├─ segments.py      # Bagian 7 (opsional)
│   └─ nn.py            # Bagian 8 (opsional)
├─ tests\
└─ run.py               # CLI: python run.py --config config.yaml [--sample 0.01]
```

**Checklist (urut):**

- [ ] 1. Inspeksi data & konfirmasi skema/satuan `sog` dengan user; pastikan `data/ports.csv` tersedia.
- [ ] 2. Buat `config.yaml`, `config.py`, environment (`python -m venv .venv`; `pip install pandas pyarrow scikit-learn pyyaml numpy pytest`; tambah `dask`/`polars`/`psycopg` hanya jika dipakai).
- [ ] 3. Implementasi `cleanse.py` + funnel. Uji pada sampel kecil.
- [ ] 4. Implementasi `trajectory.py` (ekstraksi + cleaning) + funnel.
- [ ] 5. Implementasi `features.py` dan `rules.py`.
- [ ] 6. Tulis unit test (Bagian 11) — semua harus lulus.
- [ ] 7. Jalankan pada sampel (mis. 1 bulan atau 1% MMSI), periksa output & laporkan funnel ke user.
- [ ] 8. Implementasi `stats.py`, hasilkan semua berkas Bagian 6.
- [ ] 9. Jalankan data penuh (per partisi), laporkan hasil + varian Bagian 9 #2.
- [ ] 10. (Hanya bila diminta) Bagian 7 dan/atau 8.

---

## 11. Uji penerimaan (unit test dengan data sintetis)

Bangun DataFrame sintetis (posisi bergeser sangat kecil agar SOG/COG sesuai; sertakan sedikit variasi SOG supaya lolos cleaning sesuai `drop_logic`).
Pelabuhan uji di (lat 0, lon 0).

| Kasus | Ekspektasi |
|---|---|
| Kapal 3 jam, rata-rata SOG 1 kn, rata-rata 60 km dari pelabuhan | `is_loitering = True` |
| Sama, tetapi 10 km dari pelabuhan | `False` (dekat pelabuhan) |
| Sama, tetapi durasi 1,5 jam | `False` (durasi) |
| Sama, tetapi rata-rata SOG 5 kn | `False` (kecepatan) |
| Dua rangkaian titik berjarak waktu 5 jam | Terpecah jadi **2** trajektori; 3,9 jam → tetap 1 |
| Trajektori 9 titik | Dibuang oleh `min_points` |
| Baris duplikat `(mmsi, ts)` dan MMSI 8 digit | Dibuang oleh cleansing |
| `dist_port_km` untuk titik 1° lintang dari pelabuhan | ≈ 111,19 km (toleransi 0,5 km) |
| Ambang tepat (durasi = 2,0 jam; jarak = 37,04 km) | `False` (strict `>`) |

Uji integrasi: `funnel.csv` bersifat **monoton** (tiap tahap ≤ tahap sebelumnya) dan `loitering_events.csv` memiliki jumlah baris = `funnel.loitering`.