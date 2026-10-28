import React from 'react';
import type { LucideIcon } from 'lucide-react';

// Softer than DESIGN.md §9.3's literal dashed-border recipe: a calm filled surface
// instead of a harsh dashed rectangle, same ícono-en-círculo idea.
export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, message, className }) => (
  <div className={`flex flex-col items-center justify-center p-10 rounded-2xl bg-muted/20 ${className || ''}`}>
    <div className="h-14 w-14 rounded-full bg-muted/60 flex items-center justify-center mb-3">
      <Icon className="h-7 w-7 text-muted-foreground/50" />
    </div>
    <p className="text-sm font-medium text-muted-foreground text-center">{title}</p>
    {message && <p className="text-xs text-muted-foreground/70 mt-1 text-center">{message}</p>}
  </div>
);
export default EmptyState;
