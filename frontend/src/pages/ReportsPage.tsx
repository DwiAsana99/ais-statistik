import { useState } from "react";
import { saveAs } from "file-saver";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import { Download, TableChart, PictureAsPdf, GridOn } from "@mui/icons-material";
import api from "../api/client";
import { THEME_COLORS } from "../utils/constants";

type ReportType = "vessels" | "encounters";
type Format = "csv" | "excel" | "pdf";

const SHIP_TYPES = [
  "Cargo", "Tanker", "Fishing", "Passenger", "Tug", "Sailing",
  "Military", "Pleasure", "Towing", "Other", "Not available",
];

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReportsPage() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

  const [reportType, setReportType] = useState<ReportType>("vessels");
  const [format, setFormat] = useState<Format>("csv");
  const [search, setSearch] = useState("");
  const [shipType, setShipType] = useState("");
  const [dateFrom, setDateFrom] = useState(toLocalInput(yesterday));
  const [dateTo, setDateTo] = useState(toLocalInput(now));
  const [distanceM, setDistanceM] = useState(500);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { format, report_type: reportType };
      if (reportType === "vessels") {
        if (search) params.search = search;
        if (shipType) params.ship_type = shipType;
      } else {
        params.date_from = new Date(dateFrom).toISOString();
        params.date_to = new Date(dateTo).toISOString();
        params.distance_m = distanceM;
      }

      const res = await api.get("/api/reports/export", { params, responseType: "blob" });

      const disposition = res.headers["content-disposition"] as string | undefined;
      const match = disposition?.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `${reportType}.${format === "excel" ? "xlsx" : format}`;

      saveAs(res.data as Blob, filename);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Gagal mengekspor laporan. Coba lagi atau perkecil rentang data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 3 }}>
        Laporan
      </Typography>

      <Paper
        sx={{
          p: 3,
          backgroundColor: THEME_COLORS.surface,
          border: `1px solid ${THEME_COLORS.border}`,
          borderRadius: 2,
          maxWidth: 640,
        }}
        elevation={0}
      >
        <Typography sx={{ fontSize: 12, color: THEME_COLORS.textSecondary, mb: 1, fontWeight: 600 }}>
          JENIS LAPORAN
        </Typography>
        <ToggleButtonGroup
          value={reportType}
          exclusive
          onChange={(_, v) => v && setReportType(v)}
          size="small"
          fullWidth
          sx={{
            mb: 3,
            "& .MuiToggleButton-root": {
              color: THEME_COLORS.textSecondary,
              borderColor: THEME_COLORS.border,
              textTransform: "none",
              "&.Mui-selected": {
                color: THEME_COLORS.secondary,
                backgroundColor: `${THEME_COLORS.secondary}18`,
              },
            },
          }}
        >
          <ToggleButton value="vessels">Daftar Kapal</ToggleButton>
          <ToggleButton value="encounters">Pertemuan Kapal</ToggleButton>
        </ToggleButtonGroup>

        {reportType === "vessels" ? (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Cari nama / MMSI / call sign"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ color: THEME_COLORS.textSecondary, fontSize: 13 }}>Tipe Kapal</InputLabel>
                <Select
                  value={shipType}
                  label="Tipe Kapal"
                  onChange={(e) => setShipType(e.target.value)}
                  sx={{ color: THEME_COLORS.text, fontSize: 13 }}
                >
                  <MenuItem value="">Semua</MenuItem>
                  {SHIP_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        ) : (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                type="datetime-local"
                label="Dari"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                type="datetime-local"
                label="Sampai"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Jarak Maks (m)"
                value={distanceM}
                onChange={(e) => setDistanceM(Number(e.target.value))}
                sx={{ "& .MuiInputBase-input": { color: THEME_COLORS.text, fontSize: 13 } }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>
                Rentang waktu dibatasi maks 24 jam untuk menjaga performa query.
              </Typography>
            </Grid>
          </Grid>
        )}

        <Typography sx={{ fontSize: 12, color: THEME_COLORS.textSecondary, mb: 1, fontWeight: 600 }}>
          FORMAT
        </Typography>
        <ToggleButtonGroup
          value={format}
          exclusive
          onChange={(_, v) => v && setFormat(v)}
          size="small"
          fullWidth
          sx={{
            mb: 3,
            "& .MuiToggleButton-root": {
              color: THEME_COLORS.textSecondary,
              borderColor: THEME_COLORS.border,
              textTransform: "none",
              gap: 0.5,
              "&.Mui-selected": {
                color: THEME_COLORS.secondary,
                backgroundColor: `${THEME_COLORS.secondary}18`,
              },
            },
          }}
        >
          <ToggleButton value="csv"><TableChart fontSize="small" sx={{ mr: 0.5 }} /> CSV</ToggleButton>
          <ToggleButton value="excel"><GridOn fontSize="small" sx={{ mr: 0.5 }} /> Excel</ToggleButton>
          <ToggleButton value="pdf"><PictureAsPdf fontSize="small" sx={{ mr: 0.5 }} /> PDF</ToggleButton>
        </ToggleButtonGroup>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Button
          fullWidth
          variant="contained"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Download />}
          onClick={handleExport}
          disabled={loading}
          sx={{ backgroundColor: THEME_COLORS.secondary, "&:hover": { backgroundColor: "#b87d08" } }}
        >
          {loading ? "Mengekspor..." : "Export Laporan"}
        </Button>
      </Paper>
    </Box>
  );
}
