import { useState, useEffect, useCallback } from "react";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  TextField,
  InputAdornment,
  Box,
  Typography,
  Chip,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Search, Route } from "@mui/icons-material";
import api from "../../api/client";
import { THEME_COLORS } from "../../utils/constants";
import { formatNumber, truncate } from "../../utils/formatters";
import type { VesselListItem, PaginatedResponse } from "../../types";

const NAV_STATUS_COLORS: Record<string, string> = {
  "Under way using engine": "#4caf50",
  "At anchor": "#ff9800",
  "Moored": "#2196f3",
  "Under way sailing": "#00bcd4",
  "Engaged in fishing": "#e91e63",
  "Not defined": "#9e9e9e",
  "Aground": "#f44336",
};

const SHIP_TYPES = [
  "Cargo", "Tanker", "Fishing", "Passenger", "Tug", "Sailing",
  "Military", "Pleasure", "Towing", "Other", "Not available",
];

type SortField = "name" | "mmsi" | "ship_type" | "length" | "last_update";

interface DataTableProps {
  initialSearch?: string;
  onTrackView?: (vessel: VesselListItem) => void;
}

const cellSx = {
  color: THEME_COLORS.text,
  borderBottom: `1px solid ${THEME_COLORS.border}`,
  fontSize: 13,
  py: 1.2,
};

const headCellSx = {
  ...cellSx,
  fontWeight: 600,
  color: THEME_COLORS.textSecondary,
  fontSize: 12,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
};

export default function DataTable({ initialSearch = "", onTrackView }: DataTableProps) {
  const [data, setData] = useState<PaginatedResponse<VesselListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [search, setSearch] = useState(initialSearch);
  const [shipType, setShipType] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: page + 1,
        page_size: rowsPerPage,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (searchDebounced) params.search = searchDebounced;
      if (shipType) params.ship_type = shipType;

      const res = await api.get("/api/vessels", { params });
      setData(res.data);
    } catch (err) {
      console.error("Failed to load vessels:", err);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchDebounced, shipType, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(0);
  }, [searchDebounced, shipType]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  return (
    <Paper
      sx={{
        backgroundColor: THEME_COLORS.surface,
        border: `1px solid ${THEME_COLORS.border}`,
        borderRadius: 2,
        overflow: "hidden",
      }}
      elevation={0}
    >
      <Box sx={{ p: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          size="small"
          placeholder="Cari nama, MMSI, call sign..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: THEME_COLORS.textSecondary, fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            width: 300,
            "& .MuiOutlinedInput-root": {
              backgroundColor: THEME_COLORS.surfaceLight,
              color: THEME_COLORS.text,
              fontSize: 13,
              "& fieldset": { borderColor: THEME_COLORS.border },
              "&:hover fieldset": { borderColor: THEME_COLORS.textSecondary },
            },
          }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ color: THEME_COLORS.textSecondary, fontSize: 13 }}>Tipe Kapal</InputLabel>
          <Select
            value={shipType}
            onChange={(e) => setShipType(e.target.value)}
            label="Tipe Kapal"
            sx={{
              backgroundColor: THEME_COLORS.surfaceLight,
              color: THEME_COLORS.text,
              fontSize: 13,
              "& fieldset": { borderColor: THEME_COLORS.border },
            }}
          >
            <MenuItem value="">Semua</MenuItem>
            {SHIP_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flexGrow: 1 }} />
        {data && (
          <Typography variant="caption" sx={{ color: THEME_COLORS.textSecondary }}>
            {formatNumber(data.total)} kapal ditemukan
          </Typography>
        )}
      </Box>

      <TableContainer sx={{ maxHeight: "calc(100vh - 380px)" }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headCellSx}>
                <TableSortLabel
                  active={sortBy === "mmsi"}
                  direction={sortBy === "mmsi" ? sortOrder : "asc"}
                  onClick={() => handleSort("mmsi")}
                  sx={{ color: `${THEME_COLORS.textSecondary} !important` }}
                >
                  MMSI
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headCellSx}>
                <TableSortLabel
                  active={sortBy === "name"}
                  direction={sortBy === "name" ? sortOrder : "asc"}
                  onClick={() => handleSort("name")}
                  sx={{ color: `${THEME_COLORS.textSecondary} !important` }}
                >
                  Nama Kapal
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headCellSx}>Call Sign</TableCell>
              <TableCell sx={headCellSx}>IMO</TableCell>
              <TableCell sx={headCellSx}>
                <TableSortLabel
                  active={sortBy === "ship_type"}
                  direction={sortBy === "ship_type" ? sortOrder : "asc"}
                  onClick={() => handleSort("ship_type")}
                  sx={{ color: `${THEME_COLORS.textSecondary} !important` }}
                >
                  Tipe
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headCellSx}>
                <TableSortLabel
                  active={sortBy === "length"}
                  direction={sortBy === "length" ? sortOrder : "asc"}
                  onClick={() => handleSort("length")}
                  sx={{ color: `${THEME_COLORS.textSecondary} !important` }}
                >
                  LOA (m)
                </TableSortLabel>
              </TableCell>
              <TableCell sx={headCellSx}>Lebar (m)</TableCell>
              <TableCell sx={headCellSx}>Status</TableCell>
              <TableCell sx={headCellSx}>SOG (kn)</TableCell>
              <TableCell sx={headCellSx}>Tujuan</TableCell>
              {onTrackView && <TableCell sx={{ ...headCellSx, width: 48 }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={onTrackView ? 11 : 10} sx={{ ...cellSx, textAlign: "center", py: 6 }}>
                  <CircularProgress size={28} sx={{ color: THEME_COLORS.secondary }} />
                </TableCell>
              </TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={onTrackView ? 11 : 10} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                  <Typography sx={{ color: THEME_COLORS.textSecondary }}>Tidak ada data</Typography>
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((v) => (
                <TableRow
                  key={v.mmsi}
                  hover
                  sx={{
                    "&:hover": { backgroundColor: `${THEME_COLORS.surfaceLight} !important` },
                    cursor: "default",
                  }}
                >
                  <TableCell sx={cellSx}>
                    <Typography sx={{ fontFamily: "monospace", fontSize: 13, color: THEME_COLORS.text }}>
                      {v.mmsi}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ ...cellSx, fontWeight: 500 }}>
                    {v.name || "-"}
                  </TableCell>
                  <TableCell sx={cellSx}>{v.call_sign || "-"}</TableCell>
                  <TableCell sx={cellSx}>{v.imo || "-"}</TableCell>
                  <TableCell sx={cellSx}>
                    {v.ship_type_group ? (
                      <Chip
                        label={v.ship_type_group}
                        size="small"
                        sx={{
                          fontSize: 11,
                          height: 22,
                          backgroundColor: `${THEME_COLORS.primary}30`,
                          color: THEME_COLORS.text,
                        }}
                      />
                    ) : "-"}
                  </TableCell>
                  <TableCell sx={cellSx}>{v.length_m ?? "-"}</TableCell>
                  <TableCell sx={cellSx}>{v.width_m ?? "-"}</TableCell>
                  <TableCell sx={cellSx}>
                    {v.last_nav_status ? (
                      <Chip
                        label={v.last_nav_status}
                        size="small"
                        sx={{
                          fontSize: 11,
                          height: 22,
                          backgroundColor: `${NAV_STATUS_COLORS[v.last_nav_status] || "#666"}25`,
                          color: NAV_STATUS_COLORS[v.last_nav_status] || THEME_COLORS.textSecondary,
                          border: `1px solid ${NAV_STATUS_COLORS[v.last_nav_status] || "#666"}40`,
                        }}
                      />
                    ) : "-"}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    {v.last_sog != null ? v.last_sog.toFixed(1) : "-"}
                  </TableCell>
                  <TableCell sx={cellSx}>{truncate(v.destination, 20)}</TableCell>
                  {onTrackView && (
                    <TableCell sx={{ ...cellSx, p: 0.5 }}>
                      <Tooltip title="Lihat Track">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); onTrackView(v); }}
                          sx={{ color: THEME_COLORS.secondary, opacity: 0.7, "&:hover": { opacity: 1 } }}
                        >
                          <Route fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {data && (
        <TablePagination
          component="div"
          count={data.total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 15, 25, 50]}
          labelRowsPerPage="Baris/halaman:"
          sx={{
            color: THEME_COLORS.textSecondary,
            borderTop: `1px solid ${THEME_COLORS.border}`,
            "& .MuiTablePagination-selectIcon": { color: THEME_COLORS.textSecondary },
          }}
        />
      )}
    </Paper>
  );
}
