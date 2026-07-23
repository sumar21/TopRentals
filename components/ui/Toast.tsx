import React, { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: string; message: string; type: ToastType; duration: number; }
interface ToastContextType { showToast: (message: string, type?: ToastType, duration?: number) => void; }

const ToastContext = createContext<ToastContextType | undefined>(undefined);
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const ICONS: Record<ToastType, React.ElementType> = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };
const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error:   'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info:    'bg-blue-50 border-blue-200 text-blue-800',
};
const ICON_COLORS: Record<ToastType, string> = { success: 'text-emerald-500', error: 'text-red-500', warning: 'text-amber-500', info: 'text-blue-500' };

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const Icon = ICONS[toast.type];
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    timerRef.current = setTimeout(() => onRemove(toast.id), toast.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, toast.duration, onRemove]);
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-md animate-in slide-in-from-top-2 fade-in duration-200 ${STYLES[toast.type]}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${ICON_COLORS[toast.type]}`} />
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button onClick={() => onRemove(toast.id)} aria-label="Cerrar" className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);
  const removeToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && createPortal(
        <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2">
          {toasts.map(t => <ToastItem key={t.id} toast={t} onRemove={removeToast} />)}
        </div>, document.body)}
    </ToastContext.Provider>
  );
};
