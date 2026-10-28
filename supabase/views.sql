-- ============================================================================
-- "SharePoint-named" readable views.
--
-- The base tables connect by id (referential integrity: a FK can only point at a
-- UNIQUE column, and names like concat_name are NOT unique — two people can share
-- a name, so a name-FK is impossible and would silently orphan rows, exactly what
-- broke the SharePoint data). These views are a READ-ONLY lens on top: every FK id
-- is resolved to its human name, so browsing reads like the original SharePoint
-- list ("Juan Pérez", "Admin", "Garrafa R410") instead of ids — with zero change
-- to the tables and zero loss of integrity.
--
-- Each view is named EXACTLY as its source SharePoint list (quoted identifier,
-- because of the leading digit and the dot) so the Supabase dashboard table
-- list is browsable by the names the business already knows. The base tables
-- keep their clean snake_case names — the app/adapter/RPCs only ever touch
-- those, never these views.
--
-- They add NO columns and store NO data. LEFT JOINs so rows survive when a FK is
-- null (orphans from dirty source data stay visible, with the name blank).
-- security_invoker=true → the caller's RLS on the base tables governs access.
--
-- stock_edificios (the stock<->edificios junction table) has no SharePoint list
-- of its own, so it gets no view here; it's already surfaced as the "edificios"
-- aggregate column on "08.Stock".
--
-- Apply with:  node --env-file=.env scripts/migrate/apply-sql.mjs supabase/views.sql
-- ============================================================================

DROP VIEW IF EXISTS
  v_usuarios, v_unidades, v_ordenes_trabajo, v_stock, v_movimientos_stock,
  v_salidas_stock, v_compras, v_detalle_compras, v_aprobaciones, v_repuestos_ot,
  v_bitacoras, v_ventilaciones
CASCADE;

-- 00.Usuarios
create or replace view "00.Usuarios" with (security_invoker = true) as
select u.id, u.nombre, u.apellido, u.concat_name, u.usuario_app, u.dni, u.mail,
       u.num_cel, e.nombre as edificio, u.edificio_default, u.pais, u.perfil,
       u.validado, u.aplicacion, u.es_testing,
       case when u.activo then 'ALTA' else 'BAJA' end as status, u.created_at, u.updated_at
from usuarios u
left join edificios e on e.id = u.edificio_id;

-- 99.ABM_Edificios
create or replace view "99.ABM_Edificios" with (security_invoker = true) as
select e.id, e.nombre, e.pais, e.zona, e.grupo_stock,
       case when e.activo then 'Activo' else 'Inactivo' end as status,
       e.created_at, e.updated_at
from edificios e;

-- 99.ABM_Articulos
create or replace view "99.ABM_Articulos" with (security_invoker = true) as
select a.id, a.codigo, a.nombre, a.precio_unitario, a.corte,
       case when a.activo then 'Activo' else 'Inactivo' end as status,
       a.detalle, a.created_at, a.updated_at
from articulos a;

-- 99.ABM_Frecuencias
create or replace view "99.ABM_Frecuencias" with (security_invoker = true) as
select f.id, f.nombre, f.dias,
       case when f.activo then 'Activo' else 'Inactivo' end as status,
       f.created_at
from frecuencias f;

-- 99.ABM_TipoUnidades
create or replace view "99.ABM_TipoUnidades" with (security_invoker = true) as
select un.id, un.id_client, un.depto, un.torre, e.nombre as edificio, un.tipo_depto,
       un.tipo_sector, case when un.activa then 'Alta' else 'Baja' end as status,
       un.frecuencia_ventilacion_dias, un.requiere_ventilacion,
       un.created_at, un.updated_at
from unidades un
left join edificios e on e.id = un.edificio_id;

-- 99.ABM_ListaPermisosPerfilesV3
create or replace view "99.ABM_ListaPermisosPerfilesV3" with (security_invoker = true) as
select p.id, p.modulo, p.admin, p.operador, p.tecnico, p.recepcion, p.compras,
       p.jefe_operativo, p.orden, p.imagen_path, p.imagen_no_selected_path,
       p.aplicacion, case when p.activo then 'Activo' else 'Inactivo' end as status,
       p.created_at
from perfiles_permisos p;

-- 99.ABM_IconosApp
create or replace view "99.ABM_IconosApp" with (security_invoker = true) as
select i.id, i.icono_path, i.app, i.descripcion, i.created_at
from iconos_app i;

-- 99.ABM_Emails
create or replace view "99.ABM_Emails" with (security_invoker = true) as
select em.id, em.modulo, em.emails, em.edificio, em.a_tecnolav,
       case when em.activo then 'Activo' else 'Inactivo' end as status,
       em.created_at
from emails_notificacion em;

-- 07.OrdenesTrabajo
create or replace view "07.OrdenesTrabajo" with (security_invoker = true) as
select ot.id, ot.id_univoco, ot.status, ot.tipo, ot.prioridad, ot.tipo_trabajo,
       ot.tipo_tarea, ot.tipo_prioridad,
       un.id_client as unidad, ot.torre, ot.departamento, ot.concat_activo,
       ut.concat_name as tecnico,
       ua.concat_name as asignador,
       uc.usuario_app as user_carga,
       rev.id_univoco as orden_revision,
       ot.fecha_inicio, ot.fecha_cierre, ot.fecha_asignada, ot.dias_estimado,
       ot.personas_requeridas, ot.detalle, ot.observaciones, ot.obs_resuelto,
       ot.obs_asignacion, ot.obs_cierre, ot.problema, ot.desde, ot.version_app,
       ot.hora, ot.created_at
from ordenes_trabajo ot
left join unidades un        on un.id = ot.unidad_id
left join usuarios ut        on ut.id = ot.tecnico_id
left join usuarios ua        on ua.id = ot.asignador_id
left join usuarios uc        on uc.id = ot.user_carga_id
left join ordenes_trabajo rev on rev.id = ot.orden_revision_id;

-- 08.Stock (edificios is M:N via stock_edificios -> aggregate the names)
create or replace view "08.Stock" with (security_invoker = true) as
select s.id, s.id_univoco, a.nombre as articulo, s.cantidad, s.precio_unitario,
       s.condicion_corte,
       (select string_agg(e.nombre, '; ' order by e.nombre)
          from stock_edificios se
          join edificios e on e.id = se.edificio_id
         where se.stock_id = s.id) as edificios,
       case when s.activo then 'Activo' else 'Inactivo' end as status,
       uu.concat_name as usuario, s.fecha, s.ultima_mod, s.desde, s.version_app
from stock s
left join articulos a  on a.id = s.articulo_id
left join usuarios  uu on uu.id = s.usuario_id;

-- 08.MovimientoStock (append-only audit)
create or replace view "08.MovimientoStock" with (security_invoker = true) as
select m.id, a.nombre as articulo, m.concat_articulo, m.articulo as articulo_texto,
       m.cant_anterior, m.cant_posterior, m.costo_anterior, m.costo_posterior,
       m.stock_min_anterior, m.stock_min_posterior,
       e.nombre as edificio, m.edificio as edificio_texto, m.edificio_traslado,
       m.desde, m.tipo_movimiento, m.cantidad, uu.concat_name as usuario, m.fecha, m.version_app
from movimientos_stock m
left join articulos a  on a.id = m.articulo_id
left join edificios e  on e.id = m.edificio_id
left join usuarios  uu on uu.id = m.usuario_id;

-- 09.SalidaStock
create or replace view "09.SalidaStock" with (security_invoker = true) as
select s.id, a.nombre as articulo, s.concat_articulo,
       ut.concat_name as tecnico,
       s.tipo, s.fecha_salida, s.fecha_reingreso, s.uso, s.centro_de_costo, s.cantidad,
       uu.concat_name as usuario, s.fecha, s.version_app
from salidas_stock s
left join articulos a  on a.id = s.articulo_id
left join usuarios  ut on ut.id = s.tecnico_id
left join usuarios  uu on uu.id = s.usuario_id;

-- 10.RepuestosOT
create or replace view "10.RepuestosOT" with (security_invoker = true) as
select r.id, ot.id_univoco as orden_trabajo, a.nombre as articulo, r.repuesto,
       r.cantidad, r.edificio, uu.concat_name as usuario, r.fecha,
       case when r.activo then 'Activo' else 'Inactivo' end as status, r.version_app
from repuestos_ot r
left join ordenes_trabajo ot on ot.id = r.orden_trabajo_id
left join articulos a        on a.id = r.articulo_id
left join usuarios  uu       on uu.id = r.usuario_id;

-- 14.Compras
create or replace view "14.Compras" with (security_invoker = true) as
select c.id, c.id_compra, uu.concat_name as usuario, c.usuario_compra, c.urgencia,
       c.observacion, c.obs_recibir, c.fecha, c.cantidad_total, c.monto_total,
       c.status, c.cargo, c.sector_pedido, c.version_app, c.created_at
from compras c
left join usuarios uu on uu.id = c.usuario_id;

-- 15.Bitacoras
create or replace view "15.Bitacoras" with (security_invoker = true) as
select b.id, ot.id_univoco as orden_trabajo, b.id_univoco_bitacora, b.descripcion,
       b.fecha, uu.concat_name as usuario, b.version_app
from bitacoras b
left join ordenes_trabajo ot on ot.id = b.orden_trabajo_id
left join usuarios  uu       on uu.id = b.usuario_id;

-- 15.DetalleCompras
create or replace view "15.DetalleCompras" with (security_invoker = true) as
select d.id, cp.id_compra as compra, d.id_univoco, a.nombre as articulo,
       d.articulo as articulo_texto, e.nombre as edificio, d.edificio as edificio_texto,
       d.cantidad, d.recibido, d.costo_unitario, d.cant_min, d.costo_total,
       case when d.activo then 'Activo' else 'Inactivo' end as status,
       uu.concat_name as usuario, d.fecha, d.version_app
from detalle_compras d
left join compras   cp on cp.id = d.compra_id
left join articulos a  on a.id = d.articulo_id
left join edificios e  on e.id = d.edificio_id
left join usuarios  uu on uu.id = d.usuario_id;

-- 16.Aprobaciones
create or replace view "16.Aprobaciones" with (security_invoker = true) as
select ap.id, cp.id_compra as compra, ap.status, ap.fecha, ap.urgencia, ap.tecnico,
       ap.obs_compra, ap.fecha_aprobada, ap.obs_rechazo,
       ug.usuario_app as user_gen,
       uap.usuario_app as user_aprob,
       ap.cantidad, ap.monto, ap.sector, ap.version_app, ap.hora
from aprobaciones ap
left join compras  cp  on cp.id = ap.compra_id
left join usuarios ug  on ug.id = ap.user_gen_id
left join usuarios uap on uap.id = ap.user_aprob_id;

-- 16.FotoBitacora
create or replace view "16.FotoBitacora" with (security_invoker = true) as
select f.id, ot.id_univoco as orden_trabajo, b.id_univoco_bitacora as bitacora,
       f.foto_path, f.created_at
from fotos_bitacora f
left join ordenes_trabajo ot on ot.id = f.orden_trabajo_id
left join bitacoras       b  on b.id = f.bitacora_id;

-- 19.Ventilaciones
create or replace view "19.Ventilaciones" with (security_invoker = true) as
select v.id, v.estado, un.id_client as unidad, v.direccion_edificio, v.edificio,
       v.habitacion, v.frecuencia_dias, v.fecha_ultima, v.proxima_limpieza,
       v.fecha_programada, v.obs_adelanto, v.obs_resuelto,
       ua.concat_name as asignado,
       v.fecha_asignado, v.version_asignado, v.fecha_finalizacion, v.version_resuelto,
       v.es_incidente, v.orden
from ventilaciones v
left join unidades un on un.id = v.unidad_id
left join usuarios ua on ua.id = v.asignado_id;

-- Documentos
create or replace view "Documentos" with (security_invoker = true) as
select d.id, d.nombre, d.storage_path, d.carpeta,
       ot.id_univoco as orden_trabajo, cp.id_compra as compra,
       d.content_type, d.created_at
from documentos d
left join ordenes_trabajo ot on ot.id = d.orden_trabajo_id
left join compras cp         on cp.id = d.compra_id;
