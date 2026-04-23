/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import { GlassCard, LiquidButton } from '@opc/ui'

interface ErrorBoundaryProps {
  name: string
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback name={this.props.name} error={this.state.error} />
    }

    return this.props.children
  }
}

function ErrorFallback({ name, error }: { name: string; error: Error | null }) {
  return (
    <GlassCard className="opc-error-fallback" variant="strong">
      <p className="opc-eyebrow">Page Error</p>
      <h1 className="opc-page-title">{name}</h1>
      <p className="opc-page-copy">{error?.message ?? 'Unknown render error'}</p>
      <LiquidButton onClick={() => window.location.reload()}>刷新页面</LiquidButton>
    </GlassCard>
  )
}
