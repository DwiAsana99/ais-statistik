import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Typography, Button } from "@mui/material";
import { THEME_COLORS } from "../../utils/constants";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 2,
          backgroundColor: THEME_COLORS.background,
          color: THEME_COLORS.text,
        }}
      >
        <Typography variant="h6">Terjadi kesalahan tak terduga</Typography>
        <Typography sx={{ color: THEME_COLORS.textSecondary, fontSize: 13 }}>
          {this.state.error.message}
        </Typography>
        <Button
          variant="contained"
          onClick={() => {
            this.setState({ error: null });
            window.location.reload();
          }}
          sx={{ backgroundColor: THEME_COLORS.secondary }}
        >
          Muat Ulang
        </Button>
      </Box>
    );
  }
}
