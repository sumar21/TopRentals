import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2 } from 'lucide-react';

interface SuccessCardProps {
  open: boolean; title: string; subtitle?: string; actionLabel: string; onDismiss: () => void;
  durationMs?: number;                    // la barra se vacía en este tiempo, luego auto-dismiss (default 5s)
  variant?: 'overlay' | 'contained';
}

export const SuccessCard: React.FC<SuccessCardProps> = ({ open, title, subtitle, actionLabel, onDismiss, durationMs = 5000, variant = 'overlay' }) => {
  const [runId, setRunId] = useState(0);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    setRunId(r => r + 1);
    const timer = setTimeout(() => onDismissRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);
  if (!open) return null;

  if (variant === 'contained') {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-emerald-50/95 backdrop-blur-[2px] px-6 text-center animate-in fade-in duration-200" onClick={onDismiss}>
        <style>{`@keyframes scz-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
        <div className="flex flex-col items-center" onClick={e => e.stopPropagation()}>
          <div className="relative mb-5">
            <span className="absolute inset-0 rounded-full bg-emerald-500/15 animate-ping" />
            <div className="relative h-16 w-16 rounded-full border-[3px] border-emerald-500 flex items-center justify-center">
              <Check className="h-9 w-9 text-emerald-600" strokeWidth={2.6} />
            </div>
          </div>
          <h3 className="text-xl font-bold text-emerald-900">{title}</h3>
          {subtitle && <p className="text-sm text-emerald-700/80 mt-1.5">{subtitle}</p>}
          <button onClick={onDismiss} className="mt-6 px-5 h-10 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors">{actionLabel}</button>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-100 overflow-hidden">
          <div key={runId} className="h-full w-full bg-emerald-500 origin-left" style={{ animation: `scz-shrink ${durationMs}ms linear forwards` }} />
        </div>
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onDismiss}>
      <style>{`@keyframes scz-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
      <div className="bg-background w-full max-w-sm rounded-2xl shadow-2xl border overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-8 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            <div className="relative h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9" strokeWidth={2.2} />
            </div>
          </div>
          <h3 className="text-xl font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
          <button onClick={onDismiss} className="mt-6 w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors">{actionLabel}</button>
        </div>
        <div className="h-1.5 bg-muted overflow-hidden">
          <div key={runId} className="h-full w-full bg-emerald-500 origin-left" style={{ animation: `scz-shrink ${durationMs}ms linear forwards` }} />
        </div>
      </div>
    </div>, document.body);
};
export default SuccessCard;
