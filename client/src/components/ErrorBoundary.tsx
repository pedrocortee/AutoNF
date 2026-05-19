import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Algo deu errado</h1>
            <p className="text-slate-500 mb-4 text-sm">{this.state.error?.message}</p>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
