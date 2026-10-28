# Alias de edificios (nombres del negocio ↔ base)

El negocio/los usuarios le dicen a los edificios con nombres de calle o marketing que **no siempre
coinciden** con `edificios.nombre` en Supabase. El nombre canónico —el que usa la app para filtrar
(dashboard `edificios_dash`, OTs, ventilaciones)— es **`edificios.nombre`**. Esta tabla es el
cruce para no confundirse.

| Alias / dirección del negocio | `edificios.nombre` (base) |
|---|---|
| Esmeralda | Downtown |
| Belgrano | Libertador |
| Gorriti, Hollywood | Palermo Hollywood |
| Cabello | Palermo Chico |
| Godoy Cruz, Soho | Palermo Soho |
| Wow | Nuñez |
| Montañeses | Montañeses |
| Huergo | Huergo |
| Jaramillo | Hub |

## Nota sobre Jaramillo / Hub

En la base existe un edificio `Jaramillo` **inactivo** (~4 unidades): es un edificio VIEJO que ya no
existe — queda inactivo a propósito, no tocar. Al edificio activo cuyo `edificios.nombre` es **`Hub`**
(~33 unidades) el negocio hoy lo llama **Jaramillo**. Por eso el alias `Jaramillo → Hub`. Para
asignaciones (`edificios_dash`, etc.) usar SIEMPRE `Hub`, nunca `Jaramillo`.

## Nota

Los valores de `edificios_dash` (torres que ve cada usuario en el dashboard) se guardan con el
**nombre de la base**, no con el alias. Si algún día se renombra un edificio, hay que actualizar
tanto `edificios.nombre` como los strings `edificios_dash` que lo referencian.
