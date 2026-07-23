import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/UIComponents';

// Persistent load-failure state for list views — DESIGN.md rule 22 / §9's error
// pattern (red circle + AlertCircle + retry). Renders where EmptyState would go so
// a failed fetch never falls through to "sin resultados", which would lie about why
// there's nothing on screen.
export interface LoadErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export const LoadErrorState: React.FC<LoadErrorStateProps> = ({ message = 'No se pudieron cargar los datos.', onRetry }) => (
  <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-muted/5 text-center">
    <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
      <AlertCircle className="w-8 h-8 text-red-500" />
    </div>
    <p className="text-muted-foreground font-medium text-sm mb-4">{message}</p>
    <Button variant="outline" onClick={onRetry} className="gap-1.5">
      <RefreshCw className="h-3.5 w-3.5" /> Reintentar
    </Button>
  </div>
);

export default LoadErrorState;
