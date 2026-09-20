import { useLocation, useNavigate } from "react-router-dom";
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  IconButton,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  DirectionsBoat,
  TrendingUp,
  Map as MapIcon,
  Assessment,
  Sync,
  ChevronLeft,
  ChevronRight,
  Message,
  Router,
  VerifiedUser,
  Psychology,
  CalendarMonth,
  Settings,
  Rule,
} from "@mui/icons-material";
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, NAV_GROUPS, THEME_COLORS } from "../../utils/constants";

const ICONS: Record<string, React.ReactElement> = {
  Dashboard: <DashboardIcon />,
  DirectionsBoat: <DirectionsBoat />,
  TrendingUp: <TrendingUp />,
  Map: <MapIcon />,
  Assessment: <Assessment />,
  Sync: <Sync />,
  Message: <Message />,
  Router: <Router />,
  VerifiedUser: <VerifiedUser />,
  Psychology: <Psychology />,
  CalendarMonth: <CalendarMonth />,
  Settings: <Settings />,
  Rule: <Rule />,
};

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open, onToggle, mobile = false, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const expanded = mobile ? true : open;
  const width = expanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  const handleNavigate = (path: string) => {
    navigate(path);
    if (mobile && onClose) onClose();
  };

  return (
    <Drawer
      variant={mobile ? "temporary" : "permanent"}
      open={mobile ? open : true}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        width: mobile ? 0 : width,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: mobile ? SIDEBAR_WIDTH : width,
          transition: "width 0.2s ease",
          overflowX: "hidden",
          backgroundColor: THEME_COLORS.background,
          borderRight: `1px solid ${THEME_COLORS.border}`,
          color: THEME_COLORS.text,
        },
      }}
    >
      <Box
        sx={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: expanded ? "space-between" : "center",
          px: expanded ? 2 : 0,
          borderBottom: `1px solid ${THEME_COLORS.border}`,
        }}
      >
        {expanded && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: THEME_COLORS.secondary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                color: "#fff",
              }}
            >
              U
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                UVMS
              </Typography>
              <Typography variant="caption" sx={{ color: THEME_COLORS.textSecondary, fontSize: 10 }}>
                Modul Statistik AIS
              </Typography>
            </Box>
          </Box>
        )}
        {!mobile && (
          <IconButton onClick={onToggle} size="small" sx={{ color: THEME_COLORS.textSecondary }}>
            {open ? <ChevronLeft /> : <ChevronRight />}
          </IconButton>
        )}
      </Box>

      <List sx={{ pt: 1 }}>
        {NAV_GROUPS.map((group, gi) => (
          <Box key={gi}>
            {group.groupLabel && expanded && (
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: THEME_COLORS.textSecondary,
                  letterSpacing: 1,
                  px: 2,
                  pt: gi === 0 ? 1 : 2,
                  pb: 0.5,
                  opacity: 0.7,
                }}
              >
                {group.groupLabel}
              </Typography>
            )}
            {group.items.map((item) => {
              const isActive = !item.disabled && (
                item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path)
              );
              return (
                <ListItemButton
                  key={item.path}
                  disabled={item.disabled}
                  onClick={() => !item.disabled && handleNavigate(item.path)}
                  sx={{
                    mx: 1,
                    mb: 0.5,
                    borderRadius: 1,
                    minHeight: 40,
                    justifyContent: expanded ? "initial" : "center",
                    backgroundColor: isActive ? THEME_COLORS.surfaceLight : "transparent",
                    borderLeft: isActive ? `3px solid ${THEME_COLORS.secondary}` : "3px solid transparent",
                    opacity: item.disabled ? 0.4 : 1,
                    "&:hover": {
                      backgroundColor: item.disabled ? "transparent" : THEME_COLORS.surfaceLight,
                    },
                    "&.Mui-disabled": { opacity: 0.4 },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: expanded ? 2 : 0,
                      justifyContent: "center",
                      color: isActive ? THEME_COLORS.secondary : THEME_COLORS.textSecondary,
                    }}
                  >
                    {ICONS[item.icon]}
                  </ListItemIcon>
                  {expanded && (
                    <ListItemText
                      primary={item.label}
                      slotProps={{
                        primary: {
                          sx: {
                            fontSize: 13,
                            fontWeight: isActive ? 600 : 400,
                            color: isActive ? THEME_COLORS.text : THEME_COLORS.textSecondary,
                          },
                        },
                      }}
                    />
                  )}
                </ListItemButton>
              );
            })}
          </Box>
        ))}
      </List>
    </Drawer>
  );
}
