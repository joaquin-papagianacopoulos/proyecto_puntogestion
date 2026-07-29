# PuntoGestion — Informe de seguridad, calidad y optimización

Revisión hecha sobre todo el código de la aplicación (pantallas, funciones del lado del servidor y la base de datos). Se explica cada punto en términos simples; donde hace falta nombrar un archivo puntual, es solo como referencia para quien después tenga que corregirlo.

**Actualización:** todos los puntos débiles de este informe ya se corrigieron, salvo uno que quedó documentado como pendiente a propósito (ver el final de la sección de Optimización). El detalle de cada corrección queda debajo de cada punto original, marcado como "✅ Corregido".

---

## 1. Seguridad — cómo está protegida la información

En general, el sistema está construido con buenos criterios de seguridad. El punto más importante: **las reglas de acceso están puestas en la base de datos, no solo en las pantallas** — aunque alguien lograra saltarse una pantalla, la base de datos igual le va a negar el acceso a datos que no le corresponden. Esto se verificó en todos los casos revisados.

### Lo que está bien resuelto

- **Ninguna distribuidora puede ver datos de otra.** Cada tabla de información (pedidos, productos, clientes, deudas, etc.) tiene una regla que exige pertenecer a esa distribuidora para leerla o tocarla. Se revisaron las 14 tablas del sistema y todas tienen esta protección activa.
- **La clave secreta más sensible del sistema (la que tiene acceso total a la base de datos) nunca se envía al celular ni a la computadora del usuario.** Se usa únicamente en el servidor, y el código está armado de una forma que directamente impide por error que termine en el navegador.
- **El archivo con esa clave (`.env`) nunca se subió a ningún repositorio.** Está correctamente excluido.
- **Los precios de un pedido no los puede inventar un vendedor.** Siempre se toman del precio oficial guardado en ese momento, calculado por el propio servidor — nunca por un valor que mande el celular.
- **Nadie puede ascenderse a sí mismo.** Un administrador no puede crear otro administrador ni echarlo (solo el dueño puede), y el dueño no se puede eliminar. Se probaron estos casos puntualmente en el código y están bien bloqueados.
- **Las fotos que se suben (comprobantes de deudas) no son públicas.** Solo se pueden ver con sesión iniciada y con un enlace que vence después de una hora.
- **No hay ninguna "puerta trasera"** (endpoints o rutas sueltas) fuera del sistema de pantallas normal — todo pasa por los mismos controles de sesión y rol.
- **No se encontró ningún lugar donde texto escrito por un usuario (nombre de producto, anotación de un pedido, nombre de cliente) se pueda usar para inyectar código o alterar la página de otro usuario.** El sistema que arma las pantallas escapa automáticamente ese texto.

### Riesgos encontrados (de mayor a menor importancia)

**1. Una librería que se usa para leer archivos Excel tiene fallas de seguridad conocidas, sin corrección disponible todavía.**
Se usa para importar listas de precios de proveedores (Configuración → Importar productos). Las fallas permitirían, con un archivo Excel armado a propósito, hacer que el servidor consuma recursos de más o se comporte de forma inesperada. Como esta función solo la puede usar el dueño o un administrador (no cualquier visitante), el riesgo práctico es bajo, pero como el servidor es compartido entre todas las distribuidoras que usan el sistema, conviene resolverlo antes de tener muchos clientes activos.

✅ **Corregido.** Primero probé cambiar a otra librería mantenida (`exceljs`), pero terminaba trayendo *más* fallas de seguridad de arrastre (una librería de compresión interna con sus propios problemas) — hubiera sido peor el remedio que la enfermedad. En cambio, se actualizó a la versión corregida que el propio autor de la librería original publica (por una pelea con el repositorio oficial de paquetes, la versión arreglada no está ahí, pero sí en la web del autor) — mismo comportamiento, mismo código de la app sin tocar, sin la falla de seguridad. Verificado con la herramienta de auditoría de dependencias: antes de esto, la librería de Excel aparecía como riesgo; ahora ya no aparece.

**2. Falta un tipo de foto por excluir al subir comprobantes.**
Se aceptan todas las imágenes, incluyendo un formato (SVG) que en algunos casos puede contener código escondido. El riesgo es bajo (solo lo suben el dueño/administrador, y las fotos se muestran de una forma que normalmente neutraliza ese riesgo), pero es una corrección simple: alcanza con no aceptar ese formato en particular.

✅ **Corregido.** Ahora, al subir una foto de comprobante, si el archivo es un SVG se rechaza con un mensaje claro, aunque técnicamente cuente como "imagen".

**3. Faltan algunas cabeceras de seguridad estándar del sitio web** (protecciones genéricas que ofrecen los navegadores, como impedir que el sitio se cargue "escondido" dentro de otra página). No es algo urgente, pero es recomendable agregarlo antes de una puesta en producción con público real.

✅ **Corregido.** Se agregaron las cabeceras estándar recomendadas: bloqueo de que el sitio se cargue dentro de otra página (clickjacking), bloqueo de que el navegador "adivine" el tipo de un archivo, una política de qué recursos puede cargar la página (solo los propios y los de la base de datos, nada de otros orígenes), y forzado de conexión segura (HTTPS). Verificado que las cabeceras efectivamente llegan en cada respuesta del sitio.

No se encontraron riesgos graves de robo de datos, de acceso indebido entre distribuidoras, ni de manipulación de precios o pagos.

---

## 2. QA / control de calidad — problemas de funcionamiento encontrados

**1. La fecha impresa en la factura no siempre coincide con la fecha del pedido. (El más importante de esta sección)**
Cuando se carga un pedido, el sistema ya distingue entre "cuándo se cargó" y "fecha del pedido" (esta última se puede editar, por ejemplo si el pedido se tomó por teléfono el día anterior). El problema: la fecha que se imprime en la factura, la que aparece en la lista de Pedidos, y el nombre del archivo PDF, en realidad seguían mostrando "cuándo se cargó" en vez de la fecha del pedido que se haya editado.

✅ **Corregido** (fue lo primero que se resolvió, en una vuelta anterior a este informe). Ahora la factura, la lista y el nombre del archivo usan siempre la fecha del pedido, y de paso se aprovechó para blindar el formateo de fechas contra un problema relacionado (una fecha "simple" mostrada desde el celular podía correrse un día — ver punto 4 más abajo, que también quedó resuelto de forma general con el mismo cambio).

**2. Al registrar un pago de una deuda, no hay un aviso si el monto es mayor a lo que realmente se debe.** No rompe nada, pero podría dejar un saldo "negativo" sin que nadie lo note. Sería bueno agregar un aviso (no necesariamente bloquearlo, por si el negocio quiere registrar algo así a propósito).

✅ **Corregido.** Ahora, si el monto ingresado supera el saldo pendiente, aparece un cartel de confirmación antes de guardar ("¿Registrar el pago igual?") — se puede seguir registrando a propósito, solo que ya no pasa desapercibido.

**3. Al cargar un cliente nuevo desde "Crear pedido", no se avisa si ya existe uno con el mismo nombre.** Un vendedor apurado podría crear el mismo cliente dos veces sin darse cuenta. No es grave, pero ensucia la lista de clientes con el tiempo.

✅ **Corregido.** Al escribir el nombre de un cliente nuevo, si ya existe uno con ese mismo nombre aparece un aviso con un botón para usar ese cliente existente en vez de crear uno repetido.

**4. Riesgo latente de fechas corridas por un día**, ya identificado y evitado en la pantalla de Estadísticas, pero que hay que tener presente si se agregan pantallas nuevas que muestren fechas: si una fecha "simple" (sin hora) se llega a mostrar desde el celular en vez de calcularse en el servidor, puede aparecer un día antes del real.

✅ **Corregido de forma general** (no solo "vigilado"): la función central que formatea fechas en toda la app ahora detecta este caso puntual y lo calcula de una forma que no depende de en qué huso horario esté el celular. Cualquier pantalla nueva que la use (que son todas) queda protegida automáticamente, no hace falta acordarse caso por caso.

No se encontraron errores de cálculo de precios, totales, ni de stock — esa parte se probó a fondo (incluyendo casos raros, como editar un pedido varias veces o revertir una factura) y funciona de forma consistente.

---

## 3. Oportunidades de optimización

**1. El catálogo completo de productos se manda entero al celular en varias pantallas** (Crear pedido, Productos, Control de stock). Hoy funciona bien, pero como algunos proveedores tienen catálogos de más de mil setecientos productos, a medida que crezca más esto va a empezar a sentirse más lento en celulares de gama baja o con datos móviles limitados. La mejora que se había sugerido acá era que la búsqueda de productos se resuelva directamente contra la base de datos a medida que se escribe, en vez de mandar todo el catálogo de una.

⚠️ **Pendiente a propósito, no por descuido.** Después de este informe se agregó soporte para cargar pedidos sin señal en la calle (a pedido explícito, viendo que era una desventaja real contra la app anterior) — y esa función depende exactamente de tener el catálogo completo guardado en el celular de antemano, para poder buscar productos sin conexión. Cambiar la búsqueda para que dependa del servidor iría en contra directa de esa función y rompería el soporte offline. Por eso este punto queda **explícitamente en espera** hasta que el catálogo crezca lo suficiente como para que valga la pena rediseñar ambas cosas juntas (por ejemplo, guardando el catálogo completo en el celular igual, pero paginado/comprimido de otra forma). No es un punto olvidado, es una decisión.

**2. Se pueden acelerar algunas búsquedas agregando un par de índices adicionales** en la base de datos (en productos y clientes, para que ordenar y filtrar por nombre sea más rápido a medida que crecen las listas). Es un cambio chico y sin riesgo.

✅ **Corregido.** Se agregaron los índices en productos y clientes (por organización + nombre, que es como se ordenan y filtran casi siempre).

**3. Actualizar algunas dependencias del proyecto** (además de la librería de Excel mencionada en seguridad) para aprovechar mejoras de rendimiento y evitar quedar atrasado con el tiempo.

**Parcial.** La librería de Excel ya se actualizó (ver Seguridad #1). El resto de las dependencias se dejaron como están por ahora — actualizarlas en bloque sin necesidad puntual es más riesgo (romper algo que hoy funciona) que beneficio real; mejor hacerlo cuando haya una razón concreta (una función nueva que lo necesite, o una falla de seguridad puntual como la de Excel).

---

## Resumen — estado actual

| Tema | Estado |
|---|---|
| Fecha incorrecta en facturas/listado (QA #1) | ✅ Corregido |
| Librería de Excel con fallas conocidas (Seguridad #1) | ✅ Corregido |
| Excluir formato SVG en fotos de comprobantes (Seguridad #2) | ✅ Corregido |
| Cabeceras de seguridad del sitio (Seguridad #3) | ✅ Corregido |
| Aviso de pago mayor a la deuda (QA #2) | ✅ Corregido |
| Aviso de cliente duplicado (QA #3) | ✅ Corregido |
| Fechas corridas por huso horario (QA #4) | ✅ Corregido |
| Índices de base de datos (Optimización #2) | ✅ Corregido |
| Búsqueda de productos contra servidor en vez de mandar todo el catálogo (Optimización #1) | ⚠️ En espera a propósito — choca con el soporte offline que se agregó después |
| Actualizar dependencias en general (Optimización #3) | Parcial — solo la de Excel, que era la que importaba |

No quedan puntos débiles pendientes por resolver, salvo la búsqueda contra servidor, que se dejó en espera por una razón concreta (ver el punto correspondiente arriba).
