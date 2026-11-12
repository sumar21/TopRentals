-- 0019 — Tecnoapp Dashboard: the aggregation moves from the BFF (Node) into Postgres.
--
-- Context: the Dashboard of the Tecnoapp (BFF `server/routes/dashboard.ts`) was ported from SharePoint as it was: it pulled the raw
-- rows of the month (ordenes_limpieza, ordenes_limpieza_detalle, inventarios, habitaciones_inventariadas: ~120 REST round trips
-- and 3-5 MB per cold endpoint, "one query per day, 6 in parallel") and aggregated them in Node. With the DB in us-west-2 and the
-- function in iad1 every round trip costs ~70 ms, so a cold Dashboard took ~2 s per endpoint, no faster than SharePoint.
--
-- Now each family is ONE call that returns the final JSON (a few KB):
--   tecno_dash_ordenes    -> { resumen, limpieza, detalleLimpieza }       (tabs Resumen, Limpieza, Detalle Limpieza)
--   tecno_dash_inventario -> { inventario, detalleInventario }            (tabs Inventario, Detalle Inventario)
--   tecno_dash_filtros    -> { habs, edificios, usuarios }                (options of the filters panel)
-- The BFF only adds `actualizadoAl` (it depends on "today" in Argentina) and, for `inventario.detalleArticulos`, sorts it
-- with `localeCompare('es')` (the ICU collation of Node is the reference; Postgres could differ on punctuation).
--
-- The JSON is the one the JS aggregation produced, byte for byte as values. The rules that matter (all mirrored from the JS):
--   * rounding: JS `Math.round(n * 100) / 100` = floor(n * 100 + 0.5) / 100 on float8 (NOT round(numeric), NOT round(float8):
--     those round half away from zero / to even and differ on exact .5 ties); same IEEE operations in the same order.
--   * order: the JS sorts (stable) over Maps filled in row order (day asc, then id asc). Every list here is ordered by the
--     value desc and then by the position of the first row that created the entry (`oseq`/`dseq`/`iseq` = (fecha, id)).
--   * `|| 'Sin clasificar'` (empty counts as missing) vs `?? 'Sin tipo'` (only a missing key) are kept where each is used.
--   * order dedup: the first row per id_univoco (per month) of the FILTERED rows wins, as the `seenIds` set did.
--
-- Plans: each function sets enable_nestloop = off and enable_mergejoin = off. The planner cannot estimate the DISTINCT / expression-derived sets these queries join
-- (it expects a handful of rows) and picked a nested loop re-running a 4000-row aggregate once per OTP line: 25 s on the real data,
-- 0.13 s with hash joins. Everything joined here is a month of rows (thousands), hash joins are the right plan.
--
-- Security: SECURITY DEFINER (the BFF calls them with the service role; RLS is on for these tables), search_path pinned,
-- EXECUTE for service_role only (revoked from public / anon / authenticated). Read-only (STABLE): nothing is written.
--
-- Aplicar: correr este archivo en el SQL Editor de Supabase, ANTES de deployar el BFF que las llama. Idempotent.

-- 0. indexes: the Dashboard reads a month by `fecha` alone, the existing ones lead with `edificio`.
create index if not exists ordenes_limpieza_fecha_idx          on public.ordenes_limpieza (fecha);
create index if not exists ordenes_limpieza_detalle_fecha_idx  on public.ordenes_limpieza_detalle (fecha);
create index if not exists inventarios_fecha_idx               on public.inventarios (fecha);

-- 1. tecno_dash_filtros ------------------------------------------------------------------------------------------------
create or replace function public.tecno_dash_filtros(p_desde date, p_hasta date, p_idmes text)
returns jsonb
language sql stable security definer set search_path = public set enable_nestloop = off set enable_mergejoin = off
as $fn$
  select jsonb_build_object(
    -- active units: [depto, torre, tipo_depto] in id order (the BFF filters / sorts them)
    'habs', (select coalesce(jsonb_agg(jsonb_build_array(coalesce(u.depto, ''), coalesce(u.torre, ''), coalesce(u.tipo_depto, '')) order by u.id), '[]'::jsonb)
               from public.unidades u where u.activa = true),
    'edificios', (select coalesce(jsonb_agg(e.nombre order by e.id), '[]'::jsonb)
                    from public.edificios e where e.activo = true and coalesce(e.nombre, '') <> ''),
    -- every user that appears in the month (orders not anulled + rooms inventoried), the test building excluded
    'usuarios', (select coalesce(jsonb_agg(x.usuario order by x.usuario), '[]'::jsonb)
                   from (select o.usuario
                           from public.ordenes_limpieza o
                          where o.fecha >= p_desde and o.fecha <= p_hasta and o.status <> 'Anulado'
                            and coalesce(o.edificio, '') <> 'Admin' and coalesce(o.usuario, '') <> ''
                         union
                         select r.usuario
                           from public.habitaciones_inventariadas r
                          where r.id_univoco = p_idmes
                            and coalesce(r.edificio, '') <> 'Admin' and coalesce(r.usuario, '') <> '') x)
  );
$fn$;

-- 2. tecno_dash_ordenes ------------------------------------------------------------------------------------------------
-- p_desde/p_hasta: the month; p_pdesde/p_phasta: the previous month. NULL = filter not set.
create or replace function public.tecno_dash_ordenes(
  p_desde date, p_hasta date, p_pdesde date, p_phasta date,
  p_edificios text[] default null, p_edificio text default null, p_habitacion text default null,
  p_usuario text default null, p_dia int default null, p_tipo_ingreso text default null,
  p_tipos_depto text[] default null, p_tipo_depto text default null, p_tipo_prenda text default null
)
returns jsonb
language sql stable security definer set search_path = public set enable_nestloop = off set enable_mergejoin = off
as $fn$
with
-- unit -> tipo_depto lookup (the JS Map: last row wins), only units with a number
lk as (
  select distinct on (u.depto, coalesce(u.torre, '')) u.depto, coalesce(u.torre, '') torre, coalesce(u.tipo_depto, '') td
    from public.unidades u
   where u.activa = true and coalesce(u.depto, '') <> ''
   order by u.depto, coalesce(u.torre, ''), u.id desc
),
-- orders of both months (cur = the requested month). oseq = position in the JS iteration (day asc, id asc).
o as (
  select ol.id, coalesce(ol.id_univoco, '') idu, coalesce(ol.usuario, '') usuario, ol.fecha,
         coalesce(ol.edificio, '') edificio, coalesce(ol.habitacion, '') habitacion,
         coalesce(ol.tipo_ingreso, '') tipo_ingreso, ol.fecha >= p_desde cur,
         extract(dow from ol.fecha)::int dow,
         (ol.fecha - p_pdesde)::bigint * 10000000000 + ol.id oseq
    from public.ordenes_limpieza ol
   where ol.fecha >= p_pdesde and ol.fecha <= p_hasta and ol.status <> 'Anulado'
),
-- filtrarOrdenes (the edificio single wins over the multi; 'Admin' never counts)
f as (
  select o.*, l.td,
         case when o.habitacion = '' then 'Sin habitación' else coalesce(nullif(l.td, ''), 'Sin clasificar') end tipo
    from o left join lk l on l.depto = o.habitacion and l.torre = o.edificio
   where o.edificio <> 'Admin'
     and (case when p_edificio is not null then o.edificio = p_edificio
               when coalesce(cardinality(p_edificios), 0) = 0 then true
               else o.edificio = any(p_edificios) end)
     and (p_habitacion is null or o.habitacion = p_habitacion)
     and (p_usuario is null or o.usuario = p_usuario)
     and (p_dia is null or extract(day from o.fecha) = p_dia)
     and (p_tipo_ingreso is null or o.tipo_ingreso = p_tipo_ingreso)
     and (case when p_tipo_depto is not null then l.td = p_tipo_depto
               when coalesce(cardinality(p_tipos_depto), 0) = 0 then true
               else l.td = any(p_tipos_depto) end)
),
-- OTP lines of the two months with cantidad > 0, only of the filtered orders (matched by id_univoco AND month)
d as (
  select coalesce(x.id_univoco, '') idu, x.fecha >= p_desde cur, coalesce(x.tipo_prenda, '') tp, x.cantidad,
         (x.fecha - p_pdesde)::bigint * 10000000000 + x.id dseq
    from public.ordenes_limpieza_detalle x
   where x.fecha >= p_pdesde and x.fecha <= p_hasta and x.cantidad > 0
),
dj as (select d.* from d where exists (select 1 from f where f.idu = d.idu and f.cur = d.cur)),
-- real garment lines: not the "ingreso sin blancos" marker
dl as (select * from dj where tp <> 'INGRESO SIN REGISTRO DE BLANCOS'),
ps as (select idu, cur, sum(cantidad) s from dl group by idu, cur),
-- tipoPrenda cross-filter (full): keep the orders that have a line of that prenda (the marker counts if it is the one asked)
nar as (select distinct idu, cur from dj where tp = p_tipo_prenda),
-- (a plain join, not `p is null or exists(...)`: that OR is a per-row subplan, O(rows x rows))
fn as (
  select f.* from f where p_tipo_prenda is null
  union all
  select f.* from f join nar on nar.idu = f.idu and nar.cur = f.cur where p_tipo_prenda is not null
),
-- a: filtered, deduped by id_univoco per month (the row with the lowest oseq wins), with the garments sum `s`
-- (NULL = no real garments)  [Resumen]. Hash aggregate + join instead of row_number(): sorting text keys is the slow part.
fm as (select idu, cur, min(oseq) mo from f group by idu, cur),
a as (
  select f.*, ps.s
    from f join fm on fm.idu = f.idu and fm.cur = f.cur and fm.mo = f.oseq
    left join ps on ps.idu = f.idu and ps.cur = f.cur
),
-- b: same but narrowed by tipoPrenda  [Limpieza, Detalle Limpieza]
fnm as (select idu, cur, min(oseq) mo from fn group by idu, cur),
b as (
  select * from a where p_tipo_prenda is null
  union all
  select n.*, ps.s
    from fn n join fnm on fnm.idu = n.idu and fnm.cur = n.cur and fnm.mo = n.oseq
    left join ps on ps.idu = n.idu and ps.cur = n.cur
   where p_tipo_prenda is not null
),

-- ===== RESUMEN =====
rd as (
  select dow,
         count(*) filter (where usuario <> '') n_ord,
         count(distinct usuario || '||' || fecha::text) filter (where usuario <> '') n_ud,
         coalesce(sum(s) filter (where s is not null and habitacion <> ''), 0) prendas,
         count(distinct habitacion || '|' || edificio || '||' || fecha::text) filter (where s is not null and habitacion <> '') n_rd
    from a where cur group by dow
),
rot as (select dow, tipo, count(*) c, min(oseq) sq from a where cur and usuario <> '' group by dow, tipo),
rotj as (
  select dow, jsonb_agg(jsonb_build_object('tipoDepto', tipo, 'cantidad', c,
           'porcentaje', floor(((c::float8 / tot::float8) * 100) * 100 + 0.5) / 100) order by c desc, sq) j
    from (select *, sum(c) over (partition by dow) tot from rot) x group by dow
),
rpt as (select dow, tipo, sum(s) c, min(oseq) sq from a where cur and s is not null and habitacion <> '' group by dow, tipo),
rptj as (
  select dow, jsonb_agg(jsonb_build_object('tipoDepto', tipo, 'cantidad', c,
           'porcentaje', floor(((c::float8 / tot::float8) * 100) * 100 + 0.5) / 100) order by c desc, sq) j
    from (select *, sum(c) over (partition by dow) tot from rpt) x group by dow
),
rtot as (
  select coalesce(sum(n_ord), 0) n_ord, coalesce(sum(n_ud), 0) n_ud, coalesce(sum(prendas), 0) prendas, coalesce(sum(n_rd), 0) n_rd from rd
),
rprev as (
  select count(*) filter (where usuario <> '') n_ord,
         count(distinct usuario || '||' || fecha::text) filter (where usuario <> '') n_ud,
         coalesce(sum(s) filter (where s is not null and habitacion <> ''), 0) prendas,
         count(distinct habitacion || '|' || edificio || '||' || fecha::text) filter (where s is not null and habitacion <> '') n_rd
    from a where not cur
),
-- the 7 weekdays with the raw ratios (JS: size > 0 ? count / size : 0)
rw as (
  select g dow, (array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[g + 1] nombre,
         case when coalesce(rd.n_ud, 0) > 0 then rd.n_ord::float8 / rd.n_ud::float8 else 0::float8 end hu,
         case when coalesce(rd.n_rd, 0) > 0 then rd.prendas::float8 / rd.n_rd::float8 else 0::float8 end ph,
         coalesce(rotj.j, '[]'::jsonb) hu_bd, coalesce(rptj.j, '[]'::jsonb) ph_bd
    from generate_series(0, 6) g
    left join rd on rd.dow = g left join rotj on rotj.dow = g left join rptj on rptj.dow = g
),
rk as (  -- the two KPIs: act / ant raw, evolution already rounded
  select 'Habitaciones por Usuario' titulo,
         case when rtot.n_ud > 0 then rtot.n_ord::float8 / rtot.n_ud::float8 else 0::float8 end act,
         case when rprev.n_ud > 0 then rprev.n_ord::float8 / rprev.n_ud::float8 else 0::float8 end ant,
         (select jsonb_agg(jsonb_build_object('dia', nombre, 'valor', floor(hu * 100 + 0.5) / 100, 'breakdown', hu_bd) order by dow) from rw) evo,
         1 ord
    from rtot, rprev
  union all
  select 'Prendas por Habitación',
         case when rtot.n_rd > 0 then rtot.prendas::float8 / rtot.n_rd::float8 else 0::float8 end,
         case when rprev.n_rd > 0 then rprev.prendas::float8 / rprev.n_rd::float8 else 0::float8 end,
         (select jsonb_agg(jsonb_build_object('dia', nombre, 'valor', floor(ph * 100 + 0.5) / 100, 'breakdown', ph_bd) order by dow) from rw),
         2
    from rtot, rprev
),
resumen as (
  select jsonb_build_object('kpis', jsonb_build_object(
           'habitacionesPorUsuario', (select jsonb_build_object('titulo', titulo,
               'valorActual', floor(act * 100 + 0.5) / 100, 'valorMesAnterior', floor(ant * 100 + 0.5) / 100,
               'variacionAbsoluta', floor((act - ant) * 100 + 0.5) / 100,
               'variacionPct', floor((case when ant <> 0 then ((act - ant) / ant) * 100 else 0::float8 end) * 100 + 0.5) / 100,
               'formato', 'decimal', 'evolucionSemanal', evo) from rk where ord = 1),
           'prendasPorHabitacion', (select jsonb_build_object('titulo', titulo,
               'valorActual', floor(act * 100 + 0.5) / 100, 'valorMesAnterior', floor(ant * 100 + 0.5) / 100,
               'variacionAbsoluta', floor((act - ant) * 100 + 0.5) / 100,
               'variacionPct', floor((case when ant <> 0 then ((act - ant) / ant) * 100 else 0::float8 end) * 100 + 0.5) / 100,
               'formato', 'decimal', 'evolucionSemanal', evo) from rk where ord = 2))) j
),

-- ===== LIMPIEZA (b) =====
-- days of the month with at least one cleaning event (an order with room): the JS `habsPorDia` keys
ld as (
  select extract(day from fecha)::int dia,
         count(distinct habitacion || '|' || edificio) filter (where habitacion <> '') habs,
         count(distinct usuario) filter (where usuario <> '') usrs,
         count(*) filter (where usuario <> '') c
    from b where cur group by 1 having bool_or(habitacion <> '')
),
lot as (select extract(day from fecha)::int dia, tipo, count(*) c, min(oseq) sq from b where cur and usuario <> '' group by 1, 2),
lotj as (
  select dia, jsonb_agg(jsonb_build_object('tipoDepto', tipo, 'cantidad', c,
           'porcentaje', floor(((c::float8 / tot::float8) * 100) * 100 + 0.5) / 100) order by c desc, sq) j
    from (select *, sum(c) over (partition by dia) tot from lot) x group by dia
),
bc as (
  select count(*) filter (where usuario <> '') n_ord,
         count(distinct usuario || '||' || fecha::text) filter (where usuario <> '') n_ud,
         coalesce(sum(s) filter (where s is not null and habitacion <> ''), 0) prendas,
         count(distinct habitacion || '|' || edificio || '||' || fecha::text) filter (where s is not null and habitacion <> '') n_rdb,
         count(distinct habitacion || '|' || edificio || '||' || fecha::text) filter (where habitacion <> '') n_rd,
         count(*) filter (where tipo_ingreso = 'Reingreso') n_re,
         count(*) filter (where tipo_ingreso <> 'Reingreso') n_li
    from b where cur
),
bp as (
  select count(*) filter (where usuario <> '') n_ord,
         count(distinct usuario || '||' || fecha::text) filter (where usuario <> '') n_ud,
         coalesce(sum(s) filter (where s is not null and habitacion <> ''), 0) prendas,
         count(distinct habitacion || '|' || edificio || '||' || fecha::text) filter (where s is not null and habitacion <> '') n_rdb,
         count(distinct habitacion || '|' || edificio || '||' || fecha::text) filter (where habitacion <> '') n_rd
    from b where not cur
),
-- raw KPI values: act / ant. Entero ones are rounded BEFORE the variation (buildKpiCompacto gets round0 values).
lkp as (
  select 1 ord, 'Habitaciones por Persona' titulo, 'decimal' formato,
         case when bc.n_ud > 0 then bc.n_ord::float8 / bc.n_ud::float8 else 0::float8 end act,
         case when bp.n_ud > 0 then bp.n_ord::float8 / bp.n_ud::float8 else 0::float8 end ant
    from bc, bp
  union all
  select 2, 'Prendas por Habitación', 'decimal',
         case when bc.n_rdb > 0 then bc.prendas::float8 / bc.n_rdb::float8 else 0::float8 end,
         case when bp.n_rdb > 0 then bp.prendas::float8 / bp.n_rdb::float8 else 0::float8 end
    from bc, bp
  union all
  select 3, 'Cantidad de Prendas', 'entero', floor(bc.prendas::float8 + 0.5), floor(bp.prendas::float8 + 0.5) from bc, bp
  union all
  select 4, 'Cantidad de Habitaciones', 'entero', bc.n_rd::float8, bp.n_rd::float8 from bc, bp
),
lkpj as (
  select jsonb_agg(jsonb_build_object('titulo', titulo,
           'valor', case when formato = 'entero' then floor(act + 0.5) else floor(act * 100 + 0.5) / 100 end,
           'valorMesAnterior', case when formato = 'entero' then floor(ant + 0.5) else floor(ant * 100 + 0.5) / 100 end,
           'variacionPct', floor((case when ant <> 0 then ((act - ant) / ant) * 100 else 0::float8 end) * 100 + 0.5) / 100,
           'formato', formato) order by ord) j
    from lkp
),
pc as (select tp, sum(cantidad) q, min(dseq) sq from dl where cur and tp <> '' group by tp order by q desc, sq limit 20),
pcj as (
  select coalesce(jsonb_agg(jsonb_build_object('prenda', pc.tp, 'mesActual', floor(pc.q::float8 + 0.5),
           'mesAnterior', floor(coalesce(pp.q, 0)::float8 + 0.5)) order by pc.q desc, pc.sq), '[]'::jsonb) j
    from pc left join (select tp, sum(cantidad) q from dl where not cur and tp <> '' group by tp) pp on pp.tp = pc.tp
),
limpieza as (
  select jsonb_build_object(
    'kpis', (select j from lkpj),
    'evolucionDiariaRatio', (select coalesce(jsonb_agg(jsonb_build_object('dia', ld.dia,
        'valor', case when ld.usrs > 0 then floor((ld.c::float8 / ld.usrs::float8) * 100 + 0.5) / 100 else 0::float8 end,
        'breakdown', coalesce(lotj.j, '[]'::jsonb)) order by ld.dia), '[]'::jsonb) from ld left join lotj on lotj.dia = ld.dia),
    'distribucionIngresos', (select case when bc.n_li + bc.n_re > 0 then jsonb_build_array(
        jsonb_build_object('label', 'Limpieza', 'valor', bc.n_li,
          'porcentaje', floor(((bc.n_li::float8 / (bc.n_li + bc.n_re)::float8) * 100) * 100 + 0.5) / 100),
        jsonb_build_object('label', 'Reingreso', 'valor', bc.n_re,
          'porcentaje', floor(((bc.n_re::float8 / (bc.n_li + bc.n_re)::float8) * 100) * 100 + 0.5) / 100))
        else '[]'::jsonb end from bc),
    'habitacionesPorDia', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'habMes', habs, 'usrMes', usrs) order by dia), '[]'::jsonb) from ld),
    'promHabitacionesPorDia', (select case when (select count(*) from ld) > 0
        then floor((bc.n_rd::float8 / (select count(*) from ld)::float8) * 100 + 0.5) / 100 else 0::float8 end from bc),
    'diasTrabajados', (select count(*) from ld),
    'comparativoPrendas', (select j from pcj)
  ) j
),

-- ===== DETALLE LIMPIEZA (b) =====
-- promedio global de habitaciones/usuario: its own dedup (first id_univoco among the rows WITH user), as ratioHabitacionesPorUsuario
rcm as (select idu, min(oseq) mo from fn where cur and usuario <> '' group by idu),
rc as (
  select count(*) cnt, count(distinct n.usuario || '||' || n.fecha::text) ud
    from fn n join rcm on rcm.idu = n.idu and rcm.mo = n.oseq
),
uh as (
  select usuario, count(distinct habitacion || '|' || edificio || '||' || fecha::text) v, min(oseq) sq
    from b where cur and usuario <> '' and habitacion <> '' group by usuario
),
up as (
  select usuario, case when den > 0 then floor((sm::float8 / den::float8) * 100 + 0.5) / 100 else 0::float8 end v, sq
    from (select usuario, sum(s) sm, count(distinct habitacion || '|' || edificio || '||' || fecha::text) den, min(oseq) sq
            from b where cur and usuario <> '' and habitacion <> '' and s is not null group by usuario) x
),
detalle_limpieza as (
  select jsonb_build_object(
    'habitacionesPorPersona', jsonb_build_object(
      'totalHabitaciones', (select n_rd from bc),
      'promedio', (select case when rc.ud > 0 then floor((rc.cnt::float8 / rc.ud::float8) * 100 + 0.5) / 100 else 0::float8 end from rc),
      'porUsuario', (select coalesce(jsonb_agg(jsonb_build_object('usuario', usuario, 'valor', v) order by v desc, sq), '[]'::jsonb) from uh)),
    'prendasPorHabitacion', jsonb_build_object(
      'promedio', (select case when n_rdb > 0 then floor((prendas::float8 / n_rdb::float8) * 100 + 0.5) / 100 else 0::float8 end from bc),
      'porUsuario', (select coalesce(jsonb_agg(jsonb_build_object('usuario', usuario, 'valor', v) order by v desc, sq), '[]'::jsonb) from up)),
    'habitacionesPorDia', jsonb_build_object(
      'diasTrabajados', (select count(*) from ld),
      'promedio', (select case when (select count(*) from ld) > 0
          then floor((bc.n_rd::float8 / (select count(*) from ld)::float8) * 100 + 0.5) / 100 else 0::float8 end from bc),
      'serie', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'habMes', habs, 'usrMes', usrs) order by dia), '[]'::jsonb) from ld))
  ) j
)
select jsonb_build_object(
  'resumen', (select j from resumen),
  'limpieza', (select j from limpieza),
  'detalleLimpieza', (select j from detalle_limpieza)
);
$fn$;

-- 3. tecno_dash_inventario ---------------------------------------------------------------------------------------------
-- p_desde/p_hasta: the month (inventarios by fecha); p_idmes: '01' || mm || yy (habitaciones_inventariadas by id_univoco).
create or replace function public.tecno_dash_inventario(
  p_desde date, p_hasta date, p_idmes text,
  p_edificios text[] default null, p_edificio text default null, p_habitacion text default null,
  p_usuario text default null, p_dia int default null,
  p_tipos_depto text[] default null, p_tipo_depto text default null, p_segmento text default null
)
returns jsonb
language sql stable security definer set search_path = public set enable_nestloop = off set enable_mergejoin = off
as $fn$
with
lk as (
  select distinct on (u.depto, coalesce(u.torre, '')) u.depto, coalesce(u.torre, '') torre, coalesce(u.tipo_depto, '') td
    from public.unidades u
   where u.activa = true and coalesce(u.depto, '') <> ''
   order by u.depto, coalesce(u.torre, ''), u.id desc
),
-- filtrarRhi
rf as (
  select r.id, coalesce(r.usuario, '') usuario, coalesce(r.habitacion, '') habitacion, coalesce(r.edificio, '') edificio, l.td
    from public.habitaciones_inventariadas r
    left join lk l on l.depto = coalesce(r.habitacion, '') and l.torre = coalesce(r.edificio, '')
   where r.id_univoco = p_idmes
     and coalesce(r.edificio, '') <> 'Admin'
     and (case when p_edificio is not null then coalesce(r.edificio, '') = p_edificio
               when coalesce(cardinality(p_edificios), 0) = 0 then true
               else coalesce(r.edificio, '') = any(p_edificios) end)
     and (p_habitacion is null or coalesce(r.habitacion, '') = p_habitacion)
     and (p_usuario is null or coalesce(r.usuario, '') = p_usuario)
     and (p_dia is null or extract(day from r.fecha) = p_dia)
     and (case when p_tipo_depto is not null then l.td = p_tipo_depto
               when coalesce(cardinality(p_tipos_depto), 0) = 0 then true
               else l.td = any(p_tipos_depto) end)
),
-- rhiDedup: first row (by id) per room
rd as (
  select distinct on (habitacion, edificio) * from rf where habitacion <> '' and edificio <> '' order by habitacion, edificio, id
),
-- filtrarInv (usuario / dia are coupled through the rooms of the filtered rhi)
i0 as (
  select i.id, coalesce(i.habitacion, '') habitacion, coalesce(i.articulo, '') articulo, coalesce(i.cantidad, 0) cantidad,
         coalesce(i.edificio, '') edificio, coalesce(i.segmento, '') segmento, i.fecha,
         (i.fecha - p_desde)::bigint * 10000000000 + i.id iseq
    from public.inventarios i where i.fecha >= p_desde and i.fecha <= p_hasta
),
inf as (
  select i0.*
    from i0 left join lk l on l.depto = i0.habitacion and l.torre = i0.edificio
   where i0.edificio <> 'Admin'
     and (case when p_edificio is not null then i0.edificio = p_edificio
               when coalesce(cardinality(p_edificios), 0) = 0 then true
               else i0.edificio = any(p_edificios) end)
     and (p_habitacion is null or i0.habitacion = p_habitacion)
     and (p_segmento is null or i0.segmento = p_segmento)
     and (case when p_tipo_depto is not null then l.td = p_tipo_depto
               when coalesce(cardinality(p_tipos_depto), 0) = 0 then true
               else l.td = any(p_tipos_depto) end)
     and ((p_usuario is null and p_dia is null)
          or exists (select 1 from rf where rf.habitacion = i0.habitacion and rf.edificio = i0.edificio))
),
-- invDedup: per (habitacion, edificio, articulo) the row with the latest fecha (the lowest id on a tie: the first one in the JS
-- iteration); kseq = position of the first row of the key (where the JS Map inserted it).
-- bk packs (fecha, -id) in one bigint so a single hash aggregate finds the winner (sorting text keys is the slow part).
ik as (
  select habitacion, edificio, articulo, max((fecha - p_desde)::bigint * 10000000000 - id) bk, min(iseq) kseq
    from inf where articulo <> '' group by habitacion, edificio, articulo
),
idd as (
  select i.habitacion, i.edificio, i.articulo, i.cantidad, i.segmento, ik.kseq
    from inf i
    join ik on ik.habitacion = i.habitacion and ik.edificio = i.edificio and ik.articulo = i.articulo
           and (i.fecha - p_desde)::bigint * 10000000000 - i.id = ik.bk
),
-- habitacionesUniverso
ht as (
  select count(*) n
    from public.unidades u
   where u.activa = true and coalesce(u.torre, '') <> 'Admin'
     and (case when p_edificio is not null then coalesce(u.torre, '') = p_edificio
               when coalesce(cardinality(p_edificios), 0) = 0 then true
               else coalesce(u.torre, '') = any(p_edificios) end)
     and (case when p_tipo_depto is not null then coalesce(u.tipo_depto, '') = p_tipo_depto
               when coalesce(cardinality(p_tipos_depto), 0) = 0 then true
               else coalesce(u.tipo_depto, '') = any(p_tipos_depto) end)
     and (p_habitacion is null or coalesce(u.depto, '') = p_habitacion)
),
ku as (  -- users of the deduped rooms: rooms per user are distinct rows, so sum(rooms) = rows with user
  select count(*) filter (where usuario <> '') nr, count(distinct usuario) filter (where usuario <> '') nu from rd
),
kpis as (
  select jsonb_build_object(
    'habitacionesInventariadas', (select count(*) from rd),
    'habitacionesTotales', (select n from ht),
    'cumplimientoPct', (select case when ht.n > 0 then floor((((select count(*) from rd)::float8 / ht.n::float8) * 100) * 100 + 0.5) / 100 else 0::float8 end from ht),
    'habitacionesPorPersona', (select case when nu > 0 then floor((nr::float8 / nu::float8) * 100 + 0.5) / 100 else 0::float8 end from ku),
    'articulosInventariados', (select floor(coalesce(sum(cantidad), 0)::float8 + 0.5) from idd)
  ) j
),
-- detalleArticulos (unsorted: the BFF sorts it with localeCompare('es'))
cant as (select articulo, sum(cantidad) q from idd group by articulo),
cat as (
  select nombre,
         array(select btrim(x, E' \t\r\n ') from unnest(regexp_split_to_array(coalesce(edificios, ''), '[,;]')) x
                where btrim(x, E' \t\r\n ') <> '') eds,
         coalesce(cant_teorica, 0) ct
    from public.articulos_inventario where coalesce(nombre, '') <> ''
),
scope as (  -- edificiosScope: the single wins over the multi; NULL = no scope
  select case when p_edificio is not null then array[p_edificio]
              when coalesce(cardinality(p_edificios), 0) > 0 then p_edificios end sc
),
teo as (
  select cat.nombre, sum(cat.ct) q
    from cat, scope
   where scope.sc is null or cardinality(cat.eds) = 0 or cat.eds && scope.sc
   group by cat.nombre
),
art as (  -- cantidades already rounded (round0) before the difference / percentages, as the JS
  select n.nombre articulo, floor(coalesce(c.q, 0)::float8 + 0.5) ci, floor(coalesce(t.q, 0)::float8 + 0.5) ct
    from (select nombre from teo union select articulo from cant) n
    left join cant c on c.articulo = n.nombre left join teo t on t.nombre = n.nombre
),
artj as (
  select coalesce(jsonb_agg(jsonb_build_object('articulo', articulo, 'cantInventario', ci, 'cantTeorica', ct,
           'diferencia', ct - ci,
           'varPct', case when ct > 0 then floor(((ci / ct) * 100) * 100 + 0.5) / 100 else 0::float8 end,
           'varPctDiferencia', case when ct > 0 then floor((100 - floor(((ci / ct) * 100) * 100 + 0.5) / 100) * 100 + 0.5) / 100 else 0::float8 end)), '[]'::jsonb) j
    from art
),
-- distribucionUnidades / distribucionTipoDepto: distinct rooms per tipo (`|| 'Sin tipo'`)
du as (select coalesce(nullif(td, ''), 'Sin tipo') label, count(*) valor, min(id) sq from rd group by 1),
duj as (
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'valor', valor,
           'porcentaje', floor(((valor::float8 / tot::float8) * 100) * 100 + 0.5) / 100) order by valor desc, sq), '[]'::jsonb) j
    from (select *, sum(valor) over () tot from du) x
),
-- distribucionSegmentos: units by segment over the deduped inventory
ds as (select coalesce(nullif(segmento, ''), 'Sin segmento') label, sum(cantidad) valor, min(kseq) sq from idd group by 1),
dsj as (
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'valor', floor(valor::float8 + 0.5),
           'porcentaje', floor(((valor::float8 / tot::float8) * 100) * 100 + 0.5) / 100) order by floor(valor::float8 + 0.5) desc, sq), '[]'::jsonb) j
    from (select *, sum(valor) over () tot from ds) x
),
de as (select edificio, count(*) cantidad, min(id) sq from rd group by edificio),
dej as (select coalesce(jsonb_agg(jsonb_build_object('edificio', edificio, 'cantidad', cantidad) order by cantidad desc, sq), '[]'::jsonb) j from de),
-- detalle: articles per room (entry position = first row of any of its keys)
hb as (select habitacion, edificio, count(*) cant, min(kseq) sq from idd where habitacion <> '' group by habitacion, edificio),
hbj as (select coalesce(jsonb_agg(jsonb_build_object('habitacion', habitacion, 'edificio', edificio, 'cantArticulos', cant) order by cant desc, sq), '[]'::jsonb) j from hb),
-- detalle: rooms per user + breakdown by tipo (`?? 'Sin tipo'`: a unit without tipo_depto stays '')
uu as (select usuario, count(*) valor, min(id) sq from rd where usuario <> '' group by usuario),
ut as (select usuario, coalesce(td, 'Sin tipo') tipo, count(*) c, min(id) sq from rd where usuario <> '' group by 1, 2),
utj as (
  select usuario, jsonb_agg(jsonb_build_object('tipoDepto', tipo, 'cantidad', c,
           'porcentaje', floor(((c::float8 / tot::float8) * 100) * 100 + 0.5) / 100) order by c desc, sq) j
    from (select *, sum(c) over (partition by usuario) tot from ut) x group by usuario
),
uuj as (
  select coalesce(jsonb_agg(jsonb_build_object('usuario', uu.usuario, 'valor', uu.valor, 'breakdown', utj.j) order by uu.valor desc, uu.sq), '[]'::jsonb) j
    from uu join utj on utj.usuario = uu.usuario
)
select jsonb_build_object(
  'inventario', jsonb_build_object(
    'kpis', (select j from kpis),
    'detalleArticulos', (select j from artj),
    'distribucionUnidades', (select j from duj),
    'distribucionSegmentos', (select j from dsj),
    'habitacionesPorEdificio', (select j from dej)),
  'detalleInventario', jsonb_build_object(
    'kpis', (select j from kpis),
    'habitaciones', (select j from hbj),
    'porUsuario', (select j from uuj),
    'distribucionTipoDepto', (select j from duj))
);
$fn$;

-- 4. grants: the BFF (service role) only ------------------------------------------------------------------------------
revoke all on function public.tecno_dash_filtros(date, date, text) from public, anon, authenticated;
revoke all on function public.tecno_dash_ordenes(date, date, date, date, text[], text, text, text, int, text, text[], text, text) from public, anon, authenticated;
revoke all on function public.tecno_dash_inventario(date, date, text, text[], text, text, text, int, text[], text, text) from public, anon, authenticated;
grant execute on function public.tecno_dash_filtros(date, date, text) to service_role;
grant execute on function public.tecno_dash_ordenes(date, date, date, date, text[], text, text, text, int, text, text[], text, text) to service_role;
grant execute on function public.tecno_dash_inventario(date, date, text, text[], text, text, text, int, text[], text, text) to service_role;

-- 5. the check: every function exists, is SECURITY DEFINER with a pinned search_path, and only service_role can run it
do $$
declare
  f text;
  v_oid oid;
begin
  foreach f in array array[
    'public.tecno_dash_filtros(date, date, text)',
    'public.tecno_dash_ordenes(date, date, date, date, text[], text, text, text, integer, text, text[], text, text)',
    'public.tecno_dash_inventario(date, date, text, text[], text, text, text, integer, text[], text, text)'
  ] loop
    v_oid := to_regprocedure(f);
    if v_oid is null then raise exception '%: the function is missing', f; end if;
    if not (select prosecdef from pg_proc where oid = v_oid) then raise exception '%: must be SECURITY DEFINER', f; end if;
    if not exists (select 1 from pg_proc where oid = v_oid and proconfig @> array['search_path=public']) then
      raise exception '%: search_path must be pinned to public', f;
    end if;
    if has_function_privilege('anon', v_oid, 'execute') or has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception '%: anon / authenticated must not execute it', f;
    end if;
    if not has_function_privilege('service_role', v_oid, 'execute') then raise exception '%: service_role must execute it', f; end if;
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where p.oid = v_oid and x.grantee = 0) then
      raise exception '%: PUBLIC still holds EXECUTE', f;
    end if;
  end loop;
  if to_regclass('public.ordenes_limpieza_fecha_idx') is null or to_regclass('public.ordenes_limpieza_detalle_fecha_idx') is null
     or to_regclass('public.inventarios_fecha_idx') is null then
    raise exception 'the fecha indexes are missing';
  end if;
end $$;

-- PostgREST picks the new functions up on its next schema reload; ask for it now.
notify pgrst, 'reload schema';
