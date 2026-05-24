"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "未知渲染错误",
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("MapNews workspace render failed", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="workspace-error" role="alert">
          <p className="eyebrow">地图工作台异常</p>
          <h2>当前地图渲染失败</h2>
          <p>页面其它部分仍可用。刷新页面后如果仍出现此问题，请检查最近的数据或前端变更。</p>
          <small>{this.state.message}</small>
        </section>
      );
    }

    return this.props.children;
  }
}
