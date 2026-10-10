# Plan alterno de UI/UX de Ringee

Fecha: 30 de septiembre de 2026. Estado: propuesta alternativa a [`UI_UX_PLAN.md`](UI_UX_PLAN.md); no implementada. Decisión ya tomada: la configuración sigue siendo el modal `SettingsDialog`.

## 0. En una página

Ringee no es un CRM ni una centralita: es un **puesto de llamadas salientes** donde personas y agentes de IA llaman, dejan un resultado y agendan el siguiente paso, pagando por uso. Cada decisión de este plan responde a una sola pregunta: **¿ayuda a tener más conversaciones útiles por hora sin perder el control del dinero ni del contacto?**

Tres apuestas:

1. **Hoy es el marcador.** El inicio deja de ser un tablero de métricas y pasa a ser la pantalla de llamada con la cola priorizada: entras y la siguiente llamada ya está lista. La pieza existe (la cola de trabajo con "Call next" de `/dashboard/call`); falta convertirla en inicio y completarla.
2. **Cero trabajo después de colgar.** Resultado, nota y siguiente paso en dos acciones como máximo, con teclado. Más adelante, la IA los prellena.
3. **Confianza en el dinero y en el número.** Antes de marcar se ve desde qué número se llama, a qué país, qué hora es allí y cuánto costará aproximadamente. Nunca se promete lo que el backend no cumple.

Métrica norte: **conversaciones conectadas por hora de agente**, calculada con datos que ya están en la base de datos.

## 1. Qué es Ringee y qué implica para el diseño

| Rasgo                             | Evidencia en el producto                                                                                                 | Implicación de UX                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Salida primero                    | Modos de campaña `progressive` y `preview`; el marketing se posiciona frente a Aircall, JustCall, Kixie, Orum y Ringover | Llamar es la acción principal de toda la app; el resto la alimenta                           |
| Personas e IA juntas              | Agentes de voz (organización, beta) con resultado, resumen y datos extraídos                                             | Un solo historial y una sola bandeja para llamadas humanas y de IA, con autoría visible      |
| Pago por uso con crédito          | `CreditService`, saldo en el header, alertas de saldo (BILL-019)                                                         | Coste visible antes y después; alertas solo cuando cambian lo que puedes hacer               |
| Internacional y bilingüe          | Tarifas por destino, números en varios países, interfaz `en`/`es`                                                        | País, hora local y número de origen en cada llamada                                          |
| Precio plano, clientes pequeños   | Freelancer gratis; organización a $20/mes con usuarios ilimitados                                                        | Sin formación previa: la interfaz se explica sola y el onboarding pesa más que en enterprise |
| Abierto y operable por asistentes | MCP, CLI, SDK y extensión de Chrome                                                                                      | Mismas acciones y estados en todas las superficies; se ve qué hizo un asistente              |
| Dos espacios                      | Personal y organización (`docs/engineering/WORKSPACES.md`)                                                               | El alcance activo se ve siempre y nada se mezcla al cambiar                                  |

**Perfiles de uso** (no son roles nuevos):

- **Freelancer o vendedor solo** (plan gratis): llama por su cuenta; necesita marcar rápido y acordarse de volver a llamar.
- **Agente de un equipo**: trabaja una campaña o su cola; su enemigo es el tiempo muerto entre llamadas.
- **Líder de un equipo pequeño** (admin): reparte trabajo, cuida números y gasto, y muchas veces también llama.
- **Constructor de agentes de IA** (organización): configura, prueba y necesita confiar en los resultados.

**Momentos de la verdad:** la primera llamada conectada, el hueco entre llamadas, el cierre (resultado y siguiente paso), devolver una llamada perdida, el saldo que se acaba, un número que deja de contestarse y un agente de IA que se equivoca.

## 2. Lo que dice el mercado

### 2.1 Datos que ordenan las prioridades

- Los vendedores dedican el **28 %** de su semana a vender; el resto se va en administración ([Salesforce, State of Sales](https://www.salesforce.com/news/stories/sales-research-2023/)). Cada clic después de colgar compite con la siguiente llamada.
- Contactar un lead en **menos de una hora** multiplica por **7** la probabilidad de calificarlo frente a hacerlo una hora después, y por más de 60 frente a esperar 24 horas ([HBR, 1,25 millones de leads](https://hbr.org/2011/03/the-short-life-of-online-sales-leads)). Las llamadas perdidas y los leads recientes van arriba en Hoy.
- El **86 %** de la gente no contesta números que no reconoce ([Hiya, State of the Call 2026](https://www.businesswire.com/news/home/20260318666086/en), más de 12.000 consumidores en EE. UU., Reino Unido, Canadá, Francia, Alemania y España), y mostrar una identidad verificada sube la contestación ([Twilio](https://www.twilio.com/en-us/blog/products/launches/branded-calling-general-availability) reporta +21 % en un cliente). El número desde el que llamas es parte de la UX: su salud y su presencia local deben verse.
- La marcación paralela o predictiva produce llamadas abandonadas: en EE. UU. se toleran hasta un **3 %**, con mensaje grabado y dos segundos para conectar ([FTC, 16 CFR 310.4](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310/section-310.4)), y Ofcom aplica el mismo 3 % en Reino Unido ([Ofcom](https://www.ofcom.org.uk/__data/assets/pdf_file/0014/82040/persistent_misuse.pdf)). Con progresivo y preview, Ringee no abandona llamadas: su margen está en el tiempo del agente, no en el número de líneas.
- En EE. UU. solo se puede llamar con fines comerciales a particulares entre las **8:00 y las 21:00 hora del destinatario** ([47 CFR 64.1200](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)); otros países tienen sus propias reglas. La hora local del contacto es información operativa, no decoración.
- Una interfaz se siente instantánea por debajo de **0,1 s** y no corta el hilo por debajo de **1 s** ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)); Superhuman construye su producto alrededor de la regla de los 100 ms ([Superhuman](https://blog.superhuman.com/superhuman-is-built-for-speed/)).

### 2.2 Qué hace cada competidor y qué tomamos

| Producto                                                                                                                                                                                                  | Lo que hace bien                                                                                                                                                                            | Qué tomamos                                                                                   | Qué no tomamos                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Close](https://help.close.com/docs/inbox)                                                                                                                                                                | Inbox como lista de tareas (Inbox / Done / Future), lo más antiguo primero, botón _Next Lead_ y atajos; _power dialer_ que arranca desde una lista guardada, con pausa y _Continue calling_ | Hoy con Ahora / Más tarde / Hecho y "Llamar al siguiente"                                     | —                                                                              |
| [HubSpot](https://knowledge.hubspot.com/prospecting/use-the-prospecting-workspace)                                                                                                                        | Resumen con tareas de hoy, vencidas y de mañana, agenda del día, cola que se lanza con un clic y acciones guiadas que caducan                                                               | Cola que se lanza con un clic; sugerencias con caducidad (Ringee ya guarda `expiresAt`)       | Un workspace de varias pestañas                                                |
| [Salesloft Rhythm](https://www.salesloft.com/resources/blog/the-wait-is-over-rhythm-is-here/)                                                                                                             | Una sola lista de acciones, reordenada por señales                                                                                                                                          | El motivo visible en cada fila                                                                | Ordenar con IA opaca: la primera versión usa reglas deterministas              |
| [Orum](https://www.orum.com/product), [Nooks](https://www.nooks.in/salesfloor), [CloudTalk](https://cloudtalk.io/parallel-dialer), [Apollo](https://knowledge.apollo.io/hc/en-us/articles/45479798484621) | Marcación paralela de 5 a 10 líneas con detección de humano, sala de ventas virtual y coaching                                                                                              | Dejar el buzón pregrabado con un clic (Ringee ya tiene el _drop_)                             | Marcación paralela en este plan: abandono, coste por línea y otra arquitectura |
| [Kixie](https://www.kixie.com/features/connectionboost)                                                                                                                                                   | Presencia local y sustitución automática de números marcados como spam                                                                                                                      | Salud del número a la vista y alerta para sacarlo de rotación                                 | Un pool compartido opaco                                                       |
| [PhoneBurner](https://www.phoneburner.com/homepage/voicemail-drop-software)                                                                                                                               | Un clic deja el buzón pregrabado y marca el siguiente; el mismo clic puede enviar el seguimiento                                                                                            | Resultados que crean el siguiente paso                                                        | —                                                                              |
| [Aircall](https://support.aircall.io/en-gb/articles/21534390904093)                                                                                                                                       | Vistas de conversaciones, mensajes y llamadas; acciones al pasar el ratón y en lote (hasta 25), incluida "añadir al Power Dialer"; tiempo de cierre entre llamadas                          | Acciones en hover y "Añadir a la cola" en lote                                                | —                                                                              |
| [Quo](https://www.quo.com/blog/quo-ai/)                                                                                                                                                                   | Bandeja compartida con notas internas; resumen de IA dentro del hilo; su agente de voz deja el resumen en la bandeja                                                                        | Lo que hace un agente de IA aparece en la misma bandeja                                       | —                                                                              |
| [Dialpad](https://www.dialpad.com/features/artificial-intelligence/)                                                                                                                                      | Resúmenes con acciones; tarjetas en tiempo real que se disparan con palabras clave                                                                                                          | Resumen y resultado sugerido (entrega 5); tarjetas de objeción ligadas al guion, más adelante | Coaching en vivo antes de tener lo básico                                      |
| [Retell](https://www.retellai.com/blog/retell-ai-introduces-simulation-and-batch-testing-for-ai-agents), [Vapi](https://docs.vapi.ai/test/voice-testing)                                                  | Simulaciones con aprobado o fallido, transcripción y grabación; una llamada real fallida se convierte en prueba                                                                             | "Probar" con escenarios y "Convertir en prueba"                                               | Puntuaciones de confianza inventadas                                           |
| [Dapta](https://dapta.ai)                                                                                                                                                                                 | Agentes sin código de voz y WhatsApp en español, fuerte en LATAM                                                                                                                            | —                                                                                             | Competir en WhatsApp dentro de este plan                                       |
| [Superhuman](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)                                                                                                                      | ⌘K que enseña el atajo de cada acción                                                                                                                                                       | ⌘K con acciones, no solo navegación                                                           | —                                                                              |

**Conclusión.** La competencia converge en tres cosas: una lista única de "qué hago ahora", menos trabajo después de la llamada y números que contestan. Ringee ya tiene piezas de las tres —la cola de Llamar, las Pending Actions con prioridad, motivo y caducidad, el buzón pregrabado, la rotación con `healthScore` y `answerRate`—, pero están repartidas o escondidas detrás de botones de admin.

## 3. Principios verificables

| #   | Principio                                | Se cumple cuando…                                                                                                                                                  |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | La siguiente llamada, a un clic          | Desde Hoy, `N` llama al siguiente; cualquier fila de contacto se llama con un clic                                                                                 |
| 2   | Actuar en sitio                          | Llamar, ver un contacto, ver una llamada y configurar no cambian de página (ya lo hacen `useDial`, el detalle de llamada, `SettingsDialog` y la sesión de campaña) |
| 3   | Cerrar en dos acciones                   | Una tecla 1–9 y ⏎ guardan el resultado y el siguiente paso sugerido                                                                                                |
| 4   | Dinero y número a la vista               | Antes de marcar: número de origen, país, hora local y tarifa estimada; después: coste real                                                                         |
| 5   | Ninguna promesa que el backend no cumpla | Todo texto sobre crédito o gratuidad sale de la política del servidor                                                                                              |
| 6   | Mostrar el porqué                        | Cada elemento priorizado dice su motivo ("venció hace 20 min")                                                                                                     |
| 7   | Personas e IA en el mismo historial      | Cada evento dice quién lo hizo: tú, un compañero, un agente de IA o un asistente vía MCP                                                                           |
| 8   | Rápido de verdad                         | Acción local en menos de 100 ms (optimista); la ficha del siguiente, precargada                                                                                    |
| 9   | Teclado para lo repetitivo               | Toda acción de la cola tiene atajo y ⌘K lo enseña; ningún atajo se dispara mientras escribes                                                                       |
| 10  | Alcance siempre visible                  | El workspace activo (personal u organización) se ve en cada pantalla                                                                                               |

Reglas existentes que este plan no toca: una llamada en vivo solo se cuelga con el botón de colgar o desde el otro lado; elegir un resultado no cuelga; toda llamada manual pasa por `useDial` (DNC y aviso de número público); el crédito solo se mueve con `CreditService`; en el espacio personal, una llamada a la vez por usuario (`ConcurrentCallGuardService`).

## 4. Arquitectura de información

```text
┌────────────────────────────────────┐
│ Acme S.L. · Organización         ▾ │  selector de workspace (existe)
│ [ Llamar ]                         │  acción principal global (hoy "llamada rápida")
│                                    │
│ Hoy                                │  inicio: marcador + cola
│ Bandeja                         12 │  perdidas, buzones, SMS, asignación
│ Contactos                          │  + pestaña "No llamar" (DNC)
│ Campañas                           │
│ Agenda                             │  callbacks + reuniones
│ Llamadas                           │  historial, grabaciones, actividad
│ Agentes IA                    BETA │  solo organización
│ Informes                           │  el tablero actual
│ ────────────────────────────────── │
│ Números                            │  solo admin
│ Configuración                 ⇧⌘, │  abre el modal (se queda)
│ Soporte                            │
│ (avatar) Perfil · Facturación ·    │
│          Tarifas · Salir           │
└────────────────────────────────────┘
```

| Hoy en la app                                                         | Pasa a                                                             | Motivo                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Dashboard (`/dashboard/overview`, "Outbound Performance")             | Informes                                                           | Las métricas no son lo primero que necesita quien llama                         |
| Call (`/dashboard/call`)                                              | Hoy, y es el inicio                                                | Ya reúne marcador, cola, reuniones de hoy, recientes y "Call next"              |
| Activities, History y Recordings                                      | Llamadas (pestañas)                                                | Un solo registro; dos de ellas hoy viven en el menú del avatar                  |
| Callbacks y Meetings                                                  | Agenda (pestañas)                                                  | Ambos son compromisos con fecha y hoy ocupan dos entradas                       |
| DNC                                                                   | Pestaña "No llamar" en Contactos                                   | Es un filtro de contactos, no un destino diario; el aviso al marcar se mantiene |
| Pending Actions (botón del header)                                    | Fuente de Hoy; el contador lleva a Hoy                             | Una sola lista de "qué hago ahora"                                              |
| Buy Number y rotación de números (menú del avatar y botón del header) | Números (admin)                                                    | Un hogar para la identidad telefónica                                           |
| Rate y Billing (menú del avatar)                                      | Siguen en el avatar; Facturación también desde el popover de saldo | Se usan poco; el saldo es donde se recarga                                      |
| Settings (menú del avatar y ⇧⌘,)                                      | El modal se queda, con entrada al pie del sidebar y en ⌘K          | Descubrible sin convertirse en páginas                                          |

Todas las URL actuales siguen funcionando (la de Hoy puede seguir siendo `/dashboard/call`, y `/dashboard` redirige ahí en lugar de a `overview`). Los atajos actuales se conservan: `c c` abre Hoy.

## 5. Pantallas

Una jornada con este plan: Laura, agente de un equipo, entra a las 9:00. Hoy le muestra dos llamadas perdidas de anoche y cinco callbacks. Pulsa `N`, habla, marca `3` (interesado) y ⏎; el callback de mañana queda creado solo y ya está sonando la siguiente. A las 11:00 pulsa "Continuar" en su campaña y trabaja 40 leads sin tocar el ratón. No abrió ninguna página nueva en toda la mañana.

### 5.1 Hoy (inicio)

```text
┌─ Hoy · mar 30 sep · 17:42 Madrid ─────────────── Mi trabajo ▾ ─┐
│ Hoy llevas: 34 llamadas · 12 conectadas · 2 reuniones          │
│ ▸ Reunión con Grupo Sol en 25 min                   [Unirse]   │
├───────────────────────────┬────────────────────────────────────┤
│ Buscar contacto o número  │ AHORA (3)                          │
│ ┌───────────────────────┐ │ Ana Ruiz · perdida hace 12 min     │
│ │ +52 55 0000 0101      │ │   México · 09:42 allí   [Devolver] │
│ └───────────────────────┘ │ Luis Pardo · callback vencido      │
│ Desde +34 910 000 000   ▾ │   hace 20 min · "Enviar precios"   │
│   España · salud 92/100   │                           [Llamar] │
│ A México · 09:42 allí     │ MÁS TARDE HOY (5)                  │
│ Tarifa estimada: X $/min  │ 18:30 Marta Gil · callback [Llamar]│
│                           │ CAMPAÑAS (1)                       │
│ [ Llamar ]                │ Recruiting Q4 · 48 listos          │
│ Teclado ▸                 │                        [Continuar] │
│                           │ HECHO HOY (9) ▸                    │
├───────────────────────────┴────────────────────────────────────┤
│ [ Llamar al siguiente: Ana Ruiz   N ]                          │
└────────────────────────────────────────────────────────────────┘
```

**Orden de la cola** (primera versión, determinista y estable):

1. Llamadas perdidas y buzones sin devolver de las últimas 24 h, lo más reciente primero.
2. Callbacks vencidos, el más antiguo primero (el criterio que ya usa "Call next").
3. Pending Actions de prioridad alta que vencen hoy.
4. Callbacks y Pending Actions de más tarde, por hora.
5. Campañas asignadas con leads listos ahora.

Las reuniones que empiezan en 30 minutos o menos van fijadas arriba, fuera de la cola, porque no se llaman: se preparan o se abren.

**Detalles:**

- Cada fila muestra persona, motivo, hora local del contacto y una acción primaria (Devolver, Llamar, Unirse o Continuar). El menú ⋯ ofrece posponer, marcar como hecho y abrir el contacto.
- Posponer usa el `snoozedUntil` de las Pending Actions; en un callback, reprogramarlo.
- Si en el destino es antes de las 8:00 o después de las 21:00, la fila lo indica y "Llamar" pide confirmación. En campañas manda su ventana horaria.
- Alcance: "Mi trabajo" por defecto. "Equipo" (admin, en una segunda iteración) muestra lo que está sin asignar y lo vencido del equipo.
- Vacío: "Estás al día", más la mejor acción disponible (continuar una campaña o importar contactos).
- Los contadores del día están para motivar, no para analizar: el análisis vive en Informes.
- Datos: la primera versión compone fuentes existentes (callbacks, reuniones, llamadas perdidas de la bandeja, Pending Actions y campañas) con límites pequeños por fuente y un "ver todo" hacia cada una. Si hace falta paginar o deduplicar entre fuentes, se añade un endpoint agregado en `@ringee/services`; nunca una entidad Task nueva.

### 5.2 Marcar, hablar y cerrar

**Antes de marcar** (en Hoy, en la llamada rápida y en la extensión):

- Número de origen con país y salud (0–100), o "Automático · presencia local" cuando hay rotación.
- Destino con país, hora local y aviso si allí es de madrugada.
- Tarifa estimada por minuto, servida por el backend y rotulada como estimación.
- Bloqueos con salida: sin micrófono → "Permitir micrófono"; sin saldo (402) → "Recargar"; otra llamada activa (409) → "Ir a la llamada"; contacto en DNC → la confirmación actual.
- En reposo, el marcador invita: "Busca un contacto o escribe un número". Hoy dice "No contacts found" antes de que escribas nada (`contact.selector.tsx:172`).

**Durante:** se mantiene la ventana de llamada no modal (`ActiveCallModal`), con ficha, guion y notas. Como ya ocurre en la campaña, el resultado se puede elegir mientras se habla, sin colgar, y el botón de buzón pregrabado aparece cuando salta el buzón.

**Después:**

```text
┌─ Llamada con Ana Ruiz · 04:12 · conectada ──────────────────┐
│ Resultado                                                   │
│ [1 Reunión] [2 Venta] [3 Interesado] [4 Seguimiento]        │
│ [5 Volver a llamar] [6 No interesado] [7 No contesta]       │
│ [8 Buzón] [9 Número erróneo]                                │
│                                                             │
│ Nota ______________________________________________________ │
│                                                             │
│ Siguiente paso (sugerido)                                   │
│ (•) Volver a llamar mañana a las 10:00, hora de Ana         │
│ ( ) Agendar reunión     ( ) Ninguno                         │
│                                                             │
│ [ Guardar y siguiente  ⏎ ]                        [Guardar] │
└─────────────────────────────────────────────────────────────┘
```

- Los nueve resultados de la llamada manual (`post-call-view.tsx`) ocupan las teclas 1–9, igual que en la campaña (`disposition-panel.tsx`). No se activan mientras escribes la nota.
- El siguiente paso se sugiere según el resultado (no contesta → reintentar en unas horas, dentro de su horario; interesado → callback mañana; reunión → abrir la agenda) y siempre se puede cambiar.
- "Guardar y siguiente" lleva al siguiente elemento de Hoy cuando la llamada salió de allí.
- "Reunión" no se muestra como confirmada hasta que existe la reserva.
- Si el guardado falla, la nota se conserva y el reintento no crea otra llamada.
- Los textos de `@ringee/dialer-ui` están en inglés fijo ("Meeting Booked", "Voicemail on its way"); se localizan pensando en la extensión, que también los usa.

### 5.3 Contactos

- El nombre es un enlace. Al pasar el ratón aparecen `Llamar`, `Abrir` y `Añadir a la cola`; el menú ⋯ queda para editar, etiquetas, notas y eliminar. Hoy Llamar y Ver están dentro del ⋯ (`cell-action.tsx`) y el nombre no es enlace (`columns.tsx`).
- `Abrir` despliega un panel lateral con identidad, próximos compromisos, últimas interacciones, notas y "Llamar". "Abrir ficha completa" lleva a la página actual.
- Paginación "1–10 de 57" con el total del servidor (`meta.total`) y selección explícita: "10 de esta página · Seleccionar los 57". Hoy el pie dice "N row(s) total" contando solo las filas cargadas, en inglés fijo (`data-table-pagination.tsx`, compartido por todas las tablas).
- Acciones en lote: añadir a campaña, etiquetar, exportar y eliminar (N). "Delete by Tag", que hoy ocupa la barra de la tabla (`ContactsBulkDelete`), pasa a esas acciones en lote.
- Columnas que ayudan a decidir: último contacto y próximo paso.

### 5.4 Bandeja

- Los nueve filtros de hoy (todas, no leídas, mías, sin asignar, perdidas, buzones, SMS, resueltas y archivadas) pasan a cuatro vistas: **Pendientes**, **Mías**, **Sin asignar** y **Cerradas**. Canal y lectura se convierten en filtros combinables, lo que exige ampliar el contrato actual (acepta un solo `filterId`).
- Cada fila: persona, línea por la que entró, último evento concreto ("Llamada perdida · sin devolver"), responsable y tiempo, con "Devolver" como acción primaria.
- En el hilo, las llamadas humanas y las de IA llevan autoría; el resumen del agente de IA aparece dentro del hilo; la nota interna y el SMS tienen estilos y etiquetas distintos para no enviar lo que era interno.

### 5.5 Campañas

- Lista en tabla: estado, progreso, leads listos ahora, motivo de bloqueo ("fuera de ventana hasta las 9:00", "sin números", "sin leads"), equipo y "Continuar sesión". El título es un enlace nativo; hoy la tarjeta entera es un `onClick` (`campaign-list.tsx`).
- El checklist de preparación (`campaign-readiness.tsx`) asoma en la lista: "Faltan 2 pasos para empezar".
- En la sesión (modal, ya existe), una cuenta atrás de cierre con "Siguiente ya" y "Pausar". El campo `wrapUpTimeSec` (30 s por defecto) se guarda, pero no encontré código que lo aplique: hoy el avance depende de guardar el resultado. Hay que aplicarlo o quitarlo.

### 5.6 Agentes de IA

- De ocho pestañas (setup, voice, company, conversation, results, knowledge, test y calls) a tres: **Configurar**, **Probar** y **Actividad**.
- Configurar sigue el orden de una conversación: objetivo, negocio, conocimiento, conversación, voz y resultados. Modelo y proveedor pasan a "Avanzado".
- Arriba, una frase construida con la configuración: "Llama a los leads de _Webinar_, agenda en _Calendario Ventas_ y pasa a Ana si piden precio".
- Probar: escenarios por tipo de agente (caso normal, falta información, fuera de alcance y derivación) con aprobado o fallido, transcripción y grabación, y "Convertir en prueba" desde una llamada real. Es backend nuevo y se estima aparte.
- Actividad: llamadas, resultados y coste del agente, con el mismo detalle de llamada que el resto.

### 5.7 Números (admin)

- Tabla: número, país, capacidades, destino o asignación, salud (0–100), tasa de contestación de los últimos 7 días, si está en rotación y estado de verificación. Los datos ya existen en la rotación (`caller-id-rotation.service.ts`), pero hoy solo se ven desde un botón del header.
- Alerta en Hoy y en Números cuando un número pierde contestación: "Sácalo de rotación".
- "Comprar número" (la página actual) y "Enrutamiento" (abre `#settings/call-routing`).
- El selector de número del marcador muestra la salud junto a cada número.

### 5.8 Configuración (el modal se queda)

- Entradas: el pie del sidebar, ⇧⌘, (ya existe), ⌘K y enlaces contextuales como "Configurar guion" desde la llamada.
- ⌘K hoy navega a las páginas sueltas `/dashboard/settings/overview` y `/dashboard/settings/integrations` porque lee `navItems`. Debe abrir el modal a través del fragmento `#settings/<panel>`, que el diálogo ya escucha.
- El rail pasa de dos secciones (`SETTINGS_SECTIONS`: settings e integrations) a tres: **Tú** (General, Guion, Calendarios), **Workspace** (Grabación, Enrutamiento, Operadores externos, Teléfonos de escritorio) e **Integraciones** (CRM, Enriquecimiento, Leads, Personalizadas, Conectores, Proveedores de calendario).
- Las páginas `/dashboard/settings/*` quedan para enlaces directos y para el retorno del OAuth del CRM.

### 5.9 Saldo y dinero

- Header: saldo neutro con su importe; ámbar al cruzar el umbral (BILL-019); rojo, con la consecuencia concreta, cuando ya no permite llamar (402).
- Popover: la recarga que ya existe, "Ver facturación" y una equivalencia orientativa "≈ N min a {país más llamado}", siempre rotulada como estimación sin grabación ni IA.
- El botón con degradado "Llama gratis · 1 minuto por nuestra cuenta" (`credit.popover.tsx`) desaparece o cambia según la decisión sobre BILL-018 (sección 10): hoy promete un minuto gratis mientras el manejador de coste cobra igualmente (la nota de BILL-018 está marcada _Needs confirmation_).
- Detalle de llamada: coste real cuando se liquida (`totalCost`) y "calculando" mientras tanto.

### 5.10 Onboarding por intención

Los pasos actuales (solicitar llamada gratis → primera llamada → grabar → explorar números → comprar créditos) giran alrededor del producto, no del objetivo del cliente, y el primero depende de una aprobación manual (BILL-018). Propuesta:

- Pregunta inicial: **¿Qué quieres hacer?** Llamar yo · Montar mi equipo · Crear un agente de IA.
- Llamar yo: micrófono listo → número de origen elegido → saldo o prueba → primera llamada conectada → resultado guardado.
- Montar mi equipo: invitar → comprar o conectar un número → importar contactos → crear campaña → primera sesión.
- Crear un agente de IA: elegir tipo → describir el negocio → pasar tres escenarios de prueba → primera llamada real.
- El momento clave es la primera conversación conectada con su resultado guardado; ahí termina el onboarding y la guía desaparece.

## 6. Sistema visual

- **Teal como `--primary`.** El tema por defecto (`default-scaled`) usa gris neutro (`apps/frontend/src/app/theme.css:31`) y el teal solo aparece en degradados sueltos (saldo, upgrade, etiqueta beta). Cambiar el token recolorea todo lo que usa `bg-primary`: va en un PR propio, con revisión visual en tema claro y oscuro.
- El acento se reserva para la acción principal de cada pantalla: "Llamar", "Llamar al siguiente", "Guardar y siguiente".
- Semántica con texto o icono además del color: verde para conectado, ámbar para atención, rojo para error y colgar, azul para información. El teal de acción y el verde de "conectado" deben distinguirse a simple vista.
- Listas de trabajo con filas de 44–48 px, texto de 14 px y metadatos de 12–13 px.
- Tipografía, espaciado, radios y movimiento: se mantiene la sección 5 del plan original.

## 7. Accesibilidad, velocidad y móvil

- WCAG 2.2 AA: foco visible y no tapado, todo operable por teclado, estados que no dependen solo del color y zoom al 200 %.
- Presupuestos de tiempo: acción local en menos de 100 ms con actualización optimista; "Llamando…" visible en menos de 100 ms tras pulsar; abrir un panel en menos de 1 s, con los skeletons existentes.
- Mientras dura una llamada se precarga la ficha del siguiente elemento de la cola.
- Móvil: Hoy como lista a pantalla completa, llamada a pantalla completa y cierre con botones grandes (44 px).

## 8. Entregas

Cada entrega es pequeña, se puede publicar sola y tiene una métrica que debería moverse. Tamaño: S = días; M = una o dos semanas; L = se diseña y estima aparte.

| Entrega                         | Tamaño | Contenido                                                                                                                                                                                                                                                                                                                                               | Criterio de aceptación                                                                        | Métrica que debería moverse                                  |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Lo que ya existe, a la vista | S      | Marcador en reposo; Llamar y Abrir visibles en contactos y nombre enlazado; paginación con total real y traducida; textos fijos en inglés (header, Pending Actions, tablas, `dialer-ui`); título de campaña enlazado; Configuración en el sidebar y en ⌘K abre el modal; botón Llamar con acento y saldo neutro; copy alineado con la decisión BILL-018 | Ninguna afirmación falsa en pantalla; llamar a un contacto en un clic; ⌘K abre el modal       | Clics hasta marcar                                           |
| 2. Hoy como inicio              | M      | `/dashboard` lleva a Hoy; cola con motivo y orden determinista; "Llamar al siguiente"; Pending Actions dentro de Hoy; Agenda con callbacks y reuniones; Llamadas con historial, grabaciones y actividad                                                                                                                                                 | Entrar y marcar al siguiente en una acción; cada fila explica su prioridad                    | Tiempo hasta la primera llamada; perdidas devueltas en < 1 h |
| 3. Cerrar en dos acciones       | M      | Teclas 1–9 y ⏎ en la llamada manual; siguiente paso sugerido; "Guardar y siguiente"; franja previa con origen, destino, hora local y tarifa; panel lateral de contacto                                                                                                                                                                                  | Cerrar una llamada sin ratón; ningún resultado cuelga una llamada                             | Tiempo muerto entre llamadas; % de llamadas con resultado    |
| 4. Bandeja, campañas y números  | M      | Bandeja con cuatro vistas; lista de campañas con progreso y bloqueo; cuenta atrás de cierre en la sesión; página Números con salud y alertas                                                                                                                                                                                                            | Se entiende por qué una campaña no avanza; un número degradado se detecta sin abrir el header | Contestación por número; leads por hora en campaña           |
| 5. Capacidades nuevas           | L      | Resumen de IA y resultado sugerido en llamadas humanas (hoy solo hay análisis por reglas, `CallAnalysisService`), con su coste cobrado vía `CreditService`; editor de agentes en tres pestañas con simulaciones; onboarding por intención                                                                                                               | Cada una con su diseño, su regla de negocio documentada y su prueba                           | Tiempo de cierre; pruebas de agentes aprobadas               |

**Fuera de este plan:** marcación paralela o predictiva, WhatsApp, menús IVR, un rediseño de marca, una entidad Task nueva, un segundo motor de llamadas y convertir la configuración en páginas.

## 9. Cómo medirlo sin herramientas nuevas

En el frontend solo hay Google Analytics, Ahrefs y Sentry; no hay analítica de producto. Casi todo se puede calcular desde la base de datos:

| Métrica                                              | Fuente                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Conversaciones conectadas por hora de agente         | `Call` (`answeredAt`, `durationSeconds`, `userId`); "conectada" se define una vez (contestada y ≥ N segundos) |
| Tiempo muerto entre llamadas                         | Llamadas consecutivas del mismo usuario dentro de una sesión (`endedAt` → siguiente `startedAt`)              |
| % de llamadas con resultado                          | `Call.outcome` no nulo                                                                                        |
| Perdidas devueltas en menos de una hora              | Evento `missed_call` de la bandeja → siguiente llamada saliente al mismo número                               |
| Callbacks a tiempo                                   | Callbacks completados antes o después de su hora                                                              |
| Contestación por número                              | Ya calculada en la rotación (`answerRate`)                                                                    |
| Clics hasta marcar y tiempo hasta la primera llamada | Eventos de Google Analytics sin datos personales: ni teléfonos, ni notas, ni transcripciones                  |

Guardarraíles: cero llamadas o cobros duplicados, altas en DNC y quejas, y reuniones agendadas por conversación conectada, para no ganar volumen a costa de calidad.

## 10. Decisiones que te tocan

1. **BILL-018 (llamada gratis).** Opción A: quitar la promesa y dejar la primera recarga a dos clics. Opción B: un minuto gratis automático para teléfonos verificados, concedido con `grantCreditsOnce` y descontado de ese crédito; exige cambiar BILL-018 y su documentación. Recomendación: A ahora; B cuando el cobro sea coherente con la promesa.
2. **Inicio de quien no llama** (admin que solo supervisa): Hoy para todos con Informes a un clic (recomendado), o Informes por rol.
3. **`wrapUpTimeSec`**: aplicarlo con la cuenta atrás visible, o eliminar el campo.
4. **Marcación paralela:** fuera de este plan; se revisa después de la entrega 3, con datos reales de tiempo muerto.
5. **Nombres:** "Hoy" para la sección y "Llamar" para el botón global (recomendado).

## 11. Mapa de implementación

| Cambio                          | Propietario actual                                                                                                                   | Cuidado                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Sidebar, grupos y atajos        | `packages/frontend-shared/src/constants/data.ts`, `apps/frontend/src/components/layout/app-sidebar.tsx`                              | `navItems` también alimenta ⌘K                                                   |
| ⌘K con acciones y Configuración | `packages/frontend-shared/src/components/kbar/index.tsx`                                                                             | Abrir el modal con `#settings/<panel>`, sin importar el store de `apps/frontend` |
| Inicio                          | `apps/frontend/src/app/dashboard/page.tsx` (hoy redirige a `overview`)                                                               | `/dashboard/overview` sigue vivo como Informes                                   |
| Hoy                             | `apps/frontend/src/features/calls/components/call.page.view.tsx`, `dialer-side-panel/`, `apps/frontend/src/features/pending-actions` | Sin entidad Task; endpoint agregado en `@ringee/services` solo si hace falta     |
| Marcador en reposo              | `apps/frontend/src/features/calls/components/contact.selector.tsx`                                                                   | —                                                                                |
| Cierre de llamada               | `packages/dialer-ui/src/components/post-call-view.tsx`                                                                               | Lo consume la extensión de Chrome; hoy sus textos están en inglés fijo           |
| Contactos                       | `apps/frontend/src/features/contact/components/contact.tables/`                                                                      | Llamar solo con `useDial`                                                        |
| Paginación                      | `packages/frontend-shared/src/components/ui/table/data-table-pagination.tsx`                                                         | Compartido por todas las tablas                                                  |
| Header y saldo                  | `apps/frontend/src/components/layout/header.tsx`, `apps/frontend/src/features/credit/components/credit.popover.tsx`                  | BILL-018 y BILL-019                                                              |
| Bandeja                         | `apps/frontend/src/features/inbox` (`THREAD_FILTER_OPTIONS`)                                                                         | Filtros combinables = cambio de API                                              |
| Campañas                        | `apps/frontend/src/features/campaigns`, `apps/frontend/src/features/dialer`                                                          | Un solo motor (`useDialerCallEngine`); elegir resultado nunca cuelga             |
| Números                         | `apps/frontend/src/features/number-rotation`, `/dashboard/buy-number`                                                                | Datos del proveedor normalizados por Ringee                                      |
| Configuración                   | `apps/frontend/src/features/settings/lib/settings-nav.ts`                                                                            | El modal se queda                                                                |
| Agentes de IA                   | `apps/frontend/src/features/ai-voice-agents/components/agent-detail.tsx`                                                             | Las simulaciones son backend nuevo                                               |
| Onboarding                      | `apps/frontend/src/features/onboarding/components/onboarding-guide.tsx`                                                              | BILL-018                                                                         |

Antes de tocar `dialer-ui`, `frontend-shared` o cualquier respuesta de la API, revisar sus consumidores: web, extensión de Chrome, SDK y superficie MCP. Los cambios son aditivos y las rutas antiguas se mantienen.

## 12. Diferencias con el plan original

| Tema                  | Plan original                                                  | Este plan                                                                                                                | Por qué                                                     |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Inicio                | Página Hoy nueva, además de la pantalla de llamada             | Hoy es la pantalla de llamada, ascendida y completada                                                                    | La cola ya existe; evita dos listas de "qué hago" y un clic |
| Navegación de admin   | Números, Configuración y Facturación como entradas del sidebar | Números (admin) y Configuración (modal) al pie; Facturación desde el saldo                                               | Un agente no las usa; el modal se queda                     |
| Métrica principal     | Tiempos de tarea                                               | Conversaciones conectadas por hora, con guardarraíles                                                                    | Es lo que el cliente compra                                 |
| Proceso               | 7–9 semanas, 4–5 personas y 6–8 entrevistas                    | Cinco entregas medibles con datos de la base de datos y 2–3 clientes                                                     | El tamaño real del equipo                                   |
| Número de origen      | Mención general                                                | Salud y presencia local visibles en el marcador y en Números                                                             | El 86 % no contesta a desconocidos                          |
| Cierre de llamada     | Guardar / Guardar y continuar                                  | Teclas 1–9, siguiente paso sugerido y "Guardar y siguiente"                                                              | Solo el 28 % del tiempo se dedica a vender                  |
| Marcación paralela    | No se trata                                                    | Fuera, con motivo                                                                                                        | Abandono máximo del 3 % y otra arquitectura                 |
| Competencia estudiada | Aircall, Quo y Close                                           | Además HubSpot, Salesloft, Orum, Nooks, CloudTalk, Apollo, Kixie, PhoneBurner, Dialpad, Retell, Vapi, Dapta y Superhuman | Cubre dialers, bandejas y agentes de IA                     |

## 13. Fuentes

- Salesforce, [State of Sales](https://www.salesforce.com/news/stories/sales-research-2023/) — tiempo que se dedica a vender.
- Oldroyd, McElheran y Elkington, [The Short Life of Online Sales Leads](https://hbr.org/2011/03/the-short-life-of-online-sales-leads), HBR, 2011.
- Hiya, [State of the Call 2026](https://www.businesswire.com/news/home/20260318666086/en).
- Twilio, [US Branded Calling](https://www.twilio.com/en-us/blog/products/launches/branded-calling-general-availability), agosto de 2026.
- FTC, [Telemarketing Sales Rule, 16 CFR 310.4](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310/section-310.4); FCC, [47 CFR 64.1200](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200); Ofcom, [persistent misuse](https://www.ofcom.org.uk/__data/assets/pdf_file/0014/82040/persistent_misuse.pdf).
- Nielsen Norman Group, [Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/); Superhuman, [the 100ms rule](https://blog.superhuman.com/superhuman-is-built-for-speed/) y [How to build a remarkable command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/).
- Close, [Inbox](https://help.close.com/docs/inbox) y [Power Dialer](https://help.close.com/feature-guide/power-predictive-dialing/using-the-power-dialer); HubSpot, [prospecting workspace](https://knowledge.hubspot.com/prospecting/use-the-prospecting-workspace); Salesloft, [Rhythm](https://www.salesloft.com/resources/blog/the-wait-is-over-rhythm-is-here/).
- Orum, [producto](https://www.orum.com/product); Nooks, [Virtual Salesfloor](https://www.nooks.in/salesfloor); CloudTalk, [Parallel Dialer](https://cloudtalk.io/parallel-dialer); Apollo, [power y parallel dialing](https://knowledge.apollo.io/hc/en-us/articles/45479798484621).
- Kixie, [ConnectionBoost](https://www.kixie.com/features/connectionboost); PhoneBurner, [voicemail drop](https://www.phoneburner.com/homepage/voicemail-drop-software); Aircall, [conversaciones, mensajes y llamadas](https://support.aircall.io/en-gb/articles/21534390904093) y [Power Dialer](https://aircall.io/call-center-software-features/power-dialer/).
- Quo, [Quo AI](https://www.quo.com/blog/quo-ai/); Dialpad, [IA](https://www.dialpad.com/features/artificial-intelligence/); Retell, [simulación y pruebas en lote](https://www.retellai.com/blog/retell-ai-introduces-simulation-and-batch-testing-for-ai-agents); Vapi, [voice testing](https://docs.vapi.ai/test/voice-testing); [Dapta](https://dapta.ai).

Las cifras de proveedores (Orum, Kixie, CloudTalk, Apollo) son afirmaciones comerciales: sirven para entender qué valora el mercado, no como resultados esperables para Ringee.
