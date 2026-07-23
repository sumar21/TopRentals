import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './ui/UIComponents';
import { backdropClose } from './ui/backdropClose';

// DESIGN.md §4.2 no incluye la interface ni los imports (solo el cuerpo del
// componente) — completados acá siguiendo las props usadas en el JSX.
export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  icon?: React.ReactNode;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, onClose, onConfirm, title, description, confirmText = "Confirm", cancelText = "Cancel", variant = 'default', icon }) => {
  const [isProcessing, setIsProcessing] = React.useState(false);
  if (!isOpen) return null;
  const handleConfirm = async () => { setIsProcessing(true); try { await onConfirm(); } finally { setIsProcessing(false); onClose(); } };
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" {...backdropClose(() => { if (!isProcessing) onClose(); })}>
      <div className="bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-8 flex flex-col items-center text-center">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center mb-4 ${variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'}`}>
            {icon ?? <AlertTriangle className="h-6 w-6" />}
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{description}</p>
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isProcessing}>{cancelText}</Button>
            <Button variant={variant === 'danger' ? 'destructive' : 'default'} className="flex-1 gap-2" disabled={isProcessing} onClick={handleConfirm}>
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}{confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>, document.body);
};
export default ConfirmModal;
