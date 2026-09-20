# UVMS Modul Statistik AIS — Development Plan

## 1. Ringkasan Proyek

Membangun ulang UVMS Dashboard (Modul Statistik AIS) dari monolith HTML standalone menjadi aplikasi full-stack modern.

| Aspek | Detail |
|-------|--------|
| **Backend** | Python 3.12 + FastAPI |
| **Frontend** | React 18 + TypeScript + Vite |
| **Database** | PostgreSQL (existing, read-only) |
| **Cache** | Redis 7 |
| **Charts** | D3.js / Recharts |
| **Maps** | Leaflet / React-Leaflet |
| **UI Framework** | MUI (Material UI) atau Ant Design |

---

## 2. Database Schema (Existing — READ ONLY)

Database: `dbais` @ `157.66.34.54:5432` — **tidak akan dimodifikasi**, aplikasi hanya melakukan query SELECT.

### Tabel Utama

| Tabel | Rows | Size | Deskripsi |
|-------|------|------|-----------|
| `ais_position` | 26.4M | 6.7 GB | Posisi kapal (lat, lon, sog, cog, heading, nav_status) |
| `ais_raw_message` | 27.5M | 4.6 GB | Raw NMEA messages |
| `ais_vessel_static` | 3,256 | 624 KB | Data statis kapal (nama, IMO, call_sign, tipe, dimensi) |
| `vessel_states` | 3,636 | 24 MB | State terakhir setiap kapal (last known position) |
| `ais_binary_message` | 19,850 | 3 MB | Pesan biner AIS |
| `ais_errors` | 5,761 | 1 MB | Error log parsing AIS |

### Tabel Referensi

| Tabel | Rows | Deskripsi |
|-------|------|-----------|
| `ais_ship_type` | 75 | Kode tipe kapal (Cargo, Tanker, Fishing, Passenger, Tug, dll) |
| `ais_nav_status` | 16 | Status navigasi (Under way, At anchor, Moored, dll) |
| `ais_msg_type` | 30 | Tipe pesan AIS (1-27) |
| `ais_aton_type` | 32 | Tipe Aids-to-Navigation |
| `ais_station` | 0 | Stasiun penerima AIS (belum terisi) |
| `ais_base_station` | 82 | AIS base station positions |
| `ais_aton` | 5 | Aids-to-Navigation aktif |
| `ais_safety_message` | 97 | Pesan keselamatan |

### Key Columns — `ais_position`
```
id, mmsi, msg_type, nav_status_code, position_time, received_at,
lat, lon, sog_knots, cog_deg, heading_deg, rot_deg_per_min,
position_accuracy, raim_flag, maneuver_indicator, geom (PostGIS)
```

### Key Columns — `ais_vessel_static`
```
mmsi (PK), class, imo, call_sign, name, ship_type_code,
dim_to_bow/stern/port/starboard, length_m, width_m, draught_m,
destination, eta_month/day/hour/minute, last_static_update
```

### Key Columns — `vessel_states`
```
mmsi (PK), last_lat, last_lon, last_position (PostGIS), last_sog,
last_cog, last_heading, last_nav_status, last_station_id,
last_timestamp_ais, last_received_at
```

### Indexes (Existing)
- `ais_position`: mmsi+time, msg_type, geom (spatial)
- `vessel_states`: timestamp, position (spatial GiST)
- `ais_raw_message`: received_at, msg_type

### ⚠️ Performance Notes
- `ais_position` = 26M rows, 6.7GB — direct queries slow
- Tidak ada partitioning (relkind=`r`, bukan `p`)
- **Semua aggregasi harus di-cache di Redis** atau precompute

---

## 3. Fitur Dashboard (dari analisis HTML)

### 3.1 Overview / KPI Cards
- Total kapal aktif (unique MMSI aktif dalam periode)
- Kapal per status navigasi (Under way, Anchor, Moored, dll)
- Total pesan AIS diterima
- Jumlah stasiun aktif
- Distribusi tipe kapal

### 3.2 Statistik Kapal
- Statistik kapal berdasarkan vessel type AIS (Cargo, Tanker, Fishing, Passenger, Tug, dll)
- Distribusi ukuran kapal (GT/LOA/DWT/Breadth)
- Distribusi bendera kapal (flag)
- Tabel daftar kapal dengan search, sort, pagination
- Export ke CSV/PDF

### 3.3 Trafik & Tren
- Tren jumlah kapal per hari/minggu/bulan
- Trafik per jam (slot waktu / heatmap jam)
- Tren bulanan
- Distribusi per stasiun penerima
- Bar chart per stasiun, line chart tren

### 3.4 Peta (Map)
- Peta sebaran kapal aktif (vessel_states → last known position)
- Heatmap kepadatan kapal
- Posisi AIS base station
- Posisi AtoN (Aids-to-Navigation)
- Layer WPP (Wilayah Pengelolaan Perikanan)
- Layer TSS (Traffic Separation Scheme) / Selat / ALKI

### 3.5 Pertemuan Kapal (Encounter/Meeting)
- Deteksi pertemuan kapal (proximity-based)
- Statistik per event pertemuan
- Filter per kapal, per zona, per waktu

### 3.6 Laporan
- Export laporan PDF/CSV/Excel
- Filter periode: Hari ini, Kemarin, 7 hari, 30 hari, custom range
- Filter wilayah: WPP, zona, perairan

### 3.7 UI Features
- Sidebar navigation
- Dark/light theme
- Responsive layout
- Search & filter global
- Date range picker
- Sort & pagination pada tabel
- Donut/gauge/bar/line charts

---

## 4. Arsitektur Sistem

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   React UI  │────▶│  FastAPI Backend  │────▶│  PostgreSQL  │
│  (Vite+TS)  │◀────│   (Python 3.12)  │◀────│   (dbais)    │
└─────────────┘     │                  │     └──────────────┘
                    │   ┌──────────┐   │
                    │   │  Redis   │   │
                    │   │ (cache)  │   │
                    │   └──────────┘   │
                    └──────────────────┘
```

### Data Flow
1. **React** → request ke FastAPI endpoint
2. **FastAPI** → cek Redis cache
3. Cache miss → query PostgreSQL → simpan ke Redis (TTL based)
4. Return JSON ke React
5. React render charts/maps/tables

---

## 5. Struktur Proyek

```
ais-statistik/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app entry
│   │   ├── config.py               # Settings (DB, Redis, etc)
│   │   ├── database.py             # SQLAlchemy / asyncpg connection
│   │   ├── cache.py                # Redis cache layer
│   │   ├── models/
│   │   │   ├── vessel.py           # SQLAlchemy models
│   │   │   ├── position.py
│   │   │   └── reference.py
│   │   ├── schemas/
│   │   │   ├── vessel.py           # Pydantic response schemas
│   │   │   ├── statistics.py
│   │   │   └── common.py
│   │   ├── api/
│   │   │   ├── router.py           # API router registry
│   │   │   ├── dashboard.py        # GET /api/dashboard/overview
│   │   │   ├── vessels.py          # GET /api/vessels, /api/vessels/{mmsi}
│   │   │   ├── statistics.py       # GET /api/statistics/...
│   │   │   ├── traffic.py          # GET /api/traffic/...
│   │   │   ├── maps.py             # GET /api/maps/...
│   │   │   ├── encounters.py       # GET /api/encounters/...
│   │   │   └── reports.py          # GET /api/reports/export
│   │   └── services/
│   │       ├── stats_service.py    # Business logic: aggregasi statistik
│   │       ├── traffic_service.py  # Trafik & tren calculation
│   │       ├── map_service.py      # GeoJSON, heatmap data
│   │       ├── encounter_service.py # Deteksi pertemuan kapal
│   │       └── cache_service.py    # Cache invalidation & precompute
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                    # API client (axios/fetch)
│   │   │   └── client.ts
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── MainLayout.tsx
│   │   │   ├── charts/
│   │   │   │   ├── DonutChart.tsx
│   │   │   │   ├── BarChart.tsx
│   │   │   │   ├── LineChart.tsx
│   │   │   │   ├── GaugeChart.tsx
│   │   │   │   └── HeatmapChart.tsx
│   │   │   ├── maps/
│   │   │   │   ├── VesselMap.tsx
│   │   │   │   ├── HeatmapLayer.tsx
│   │   │   │   └── StationMarkers.tsx
│   │   │   ├── tables/
│   │   │   │   └── DataTable.tsx
│   │   │   ├── cards/
│   │   │   │   └── KpiCard.tsx
│   │   │   └── filters/
│   │   │       ├── DateRangePicker.tsx
│   │   │       ├── ShipTypeFilter.tsx
│   │   │       └── RegionFilter.tsx
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── VesselStatsPage.tsx
│   │   │   ├── TrafficPage.tsx
│   │   │   ├── MapPage.tsx
│   │   │   ├── EncountersPage.tsx
│   │   │   └── ReportsPage.tsx
│   │   ├── hooks/
│   │   │   ├── useApi.ts
│   │   │   └── useFilters.ts
│   │   ├── stores/
│   │   │   └── filterStore.ts      # Zustand state management
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── utils/
│   │       ├── formatters.ts
│   │       └── constants.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── development-plan.md
└── CLAUDE.md
```

---

## 6. API Endpoints

### Dashboard Overview
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/dashboard/overview` | KPI cards: total kapal, per status, total messages |
| GET | `/api/dashboard/vessel-type-distribution` | Donut chart: distribusi tipe kapal |
| GET | `/api/dashboard/nav-status-distribution` | Donut chart: distribusi status navigasi |

### Vessels
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/vessels` | List kapal (paginated, searchable, sortable) |
| GET | `/api/vessels/{mmsi}` | Detail kapal + last known position |
| GET | `/api/vessels/{mmsi}/track` | Track history kapal (positions) |

### Statistics
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/statistics/by-ship-type` | Jumlah kapal per ship type group |
| GET | `/api/statistics/by-size` | Distribusi ukuran (LOA/width bins) |
| GET | `/api/statistics/by-flag` | Distribusi bendera (berdasar MMSI MID) |
| GET | `/api/statistics/by-station` | Jumlah per stasiun penerima |

### Traffic & Trends
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/traffic/trend` | Tren jumlah kapal aktif (daily/weekly/monthly) |
| GET | `/api/traffic/hourly` | Distribusi per jam (heatmap data) |
| GET | `/api/traffic/by-station` | Trafik per stasiun per waktu |

### Maps
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/maps/vessels` | GeoJSON vessel_states (last known positions) |
| GET | `/api/maps/heatmap` | Heatmap data points |
| GET | `/api/maps/base-stations` | GeoJSON base stations |
| GET | `/api/maps/aton` | GeoJSON Aids-to-Navigation |

### Encounters
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/encounters` | List pertemuan kapal |
| GET | `/api/encounters/{id}` | Detail encounter |

### Reports
| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/api/reports/export` | Export CSV/PDF dengan filter |

### Common Query Parameters
- `date_from`, `date_to` — ISO 8601 date range
- `period` — `today`, `yesterday`, `7d`, `30d`, `custom`
- `ship_type` — filter by ship type group
- `mmsi` — filter by MMSI
- `page`, `page_size` — pagination
- `sort_by`, `sort_order` — sorting

---

## 7. Strategi Caching (Redis)

Database `ais_position` = 26M rows, 6.7GB, **tanpa partitioning**. Direct aggregation queries sangat lambat. Strategi:

### Cache Layers

| Key Pattern | TTL | Deskripsi |
|-------------|-----|-----------|
| `dashboard:overview` | 5 min | KPI cards |
| `stats:ship_type` | 1 hour | Distribusi tipe kapal |
| `stats:nav_status` | 5 min | Distribusi status navigasi (dari vessel_states) |
| `traffic:trend:{period}` | 15 min | Tren trafik |
| `traffic:hourly:{date}` | 1 hour | Data per jam |
| `vessels:list:{hash}` | 5 min | Paginated vessel list |
| `vessel:{mmsi}` | 5 min | Detail vessel |
| `maps:vessels` | 2 min | GeoJSON all vessels |
| `maps:heatmap` | 15 min | Heatmap data |
| `encounters:{hash}` | 30 min | Encounter results |

### Precompute Strategy
- **Background worker** (FastAPI startup / cron) precompute heavy aggregations
- `ais_position` aggregasi (trend, hourly) → precompute ke Redis setiap 15 menit
- `vessel_states` queries → cache 2-5 menit (data berubah real-time)
- Reference tables (ship_type, nav_status, msg_type) → cache on startup, TTL 24 jam

### Connection Config
```
Redis: 157.66.34.54:6379, password: Sbm2025
PostgreSQL: postgres://uvms:P455word%40AIS@157.66.34.54:5432/dbais?sslmode=disable
```

---

## 8. Tech Stack Detail

### Backend
| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `asyncpg` | Async PostgreSQL driver |
| `sqlalchemy[asyncio]` | ORM + async engine |
| `redis[hiredis]` | Redis client |
| `pydantic` | Schema validation |
| `geoalchemy2` | PostGIS support |
| `orjson` | Fast JSON serialization |
| `python-dotenv` | Environment config |
| `reportlab` / `openpyxl` | PDF/Excel export |

### Frontend
| Package | Purpose |
|---------|---------|
| `react` + `react-dom` | UI framework |
| `typescript` | Type safety |
| `vite` | Build tool |
| `react-router-dom` | Client routing |
| `@mui/material` | UI component library |
| `recharts` / `d3` | Charts |
| `react-leaflet` + `leaflet` | Maps |
| `zustand` | State management |
| `axios` | HTTP client |
| `dayjs` | Date manipulation |
| `react-leaflet-heatmap-layer` | Heatmap |
| `file-saver` | Export download |

---

## 9. Fase Pengembangan

### Fase 1 — Foundation (3-4 hari) (sudah)
- [x] Analisis HTML dashboard & database schema
- [ ] Setup project structure (backend + frontend)
- [ ] FastAPI boilerplate: config, database connection, Redis connection
- [ ] React boilerplate: Vite + MUI + routing
- [ ] Layout: Sidebar, Header, MainLayout
- [ ] Docker Compose (dev environment)

### Fase 2 — Dashboard Overview ✅ (sudah)
- [x] Backend: `/api/dashboard/overview` (query vessel_states + cache)
- [x] Backend: `/api/dashboard/vessel-type-distribution`
- [x] Backend: `/api/dashboard/nav-status-distribution`
- [x] Frontend: KPI Cards component
- [x] Frontend: Donut charts (ship type, nav status)
- [x] Frontend: Dashboard page assembly

### Fase 3 — Statistik Kapal ✅ (suudah)
- [x] Backend: `/api/vessels` (paginated list + search + sort + ship_type filter)
- [x] Backend: `/api/statistics/by-ship-type`, `/by-size`, `/by-flag`
- [x] Frontend: DataTable dengan search/sort/pagination
- [x] Frontend: Bar charts distribusi
- [x] Frontend: Filter components (ship type filter in DataTable)

### Fase 4 — Trafik & Tren ✅ (sudah)
- [x] Backend: `/api/traffic/trend` (precomputed daily/monthly counts)
- [x] Backend: `/api/traffic/hourly` (jam distribution)
- [x] Backend: `/api/traffic/by-station`
- [x] Backend: `/api/traffic/heatmap` (day × hour grid, 30 hari)
- [x] Frontend: Line chart tren + period selector (7d/30d/90d)
- [x] Frontend: Heatmap chart per jam (day × hour CSS grid)
- [x] Frontend: Bar chart per stasiun

### Fase 5 — Peta ✅ (sudah)
- [x] Backend: `/api/maps/vessels` (GeoJSON dari vessel_states)
- [x] Backend: `/api/maps/heatmap`
- [x] Backend: `/api/maps/base-stations`, `/api/maps/aton`
- [x] Frontend: VesselMap dengan Leaflet (react-leaflet v5)
- [x] Frontend: Heatmap layer (semi-transparent density circles, canvas renderer)
- [x] Frontend: Station markers (biru) + AtoN markers (hijau)
- [x] Frontend: WPP boundary layer (GeoJSON statis, 8 zona)
- [x] Frontend: ALKI layer (GeoJSON statis, 3 alur laut)
- [x] Frontend: 3 basemap pilihan (CartoDB Dark, OSM, Esri Satelit)
- [x] Frontend: LayersControl toggle semua layer
- [x] Frontend: Legend + vessel count badge

### Fase 6 — Pertemuan & Laporan ✅ (sudah)
- [x] Backend: encounter detection service (proximity self-join PostGIS `ST_DWithin`, window maks 24h)
- [x] Backend: `/api/encounters` (list + cache 30min) & `/api/encounters/{id}` (detail + track)
- [x] Backend: `/api/reports/export` (CSV/Excel/PDF — vessels & encounters)
- [x] Frontend: Encounters page (filter jarak/durasi/waktu, tabel, detail dialog + mini-map track)
- [x] Frontend: Report export UI (jenis laporan, filter, format, download via blob)

### Fase 7 — Polish & Optimization (2 hari)
- [x] Dark/light theme toggle — `themeStore.ts` (zustand + persist), mutable `THEME_COLORS` singleton di `constants.ts` (`DARK_COLORS`/`LIGHT_COLORS`), `App.tsx` build `createTheme` dinamis per mode, `MainLayout` remount `<Outlet key={mode}>` agar halaman re-render dgn warna baru
- [x] Responsive design audit — Sidebar jadi temporary drawer (overlay) di breakpoint `md` ke bawah dgn hamburger menu di Header, Header/main content lebar & padding responsif (`xs`/`sm`/`md`)
- [x] Redis precompute worker (background tasks) — `backend/app/worker.py`: `precompute_loop()` asyncio task di `lifespan`, refresh cache dashboard/traffic/maps tiap 240s, statistik (ship type/size/flag) tiap ~24 menit
- [x] Loading states & error handling — `Alert` + tombol "Coba Lagi" di Dashboard, VesselStats, Traffic, VesselMap (sebelumnya hanya `console.error` diam); `ErrorBoundary.tsx` global di `App.tsx`
- [x] Performance tuning (query optimization, lazy loading) — semua route di `App.tsx` pakai `React.lazy`/`Suspense` (terverifikasi: build menghasilkan chunk terpisah per halaman); precompute worker menggantikan query berat on-demand dengan cache yang selalu hangat; sempat ketemu & benerin beberapa TypeScript error MUI v9 yang bikin `npm run build` gagal (Grid `alignItems`, TextField `InputLabelProps` → `slotProps`, ListItemText `primaryTypographyProps` → `slotProps`)
- [ ] Docker production build

**Total estimasi: ~16-22 hari kerja**

---

## 10. Next Development Checklist

> Berdasarkan analisis UVMS Dashboard (Standalone).html vs implementasi aktual.
> Diurutkan berdasarkan prioritas dan dependensi.

---

### Fase 8 — Dashboard & Halaman Existing: Enhancement (2-3 hari)

**Dashboard Ringkasan — KPI yang belum ada:**
- [x] Backend: tambah `total_messages_today` + `stations_online` + `error_rate` ke `/api/dashboard/overview`
  - `total_messages_today` → `SELECT COUNT(*) FROM ais_raw_message WHERE received_at >= today`
  - `stations_online` → `SELECT COUNT(DISTINCT last_station_id) FROM vessel_states`
  - `error_rate` → `SELECT COUNT(*) FROM ais_errors WHERE created_at >= today` ÷ total messages
- [x] Frontend: tambah 3 KPI card baru di DashboardPage (Pesan Diterima, Stasiun Online, Error Rate)
- [x] Frontend: tambah status badge "Sehat / Degraded" berdasar error_rate threshold <5%

**Trafik & Tren — fitur yang belum ada:**
- [x] Backend: `/api/traffic/sog-distribution` — distribusi kecepatan kapal (SOG histogram, bins 0-2, 2-4, 4-6 … kn) dari `ais_position` periode 7 hari (precomputed SLOW_TASK)
- [x] Backend: `/api/traffic/summary-kpis` — Total Perjalanan (unique MMSI 7d), SOG median, jam puncak
- [x] Frontend: 3 KPI card di TrafficPage (Total Perjalanan, Kecepatan Rata-rata, Jam Puncak Trafik)
- [x] Frontend: BarChart Distribusi SOG di TrafficPage

**Statistik Kapal — fitur yang belum ada:**
- [x] Backend: `/api/statistics/summary-kpis` — Tipe Kapal Unik, Kapal Terbesar (LOA), Bendera Dominan
- [x] Frontend: 3 KPI card di VesselStatsPage (Tipe Kapal Unik, Kapal Terbesar LOA, Bendera Dominan)
- [x] Frontend: Tambah tabel Negara Bendera (Kode MID → Negara, Jumlah, Share%) di bawah BarChart bendera

**Global Search Bar:**
- [x] Frontend: tambah search input di Header (`Cari MMSI, nama kapal…`), on-submit redirect ke `/vessels?search={query}`
- [x] Frontend: DataTable terima `initialSearch` prop; VesselStatsPage baca `?search=` dari URL
- [x] Backend: endpoint `/api/search?q=` — cari di `ais_vessel_static` (name, mmsi, call_sign), return top 10

**Sidebar Restrukturisasi (nav groups):**
- [x] Frontend: refactor Sidebar.tsx — tambah group header (STATISTIK, ANALISIS, LAPORAN, PENGATURAN)
- [x] Frontend: siapkan placeholder nav item untuk Statistik Pesan, Performa Stasiun, Kualitas Data, Analisis Perilaku, Laporan Bulanan, Konfigurasi Sistem (disabled/dimmed)

---

### Fase 9 — Statistik Pesan ✅ (sudah, diaudit 2026-09-20)

> Data dari tabel `ais_raw_message` (27.5M rows) + join `ais_msg_type` referensi.

- [x] **Audit schema** — dikonfirmasi live: `ais_raw_message` punya `id, station_id, received_at, payload, talker, sentence_type, channel, mmsi, msg_type, decoded_ok, error_message`. `msg_type` terisi baik (top: 1, 19, 18, 4, 3, 24, 20, 5, ...). Tidak ada kolom `class` eksplisit — Class A/B diturunkan dari `msg_type` (1,2,3,4,11,14,17,21 = A; 18,19,24 = B), sudah persis begitu di `messages.py`.
- [x] Backend: `/api/messages/summary` — total pesan, rata-rata per kapal, unique msg_type count, rasio Class A/B, throughput/jam. Cache TTL 300s
- [x] Backend: `/api/messages/by-type` — group by msg_type join `ais_msg_type.name`, sort by volume desc. Cache TTL 3600s
- [x] Backend: `/api/messages/volume-daily` — tren volume 30 hari. Cache TTL 900s
- [x] Backend: `/api/messages/throughput` — throughput per jam, 24 jam terakhir
- [x] Backend: `MessageSummary`, `MessageTypeBreakdown` ada di `schemas/statistics.py`
- [x] Backend: `/api/messages/*` terdaftar di `router.py`
- [x] Frontend: `MessageStatsPage.tsx` — KPI cards, DonutChart komposisi tipe, BarChart per tipe, LineChart volume harian + throughput
- [x] Frontend: route `/messages` terdaftar di `App.tsx`
- [x] Frontend: nav item "Statistik Pesan" aktif di Sidebar (bukan placeholder)
- [x] Worker: `_refresh_messages` ada di `worker.py` (FAST_TASKS, tiap ~4 menit)

Tervalidasi dengan data live (2026-09-20): 244rb pesan/24 jam, 13 msg_type unik, Class A 57% / Class B 38%, throughput ~10.2rb/jam.

---

### Fase 10 — Performa Stasiun ✅ kode sudah, ⚠️ ada keterbatasan data (diaudit 2026-09-20)

> Data dari `ais_base_station`, `vessel_states.last_station_id`, `ais_errors.station_id`.

- [x] **Audit schema** — dikonfirmasi live, TAPI asumsi awal di plan ini **keliru**:
  - `ais_base_station` sekarang 138 rows (bukan 82), kolom: `mmsi, lat, lon, geom, position_accuracy, utc_second, last_report_at`. Ini adalah entitas AIS Base Station yang **disiarkan oleh kapal/pemancar lain** (msg type 4/11) — **bukan** daftar stasiun penerima UVMS sendiri.
  - Stasiun penerima UVMS yang sebenarnya cuma **2**: `"turyapada"` dan `"unud"` (nilai teks di `vessel_states.last_station_id` dan `ais_errors.station_id`), tidak match dengan MMSI numerik di `ais_base_station` sama sekali.
  - `ais_raw_message.station_id` (bigint) ada di schema tapi **100% NULL di seluruh 45 juta baris** — kolom tidak pernah diisi oleh proses ingestion. Jadi `msg_per_hour` di endpoint `/api/stations/performance` akan selalu 0 untuk semua baris.
  - `ais_station` (tabel referensi nama+lokasi stasiun) tetap 0 rows — tidak ada tempat menyimpan lat/lon atau nama resmi untuk "turyapada"/"unud".
- [x] Backend: `/api/stations/performance`, `/api/stations/status`, `/api/stations/summary-kpis` — sudah diimplementasi & terdaftar di router, method dan cache TTL sesuai rencana.
- [x] Backend: `StationPerformance`, `StationKpis` ada di `schemas/statistics.py`.
- [x] Frontend: `StationPerformancePage.tsx` — KPI cards, status badge grid, 2 bar chart, tabel detail — sudah lengkap.
- [x] Frontend: route `/stations` + nav item "Performa Stasiun" aktif.
- [x] Worker: `_refresh_stations` ada di `worker.py`.
- [x] **Diperbaiki 2026-09-20** — `stations.py` ditulis ulang: master list stasiun sekarang diambil dari `vessel_states.last_station_id` (+ `ais_errors.station_id` untuk stasiun yang cuma muncul di error log), bukan `ais_base_station`. Status online/degraded/offline dihitung dari `MAX(vessel_states.last_received_at)` per station_id (threshold sama: online <15 mnt, degraded 15-60 mnt, offline >60 mnt) via `_status_from_last_activity()` di Python, bukan SQL `last_report_at` dari `ais_base_station`. Hasil tervalidasi live: 2 stasiun (`turyapada` 3708 kapal, `unud` 1259 kapal), keduanya online, total cakupan 4967 = cocok dengan total `vessel_states`.
  - `lat`/`lon`/`station_name` tetap `null` — tidak ada tabel referensi manapun (`ais_station` masih 0 rows) yang menyimpan koordinat/nama resmi untuk "turyapada"/"unud". Frontend sudah menangani ini dengan baik (tampil "—" di tabel, badge tetap pakai `station_id` sebagai label). Kalau nanti ada data koordinat resmi dari tim infrastruktur, tinggal isi `station_name`/`lat`/`lon` di `_get_stations()`.
  - `msg_per_hour` tetap 0 untuk semua (chart throughput otomatis disembunyikan di frontend) karena `ais_raw_message.station_id` masih NULL 100% — ini murni keterbatasan data ingestion, bukan sesuatu yang bisa diperbaiki dari sisi API.

---

### Fase 11 — Kualitas Data ✅ (sudah, 1 bug diperbaiki 2026-09-20)

> Data dari tabel `ais_errors` — sekarang 287rb+ rows (bukan 5,761 seperti estimasi awal, terus bertambah).

- [x] **Audit schema** — dikonfirmasi live: `ais_errors` = `id, raw_nmea, error_message, station_id (text), received_at`. **Tidak ada kolom `error_type`** seperti diasumsikan rencana awal — kategorisasi harus dari `error_message` (teks bebas). `station_id` terisi penuh dengan nilai `"unud"` / `"turyapada"` (match dengan `vessel_states.last_station_id`).
- [x] **Bug ditemukan & diperbaiki**: `quality.py` awalnya `SELECT error_type FROM ais_errors` → kolom tidak ada → exception ke-catch diam-diam → `parse_error_count`/`duplicate_count`/`invalid_mmsi_count` selalu 0 dan `/api/quality/by-type` selalu kosong. Diganti jadi kategorisasi `CASE WHEN error_message ILIKE ...` langsung di SQL, bucket: `unsupported_type` (mayoritas — "unsupported AIS packet type ..."), `parse_error`, `duplicate`, `invalid_mmsi`, `other`.
- [x] Backend: `/api/quality/summary` — error_rate_pct, total_errors, breakdown per bucket, status sehat/warning/kritis. Cache TTL 300s
- [x] Backend: `/api/quality/by-station` — pakai `ais_errors.station_id` (real: unud, turyapada) untuk error count; denominator total pesan per stasiun pakai fallback rata-rata (karena `ais_raw_message.station_id` NULL semua — lihat Fase 10), threshold 3%/5% sudah match `_severity()`.
- [x] Backend: `/api/quality/by-type` — distribusi bucket error, sekarang mengembalikan data nyata (contoh live: `unsupported_type` 3480, `parse_error` 22).
- [x] Backend: `/api/quality/trend` — tren error harian 30 hari, sudah tervalidasi (lonjakan ~5800/hari sejak 24 Agustus).
- [x] Backend: `QualitySummary`, `QualityByStation` ada di `schemas/statistics.py`; `/api/quality/*` terdaftar di router.
- [x] Frontend: `DataQualityPage.tsx` — KPI cards, tabel error per stasiun, DonutChart tipe error, LineChart tren — lengkap.
- [x] Frontend: route `/data-quality` + nav item "Kualitas Data" aktif.
- [x] Worker: `_refresh_quality` ada di `worker.py`.

Catatan: `duplicate_count` dan `invalid_mmsi_count` akan tetap 0 di data saat ini karena memang belum pernah ada error dengan kata kunci tersebut di `error_message` — bukan bug, kategori itu memang belum pernah terjadi.

---

### Fase 12 — Analisis Perilaku: Loitering Detection ✅ (selesai & divalidasi 2026-09-20)

> Loitering = kapal dengan SOG < threshold selama durasi panjang dalam area terbatas.
> Query dari `ais_position` (26M rows) — HARUS precomputed, tidak boleh real-time.
> **2026-09-20: diganti total** dengan algoritma P1 dari paper (Setiawan dkk., ICEREAM 2025), spek lengkap di
> `loitering.md`. Algoritma lama (SOG rendah + radius statis) sudah tidak dipakai sebagai deteksi utama.

- [x] Audit data sebelum implementasi (wajib per `loitering.md` §0/§10 checklist):
  - `ais_position` ≈ 41 juta baris (bukan 26 juta seperti estimasi lama, terus bertambah), rentang 2025-12-23 s/d sekarang.
  - Index: `(mmsi, position_time)` composite + `geom` GiST — **tidak ada index `position_time` sendiri**, jadi query rentang waktu tanpa filter MMSI selalu jadi *Parallel Seq Scan* di semua baris (Postgres `EXPLAIN` dikonfirmasi), berapa pun lebar window-nya. Ini keterbatasan level-DB yang sudah ada sebelum fase ini, konsisten dengan lambatnya `/api/traffic/summary-kpis` dkk yang sudah diketahui.
  - `sog_knots` dikonfirmasi **sudah dalam satuan knot asli** (bukan raw AIS 1/10 knot) — sample kapal: rentang 0–34 kn, avg 14.19 kn, wajar.
  - `cog_deg` = 360.00 dipakai sebagai sentinel "tidak tersedia" persis sesuai standar AIS/asumsi paper.
  - Kapal aktif ~5.000 MMSI (jauh dari skala paper 38-98rb) — infra partisi file `work/parts/*.parquet` + Dask di §5.0 loitering.md **tidak dipakai**; trajektori diekstrak langsung di SQL (window function `PARTITION BY mmsi`) memakai index yang sudah ada.
- [x] Data pelabuhan: **tidak ada** di project/DB manapun. Atas persetujuan user, dipakai **World Port Index (NGA Pub 150, edisi 2019)** dari mirror publik GitHub (`tayljordan/ports`), 3.630 pelabuhan tervalidasi → disimpan di `data/ports.csv` (name, lat, lon, country). Dicek relevan: ada Benoa & Celukan Bawang (dekat 2 stasiun kita), plus Surabaya/Gresik/Cilacap/Singapore/Port Hedland/Dampier/Qingdao — cocok dengan `ais_vessel_static.destination` fleet kita (bukan cuma lalu lintas lokal Bali, tapi jalur niaga internasional Indonesia-Australia-Cina).
- [x] Konfigurasi ambang batas — **bukan** `config.yaml` terpisah (tidak konsisten dg pola project ini), tapi field baru di `backend/app/config.py` (`Settings`): `loitering_gap_hours=4.0`, `loitering_min_points=10`, `loitering_sog_std_max=2.0`, `loitering_cog_std_eps=1e-9`, `loitering_drop_logic="and"`, `loitering_avg_sog_kn_lt=2.0`, `loitering_duration_h_gt=2.0`, `loitering_avg_dist_port_km_gt=37.04`, `loitering_lookback_days_default=7`, `loitering_lookback_days_max=30`.
- [x] Backend: `loitering_service.py` ditulis ulang total — 2-pass:
  1. SQL: cleansing (rentang lat/lon/sog/cog) → split trajektori per MMSI (`LAG` + `SUM(...) OVER`, gap > 4 jam) → cleaning (`n_points >= 10`, buang "stationary-like" via `sog_std`/`cog_std`) → pre-filter `avg_sog < 2kn AND durasi > 2 jam` (murah, di SQL).
  2. Python: hanya untuk trajektori yang lolos pass 1 (biasanya sedikit) — ambil titik asli, hitung `avg_dist_port_km` via haversine vektorisasi (numpy) ke 3.630 pelabuhan, filter akhir `> 37.04 km`.
  - `detect_loitering()` dan `get_loitering_detail()` (event id = `mmsi:t_start_unix:t_end_unix`, tidak perlu re-run deteksi utk detail).
- [x] Backend: `/api/behavior/loitering` — query param `date_from`, `date_to` (default lookback 7 hari, maks 30 hari), `avg_sog_kn_lt`, `duration_h_gt`, `avg_dist_port_km_gt`. Cache 1800s per kombinasi param.
- [x] Backend: `/api/behavior/loitering/{event_id}` — detail + track points.
- [x] Backend: `numpy` ditambah ke `requirements.txt` (haversine vektorisasi; scikit-learn/BallTree sengaja dihindari, cukup numpy krn hanya 3.630 pelabuhan).
- [x] Worker: `_refresh_behavior` ditambah ke `SLOW_TASKS` (query berat, window scan multi-hari) — precompute kombinasi parameter default tiap ~24 menit.
- [x] Frontend: `AnalisisPerilakuPage.tsx` (tab Loitering) disesuaikan — filter SOG rata²/durasi(jam)/jarak-pelabuhan(km) menggantikan SOG-instan/radius-meter lama; kolom & detail dialog "Luas Area" → "Jarak Pelabuhan".
- [x] Frontend: route `/behavior`, nav "Analisis Perilaku", tab Pertemuan+Loitering — sudah ada sejak sebelumnya, tidak berubah strukturnya.
- [x] **Divalidasi end-to-end 2026-09-20** dengan data live, window default (7 hari terakhir):
  - **40 event loitering** terdeteksi. Contoh: `BW JOKO TOLE` diam (avg SOG 0.03 kn) selama **~127 jam (5,3 hari)** di 103,6 km dari pelabuhan terdekat; `FERIMAS MULIA` (tanker) diam ~115 jam di 46,4 km dari pelabuhan; beberapa kapal tug (`ASD TRANSKO NURI`, `TRANSKO DARA 3204`) loitering berulang di ~42 km dari pelabuhan — pola yang masuk akal (bukan aktivitas berlabuh normal dekat pelabuhan).
  - `/api/behavior/loitering` & `/api/behavior/loitering/{event_id}` sudah dites lewat cache (respons <1.5 detik) maupun cold-compute.
  - **2 bug ditemukan & diperbaiki saat validasi**: (1) `WindowingError: window function calls cannot be nested` — `LAG()` dipisah ke CTE sendiri sebelum dipakai di dalam `SUM() OVER`. (2) `numpy.MemoryError` — satu trajektori kandidat punya **55.519 titik** (kapal diam sangat lama, AIS melapor tiap beberapa detik/menit), matriks jarak penuh (n_titik × 3.630 pelabuhan) minta 1,5 GB RAM sekaligus. Diperbaiki dengan hitung rata-rata jarak per-batch (4.000 titik/batch) di `_avg_nearest_port_dist_km()`, bukan materialize seluruh matriks sekaligus.
  - **Karakteristik performa dikonfirmasi**: query cold-cache (belum ke-cache worker) untuk *window seberapa pun kecilnya* (1 jam maupun 7 hari) tetap makan **~4 menit** karena *Parallel Seq Scan* penuh 41 juta baris (tidak ada index `position_time` sendiri) — lebar window tidak berpengaruh ke biaya scan awal. Ini konsisten dgn keterbatasan yg sudah didokumentasikan utk fitur lain (traffic/summary-kpis dkk), bukan regresi baru. Precompute worker (`_refresh_behavior`, SLOW_TASK ~24 menit) menjadikan ini tidak masalah utk pengguna akhir (selalu baca dari cache).
- ⚠️ **Ambiguitas dari loitering.md Bagian 9 #2 (belum diputuskan user)**: cleaning trajektori pakai `drop_logic="and"` (default paper) — bisa membuang kapal yang bergerak sangat lambat dengan heading nyaris konstan (justru mirip kandidat loitering asli) karena dianggap "stationary-like". 40 event yang ditemukan mungkin under-count karena efek ini — pertimbangkan uji `drop_logic="or"` sbg pembanding kalau butuh cakupan lebih luas.

---

### Fase 12b — Deteksi Anomali AIS 🚧 (A0-A3 live 2026-09-20, sisanya bertahap)

> Spesifikasi lengkap di `ANOMALY_ALGORITHM.md` (11 detektor aturan A0-A8 + 3 lapisan statistik B1-B3).
> Audit kelayakan penuh sudah dilakukan terhadap skema live — lihat tab "Kelayakan Modul" di halaman `/anomaly`.

- [x] **Tabel `anomaly_events`** dibuat user di `dbais` (DDL: `backend/sql/001_anomaly_events.sql`) — satu tabel untuk semua jenis anomali + loitering, natural key `(mmsi, type, detector, t_start)` untuk upsert, GRANT `SELECT/INSERT/UPDATE` khusus tabel ini ke role `uvms` (tabel AIS mentah tetap read-only). Struktur & hak akses sudah diverifikasi live.
- [x] Backend: `app/services/anomaly_service.py` — `get_a0_summary()` (agregat kualitas data on-demand, TIDAK disimpan per-titik) + `detect_all()` (A1+A2+A3 **digabung dalam satu pass per-MMSI** — satu fetch posisi per kapal dipakai ulang oleh ketiganya, bukan 3 fetch terpisah, supaya durasi worker tidak triple) + `save_events()` (upsert permanen).
- [x] Backend: `/api/anomaly/a0-summary`, `/api/anomaly/summary`, `/api/anomaly/events` — terdaftar di router, live tervalidasi.
- [x] Worker: `_refresh_anomaly` di `SLOW_TASKS` — precompute A1+A2+A3 tiap ~24 menit, upsert ke `anomaly_events`.
- [x] Frontend: `AnomalyPage.tsx`, route `/anomaly`, nav "Deteksi Anomali" — **5 tab**: Kelayakan Modul, A0, A1, A2 (Duplikasi MMSI), A3 (AIS Gap). Semua tab data (A0-A3) baca live dari API; tab Kelayakan statis (penilaian arsitektur).
- [x] **A2 (duplikasi MMSI)** — metode GFW: kelompokkan pesan per-MMSI jadi trek berdasar kecepatan tersirat wajar (≤60kn); ≥2 trek besar tumpang-tindih waktu → kandidat. **Hasil validasi live (window 1 hari) 49 kandidat.**
  - ⚠️ **Bug ditemukan saat validasi**: dengan `min_msgs_per_track=5` (default dokumen) muncul 58 kandidat, tapi mayoritas `track_sizes` seperti `[7620,41,7,5]` — satu kapal asli + "trek hantu" 5-40 titik dari titik korup (efek sama dengan A1 `isolated_outlier` yang belum difilter). Dinaikkan ke **30** → turun ke 49, membantu tapi belum tuntas.
  - **Belum tuntas**: beberapa kandidat kecil (mis. `CAPE CORMORANT` [44,51], `CAPE AMAL` [183,88]) kemungkinan masih noise; kandidat besar-berimbang (`MOUNT GAEA` [1389,1102], `LPG GAS NUSA` [871,932], `KM TANTO ABADI` [1327,999]) lebih meyakinkan. Perbaikan sesungguhnya butuh klasifikasi `isolated_outlier` A1 dulu (buang titik rusak dari data SEBELUM A2 jalan) — belum dikerjakan.
- [x] **A3 (AIS gap)** — **[ADAPT]**: kriteria asli "jarak ke receiver terdekat" **dihilangkan total** (2 stasiun kita tak punya koordinat, lihat audit sebelumnya). Diganti proxy data-driven: kapal lain yang tetap terlihat di sel 0,1°×jam yang sama sebelum & selama gap = area tetap tercakup (bukan receiver padam). **Hasil validasi live: 320 gap terdeteksi.**
  - ⚠️ **Bug ditemukan & diperbaiki saat validasi**: tanpa syarat durasi minimum, "kandidat sengaja" ~40-50% dari semua gap — ternyata dipicu gap PENDEK (~30-60 mnt) dgn `disp_km≈0` di area ramai (dekat pelabuhan, puluhan kapal lain terlihat) = jeda lapor wajar saat kapal diam, bukan aktivitas gelap. Ditambah syarat `gap_h >= 2 jam` → kandidat sengaja turun ke **39 dari 320 (12%)**, jauh lebih masuk akal.
  - **Keterbatasan yang tetap ada** (bukan bug, batasan desain): proxy "kapal lain terlihat" cuma mengukur kepadatan lalu lintas, bukan status receiver sesungguhnya — belum tervalidasi seakurat kriteria jarak-receiver asli dari dokumen.
- [ ] **A4-A8, B1-B3**: belum diimplementasi — lihat matriks kelayakan di tab pertama halaman `/anomaly` untuk status & blocker tiap modul (B1/B2 perlu tambah `scikit-learn`/`scipy`).
- [ ] Klasifikasi 3-jenis jump A1 (`isolated_outlier`/`single_axis`/`persistent_shift`) — prasyarat supaya A2 & A8 tidak tercampur noise titik korup (lihat temuan A2 di atas).

---

### Fase 13 — Vessel Track Histori (2-3 hari)

> Direncanakan sejak awal di API Endpoints (`/api/vessels/{mmsi}/track`) tapi belum diimplementasi.
> Query `ais_position` per-MMSI dengan time range — harus dibatasi window (maks 24-48 jam) karena 26M rows.

- [ ] Backend: `/api/vessels/{mmsi}/track` — track history kapal:
  - Query `ais_position WHERE mmsi = :mmsi AND position_time BETWEEN :from AND :to`
  - Max window 48 jam, limit 2000 points (downsample jika lebih dengan RDP atau time-bucket)
  - Response: list `{time, lat, lon, sog, cog, heading, nav_status}`
  - Cache 15 menit per (mmsi + date_from + date_to hash)
- [ ] Backend: `/api/vessels/{mmsi}` — detail kapal (basic info sudah ada di DataTable, tapi belum ada dedicated endpoint)
- [ ] Frontend: `VesselTrackPage.tsx` atau Dialog track di VesselStatsPage — pilih kapal dari DataTable, buka track viewer:
  - Date range picker (max 48 jam)
  - MapContainer dengan `Polyline` track + `CircleMarker` start/end
  - Timeline slider untuk playback posisi
  - Speed/heading info di hover
- [ ] Frontend: tambah tombol "Lihat Track" di DataTable row actions

---

### Fase 14 — Laporan Bulanan (1-2 hari)

> Beda dengan Export Data (ad-hoc filter + download file).
> Laporan Bulanan = precomputed monthly summary ditampilkan sebagai halaman dashboard, bukan file download.

- [ ] Backend: `/api/reports/monthly` — agregasi per bulan (12 bulan terakhir):
  - total_vessels, total_messages, active_days, top_station, avg_error_rate
  - Data dari `ais_raw_message GROUP BY date_trunc('month', received_at)`
  - Cache TTL 3600s (data bulan lalu tidak berubah)
- [ ] Backend: `/api/reports/monthly/{year}/{month}` — detail bulan spesifik:
  - breakdown per minggu, top vessel types, top stations, error summary
- [ ] Frontend: `MonthlyReportPage.tsx` baru — tabel ringkasan per bulan (12 baris), KPI bulan ini vs bulan lalu, BarChart tren bulanan, tombol drill-down per bulan
- [ ] Frontend: tambah route `/reports/monthly` di App.tsx
- [ ] Frontend: aktifkan nav item "Laporan Bulanan" di Sidebar (pisah dari "Export Data")
- [ ] Worker: tambah `_refresh_monthly_report` task (refresh sekali per jam, data bulanan)

---

### Fase 15 — Docker Production Build (1 hari)

- [ ] Backend `Dockerfile` — multi-stage: Python 3.12-slim, install requirements, copy app, CMD uvicorn
- [ ] Frontend `Dockerfile` — multi-stage: Node build (npm run build), Nginx serve static
- [ ] `docker-compose.yml` — services: backend, frontend-nginx, (redis external / connect to existing)
- [ ] Nginx config — reverse proxy `/api/` → backend:8000, static `/` → frontend dist
- [ ] Environment: `.env.example` dengan semua required vars (DB_URL, REDIS_HOST, CORS_ORIGINS)
- [ ] Test: `docker compose up` → semua service jalan, `/api/health` → OK

---

### Prioritas & Urutan yang Disarankan

```
Fase 8  → quick wins, enhancement halaman existing (2-3 hari)
Fase 9  → Statistik Pesan, audit schema dulu (2-3 hari)  
Fase 10 → Performa Stasiun, bergantung audit schema (2-3 hari)
Fase 11 → Kualitas Data, bergantung audit ais_errors (2-3 hari)
Fase 13 → Vessel Track Histori, feature permintaan spesifik requirement (2-3 hari)
Fase 12 → Loitering Detection, paling berat secara query (2-3 hari)
Fase 14 → Laporan Bulanan (1-2 hari)
Fase 15 → Docker (1 hari, bisa paralel dengan fase lain)
```

**Estimasi total tambahan: ~17-23 hari kerja**

---

## 10. Catatan Penting

### Performance
- `ais_position` 26M rows tanpa partitioning = **bottleneck utama**
- Semua aggregasi dari `ais_position` harus precomputed dan cached
- Query real-time hanya dari `vessel_states` (3.6K rows, cepat)
- Pertimbangkan materialized views di PostgreSQL untuk aggregasi berat

### Security
- Backend hanya READ access ke database (tidak INSERT/UPDATE/DELETE)
- Redis password di environment variable, bukan hardcode
- CORS configured untuk frontend origin saja
- Connection string di `.env`, bukan di source code

### Data Freshness
- `vessel_states` = near real-time (last known position)
- `ais_position` = historical, growing ~terus bertambah
- Dashboard overview refresh setiap 5 menit
- Map positions refresh setiap 2 menit
