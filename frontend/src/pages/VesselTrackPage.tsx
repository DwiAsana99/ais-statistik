import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Paper, Autocomplete, TextField, Chip,
} from "@mui/material";
import { Route } from "@mui/icons-material";
import api from "../api/client";
import { THEME_COLORS } from "../utils/constants";
import VesselTrackViewer from "../components/vessel/VesselTrackViewer";
import type { VesselListItem } from "../types";

export default function VesselTrackPage() {
  const [inputValue, setInputValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [options, setOptions] = useState<VesselListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [vessel, setVessel] = useState<VesselListItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(inputValue), 400);
    return () => clearTimeout(t);
  }, [inputValue]);

  const search = useCallback(async (term: string) => {
    if (!term) {
      setOptions([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get("/api/vessels", { params: { search: term, page: 1, page_size: 15 } });
      setOptions(res.data.items);
    } catch (err) {
      console.error("Failed to search vessels:", err);
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => { search(debounced); }, [debounced, search]);

  return (
    <Box>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 3 }}>
        Track Kapal
      </Typography>

      <Paper
        sx={{ p: 2.5, mb: 2.5, backgroundColor: THEME_COLORS.surface, border: `1px solid ${THEME_COLORS.border}`, borderRadius: 2 }}
        elevation={0}
      >
        <Autocomplete
          fullWidth
          options={options}
          value={vessel}
          onChange={(_, v) => setVessel(v)}
          inputValue={inputValue}
          onInputChange={(_, v) => setInputValue(v)}
          getOptionLabel={(o) => o.name || `MMSI ${o.mmsi}`}
          isOptionEqualToValue={(o, v) => o.mmsi === v.mmsi}
          loading={searching}
          noOptionsText={inputValue ? "Kapal tidak ditemukan" : "Ketik nama, MMSI, atau call sign kapal"}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.mmsi} sx={{ display: "flex", alignItems: "center", gap: 1.5, justifyContent: "space-between" }}>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{option.name || `MMSI ${option.mmsi}`}</Typography>
                <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>
                  MMSI {option.mmsi}{option.call_sign ? ` · ${option.call_sign}` : ""}
                </Typography>
              </Box>
              {option.ship_type_group && (
                <Chip label={option.ship_type_group} size="small" sx={{ height: 20, fontSize: 10 }} />
              )}
            </Box>
          )}
          renderInput={(params) => (
            <TextField {...params} placeholder="Cari kapal — nama, MMSI, atau call sign..." />
          )}
        />
      </Paper>

      {vessel ? (
        <VesselTrackViewer key={vessel.mmsi} vessel={vessel} />
      ) : (
        <Paper
          sx={{
            p: 6, textAlign: "center", backgroundColor: THEME_COLORS.surface,
            border: `1px solid ${THEME_COLORS.border}`, borderRadius: 2,
          }}
          elevation={0}
        >
          <Route sx={{ fontSize: 40, color: THEME_COLORS.textSecondary, opacity: 0.5, mb: 1 }} />
          <Typography sx={{ color: THEME_COLORS.textSecondary, fontSize: 13 }}>
            Pilih kapal di atas untuk melihat riwayat track posisinya di peta.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
