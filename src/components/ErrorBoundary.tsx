import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
  info: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren<unknown>, State> {
  constructor(props: React.PropsWithChildren<unknown>) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, info: null } as Partial<State> as State;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 打印到控制台，方便开发者查看
    console.error('ErrorBoundary caught error:', error, info);
    this.setState({ error, info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-white p-6">
          <div className="max-w-2xl text-left">
            <h2 className="text-lg font-bold text-red-600 mb-2">应用渲染错误</h2>
            <div className="text-sm text-slate-700 mb-3">页面在渲染时出现异常，请查看控制台以获取详细信息。</div>
            <details className="bg-slate-50 p-3 rounded text-xs text-slate-600">
              <summary className="cursor-pointer">查看错误详情</summary>
              <pre className="whitespace-pre-wrap mt-2">{String(this.state.error)}{this.state.info ? '\n' + this.state.info.componentStack : ''}</pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
