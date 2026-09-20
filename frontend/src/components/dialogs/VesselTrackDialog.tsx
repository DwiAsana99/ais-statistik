import { Dialog, DialogTitle, DialogContent, Box, Typography, IconButton } from "@mui/material";
import { Close, Route } from "@mui/icons-material";
import { THEME_COLORS } from "../../utils/constants";
import VesselTrackViewer from "../vessel/VesselTrackViewer";
import type { VesselListItem } from "../../types";

interface Props {
  vessel: VesselListItem | null;
  open: boolean;
  onClose: () => void;
}

export default function VesselTrackDialog({ vessel, open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle
        sx={{
          backgroundColor: THEME_COLORS.surface,
          color: THEME_COLORS.text,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          py: 1.5,
          borderBottom: `1px solid ${THEME_COLORS.border}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Route sx={{ color: THEME_COLORS.secondary }} />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 15, color: THEME_COLORS.text }}>
              {vessel?.name || `MMSI ${vessel?.mmsi}`}
            </Typography>
            <Typography sx={{ fontSize: 11, color: THEME_COLORS.textSecondary }}>
              Track History · MMSI {vessel?.mmsi}{vessel?.ship_type_group ? ` · ${vessel.ship_type_group}` : ""}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: THEME_COLORS.textSecondary }}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ backgroundColor: THEME_COLORS.background, p: 0 }}>
        {vessel && <VesselTrackViewer key={vessel.mmsi} vessel={vessel} />}
      </DialogContent>
    </Dialog>
  );
}
