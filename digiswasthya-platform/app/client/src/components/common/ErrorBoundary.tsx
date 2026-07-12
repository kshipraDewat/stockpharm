import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Something went wrong</h2>
          <p className="text-sm text-slate-500 mb-4 max-w-md">
            This page failed to load. Try again or reload the app.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-xs text-left bg-slate-100 p-3 rounded-lg mb-4 max-w-lg overflow-auto text-red-700">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={this.handleRetry} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Try again
            </Button>
            <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
