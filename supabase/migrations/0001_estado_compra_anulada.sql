-- Adapter Fase 1: estado_compra needs 'Anulada' (compras.anular sets Status_C='Anulada';
-- it's in types.ts EstadoCompra + the mock, but was missing from the original enum).
ALTER TYPE estado_compra ADD VALUE IF NOT EXISTS 'Anulada';
