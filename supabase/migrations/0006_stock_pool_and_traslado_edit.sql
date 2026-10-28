-- 0006 — Stock pooling by grupo_stock (#1) + TRASLADO edit rebalances both buildings (#2).
--
-- #1  PA merged paired buildings (edificios.grupo_stock: Hollywood↔Dorrego, Hub↔Nuñez, Admin↔Admin 2)
--     into ONE shared stock pool. The new stock_pool_edificios() helper resolves the whole pool; the
--     stock lookups in stock_agregar / stock_salida (destino) / stock_editar_salida (destino) /
--     ot_asignar_repuesto / compras_recibir now match
--       se.edificio_id IN (SELECT stock_pool_edificios(<building>))
--     so paired buildings draw from / credit the same rows.
--
-- #2  salidas_stock gains edificio_destino_id — the destination building credited on a TRASLADO — so
--     stock_editar_salida can rebalance BOTH buildings by the inverse delta (PA's 4-patch edit), instead
--     of correcting only the source and silently desyncing the destination.
--
-- WHAT THIS FILE APPLIES: the new helper function + the schema column (the deltas an existing DB needs).
-- The updated FUNCTION BODIES (the 5 functions above) live in supabase/rpc.sql and reach the DB by
-- re-applying it on deploy: `node scripts/migrate/apply-sql.mjs supabase/rpc.sql` (the standard step here,
-- per rpc.sql's header). Both mirror the mock spec (services/mock/adapter.ts: edificiosDelPool +
-- editarSalida destino rebalance), which is unit-checked in scripts/checks/run.ts.

-- Buildings that share a stock pool: same non-null grupo_stock, else the building on its own.
CREATE OR REPLACE FUNCTION stock_pool_edificios(p_edificio_id bigint)
RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e2.id
  FROM edificios e1
  JOIN edificios e2
    ON (e1.grupo_stock IS NOT NULL AND e2.grupo_stock = e1.grupo_stock) OR e2.id = e1.id
  WHERE e1.id = p_edificio_id;
$$;

-- Destination building credited on a TRASLADO salida (NULL for every other tipo and for legacy rows).
ALTER TABLE salidas_stock
  ADD COLUMN IF NOT EXISTS edificio_destino_id bigint NULL REFERENCES edificios (id) ON DELETE SET NULL;
