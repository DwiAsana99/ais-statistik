import { Box, Typography } from "@mui/material";
import VesselMap from "../components/maps/VesselMap";
import { THEME_COLORS, HEADER_HEIGHT } from "../utils/constants";

export default function MapPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: `calc(100vh - ${HEADER_HEIGHT}px - 32px)` }}>
      <Typography variant="h6" sx={{ color: THEME_COLORS.text, fontWeight: 600, mb: 2, flexShrink: 0 }}>
        Peta Sebaran Kapal
      </Typography>
      <Box
        sx={{
          flex: 1,
          borderRadius: 2,
          overflow: "hidden",
          border: `1px solid ${THEME_COLORS.border}`,
        }}
      >
        <VesselMap />
      </Box>
    </Box>
  );
}
