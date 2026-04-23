import { Component, type ErrorInfo, type ReactNode } from "react";
import { GlassCard, LiquidButton } from "@opc/ui";

type ErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Panel error", {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <GlassCard className="opc-error-card">
        <strong>{this.props.title ?? "面板加载失败"}</strong>
        <p>{this.state.error.message}</p>
        <LiquidButton onClick={() => this.setState({ error: null })}>重试</LiquidButton>
      </GlassCard>
    );
  }
}
