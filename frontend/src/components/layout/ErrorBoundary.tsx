import { Component, type ErrorInfo, type ReactNode } from "react";

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
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-base-100 text-base-content">
        <h6 className="text-lg font-semibold">Terjadi kesalahan tak terduga</h6>
        <p className="text-sm text-base-content/60">{this.state.error.message}</p>
        <button
          className="btn btn-secondary"
          onClick={() => {
            this.setState({ error: null });
            window.location.reload();
          }}
        >
          Muat Ulang
        </button>
      </div>
    );
  }
}
