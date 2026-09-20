-- ============================================================================
-- anomaly_events — riwayat semua hasil detector (anomaly A0-A8/B1-B3 + loitering A5)
-- Satu tabel untuk semua jenis kejadian, supaya query "bulan lalu ada apa saja,
-- kapal mana, dimana" cukup satu SELECT dengan WHERE type/t_start.
--
-- Dijalankan oleh DBA/pemilik server. Setelah ini ada, backend (role `uvms`)
-- hanya diberi SELECT/INSERT/UPDATE pada tabel INI SAJA — tabel AIS mentah
-- (ais_position, ais_raw_message, dst.) tetap read-only seperti sekarang.
-- ============================================================================

CREATE TABLE IF NOT EXISTS anomaly_events (
    id                  BIGSERIAL PRIMARY KEY,

    -- Identitas kejadian & kapal
    mmsi                BIGINT NOT NULL,
    vessel_name         TEXT,                 -- snapshot nama kapal saat terdeteksi (ais_vessel_static bisa berubah)
    ship_type           TEXT,                 -- snapshot group_name ship_type saat terdeteksi

    -- Jenis & asal deteksi
    type                TEXT NOT NULL,        -- JUMP | SOG_MISMATCH | MMSI_DUPLICATE | AIS_GAP | KINEMATIC_SCA
                                               -- | KINEMATIC_TA | LOITERING | ENCOUNTER | CONTEXT_MISMATCH
                                               -- | STAT_OUTLIER | GNSS_INTERFERENCE_CANDIDATE
    detector            TEXT NOT NULL,        -- id modul + versi/hash config, mis. "A1.v1#3f2a9c"

    -- Waktu & lokasi kejadian (BUKAN waktu deteksi dijalankan)
    t_start             TIMESTAMPTZ NOT NULL,
    t_end               TIMESTAMPTZ,          -- null utk kejadian sesaat (mis. satu titik jump)
    lat                 DOUBLE PRECISION,
    lon                 DOUBLE PRECISION,

    -- Skor & klasifikasi
    score               DOUBLE PRECISION,     -- skor mentah dari detector
    confidence          DOUBLE PRECISION,     -- (score-threshold)/threshold, opsional
    severity            TEXT NOT NULL DEFAULT 'unusual',   -- data_quality | unusual | suspicious
    status              TEXT NOT NULL DEFAULT 'candidate', -- candidate | reviewed | confirmed | dismissed

    -- Detail pendukung (jarak, kecepatan, jumlah kapal terlibat, dst — fleksibel per jenis)
    evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Bookkeeping utk kejadian berulang/berkelanjutan (mis. loitering yg masih berjalan
    -- saat worker jalan lagi) — upsert via natural key di bawah, bukan insert baru terus
    first_detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Natural key: kejadian yang sama (kapal + jenis + detector + waktu mulai)
    -- di-upsert, bukan duplikat, saat worker precompute jalan ulang
    CONSTRAINT uq_anomaly_events_natural_key UNIQUE (mmsi, type, detector, t_start)
);

COMMENT ON TABLE anomaly_events IS
    'Riwayat kandidat anomali & loitering hasil semua detector. status selalu "candidate" kecuali direview manual — lihat ANOMALY_ALGORITHM.md Bagian 8.';
COMMENT ON COLUMN anomaly_events.evidence IS
    'JSON bebas per jenis: mis. {"v_imp_kn":..,"jarak_km":..} utk JUMP, {"avg_dist_port_km":..,"point_count":..} utk LOITERING.';

-- Query pola utama: "bulan lalu ada anomaly apa saja, kapal mana, dimana"
CREATE INDEX IF NOT EXISTS idx_anomaly_events_t_start   ON anomaly_events (t_start DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_mmsi      ON anomaly_events (mmsi);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_type      ON anomaly_events (type);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_severity  ON anomaly_events (severity);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_status    ON anomaly_events (status) WHERE status = 'candidate';

-- "dimana" secara spasial (opsional tapi murah — utk filter radius/wilayah di peta nanti)
CREATE INDEX IF NOT EXISTS idx_anomaly_events_geom
    ON anomaly_events USING GIST (ST_SetSRID(ST_MakePoint(lon, lat), 4326))
    WHERE lat IS NOT NULL AND lon IS NOT NULL;

-- updated_at otomatis terisi tiap UPDATE (dipakai worker saat upsert last_seen_at dst.)
CREATE OR REPLACE FUNCTION anomaly_events_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_anomaly_events_updated_at ON anomaly_events;
CREATE TRIGGER trg_anomaly_events_updated_at
    BEFORE UPDATE ON anomaly_events
    FOR EACH ROW EXECUTE FUNCTION anomaly_events_set_updated_at();

-- ============================================================================
-- Izin untuk role backend (uvms) — HANYA pada tabel ini, tabel AIS mentah tetap
-- read-only seperti sekarang (tidak ada GRANT tambahan ke tabel lain).
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON anomaly_events TO uvms;
GRANT USAGE, SELECT ON SEQUENCE anomaly_events_id_seq TO uvms;
