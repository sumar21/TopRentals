import React from 'react';
import { Mountain } from 'lucide-react';   // ← reemplazar por el ícono/isotipo del cliente

interface LoaderProps { text?: string; subtext?: string; size?: 'sm' | 'md' | 'lg'; className?: string; }
const SIZES = {
  sm: { ring: 'h-14 w-14', bubble: 'h-10 w-10', icon: 'h-4 w-4', text: 'text-xs' },
  md: { ring: 'h-[4.5rem] w-[4.5rem]', bubble: 'h-14 w-14', icon: 'h-6 w-6', text: 'text-sm' },
  lg: { ring: 'h-24 w-24', bubble: 'h-[4.5rem] w-[4.5rem]', icon: 'h-9 w-9', text: 'text-base' },
} as const;
export const Loader: React.FC<LoaderProps> = ({ text, subtext, size = 'md', className = '' }) => {
  const s = SIZES[size];
  return (
    <div className={`flex flex-col items-center justify-center text-center animate-in fade-in duration-500 ${className}`}>
      <div className={`relative ${s.ring}`}>
        <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
        <span className="absolute inset-0 rounded-full border-2 border-primary/15 border-t-primary animate-spin" />
        <div className={`absolute inset-0 m-auto ${s.bubble} rounded-full bg-background border border-primary/10 shadow-sm flex items-center justify-center`}>
          <Mountain className={`${s.icon} text-primary animate-pulse`} />
        </div>
      </div>
      {text && <p className={`mt-4 font-medium text-muted-foreground ${s.text}`}>{text}</p>}
      {subtext && <p className="mt-1 text-xs text-muted-foreground/70">{subtext}</p>}
    </div>
  );
};
export default Loader;
