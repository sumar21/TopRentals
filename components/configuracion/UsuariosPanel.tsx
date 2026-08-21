// Usuarios — ABM de cuentas. En la PA original esta consola estaba 100% construida
// (list/search/forms) pero era inalcanzable (el ComboBox de tipo tenía Items
// hardcodeado a ['Articulos']) y sus Patch de alta/edición/baja estaban comentados
// (dead writes) — ver docs/analysis/desktop_Screen_Configuracion.md. Decisión de
// producto para este rebuild: la pestaña se activa y queda LIVE (ver instrucciones
// de la tarea "BOTH live").
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Pencil, UserX, UserCheck2, Save, X, Loader2, AlertCircle, Users, KeyRound, UserCircle2 } from 'lucide-react';
import { api } from '../../services/index.ts';
import { useAuth } from '../../contexts/AuthContext';
import type { Edificio, Perfil, Usuario } from '../../services/types.ts';
import { Card, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button, Input, Badge, cn, useModalAnimation } from '../ui/UIComponents';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { useToast } from '../ui/Toast';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import ConfirmModal from '../ConfirmModal';
import { backdropClose } from '../ui/backdropClose';
import { formatDate } from '../../utils/dates';

const PERFIL_OPTIONS: { value: Perfil; label: string }[] = [
  { value: 'Admin', label: 'Admin' },
  { value: 'Operador', label: 'Operador' },
  { value: 'Tecnico', label: 'Técnico' },
  { value: 'Recepcion', label: 'Recepción' },
  { value: 'Compras', label: 'Compras' },
  { value: 'Gerencia', label: 'Gerencia' },
  { value: 'Supervisor Ventilaciones', label: 'Supervisor Ventilaciones' },
];

function normalizar(s: string): string {
  // NFD descompone acentos en marcas combinantes aparte; el segundo replace ya las
  // descarta junto con cualquier otro carácter no-ascii (espacios, ñ, etc.).
  return s.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
}
// Usuario (login) autogenerado: 3 primeras letras del nombre + apellido, con inicial mayúscula.
// Ej: "Facundo Rombola" -> "Facrombola". No editable (regla del cliente).
function sugerirUsuarioApp(nombre: string, apellido: string): string {
  const base = normalizar(nombre).slice(0, 3) + normalizar(apellido);
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}
// Contraseña autogenerada = ddmm de la fecha de nacimiento. Ej: 19/07/2003 -> "1907".
// Es DERIVABLE (no se guarda en claro): en editar se recalcula y se muestra read-only.
function passwordFromFechaNac(fechaNac: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaNac);
  return m ? `${m[3]}${m[2]}` : '';
}

interface FormState {
  nombre: string; apellido: string; perfil: Perfil | ''; edificioId: string; mail: string; usuarioApp: string; fechaNac: string;
}
const emptyForm: FormState = { nombre: '', apellido: '', perfil: '', edificioId: '', mail: '', usuarioApp: '', fechaNac: '' };

const UsuarioFormModal: React.FC<{
  isOpen: boolean; onClose: () => void; onSaved: () => void; usuario: Usuario | null; edificios: Edificio[];
}> = ({ isOpen, onClose, onSaved, usuario, edificios }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const isNew = !usuario;

  useEffect(() => {
    if (isOpen) {
      setForm(usuario
        ? { nombre: usuario.nombre, apellido: usuario.apellido, perfil: usuario.perfil, edificioId: usuario.edificio_id ? String(usuario.edificio_id) : '', mail: usuario.mail ?? '', usuarioApp: usuario.usuario_app, fechaNac: usuario.fecha_nac ?? '' }
        : emptyForm);
      setErrors({});
    }
  }, [isOpen, usuario]);

  if (!visible) return null;

  const edificioOptions = edificios.filter((e) => e.status === 'Activo').map((e) => ({ value: String(e.id), label: e.nombre }));

  // El usuario se autogenera del nombre/apellido SOLO en alta. En edición no se re-deriva:
  // cambiar el usuario_app rompería el alias de login del auth ya provisionado.
  const setNombre = (nombre: string) => setForm((f) => ({ ...f, nombre, usuarioApp: isNew ? sugerirUsuarioApp(nombre, f.apellido) : f.usuarioApp }));
  const setApellido = (apellido: string) => setForm((f) => ({ ...f, apellido, usuarioApp: isNew ? sugerirUsuarioApp(f.nombre, apellido) : f.usuarioApp }));

  // La contraseña real (migrada de SharePoint) tiene prioridad; si no hay (usuario nuevo), se
  // deriva del ddmm de la fecha de nacimiento.
  const passwordPreview = usuario?.password_seed || passwordFromFechaNac(form.fechaNac);

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.nombre.trim()) next.nombre = 'El nombre es obligatorio.';
    if (!form.apellido.trim()) next.apellido = 'El apellido es obligatorio.';
    if (!form.perfil) next.perfil = 'Elegí un perfil.';
    if (!form.usuarioApp.trim()) next.usuarioApp = 'El usuario es obligatorio.';
    // Fecha de nacimiento obligatoria SOLO cuando la contraseña sale de ella (usuario nuevo).
    // Los migrados ya tienen su contraseña real (password_seed) y pueden no tener fecha cargada.
    if (!form.fechaNac && !usuario?.password_seed) next.fechaNac = 'La fecha de nacimiento es obligatoria (define la contraseña).';
    if (form.mail && !/^\S+@\S+\.\S+$/.test(form.mail)) next.mail = 'El mail no es válido.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !form.perfil) return;
    setSaving(true);
    try {
      const edificio = edificios.find((e) => String(e.id) === form.edificioId) ?? null;
      const aplicacion = form.perfil === 'Tecnico' ? 'Mantenimiento' : 'Desktop';
      const payload = {
        auth_user_id: usuario?.auth_user_id ?? null,
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        concat_name: `${form.apellido.trim()}, ${form.nombre.trim()}`,
        usuario_app: form.usuarioApp.trim(),
        dni: usuario?.dni ?? null,
        fecha_nac: form.fechaNac || null,
        mail: form.mail.trim() || null,
        num_cel: usuario?.num_cel ?? null,
        edificio_id: edificio?.id ?? null,
        edificio_default: edificio?.nombre ?? null,
        pais: usuario?.pais ?? 'Argentina',
        perfil: form.perfil,
        validado: usuario?.validado ?? true,
        wapp_default: usuario?.wapp_default ?? null,
        mnt_global: usuario?.mnt_global ?? null,
        aplicacion,
        es_testing: usuario?.es_testing ?? false,
        status: usuario?.status ?? ('ALTA' as const),
        legacy_id_usr: usuario?.legacy_id_usr ?? null,
      };
      if (usuario) await api.usuarios.actualizar(usuario.id, payload, passwordPreview);
      else await api.usuarios.crear(payload, passwordPreview);
      showToast(usuario ? 'Usuario actualizado.' : 'Usuario creado.', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('No se pudo guardar el usuario.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const err = (field: keyof FormState) => errors[field] && (
    <p role="alert" className="text-[10px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="h-3 w-3 shrink-0" /> {errors[field]}</p>
  );

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 h-[100dvh] ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90dvh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-full bg-brand/10 flex items-center justify-center">
              <UserCircle2 className="h-5 w-5 text-brand" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight truncate">{usuario ? 'Editar usuario' : 'Nuevo usuario'}</h2>
              <p className="text-xs text-muted-foreground">Cuentas de acceso al back-office</p>
            </div>
          </div>
          <button onClick={saving ? undefined : onClose} title="Cerrar" aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors shrink-0"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Datos personales */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datos personales</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre<span className="text-destructive ml-0.5">*</span></label>
                <Input value={form.nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={!!errors.nombre} placeholder="Nombre"
                  className={cn(errors.nombre && 'border-destructive focus:border-destructive focus:ring-destructive/30')} />
                {err('nombre')}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Apellido<span className="text-destructive ml-0.5">*</span></label>
                <Input value={form.apellido} onChange={(e) => setApellido(e.target.value)} aria-invalid={!!errors.apellido} placeholder="Apellido"
                  className={cn(errors.apellido && 'border-destructive focus:border-destructive focus:ring-destructive/30')} />
                {err('apellido')}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Perfil<span className="text-destructive ml-0.5">*</span></label>
                <Select value={form.perfil} onChange={(v) => setForm((f) => ({ ...f, perfil: v as Perfil }))} options={PERFIL_OPTIONS} placeholder="Elegí un perfil" />
                {err('perfil')}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Edificio</label>
                <Select value={form.edificioId} onChange={(v) => setForm((f) => ({ ...f, edificioId: v }))} options={edificioOptions} placeholder="Sin edificio asignado" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha de nacimiento<span className="text-destructive ml-0.5">*</span></label>
                <DatePicker value={form.fechaNac} onChange={(v) => setForm((f) => ({ ...f, fechaNac: v }))} />
                {err('fechaNac')}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Mail</label>
                <Input type="email" value={form.mail} onChange={(e) => setForm((f) => ({ ...f, mail: e.target.value }))} aria-invalid={!!errors.mail}
                  placeholder="correo@ejemplo.com" className={cn(errors.mail && 'border-destructive focus:border-destructive focus:ring-destructive/30')} />
                {err('mail')}
              </div>
            </div>
          </section>

          {/* Credenciales de acceso — valores DERIVADOS (no editables): se muestran como texto, sin
              placeholders. Usuario = 3 letras del nombre + apellido; contraseña = ddmm de nacimiento. */}
          <section>
            <div className="rounded-lg border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <KeyRound className="h-4 w-4 text-brand shrink-0" />
                <h3 className="text-sm font-semibold">Credenciales de acceso</h3>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Automáticas</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Usuario</div>
                  <div className={cn('font-mono text-sm font-semibold break-all', !form.usuarioApp && 'text-muted-foreground/50')}>{form.usuarioApp || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Contraseña</div>
                  <div className={cn('font-mono text-sm font-semibold', passwordPreview ? 'tracking-[0.25em]' : 'text-muted-foreground/50')}>{passwordPreview || '—'}</div>
                </div>
              </div>
              {err('usuarioApp')}
              <p className="text-[11px] text-muted-foreground mt-3">Usuario = 3 letras del nombre + apellido · Contraseña = día y mes de nacimiento (ddmm).</p>
            </div>
          </section>
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-[140px] w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const UsuariosPanel: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [formTarget, setFormTarget] = useState<Usuario | 'new' | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Usuario | null>(null);

  const load = async (silent = false) => {
    if (!silent) { setLoading(true); setLoadError(false); }
    try {
      const [userRows, edRows] = await Promise.all([api.usuarios.list(), api.edificios.list()]);
      setUsuarios(userRows);
      setEdificios(edRows);
    } catch {
      if (!silent) { showToast('No se pudieron cargar los usuarios.', 'error'); setLoadError(true); }
    } finally {
      if (!silent) setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  // Realtime: silent refetch when usuarios change.
  useEffect(() => api.realtime.subscribe(['usuarios'], () => { void load(true); }), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // PA hides the Admin account from any non-Admin viewer (Filter(..., UsuarioApp_Usr <> "Admin")).
    const base = user?.usuario_app === 'Admin' ? usuarios : usuarios.filter((u) => u.usuario_app !== 'Admin');
    if (!q) return base;
    return base.filter((u) => `${u.nombre} ${u.apellido} ${u.perfil} ${u.usuario_app}`.toLowerCase().includes(q));
  }, [usuarios, search, user]);

  const handleToggle = async () => {
    if (!toggleTarget) return;
    try {
      if (toggleTarget.status === 'ALTA') await api.usuarios.eliminar(toggleTarget.id);
      else await api.usuarios.actualizar(toggleTarget.id, { status: 'ALTA' });
      showToast(toggleTarget.status === 'ALTA' ? 'Usuario dado de baja.' : 'Usuario reactivado.', 'success');
      load();
    } catch {
      showToast('No se pudo actualizar el estado del usuario.', 'error');
    }
  };

  const renderAcciones = (u: Usuario) => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" aria-label="Editar" title="Editar" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setFormTarget(u)}>
        <Pencil className="h-4 w-4" />
      </Button>
      {u.status === 'ALTA' ? (
        <Button variant="ghost" size="icon" aria-label="Dar de baja" title="Dar de baja" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setToggleTarget(u)}>
          <UserX className="h-4 w-4" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" aria-label="Reactivar" title="Reactivar" className="h-8 w-8 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" onClick={() => setToggleTarget(u)}>
          <UserCheck2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  // usuario status ALTA/BAJA -> Badge plano (StatusBadge colisiona con prioridad 'Alta').
  const EstadoBadge: React.FC<{ status: Usuario['status'] }> = ({ status }) => (
    <Badge variant={status === 'ALTA' ? 'success' : 'secondary'}>{status}</Badge>
  );

  return (
    <div className="flex flex-col gap-4 w-full md:flex-1 md:min-h-0">
      {/* En pantallas grandes (≥1024, lg) el toolbar sube a la fila de los tabs (ConfiguracionView);
          en mobile y tablet queda debajo (a 768px el sidebar + los tabs no dejan lugar para search +
          botón en la misma fila). */}
      <div className="flex items-center gap-2 flex-wrap justify-end lg:self-end lg:-mt-[46px]">
        <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Button className="h-9 px-3 text-sm gap-1.5 shrink-0" onClick={() => setFormTarget('new')}>
          <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Agregar usuario</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext="Usuarios" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="Sin usuarios para mostrar" message="Ajustá la búsqueda o agregá uno nuevo." />
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {filtered.map((u) => (
              <div key={u.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{u.apellido}, {u.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{u.perfil} · {u.usuario_app}</p>
                  </div>
                  <EstadoBadge status={u.status} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{u.edificio_default || 'Sin edificio'} · {formatDate(u.fecha_nac) || '—'}</span>
                  {renderAcciones(u)}
                </div>
              </div>
            ))}
          </div>
          <Card className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 border shadow-sm overflow-hidden">
            <Table className="min-w-[1100px]" wrapperClassName="h-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Apellido</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="whitespace-nowrap">F. nacimiento</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.nombre}</TableCell>
                    <TableCell>{u.apellido}</TableCell>
                    <TableCell>{u.perfil}</TableCell>
                    <TableCell>{u.usuario_app}</TableCell>
                    <TableCell>{u.edificio_default || '-'}</TableCell>
                    <TableCell><EstadoBadge status={u.status} /></TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(u.fecha_nac) || '—'}</TableCell>
                    <TableCell>{renderAcciones(u)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <UsuarioFormModal
        isOpen={!!formTarget}
        onClose={() => setFormTarget(null)}
        onSaved={load}
        usuario={formTarget === 'new' || !formTarget ? null : formTarget}
        edificios={edificios}
      />

      <ConfirmModal
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggle}
        title={toggleTarget?.status === 'ALTA' ? '¿Dar de baja al usuario?' : '¿Reactivar usuario?'}
        description={`"${toggleTarget?.concat_name ?? ''}" ${toggleTarget?.status === 'ALTA' ? 'perderá acceso al sistema.' : 'volverá a tener acceso al sistema.'}`}
        confirmText={toggleTarget?.status === 'ALTA' ? 'Dar de baja' : 'Reactivar'}
        cancelText="Cancelar"
        variant={toggleTarget?.status === 'ALTA' ? 'danger' : 'default'}
      />
    </div>
  );
};

export default UsuariosPanel;
