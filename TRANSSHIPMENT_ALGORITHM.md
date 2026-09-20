# TRANSSHIPMENT_ALGORITHM.md — Deteksi Kandidat Transshipment dari Data AIS (berbasis riset, dengan sumber)

> **Untuk Claude Code.** Spesifikasi kerja untuk `D:\Project\ais-statistik` (Windows, gunakan `pathlib`).
> Melengkapi `LOITERING_ALGORITHM.md` dan `ANOMALY_ALGORITHM.md`. Modul **A5 (loitering)** dan **A6 (encounter)** di dokumen anomali
> adalah versi ringkas; dokumen ini adalah versi **lengkap dan menggantikannya untuk kasus transshipment**.
> Disusun 20 September 2026 dari riset literatur (Bagian 13). Baca Bagian 0 dan 12 sebelum menulis kode.

---

## 0. Aturan kerja & cara membaca tag

1. Kerjakan bertahap sesuai checklist Bagian 14. Uji tiap tahap dengan data sintetis (Bagian 11) sebelum lanjut.
2. Semua ambang di `config.yaml` (Bagian 9). Tidak ada angka hardcode di kode.
3. Tag asal setiap aturan/angka:
   - **`[S#]`** = berasal dari sumber di Bagian 13.
   - **`[ADAPT]`** = usulan saya (konsep dari sumber, angka/implementasi bukan dari sumber).
   - **`[PARAM]`** = wajib dituning dari data user; jangan klaim "sesuai paper".
4. **AIS tidak dapat memastikan terjadinya pemindahan muatan.** Keluaran selalu berstatus **`candidate`** (kandidat), bukan bukti pelanggaran. Peneliti GFW sendiri menyebutnya "encounter" bukan "transshipment" karena isi pertemuan tidak diketahui [S4].
5. Semua deteksi dibatasi oleh **cakupan receiver**: kedua kapal harus sama-sama terpantau [S2]. Sebelum menyajikan statistik, buat peta cakupan (Bagian 8) dan tandai kejadian yang berada di tepi jangkauan sebagai `coverage_limited`.
6. Dua detektor komplementer selalu dijalankan bersama, karena keduanya saling membatasi: **encounter dua kapal** (cenderung *under*-estimate) dan **loitering satu kapal** (cenderung *over*-estimate) [S1].
7. Sebelum lanjut ke tahap berikutnya, tampilkan ke user: jumlah kejadian per tahap (funnel), 10 contoh, dan distribusi fitur.

---

## 1. Definisi dan kerangka

**Transshipment** = dua kapal bertemu untuk menukar muatan, perbekalan, atau awak, sering jauh dari pelabuhan asal [S1]. Kekhawatiran utama: ketertelusuran (pencampuran hasil tangkapan ilegal), IUU fishing, penyelundupan, dan pelanggaran hak awak [S1][S3]. Terkait sanksi/embargo, varian yang sering dipakai adalah *ship-to-ship (STS) transfer* untuk minyak dan kargo [S5].

Penelitian dan praktik yang dipakai sebagai dasar:

| Pendekatan | Sumber | Intisari |
|---|---|---|
| Dua detektor berbasis aturan: *two-vessel encounter* dan *single-vessel loitering* | [S1][S2][S4] | Ambang tetap: jarak, durasi, kecepatan, jarak dari pelabuhan/pantai |
| Aturan **lebar** + klasifikasi tingkat kecurigaan (K-means + kerapatan lalu lintas) | [S3] | Mengatasi ambang tetap yang melewatkan kejadian dan banyak false positive di area padat |
| STS minyak/kargo: ≥ 2 jam, ≤ 500 m, SOG < 1 kn | [S5] | Varian lebih ketat pada kecepatan; pemisahan *STS Cargo* vs *STS Tanker* |
| Bunkering sebagai rendezvous kapal besar–tongkang | [S6] | Sumber false positive legal yang harus dikenali |
| Sistem fuzzy / jaringan saraf di perairan Indonesia | [S8][S9][S10] | Konteks lokal; detail metode tidak saya baca penuh |

---

## 2. Arsitektur pipeline

```
AIS mentah ─► S0 Persiapan & segmen ─► S1 Lapisan referensi (pelabuhan/anchorage, pesisir, cakupan)
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              ▼                                                               ▼
   S2A Kandidat ENCOUNTER (2 kapal)                              S2B Kandidat LOITERING (1 kapal)
   grid waktu 10 mnt, ≤500 m, ≥2 jam,                            SOG<2 kn, ≥8 jam, ≥20 nm dari pantai,
   median SOG<2 kn, ≥10 km dari anchorage                        hanya kapal berpotensi carrier
              │                                                               │
              └───────────────► S3 Gabung & de-duplikasi event ◄──────────────┘
                                              │
                                   S4 Fitur perilaku + kerapatan lalu lintas (Deng)
                                   S5 Klasifikasi tingkat kecurigaan (K-means / aturan)
                                   S6 Pengayaan bukti (peran kapal, gap, draught, kunjungan pelabuhan)
                                   S7 Filter kejadian legal/berisiko-salah (tug, bunkering, area STS resmi)
                                              ▼
                        transshipment_events + statistik + evaluasi (Bagian 10)
```

---

## 3. Data & prasyarat

Kolom minimum sama seperti `LOITERING_ALGORITHM.md` 3.1 (`mmsi, ts, lat, lon, sog, cog`).
Kolom/berkas **opsional yang sangat menentukan mutu**:

| Berkas/kolom | Fungsi | Tanpa itu |
|---|---|---|
| `ship_type` (AIS static), `imo`, `length`, `draught` | Peran kapal, filter tug/pilot, ukuran, bukti perubahan draught | Semua kapal diperlakukan setara |
| `data/coastline` (garis pantai) | Jarak dari pantai untuk loitering [S1] | Gunakan jarak ke pelabuhan sebagai proksi (turunkan klaim) |
| `data/ports.csv` (`name,lat,lon`) | Anchorage/pelabuhan | **Wajib**; jangan mengarang koordinat |
| `data/carriers.csv` (`mmsi,imo,name,role`) | Daftar kapal carrier/reefer/tanker berpotensi | S2B tidak dapat dibatasi ke kapal carrier |
| `data/stsareas.geojson` | Area STS/bunkering yang sah | Filter legal S7 tidak aktif |
| `data/eez.geojson` | Konteks EEZ/laut lepas [S1][S2] | Statistik EEZ dilewati |

Daftar carrier (reefer, *fish carrier*, *fish tender*) disusun peneliti dari daftar ITU dan RFMO, lalu ditambah kapal yang berulang kali bertemu kapal ikan dan divalidasi manual lewat pencarian web dan registri RFMO, serta klasifikasi perilaku dengan CNN [S1]. **Claude Code tidak boleh mengarang daftar ini**; tanyakan ke user sumbernya.
Karena carrier sering berganti bendera dan MMSI (694 kapal unik memakai 1.007 MMSI menurut [S1]), gunakan **nomor IMO** sebagai identitas lambung bila tersedia [S1].

---

## 4. Tahap S0 — Persiapan data dan segmen

Ikuti `LOITERING_ALGORITHM.md` 5.0–5.1 untuk partisi dan cleansing, dengan tambahan berikut.

1. **Cleansing dinamis** [S3]: buang pesan dengan MMSI ≠ 9 digit, SOG di luar [0, 102.3], COG di luar [0, 360], lon/lat di luar rentang, data kosong; buang kapal dengan < 10 pesan; urutkan berdasarkan waktu.
2. **Segmentasi** [S1]: untuk tiap MMSI, mulai segmen baru bila kombinasi jarak/waktu menyiratkan kecepatan tidak realistis **atau** selisih waktu > 24 jam. Segmen dijamin fisik mungkin dan menyingkirkan posisi salah akibat noise GPS atau transmisi tidak lengkap. Gunakan `v_imp_kn` dari `ANOMALY_ALGORITHM.md` bagian 4 dan `v_max_kn` di sana.
3. **Segmen tumpang-tindih** (satu MMSI dipakai beberapa kapal): pada algoritma encounter GFW, segmen yang tumpang-tindih disingkirkan kecuali segmen terpanjang [S4]. Terapkan aturan yang sama, atau kecualikan MMSI yang ditandai `MMSI_DUPLICATE` di modul A2 dokumen anomali.
4. **Partisi**: deteksi pasangan lintas-kapal **tidak bisa** dipartisi per MMSI. Partisi per **jendela waktu** (mis. 24 jam) dengan **tumpang-tindih margin** sebesar `max_event_h` di kedua sisi, lalu gabungkan kejadian ganda di S3 `[ADAPT]`.

---

## 5. Tahap S1 — Lapisan referensi

### 5.1 Anchorage / area pelabuhan

Kejadian di pelabuhan dan anchorage umum dikecualikan karena transshipment di pelabuhan lebih teregulasi, dan sulit membedakan pertemuan sungguhan dengan dua kapal yang kebetulan memakai anchorage yang sama [S1]. Peneliti menurunkan anchorage secara data-driven [S1]:

```
bagi dunia ke sel ±0.5° ; sel = anchorage jika >= 20 kapal unik (AIS) diam >= 12 jam sepanjang periode studi
batasi anchorage maksimal 10 km ke darat dari garis pantai (menghindari kapal lambat di perairan darat)
```
Implementasi `[ADAPT]`: definisikan "diam" sebagai `sog < stationary_kn` (paper tidak memberi angka; mulai 0.5 kn), hitung per kapal rangkaian diam ≥ 12 jam per sel, lalu hitung kapal unik per sel. Gabungkan dengan `ports.csv`. Alternatif berbasis DBSCAN untuk memisahkan kapal berlabuh dari yang hanyut dan kapal bersandar dijelaskan di [S6].

Radius pengecualian yang **berbeda antar sumber** — pilih dan laporkan:
- ≥ **10 km** dari anchorage [S1][S2][S4] (default `miller_gfw`).
- **1 nm** dari garis pantai dan lingkaran **1 nm** dari koordinat pelabuhan [S3].

### 5.2 Jarak dari pantai

Loitering memakai jarak ≥ **20 nm dari pantai** [S1]. Peneliti menganggapnya lebih membatasi daripada jarak dari anchorage [S1]. Butuh garis pantai; tanpa itu, pakai jarak ke pelabuhan terdekat dari `ports.csv` (BallTree haversine seperti di `LOITERING_ALGORITHM.md` 5.4) dan tandai `shore_proxy=True`.

### 5.3 Cakupan penerimaan

Gunakan `reception_ok(cell, hour)` dari `ANOMALY_ALGORITHM.md` A3. Kejadian yang titik pusatnya di sel tidak `reception_ok`, atau pada tepi jangkauan receiver, diberi `coverage_limited = True`. Alasannya: keterbatasan cakupan dan ketidakteraturan laju pesan membatasi kemampuan mendeteksi periode kontak panjang [S2].

---

## 6. Tahap S2 — Generasi kandidat

### 6.A Encounter (dua kapal)

Definisi dasar [S1][S2][S4]: dua kapal berada dalam **500 m** selama minimal **2 jam**, dengan **SOG median < 2 kn**, dan **≥ 10 km dari anchorage**.
Catatan variasi: versi awal memakai **≥ 3 jam**, ≥ 20 titik data, dan > 20 nm dari pantai [S12][S13]; STS minyak/kargo memakai **SOG < 1 kn** [S5]. Ketiganya tersedia sebagai profil (Bagian 9).

Karena pelaporan tidak teratur, posisi dihitung pada **grid waktu 10 menit** dengan interpolasi/ekstrapolasi memakai course & speed, sehingga kapal mungkin tidak persis dalam 500 m sepanjang durasi [S4]. Langkah:

```python
def grid_positions(seg, step="10min", extrap_max_min=30):
    """seg: satu segmen kapal terurut waktu -> posisi pada grid 10 menit."""
    t0, t1 = seg.ts.min().ceil(step), seg.ts.max().floor(step)
    grid = pd.date_range(t0, t1, freq=step)
    x = seg.ts.astype("int64").to_numpy() / 1e9
    g = grid.astype("int64").to_numpy() / 1e9
    lat = np.interp(g, x, seg.lat.to_numpy()); lon = np.interp(g, x, seg.lon.to_numpy())   # antimeridian: tangani jika relevan
    sog = np.interp(g, x, seg.sog.to_numpy())
    # ekstrapolasi <= extrap_max_min di ujung segmen memakai SOG/COG terakhir (GFW [S4]); [ADAPT] batas menit
    return pd.DataFrame({"mmsi": seg.mmsi.iloc[0], "slot": grid, "lat": lat, "lon": lon, "sog": sog})
```
Bila celah antar pesan > `max_interp_gap_min` `[ADAPT]`, jangan interpolasi lintas celah; biarkan slot kosong (kapal tidak dianggap hadir).

**Pencarian pasangan per slot** (hindari join kartesius). Dua opsi:
- `BallTree` haversine per slot `[ADAPT]` (skala menengah):
```python
from sklearn.neighbors import BallTree
R = max_dist_m / 1000 / EARTH_R_KM
for slot, g in grid.groupby("slot"):
    xy = np.radians(g[["lat", "lon"]].to_numpy())
    idx = BallTree(xy, metric="haversine").query_radius(xy, r=R)
    for i, js in enumerate(idx):
        for j in js:
            if g.mmsi.iat[i] < g.mmsi.iat[j]:
                pairs.append((slot, g.mmsi.iat[i], g.mmsi.iat[j], dist_m(...)))
```
- Indeks H3 (resolusi 9 ≈ 173 m rusuk) atau buffer + chip untuk data sangat besar, dengan catatan bahwa dua titik dalam ambang bisa jatuh di sel berbeda sehingga perlu buffer/ring tetangga [S7].

**Deteksi rangkaian (run)** per pasangan:
```python
pairs = pairs.sort_values(["a", "b", "slot"])
brk = pairs.groupby(["a", "b"]).slot.diff() > pd.Timedelta(minutes=step_min * (1 + max_slot_gap))
pairs["run"] = brk.groupby([pairs.a, pairs.b]).cumsum()
runs = pairs.groupby(["a", "b", "run"]).agg(t_start=("slot", "min"), t_end=("slot", "max"),
                                            n_slots=("slot", "size"), mean_dist_m=("dist_m", "mean"))
runs["duration_h"] = (runs.t_end - runs.t_start).dt.total_seconds() / 3600 + step_min / 60
```
Kemudian hitung `median_sog_a`, `median_sog_b` dari pesan asli/slot selama run, lalu tahan bila:
`duration_h >= min_duration_h`, `median SOG (kedua kapal) < speed_kn_lt`, `jarak titik tengah ke anchorage >= min_dist_anchorage_km`.
Toleransi celah antar slot (`max_slot_gap`) mengikuti gagasan penggabungan kejadian yang sama di [S3], yang menggabungkan kejadian berturut-turut bila selisih akhir–awal ≤ `I` menit (`I = 30` menit) `[S3]`.

**Ukuran kapal.** Posisi AIS adalah posisi antena, jadi jarak antar kapal besar lebih besar dari jarak lambung; ambang jarak kecil cenderung menyaring kapal besar [S3]. Bila `length` tersedia, aktifkan `size_aware` `[ADAPT]`: `d_ok = d_ab <= max_dist_m + (L_a + L_b)/2`.

**Kunci robustness** (analisis sensitivitas [S1], 48 kombinasi: SOG maks {1,2,4,6} kn, durasi min {2,6,10,12} jam, jarak maks {250,500,1000} m): total jam encounter paling sensitif terhadap **durasi minimum** pada rentang 6→10→12 jam (−30,2% dan −15,4%; rasio respons −0,46 dan −0,77) dan terhadap penurunan SOG maks 2→1 kn (−16,6%; rasio 0,33); perubahan lain memiliki rasio respons < 0,3 (mis. jarak 500→250 m −6,2%; 500→1000 m +7,8%) [S1]. Implementasikan modul sensitivitas (Bagian 10) dengan grid yang sama.

### 6.B Loitering (satu kapal)

Definisi [S1]: **kapal carrier** bergerak dengan **SOG < 2 kn selama ≥ 8 jam**, dan **≥ 20 nm dari pantai**. Tujuan: menangkap kasus ketika kapal ikan mitra tidak tampak di AIS (terlalu kecil, mematikan AIS) [S1]. Pertimbangan jarak dari pantai (bukan anchorage) karena loitering lebih spekulatif [S1].
Definisi operasional GFW saat ini: kecepatan rata-rata < 2 kn dan rata-rata ≥ 20 nm dari pantai; hanya kejadian > 1 jam yang ditampilkan di portal carrier [S4].

Implementasi: pakai `LOITERING_ALGORITHM.md` mode segmen (rangkaian pesan berurutan `sog < 2`), dengan parameter khusus: `min_duration_h = 8`, `dist_shore_nm >= 20`, dan batasi ke kapal dalam `carriers.csv` (atau `ship_type` kargo/tanker sebagai proksi `[ADAPT]`).
Catatan berbeda dengan aturan loitering trajektori Anda (rata-rata < 2 kn, > 2 jam, > 20 nm dari pelabuhan): durasi 2 jam vs 8 jam. Sensitivitas [S1]: total jam loitering hampir tidak berubah terhadap durasi minimum 2–10 jam (rasio −0,01 sampai −0,10) tetapi sangat sensitif terhadap SOG maks (2→1 kn: −41,9%, rasio 0,84), jadi **kecepatan lebih menentukan daripada durasi**.
Batasan yang harus dilaporkan: loitering **melebihi-estimasi** transshipment karena carrier juga menunggu tugas berikutnya atau menghindari zona berbahaya [S1], dan GFW menegaskan bisa berupa perawatan atau menunggu izin sandar [S4].

### 6.C Pasangan "gelap"

Encounter hanya terlihat bila **kedua** kapal terpantau. STS "gelap" (satu kapal mematikan AIS) tidak dapat ditemukan hanya dari AIS [S5]. Yang dapat dilakukan `[ADAPT]` (konsep [S5][S1]):
- tandai loitering carrier **tanpa pasangan** sebagai `dark_partner_candidate`;
- tandai encounter/loitering yang berdekatan dengan **AIS gap** kapal lain (`ANOMALY_ALGORITHM.md` A3) sebagai bukti tambahan;
- konfirmasi lewat citra satelit/SAR berada di luar cakupan pipeline ini [S5][S11].

---

## 7. Tahap S3–S7 — Penggabungan, penilaian, pengayaan, dan filter

### 7.1 S3 Penggabungan & de-duplikasi

- Gabungkan run bersebelahan untuk pasangan yang sama bila `t_start(next) − t_end(prev) ≤ I` (`I = 30` menit [S3]); ambil gabungan interval [S3].
- Hapus kejadian ganda di batas jendela waktu (Bagian 4 poin 4).
- Loitering yang **melingkupi** encounter dipertahankan sebagai event terpisah dengan `parent_event_id`; GFW mencatat bahwa loitering dan encounter dapat tumpang-tindih atau saling mencakup [S4].
- Atur identitas per **IMO** bila tersedia (Bagian 3).

### 7.2 S4 Fitur perilaku dan kerapatan lalu lintas [S3]

Untuk tiap event `E = {ma, mb, ts, te}`:

| Fitur | Definisi [S3] |
|---|---|
| `v1`, `v2` | rata-rata SOG masing-masing kapal (kn) selama event |
| `proximity` | jarak geodesik WGS-84 antara **posisi rata-rata** kedua kapal (m) |
| `duration` | `te − ts` (detik) |
| `TraD` (kerapatan) | jumlah kapal dalam **1 nm** dari titik pusat `C` (rata-rata lat/lon kapal `ma`) selama `[ts, te]`; **sparse** bila `td = 1`, **moderate** `1 < td ≤ 4`, **dense** bila lebih |

Interpretasi `[ADAPT]`: paper menyatakan `td = 1` berarti tidak ada kapal lain selain pasangan; hitung `others = jumlah MMSI unik (selain ma, mb)` dalam 1 nm, lalu `sparse: others = 0`, `moderate: 1–3`, `dense: ≥ 4`. Catat asumsi ini di `run_metadata.json`.

Alasan fitur kepadatan: aturan yang sama mudah terpenuhi kapal biasa di area lalu lintas padat (pelabuhan, alur pelayaran), sedangkan transshipment ilegal umumnya menghindari area itu karena pengawasan lebih ketat [S3]. Fitur ini menghindari penggambaran area khusus yang presisi [S3].

### 7.3 S5 Klasifikasi tingkat kecurigaan — pendekatan hibrida [S3]

**Tahap 1** memakai ambang **lebar** agar rendezvous sebanyak mungkin tertangkap (nilai di [S3] Tabel 3: `Td` 80 s, durasi min 1 menit, SOG maks 15 kn, jarak 500 m, `I` 30 menit). Ini profil `deng_wide`.
**Tahap 2** membedakan kejadian mirip transshipment dari sisanya secara unsupervised:

1. Hitung 4 fitur (`v1, v2, duration, proximity`).
2. Buang outlier per fitur di luar `[Q1 − 1,5·IQR, Q3 + 1,5·IQR]`; standardisasi z-score.
3. **K-means**; pilih `k` dengan metode elbow (SSE untuk k=1…9). Kedua wilayah pada [S3] memilih **k = 4**. Latih pada ±10.000 event acak (pola klaster stabil di atas jumlah itu [S3]).
4. Validasi pada set validasi: periksa apakah salah satu klaster memang memisahkan perilaku "dua kapal lambat, dekat, lama". Bila tidak, tambahkan lebih banyak event transshipment yang diketahui (boleh legal) atau perlebar ambang tahap 1 [S3].
5. Gabungkan peran klaster dengan kerapatan sesuai tabel:

| Tingkat | Kecepatan | Kedekatan | Durasi | Kerapatan |
|---|---|---|---|---|
| **High** | lebih lambat | lebih dekat | lebih lama | sparse |
| **Medium** | lebih lambat | lebih dekat | lebih lama | moderate |
| **Medium** | lebih lambat | lebih dekat | lebih singkat | sparse |
| **Medium** | sedikit lebih cepat | lebih dekat | lebih lama | sparse |
| **Low** | lebih lambat, dekat, lama | — | — | dense |
| **Low** | semua kombinasi lain | | | |

Penentuan "lebih lambat/dekat/lama" bersifat **relatif antar klaster** dalam satu wilayah [S3], sehingga klaster berlabel *High* di Rizhao punya kecepatan rata-rata ±5,7 kn sedangkan di Brest ±0,4 kn [S3 Tabel 4 & 9]. Implementasi `[ADAPT]`: hitung peringkat centroid tiap klaster pada speed (`max(v1,v2)`), proximity, duration; beri label `slower/slightly_faster/faster`, `closer/farther`, `longer/shorter` berdasarkan peringkat relatif, simpan `cluster_profile.csv`, dan sediakan `manual_core_clusters` di config agar user dapat mengoreksi. **Wajib tampilkan `cluster_profile.csv` ke user** sebelum menghitung tingkat.

Sanity check hasil [S3]: proporsi kejadian pada validasi ≈ **High 0,24–0,55%**, **Medium 5,9–9,8%**, **Low 89,7–93,9%** dari event tahap 1 (Brest dan Rizhao). Jika data Anda menghasilkan proporsi sangat berbeda (mis. High > 5%), periksa dahulu ambang tahap 1 dan filter tipe kapal, bukan langsung menyimpulkan banyak transshipment. Catatan: nilai absolut di paper tidak dapat dibandingkan karena wilayah, periode, dan frekuensi AIS berbeda.

**Filter tipe kapal:** tidak dibatasi saat **pelatihan** klaster (agar proporsi kejadian nyata cukup untuk dipisahkan, karena tug/pilot melakukan transfer legal), tetapi **dikeluarkan pada uji/produksi** [S3]. Daftar tipe yang dikeluarkan [S3]: tug, pilot vessel, towing, dredging/underwater ops, law enforcement, SAR, wing-in-ground, medical transport, military ops. Pemetaan ke kode AIS ship type (ITU-R M.1371) `[ADAPT]`: 52 tug, 50 pilot, 31/32 towing, 33 dredging/underwater ops, 55 law enforcement, 51 SAR, 20–29 WIG, 58 medical, 35 military.

Alternatif ringan untuk `k-means` `[ADAPT]`: skor kecurigaan fuzzy atas 4 fitur + kerapatan; sistem fuzzy tipe-1/2 dan jaringan saraf sudah dieksplorasi untuk perairan Indonesia [S8][S9][S10], namun detail model tidak saya baca sehingga tidak diimplementasikan di sini.

### 7.4 S6 Pengayaan bukti (tidak mengubah klasifikasi, hanya menambah kolom)

Semua bertag `[ADAPT]` kecuali disebut:

| Bukti | Sumber gagasan | Catatan |
|---|---|---|
| `role_pair` (carrier–fishing, tanker–tanker, cargo–cargo) | [S1][S5] | Butuh `carriers.csv`/`ship_type`; STS dibagi *Cargo* vs *Tanker* [S5] |
| `draught_change` (perubahan draught sebelum/sesudah event) | contoh kasus di [S5] (draught kapal berubah 0,6 m sekitar dua jam setelah transfer) | Draught adalah data statis yang diisi manual awak; tidak andal, gunakan hanya sebagai penguat |
| `ais_gap_near_event` | [S5] | Dari A3 dokumen anomali |
| `next_port_after` (pelabuhan yang dikunjungi setelah event) | [S1][S4] (portal GFW memfilter kunjungan berikutnya) | Diperlukan untuk melihat rantai pasok; [S1] menemukan carrier di ZEE Rusia selalu memasuki pelabuhan Rusia sebelum ke pelabuhan asing |
| `flag_pair` (dari 3 digit awal MMSI) | [S1] | MID = 3 digit awal = negara bendera |
| `zone` (ZEE / laut lepas / dekat batas ZEE) | [S1][S2] | Butuh `eez.geojson`; transshipment terkonsentrasi di dekat batas ZEE |

### 7.5 S7 Filter kejadian legal atau berisiko-salah

- **Tugas legal:** kapal tunda/pandu dan sejenisnya dikeluarkan pada tahap produksi (7.3) [S3]. Pada [S3], enam kejadian legal yang melibatkan tug semuanya tertangkap (lima High/Medium, satu Low karena durasi singkat dan ada kapal lain di sekitar). Ini menunjukkan metode menandai aktivitas serupa, sehingga **jangan menafsirkan `High` sebagai ilegal**.
- **Bunkering:** rendezvous antara kapal samudra yang berlabuh/sandar dan tongkang bunker adalah aktivitas lazim; [S6] mendeteksinya dengan DBSCAN sebagai rendezvous kapal berlabuh/sandar dengan tongkang bunker calon. Beri label `bunkering_candidate` bila salah satu kapal tanker kecil di dekat anchorage/berth `[ADAPT]`.
- **Area STS resmi** (`stsareas.geojson`): tandai `in_designated_sts_area` bila user menyediakannya.
- **Sekitar pelabuhan/anchorage:** dikecualikan dari awal (5.1).
- **Kepadatan lalu lintas:** area alur padat menghasilkan banyak kandidat semu; itu alasan `TraD` [S3]. Pada dua dataset [S3], sekitar 61,4% dan 80,1% identifikasi ambang tetap muncul di area dengan kepadatan lalu lintas lebih tinggi.

---

## 8. Statistik dan keluaran

`output/transshipment/`:

| Berkas | Isi |
|---|---|
| `funnel.csv` | Jumlah tiap tahap: pesan → segmen → slot grid → pasangan → run → lolos aturan → setelah filter tipe → tingkat High/Medium/Low |
| `events_encounter.csv` | `event_id, mmsi_a, mmsi_b, imo_a, imo_b, t_start, t_end, duration_h, lat, lon, v1, v2, proximity_m, td_others, cluster, level, coverage_limited, profile` |
| `events_loitering.csv` | `event_id, mmsi, t_start, t_end, duration_h, avg_sog, dist_shore_nm, lat, lon, dark_partner_candidate, overlaps_encounter_id` |
| `evidence.csv` | Bukti tambahan per event (Bagian 7.4) |
| `cluster_profile.csv` | Centroid & peran tiap klaster (Bagian 7.3) |
| `stats_summary.json` | Total event per jenis, kapal unik (per IMO/MMSI), durasi rata-rata/median/p90 (dibandingkan ±11,6 jam rata-rata dan 7,3 jam median pada [S2] hanya sebagai orientasi), rasio loitering:encounter, % `coverage_limited` |
| `stats_by_month.csv`, `stats_by_grid.csv` | Tren dan hotspot (sel 0.5° atau H3) |
| `stats_by_pair.csv`, `stats_by_flag_pair.csv` | Matriks pasangan carrier–donor dan bendera |
| `stats_by_zone.csv` | ZEE/laut lepas (bila `eez.geojson` ada) |
| `sensitivity.csv` | Hasil grid sensitivitas (Bagian 10) |
| `coverage_map.parquet` | Sel `reception_ok` per jam |
| `run_metadata.json` | Config hash, profil, rentang data, asumsi `[ADAPT]` yang dipakai |

Peta cakupan **wajib** ada sebelum angka statistik dilaporkan ke user; tanpa itu, tidak ada cara membedakan "tidak ada transshipment" dari "tidak terpantau".

---

## 9. `config.yaml` (tambahan)

```yaml
transshipment:
  profile: miller_gfw            # miller_gfw | miller_early | sts_oil | deng_wide
  step_min: 10                   # [S4]
  extrap_max_min: 30             # [ADAPT]
  max_interp_gap_min: 60         # [ADAPT]
  max_slot_gap: 1                # [ADAPT]; toleransi celah antar slot
  size_aware: false              # [ADAPT]
  max_event_h: 48                # [ADAPT] margin jendela waktu

  profiles:
    miller_gfw:                  # [S1][S2][S4]
      encounter: {max_dist_m: 500, min_duration_h: 2.0, median_sog_kn_lt: 2.0, min_dist_anchorage_km: 10}
      loitering: {sog_kn_lt: 2.0, min_duration_h: 8.0, min_dist_shore_nm: 20}
    miller_early:                # [S12][S13] varian awal
      encounter: {max_dist_m: 500, min_duration_h: 3.0, median_sog_kn_lt: 2.0, min_points: 20, min_dist_shore_nm: 20}
      loitering: {sog_kn_lt: 2.0, min_duration_h: 8.0, min_dist_shore_nm: 20}
    sts_oil:                     # [S5]
      encounter: {max_dist_m: 500, min_duration_h: 2.0, sog_kn_lt: 1.0}
    deng_wide:                   # [S3] tahap 1 + klasifikasi tahap 2
      encounter: {max_dist_m: 500, min_duration_min: 1, sog_kn_max: 15, merge_gap_min: 30,
                  td_s: 80,        # [PARAM] tentukan dari frekuensi pesan data Anda
                  near_shore_nm: 1, near_port_radius_nm: 1}

  anchorage:                     # [S1] turunan data
    cell_deg: 0.5
    min_unique_vessels: 20
    min_stationary_h: 12
    stationary_kn: 0.5           # [ADAPT]
    max_inland_km: 10

  stage2:                        # [S3]
    features: [v1, v2, duration, proximity]
    iqr_k: 1.5
    k_range: [1, 9]
    k_default: 4
    train_sample: 10000
    density_radius_nm: 1
    density_bins: {sparse: 0, moderate: [1, 3], dense: 4}     # others = jumlah kapal lain (interpretasi [ADAPT])
    manual_core_clusters: null
    exclude_ship_types: [52, 50, 31, 32, 33, 55, 51, 58, 35, "20-29"]   # [S3] pemetaan kode [ADAPT]
    train_on_all_types: true

  sensitivity:                   # [S1]
    encounter_grid: {sog_kn: [1, 2, 4, 6], min_duration_h: [2, 6, 10, 12], max_dist_m: [250, 500, 1000]}
    loitering_grid: {sog_kn: [1, 2, 3, 4, 5, 6], min_duration_h: [2, 4, 6, 8, 10]}

  filters:
    bunkering: {enabled: true}   # [S6] konsep; angka [ADAPT]
    designated_sts_areas: data/stsareas.geojson
```

---

## 10. Evaluasi

1. **Tidak ada ground truth publik.** Peneliti [S1] menyatakan data regional tentang transshipment sulit diperoleh atau berkualitas rendah sehingga tidak dapat dipakai untuk melatih/menguji model; hasil dilaporkan sebagai jumlah kejadian dari heuristik. Perlakukan hasil Anda sama.
2. **Analisis sensitivitas** (wajib): jalankan grid Bagian 9 dan hitung **rasio respons** = `% perubahan total jam kejadian ÷ % perubahan parameter` [S1]. Nilai mendekati 0 = tidak sensitif; mendekati ±1 atau lebih besar = sangat sensitif. Laporkan ke user parameter mana yang mendominasi (pada [S1]: durasi min. encounter dan SOG maks).
3. **Validasi eksternal bila data tersedia:** laporan pengamat RFMO atau deklarasi transshipment resmi. Sebagai orientasi, [S2] melaporkan durasi rata-rata event AIS ±11,6 jam (median 7,3 jam) mendekati ±9,5 jam pada dokumentasi transshipment, dan analisis GFW terhadap data pengamat ICCAT 2017–2018 melaporkan transfer nyata rata-rata cepat (median 132,5 menit) dan sebagian besar < 6 jam [S12, hanya cuplikan]. Interpretasi saya `[ADAPT]`: ambang durasi 2 jam berada di sekitar median transfer nyata pada data pengamat tersebut, sehingga kejadian lebih singkat kemungkinan terlewat; ini belum diuji pada data Anda.
4. **Kejadian legal yang diketahui:** uji apakah kejadian legal (mis. operasi tug, bunkering resmi) terklasifikasi sesuai harapan, seperti enam kasus pada [S3] Tabel 13.
5. **Perbandingan ambang tetap vs adaptif** [S3]: pastikan seluruh event dari profil `miller_gfw` juga termasuk dalam kandidat tahap 1 `deng_wide` (pada [S3], semua event ambang tetap tercakup).
6. **Proksi presisi tanpa label:** persentase event `High` di area padat (harus kecil), di dekat pelabuhan, dan yang mendapat bukti tambahan (gap, draught, kunjungan pelabuhan).
7. **Review pakar** pada sampel per tingkat; opsional verifikasi citra optik/SAR untuk sampel kecil [S5][S11].

---

## 11. Uji unit (data sintetis, wajib lulus)

Pelabuhan/anchorage uji di (0, 0); gunakan `v_imp` valid agar segmen tidak terpecah.

| Kasus | Ekspektasi |
|---|---|
| Dua kapal 300 m, SOG 1 kn, 2,5 jam, 30 km dari anchorage | `encounter` (profil `miller_gfw`) |
| Sama, tetapi 600 m | bukan encounter di `miller_gfw`; masuk kandidat di `deng_wide` (level ditentukan Tahap 2) |
| Durasi 1,5 jam | bukan encounter |
| Median SOG 3 kn | bukan encounter `miller_gfw`; bukan `sts_oil` |
| SOG 1,5 kn, 2,5 jam | encounter `miller_gfw`, bukan `sts_oil` (butuh < 1 kn) |
| 8 km dari anchorage | dikecualikan |
| Celah 2 slot di tengah rangkaian, `max_slot_gap=1` | terpecah jadi 2 run; digabung bila `max_slot_gap ≥ 2` atau selisih ≤ `I` |
| Event melintas batas jendela 24 jam | tercatat **satu** event (bukan dua) |
| Salah satu kapal bertipe 52 (tug) | dikeluarkan di produksi; tetap ada di set pelatihan klaster |
| Carrier 9 jam < 2 kn, 25 nm dari pantai | `loitering` |
| Sama, 6 jam | bukan loitering (`miller_gfw`) |
| Sama, 15 nm dari pantai | bukan loitering |
| Loitering carrier tanpa kapal lain dalam 500 m | `dark_partner_candidate = True` |
| Event dengan 5 kapal lain dalam 1 nm | `dense` → `Low` |
| Dua segmen tumpang-tindih satu MMSI | hanya yang terpanjang dipakai untuk pasangan |
| Rasio respons: 100% naik parameter, hasil naik 42% | `0,42`; uji fungsi terhadap contoh [S1]: SOG 2→1 kn pada loitering menurunkan 41,9%, rasio 0,84 |
| Distribusi tingkat: proporsi `High` pada data sintetis | sesuai jumlah event sisipan yang dirancang |

---

## 12. Batasan dan catatan verifikasi sumber (wajib dilaporkan ke user)

1. **Cakupan receiver adalah batas atas kemampuan deteksi.** Semua metode berbasis AIS di sini bergantung pada kedua kapal terpantau; peneliti mencatat cakupan satelit yang tidak lengkap dan laju pelaporan yang tidak konsisten membatasi kemampuan mendeteksi kontak panjang [S2]. Kapal kecil mungkin tidak memakai AIS atau mematikannya [S1]. Receiver terestrial regional hanya melihat perairan dekat pantai, sedangkan lokasi transshipment terkonsentrasi di laut lepas dan dekat batas ZEE [S1]; jangan menyimpulkan "tidak ada transshipment" dari ketiadaan kejadian.
2. **Angka absolut ambang lapisan referensi banyak yang `[ADAPT]`** (mis. definisi "diam" untuk anchorage, ekstrapolasi maksimum, batas interpolasi, ukuran jendela waktu).
3. **Sumber yang dibaca penuh:** [S1], [S3], [S5], [S7]. **Hanya abstrak/cuplikan:** [S2], [S4], [S6], [S8]–[S13]. Detail metode fuzzy/NN Indonesia [S8]–[S10] tidak saya baca; jangan mengimplementasikannya dari dokumen ini.
4. [S12] adalah analisis portofolio pribadi seorang penulis makalah [S1] (bukan tinjauan sejawat), dan situsnya menolak akses otomatis sehingga hanya cuplikan hasil pencarian yang saya lihat. [S7] adalah blog teknis; [S13] adalah laporan LSM. Tanda ini dilampirkan pada tabel sumber.
5. **Klaster K-means bersifat relatif per wilayah**; hasil satu wilayah tidak boleh dipindah ke wilayah lain tanpa melatih ulang, dan label *High/Medium/Low* tidak berarti legal/ilegal [S3].
6. Tabel 4 dan 9 pada [S3] memuat kolom durasi berlabel "(knot)" dengan nilai rata-rata/simpangan yang tidak konsisten satuannya; perlakukan sebagai kesalahan penulisan dan gunakan detik untuk durasi.
7. Ambang encounter berbeda antar publikasi (2 jam vs 3 jam; 10 km dari anchorage vs 20 nm dari pantai) [S2][S12][S13]; itulah alasan adanya profil dan modul sensitivitas.

---

## 13. Sumber

| ID | Sumber | Tautan | Dipakai untuk | Jenis/keterbacaan |
|---|---|---|---|---|
| S1 | Miller NA, Roan A, Hochberg T, Amos J, Kroodsma DA. *Identifying Global Patterns of Transshipment Behavior.* Front. Mar. Sci. 5:240 (2018), doi:10.3389/fmars.2018.00240 | https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2018.00240/full | Encounter & loitering, segmentasi, anchorage, sensitivitas, daftar carrier | Jurnal; **dibaca penuh** |
| S2 | Boerder K, Miller NA, Worm B. *Global hot spots of transshipment of fish catch at sea.* Science Advances 4(7):eaat7159 (2018), doi:10.1126/sciadv.aat7159 | https://www.science.org/doi/10.1126/sciadv.aat7159 · https://pmc.ncbi.nlm.nih.gov/articles/PMC6059759/ | Definisi "likely encounter", batasan cakupan, durasi rata-rata | Jurnal; abstrak/cuplikan metode |
| S3 | Deng L, Niu Y, Jia L, Liu W, Zang Y. *A Hybrid Rule-Based and Data-Driven Approach to Illegal Transshipment Identification with Interpretable Behavior Features.* Sensors 22(24):9581 (2022), doi:10.3390/s22249581 | https://pmc.ncbi.nlm.nih.gov/articles/PMC9785623/ | Aturan lebar, K-means, kerapatan lalu lintas, tingkat kecurigaan, filter tipe kapal | Jurnal; **dibaca penuh** |
| S4 | Global Fishing Watch — FAQ *What is a vessel encounter?*, *What is a loitering event?*; API *Data Caveats*; catatan rilis pipeline v3 | https://globalfishingwatch.org/faqs/what-is-a-vessel-encounter/ · https://globalfishingwatch.org/faqs/what-is-loitering-event/ · https://globalfishingwatch.org/our-apis/documentation/docs/v3/general-api-doc/data-caveats · https://globalfishingwatch.org/faqs/2024-aug-new-release-in-our-ais-data-pipeline-version-3/ | Grid 10 menit, definisi operasional, segmen tumpang-tindih | Dokumentasi resmi; cuplikan |
| S5 | Ballinger O. *Automatic Detection of Dark Ship-to-Ship Transfers Using Deep Learning and Satellite Imagery.* arXiv:2404.07607 (2024) | https://arxiv.org/abs/2404.07607 | STS ≥ 2 jam, ≤ 500 m, SOG < 1 kn; *STS Cargo/Tanker*; transfer gelap; contoh draught | Preprint; **dibaca penuh** |
| S6 | Fuentes G. *Generating bunkering statistics from AIS data: A machine learning approach.* Transportation Research Part E 155:102495 (2021), doi:10.1016/j.tre.2021.102495 | https://www.sciencedirect.com/science/article/pii/S136655452100257X | Bunkering sebagai rendezvous; DBSCAN untuk kapal berlabuh/hanyut | Jurnal; abstrak |
| S7 | Roest T. *Ship to Ship Transfer Detection.* Medium (26 Jul 2022); kode: github.com/databrickslabs/mosaic | https://medium.com/@timo.roest/ship-to-ship-transfer-detection-b370dd9d43e8 | Skala: indeks H3 res. 9, buffer, agregasi garis 15 menit, membuang area pelabuhan | **Blog teknis**; dibaca penuh |
| S8 | Masroeri AA, Aisjah AS, Agam V, Pradenta M, Samudya MA. *Analysis of fuzzy logic systems types 1 and 2 in identifying of IUU fishing and transshipment: a case study in Indonesia's vulnerable waters.* IOP Conf. Ser.: Earth Environ. Sci. 972:012060 (2022), doi:10.1088/1755-1315/972/1/012060 | https://iopscience.iop.org/article/10.1088/1755-1315/972/1/012060 | Konteks Indonesia (fuzzy) | Prosiding; cuplikan |
| S9 | Damastuti N, Aisjah A, Masroeri AA. *Illegal, Unreported and Unregulated (IUU) Fishing and Transshipment Identification System Design Towards a Resilient Indonesian Marine.* J. ETA Maritime Science (2025), nomor artikel jems.2025.04935 (DOI lengkap belum saya verifikasi) | https://jemsjournal.org/articles/illegal-unreported-and-unregulated-iuu-fishing-and-transshipment-identification-system-design-towards-a-resilient-indonesian-marine/doi/jems.2025.04935 | Konteks Indonesia (fuzzy tipe-2; akurasi dilaporkan 75,5–85,04%) | Jurnal; cuplikan |
| S10 | *Using the Artificial Neural Network Approach to Develop an Illegal, Unregulated, Unreported Transshipment System Under Consideration of the Effects of Wind in Banda Water.* Springer (bab buku) | https://link.springer.com/chapter/10.1007/978-3-032-15470-5_7 | Konteks Indonesia (NN; akurasi 98,726% vs fuzzy tipe-2 91,67%; uji lapangan 80,92%) | Bab buku; hanya cuplikan (akses berlangganan) |
| S11 | *Detecting Ship-to-Ship Transfer by MOSA: Multi-Source Observation Framework with SAR and AIS.* Remote Sensing 18(3):473 (2026) | https://www.mdpi.com/2072-4292/18/3/473 | Verifikasi transfer dengan SAR+AIS; keterbatasan AIS | Jurnal; cuplikan |
| S12 | Miller NA. *ICCAT Observer Data Comparison 2017-2018* (analisis portofolio) | https://www.nate-a-miller.com/portfolio/iccat_transshipment_analysis_2017_2018/ | Durasi transfer nyata (median 132,5 menit), validasi terhadap data pengamat | **Analisis pribadi, bukan sejawat; hanya cuplikan pencarian** (situs menolak akses otomatis) |
| S13 | Oceana. *Transshipping Exposed* (laporan); GFW blog *Identifying Transshipment From the Data* | https://usa.oceana.org/wp-content/uploads/sites/4/oceana_transshipping_exposed_report_final_0.pdf · https://globalfishingwatch.org/data/identifying-transshipment-from-the-data/ | Varian awal: ≥ 3 jam, ≥ 20 titik, > 20 nm dari pantai | Laporan LSM/blog resmi; cuplikan |
| S14 | Kroodsma DA dkk. *Tracking the global footprint of fisheries.* Science 359:904–908 (2018), doi:10.1126/science.aao5646 | https://doi.org/10.1126/science.aao5646 | Pipeline AIS & klasifikasi perilaku kapal (dirujuk oleh [S1]) | **Tidak dibaca**; pointer |
| S15 | Global Fishing Watch repos: `pipe-events`, `pipe-encounters` | https://github.com/GlobalFishingWatch/pipe-events · https://github.com/GlobalFishingWatch | Implementasi referensi (terbuka) | **Tidak dibaca**; pointer |
| S16 | Bernabé P dkk. *Detecting Intentional AIS Shutdown in Open Sea Maritime Surveillance Using Self-Supervised Deep Learning.* IEEE Trans. Intell. Transp. Syst. (2023), doi:10.1109/TITS.2023.3322690 | https://doi.org/10.1109/TITS.2023.3322690 | Pointer AIS dimatikan sengaja (dirujuk oleh [S5] dan makalah ICEREAM) | **Tidak dibaca**; pointer |
| S17 | Kumar S, Muhal H, Chaudhary I, Dabas K. *Identification of IUU transshipment activity using AIS data.* INCET 2022 | (dirujuk oleh [S5]) | Pointer | **Tidak dibaca**; pointer |

---

## 14. Checklist implementasi (urut)

- [ ] 1. Inspeksi data; konfirmasi kolom opsional (`ship_type`, `imo`, `length`, `draught`); tanyakan ke user: `ports.csv`, `carriers.csv`, garis pantai, area STS resmi, EEZ.
- [ ] 2. S0: cleansing, segmentasi (jarak/waktu tidak realistis atau > 24 jam), partisi per jendela waktu dengan margin.
- [ ] 3. S1: derivasi anchorage + jarak pantai + **peta cakupan** (Bagian 5.3). Tampilkan ke user.
- [ ] 4. S2A: grid 10 menit, pasangan per slot, run, filter aturan (profil `miller_gfw`). Uji dengan Bagian 11.
- [ ] 5. S2B: loitering carrier (8 jam, 20 nm) dan `dark_partner_candidate`.
- [ ] 6. S3: penggabungan & de-duplikasi; identitas per IMO.
- [ ] 7. Modul sensitivitas (grid [S1]); tampilkan rasio respons.
- [ ] 8. Statistik & ekspor (Bagian 8) untuk profil `miller_gfw` dan `sts_oil`.
- [ ] 9. Tahap 2 hibrida (`deng_wide`): fitur, K-means + elbow, `cluster_profile.csv` → **konfirmasi user** → tingkat kecurigaan + kerapatan lalu lintas.
- [ ] 10. Pengayaan bukti (7.4) dan filter legal (7.5).
- [ ] 11. Evaluasi (Bagian 10) dan laporan batasan (Bagian 12).
