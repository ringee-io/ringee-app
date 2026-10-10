# Ringee: la siguiente llamada, siempre lista

Fecha: 30 de septiembre de 2026. Estado: propuesta, no implementada. Síntesis de [`UI_UX_PLAN.md`](UI_UX_PLAN.md), [`UI_UX_PLAN_ALT.md`](UI_UX_PLAN_ALT.md) y [`UI_UX_PLAN_CALLING_FIRST.md`](UI_UX_PLAN_CALLING_FIRST.md), contrastada con el código el mismo día. Decisión ya tomada: la configuración sigue en el modal `SettingsDialog`.

## 0. En una página

**Promesa al cliente:** la siguiente llamada siempre está lista, y nada de lo que muestra Ringee es falso.

- **Columna vertebral:** el ciclo de `UI_UX_PLAN_CALLING_FIRST.md`: entrar, empezar, conversar, registrar y continuar, con tres formas de llamar (puntual, revisar y continuo) y el resultado preparado durante la conversación.
- **Lo que añade esta síntesis:**
  1. **El ciclo para todos.** Las campañas, y con ellas el modo continuo, exigen organización. Los usuarios del espacio personal necesitan su propio camino rápido desde el principio: una cola en Mi día y "Guardar y llamar al siguiente" sobre el flujo manual.
  2. **Primero, arreglar lo que está roto o dice algo falso.** Hay tres botones "Llamar" de la Bandeja que no hacen nada, Campañas falla en silencio en el espacio personal y el saldo promete un minuto gratis que el backend cobra.
  3. **Pantallas concretas y un presupuesto de clics** con el estado actual al lado.
  4. **Medición con lo que ya existe.** Las campañas ya guardan todo el ciclo con marcas de tiempo. Faltan tres piezas pequeñas: la hora del resultado en llamadas manuales, el registro de pausas y eventos de interfaz sin datos personales.

**Métrica norte:** conversaciones útiles por usuario activo y semana. Una conversación es útil cuando su resultado indica que hubo contacto con una persona. Se acompaña de intentos por hora de sesión y del hueco entre el fin de una llamada y el siguiente intento (mediana y p90).

## 1. Qué toma de cada plan

| Tema                  | `UI_UX_PLAN.md`                                                                 | `UI_UX_PLAN_ALT.md`                       | `UI_UX_PLAN_CALLING_FIRST.md`                                     | Esta síntesis                                                                 |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Inicio                | Página Hoy nueva + Informes                                                     | Hoy = pantalla de Llamar                  | **Llamar**, con Mi día como vista                                 | Llamar, con Mi día y Campañas como fuentes                                    |
| Cierre de llamada     | Guardar / Guardar y continuar                                                   | Teclas 1–9 + ⏎ después de colgar          | **Resultado durante la llamada; 0 acciones después**              | El de CALLING_FIRST, también en la llamada manual                             |
| Espacio personal      | Perfil individual con inicio Hoy; sin cola continua                             | Cola de Hoy con "Llamar al siguiente"     | Cola manual como ampliación posterior                             | **Cola manual desde la entrega 2**: es el único camino rápido del plan gratis |
| Acciones en listas    | Llamar visible                                                                  | En hover                                  | **Llamar siempre visible**; secundarias en hover y foco           | CALLING_FIRST                                                                 |
| Siguiente paso        | Pedir fecha si es devolución                                                    | Sugerido y preseleccionado                | **Sugerido; solo se guarda si se elige**                          | CALLING_FIRST, con atajos de un toque ("En 1 h", "Mañana 10:00")              |
| Espera entre llamadas | —                                                                               | Cuenta atrás visible                      | **Sin espera obligatoria; pausa opcional solo desde el servidor** | CALLING_FIRST; `wrapUpTimeSec` se oculta hasta que el servidor lo aplique     |
| Número de origen      | Mención                                                                         | "Salud 0–100" en el marcador              | **Rendimiento reciente con muestra**                              | CALLING_FIRST, más el estado "en descanso" que ya calcula la rotación         |
| Hora del destinatario | Zona horaria al agendar una devolución                                          | En cada fila; aviso universal de 8 a 21 h | **Solo si se conoce; nunca un horario universal**                 | CALLING_FIRST; en campañas manda la ventana horaria del servidor (CMP-004)    |
| Navegación            | Navegación en la fase 1; reorganización completa después del primer lanzamiento | Reorganización en la entrega 2            | **Primero el ciclo; agrupar después**                             | CALLING_FIRST                                                                 |
| Dinero                | Revisar la promesa de prueba gratis                                             | Decidir BILL-018 en la entrega 1          | Saldo sin protagonismo decorativo                                 | **Decidir BILL-018 en la entrega 1**: es una promesa sobre dinero             |
| Medición              | Tareas moderadas con usuarios                                                   | Datos de la base de datos                 | **Eventos del ciclo, separando pausas**                           | Marcas de tiempo existentes + tres añadidos concretos                         |
| Evidencia externa     | Aircall, Quo, Close, NN/g, W3C                                                  | 13 competidores y normativa               | Close, NN/g, W3C                                                  | La investigación del ALT como contexto, no como requisito                     |

Lo descartado, y por qué:

- La cuenta atrás de cierre del ALT: añade espera y, si solo es visual, no frena al marcador.
- El callback preseleccionado del ALT: crea compromisos que nadie eligió e infla la cola.
- El aviso universal de 8 a 21 h del ALT: la ley de EE. UU. no aplica igual en otros países, y en campañas ya decide el servidor.
- Reorganizar la navegación en la entrega 2, como proponía el ALT: aporta menos valor que el ciclo de llamada y multiplica los cambios simultáneos.

## 2. Lo que dice el código hoy

Verificado el 30 de septiembre de 2026.

| Hallazgo                                                | Evidencia                                                                                                                                                                                                                       | Consecuencia para el cliente                                                                    | Entrega |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| Los botones "Llamar" de la Bandeja no hacen nada        | `thread-timeline.tsx`, `event-bubble.tsx` y `contact-context-pane.tsx` emiten `ringee:dial`; ningún código escucha ese evento                                                                                                   | No puede devolver una llamada perdida desde donde la ve                                         | 1       |
| Campañas falla en silencio en el espacio personal       | La barra la muestra sin `organizationOnly`; `GET /campaigns` responde 403 ("Campaigns require an organization") y la lista se queda vacía                                                                                       | Un usuario gratis ve una pantalla vacía en lugar de una explicación o la oferta de organización | 1       |
| El espacio personal no tiene modo continuo              | Campañas y sesiones exigen organización                                                                                                                                                                                         | Para el plan gratis, la cola manual es el único ciclo rápido                                    | 2       |
| En Contactos, llamar cuesta dos clics                   | Llamar y Ver dentro del menú ⋯ (`cell-action.tsx`); el nombre no es enlace (`columns.tsx`)                                                                                                                                      | Más fricción en la acción más frecuente                                                         | 1       |
| El marcador afirma que no hay contactos antes de buscar | `contact.selector.tsx:172` muestra "No contacts found" también en reposo                                                                                                                                                        | Parece que la agenda está vacía o falló                                                         | 1       |
| La paginación cuenta mal                                | "N row(s) total" cuenta las filas cargadas, en inglés fijo (`data-table-pagination.tsx`, compartido)                                                                                                                            | Totales y selecciones poco fiables                                                              | 1       |
| El saldo promete un minuto gratis                       | Con `freeCallTrial`, "Llama gratis · 1 minuto por nuestra cuenta" (`credit.popover.tsx`); la nota de BILL-018 (Needs confirmation) dice que el coste se cobra igual                                                             | Un cobro que contradice lo prometido                                                            | 1       |
| El cierre manual llega después de colgar                | `PostCallView` de `@ringee/dialer-ui`: nueve resultados fijos, sin atajos, textos en inglés; lo usa también la extensión                                                                                                        | Trabajo administrativo después de cada llamada manual                                           | 2       |
| La sesión de campaña ya hace lo esencial                | Resultado durante la llamada, 1–9 y Enter con guarda de campos (`disposition-panel.tsx`); `closeAfterLead` viaja como `closeSession` y el servidor lo aplica al guardar (CMP-011); pausa con `PATCH /dialer/sessions/:id/pause` | Base sólida: pulir, no rehacer                                                                  | 3       |
| El "rendimiento" del número no es reputación            | `healthScore` = 70 % contestación + 30 % llamadas no cortas en 7 días; por debajo de 50 el número descansa 3 días; sin llamadas se queda en 100                                                                                 | Mostrarlo como "salud" o antispam engañaría                                                     | 2       |
| La hora local solo existe a veces                       | `contact.timezone` llega por enriquecimiento; si falta, la ficha no muestra hora                                                                                                                                                | No se puede prometer "hora allí" en todas las filas                                             | 2       |
| La ventana horaria ya la aplica el servidor en campañas | CMP-004                                                                                                                                                                                                                         | La interfaz debe mostrar el motivo, no inventar reglas                                          | 3       |
| `wrapUpTimeSec` no tiene efecto                         | Se guarda y se edita en ajustes de campaña; no encontré código que lo aplique                                                                                                                                                   | Un ajuste que no hace nada                                                                      | 1       |
| Añadir contactos a una campaña no está en Contactos     | No hay acción en la tabla; `POST /campaigns/:id/leads/manual` (`addLeadsManually`) reutiliza contactos existentes por teléfono                                                                                                  | Es sobre todo trabajo de interfaz                                                               | 3       |
| El ciclo de campaña ya es medible                       | `CallAttempt` guarda `initiatedAt`, `ringStartedAt`, `answeredAt`, `endedAt` y `dispositionedAt`                                                                                                                                | Línea base sin herramientas nuevas                                                              | 1       |
| El ciclo manual y las pausas no lo son                  | `Call` no guarda cuándo se registró el resultado; `AgentSession` solo tiene `startedAt` y `endedAt`; `fireNewCallEvent` (GA) existe sin uso                                                                                     | Falta separar trabajo administrativo y pausas voluntarias                                       | 1–2     |
| Las categorías de resultado ya existen                  | `DispositionCategory`: `positive`, `neutral`, `negative`, `no_contact`                                                                                                                                                          | "Conversación útil" se define sin inventar nada                                                 | 1       |

## 3. Principios

| #   | Principio                   | Se cumple cuando…                                                                                                   |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | La siguiente llamada, lista | Desde una cola preparada se empieza con una activación                                                              |
| 2   | Llamar siempre visible      | En cualquier lista con personas, "Llamar" se ve sin hover ni menú                                                   |
| 3   | Registrar mientras se habla | El resultado se elige durante la llamada; si está completo, cero acciones después de colgar; si no, dos             |
| 4   | Nada empieza solo           | Abrir la app, recargar o recuperar la conexión nunca marca; reanudar exige "Continuar"                              |
| 5   | Ningún compromiso implícito | Un callback o una reunión solo existen si el usuario los elige o una automatización configurada los crea            |
| 6   | Nada falso en pantalla      | Dinero, rendimiento del número, hora local y estados ("Guardado", "Conectada") reflejan lo que el servidor confirmó |
| 7   | Orden estable               | La cola no se reordena bajo el cursor; lo nuevo se anuncia ("3 nuevos pendientes")                                  |
| 8   | Actuar en sitio             | Llamar, ver contacto, ver llamada y configurar no cambian de página; la configuración sigue en su modal             |
| 9   | Teclado como acelerador     | Los atajos se ven junto a los botones y nunca actúan en notas, campos, diálogos ni teclado DTMF                     |
| 10  | Alcance visible             | El workspace activo, personal u organización, se ve siempre                                                         |

Reglas que no se tocan: CALL-001 (una llamada a la vez en el espacio personal), CMP-004 (ventana horaria), CMP-005 (DNC por ámbito), CMP-011 (el avance se decide dentro del guardado), CMP-012 (un lead por agente) y CMP-013 (un marcado fallido no se repite). Toda llamada manual pasa por `useDial`; solo el botón de colgar o el otro lado terminan una llamada; el crédito solo se mueve con `CreditService`.

## 4. Estructura

- **Inicio: Llamar.** El verbo dice para qué sirve la pantalla. Tiene dos fuentes en la primera versión: **Mi día** (todos) y **Campañas** (organización). Las listas guardadas llegan después.
- **Quien no llama** (recepción o agentes de IA) elige su inicio y se recuerda por workspace.
- **Navegación:** en las primeras entregas solo cambian tres cosas: Llamar pasa a ser el inicio, Configuración gana una entrada que abre el modal (también desde ⌘K) y Campañas explica en el espacio personal qué es y cómo activarlo. Agrupar Agenda e Historial va en la última entrega.

## 5. Pantallas

### 5.1 Llamar: sesión de campaña (organización)

```text
┌ Llamar · Mi día | Campañas ───────────────── Línea lista · Saldo 42,10 $ ┐
│ Recruiting Q4 · Continuo             18 disponibles · 3 fuera de horario │
├──────────────┬────────────────────────────────┬──────────────────────────┤
│ COLA         │ Ana Ruiz · Grupo Sol           │ RESULTADO                │
│ > Ana Ruiz   │ Motivo: lead del webinar       │ (•) 1 Interesado         │
│   Luis Pardo │ Última: "Pidió precios" · SMS  │ ( ) 2 Volver a llamar    │
│   Marta Gil  │ Desde +34 910 000 000 · auto   │ ( ) 3 No interesado      │
│   ...        │ Hora allí: 09:42               │ ( ) 4 Buzón   ...        │
│              │ Guion >   Historial >          │ Se guardará al terminar  │
│              │ Notas _______________________  │ Próximo paso: ninguno    │
├──────────────┴────────────────────────────────┴──────────────────────────┤
│ En llamada 02:14  [Colgar]     Sesión: 12 intentos · 4 conversaciones    │
│ [ ] Terminar al cerrar esta llamada                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

- Proporción orientativa: cola 25 %, contacto 45 % y resultado 30 %. En portátiles se estrecha primero la cola.
- Los resultados son los de la campaña (configurables), en orden estable, con `1–9`.
- "Terminar al cerrar esta llamada" es el `closeAfterLead` actual, más visible. Pausar solo aparece con la sesión lista, entre llamadas.
- Al recargar, primero se sincroniza el estado del servidor: si hay llamada, se muestra; si la lista terminó, un resumen y "Elegir otra lista".
- En el espacio personal, la pestaña Campañas explica qué es una campaña y ofrece activar la organización con el flujo de pago que ya existe. No muestra una lista vacía.

### 5.2 Llamar: Mi día (todos)

```text
┌ Llamar · Mi día ──────────────────────────────────────── Línea lista ┐
│ [ Llamar al siguiente: Luis Pardo · callback de las 10:30 ]  N       │
├──────────────────────────────────────────────────────────────────────┤
│ AHORA                                                                │
│ Luis Pardo    Callback de las 10:30 · "Enviar precios"     [Llamar]  │
│ Ana Ruiz      Llamada perdida hace 12 min                [Devolver]  │
│ MÁS TARDE                                                            │
│ Marta Gil     Callback a las 18:30                         [Llamar]  │
│ SIN HORA                                                             │
│ Rafael Soto   Seguimiento después de la demo               [Llamar]  │
│                                        3 nuevos pendientes · Ver     │
└──────────────────────────────────────────────────────────────────────┘
```

**Orden**, estable y con el motivo visible:

1. Compromisos que llegan a su hora o ya vencieron: callbacks y Pending Actions con fecha.
2. Llamadas perdidas y solicitudes de contacto sin devolver, la más reciente primero. No desaparecen al pasar 24 horas.
3. Seguimientos sin hora.
4. Campañas asignadas con leads disponibles (organización).

Una misma persona con varias razones aparece una vez, con todas sus razones. Un callback de mañana no se adelanta para llenar la cola. Al cerrar una llamada iniciada desde Mi día aparece **"Guardar y llamar al siguiente"**. Es una acción explícita sobre el flujo manual (`useDial`): no hay motor continuo personal hasta la entrega 4. La primera versión compone fuentes existentes; si hace falta deduplicar entre fuentes o paginar, se añade un endpoint agregado en `@ringee/services`, nunca una entidad Task nueva.

### 5.3 Registrar sin trabajo extra

```text
Durante la llamada                    Si al colgar faltaba el resultado
┌───────────────────────────────┐     ┌───────────────────────────────┐
│ RESULTADO                     │     │ RESULTADO PENDIENTE           │
│ (•) 3 Interesado              │     │ ( ) 1 Reunión   ( ) 2 Venta   │
│ Se guardará al terminar       │     │ ( ) 3 Interesado  ...         │
│ Próximo paso                  │     │                               │
│ [En 1 h] [Mañana 10:00]       │     │ [ Guardar y continuar Enter ] │
│ [Elegir fecha]   [Ninguno]    │     │                               │
│ Mañana 10:00 (Madrid) ✓       │     │ Si falla: se conserva todo,   │
└───────────────────────────────┘     │ [Reintentar] y no se avanza   │
                                      └───────────────────────────────┘
```

Los cuatro casos de CALLING_FIRST, aplicados también a la llamada manual:

1. **Resultado completo durante la llamada:** se guarda al recibir el fin real; cero acciones después.
2. **Resultado pendiente:** elegir y "Guardar y continuar", dos activaciones si no hay campos obligatorios.
3. **Sin conversación:** se conserva el estado técnico (no contestó, ocupado, fallo). Cualquier mapeo automático a un resultado es una regla del servidor, nunca una deducción del navegador.
4. **Error al guardar:** se conservan resultado y notas, no se avanza y se ofrece reintentar.

Antes de guardar se ve la fecha, la hora y la zona exactas del próximo paso. Nada queda preseleccionado si crea un compromiso. Llevar el resultado "durante la llamada" a la llamada manual toca `@ringee/dialer-ui`, que también usa la extensión de Chrome: se traducen sus textos en el mismo cambio.

### 5.4 Llamada puntual desde cualquier sitio

| Lugar     | Hoy                                      | Propuesta                                       |
| --------- | ---------------------------------------- | ----------------------------------------------- |
| Contactos | Menú ⋯ → Llamar (2 clics)                | Botón Llamar visible en la fila (1 clic)        |
| Bandeja   | El botón no hace nada                    | "Devolver" funciona, vía `useDial` (1 clic)     |
| Mi día    | "Call next" solo para callbacks vencidos | "Llamar al siguiente" con todas las fuentes (1) |
| Historial | Menú ⋯ → Llamar (2 clics)                | Botón visible en la fila (1 clic)               |
| Marcador  | "No contacts found" en reposo            | "Busca un contacto o escribe un número"         |

### 5.5 Contactos y listas

- Botón **Llamar** visible; nombre enlazado; ficha rápida en un panel lateral; la página completa queda para editar.
- Paginación "1–10 de 57" con el total del servidor y alcance de selección explícito.
- Con una selección: **Añadir a campaña** (organización) o **Llamar esta selección** (cola manual en Mi día, espacio personal). Antes de confirmar: "32 seleccionados · 27 disponibles · 5 excluidos", con motivos (DNC, sin teléfono, duplicados).
- Al volver de una ficha o de una llamada se conservan filtros, selección y posición.

### 5.6 Confianza sin fricción

- **Origen:** número y estrategia real ("Automático · presencia local" cuando rota). La preferencia se recuerda por workspace y se valida al usarla.
- **Rendimiento del número:** "Contesta 31 % · 7 días · 212 llamadas"; "Sin datos suficientes" con muestras pequeñas; "En descanso hasta el 3 oct" cuando la rotación lo enfría. Nunca "salud" ni "antispam".
- **Hora del destinatario:** solo si se conoce; si se estimara por prefijo, se marca como estimada.
- **Coste:** tarifa orientativa del backend antes de marcar; coste liquidado después o "Calculando".
- **Estados:** "Preparando", "Marcando", "Conectada" y "Guardando" siguen a los eventos reales. La respuesta visual local llega en menos de 100 ms; la conexión tarda lo que tarde.
- **Saldo:** neutro; aviso al cruzar el umbral (BILL-019); consecuencia concreta cuando ya no permite llamar (402).

### 5.7 El resto

- **Configuración:** el modal se queda, con entrada en la barra, ⇧⌘, y ⌘K (vía `#settings/<panel>`).
- **Bandeja:** además de "Devolver", pasar de nueve filtros a cuatro vistas (Pendientes, Mías, Sin asignar y Cerradas) cuando se amplíe la API de filtros.
- **Agentes de IA:** sus llamadas aparecen con autoría en historial y bandeja y no cuentan en el rendimiento de las personas. El editor en tres pestañas con simulaciones va en la última entrega.
- **Hábito:** progreso discreto de la sesión, resumen al terminar (qué se logró, qué queda y el próximo compromiso) y objetivo opcional de actividad. Sin confeti ni recompensas por reintentos vacíos.
- **Onboarding:** termina cuando el usuario hizo una llamada y sabe cómo seguir: contacto o número, línea lista, llamada, resultado y siguiente.

## 6. Presupuesto de activaciones

Cada clic o atajo cuenta como una activación. Escribir notas, resolver permisos y aceptar avisos obligatorios (DNC, número público) se miden aparte.

| Tarea                                                   | Hoy                                        | Objetivo                   | Entrega |
| ------------------------------------------------------- | ------------------------------------------ | -------------------------- | ------- |
| Llamar a un contacto visible en Contactos o Historial   | 2                                          | 1                          | 1       |
| Devolver una llamada perdida desde la Bandeja           | No funciona                                | 1                          | 1       |
| Empezar desde Mi día                                    | 1, solo callbacks                          | 1                          | 2       |
| Cerrar una llamada manual con resultado elegido durante | No existe                                  | 0                          | 2       |
| Cerrar con resultado pendiente simple                   | 2, solo con ratón y sin pasar al siguiente | 2, con teclado, y continúa | 2       |
| Callback con horario predefinido                        | Calendario                                 | 3                          | 2       |
| Cerrar en campaña con resultado elegido durante         | 0                                          | 0                          | —       |
| Terminar la sesión después de la llamada actual         | 1, poco visible                            | 1                          | 3       |
| Reanudar una sesión detenida                            | —                                          | 1                          | 3       |
| Añadir N contactos seleccionados a una campaña          | No existe en Contactos                     | 1                          | 3       |

## 7. Entregas

| Entrega                                                 | Tamaño | Alcance                                                                                                                                                                                                                                                                                                               | Criterio de salida                                                                                                 |
| ------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1 · Llamar funciona desde cualquier sitio y nada miente | S      | "Devolver" en la Bandeja vía `useDial`; Llamar visible en Contactos e Historial y nombre enlazado; marcador en reposo; paginación honesta y traducida; Campañas explicada en el espacio personal; decisión BILL-018 aplicada al saldo; `wrapUpTimeSec` oculto; Configuración en la barra y ⌘K; línea base de medición | Las tareas de llamada puntual se hacen con una activación; ninguna pantalla afirma algo falso                      |
| 2 · Mi día y registrar mientras se habla                | M      | Llamar como inicio; Mi día con orden estable y motivos; "Llamar al siguiente" y "Guardar y llamar al siguiente"; resultado durante la llamada manual con 1–9 y Enter; próximo paso con opciones rápidas; origen, rendimiento, hora y tarifa honestos; hora del resultado guardada en llamadas manuales                | Diez llamadas manuales seguidas desde Mi día sin cambiar de página; un fallo de guardado no pierde datos ni avanza |
| 3 · Sesión de campaña fluida                            | M      | Jerarquía de contexto en el workspace; "Terminar al cerrar" visible; recuperación tras recarga; resumen de lista agotada; bloqueos de preparación antes de entrar; añadir selección de Contactos a una campaña; registro de pausa y reanudación                                                                       | Diez contactos seguidos sin volver a listados; pausar, reanudar y recargar se comportan bien                       |
| 4 · Más fuentes y continuidad                           | L      | Mi día agregado con deduplicación; listas guardadas; continuidad personal ampliando el propietario de sesiones; finales técnicos mapeados por regla del servidor; pausa opcional controlada por el servidor                                                                                                           | Sin llamadas duplicadas al reintentar; parar, reanudar y cambiar de dispositivo funcionan                          |
| 5 · Asistencia y orden                                  | L      | Resumen y resultado sugeridos por IA en llamadas humanas (coste vía `CreditService`); Agenda e Historial agrupados; página de Números; editor de agentes en tres pestañas con simulaciones; onboarding por intención                                                                                                  | Ahorro medido sin empeorar precisión, conversión ni fiabilidad                                                     |

**Primera apuesta: entregas 1 y 2.** La 1 arregla lo que hoy impide llamar o engaña, y cuesta días. La 2 lleva el ciclo rápido al plan gratis, que no tiene campañas. La 3 mejora lo que ya funciona para organizaciones.

**Fuera de este plan:** marcación paralela o predictiva, WhatsApp, IVR, rediseño de marca, una entidad Task nueva, un segundo motor de llamadas y convertir la configuración en páginas.

## 8. Medición

| Métrica                                                  | Qué responde                               | Fuente                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Conversaciones útiles por usuario activo y semana        | ¿Hablan con más personas?                  | Resultados con contacto: categoría distinta de `no_contact` en campañas; en manuales, todo salvo no contesta, buzón y número erróneo |
| Intentos por hora de sesión                              | ¿Aumentó el ritmo?                         | `CallAttempt` en campañas; llamadas manuales agrupadas en sesiones por inactividad                                                   |
| Hueco entre el fin y el siguiente intento (mediana, p90) | ¿Dónde queda fricción?                     | `endedAt` y `dispositionedAt` → siguiente `initiatedAt`; se excluyen las pausas registradas                                          |
| Trabajo después de colgar                                | ¿Desapareció el trabajo administrativo?    | `dispositionedAt − endedAt` en campañas; hora del resultado en manuales (nueva)                                                      |
| Tiempo hasta la primera llamada                          | ¿Es más fácil empezar?                     | Eventos de interfaz sin datos personales (reutilizar el helper de GA existente)                                                      |
| Activaciones por ciclo                                   | ¿Se cumple el presupuesto de la sección 6? | Eventos de interfaz                                                                                                                  |
| Reuniones y ventas verificadas                           | ¿El volumen produce resultados?            | Reuniones confirmadas; ventas solo con registro o integración verificable                                                            |

Guardarraíles: cero intentos o cobros duplicados, seguimientos incumplidos, resultados por conversación, coste por resultado, altas en DNC y quejas. Se segmenta por humano o IA, personal u organización, entrante o saliente y tipo de campaña. "Contestada" es un estado técnico, no prueba de conversación.

**Validación:** una o dos semanas de línea base antes de la entrega 2; sesiones cortas con 3 a 5 clientes reales para descubrir fricción; comparación por workspaces para no confundir el efecto del diseño con cambios de lista. Meta inicial a calibrar: reducir al menos un 30 % el trabajo después de colgar, sin empeorar resultados por conversación.

## 9. Decisiones que te tocan

1. **Llamada gratis (BILL-018).** A: quitar la promesa y dejar la primera recarga a dos clics. B: un minuto gratis automático para teléfonos verificados, concedido con `grantCreditsOnce` y descontado de ese crédito, lo que exige cambiar BILL-018 y su documentación. Recomendación: A ahora; B cuando el cobro sea coherente.
2. **Modo continuo en el espacio personal.** Mantenerlo como ventaja del plan de organización y dar al plan gratis "Guardar y llamar al siguiente" (recomendado), o construir listas personales continuas en la entrega 4.
3. **`wrapUpTimeSec`.** Ocultarlo ya y decidir más adelante si el servidor aplica una pausa opcional, o eliminarlo.
4. **Inicio de quien no llama.** Llamar por defecto, con elección recordada por workspace para recepción o agentes de IA (recomendado).

## 10. Propietarios

| Cambio                              | Propietario actual                                                                                                   | Cuidado                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Devolver desde la Bandeja           | `apps/frontend/src/features/inbox/components/` (tres emisores de `ringee:dial`) y `features/calls/hooks/use.dial.ts` | Sustituir el evento por `useDial`; no añadir un receptor paralelo                       |
| Llamada puntual y comprobaciones    | `apps/frontend/src/features/calls/hooks/use.dial.ts`                                                                 | Un solo camino de marcado                                                               |
| Mi día                              | `features/calls/components/dialer-side-panel/`, `features/pending-actions`                                           | Sin entidad Task; agregado en `@ringee/services` si hace falta                          |
| Resultado durante la llamada manual | `packages/dialer-ui` (`ActiveCallModal`, `PostCallView`)                                                             | Lo usa la extensión; elegir resultado nunca cuelga                                      |
| Sesión de campaña                   | `features/dialer` (`agent-workspace.tsx`, `disposition-panel.tsx`, `use-dispose-lead.ts`)                            | Un solo motor (`useDialerCallEngine`); avance dentro del guardado                       |
| Contactos y selección               | `features/contact/components/contact.tables/`; `POST /campaigns/:id/leads/manual`                                    | Alcance de selección explícito                                                          |
| Campañas en el espacio personal     | `packages/frontend-shared/src/constants/data.ts`, `features/campaigns`                                               | Explicar y ofrecer organización con el flujo de pago existente                          |
| Rendimiento del número              | `packages/services/src/services/caller-id-rotation/caller-id-rotation.service.ts`                                    | Presentar el dato con su significado real                                               |
| Saldo y promesa gratuita            | `features/credit/components/credit.popover.tsx`, `features/onboarding`                                               | BILL-018 y BILL-019                                                                     |
| Medición                            | `packages/database` (hora del resultado, pausas), `packages/frontend-shared/src/lib/gtag.ts`                         | `pnpm prisma:generate` tras cambiar el esquema; nada de teléfonos ni notas en analítica |
| Configuración                       | `features/settings/lib/settings-nav.ts`, `SettingsDialog`                                                            | El modal se queda                                                                       |

Antes de tocar `dialer-ui`, `frontend-shared` o respuestas de la API, revisar sus consumidores: web, extensión de Chrome, SDK y superficie MCP. Los cambios son aditivos y las rutas actuales siguen funcionando.

## 11. Fuentes

Base: los tres planes anteriores y la inspección del código del 30 de septiembre de 2026. La investigación de mercado de [`UI_UX_PLAN_ALT.md`](UI_UX_PLAN_ALT.md) (sección 2 y fuentes) se usa como contexto, no como requisito. Referencias aplicadas directamente:

- Close, [Using the Power Dialer](https://help.close.com/feature-guide/power-predictive-dialing/using-the-power-dialer) e [Inbox](https://help.close.com/docs/inbox): trabajo desde una lista, pausa, reanudación y bandeja como lista de tareas.
- HubSpot, [prospecting workspace](https://knowledge.hubspot.com/prospecting/use-the-prospecting-workspace): tareas de hoy, vencidas y de mañana con una cola que se lanza con un clic.
- NN/g, [Recognition and Recall](https://www.nngroup.com/articles/recognition-and-recall/) y [Response Times](https://www.nngroup.com/articles/response-times-3-important-limits/).
- W3C, [Keyboard Control](https://www.w3.org/WAI/WCAG22/Techniques/general/G202) y [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).
