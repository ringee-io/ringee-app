# Plan de evolución UI/UX de la aplicación Ringee

Investigación: 28 de septiembre de 2026. Revisión final: 29 de septiembre de 2026. Estado: propuesta para diseño y validación; no implementada.

## Decisión recomendada

Diseñar Ringee como un espacio de trabajo para gestionar conversaciones y producir resultados: identificar lo pendiente, preparar la interacción, llamar o responder con contexto, registrar el resultado y continuar. La interfaz debe hacer visibles esas relaciones.

La prioridad es aumentar la claridad operativa: qué estoy viendo, a quién pertenece, qué estado tiene, qué puedo hacer y qué pasará después. Mantener una apariencia sobria, con mayor jerarquía, mejores etiquetas y una densidad que permita trabajar durante horas.

## Alcance y método

Revisión visual de la aplicación autenticada en escritorio: dashboard, marcador, bandeja, contactos, campañas, listado y editor de agentes de voz, menú de usuario y configuración. Revisión del código de navegación, componentes compartidos, llamadas, campañas, bandeja, onboarding y reglas de negocio. Contraste con documentación primaria de Aircall, Quo, Close, Nielsen Norman Group y W3C.

No se realizaron llamadas, envíos, compras ni cambios de configuración. No se probó audio en vivo, se entrevistó a usuarios ni se midieron tiempos reales de tarea. La inspección visual se hizo en el tema oscuro de la sesión; contraste numérico, tema claro, móvil y navegación completa por teclado requieren validación posterior. El repositorio local y la versión desplegada pueden diferir. No se incluyen datos personales de la sesión en esta propuesta.

Los problemas observados se distinguen de hipótesis de diseño. Las recomendaciones sobre prioridades y organización son juicio de producto basado en la naturaleza de Ringee, pendiente de pruebas con usuarios. Las métricas y plazos que siguen son objetivos y estimaciones, no resultados obtenidos.

## 1. Naturaleza del producto y usuarios

Ringee combina comunicación en tiempo real, trabajo comercial, colaboración y administración de una infraestructura que consume dinero. Una llamada exige atención inmediata; un seguimiento exige memoria y contexto; una configuración de enrutamiento exige comprensión de consecuencias.

| Perfil de trabajo                   | Necesidad principal                                               | Inicio recomendado                                          |
| ----------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Profesional individual              | Llamar, recordar acuerdos y volver a contactar                    | Hoy, con próximos seguimientos y acceso directo al marcador |
| Miembro de un equipo                | Atender lo asignado y avanzar sin perder contexto                 | Mi trabajo, conversaciones y sesión asignada                |
| Administrador que también supervisa | Ver excepciones, distribuir trabajo y controlar operación y gasto | Hoy del equipo y acceso a informes                          |
| Responsable de agentes de IA        | Configurar una tarea, probarla y verificar resultados reales      | Agentes: atención requerida, pruebas y actividad            |

Estos son perfiles de uso; no se propone crear nuevos roles de autorización. Respetar los roles y límites personales/organización existentes. Permitir elegir y recordar el inicio preferido dentro del workspace, sin reorganizar automáticamente el menú en cada visita.

## 2. Diagnóstico de la experiencia actual

| Evidencia                                                                                                           | Consecuencia probable                                                                                  | Cambio propuesto                                                                                         | Prioridad |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------- |
| El inicio abre “Outbound Performance”, con estadísticas y widgets                                                   | El usuario debe averiguar en otra pantalla qué necesita hacer ahora                                    | Incorporar Hoy como inicio operativo y conservar la analítica en Informes                                | P1        |
| Navegación General / Outreach / Intelligence; Activities, Callbacks y Pending Actions en lugares distintos          | Las tareas relacionadas tienen nombres y puntos de entrada dispersos                                   | Agrupar por trabajo diario, operación y administración                                                   | P1        |
| Grabaciones, tarifas, compra de números, facturación y ajustes están en el menú del avatar                          | Configuraciones del negocio se buscan en un lugar asociado a la cuenta personal                        | Accesos persistentes a Números, Configuración y Facturación según permisos                               | P1        |
| El marcador muestra “No contacts found” antes de introducir un destino completo                                     | Parece que la libreta está vacía o falló                                                               | Estado inicial “Busca un contacto o escribe un número”; mostrar falta de coincidencias después de buscar | P0        |
| Contactos oculta Llamar y Ver dentro del menú de fila; “Delete by Tag” está en la barra principal                   | Las acciones de mayor frecuencia requieren descubrir un menú; la destrucción ocupa un lugar prominente | Nombre enlazado, acción visible para llamar y eliminación en acciones masivas explícitas                 | P0        |
| Contactos muestra “10 row(s) total” y “Page 1 of 6” simultáneamente; el componente cuenta las filas cargadas        | El total y el alcance de selección no son fiables para el usuario                                      | “1–10 de N contactos”, con total del servidor y alcance de selección explícito                           | P0        |
| La bandeja presenta nueve chips: asignación, canal, lectura y estado mezclados                                      | No se entiende qué dimensiones se pueden combinar                                                      | Vistas de trabajo y filtros separados, con resumen visible del filtro activo                             | P1        |
| Varias entradas de bandeja repiten el nombre y “Call completed”, sin diferenciar claramente la línea en la lista    | Cuesta distinguir hilos e identificar qué merece atención                                              | Mostrar línea, última interacción específica, responsable y estado útil                                  | P1        |
| El saldo en un botón con degradado domina visualmente; muchas acciones operativas son grises                        | La prominencia visual no sigue la prioridad de la tarea                                                | Reservar el acento para la acción principal; aumentar el énfasis del saldo cuando afecta la operación    | P0        |
| La sesión en inglés muestra widgets con títulos en español; hay cadenas inglesas literales en controles compartidos | Inconsistencia de lenguaje y significado                                                               | Localizar la interfaz; separar títulos personalizados de títulos del sistema                             | P0        |
| Las tarjetas de campaña destacan cantidad, modo, intentos y creación                                                | Para decidir qué hacer falta progreso, trabajo disponible y bloqueos                                   | Añadir señales operativas y entrada explícita a Ver campaña / Continuar                                  | P1        |
| La tarjeta de campaña usa un contenedor con onClick; el título no aparece como enlace en el árbol accesible         | El destino principal es menos reconocible y puede ser difícil de alcanzar por teclado                  | Título enlazado y controles nativos con foco visible                                                     | P0        |
| Setup del agente de voz dedica gran parte de la primera vista a modelos/proveedores; existen ocho pestañas          | El usuario empieza por decisiones técnicas antes de verificar el objetivo del agente                   | Organizar por tarea, conocimiento, comportamiento, pruebas y actividad; modelo avanzado secundario       | P2        |
| Onboarding combina solicitud revisada de prueba con textos que prometen la primera llamada gratis                   | Las expectativas pueden diferir del estado de elegibilidad                                             | Copy condicionado al estado confirmado del servidor; revisar la inconsistencia documentada de BILL-018   | P0        |

La fragmentación puede causar más pasos y dudas; su impacto real debe medirse. La mezcla de idiomas en widgets podría proceder de títulos personalizados guardados: investigar antes de sobrescribirlos. Hilos con el mismo nombre no prueban duplicación de datos: pueden corresponder a líneas o participantes distintos.

## 3. Lo que conviene conservar

- La bandeja ya reúne eventos y tiene un panel de contexto del contacto. Ampliar esa base.
- El marcador ya tiene cola de trabajo, callbacks, actividad de hoy e historial reciente.
- Las campañas ya tienen un espacio de agente con contacto, teléfono y resultado.
- Llamada activa y cierre posterior ya se comparten mediante `@ringee/dialer-ui`.
- Configuración ya tiene búsqueda, navegación interna, permisos y enlaces por fragmento.
- Agentes ya tienen pruebas, conocimiento, llamadas, estimación de coste y protección de cambios sin guardar.
- Ya existen componentes de tablas, formularios, diálogo, búsqueda de comandos, traducciones y roles.

El rediseño debe reforzar y conectar estos recursos. No hace falta reconstruir la aplicación para mejorar su experiencia.

## 4. Arquitectura de información propuesta

```text
Workspace actual + tipo de espacio
Buscar / comandos                              Nueva llamada

TRABAJO
  Hoy
  Conversaciones
  Llamadas
  Contactos
  Agenda

OPERACIÓN
  Campañas                       según acceso
  Agentes de voz                  organización
  Informes                       alcance según rol

ADMINISTRACIÓN
  Números y enrutamiento          según permisos
  Configuración                  preferencias + integraciones + equipo
  Facturación                    según permisos

Ayuda · Cuenta personal
```

La barra puede mantener grupos cerrables y preferencias. No intentar llegar a un número arbitrario de entradas eliminando funciones; validar la agrupación con tareas de búsqueda.

| Entrada nueva          | Responsabilidad                                                 | Evolución de superficies actuales                                         |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Hoy                    | Qué requiere acción y cuál es el próximo paso                   | Resumen de callbacks, acciones pendientes, reuniones y campañas asignadas |
| Conversaciones         | Continuidad de una relación y mensajes                          | Evolución de Inbox, conservando identidad de hilo y línea                 |
| Llamadas               | Registro de llamadas, estados, grabaciones y acceso al marcador | Call / History / Recordings, con una entrada principal coherente          |
| Agenda                 | Compromisos con fecha                                           | Reuniones y callbacks como tipos distintos, con filtros                   |
| Informes               | Rendimiento y tendencias                                        | Dashboard personalizable existente                                        |
| Números y enrutamiento | Identidad telefónica, capacidades, asignación y destino         | Buy Number, rutas, rotación y configuración relacionada                   |

Activities se mantiene como historial de actividad en contactos y vistas relevantes. Pending Actions debe estudiarse por tipo de acción: es una fuente que Hoy presenta, no necesariamente una cola intercambiable con callbacks. DNC pasa a “No contactar” dentro de administración/contactos, manteniendo advertencias en cada punto de llamada.

Conservar URLs existentes y accesos directos durante la transición. No fusionar tablas ni estados de dominio para simplificar el menú. Una conversación, una llamada, una reunión y un callback conservan identidades distintas aunque se presenten juntas.

## 5. Dirección visual

**Estilo:** herramienta de trabajo sobria, con superficies distinguibles, texto legible y color funcional. Mantener Inter, ya presente. Dar identidad a Ringee mediante un acento teal consistente, iconografía y comportamiento, en vez de depender de un botón de saldo con brillo.

| Elemento           | Especificación inicial para prototipo                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tema claro         | Fondo gris muy suave, áreas de trabajo blancas, texto oscuro y separadores visibles                                                                                        |
| Tema oscuro        | Fondo carbón, superficie elevada diferenciada y texto secundario legible; evitar que todo se funda en negro                                                                |
| Acento             | Teal oscuro para acción principal en claro, variante clara en oscuro; validar contraste de cada combinación                                                                |
| Semántica          | Teal/verde para conexión y acciones confirmadas, neutro para finalización; ámbar requiere atención; rojo error/destrucción; azul información. Siempre con etiqueta o icono |
| Texto              | 14–16 px para contenido operativo; 12–13 px sólo metadatos; 16 px en campos móviles; títulos 22–28 px                                                                      |
| Espaciado          | Escala 4/8/12/16/24/32 px; relaciones por proximidad; menos separación entre información que se usa junta                                                                  |
| Controles          | Altura habitual 36–40 px en escritorio; objetivos táctiles de 44 px en acciones importantes                                                                                |
| Densidad           | Cómoda y compacta; cambiar padding y altura de fila, conservar tamaño legible de texto                                                                                     |
| Filas              | 44–56 px como punto de partida; cabecera estable, foco, selección y acciones claras                                                                                        |
| Bordes y elevación | Radios 8–12 px; separadores para grupos; sombras discretas para capas flotantes                                                                                            |
| Movimiento         | 120–180 ms en feedback local; respetar movimiento reducido; estados de llamada cambian inmediatamente                                                                      |

Estado técnico y resultado comercial se muestran por separado: “Finalizada” describe la llamada; “Sin interés” describe su resultado; “Reunión confirmada” requiere una reserva confirmada. Una llamada finalizada no se representa automáticamente como éxito.

Una pantalla con pocos elementos puede conservar espacio vacío. Añadir información sólo si ayuda a decidir o completar una tarea. Evitar llenar ese espacio con KPI redundantes, ilustraciones o tarjetas decorativas.

Distribución escritorio: navegación persistente a la izquierda, cabecera de contexto, área principal flexible y panel de detalle cuando hay un elemento seleccionado. En conversación, lista de 300–360 px y detalle de 280–340 px como referencias iniciales, ajustables al ancho disponible. En portátil, retirar primero el panel auxiliar; en móvil, lista → detalle con retorno que conserva posición y filtros.

**Accesibilidad:** objetivo WCAG 2.2 AA. Contraste 4.5:1 para texto normal y 3:1 donde corresponde a componentes/gráficos; foco visible y no oculto por overlays; navegación por teclado; etiquetas accesibles; zoom 200%; estados que no dependan sólo del color. WCAG AA establece un mínimo de objetivo de 24 × 24 CSS px con excepciones; 44 px es la recomendación de comodidad táctil de este plan, no una afirmación del mínimo AA. Referencias: [contraste de componentes](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast), [tamaño mínimo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [foco no oculto](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).

## 6. Diseño por flujo

### A. Hoy: empezar con trabajo accionable

Primera pantalla: fecha y zona horaria, ámbito Mi trabajo / Equipo cuando esté autorizado, y una lista priorizada. Hipótesis inicial de orden: compromisos inminentes, devoluciones vencidas, interacciones pendientes y campañas disponibles. Desempatar por fecha del compromiso y luego por antigüedad, conservando un orden estable. Definir y validar qué intervalo constituye “inminente”; no inferir urgencia de texto libre. Mantener los entrantes en vivo en su superficie propia. Mostrar el motivo de prioridad: “Venció hace 20 min”, “Sin responsable” o “Reunión en 30 min”. Trabajo sin responsable sólo se incluye cuando esté autorizado y se puede filtrar explícitamente.

Cada fila incluye persona, motivo, hora, responsable y siguiente acción. Seleccionar abre el contexto sin perder la lista. Si no hay pendientes, confirmar que está al día y ofrecer una acción relevante. No presentar una pantalla de onboarding eterna a un usuario activo.

Empezar reutilizando fuentes existentes. Un agregado consistente con paginación, permisos y deduplicación puede necesitar un endpoint de servicio; no reunir cientos de registros en el navegador ni crear otra entidad Task para duplicar callbacks o reuniones.

### B. Llamar: preparar → conversar → cerrar

Antes: buscar nombre, empresa o número; mostrar destinatario, país, número de origen y workspace. Verificar micrófono, conexión, elegibilidad y crédito mediante los mecanismos existentes. Mostrar sólo bloqueos o datos relevantes, con una explicación y acción de recuperación. Ofrecer teclado numérico bajo demanda en escritorio y DTMF durante la llamada.

Durante: identidad, estado escrito, duración, línea de origen y controles estables. Silenciar, teclado, grabación y otras funciones sólo si están disponibles. Colgar separado y reconocible. Contexto del contacto, notas y guion sin navegar entre pantallas. Mantener una barra persistente de llamada al consultar otras vistas, sin remontar el motor ni perder audio.

Después: resultado, nota y siguiente acción en el mismo contexto. Hacer explícito Guardar, Guardar y continuar y Finalizar sesión donde corresponda. Si se elige devolución, pedir fecha y zona horaria; si se agenda reunión, distinguir una etiqueta de resultado de una reserva realmente confirmada.

En campañas, elegir un resultado durante la llamada no debe colgar. El avance depende del guardado confirmado. Una devolución incompleta mantiene la sesión esperando; “Finalizar después de esta llamada” usa el contrato transaccional existente. No redial automático para resolver un estado incierto.

Estados de recuperación a diseñar: permiso de micrófono denegado, dispositivo ausente, conexión caída, crédito insuficiente (402), llamada personal en otro dispositivo (409), destinatario restringido, llamada finalizada con coste aún pendiente, grabación procesando y guardado fallido. Preservar notas y ofrecer reintento seguro. No etiquetar una llamada como terminada porque la conexión local dejó de responder.

### C. Conversaciones: una relación entendible

Mantener lista, timeline y contexto. Cambiar las nueve opciones equivalentes por vistas principales: Pendientes, Mías, Sin asignar y Cerradas; lectura, canal y línea se manejan como filtros. Los filtros combinables requieren validar y ampliar el contrato actual, que selecciona un `filterId`.

En la lista: persona, línea, última interacción útil, tiempo, responsable y estado. Diferenciar “Llamada completada” de “Llamada perdida · sin devolución registrada”. No inferir que una tarea está resuelta sólo por estar leída.

En el timeline: llamadas, SMS, notas y compromisos con tipo explícito. El detalle de llamada abre grabación, transcripción, resultado y coste en un panel reutilizado; mostrar procesamiento o ausencia de acceso. Mantener línea de envío y destinatario visibles. Distinguir nota interna y mensaje externo para evitar envíos equivocados.

Conservar filtro, búsqueda, selección y scroll al volver; permitir enlaces directos a hilo/llamada. Cualquier agrupación de varios números debe seguir identidad y autorización del servidor, nunca sólo igualdad de nombre.

### D. Contactos: decidir y actuar

Priorizar nombre/empresa, teléfono, última interacción, próximo seguimiento, responsable y estado relevante. Mostrar Llamar sin abrir tres puntos; mantener edición y otras acciones en el menú. El nombre abre un detalle reconocible por teclado.

Ficha: cabecera con identidad y acciones, resumen de contexto, historial cronológico y próximos compromisos. CRM conectado con fuente y estado de sincronización. Conservar acceso al registro externo y distinguir datos de Ringee de datos sincronizados.

Filtros guardados y columnas configurables tras estabilizar la experiencia base. Importación con mapeo, vista previa, validaciones, duplicados y resumen final. Para acciones masivas, indicar si se seleccionó la página o todos los resultados. No mostrar un total mayor al autorizado por el backend.

### E. Campañas: controlar el avance

Listado: estado, progreso, leads disponibles, responsable/equipo y motivo de bloqueo; fechas secundarias. Vista tabular cuando facilite comparar volumen; tarjetas sólo cuando aporten una comparación clara.

Preparación guiada: objetivo → audiencia → números → horarios y restricciones → agentes/guion → revisión. Reutilizar formularios existentes. Validar progresivamente y mostrar faltantes antes de iniciar.

Sesión: contacto, guion y resultado como centro; progreso de sesión y controles de pausa estables. Explicar “No hay leads elegibles ahora” con causa real, como ventana horaria o intentos agotados, si el servidor la ofrece. Mantener DNC, reservas de lead y reglas de intentos.

### F. Agentes de voz: configurar por intención y comprobar

El tipo de agente ya expresa un objetivo. Convertirlo en la guía de configuración: qué hace, para quién, información del negocio, conocimiento, voz, límites y a quién deriva. Modelo/proveedor y BYOK en Avanzado; mostrar antes coste y consecuencias cuando la elección los cambie.

Agrupar las ocho pestañas actuales en Configurar, Probar y Actividad; dentro de Configurar mantener secciones claras. Añadir resumen “Este agente atiende X, usa Y información y deriva a Z”. Mantener acceso a pruebas y estimación de coste existentes.

Pruebas con escenarios definidos por el tipo: consulta normal, falta de información, petición fuera del alcance y derivación. Resultados enlazados a evidencia: llamada, reserva o acción confirmada. Una interpretación de IA debe distinguirse de un hecho ejecutado. No inventar puntuaciones de confianza ni decir “Transferido” antes de confirmación.

Un flujo Borrador → Probar → Activar con versiones publicadas es una capacidad adicional: presupuestar backend, sincronización y migración. Mientras no exista, explicar con precisión qué guarda el botón y cuándo los cambios afectan al agente activo; no simular versiones sólo con etiquetas.

### G. Números, ajustes y facturación

Dar un hogar visible a números y enrutamiento: nombre de línea, número, capacidades, destino y estado de verificación. Diferenciar número comprado, identificador de llamada verificado y carrier externo. Explicar capacidades con datos del proveedor normalizados por Ringee.

Separar ajustes personales de ajustes del workspace, aunque compartan el diálogo. Mantener búsqueda y deep links actuales. Integraciones muestran conectado, última sincronización, error y reparación; ocultar detalles de proveedor que no ayuden a actuar.

Saldo con formato monetario consistente y ámbito visible. Distinguir crédito, suscripción y coste por uso. Las estimaciones no son cargos finales; evitar prometer una cantidad fija de minutos cuando depende del destino, grabación e IA. Con saldo que limita llamadas, explicar la consecuencia concreta desde la política del servidor. Recarga automática mantiene consentimiento explícito.

### H. Onboarding y ayuda contextual

Ruta corta por intención: llamar personalmente, preparar un equipo o configurar un agente. Unir los pasos a logros verificables: audio disponible, identidad de llamada válida, crédito/eligibilidad, primera interacción completada y resultado guardado. Saltar sólo los pasos opcionales.

Ayuda junto a la decisión: “Número que verá el destinatario”, “Resultado que se guardará al terminar”, “Hora en la zona del contacto”. Usar ejemplos cortos, etiquetas y estados persistentes. Tooltips para ampliaciones; instrucciones críticas visibles. La opción Ayuda recupera guías ya cerradas.

Corregir primero las promesas sobre prueba gratis: la concesión manual existe y BILL-018 contiene un aspecto de cobro pendiente de confirmación. El diseño no debe decidir esa política ni prometer crédito no concedido.

## 7. Patrones transversales

- Una acción principal por contexto; secundarias visibles según frecuencia. Etiquetas con verbo y objeto: Guardar resultado, Probar agente, Abrir conversación.
- Buscar contactos/destinos y mostrar comandos de forma descubrible. Ampliar KBar antes de crear otro sistema. Una búsqueda global de datos necesita contrato y permisos propios.
- Mantener borradores, filtros y posición al ir a detalles. Limpiar o reubicar estado al cambiar de workspace; nunca mezclar datos entre espacios.
- Confirmaciones para destrucción o consecuencias importantes, con alcance exacto. Evitar diálogos rutinarios que añaden clics sin reducir errores. Deshacer sólo cuando el backend permita revertir.
- Estados distintos para vacío inicial, sin resultados por filtro, cargando, acceso denegado y error. Cada uno explica la situación y ofrece una salida útil.
- Errores cerca del control afectado; toast como complemento. Guardado con estado pendiente, confirmado y fallido; no declarar éxito prematuramente.
- Manejo de entrantes sin destruir borradores ni tapar controles activos. La identidad/propiedad del entrante sigue la oferta del servidor.
- Atajos como aceleradores, nunca como única vía. No activarlos mientras se escribe; no introducir atajos de resultado que terminen la llamada.
- Móvil para consultas, conversaciones, seguimientos y llamadas soportadas. Las vistas densas se adaptan a secuencias; verificar compatibilidad de audio y permisos por navegador.

El principio es facilitar el reconocimiento de opciones y contexto, reduciendo lo que el usuario debe recordar. [Nielsen Norman Group: reconocimiento y recuerdo](https://www.nngroup.com/articles/recognition-and-recall/).

## 8. Orden de ejecución

Estimación orientativa para diseño y mejoras sobre capacidades existentes: 7–9 semanas con una persona de diseño/producto, dos de frontend y apoyo de backend/QA. Depende de contratos, disponibilidad y hallazgos. Las capacidades nuevas de agregación, búsqueda, filtros combinables o publicación de agentes se estiman aparte después de revisar el backend; no están comprometidas dentro de ese plazo. Cada fase puede entregarse incrementalmente.

| Fase                       | Tiempo orientativo | Entrega revisable                                                                                    | Criterio de salida                                                                   |
| -------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 0. Baseline y prototipo    | 1 semana           | Mapa actual, inventario de estados, benchmark de tareas y prototipos de Hoy / conversación / llamada | Usuarios representativos completan los recorridos; prioridades y diseño ajustados    |
| 1. Claridad compartida     | 1 semana           | Jerarquía, tokens, botones, tablas, lenguaje, enlaces, navegación y P0                               | Acciones frecuentes descubribles; totales correctos; teclado y contraste verificados |
| 2. Flujo de llamada        | 2 semanas          | Preparación, contexto, llamada persistente, resultado y recuperación                                 | Completar el flujo y sus fallos sin perder notas, audio o generar un segundo intento |
| 3. Trabajo diario          | 1–2 semanas        | Hoy, bandeja mejorada, ficha de contacto y enlaces de seguimiento                                    | Un pendiente puede atenderse sin reconstruir contexto ni perder el lugar             |
| 4. Operación y activación  | 1–2 semanas        | Campañas, organización del editor IA, números, onboarding y ajustes                                  | Usuario distingue disponible/bloqueado/pendiente y resuelve la causa                 |
| 5. Validación y despliegue | 1 semana           | QA por rol/dispositivo/idioma, piloto, métricas y correcciones                                       | Sin regresiones críticas; mejora de tareas respecto al baseline; rollback listo      |

**Primer lanzamiento acotado, antes del cambio estructural:** los siguientes cambios tienen criterios verificables y se entregan sobre los flujos actuales. Hoy, agregación de tareas, reorganización completa del menú y publicación de agentes pertenecen a entregas posteriores.

| Cambio                      | Criterio de aceptación                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Estado inicial del marcador | Sin destino introducido, invita a buscar/escribir; no afirma que faltan contactos                              |
| Acciones de contactos       | Abrir ficha y preparar llamada son visibles y accesibles por teclado, conservando el flujo canónico de llamada |
| Paginación y selección      | Muestra rango y total autorizado del servidor; aclara página frente a conjunto completo                        |
| Lenguaje coherente          | Los controles del sistema respetan idioma; títulos personalizados se conservan                                 |
| Acceso a ajustes y números  | Una entrada persistente abre las superficies existentes, según permisos                                        |
| Enlaces de campañas         | Título accesible con enlace nativo; menús de acciones conservan su comportamiento                              |
| Jerarquía de acción y saldo | La acción principal destaca; alertas de crédito siguen siendo visibles cuando afectan al trabajo               |

## 9. Dependencias y responsables técnicos

| Trabajo                              | Propietario existente que se debe extender                                                      | Tipo                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Navegación y comandos                | `packages/frontend-shared/src/constants/data.ts`, KBar y `apps/frontend/src/components/layout/` | UI; revisar consumidores compartidos                         |
| Tokens, botones, tablas, formularios | `packages/frontend-shared/src/components/ui/`, `components/forms/`, tema de frontend            | UI compartida                                                |
| Llamada activa y resultado           | `packages/dialer-ui`, `packages/dialer-core`, `features/calls`                                  | UI + regresión de telefonía y extensión                      |
| Sesión de campaña                    | `features/dialer`, `useDialerCallEngine`, `useDisposeLead`                                      | UI con contratos existentes                                  |
| Conversaciones y contacto            | `features/inbox`, `features/contact`, `features/call-detail`                                    | UI; filtros nuevos pueden exigir API                         |
| Hoy                                  | Proyección de callbacks, pending-actions, reuniones y asignaciones existentes                   | Agregación de servicio si el contrato actual es insuficiente |
| Configuración                        | `features/settings`, `SETTINGS_NAV_ITEMS`, enlaces `#settings/...`                              | UI preservando rutas/fragmentos                              |
| Agentes                              | `AgentScreen`, `useAgentDraft`, `features/ai-voice-agents`                                      | UI; versionado/publicación es backend adicional              |
| Coste y límites                      | Respuestas de servicios, `CreditService`, política canónica de crédito                          | Backend como fuente; frontend presenta                       |

No introducir otro cliente API, otro motor de llamadas ni sockets duplicados. Contratos nuevos siguen frontend → controlador → servicios → repositorio. Mantener Next.js/React, Radix, Tailwind, React Hook Form/Zod, `next-intl` y tablas existentes.

Antes de tocar componentes compartidos, revisar web, extensión, SDK y demás consumidores. Las mejoras deben ser compatibles; mantener rutas antiguas durante la migración. El cambio de presentación no modifica permisos ni estados públicos.

Reglas especialmente relevantes: WRK-001/003/005, CALL-001/010, CMP-003/004/005/011/012/016, BILL-007/012/018/019, MSG-002, AGENT-006/010/011/016, y la regla de `apps/frontend/AGENTS.md` que separa elegir resultado de colgar. No hacer vinculante la parte de BILL-018 marcada Needs confirmation.

## 10. Validación y medición

Reclutar inicialmente 6–8 participantes repartidos entre profesionales individuales, miembros, administradores y responsables que configuran y prueban agentes de voz; ampliar las rondas donde falte representación o aparezcan problemas distintos. Es una muestra cualitativa para detectar fricción, no para demostrar estadísticamente una mejora.

Tareas: encontrar a quién devolver la llamada; preparar audio y origen; consultar notas durante una llamada; registrar resultado y programar callback; retomar el trabajo después de consultar un contacto; explicar por qué una campaña no avanza; localizar enrutamiento; probar y entender el estado de un agente. Añadir recuperación de error y flujo en móvil/teclado.

| Indicador                                  | Medición                                                                      | Objetivo inicial a validar                            |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| Éxito sin ayuda                            | Tareas terminadas / tareas intentadas                                         | ≥90% en flujos prioritarios, tras iteraciones         |
| Tiempo para encontrar el siguiente trabajo | Desde inicio hasta seleccionar correctamente el pendiente                     | Reducción ≥30% frente al baseline                     |
| Tiempo de preparar llamada                 | Destino conocido hasta estado listo                                           | Reducción ≥25%, excluyendo esperas de proveedor       |
| Cierre de llamada                          | Tiempo para guardar resultado y siguiente paso                                | Reducción ≥25%, sin pérdida de detalle requerido      |
| Comprensión                                | Usuario identifica destino, origen, estado y siguiente paso                   | Sin errores críticos en pruebas moderadas             |
| Recuperación                               | Fallos recuperados conservando contexto/borrador                              | Sin pérdida en los casos de prueba                    |
| Fiabilidad                                 | Intentos duplicados, cargos duplicados, llamadas interrumpidas por navegación | Cero en los casos de regresión; seguimiento en piloto |

Instrumentar el sistema de analítica existente con eventos de apertura de tarea, preparación, bloqueo, resultado guardado y recuperación. No capturar teléfonos, textos de notas, grabaciones ni transcripciones como propiedades de analítica. Diferenciar tiempo de usuario de latencia del sistema. No optimizar volumen de llamadas a costa de su calidad.

En implementación: lint de archivos modificados, formato, build de frontend y pruebas de los paquetes realmente afectados. Para `dialer-ui/core` y contratos compartidos, comprobar extensión/SDK y flujo de llamada. Verificar personal, org miembro, org administrador, entrada/salida, sin crédito, sin micrófono, desconexión, recarga y cambio de workspace. Usar entornos y destinatarios de prueba para telefonía.

## 11. Referencias contrastadas y criterio de adaptación

| Fuente                                                                                                      | Patrón útil para Ringee                                            | Adaptación                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [Aircall: conversaciones, mensajes y llamadas](https://support.aircall.io/en-gb/articles/21534390904093)    | Contexto continuo y acciones ligadas a la conversación             | Aprovechar Inbox existente y mostrar identidad de línea/hilo      |
| [Aircall: detalle de llamada](https://support.aircall.io/en-gb/articles/21534416528285)                     | Acceso conjunto a notas, grabación e información de la interacción | Reutilizar `call-detail` y sus permisos                           |
| [Quo: funcionamiento de bandejas](https://learn.quo.com/working-in-quo/inbox-fundamentals/how-inboxes-work) | Espacio compartido y visibilidad del equipo comprensibles          | Explicitar workspace y alcance sin cambiar aislamiento            |
| [Close: Power Dialer](https://help.close.com/feature-guide/power-predictive-dialing/using-the-power-dialer) | Trabajar una lista, tomar notas y pausar/retomar una sesión        | Extender sesión de campaña; preservar guardado y avance canónicos |
| [NN/g: visibilidad del estado](https://www.nngroup.com/articles/visibility-system-status/)                  | Feedback que permite entender lo que está ocurriendo               | Estados claros de llamada, procesamiento y guardado               |
| [NN/g: estados vacíos](https://www.nngroup.com/articles/empty-state-interface-design/)                      | Diferenciar ausencia de datos de un resultado filtrado vacío       | Mensajes y acciones específicos en listas                         |

Son referencias de patrones, no evidencia de que copiar esas interfaces resolverá los problemas de Ringee. La propuesta se debe decidir por tareas observadas, restricciones del producto y validación con usuarios.
