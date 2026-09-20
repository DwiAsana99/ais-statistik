# ANOMALY_ALGORITHM.md — Deteksi Anomali Data AIS (berbasis riset, dengan sumber)

> **Untuk Claude Code.** Spesifikasi kerja untuk `D:\Project\ais-statistik` (Windows, gunakan `pathlib`).
> Melengkapi `LOITERING_ALGORITHM.md`: tahap cleansing/partisi/ekstraksi trajektori (bagian 5.0–5.2 di sana) **dipakai ulang**;
> deteksi loitering di sana menjadi modul **A5** di dokumen ini.
> Disusun 20 September 2026 dari riset literatur (Bagian 12). Baca Bagian 0 dan 11 sebelum menulis kode.

---

## 0. Aturan kerja & cara membaca tag

1. Kerjakan bertahap: **Fase 1 (aturan, Bagian 5)** → **Fase 2 (statistik/unsupervised ringan, Bagian 6)** → **Fase 3 (deep, Bagian 7, hanya bila diminta)**.
2. Semua ambang di `config.yaml` (Bagian 9). Tidak ada angka hardcode di kode.
3. Setiap ambang/aturan punya tag asal:
   - **`[S#]`** = berasal dari sumber di Bagian 12 (nomor sumber).
   - **`[ADAPT]`** = usulan/default **saya**, *bukan* dari paper. Sumber hanya memberi konsep; angkanya harus dikalibrasi.
   - **`[PARAM]`** = wajib dituning dari data user; jangan klaim "sesuai paper".
4. Dokumen ini **tidak** berisi label kebenaran (ground truth). Hasil detektor = **"kandidat anomali secara statistik/aturan"**, bukan bukti pelanggaran.
   Semua keluaran wajib memuat kolom `evidence` dan `detector` dan diberi status `candidate`.
5. **Jangan membuang titik mencurigakan saat cleansing.** Untuk lapisan A, titik "lompat"/tidak masuk akal *adalah sinyalnya*. Simpan dua versi data: `raw_flagged` (dipakai lapisan A) dan `clean` (dipakai lapisan B untuk belajar normalitas).
6. Skala: partisi per MMSI seperti di `LOITERING_ALGORITHM.md` 5.0. Deteksi lintas-kapal (A2 duplikasi identitas, A6 encounter, A8 korroborasi) memerlukan indeks waktu/ruang — kerjakan per potongan waktu (mis. per hari), bukan per partisi MMSI.
7. Sebelum lanjut ke tahap berikutnya, tampilkan ke user: jumlah flag per detektor, contoh 10 kejadian, dan distribusi skor.

---

## 1. Taksonomi anomali (kerangka)

Riveiro dkk. (dikutip via review Ribeiro 2023 [S15]) membagi anomali maritim menjadi: **positional**, **contextual**, **kinematic**, **complex**, dan **data-related**.
Chandola dkk. (dikutip di [S10]) membagi: **point**, **contextual**, **collective**.
Li dkk. [S8] mengelompokkan anomali kinematik AIS menjadi **Speed & Course Anomaly (SCA)**, **Turning Anomaly (TA)**, **Loitering Anomaly (LA)**.

Pemetaan ke modul:

| Kelas | Modul | Sumber utama |
|---|---|---|
| Data-related / integritas | A0 kualitas, A1 lompatan & kecepatan tidak wajar, A2 duplikasi MMSI | [S6][S7][S11][S14] |
| Data-related / perilaku | A3 AIS gap ("dark") | [S3][S4][S18] |
| Kinematic | A4 SCA & TA, A5 loitering | [S8][S5] |
| Interaksi antar-kapal | A6 encounter / rendezvous | [S5] |
| Contextual | A7 konsistensi status/tipe vs perilaku, B1 per-konteks | [S10] |
| Positional / collective (pola normal) | B1 fitur+Isolation Forest, B2 normalitas per-sel + a contrario, B3 deep | [S1][S2][S9][S10][S11] |
| Korroborasi | A8 (lompatan multi-kapal → GNSS interference) | [S7] |

---

## 2. Arsitektur berlapis

```
AIS mentah ──► [Cleansing dasar, LOITERING_ALGORITHM 5.1] ──► raw_flagged (jangan buang lompatan)
                                   │
        ┌──────────────────────────┴───────────────────────────┐
        ▼                                                      ▼
 LAPISAN A: aturan (interpretable)                     clean (buang titik error, resample)
 A0 kualitas  A1 jump/kecepatan  A2 MMSI ganda               │
 A3 gap       A4 SCA/TA          A5 loitering                 ▼
 A6 encounter A7 konteks         A8 korroborasi        LAPISAN B: normalitas (unsupervised)
        │                                              B1 fitur + Isolation Forest per konteks
        │                                              B2 sel-grid + a contrario (GeoTrackNet-lite)
        │                                              B3 (opsional) GeoTrackNet / autoencoder
        └──────────────► FUSI & TRIASE (Bagian 8) ◄────────────┘
                                   ▼
                    anomaly_events + statistik + evaluasi (Bagian 10)
```

Alasan dua lapisan: metode berbasis aturan mudah dijelaskan tetapi tidak bisa mendaftar semua perilaku abnormal dan istilah seperti "cepat/lambat" relatif;
metode berbasis pembelajaran mengatasi itu tetapi tidak bisa dijelaskan langsung dan cenderung menandai hal yang "tidak biasa" tanpa tentu "mencurigakan" [S1].

---

## 3. Data & prasyarat

Kolom minimum sama seperti `LOITERING_ALGORITHM.md` 3.1 (`mmsi, ts, lat, lon, sog, cog`).
Kolom **opsional yang sangat meningkatkan mutu**:

| Kolom | Dipakai oleh |
|---|---|
| `nav_status`, `ship_type` (static data AIS msg 5/24) | A7, B1 (konteks) |
| `heading` (true heading), `rot` | A4 |
| `receiver_id` / koordinat receiver | A3 (kualitas penerimaan) |

File pendukung:
- `data/ports.csv` (`name,lat,lon`) — wajib untuk A5/A6, tanyakan ke user bila tidak ada (jangan mengarang).
- `data/receivers.csv` (`receiver_id,name,lat,lon`) — untuk A3. Data dari receiver terestrial punya jangkauan terbatas (lihat A3).
- `data/coastline` atau daftar area terlarang/EEZ — hanya bila user memintanya (tidak diperlukan pipeline inti).

---

## 4. Definisi & utilitas bersama

```python
KM_PER_NM = 1.852
EARTH_R_KM = 6371.0088

def step_features(df):                    # df sudah terurut per (mmsi, ts)
    g = df.groupby("mmsi", sort=False)
    df["dt_s"]  = g["ts"].diff().dt.total_seconds()
    df["d_km"]  = haversine_km(g["lat"].shift(), g["lon"].shift(), df["lat"], df["lon"])
    ok = df["dt_s"] >= cfg.jump.min_dt_s
    df["v_imp_kn"] = np.where(ok, df["d_km"] / KM_PER_NM / (df["dt_s"] / 3600), np.nan)   # kecepatan tersirat [S11]
    return df
```

`v_imp_kn` (kecepatan tersirat dari jarak haversine / selisih waktu) adalah dasar A1, A2, A3.
Untuk COG gunakan **statistik sirkular** (`scipy.stats.circstd`, selisih sudut `((a-b+180)%360)-180`), bukan std biasa.

---

## 5. FASE 1 — Lapisan A (aturan)

### A0. Kualitas & identitas sah

- Tandai (jangan buang) `mmsi` bukan 9 digit, `lat/lon` di luar rentang, `sog >= 102.3`, `cog >= 360` (nilai "tidak tersedia").
- **MMSI placeholder:** MMSI berakhiran `000000` atau `999999` dan/atau label generik (mis. "NATO SHIP") dikeluarkan dari analisis lompatan karena tidak unik [S7].
- Untuk lapisan B (pembelajaran normalitas) buat `clean`: hapus SOG tak valid, potong `sog` maks 30 kn [S1], dan (opsional) buang pesan pada status moored/anchored serta dalam 1 nm dari garis pantai bila fokusnya lalu lintas laut lepas [S12].

### A1. Lompatan posisi & kecepatan tidak wajar

Berdasarkan pola "teleportasi" dan ketidaksesuaian SOG yang dilaporkan vs kecepatan tersirat [S11][S14][S6]:

```python
c = cfg.jump
ok = df.dt_s >= c.min_dt_s
df["f_jump"] = ok & (df.d_km >= c.min_jump_km) & (df.v_imp_kn > c.v_max_kn)                 # [ADAPT] angka
df["f_sog_mismatch"] = (ok & (df.dt_s <= c.mismatch_max_dt_s) & (df.d_km >= c.min_jump_km)
                        & ((df.sog - df.v_imp_kn).abs() > c.mismatch_tol_kn))                # konsep [S11], angka [ADAPT]
```

Klasifikasi lanjutan (tiap jump diberi satu label):
1. **`isolated_outlier`** — titik i melompat dari i−1, lalu i+1 kembali dekat i−1 (A→B→A). Kemungkinan satu pesan rusak; keluarkan dari `clean`.
2. **`single_axis`** — perpindahan hampir seluruhnya di satu sumbu (Δlat atau Δlon), sumbu lain ≈ 0. Kemungkinan kesalahan dekode/transmisi satu komponen koordinat; SeaSpoofFinder menyaringnya secara konservatif [S7]. Ambang rasio `[ADAPT]`.
3. **`persistent_shift`** — kapal bertahan di lokasi baru (≥ N pesan) → kandidat spoofing/GNSS interference/identitas ganda → teruskan ke A2/A8.

Aksesori: kejadian dengan `dt_s` sangat besar bukan jump tetapi **gap** → A3.

### A2. Duplikasi identitas (satu MMSI, beberapa kapal)

Metode Global Fishing Watch [S6]: lihat semua pesan satu MMSI dalam satu periode; pesan yang mustahil dijangkau dengan kecepatan wajar dianggap tidak berasal dari kapal yang sama, dan posisi yang mungkin secara fisik dikelompokkan menjadi trek koheren. GFW mencatat kasus banyak kapal ber-MMSI sama di lokasi berdekatan sulit dipisah [S6].

```
untuk setiap MMSI, pesan terurut waktu:
    tracks = []                                  # setiap track punya (t_last, lat_last, lon_last, n)
    untuk pesan m:
        kandidat = [t untuk t di tracks jika v_implied(t.last -> m) <= v_max_kn]
        jika kosong: tracks.append(new_track(m))
        else: tambahkan ke track dengan (dt terkecil / jarak terkecil)
    jika >= 2 track dengan n >= min_msgs_per_track dan interval waktunya BERTUMPANG >= min_overlap_h:
        emit MMSI_DUPLICATE (evidence: jumlah track, jarak antar-track terdekat, rentang waktu)
```
Pengecualian: MMSI placeholder (A0). Parameter `v_max_kn` sama dengan A1. Batasan (nyatakan di laporan): tidak dapat memisahkan kapal ber-MMSI sama yang berada berdekatan.

### A3. AIS gap ("dark activity")

Gap tanpa sinyal bisa disebabkan pematian sengaja **atau** cakupan penerima/gangguan teknis. GFW membedakannya dengan menganalisis frekuensi dan keteraturan sinyal sebelum-sesudah gap serta faktor penerimaan [S3][S18], lalu klasifikasi berbasis aturan [S3].
Catatan penting dari GFW yang berlaku untuk **satelit**: mereka mencatat "naive gap" > 6 jam, hanya gap ≥ 12 jam yang dianggap kandidat sengaja, dan gap < 50 nm dari pantai dianggap tidak andal [S4]. **Angka itu tidak dapat dipindah begitu saja ke receiver terestrial** — receiver terestrial hanya mencakup wilayah dekat pantai, sehingga kapal yang keluar dari jangkauan adalah kasus normal.

Prosedur (rancangan adaptasi untuk receiver terestrial `[ADAPT]`, konsep dari [S3][S4][S18]):

1. **Naive gap:** `dt_s > gap.naive_min_s` `[PARAM]` per MMSI.
2. **Fitur gap:** `gap_h`, `disp_km` (jarak titik terakhir→pertama), `v_imp_kn` melintasi gap, `expected_interval_s` (median selang lapor 20 pesan sebelum gap), `gap_ratio = dt_s/expected_interval_s`, `rate_regularity_before/after` (CV selang lapor).
3. **Kualitas penerimaan lokal:** dari data itu sendiri, hitung `n_unique_mmsi` per (sel 0.1°, jam). Bangun `reception_ok(cell, hour)` = `n_unique_mmsi >= reception.min_unique` `[PARAM]`.
4. **Kandidat sengaja** bila semua terpenuhi:
   - titik awal gap berada di sel `reception_ok` dan **bukan** di tepi jangkauan (jarak ke receiver terdekat < `gap.inner_range_frac × R_eff`, `R_eff` = persentil-95 jarak pesan historis dari receiver);
   - selama gap, kapal lain di sekitar lokasi awal **tetap diterima** (bukan pemadaman receiver);
   - keteraturan pelaporan sebelum gap normal (gap_ratio besar sementara CV rendah);
   - opsional: titik akhir gap juga di area `reception_ok` (muncul kembali di dalam cakupan).
5. Klasifikasi: `gap_no_displacement` (kapal berhenti) vs `gap_with_displacement` (bergerak saat gelap; fitur jarak/`v_imp` dipakai juga pada model klasifikasi berbasis data GFW [S19]).
6. Keluaran `gap_events.csv` + skor `dark_score` (gabungan bobot `[ADAPT]`). GFW menyatakan gap pendek tidak andal karena periodisitas satelit [S4]; untuk receiver Anda periodisitas itu tidak ada, jadi `naive_min_s` harus dipilih dari distribusi selang lapor lokal.

### A4. Anomali kinematik (SCA & TA, taksonomi [S8])

Metode deteksi spesifik per jenis pada [S8] tidak dapat saya baca dari teks penuh; **kerangka tiga kelas dipakai, ambang bersifat `[ADAPT]`/`[PARAM]`.**

| Sub-jenis | Fitur | Aturan |
|---|---|---|
| Perubahan kecepatan tiba-tiba (SCA) | `|ΔSOG|/Δt` pada Δt ≤ `dt_max` | > `a_max_kn_per_min` |
| Perubahan arah tiba-tiba (SCA) | `|ΔCOG|` sirkular, Δt kecil, SOG > `sog_turn_min` | > `dcog_max_deg` |
| Ketidakkonsistenan heading–COG (SCA) | `|heading − COG|` sirkular pada SOG > 3 kn | > `hdg_cog_max_deg` (bila kolom heading ada) |
| Putaran/U-turn/berputar (TA) | jendela geser W: total `|ΔCOG|` kumulatif, `net_disp/path_len` (sinuosity) | total ≥ 360° dengan net displacement kecil, atau pembalikan ≈ 180° dalam W |
| Loitering (LA) | lihat A5 | — |

Pilihan berbasis data (disarankan dibanding angka tetap) `[ADAPT]`: hitung ambang sebagai persentil tinggi (mis. p99.9) atau median + k·MAD **per konteks** (kelompok tipe kapal × wilayah). Pendekatan ambang per konteks konsisten dengan temuan [S10] bahwa ambang global menghasilkan false negative dan false positive.

### A5. Loitering

Gunakan `LOITERING_ALGORITHM.md` (Mode trajektori dan/atau segmen). Kesesuaian dengan definisi operasional GFW: loitering bila kecepatan rata-rata < 2 kn dan rata-rata ≥ 20 nm dari pantai, hanya yang > 1 jam ditampilkan [S5]. GFW menegaskan loitering bisa juga perawatan atau menunggu izin sandar, jadi tidak otomatis mencurigakan [S5].

### A6. Encounter / rendezvous (kandidat transshipment)

Definisi GFW [S5]: dua kapal berada dalam **500 m** selama minimal **2 jam**, dengan **kecepatan median < 2 kn**, dan ≥ **10 km dari anchorage/pelabuhan**. (Versi awal blog GFW memakai 3 jam, ≥ 20 titik, dan > 20 nm dari pantai [S5].)
Posisi dihitung pada **grid waktu 10 menit** dengan interpolasi/ekstrapolasi memakai course & speed karena pelaporan tidak teratur; akibatnya kapal mungkin tidak persis dalam 500 m sepanjang durasi [S5].

```
1. Untuk tiap kapal, resample ke grid 10 menit (interpolasi antar pesan; ekstrapolasi via COG/SOG maksimal `extrap_max_min`).
2. Untuk tiap slot 10 menit: cari pasangan kapal dengan jarak <= 500 m (indeks ruang: BallTree haversine atau hash grid sel 0.01°).
3. Pasangan dianggap "kontinu" bila terdeteksi berurutan; toleransi celah `max_slot_gap`.
4. Rangkaian >= 2 jam, median SOG kedua kapal < 2 kn, jarak ke pelabuhan terdekat >= 10 km  -> ENCOUNTER.
```
Opsi filter tipe kapal (GFW mengkhususkan carrier–fishing); default di sini **semua pasangan** bila `ship_type` tidak tersedia.

### A7. Konsistensi konteks (status/tipe vs perilaku)

Konsep dari [S10]: anomali kontekstual — mis. kapal berstatus "under way using engine" tetapi berpola perilaku "engaged in fishing", yaitu ketidakcocokan antara metadata yang dilaporkan dan gerak. Butuh `nav_status` dan/atau `ship_type`. Aturan awal `[ADAPT]`:

- status *moored/at anchor* dengan `sog > moored_sog_max` selama > `moored_dur_min`;
- status *under way* dengan `sog < 0.3` selama > `stationary_dur_h`;
- perubahan `ship_type`/nama/dimensi untuk MMSI yang sama dalam periode pendek (identitas tidak stabil);
- tipe kapal kargo/tanker dengan pola gerak "memancing" (lihat B1 per-konteks).

### A8. Korroborasi lintas-kapal (lompatan)

SeaSpoofFinder [S7] menggunakan dua tahap: (1) lompatan tidak masuk akal ditemukan dengan filter kinematik & kualitas data; (2) kejadian dipertahankan **hanya bila banyak kapal menunjukkan klaster sumber dan klaster tujuan yang konsisten secara spasial**, sehingga false positive dari artefak satu kapal berkurang. Implementasi `[ADAPT]`:

```
dari A1 ambil jump `persistent_shift` per hari
klaster titik SUMBER (lat,lon) dan titik TUJUAN dengan DBSCAN haversine (eps=cluster_eps_km [PARAM])
event dipertahankan jika >= min_vessels MMSI unik berbagi pasangan (klaster sumber -> klaster tujuan) dalam jendela waktu yang sama
label: GNSS_INTERFERENCE_CANDIDATE (multi-kapal) vs SPOOF_OR_ERROR_SINGLE (satu kapal)
```

---

## 6. FASE 2 — Lapisan B (statistik/unsupervised ringan)

Prinsip dari literatur: tidak ada ground truth representatif untuk anomali maritim sehingga pendekatan unsupervised dominan [S1]; hasilnya adalah kejadian "tidak biasa", belum tentu mencurigakan [S1].
Pisahkan data: latih normalitas pada periode awal, validasi pada periode tengah, uji pada periode akhir (pola pembagian waktu yang dipakai [S1]); pisahkan berdasarkan **MMSI** untuk menghindari kebocoran [S10].

### B1. Fitur trajektori + Isolation Forest **per konteks**

1. Dari `clean`, buat segmen (jendela 1 jam atau 50 pesan; trajektori dari `LOITERING_ALGORITHM.md` 5.2 dengan `gap_hours` diperkecil, lihat config `b_layer.contiguous_gap_h`).
2. Fitur per segmen `[ADAPT]`: `sog_mean, sog_std, sog_max, cog_circ_std, abs_turn_rate_mean, sinuosity, net_disp_km, path_len_km, dt_median_s, dt_max_s, dist_port_mean_km, hour_sin, hour_cos`.
3. **Konteks** = kelompok tipe kapal × (opsional) status navigasi × wilayah kasar. Ambang global tidak andal karena perilaku berbeda per konteks [S10]; ensemble seperti Isolation Forest sendiri lemah pada anomali kontekstual bila dicampur [S10] → **latih satu model per konteks**.

```python
from sklearn.ensemble import IsolationForest
for ctx, sub in feats.groupby("context"):
    if len(sub) < cfg.b1.min_samples: continue
    m = IsolationForest(n_estimators=cfg.b1.n_estimators, contamination="auto", random_state=0).fit(sub[cols])
    s = -m.score_samples(sub[cols])                     # skor lebih tinggi = lebih anomali
    tau = np.quantile(s, 1 - cfg.b1.flag_quantile)      # [PARAM] mulai 0.001, tentukan dengan review manual
    feats.loc[sub.index, ["score", "flag"]] = np.c_[s, s > tau]
```
Isolation Forest sebagai algoritma unsupervised yang lazim untuk gerak kapal, dan kebutuhan evaluasi tanpa label, dibahas di [S11]. Sebagai "confidence": jarak normalisasi di atas ambang `(s − τ)/τ` — [S10] menunjukkan anomali yang hanya terdeteksi model tertentu cenderung hanya sedikit di atas ambang (kemungkinan noise), sedangkan yang jauh di atas lebih kuat [S10].

### B2. Normalitas per-sel + *a contrario* (versi ringan terinspirasi GeoTrackNet)

**Ini adaptasi sederhana, bukan GeoTrackNet asli** (GeoTrackNet memakai VRNN untuk log-probabilitas; di sini diganti histogram per-sel). Parameter representasi & deteksi dari [S1]:

- Interpolasi linear ke **10 menit**; trek "kontigu" = selang maks antar pesan **2 jam**; trek panjang dipotong **4–24 jam**; SOG dipotong 30 kn; diskretisasi lat/lon **0.01°**, SOG **1 kn**, COG **5°** [S1].
- Model normal (`[ADAPT]`): per sel spasial `C_i` (`grid_deg`, mis. 0.1°), hitung distribusi terhaman (Laplace) atas bin `(sog_bin, cog_bin)` dari periode latih. Skor titik `l_t = log p(sog_bin, cog_bin | C_i)`.
- **Titik abnormal** bila `l_t` di bawah kuantil-`p` distribusi `l` pada sel yang sama (validasi); `p = 0.1` [S1]. Sel dengan data sedikit dikecualikan (wilayah "kosong" di [S1]).
- **Segmen abnormal** (a contrario) [S1]: untuk trek panjang T, segmen (n titik, k abnormal): `NFA(n,k,p) = N_s · B(n,k,p)`, `N_s = T(T+1)/2`, `B` = ekor binomial. Trek abnormal jika ada segmen dengan `NFA < ε`. `ε` mula-mula besar lalu diturunkan sampai false positive dapat diterima [S1].

```python
from scipy.stats import binom
def nfa_track(flags, p, eps):
    T = len(flags); Ns = T * (T + 1) / 2
    cs = np.r_[0, np.cumsum(flags)]
    best = (np.inf, None)
    for n in range(1, T + 1):
        k_arr = cs[n:] - cs[:-n]                 # jumlah titik abnormal di tiap jendela panjang n
        k = int(k_arr.max())
        if k == 0: continue
        nfa = Ns * binom.sf(k - 1, n, p)          # P(X >= k)
        if nfa < best[0]: best = (nfa, (n, k, int(k_arr.argmax())))
    return best[0] < eps, best
```
Batasan yang harus dilaporkan: (a) histogram per-sel mengabaikan urutan/rute sehingga tidak menangkap anomali sekuensial seperti "double U-turn" yang ditangkap model rekuren [S1]; (b) perilaku kapal ikan yang kompleks & musiman menghasilkan banyak deteksi yang secara statistik tidak biasa tapi tidak mencurigakan; [S1] menyarankan model per-musim.

### B3'. (Opsional) Waypoint & rute ala TREAD

Pallotta dkk. [S2]: klaster kejadian penting (masuk/keluar area, titik henti) memakai DBSCAN inkremental untuk membentuk *waypoint*, lalu rute; outlier rute dicari dengan KDE. Hyperparameter baseline pada [S1]: `minPts = 10`, `eps = 2000`, radius area kecil 3 km. Keterbatasan: hanya cocok untuk lalu lintas berpola rute (kargo/tanker), dan 13% trek pada set uji [S1] tidak bisa dipetakan ke rute mana pun (kisaran 10–60% menurut [S1] yang mengutip [S2]). Gunakan hanya jika user meminta analisis rute.

---

## 7. FASE 3 — Deep (hanya bila diminta)

**B3a. GeoTrackNet asli** [S1]. Kode resmi: `github.com/CIA-Oceanix/GeoTrackNet` (tautan ada di [S1]). Ringkasan hyperparameter dari makalah:
- representasi *four-hot* (one-hot lat, lon, SOG, COG) dengan resolusi 0.01°/0.01°/1 kn/5°;
- VRNN dengan LSTM 1 lapis, hidden 100 (kargo & tanker) atau 120 (semua tipe kapal); `z_t` berdimensi sama; jaringan prior/posterior 1 lapis tersembunyi 100; emisi Bernoulli multivariat; Adam lr 3e-4;
- deteksi a contrario `p = 0.1`, `ε` diturunkan bertahap; `L_max = 24 jam` [S1].
Hasil model sensitif pada resolusi (ubah faktor 5 mengubah deteksi) dan hanya faktor 2 yang relatif stabil [S1].

**B3b. Autoencoder berbasis rekonstruksi.**
- Maganaris dkk. [S9]: input `t × f` = (48 × 4: LAT, LON, SOG, COG, 30 menit per langkah), encoder-decoder GRU/BiGRU dengan recurrent dropout, tanh, MSE, Adam; ambang outlier **mean RMSE + 6σ** pada distribusi RMSE; kapal yang muncul ≥ 5 kali dalam set outlier (100 hari) ditandai sebagai anomali berulang [S9]. Catatan sumber: pelatihan sengaja dibatasi agar tidak menghafal outlier [S9].
- Context-aware AE [S10]: jendela 50 pesan × 6 fitur `[s, c, h, Δt, Δd, a]`, encoder Conv1D bersama + decoder per konteks (konteks = tipe kapal × status navigasi), latent 75, Adam 1e-3, batch 128, hingga 250 epoch + early stopping, ambang per-konteks **τ_c = μ_c + λσ_c dengan λ = 5** [S10]. Split latih/uji per MMSI. Bila sumber daya terbatas, [S10] menyarankan CAE/GCAE, atau AE biasa dengan ambang per-konteks (yang sudah memperbaiki relevansi deteksi).
- Alternatif lain untuk dibaca dulu bila diperlukan: WGAN-GP berbasis gambar trajektori [S13]; interpolasi kinematik untuk deteksi trek error [S17].

---

## 8. Fusi, skor, dan triase

Skema `anomaly_events` (satu baris per kejadian):

| Kolom | Isi |
|---|---|
| `event_id, mmsi, t_start, t_end, lat, lon` | identitas & lokasi |
| `type` | `JUMP`, `SOG_MISMATCH`, `MMSI_DUPLICATE`, `AIS_GAP`, `KINEMATIC_SCA`, `KINEMATIC_TA`, `LOITERING`, `ENCOUNTER`, `CONTEXT_MISMATCH`, `STAT_OUTLIER`, `GNSS_INTERFERENCE_CANDIDATE` |
| `detector` | id modul (A1…B2) + hash config |
| `score`, `confidence` | skor mentah; `(s−τ)/τ` bila ada ambang |
| `severity` | `data_quality` / `unusual` / `suspicious` |
| `evidence` | JSON angka pendukung (jarak, kecepatan, durasi, jumlah kapal, dst.) |
| `status` | selalu `candidate` |

Aturan severity `[ADAPT]`:
- `data_quality`: A0, A1 tipe `isolated_outlier`/`single_axis`.
- `unusual`: A4, B1, B2, A7.
- `suspicious`: A2, A3 (kandidat sengaja), A5/A6 jauh dari pelabuhan, A8.
- **Eskalasi**: dua atau lebih tipe berbeda yang saling tumpang-tindih pada satu kapal & satu ruas pelayaran dinaikkan satu tingkat dan diprioritaskan review manual (praktik yang dilaporkan analis vendor; bukan hasil penelitian tervalidasi [S20]).

Peringatan yang wajib dicantumkan di laporan: AIS tidak terautentikasi dan dapat dimanipulasi; sumber tunggal AIS tidak cukup untuk memastikan spoofing, verifikasi silang memerlukan sumber independen (radar, SAR, citra optik, receiver lain) [S14].

---

## 9. `config.yaml` (tambahan di atas config loitering)

```yaml
anomaly:
  common: {contiguous_gap_h: 2.0}                    # [S1] trek kontigu
  a0:
    placeholder_mmsi_suffixes: ["000000", "999999"]  # [S7]
    sog_na_value: 102.3
    cog_na_value: 360
  jump:                                              # [ADAPT] semua angka
    min_dt_s: 1
    min_jump_km: 1.0
    v_max_kn: 60
    mismatch_max_dt_s: 600
    mismatch_tol_kn: 10
    single_axis_ratio: 50
  identity:
    min_msgs_per_track: 5
    min_overlap_h: 0.5
  gap:                                               # [PARAM] tentukan dari distribusi selang lapor lokal
    naive_min_s: 1800
    inner_range_frac: 0.8
    reception_min_unique_mmsi: 3
    reception_cell_deg: 0.1
    receiver_range_quantile: 0.95
  kinematic:                                         # [ADAPT]
    dt_max_s: 300
    a_max_kn_per_min: 5
    dcog_max_deg: 90
    sog_turn_min_kn: 3
    hdg_cog_max_deg: 45
    window_min: 30
    threshold_mode: quantile                         # fixed | quantile | mad
    quantile: 0.999
  encounter:                                         # [S5]
    grid_min: 10
    max_dist_m: 500
    min_duration_h: 2.0
    median_sog_kn_lt: 2.0
    min_dist_port_km: 10
    extrap_max_min: 30                               # [ADAPT]
    max_slot_gap: 1                                  # [ADAPT]
  context:
    moored_sog_max_kn: 3.0                           # [ADAPT]
    moored_dur_min: 30
    stationary_dur_h: 6
  jump_corroboration:
    cluster_eps_km: 50                               # [PARAM]
    min_vessels: 3
  b1: {min_samples: 500, n_estimators: 300, flag_quantile: 0.001}
  b2:
    resample_min: 10                                 # [S1]
    max_gap_h: 2.0                                   # [S1]
    track_len_h: [4, 24]                             # [S1]
    bins: {lat_deg: 0.01, lon_deg: 0.01, sog_kn: 1, cog_deg: 5}   # [S1]
    sog_clip_kn: 30                                  # [S1]
    cell_deg: 0.1                                    # [ADAPT]
    min_cell_samples: 200                            # [ADAPT]
    p: 0.1                                           # [S1]
    epsilon: 1.0                                     # [PARAM] mulai besar, turunkan (praktik [S1])
    laplace_alpha: 1.0
  split: {train: "first 70%", val: "next 15%", test: "last 15%", by: time_and_mmsi}
```

---

## 10. Evaluasi (tanpa ground truth)

1. **Injeksi anomali sintetis** pada trek normal (praktik [S12], mengikuti taksonomi *shift deviation*, *abnormal heading*, *abnormal speed* dari [S8]): ubah lat/lon (geser), COG, SOG dalam batas ruang-waktu terkontrol, lalu hitung precision/recall detektor A4 dan B1/B2. Laporkan bahwa ini hanya mengukur kepekaan terhadap anomali buatan.
2. **Ukuran tanpa label** (terinspirasi MADQI [S11], yang mengusulkan indeks komposit label-free: konsistensi laju anomali, plausibilitas fisik, pemisahan distribusi skor, bukti kasus ekstrem). Teks penuh MADQI tidak dapat saya baca; definisi komponennya harus **dibaca ulang dari arXiv:2605.30388** sebelum meniru namanya. Proksi sederhana `[ADAPT]`:
   - *stabilitas laju flag* antar potongan waktu (koefisien variasi),
   - persentase flag yang pelanggaran plausibilitas fisiknya terverifikasi (mis. `v_imp > v_max`),
   - jarak antar median skor flag vs non-flag,
   - proporsi flag di atas ambang > 50% (kasus kuat).
3. **Tumpang-tindih antar detektor & kapal berulang:** hitung `Jaccard` flag antar detektor [S10] dan daftar MMSI yang muncul ≥ N kali pada set outlier (praktik [S9], N=5 pada 100 hari).
4. **Review pakar** atas sampel acak per tipe & per tingkat skor. [S1] melaporkan hasil deteksi diperiksa satu-satu oleh pakar AIS.
5. **Laporan sensitivitas:** jalankan ulang dengan ambang ±25% dan laporkan perubahan jumlah flag per detektor.

Uji unit (data sintetis, wajib lulus):

| Kasus | Ekspektasi |
|---|---|
| Kapal bergerak 12 kn lalu posisi loncat 400 km dalam 10 menit | `f_jump = True`, label `persistent_shift` bila menetap |
| A→B→A (satu titik rusak) | `isolated_outlier`, keluar dari `clean` |
| Dua trek ber-MMSI sama di dua lokasi bersamaan | `MMSI_DUPLICATE` |
| Gap 3 jam di dalam area `reception_ok`, kapal lain terus diterima | `AIS_GAP` kandidat sengaja |
| Gap 3 jam saat receiver mati (semua kapal hilang) | **bukan** kandidat sengaja |
| Dua kapal 300 m selama 2,5 jam, SOG 1 kn, 30 km dari pelabuhan | `ENCOUNTER` |
| Sama tetapi 8 km dari pelabuhan atau 1,5 jam | bukan encounter |
| MMSI berakhiran 000000 dengan loncatan | dikecualikan dari A1/A2 |
| `nfa_track` dengan semua titik normal | tidak abnormal |
| `nfa_track` dengan 8 dari 10 titik abnormal pada `p=0.1` | abnormal pada `ε` moderat |

---

## 11. Batasan & catatan verifikasi sumber (wajib dilaporkan ke user)

1. Sebagian besar **angka ambang lapisan A adalah `[ADAPT]`**. Sumber memberi konsep (kecepatan tersirat, jump, gap, taksonomi), bukan nilai untuk data Anda.
2. **Sumber yang dibaca penuh:** [S1] GeoTrackNet, [S9], [S10]. **Dibaca dari abstrak/cuplikan saja:** [S2], [S3], [S7], [S8], [S11], [S12], [S13]. Untuk [S7] dan [S11], berkas PDF tidak dapat diekstrak teksnya, jadi detail metode (mis. ambang SeaSpoofFinder, definisi ARC/PPS/SDS/ECE) **tidak saya ketahui** dan tidak boleh diasumsikan.
3. Sumber berstatus **preprint arXiv** (belum tentu telah ditelaah sejawat sejauh yang bisa saya verifikasi): [S7], [S9], [S10], [S11], [S12]. Sumber [S14] dan [S20] adalah **blog vendor**; dipakai hanya untuk tipologi lapangan, bukan bukti.
4. Konsep GFW (gap, encounter, loitering) dirancang untuk AIS **satelit + terestrial global**; adaptasi ke receiver terestrial regional dijelaskan di A3 dan **belum tervalidasi**.
5. Detektor unsupervised mengukur *ketidakbiasaan*, bukan niat. Jangan menulis "kapal melakukan pelanggaran" di laporan; gunakan "kandidat anomali".
6. Kapal ikan dan kapal non-rute punya pola kompleks sehingga banyak deteksi hanyalah aktivitas normal [S1].

---

## 12. Sumber

| ID | Sumber | Tautan | Dipakai untuk | Jenis/keterbacaan |
|---|---|---|---|---|
| S1 | Nguyen, Vadaine, Hajduch, Garello, Fablet. *GeoTrackNet — A Maritime Anomaly Detector using Probabilistic Neural Network Representation of AIS Tracks and A Contrario Detection.* IEEE Trans. Intell. Transp. Syst. (2021) | https://arxiv.org/abs/1912.00682 · kode: https://github.com/CIA-Oceanix/GeoTrackNet | B2, B3a, evaluasi, batasan | Jurnal; dibaca penuh (versi arXiv) |
| S2 | Pallotta, Vespe, Bryan. *Vessel Pattern Knowledge Discovery from AIS Data: A Framework for Anomaly Detection and Route Prediction.* Entropy 15(6):2218–2245 (2013), doi:10.3390/e15062218 | https://www.mdpi.com/1099-4300/15/6/2218 | TREAD, DBSCAN, KDE | Jurnal; abstrak/cuplikan |
| S3 | Welch dkk. *Hot spots of unseen fishing vessels.* Science Advances (2022), doi:10.1126/sciadv.abq2109 · kode: https://github.com/GlobalFishingWatch/AIS-disabling-high-seas | https://www.science.org/doi/10.1126/sciadv.abq2109 | A3: klasifikasi gap berbasis aturan | Jurnal; abstrak/cuplikan |
| S4 | Global Fishing Watch API — *Data Caveats* | https://globalfishingwatch.org/our-apis/documentation/docs/v3/general-api-doc/data-caveats | A3: batas gap, keterbatasan dekat pantai | Dokumentasi resmi |
| S5 | Global Fishing Watch — FAQ *What is a loitering event?*, *What is an encounter…*, *What is a vessel encounter?*; *Identifying Transshipment From the Data* | https://globalfishingwatch.org/faqs/what-is-loitering-event/ · https://globalfishingwatch.org/faqs/what-is-a-vessel-encounter/ · https://globalfishingwatch.org/data/identifying-transshipment-from-the-data/ | A5, A6 | Dokumentasi resmi |
| S6 | Global Fishing Watch. *Spoofing: One Identity Shared by Multiple Vessels* | https://globalfishingwatch.org/data/spoofing-one-identity-shared-by-multiple-vessels/ | A2 | Blog metodologi resmi |
| S7 | Winkel dkk. *SeaSpoofFinder — Potential GNSS Spoofing Event Detection Using AIS.* arXiv:2602.16257 | https://arxiv.org/abs/2602.16257 | A0 placeholder MMSI, A1 `single_axis`, A8 | Preprint; cuplikan |
| S8 | Li dkk. *AIS-based kinematic anomaly classification for maritime surveillance.* Ocean Engineering (2024) | https://www.sciencedirect.com/science/article/abs/pii/S0029801824013647 | Taksonomi SCA/TA/LA, A4 | Jurnal; abstrak |
| S9 | Maganaris, Protopapadakis, Doulamis. *Outlier detection in maritime environments using AIS data and deep recurrent architectures.* arXiv:2406.09966 (2024) | https://arxiv.org/abs/2406.09966 | B3b, kapal berulang | Preprint; dibaca penuh |
| S10 | *Context-Aware Autoencoders for Anomaly Detection in Maritime Surveillance.* arXiv:2602.00124 (Simula–FEMTO-ST) | https://arxiv.org/abs/2602.00124 | A7, B1 per-konteks, B3b, confidence | Preprint; dibaca penuh |
| S11 | Gocer, Bhuiyan, Hasan, Ahmad. *A Novel Evaluation Metric for Unsupervised Learning in AIS-Based Maritime Anomaly Detection: MADQI.* arXiv:2605.30388 (2026) | https://arxiv.org/abs/2605.30388 | A1 (definisi selisih SOG–kecepatan tersirat, jump), evaluasi | Preprint; abstrak/cuplikan |
| S12 | *AIS-LLM: A Unified Framework for Maritime Trajectory Prediction, Anomaly Detection, and Collision Risk Assessment with Explainable Forecasting.* arXiv:2508.07668 (2025) | https://arxiv.org/abs/2508.07668 | Injeksi anomali sintetis, preprocessing DMA | Preprint; cuplikan |
| S13 | Liang dkk. *Unsupervised maritime anomaly detection for intelligent situational awareness using AIS data.* Knowledge-Based Systems 284:111313 (2024) | https://www.sciencedirect.com/science/article/abs/pii/S0950705123010614 | Alternatif WGAN-GP | Jurnal; abstrak |
| S14 | Kpler. *AIS spoofing vs GNSS interference* (27 Apr 2026) | https://www.kpler.com/blog/ais-spoofing-vs-gnss-interference-why-the-distinction-decides-the-claim | Tipologi (teleportasi, static ghost, identity clone), perlunya multi-sumber | **Blog vendor** |
| S15 | Ribeiro, Paes, de Oliveira. *AIS-based maritime anomaly traffic detection: A review.* Expert Systems with Applications 231:120561 (2023); memuat taksonomi Riveiro dkk. (2018, WIREs DMKD) | https://www.sciencedirect.com/science/article/abs/pii/S0957417423010631 | Taksonomi | Jurnal; cuplikan (taksonomi dikutip, review tidak dibaca penuh) |
| S17 | Guo, Mou, Chen, Chen. *An Anomaly Detection Method for AIS Trajectory Based on Kinematic Interpolation.* J. Mar. Sci. Eng. 9(6):609 (2021), doi:10.3390/jmse9060609 | https://doi.org/10.3390/jmse9060609 | Pointer (deskripsi dari [S9]) | Jurnal; **tidak dibaca**, hanya deskripsi dari [S9] |
| S18 | Global Fishing Watch. *When Vessels Turn Off AIS Broadcasts* | https://globalfishingwatch.org/data/going-dark-when-vessels-turn-off-ais-broadcasts/ | A3: analisis keteraturan sinyal sebelum/sesudah gap | Blog resmi |
| S19 | Identifying Suspicious Fishing Activity based on AIS Disabling Events (Research Square, 2023) | https://www.researchsquare.com/article/rs-2782178/v1 | Fitur gap (jam gap, jarak selama gap) | Preprint; cuplikan |
| S20 | Jack Cooper. *Unmasking the Dark Fleet…* | https://www.jackcooper.com/unmasking-the-dark-fleet-how-maritime-risk-teams-spot-ais-spoofing-and-shadow-trade/ | Eskalasi bila banyak anomali tumpang-tindih | **Blog vendor** |

Bacaan lanjutan yang belum saya buka (jangan dianggap terverifikasi): Ford dkk. 2018 (PLoS ONE, GAM untuk gap penerimaan AIS, disitir di [S10]); Mazzarella dkk. 2017 (*A novel anomaly detection approach to identify intentional AIS on-off switching*, Expert Syst. Appl. 78, disitir di makalah Anda sebagai ref. [8]).

---

## 13. Checklist implementasi (urut)

- [ ] 1. Inspeksi data; konfirmasi kolom opsional (`nav_status`, `ship_type`, `heading`) & keberadaan `ports.csv`, `receivers.csv`.
- [ ] 2. `A0` + `step_features` + `A1`; laporkan jumlah flag & 10 contoh; tuning `v_max_kn`/`min_jump_km`.
- [ ] 3. `A2` duplikasi identitas.
- [ ] 4. `A3` gap: hitung distribusi selang lapor lokal → tetapkan `naive_min_s`; bangun `reception_ok`.
- [ ] 5. `A4` kinematik (mode `quantile` per konteks) dan sambungkan `A5` dari `LOITERING_ALGORITHM.md`.
- [ ] 6. `A6` encounter (grid 10 menit + indeks ruang).
- [ ] 7. `A7` (bila `nav_status`/`ship_type` ada), `A8`.
- [ ] 8. Fusi & `anomaly_events` + statistik ringkas (per tipe, per bulan, per kapal, hotspot grid).
- [ ] 9. Fase 2: `B1`, `B2`; evaluasi Bagian 10.
- [ ] 10. (Bila diminta) Fase 3.
