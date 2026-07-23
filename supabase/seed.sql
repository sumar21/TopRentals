-- TopRentals — dev seed data
-- Small, realistic dataset for local development. Not the SharePoint migration
-- (that's a separate Node/TS script per data_model.md "## Migration") — just
-- enough rows to exercise every table's shape and the stock_edificios /
-- compras/aprobaciones/ventilaciones relationships.
--
-- Apply after schema.sql. FK lookups use names/codes (SELECT ... WHERE ...)
-- instead of hardcoded ids, since ids are identity-generated here (unlike the
-- real migration, which preserves SharePoint numeric ids).

BEGIN;

-- ----------------------------------------------------------------------------
-- edificios — real building names, zonas and grupos de stock from the apps
-- ----------------------------------------------------------------------------
INSERT INTO edificios (nombre, pais, zona, grupo_stock) VALUES
  ('Palermo Chico',     'Argentina', 'Palermo Chico, Palermo Soho',        NULL),
  ('Palermo Soho',      'Argentina', 'Palermo Chico, Palermo Soho',        NULL),
  ('Palermo Hollywood', 'Argentina', 'Palermo Hollywood, Dorrego',         'Palermo Hollywood + Dorrego'),
  ('Dorrego',           'Argentina', 'Palermo Hollywood, Dorrego',         'Palermo Hollywood + Dorrego'),
  ('Montañeses',        'Argentina', 'Montañeses, Nuñez, Hub, Jaramillo',  NULL),
  ('Nuñez',             'Argentina', 'Montañeses, Nuñez, Hub, Jaramillo',  'Hub + Nuñez'),
  ('Hub',               'Argentina', 'Montañeses, Nuñez, Hub, Jaramillo',  'Hub + Nuñez'),
  ('Jaramillo',         'Argentina', 'Montañeses, Nuñez, Hub, Jaramillo',  NULL),
  ('Admin',             'Argentina', NULL,                                 'Admin + Admin 2'),
  ('Admin 2',           'Argentina', NULL,                                 'Admin + Admin 2');

-- ----------------------------------------------------------------------------
-- frecuencias — picklist
-- ----------------------------------------------------------------------------
INSERT INTO frecuencias (nombre, dias) VALUES
  ('Semanal',   7),
  ('Quincenal', 15),
  ('Mensual',   30);

-- ----------------------------------------------------------------------------
-- articulos
-- ----------------------------------------------------------------------------
INSERT INTO articulos (codigo, nombre, precio_unitario, detalle) VALUES
  ('ART-001', 'Papel higienico x4',    1200.50, 'Rollo de papel higienico paquete x4'),
  ('ART-002', 'Jabon liquido 5L',      3400.00, 'Jabon liquido para manos, bidon 5 litros'),
  ('ART-003', 'Bolsas de residuo x50', 2100.00, 'Bolsas negras 50 unidades'),
  ('ART-004', 'Lampara LED',            850.00, 'Lampara LED 9W rosca E27'),
  ('ART-005', 'Filtro de aire split',  4200.00, 'Filtro descartable para aire acondicionado split');

-- ----------------------------------------------------------------------------
-- usuarios — one per perfil
-- ----------------------------------------------------------------------------
INSERT INTO usuarios (nombre, apellido, concat_name, usuario_app, mail, perfil, edificio_id, validado, activo) VALUES
  ('Ana',   'Gomez',   'Ana Gomez',   'agomez',  'ana.gomez@toprentals.com',   'Admin',                     NULL, true, true),
  ('Luis',  'Perez',   'Luis Perez',  'lperez',  'luis.perez@toprentals.com',  'Tecnico',                   (SELECT id FROM edificios WHERE nombre = 'Hub'), true, true),
  ('Marta', 'Diaz',    'Marta Diaz',  'mdiaz',   'marta.diaz@toprentals.com',  'Gerencia',                  NULL, true, true),
  ('Carlos','Suarez',  'Carlos Suarez','csuarez','carlos.suarez@toprentals.com','Compras',                  NULL, true, true),
  ('Elena', 'Rios',    'Elena Rios',  'erios',   'elena.rios@toprentals.com',  'Supervisor Ventilaciones',  (SELECT id FROM edificios WHERE nombre = 'Palermo Soho'), true, true),
  ('Jorge', 'Lopez',   'Jorge Lopez', 'jlopez',  'jorge.lopez@toprentals.com', 'Recepcion',                 (SELECT id FROM edificios WHERE nombre = 'Palermo Hollywood'), true, true),
  ('Sofia', 'Martin',  'Sofia Martin','smartin', 'sofia.martin@toprentals.com','Operador',                  (SELECT id FROM edificios WHERE nombre = 'Dorrego'), true, true);

-- ----------------------------------------------------------------------------
-- unidades
-- ----------------------------------------------------------------------------
INSERT INTO unidades (id_client, depto, torre, edificio_id, tipo_depto, tipo_sector, activa, frecuencia_ventilacion_dias, requiere_ventilacion) VALUES
  ('UNIT-101', '1A',       'Hub',               (SELECT id FROM edificios WHERE nombre = 'Hub'),               'Monoambiente', 'Living',   true, 15,   true),
  ('UNIT-102', '2B',       'Hub',               (SELECT id FROM edificios WHERE nombre = 'Hub'),               '2 Ambientes',  'Living',   true, 15,   true),
  ('UNIT-201', '3A',       'Nuñez',             (SELECT id FROM edificios WHERE nombre = 'Nuñez'),             '2 Ambientes',  'Living',   true, 30,   true),
  ('UNIT-301', 'PB',       'Palermo Soho',      (SELECT id FROM edificios WHERE nombre = 'Palermo Soho'),      'Monoambiente', 'Living',   true, 7,    true),
  ('UNIT-401', '4C',       'Palermo Hollywood', (SELECT id FROM edificios WHERE nombre = 'Palermo Hollywood'), '3 Ambientes',  'Living',   true, 30,   true),
  ('UNIT-402', 'Deposito', 'Dorrego',           (SELECT id FROM edificios WHERE nombre = 'Dorrego'),           'Deposito',     'Servicio', true, NULL, false);

-- ----------------------------------------------------------------------------
-- perfiles_permisos — menu config for both apps
-- ----------------------------------------------------------------------------
INSERT INTO perfiles_permisos (modulo, admin, operador, tecnico, recepcion, compras, jefe_operativo, orden, aplicacion) VALUES
  ('Home',                'SI', 'SI', 'SI', 'SI', 'SI', 'SI', 1, 'Desktop'),
  ('Stock',               'SI', 'SI', 'NO', 'NO', 'SI', 'SI', 2, 'Desktop'),
  ('Compras',             'SI', 'NO', 'NO', 'NO', 'SI', 'SI', 3, 'Desktop'),
  ('Aprobaciones',        'SI', 'NO', 'NO', 'NO', 'SI', 'SI', 4, 'Desktop'),
  ('Ordenes de Trabajo',  'SI', 'SI', 'SI', 'SI', 'NO', 'SI', 5, 'Desktop'),
  ('Ventilaciones',       'SI', 'SI', 'NO', 'NO', 'NO', 'SI', 6, 'Desktop'),
  ('ABM',                 'SI', 'NO', 'NO', 'NO', 'NO', 'NO', 7, 'Desktop'),
  ('Home',                'SI', 'SI', 'SI', 'NO', 'NO', 'SI', 1, 'Mantenimiento'),
  ('Ordenes de Trabajo',  'SI', 'SI', 'SI', 'NO', 'NO', 'SI', 2, 'Mantenimiento'),
  ('Ventilaciones',       'SI', 'SI', 'SI', 'NO', 'NO', 'SI', 3, 'Mantenimiento'),
  ('Stock',               'SI', 'SI', 'NO', 'NO', 'NO', 'SI', 4, 'Mantenimiento');

-- ----------------------------------------------------------------------------
-- ordenes_trabajo
-- ----------------------------------------------------------------------------
INSERT INTO ordenes_trabajo (id_univoco, status, tipo, prioridad, tipo_trabajo, tipo_tarea, unidad_id, torre, departamento, tecnico_id, asignador_id, fecha_inicio, detalle) VALUES
  ('(OT)-001-23072026120000', 'Pendiente', 'ORDEN DE TRABAJO', 'Alta',  'Plomeria',     'Perdida de agua',    (SELECT id FROM unidades WHERE id_client = 'UNIT-101'), 'Hub',          '1A', NULL,                                             (SELECT id FROM usuarios WHERE usuario_app = 'agomez'), current_date,     'Perdida de agua en bano'),
  ('(OT)-002-23072026120500', 'Asignada',  'ORDEN DE TRABAJO', 'Media', 'Electricidad', 'Cambio de lampara',  (SELECT id FROM unidades WHERE id_client = 'UNIT-102'), 'Hub',          '2B', (SELECT id FROM usuarios WHERE usuario_app = 'lperez'), (SELECT id FROM usuarios WHERE usuario_app = 'agomez'), current_date,     'Cambiar lampara del living'),
  ('(OT)-003-23072026121000', 'Cerrada',   'SOLICITUD OT',     'Baja',  'Limpieza',     'Limpieza profunda',  (SELECT id FROM unidades WHERE id_client = 'UNIT-301'), 'Palermo Soho', 'PB', (SELECT id FROM usuarios WHERE usuario_app = 'lperez'), (SELECT id FROM usuarios WHERE usuario_app = 'agomez'), current_date - 5, 'Limpieza post mudanza'),
  ('(OT)-004-23072026121500', 'Anulada',   'ORDEN DE TRABAJO', 'Media', 'Pintura',      'Retoque de pared',   (SELECT id FROM unidades WHERE id_client = 'UNIT-201'), 'Nuñez',        '3A', NULL,                                             (SELECT id FROM usuarios WHERE usuario_app = 'agomez'), current_date - 2, 'Solicitud duplicada, se anula');

-- ----------------------------------------------------------------------------
-- stock + stock_edificios (demonstrates the shared-building-pair junction)
-- ----------------------------------------------------------------------------
INSERT INTO stock (id_univoco, articulo_id, cantidad, precio_unitario, condicion_corte, usuario_id) VALUES
  ('(STK)-001', (SELECT id FROM articulos WHERE codigo = 'ART-001'), 40, 1200.50, 10, (SELECT id FROM usuarios WHERE usuario_app = 'csuarez')),
  ('(STK)-002', (SELECT id FROM articulos WHERE codigo = 'ART-002'), 15, 3400.00, 5,  (SELECT id FROM usuarios WHERE usuario_app = 'csuarez')),
  ('(STK)-003', (SELECT id FROM articulos WHERE codigo = 'ART-003'), 60, 2100.00, 20, (SELECT id FROM usuarios WHERE usuario_app = 'csuarez')),
  ('(STK)-004', (SELECT id FROM articulos WHERE codigo = 'ART-004'), 25, 850.00,  8,  (SELECT id FROM usuarios WHERE usuario_app = 'lperez')),
  ('(STK)-005', (SELECT id FROM articulos WHERE codigo = 'ART-005'), 12, 4200.00, 4,  (SELECT id FROM usuarios WHERE usuario_app = 'lperez'));

INSERT INTO stock_edificios (stock_id, edificio_id)
SELECT s.id, e.id FROM stock s, edificios e WHERE s.id_univoco = '(STK)-001' AND e.nombre IN ('Admin', 'Admin 2')
UNION ALL
SELECT s.id, e.id FROM stock s, edificios e WHERE s.id_univoco = '(STK)-002' AND e.nombre IN ('Hub', 'Nuñez')
UNION ALL
SELECT s.id, e.id FROM stock s, edificios e WHERE s.id_univoco = '(STK)-004' AND e.nombre IN ('Palermo Hollywood', 'Dorrego')
UNION ALL
SELECT s.id, e.id FROM stock s, edificios e WHERE s.id_univoco = '(STK)-003' AND e.nombre = 'Palermo Soho'
UNION ALL
SELECT s.id, e.id FROM stock s, edificios e WHERE s.id_univoco = '(STK)-005' AND e.nombre = 'Jaramillo';

-- ----------------------------------------------------------------------------
-- compras + detalle_compras + aprobaciones
-- ----------------------------------------------------------------------------
INSERT INTO compras (id_compra, usuario_id, usuario_compra, urgencia, fecha, cantidad_total, monto_total, status) VALUES
  ('(BUY)-001-23072026', (SELECT id FROM usuarios WHERE usuario_app = 'csuarez'), 'Carlos Suarez', 'Normal',  current_date,     50, 60025.00, 'Pendiente'),
  ('(BUY)-002-23072026', (SELECT id FROM usuarios WHERE usuario_app = 'csuarez'), 'Carlos Suarez', 'Urgente', current_date - 3, 20, 84000.00, 'Recibida');

INSERT INTO detalle_compras (compra_id, id_univoco, articulo_id, articulo, edificio_id, edificio, cantidad, recibido, costo_unitario, costo_total) VALUES
  ((SELECT id FROM compras WHERE id_compra = '(BUY)-001-23072026'), '(DTC)-001', (SELECT id FROM articulos WHERE codigo = 'ART-001'), 'Papel higienico x4',   (SELECT id FROM edificios WHERE nombre = 'Admin'), 'Admin', 50, 0,  1200.50, 60025.00),
  ((SELECT id FROM compras WHERE id_compra = '(BUY)-002-23072026'), '(DTC)-002', (SELECT id FROM articulos WHERE codigo = 'ART-005'), 'Filtro de aire split', (SELECT id FROM edificios WHERE nombre = 'Hub'),   'Hub',   20, 20, 4200.00, 84000.00);

INSERT INTO aprobaciones (compra_id, status, fecha, urgencia, tecnico, user_gen_id, user_aprob_id, cantidad, monto) VALUES
  ((SELECT id FROM compras WHERE id_compra = '(BUY)-001-23072026'), 'Pendiente', current_date,     'Normal',  'Carlos Suarez', (SELECT id FROM usuarios WHERE usuario_app = 'csuarez'), NULL,                                                    50, 60025.00),
  ((SELECT id FROM compras WHERE id_compra = '(BUY)-002-23072026'), 'Aprobada',  current_date - 2, 'Urgente', 'Carlos Suarez', (SELECT id FROM usuarios WHERE usuario_app = 'csuarez'), (SELECT id FROM usuarios WHERE usuario_app = 'mdiaz'), 20, 84000.00);

-- ----------------------------------------------------------------------------
-- ventilaciones
-- ----------------------------------------------------------------------------
INSERT INTO ventilaciones (estado, unidad_id, direccion_edificio, edificio, habitacion, frecuencia_dias, fecha_ultima, proxima_limpieza, asignado_id) VALUES
  ('Pendiente', (SELECT id FROM unidades WHERE id_client = 'UNIT-101'), 'Migueletes 1200', 'Hub',          '1A', 15, current_date - 15, current_date, (SELECT id FROM usuarios WHERE usuario_app = 'erios')),
  ('Asignada',  (SELECT id FROM unidades WHERE id_client = 'UNIT-201'), 'Zapiola 1500',    'Nuñez',        '3A', 30, current_date - 30, current_date, (SELECT id FROM usuarios WHERE usuario_app = 'erios')),
  ('Realizada', (SELECT id FROM unidades WHERE id_client = 'UNIT-301'), 'Thames 1700',     'Palermo Soho', 'PB', 7,  current_date - 7,  current_date, (SELECT id FROM usuarios WHERE usuario_app = 'erios'));

COMMIT;

-- ponytail: intentionally NOT seeded (out of scope per request) — frecuencias
-- beyond the 3 picklist rows, iconos_app, emails_notificacion,
-- movimientos_stock, salidas_stock, bitacoras/fotos_bitacora, repuestos_ot,
-- documentos. Add rows to these the same way (INSERT ... SELECT id FROM ...
-- WHERE <natural key>) if a screen needs to be developed against them.
