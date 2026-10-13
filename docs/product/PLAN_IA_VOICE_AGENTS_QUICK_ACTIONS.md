# Ringee IA Voice Agents: activación rápida y continuidad entre agentes

Propuesta de producto e implementación · 12 de octubre de 2026

Estado (13 de octubre de 2026): entregas 1, 2 y 4 implementadas sin traspaso IA, detrás del flag `AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS` (vacío por defecto). La entrega 0 y la 3 siguen pendientes de la prueba real con Telnyx. No se han probado llamadas reales. Ver §14. Los nombres y citas de la propuesta visual son ejemplos.

## 1. Decisión de producto

Agregar una barra vertical a la derecha con el texto **Ringee IA Voice Agents** (hoy **Trigger AI Voice Agents**, ver §3). Al abrirla aparecen tres capacidades listas para configurar: **Recordatorios y confirmaciones**, **Recepcionista IA** y **Agendar citas**. Cada una tiene nombre propio, activación rápida, una acción útil y acceso a **Personalizar**.

La recepcionista atiende, reconoce el motivo y transfiere al especialista. El agente de recordatorios confirma la asistencia; el de agendamiento consulta disponibilidad y agenda. La recepcionista conserva su capacidad actual de responder preguntas y transferir a personas, pero no recibe herramientas para modificar citas.

Un contacto que devuelve una llamada continúa la tarea pendiente con el mismo agente que lo llamó, siempre que siga disponible y autorizado. Se conserva el contexto de negocio; la llamada anterior terminada no se puede reabrir. Se inicia una nueva llamada entrante, con un traspaso interno entre agentes dentro de esa misma llamada.

## 2. Lo que ya existe y lo que falta

| Área                      | Evidencia en el repositorio                                                                  | Trabajo necesario                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Tres agentes              | `voice-agents/blueprints/`: `receptionist`, `appointment_booking`, `reminders_notifications` | Reutilizar sus tipos y configuraciones; agregar activación por propósito                                     |
| Personalización           | `AgentScreen`, `AgentDetail`, `useAgentDraft`                                                | Abrir el editor existente desde la barra, con regreso al contexto anterior                                   |
| Llamadas                  | `VoiceAgentCallService.startCall` y `startInbound`                                           | Mantener una sola ejecución con los controles actuales; agregar contexto y continuidad                       |
| Recepción                 | `InboundRouteService`, resolver, router y `ai-receptionist.destination`                      | Activar y pausar conservando rutas; traspasar a especialistas IA                                             |
| Transferencias            | `VoiceAgentToolService.transferToDestination` admite usuario, grupo y extensión              | Agregar traspaso IA; hoy no existe en la interfaz del proveedor                                              |
| Calendarios               | `CalendarService`, `MeetingService`, reserva transaccional                                   | Reutilizar calendarios Ringee; agregar responsable explícito y confirmación de asistencia                    |
| Recordatorios             | `ReminderService` envía correo/push a quien agenda, con offsets de 15 y 5 minutos            | Agregar llamadas al lead, políticas por calendario y ejecución durable por intento                           |
| Retrollamadas programadas | `CallbackService.scheduleFromVoiceAgent` y `processDueCallbacks`                             | Reutilizar sus criterios de claim, reintentos y conciliación; no confundirlas con recordatorios de reuniones |
| Correo                    | `EmailInterface` admite To y CC; existe resolución de administradores                        | Añadir hilo, entrega durable e idempotencia; respetar Reply-To explícito                                     |
| Historial                 | `Call`, contactos, resúmenes y resultados IA                                                 | Construir contexto acotado de las tres llamadas previas y la tarea pendiente                                 |

Dos restricciones actuales son especialmente relevantes:

- `AiVoiceAgentCall.callId` y `providerConversationId` son únicos. El modelo actual representa una relación de llamada con un agente, no varios participantes IA.
- `MeetingStatus` contiene `scheduled`, `completed`, `cancelled`, `rescheduled`. No representa que el lead confirmó su asistencia. El outcome IA `confirmed` tampoco guarda por sí solo esa confirmación en la reunión.

## 3. Experiencia de la barra

### Estructura

- Nombre visible: **Trigger AI Voice Agents** («Trigger IA Voice Agents» en español). Los textos presentan cada capacidad como un agente con su disparador —cuándo se dispara → qué hace— para que quien lo configura sepa qué va a pasar.
- Franja de 64 px a toda la altura, al lado del header y de la página (no debajo), con fondo propio (`bg-sidebar`) para que se vea cerrada. Arriba, una pestaña con el título vertical de arriba abajo y el contador accesible de agentes operativos; cerrada, sin logo. Contador verde, con punto, solo si hay al menos una capacidad realmente operativa.
- Abierta, la pestaña queda presionada con el logo de Ringee y el panel de 480 px aparece a su derecha, como en la referencia de Kapso. Se acopla junto al contenido desde 1440 px; por debajo, cuando comprimiría tablas o formularios, se presenta como panel superpuesto. En móvil: botón horizontal y panel de pantalla completa.
- Tres tarjetas compactas: propósito, nombre/estado, una frase de configuración y acciones. Sin métricas decorativas, constructor de flujos ni campos de modelo/proveedor al activar.
- Conservar colores, tipografía y componentes Radix/Tailwind de Ringee. Neutros, un acento para la acción principal, verde para activo y ámbar para atención; el texto siempre explica el estado.
- La barra comparte el espacio derecho con el `DialerShortcutView` existente: una superficie auxiliar visible a la vez. Cambiar de panel nunca termina una llamada ni desmonta su motor.
- Al final: actividad reciente real, limitada a tres eventos, con enlace a la cita o llamada. Ejemplos: «Asistencia confirmada», «Sin respuesta», «Necesita un correo».

### Activación

La primera vez, **Activar** abre una configuración breve dentro del panel. Después de configurado aparece el interruptor para encender/pausar. Esto permite explicar el primer uso sin mostrar un interruptor encendido antes de que exista una configuración válida.

Solo pedir lo que falte: nombre sugerido editable, número y los campos propios de esa función. Idioma, voz estándar, perfil de empresa y calendario conocido se precargan y permanecen visibles en el resumen. Nunca escoger silenciosamente el primer número si hay varios.

Estados: «Sin configurar», «Activando…», «Activo», «Pausado» y «Necesita atención». La API devuelve readiness, permisos y un siguiente paso concreto. Tener `status=active` no basta: una recepcionista sin número no está atendiendo; un recordatorio sin regla no está automatizado.

Cada tarjeta ofrece **Personalizar** y **Probar** usando las superficies existentes. Personalizar abre el editor completo, conserva el borrador y al volver restaura panel, selección y página. Se agregan únicamente las secciones nuevas de automatización, continuidad y notificaciones.

### Accesibilidad y rendimiento

Controles con etiquetas, foco visible, estado anunciado, targets táctiles de 44 px, contraste mínimo 4.5:1 y cierre por Escape con retorno de foco. El panel modal usa el comportamiento de foco de Radix; el panel acoplado no atrapa foco. Respetar movimiento reducido y traducciones con `next-intl`. Cargar el detalle y sus catálogos al abrir; no cargar todas las voces y agentes en cada página del dashboard.

## 4. Acciones rápidas por agente

| Capacidad                      | Datos de primera activación                                                                         | Acción posterior                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Recordatorios y confirmaciones | Nombre; calendario(s); número saliente; «24 horas antes», «2 horas antes» o intervalo personalizado | Ver próximas llamadas; activar para una cita; confirmar una cita ahora |
| Recepcionista IA               | Nombre; número(s) entrante(s); destino humano de respaldo; resumen del cambio de ruta               | Probar atención; ver qué números atiende; personalizar saludo          |
| Agendar citas                  | Nombre; calendario; miembro responsable; número saliente                                            | Seleccionar lead y miembro → «Llamar para agendar»                     |

**Recordatorios:** comenzar con un recordatorio 24 horas antes como valor sugerido. Permitir días/horas/minutos y elegir otro intervalo. Un segundo intento o varios offsets se configuran en Personalizar. Mostrar el alcance antes de activar: calendario elegido, desde cuándo y cuántas citas futuras aplican. No marcar citas pasadas para llamar ni recuperar offsets vencidos llamando inmediatamente.

**Recepcionista:** «Atender este número» explica a quién llamaba ese número antes y cuál será su respaldo. Preseleccionar un número solo cuando la elección sea inequívoca. Si el número saliente de recordatorios recibe devoluciones, ofrecer asociarlo a esta recepcionista; un caller ID meramente verificado no garantiza que Ringee pueda recibir llamadas en él.

**Agendamiento:** activar deja el agente disponible; no dispara llamadas por sí solo. Desde contacto, reunión o panel, el usuario ve lead, teléfono, miembro, calendario y estimación disponible; **Llamar para agendar** es la acción que inicia el gasto. Los campos del contexto actual ya llegan seleccionados. La recepcionista también puede derivar solicitudes nuevas de cita al agente de agendamiento activo.

Si ya existe un agente compatible, ofrecer usarlo. Si hay varios, pedir selección una sola vez y guardar la preferencia por organización y contexto de marca/calendario. No imponer un único agente de cada tipo a toda la organización: Ringee ya admite múltiples marcas.

Sin número o saldo, la tarjeta mantiene su configuración y muestra una acción precisa. Google/Microsoft son opcionales: el calendario Ringee puede agendar sin conexión externa, conforme a CAL-001 y AGENT-002.

## 5. Recordatorio, confirmación y correo

1. Una cita elegible identifica reunión, lead y miembro responsable. El miembro que la agendó se propone automáticamente; un administrador puede seleccionar un responsable válido. Si creador humano y responsable son distintos, conservar ambos e incluir también al creador en Para, siempre que siga siendo miembro autorizado. La propiedad no se cambia para simular ese responsable.
2. `MeetingService` solicita a `ReminderService` programar la llamada según la regla del calendario. Guardar el vínculo y la versión de la cita, no solo una fecha en el prompt.
3. Al vencer el recordatorio, el worker reclama un intento y vuelve a comprobar: cita vigente, agente operativo, horario permitido, DNC, número, contacto, saldo y ausencia de ejecución incompatible para esa misma tarea/contacto.
4. Construir contexto del contacto, cita actual, llamada donde se agendó y las tres últimas llamadas relevantes. La llamada de origen se conserva aunque ya no esté entre las tres recientes. Ejecutar a través de `VoiceAgentCallService.startCall`.
5. El agente confirma identidad de forma breve y pregunta explícitamente por la asistencia. Un «sí» ambiguo, buzón o análisis de sentimiento no cuentan como confirmación.
6. Herramienta propuesta `confirm_meeting_attendance`, autenticada y ligada a la sesión, actualiza la asistencia y crea el evento de correo en una misma transacción. El servidor obtiene el `meetingId` del intento autorizado; el modelo no elige libremente una reunión.
7. Un worker entrega **un solo correo**: **Para: lead y miembro seleccionado; CC: administradores actuales de la organización**. Eliminar direcciones repetidas entre To y CC; no enviar un correo distinto a cada uno. Mostrar estos destinatarios en la configuración.
8. La llamada puede decir «Tu asistencia quedó confirmada; enviaremos el correo». Solo decir «correo enviado» cuando el proveedor acepte el envío. El estado de entrega se actualiza por separado.

El mensaje incluye título, fecha, hora con zona horaria, enlace/lugar, miembro y confirmación del lead. No adjunta grabaciones ni resúmenes internos. Reply-To apunta al miembro o buzón organizacional configurado, y todos pueden responder a todos.

«Todos en el mismo hilo» comienza con ese correo compartido; comunicaciones posteriores de la misma cita conservan asunto y referencias. No se promete fusionar automáticamente invitaciones anteriores de Google/Microsoft si Ringee no tiene su Message-ID. La presentación final del hilo depende del cliente de correo.

Si falta el correo del lead, el agente lo solicita y confirma antes de guardarlo. Si no consigue uno válido, registra asistencia confirmada y notificación pendiente con acción «Completar correo»; no marca la comunicación a todos como completada. Si el miembro dejó la organización, pedir reasignación antes de usar su dirección.

Separar `attendanceStatus` —pendiente, confirmada, no asistirá— de `Meeting.status`. No cancelar una reunión por «no puedo asistir» sin autorización explícita. Si pide otra hora, ofrecer transferencia a Agendamiento; la reprogramación debe consultar disponibilidad y mover la reunión original transaccionalmente, sin crear una segunda. Esta capacidad adicional se entrega después del primer circuito de confirmación; inicialmente se registra y deriva la solicitud al miembro.

## 6. Devolución de llamada y traspaso

Ejemplo conversacional, después de una identificación mínima:

> Recepcionista Lucía: «Te llamamos para confirmar tu reunión con Carlos. Te paso con Sofía, que lleva la confirmación».
>
> Sofía: «Hola, Elena. Tu reunión con Carlos es mañana a las tres. ¿Podemos contar contigo?».

La selección del destino se basa en registros, no en una suposición del modelo:

1. Número llamado → organización y ruta entrante verificadas.
2. Número del llamante normalizado → contacto dentro de esa organización y contexto de marca. El número ayuda a buscar; no prueba por sí solo la identidad.
3. Buscar la última tarea pendiente compatible con el número/marca: cita futura, intento sin respuesta, agente de origen, propósito y vigencia. Excluir tareas canceladas, resueltas o vencidas.
4. Si hay varias coincidencias, preguntar por el motivo o la cita. Si el número es compartido, desconocido u oculto, resolver identidad sin revelar información privada de terceros.
5. Autorizar el agente destino, registrar la intención de traspaso y preparar su contexto. Revalidar que está activo, pertenece al workspace y puede atender esa tarea.
6. Anunciar una sola frase; realizar handoff IA; el especialista continúa sin repetir preguntas ya resueltas.

El traspaso devuelve el **proceso pendiente**, con un nuevo identificador de llamada entrante y una relación con el intento original. Pausar posibles reintentos mientras esa continuación está activa; resolverlos definitivamente cuando se confirme o cierre la tarea. Dos llamadas simultáneas no pueden confirmar o reservar dos veces.

Propuesta de contexto: `contact`, `meeting`, `responsibleMember`, `sourceAgent`, `sourceCall`, `pendingTask`, `lastThreeCalls`, idioma, zona horaria, estado de verificación y resumen de la conversación entrante. Cada llamada previa aporta fecha, dirección, resultado, resumen y compromisos; no volcar transcripciones completas. Cuando un resumen aún no exista, usar el estado y motivo guardados; un intento sin respuesta sigue aportando contexto útil.

Propuesta de límites iniciales: máximo dos traspasos IA por llamada, sin volver a un destino ya visitado, y una vigencia de devolución configurable limitada por la fecha/estado de la cita. Ante error o especialista desactivado, la recepcionista retiene la llamada y ofrece atención humana o una solicitud de seguimiento confirmada. No inicia una nueva llamada saliente para fingir una transferencia.

## 7. Investigación técnica y decisión de integración

Telnyx documenta handoff entre asistentes en una misma conversación, preservando contexto. Ofrece modo de voz unificada o distinta. Para esta propuesta se recomienda voz distinta: cada agente conserva identidad y nombre. Esto confirma la capacidad del proveedor, no que el flujo actual de Ringee ya sea compatible. [Documentación oficial de Agent Handoff](https://developers.telnyx.com/docs/inference/ai-assistants/agent-handoff).

Las variables dinámicas permiten suministrar contexto al inicio; la memoria admite consultas de conversaciones. Se propone que Ringee construya el contexto desde sus registros con filtros de organización/contacto/marca. La memoria del proveedor será opcional: por sí sola no contiene llamadas humanas anteriores ni demuestra aislamiento entre clientes. [Variables dinámicas](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables), [Memory](https://developers.telnyx.com/docs/inference/ai-assistants/memory).

La documentación también advierte sobre conflictos al mezclar TeXML y comandos Call Control en llamadas gestionadas por asistentes. Ringee usa caminos distintos para salientes y recepción nativa; por eso el primer paso debe validar el handoff nativo sobre ese flujo exacto. No extrapolar que un comando genérico de transferencia funcionará. [Compatibilidad TeXML / Voice API](https://support.telnyx.com/en/articles/8118086-texml-and-telnyx-voice-api-compatibility).

Resend expone el Message-ID real en consultas y webhooks. Guardarlo permite enviar mensajes siguientes con `In-Reply-To` y `References`; el ID interno de envío no sustituye ese encabezado. [Email threading](https://resend.com/changelog/message-id-for-sent-emails).

La idempotencia del proveedor dura 24 horas. Se necesita además un registro durable local; ante una aceptación incierta se concilia antes de repetir fuera de esa ventana. No prometer entrega exactamente una vez bajo cualquier fallo externo. [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

## 8. Arquitectura y datos propuestos

Conservar la cadena **frontend → API → servicios → repositorios**, con proveedor exclusivamente en `@ringee/platform`.

| Responsabilidad                            | Dueño a extender                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra, tarjetas y miniformulario           | `features/ai-voice-agents`, montado en `app/dashboard/layout.tsx`; primitivas compartidas                                                     |
| API y configuración rápida                 | `useVoiceAgentApi`, `AiVoiceAgentController`, `VoiceAgentService` y repositorio existente                                                     |
| Readiness / capacidades / agente preferido | `VoiceAgentService`; respuesta calculada en servidor                                                                                          |
| Contexto por conversación                  | Responsabilidad dentro de `voice-agents`, coordinada por `VoiceAgentCallService`, con repositorios existentes de llamadas/contactos/reuniones |
| Programación de recordatorios              | `ReminderService`, `ReminderRepository`, schedule Temporal existente                                                                          |
| Confirmación                               | Herramienta de `VoiceAgentToolService` → `MeetingService` → transacción en repositorio                                                        |
| Selección y validación del handoff         | Extender reglas en `VoiceAgentToolService` y routing existente; ejecución a través de `VoiceAgentProviderService`                             |
| Eventos, resultados y costes               | `VoiceAgentResultService`, `VoiceAgentBillingService`, ciclo canónico de llamadas                                                             |
| Correo e hilo                              | Interfaz de email y adapter existentes, entrega durable desde servicios y worker                                                              |

Datos mínimos, con nombres definitivos a cerrar durante implementación:

- **Preferencia de acción rápida:** organización, contexto de marca/calendario, función y agente seleccionado. Upsert con clave estable para que dos pestañas no creen dos agentes por doble clic; no restringe la creación avanzada de múltiples agentes.
- **Regla de recordatorio:** agente, calendario, offsets, zona/ventana, alcance, enabled y versión. No guarda listas arbitrarias de miembros enviadas por el cliente como autorización.
- **Intento de recordatorio:** vínculo con Reminder y reunión, versión de agenda, agente, ejecución, estado, claim/lease, idempotency key y próxima acción. Proponer clave `meeting + scheduleVersion + policy/offset + attempt`. Permite distinguir «llamada lanzada», «sin respuesta» y «asistencia confirmada».
- **Confirmación de asistencia:** estado, fecha, llamada/participación de evidencia y versión de la reunión. Reprogramar invalida confirmación anterior y tareas viejas. Actualizaciones relevantes se serializan con confirmación para evitar confirmar una hora obsoleta.
- **Responsable de reunión:** vínculo explícito con miembro autorizado; conservar creador/propiedad actuales y fallback compatible en citas históricas. Persistir destinatario del lead elegido para esa cita.
- **Participaciones IA y handoffs:** registros hijos de la ejecución existente, con agente, orden, estado, motivo, permisos, identificadores del proveedor y contexto. Conservar `AiVoiceAgentCall` como raíz compatible. No quitar simplemente sus índices únicos ni sobrescribir `agentId` a mitad de llamada.
- **Entrega de correo:** evento, clave única, destinatarios, estado, ID de envío, Message-ID, referencias de hilo, intentos y error. Los outboxes existentes son específicos de CRM/TriggerLoop; no reutilizar sus tablas como si fueran un outbox de correo. Crear persistencia de entrega específica solo tras esa búsqueda, dentro de los repositorios y worker existentes.

La investigación debe determinar si el handoff produce una o varias conversaciones/insights/cuentas de uso. La participación es auditoría, no una nueva unidad de cobro: deduplicar por registro de consumo del proveedor; una tarifa de telefonía por leg real y cada consumo IA una sola vez, siempre por `CreditService`. Mantener los totales y respuestas actuales y añadir la lista de participantes sin cambiar el significado de `agentId` histórico.

Agregar capacidad neutral de handoff y eventos normalizados al adapter; no filtrar IDs ni tipos Telnyx al cliente. Los destinos habilitados se fijan por llamada, dentro del workspace. Herramientas del especialista solo aceptan la participación activa autorizada; las del agente saliente dejan de poder modificar estado después del traspaso. Un prompt no es una autorización.

El adapter de correo actual ignora el `replyTo` recibido en favor de un valor fijo y no ofrece threading/idempotency. Corregirlo para respetar la configuración y devolver éxito/error de forma explícita, con una extensión aditiva de opciones que conserve consumidores existentes. No copiar el envío best-effort de soporte para una confirmación que exige entrega durable.

## 9. Durabilidad, pausa y permisos

**Ejecución:** los recordatorios actuales son best-effort y no tienen el claim requerido para llamadas. Extender el dueño existente con ejecuciones por canal y reclamación atómica antes de habilitar voz; no basta añadir `"voice"` a `channels`. Una caída del worker debe poder recuperar el trabajo sin volver a marcar cuando el proveedor ya creó el leg. Persistir correlación antes de llamar, usar idempotencia del proveedor cuando exista y conciliar respuestas inciertas. Nunca reintentar un dial a ciegas.

**Cambios de cita:** cancelar, cambiar fecha, cambiar responsable o pausar la política invalida ejecuciones pendientes correspondientes. Comprobar versión inmediatamente antes de la llamada y otra vez al confirmar. Una tarea vencida tras una caída no dispara una llamada fuera de ventana; se registra como omitida. Usar UTC persistido e IANA para presentación/horarios, probando cambios de horario estacional.

**Apagar recordatorios/agendamiento:** detener nuevos intentos automáticos y nuevos handoffs; las conversaciones ya activas terminan normalmente y liquidan sus costes. Reanudar solo programa offsets futuros válidos. Mostrar «Pausado · una llamada en curso» si aplica.

**Apagar recepcionista:** hoy se rechaza desactivar una asignada a números. Mantener esa protección; el flujo rápido primero restaura el destino previo o un respaldo explícito mediante `InboundRouteService` y después desactiva. Persistir versión de ruta y usar compare-and-set para no pisar cambios hechos por otro administrador. Si restaurar falla, conservar la atención actual y explicar el error. Reencender vuelve a validar el destino y la asignación.

**Permisos propuestos:** configuración de automatizaciones organizacionales, destinos y CC automático de administradores solo para administradores, validado en servidor. Miembros pueden ejecutar acciones sobre contactos/citas a los que ya tienen acceso con agentes habilitados. Es política propuesta para las superficies nuevas; no describe un control de admin existente en todo el módulo ni recorta silenciosamente contratos actuales. Mantener AGENT-011: organizaciones únicamente.

Contexto y tareas se derivan de identidad autenticada o de un callback con prueba válida y vínculo a la llamada; siempre `createOwnershipContext`/`buildOwnershipFilter`. Proteger también cachés por workspace, contacto y contexto. No compartir historial de otra marca por coincidir un teléfono. Los resúmenes son datos, nunca instrucciones que conceden herramientas o acceso.

## 10. Reglas y compatibilidad

**Cambio deliberado de AGENT-016:** mantener que solo la recepcionista puede ser destino directo de un número y que nunca llama hacia fuera; añadir que recordatorios/agendamiento pueden tomar una llamada ya atendida mediante handoff interno autorizado. Darles modo conversacional de continuación, con saludo entrante apropiado, sin convertirlos en recepcionistas generales. Actualizar la regla, blueprints, validadores, documentación y pruebas juntos.

**Extensión de AGENT-006:** una confirmación persistida por herramienta también prevalece sobre el análisis tardío. El resultado de recepcionista no puede borrar el del especialista, ni terminar el leg al acabar solo una participación. Actualizar el manejo de `call.conversation.ended` y su protección contra hangup prematuro.

Preservar AGENT-001/002/003/004/007/008/011, CAL-001/002 y BILL-020. No cambiar el calendario de una reserva durante el traspaso ni recalcular cargos ya liquidados. Las ventanas de llamadas y DNC siguen aplicando. Probar también toma de control humana y liquidación posterior a una pausa.

Cambios aditivos en DTO, Prisma, eventos y REST. Revisar web, extensión, Dialer SDK, CLI, Attio, HubSpot, ChatGPT app, MCP y Custom Integration webhooks. Versionar/añadir eventos de asistencia y handoff sin renombrar los existentes. No redefinir `meeting_booked` como confirmación de asistencia.

## 11. Secuencia de implementación

| Entrega                    | Resultado concreto                                                                                                     | Condición de salida                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 0. Prueba técnica acotada  | Recepcionista → especialista sobre el flujo entrante actual, contexto, identidad de tools, eventos y cargos observados | Probar handoff sin corte, sin fuga de contexto y sin doble facturación; cerrar contrato del adapter |
| 1. Activación rápida       | Barra, readiness, configuración mínima, agente existente/preferido, Personalizar, Probar y pausa segura de rutas       | Primer agente utilizable sin entrar al editor avanzado; ningún doble alta por reintento             |
| 2. Recordatorios completos | Política por calendario, intentos durables, contexto, confirmación explícita y correo compartido                       | Cita → llamada → confirmación → un envío a todos; reprogramar/cancelar no deja llamadas obsoletas   |
| 3. Devolución y handoff    | Correlación con tarea pendiente, tres llamadas previas, continuidad y fallback                                         | Caso sin respuesta → devolución → especialista → confirmación end-to-end                            |
| 4. Agendamiento conectado  | Acción por lead/miembro y traspaso desde recepcionista; usar reservas existentes                                       | Disponibilidad real, una sola cita y destinatarios correctos                                        |
| 5. Mejora posterior        | Reprogramación por voz, varios offsets, políticas por equipo y presupuestos configurables                              | Medir adopción y resolver casos del piloto antes de ampliar                                         |

La entrega 0 precede al modelo definitivo de participaciones; la 1 puede diseñarse mientras se valida. Publicar bajo feature flag por organización y activar el circuito completo en un piloto antes de presentarlo como disponible para todos. No exponer un interruptor que prometa una automatización aún incompleta.

No fijar una fecha de entrega hasta cerrar la prueba del proveedor y la migración de participantes. Para las migraciones, confirmar la carpeta válida antes de implementarlas: el repositorio tiene dos directorios pending y no se debe inventar el procedimiento.

## 12. Verificación y éxito

Criterios de aceptación del piloto:

- Con número, empresa y calendario listos: configurar nombre y activar en una sola pantalla; objetivo de producto de menos de un minuto, a medir, no promesa.
- Primera acción útil accesible desde una tarjeta o contacto. Encender Agendamiento no llama a todos los leads.
- Recordatorio a 24 h, 2 h o intervalo propio ejecutado solo dentro de ventana; ausencia de respuesta no confirma la reunión.
- Lead devuelve llamada: identificación breve, motivo correcto, mismo especialista activo y tres llamadas previas correctas, sin repetir información innecesaria.
- Correo único con lead y miembro en To, administradores en CC, Reply-To correcto y respuestas verificadas en Gmail/Outlook; sin duplicados al repetir eventos.
- Cita reprogramada durante llamada: no confirmar la fecha vieja. Cita cancelada antes del dial: no llamar. Confirmación repetida: mismo resultado sin segundo correo.
- Caída antes/después de crear el leg, reinicio Temporal, handoff fallido, saldo insuficiente, número retirado, contexto incompleto y email rebotado: estado recuperable y acción clara.
- Mismo teléfono en dos organizaciones/marcas, sesión falsificada, agente desactivado, miembro eliminado y cambio de ruta concurrente: nunca cruza permisos ni deja un número sin ruta deliberada.
- Una llamada física puede contener varias participaciones IA sin duplicar Call, cobros o eventos. Un fin de participación no cuelga al siguiente agente.
- UI en escritorio/móvil, teclado, modo oscuro/claro, carga/error/vacío, y coexistencia con el dialer sin interrumpir una llamada humana.

Métricas: tiempo a activación y a primera acción útil; porcentaje de altas que producen una llamada real; confirmaciones explícitas / conversaciones de recordatorio; devoluciones resueltas; éxito y latencia del handoff; correos aceptados/entregados/rebotados; duplicados de llamada/cita/cargo; abandonos en configuración. Latencia de handoff p95 inferior a dos segundos como objetivo inicial a validar, sin audio superpuesto ni silencio indefinido.

Validación durante implementación: lint de paths cambiados y `pnpm format:check`; tests de servicios/plataforma con sus scripts existentes; `pnpm prisma:generate` y `pnpm build:database` cuando cambie schema; `pnpm build:backend`, `pnpm build:orchestrator` y `pnpm build:frontend` para sus entregas. Revisar scripts de cada consumidor antes de ampliar los checks de contratos. Este documento no acredita la ejecución de esas pruebas.

## 13. Referencias locales para comenzar

- `docs/engineering/CANONICAL_IMPLEMENTATIONS.md`, `BUSINESS_RULES.md`, `TELEPHONY.md`, `BILLING.md`.
- `apps/frontend/src/app/dashboard/layout.tsx` y `features/calls/components/dialer.shortcut.view.tsx`.
- `apps/frontend/src/features/ai-voice-agents/{api.ts,types.ts,components/agent-screen.tsx,hooks/use-agent-draft.ts}`.
- `packages/services/src/services/voice-agents/{voice-agent.service.ts,voice-agent-call.service.ts,voice-agent-tool.service.ts,voice-agent-result.service.ts,voice-agent-billing.service.ts,blueprints/}`.
- `packages/services/src/services/{meeting.service.ts,calendar.service.ts,reminders/reminder.service.ts,outbound/callback.service.ts,inbound-routing/}`.
- `packages/platform/src/voice-agents/{interfaces/voice-agent.provider.ts,telnyx/telnyx.voice-agent.mapper.ts}` y `packages/platform/src/email/`.
- `packages/database/prisma/schema.prisma`, repositorios de agentes, llamadas, reuniones y recordatorios; `apps/orchestrator/src/temporal/`.

## 14. Estado de implementación (13 de octubre de 2026)

Alcance acordado: entregas 1, 2 y 4 sin traspaso IA. El handoff (entrega 3 y su parte en la 4) espera a la entrega 0: la documentación de Telnyx no aclara qué reciben las herramientas webhook del asistente destino, si cambia el `conversation_id`, cómo llegan los insights ni cómo se cobra tras el traspaso.

**Implementado**

| Pieza                                                                                                    | Dónde                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Flag piloto por organización (`*` para todas)                                                            | `AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS`, `voiceAgentAutomationsEnabled`                      |
| Barra, tarjetas, mini-formularios, actividad, «Completar correo»                                         | `apps/frontend/src/features/ai-voice-agents/automations/`                                 |
| Estado y siguiente paso calculados en servidor; alta única por capacidad (claim)                         | `VoiceAgentAutomationService`, `AiVoiceAgentAutomation`                                   |
| Personalizar / Probar con regreso a la página y al panel                                                 | `?returnTo=` en `AgentDetail` + borradores en el store de la barra                        |
| Pausa de la recepcionista: devuelve cada número a su destino anterior o al respaldo, con compare-and-set | `InboundRoute.version` / `restoreDestination*`, `InboundRouteService.releaseReceptionist` |
| Regla por calendario, ventana horaria, ejecuciones durables con claim, lease y clave de marcado          | `MeetingReminderPolicy`, `MeetingReminderExecution`, `MeetingReminderCallService`         |
| Confirmación explícita por herramienta, versión de agenda y correo en una transacción                    | `confirm_meeting_attendance`, `MeetingRepository.recordAttendance`                        |
| Correo único (Para lead + miembro, CC administradores, Reply-To miembro, hilo, idempotencia)             | `MeetingEmailService`, `MeetingEmailDelivery`, `EmailInterface.send`                      |
| Contexto de las tres últimas llamadas + la de origen                                                     | `VoiceAgentConversationContextService`                                                    |
| «Llamar para agendar» con miembro responsable                                                            | Barra, detalle de contacto; `Meeting.responsibleUserId`                                   |
| Asistencia y «Llamar para confirmar ahora» en el detalle de la reunión                                   | `MeetingAttendance`                                                                       |
| Worker                                                                                                   | tick existente `ringee.reminder-scheduler` (sin schedule nuevo)                           |
| Reglas                                                                                                   | `CAL-003`, `AGENT-006` (ampliada), `AGENT-017` a `AGENT-020`; deuda `DEBT-021`            |

**Decisiones tomadas durante la implementación**

- Una llamada que caería fuera de la ventana se adelanta a media hora antes del cierre (nunca antes de la apertura), para que un tick tardío, un reintento o un aplazamiento sigan cayendo dentro; nunca se retrasa. Ventana por defecto 09:00–20:00 en la zona del calendario.
- Si el lead ya respondió para esa versión de la cita, no se planifican más recordatorios.
- La llamada automática se coloca como el administrador que activó la regla; la manual, como quien la pide.
- La respuesta «no asistirá» notifica al miembro (y al creador) con los administradores en CC, no al lead; no cancela la reunión.
- El `sendEmail` heredado no cambia: varios consumidores pasan otras direcciones en la posición de `replyTo`. El correo de confirmación usa el nuevo `send` explícito (`DEBT-021`).
- Migración `20261013120000_voice_agent_automations`, en `prisma/migrations/` y `prisma/migrations-pending/`; aplicada en la base local tras un dry-run.

**Verificado**

- Tests: `@ringee/services` 1271/1271 y `@ringee/platform` 347/347, con specs nuevos del worker, la herramienta, el correo, la barra, la planificación y la pausa de rutas.
- Typecheck de database, platform, services, backend, orchestrator y frontend; ESLint sin errores en lo tocado.
- Contenedor de Nest del orchestrator resuelto en ejecución.
- SQL nuevo contra Postgres real en una base desechable: planificación idempotente, claim con lease y reclamo, transacción de asistencia sin segundo correo y con versión obsoleta, compare-and-set de rutas.
- Revisión visual (español e inglés, claro/oscuro, escritorio acoplado, superpuesto y móvil) con API simulada.

**Pendiente**

1. Entrega 0: prueba real del handoff recepcionista → especialista; después, entrega 3 y el traspaso a agendamiento.
2. Piloto: activar el flag para una organización y recorrer cita → llamada → confirmación → correo con llamadas reales; verificar el hilo en Gmail y Outlook.
3. Entrega 5: varios offsets, reintentos tras «sin respuesta», ventanas por equipo y reprogramación por voz. El modelo de datos ya admite varios offsets y ventanas.
4. Eventos de Custom Integrations para la asistencia (aditivos).
