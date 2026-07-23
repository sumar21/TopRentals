// Artículos — catálogo de precios (ABM). See docs/analysis/desktop_Screen_Configuracion.md.
// Único consola totalmente viva en la PA original; la migración a Supabase deja la
// sincronización código/nombre/precio -> stock (antes un ForAll de Patch) como trabajo
// del backend vía FK (services/api.ts ya no expone ese fan-out).
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Pencil, Ban, CheckCircle2, Save, X, Loader2, AlertCircle, PackageSearch } from 'lucide-react';
import { api } from '../../services/index.ts';
import type { Articulo } from '../../services/types.ts';
import { Card, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button, Input, cn, useModalAnimation } from '../ui/UIComponents';
import { MoneyInput } from '../ui/MoneyInput';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { useToast } from '../ui/Toast';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import ConfirmModal from '../ConfirmModal';
import { backdropClose } from '../ui/backdropClose';
import { maskFromNumber, parseMoney } from '../../utils/formatMoneyInput';

interface FormState { codigo: string; nombre: string; precio: string; corte: string; detalle: string; }
const emptyForm: FormState = { codigo: '', nombre: '', precio: '', corte: '', detalle: '' };

const ArticuloFormModal: React.FC<{
  isOpen: boolean; onClose: () => void; onSaved: () => void; articulo: Articulo | null; articulos: Articulo[];
}> = ({ isOpen, onClose, onSaved, articulo, articulos }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(articulo
        ? { codigo: articulo.codigo ?? '', nombre: articulo.nombre, precio: maskFromNumber(articulo.precio_unitario), corte: String(articulo.corte ?? ''), detalle: articulo.detalle ?? '' }
        : emptyForm);
      setErrors({});
    }
  }, [isOpen, articulo]);

  if (!visible) return null;

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    const codigo = form.codigo.trim();
    const nombre = form.nombre.trim();
    if (!codigo) next.codigo = 'El código es obligatorio.';
    else if (articulos.some((a) => a.id !== articulo?.id && (a.codigo ?? '').trim() === codigo)) next.codigo = 'Ya existe un artículo con este código.';
    if (!nombre) next.nombre = 'El nombre es obligatorio.';
    else if (articulos.some((a) => a.id !== articulo?.id && a.nombre.trim().toLowerCase() === nombre.toLowerCase())) next.nombre = 'Ya existe un artículo con este nombre.';
    if (!form.precio || parseMoney(form.precio) <= 0) next.precio = 'Ingresá un precio válido.';
    if (form.corte === '' || Number(form.corte) < 0) next.corte = 'Ingresá un stock mínimo válido.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        precio_unitario: parseMoney(form.precio),
        corte: Number(form.corte),
        detalle: form.detalle.trim() || null,
        status: articulo?.status ?? ('Activo' as const),
      };
      if (articulo) await api.articulos.actualizar(articulo.id, payload);
      else await api.articulos.crear(payload);
      showToast(articulo ? 'Artículo actualizado.' : 'Artículo creado.', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('No se pudo guardar el artículo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const err = (field: keyof FormState) => errors[field] && (
    <p role="alert" className="text-[10px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="h-3 w-3 shrink-0" /> {errors[field]}</p>
  );

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-lg rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{articulo ? 'Editar artículo' : 'Nuevo artículo'}</h2>
            <p className="text-xs text-muted-foreground">Catálogo de precios</p>
          </div>
          <button onClick={saving ? undefined : onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Código<span className="text-destructive ml-0.5">*</span></label>
              <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                aria-invalid={!!errors.codigo} className={cn(errors.codigo && 'border-destructive focus:border-destructive focus:ring-destructive/30')} />
              {err('codigo')}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Stock mínimo<span className="text-destructive ml-0.5">*</span></label>
              <Input type="number" inputMode="numeric" min={0} value={form.corte} onChange={(e) => setForm((f) => ({ ...f, corte: e.target.value }))}
                aria-invalid={!!errors.corte} className={cn(errors.corte && 'border-destructive focus:border-destructive focus:ring-destructive/30')} />
              {err('corte')}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Artículo<span className="text-destructive ml-0.5">*</span></label>
              <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                aria-invalid={!!errors.nombre} className={cn(errors.nombre && 'border-destructive focus:border-destructive focus:ring-destructive/30')} />
              {err('nombre')}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Precio<span className="text-destructive ml-0.5">*</span></label>
              <MoneyInput value={form.precio} onChange={(v) => setForm((f) => ({ ...f, precio: v }))}
                aria-invalid={!!errors.precio} className={cn(errors.precio && 'border-destructive focus:border-destructive focus:ring-destructive/30')} />
              {err('precio')}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Detalle</label>
              <textarea rows={3} maxLength={500} value={form.detalle} onChange={(e) => setForm((f) => ({ ...f, detalle: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-[140px] w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const ArticulosPanel: React.FC = () => {
  const { showToast } = useToast();
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [formTarget, setFormTarget] = useState<Articulo | 'new' | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Articulo | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setArticulos(await api.articulos.list());
    } catch {
      showToast('No se pudieron cargar los artículos.', 'error');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articulos;
    return articulos.filter((a) => `${a.codigo ?? ''} ${a.nombre}`.toLowerCase().includes(q));
  }, [articulos, search]);

  const handleToggle = async () => {
    if (!toggleTarget) return;
    const next = toggleTarget.status === 'Activo' ? 'Inactivo' : 'Activo';
    try {
      await api.articulos.actualizar(toggleTarget.id, { status: next });
      showToast(next === 'Activo' ? 'Artículo activado.' : 'Artículo desactivado.', 'success');
      load();
    } catch {
      showToast('No se pudo actualizar el estado del artículo.', 'error');
    }
  };

  const renderAcciones = (a: Articulo) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label="Editar" title="Editar" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setFormTarget(a)}>
        <Pencil className="h-4 w-4" />
      </Button>
      {a.status === 'Activo' ? (
        <Button variant="ghost" size="icon" aria-label="Desactivar" title="Desactivar" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setToggleTarget(a)}>
          <Ban className="h-4 w-4" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" aria-label="Activar" title="Activar" className="h-8 w-8 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50" onClick={() => setToggleTarget(a)}>
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Button className="h-9 px-3 text-sm gap-1.5 shrink-0" onClick={() => setFormTarget('new')}>
          <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Agregar artículo</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext="Artículos" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Sin artículos para mostrar" message="Ajustá la búsqueda o agregá uno nuevo." />
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {filtered.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{a.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{a.codigo}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>$ {maskFromNumber(a.precio_unitario)} · mín. {a.corte ?? 0}</span>
                  {renderAcciones(a)}
                </div>
              </div>
            ))}
          </div>
          <Card className="hidden md:block border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Stock mínimo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.codigo}</TableCell>
                    <TableCell>{a.nombre}</TableCell>
                    <TableCell className="text-right tabular-nums">$ {maskFromNumber(a.precio_unitario)}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.corte ?? 0}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell>{renderAcciones(a)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <ArticuloFormModal
        isOpen={!!formTarget}
        onClose={() => setFormTarget(null)}
        onSaved={load}
        articulo={formTarget === 'new' || !formTarget ? null : formTarget}
        articulos={articulos}
      />

      <ConfirmModal
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggle}
        title={toggleTarget?.status === 'Activo' ? '¿Desactivar artículo?' : '¿Activar artículo?'}
        description={`"${toggleTarget?.nombre ?? ''}" ${toggleTarget?.status === 'Activo' ? 'dejará de estar disponible para nuevos movimientos de stock.' : 'volverá a estar disponible para nuevos movimientos de stock.'}`}
        confirmText={toggleTarget?.status === 'Activo' ? 'Desactivar' : 'Activar'}
        cancelText="Cancelar"
        variant={toggleTarget?.status === 'Activo' ? 'danger' : 'default'}
      />
    </div>
  );
};

export default ArticulosPanel;
