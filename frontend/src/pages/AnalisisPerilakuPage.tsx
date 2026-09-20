import { useState } from "react";
import { Box, Typography, Tabs, Tab } from "@mui/material";
import { Psychology, Sync } from "@mui/icons-material";
import { THEME_COLORS } from "../utils/constants";
import EncountersPage from "./EncountersPage";
import LoiteringPage from "./LoiteringPage";

export default function AnalisisPerilakuPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600 }}>
          Analisis Perilaku
        </Typography>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            minHeight: 36,
            "& .MuiTab-root": {
              minHeight: 36,
              fontSize: 13,
              color: THEME_COLORS.textSecondary,
              textTransform: "none",
              "&.Mui-selected": { color: THEME_COLORS.secondary },
            },
            "& .MuiTabs-indicator": { backgroundColor: THEME_COLORS.secondary },
          }}
        >
          <Tab icon={<Sync sx={{ fontSize: 18 }} />} iconPosition="start" label="Pertemuan Kapal" />
          <Tab icon={<Psychology sx={{ fontSize: 18 }} />} iconPosition="start" label="Loitering" />
        </Tabs>
      </Box>

      {tab === 0 && <EncountersPage />}
      {tab === 1 && <LoiteringPage />}
    </Box>
  );
}
