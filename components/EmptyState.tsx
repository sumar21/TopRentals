import React from 'react';
import type { LucideIcon } from 'lucide-react';

// Compuesto a partir del patrón canónico de empty state de DESIGN.md §9.3
// (no hay un componente <EmptyState> literal en el doc, solo la clase base):
// border-2 border-dashed + ícono en círculo.
export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, message, className }) => (
  <div className={`flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl bg-muted/5 ${className || ''}`}>
    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-muted-foreground/40" />
    </div>
    <p className="text-muted-foreground font-medium text-sm text-center">{title}</p>
    {message && <p className="text-muted-foreground/70 text-xs text-center mt-1">{message}</p>}
  </div>
);
export default EmptyState;
