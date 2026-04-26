import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Erros benignos de DOM causados por extensões do navegador (Google Translate,
// Grammarly, etc.) ou por race conditions entre portals do Radix. Esses erros
// não quebram a aplicação — apenas devem ser ignorados.
const isBenignDomError = (error: unknown): boolean => {
  const msg = (error as Error)?.message || String(error || '');
  return (
    /Failed to execute 'removeChild' on 'Node'/i.test(msg) ||
    /Failed to execute 'insertBefore' on 'Node'/i.test(msg) ||
    /The node to be removed is not a child of this node/i.test(msg) ||
    /NotFoundError: The object can not be found here/i.test(msg) ||
    /não é filho deste nó/i.test(msg)
  );
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    if (isBenignDomError(error)) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (isBenignDomError(error)) {
      console.warn('[ErrorBoundary] Ignored benign DOM error:', error.message);
      queueMicrotask(() => this.setState({ hasError: false, error: null }));
      return;
    }
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Algo deu errado</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ocorreu um erro inesperado ao carregar esta página.
              </p>
              {this.state.error?.message && (
                <p className="text-xs text-muted-foreground mt-2 font-mono bg-muted/30 p-2 rounded break-words">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={this.handleReset}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar novamente
              </Button>
              <Button size="sm" onClick={this.handleGoHome}>
                <Home className="w-4 h-4 mr-2" />
                Início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
