# Stage 4 — Activación nativa de Organization y medición con PostHog

Propuesta de implementación · 7 de noviembre de 2026

Complementa [el plan de seguimiento completo](PLAN_ORGANIZATION_AI_FOLLOWUP.md).
La etapa solicitada corresponde a aprovisionamiento, onboarding, preferencias y
despliegue gradual. El objetivo sigue siendo que el equipo prospecte y que IA
ejecute el seguimiento cotidiano hasta resolverlo o cerrarlo con evidencia.

## 1. Resultado para el cliente

Una organización nueva que contrata el plan recibe **Seguimiento automático**
preparado con Recordatorios y confirmaciones y Agendar citas. Al abrir el workspace,
su administrador ve los datos precargados y completa únicamente lo que falta.
Después, el vendedor registra su resultado de llamada y continúa prospectando.

Texto propuesto en la presentación del plan y el onboarding:

> Tu equipo encuentra oportunidades. Ringee devuelve llamadas, agenda, confirma
> y reagenda. Los tokens y minutos se cobran por consumo.

Una pantalla muestra empresa, número, calendario, responsable, zona y horario,
con las funciones habilitadas por defecto y la confirmación a cuatro horas. La
acción principal es **Continuar** cuando están completos los requisitos. El
administrador conserva Personalizar, pausa por capacidad y controles por caso.

Para organizaciones existentes, presentar **Activar seguimiento automático** con
una vista previa de su alcance y próxima acción. La aceptación conserva los agentes,
textos, horarios, exclusiones y tareas ya configurados. Una renovación consulta las
preferencias guardadas y respeta las capacidades que el administrador haya apagado.

## 2. Punto de partida comprobado

- `SubscriptionService.createFromStripe` registra la suscripción. Clerk crea la
  organización y `assignToOrganization` intenta asociarle una suscripción pendiente.
  El aprovisionamiento debe reconciliar ambas partes y recuperar el orden inverso.
- `VoiceAgentAutomationService` posee setup, selección/reutilización de agentes,
  configuración `humanFollowUp.enabled` y autorización administrativa, además de
  readiness de las tarjetas. Los claims del repositorio protegen el alta concurrente.
- El formulario de recordatorios todavía propone 24 horas. La etapa 4 establece
  240 minutos para nuevos defaults y conserva offsets personalizados existentes.
- El acceso piloto depende de `AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS`. Preparación,
  elegibilidad, preferencias y estado efectivo deben seguir calculándose en backend.
- La copia revisada documenta Stage 2 y pruebas locales. La prueba del flujo real
  de Stage 3, proveedor, audio y liquidación es un requisito de salida del piloto.
  Confirmar la rama y las migraciones que contienen esas entregas antes de ampliarlo.
- Hay analítica cliente mediante `useAnalytics`, gtag y Ahrefs. La búsqueda de código
  revisada no encontró una integración PostHog. Extender el dueño de analítica
  existente y centralizar su envío para evitar capturas duplicadas.

## 3. Aprovisionamiento y preferencias

Extender el dueño de automatizaciones con una operación idempotente de preparación
nativa por organización y versión de configuración. Stripe, Clerk y la reparación
de un alta incompleta solicitan la misma reconciliación. Los controllers autentican
y delegan. Las operaciones del proveedor se ejecutan mediante los adapters actuales.

El proceso comprueba la suscripción aplicable y su asociación al workspace,
prepara ambos especialistas con los claims existentes, crea o reutiliza el calendario
global y guarda la configuración propuesta. El dato `isFirstEver` del comprador
sirve al aviso de bienvenida actual. La clave de aprovisionamiento pertenece a la
organización y la versión, con recuperación de un paso interrumpido.

Asociar la compra a la organización prevista mediante la intención de checkout y
sus registros autorizados. Si el comprador administra varias organizaciones,
conservar esa selección o pedirla en el onboarding. La pestaña activa del navegador
o la primera organización encontrada no deciden qué workspace recibe la suscripción.

Persistir al menos versión/origen de preparación, progreso, decisión administrativa,
fecha efectiva de adopción, capacidades excluidas y siguiente requisito pendiente.
La decisión de apagar o eliminar un trigger sobrevive a la eliminación de su fila.
El reconciliador puede reparar preparación incompleta sin recrear un opt-out.

La habilitación de entrega desde llamadas humanas se guarda mediante la política
actual `humanFollowUp.enabled`, con identidad y rol administrativos comprobados.
La pantalla habitual de onboarding adopta sus defaults y registra quién lo hizo.
El comprador, el creador de la organización y el administrador vigente pueden ser
personas distintas. La compra por sí sola no aporta una autorización administrativa
verificada para rellenar `authorizedByUserId`.

Reglas de elección de datos:

| Dato                           | Default y comportamiento                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Empresa                        | Perfil existente y nombre real del workspace, editable                                                                                 |
| Número saliente                | Asignación válida existente o único número utilizable. Varios candidatos requieren selección                                           |
| Calendario                     | Global autorizado, con disponibilidad existente y responsable explícito                                                                |
| Zona/horario                   | Valores del calendario y las reglas existentes, visibles antes de activar                                                              |
| Idioma/voz                     | Configuración compatible de los especialistas y contexto efectivo de conversación                                                      |
| Recordatorio                   | 240 minutos para el nuevo default. Conservar personalizaciones                                                                         |
| Entrega desde llamadas humanas | Habilitada en los defaults que adopta el administrador. Objetivo de «Interesado» visible y editable, con agenda como propuesta inicial |
| Calendarios futuros            | Incorporarlos según el alcance adoptado si su marca, número y responsable son compatibles                                              |
| Devolución de llamadas         | Mostrar destino entrante efectivo y configurar continuidad mediante routing existente                                                  |

Los números con rutas humanas mantienen esa elección hasta que el administrador
adopte otra. Una ruta incompatible o un dato de marca faltante aparece como
requisito concreto. Los workers despachan únicamente los trabajos que tengan
requisitos completos y autorización vigente.

La suscripción efectiva determina la preparación nativa y la admisión de trabajo
nuevo. Una cancelación a fin de período conserva la vigencia pagada. El mapeo de
estados de impago y cualquier período de gracia se toma de la política de billing
documentada. Al terminar la vigencia, conservar historial, consumo y preferencias,
y detener la admisión automática según esa política. Las capacidades históricas
de agentes se migran conforme a sus contratos actuales.

## 4. Onboarding y uso cotidiano

| Momento                       | Experiencia                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Regreso de checkout           | «Estamos preparando tu seguimiento» con progreso y recuperación en segundo plano                              |
| Datos completos               | Resumen breve de número, calendario, horarios y funciones. Una acción para continuar                          |
| Dato faltante                 | «Elige el número desde el que llamará la IA», «Configura devolución de llamadas» u otra acción específica     |
| Primera llamada fría elegible | Resultado guardado, objetivo aceptado y próximo paso de IA visibles en el cierre habitual                     |
| Primera resolución real       | Confirmación discreta con enlace al historial del contacto y al resultado                                     |
| Supervisión                   | Vistas actuales de seguimiento, resultados y excepciones con permisos del responsable                         |
| Pausa                         | Cantidad y próximos compromisos afectados visibles. Reanudación conserva límites y recalcula horarios válidos |

Estados de preparación visibles **Preparando**, **Necesita configuración**, **Listo**,
**Pausado** y **Detenido por una causa concreta**. La API devuelve estado, razón y
próxima acción. El frontend presenta datos de servidor y mantiene la llamada en
curso al abrir o cerrar el panel. Reutilizar componentes, traducciones y foco de Ringee.

El vendedor recibe el trabajo excepcional que le corresponda. Saldo, número y
credenciales se dirigen al administrador apropiado. Los errores recuperables siguen
en el flujo automático. Un contacto que devuelve una llamada continúa mediante el
recorrido autorizado configurado para ese número.

## 5. PostHog y el crédito disponible

Usar los **50.000 USD de crédito indicados por el usuario** para aprender qué
organizaciones activan, dónde abandonan y qué resultados obtienen. La oferta pública
actual dura 12 meses. Confirmar inicio, vencimiento y cobertura del grant aplicado
a la cuenta antes de fijar su presupuesto. Algunas herramientas de IA de PostHog
quedan excluidas, mientras AI Observability sí figura como cubierta. [Programa oficial](https://posthog.com/startups).

Prioridades propuestas:

| Producto                            | Aplicación en esta etapa                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Product Analytics + Group Analytics | Funnel y retención por organización, adopción por miembros y resultados por cohorte                       |
| Feature Flags                       | Selección estable de cohortes y variantes de onboarding, evaluadas con contexto de organización           |
| Error Tracking                      | Errores de preparación/onboarding correlacionados con versión y causa normalizada                         |
| Session Replay                      | Diagnóstico del onboarding sobre una muestra inicial propuesta del 20% de sesiones elegibles              |
| Surveys                             | Encuesta breve sobre claridad y esfuerzo después de observar resultados reales                            |
| AI Observability                    | Segunda ampliación para operaciones instrumentables en Ringee, con metadatos mínimos y consumo disponible |

Group Analytics permite medir y seleccionar empresas como grupo. Es un add-on
pagado y su facturación alcanza los eventos identificados del proyecto, incluso
aquellos sin grupo. Incluir ese volumen en la previsión. [Documentación de grupos](https://posthog.com/docs/product-analytics/group-analytics).

Revisar semanalmente consumo y proyección por producto, con un límite mensual
inicial aprobado al configurar la cuenta. Presupuestar con eventos/objetivo,
organizaciones activas y sesiones elegibles. Ajustar la muestra de replay al volumen
observado. Los límites de PostHog pueden detener ingestión, por lo que las métricas
operativas y la ejecución deben tolerar períodos sin telemetría. [Límites y alertas](https://posthog.com/docs/billing/limits-alerts).

## 6. Identidad y contrato de eventos

Usar una identidad de producto consistente para el mismo usuario en cliente y
servidor y un grupo **organization** con ID interno estable del workspace. El
contexto de grupo se incluye en cada evento, también después de cambiar de
organización. El logout y cambio de cuenta limpian la identidad cliente apropiada.
Los eventos de trabajo automático llevan actor de sistema y se excluyen de las
métricas de actividad humana. Los contactos telefónicos permanecen como entidades
de Ringee.

Propiedades mínimas propuestas **schema_version**, **event_id**, **occurred_at**,
**organization_id**, **actor_type**, **environment**, **release_version** y
**rollout_cohort**. Agregar tipo de objetivo, capacidad, resultado, causa normalizada,
intentos y latencia cuando correspondan. Correlacionar objetivos con un identificador
opaco dedicado. Los eventos de consumo incluyen importe/unidad y estado de
liquidación, conservando la distinción entre desconocido y cero.

| Evento propuesto                  | Fuente y momento                                            |
| --------------------------------- | ----------------------------------------------------------- |
| `organization_plan_activated`     | Backend tras comprobar suscripción y organización asociadas |
| `followup_onboarding_viewed`      | Cliente al mostrar la pantalla, con versión                 |
| `followup_configuration_saved`    | Backend tras aceptar la configuración administrativa        |
| `followup_provisioning_started`   | Transición persistida de preparación                        |
| `followup_provisioning_completed` | Backend al completar los recursos de esa versión            |
| `followup_readiness_changed`      | Cambio real de requisitos/estado efectivo                   |
| `followup_enrollment_authorized`  | Adopción persistida de la política desde llamadas humanas   |
| `followup_objective_started`      | Objetivo guardado con fuente y próxima acción               |
| `followup_objective_resolved`     | Evidencia autorizada de resultado de negocio                |
| `followup_objective_closed`       | Cierre con su motivo, separado de resolución exitosa        |
| `followup_exception_changed`      | Apertura/resolución de una excepción accionable             |
| `followup_control_applied`        | Pausa, reanudación o toma de control aceptada               |
| `followup_charge_settled`         | Débito confirmado, correlacionado con llamada/objetivo      |
| `followup_receipt_status_changed` | Cambio persistido de entrega de comprobante                 |

Los eventos de resultado se originan en servicios y registros autoritativos de
Ringee. La telemetría cliente registra interacción, visitas y exposición de UX.
Cada nombre tiene un dueño de captura para que un clic y su respuesta no cuenten
dos éxitos.

Exportar en lotes desde evidencia durable y transiciones persistidas, con cursor,
reintentos y control de entrega. Preservar ID, fecha original, actor y contenido
del evento al reintentar. El adapter se incorpora en `@ringee/platform`, mediante
DI y configuración, y se utiliza desde backend/orchestrator. La búsqueda de dueños
precede a cualquier nuevo mecanismo de exportación. La entrega de analítica queda
fuera de las transacciones y del tiempo crítico de las llamadas.
Si el adapter añade una dependencia de runtime compartida, declararla también en
backend y orchestrator conforme a `packages/services/AGENTS.md` y comprobar su
resolución desde los builds.

PostHog deduplica eventualmente según UUID, evento, timestamp y distinct ID.
Validar el contrato del SDK elegido y mantener esa identidad en el exportador.
El conteo por ID estable y la conciliación contra Ringee cubren reintentos e ingestión
tardía. [Modelo y deduplicación de eventos](https://posthog.com/docs/data/events).

## 7. Datos y replays

El contrato externo admite metadatos acotados, códigos de resultado y métricas.
Teléfonos, correos de contactos, nombres, notas libres, transcripciones, grabaciones,
tokens, credenciales y URLs con identificadores sensibles quedan fuera de captura.
Sanitizar también rutas, query strings, atributos del DOM y mensajes de error.

Replay se limita inicialmente a las pantallas de onboarding/configuración aprobadas,
con texto y entradas enmascarados y contenido seguro permitido explícitamente.
Excluir superficies de contactos, grabaciones, transcripciones y conversación.
Mantener captura de cuerpos de red, audio, canvas y consola fuera de esta
instrumentación inicial. Así la muestra permite detectar pasos abandonados y
errores de navegación con la información necesaria para esa pregunta. [Privacidad de replay](https://posthog.com/docs/session-replay/privacy).

El equipo puede aprovechar AI Observability cuando el adapter o proceso de Ringee
exponga la operación y su consumo. El motor de voz del proveedor exige sus propias
evidencias para explicar la conversación y facturación. Registrar únicamente las
etapas observables, con el mismo criterio de datos mínimos.

## 8. Flags y funcionamiento ante fallos

Extender un único dueño backend del estado efectivo. Combinar elegibilidad de
suscripción, control de despliegue, decisión administrativa, requisitos y versión
de preparación. PostHog puede seleccionar una cohorte de lanzamiento por organización
y variantes de UX. Guardar la admisión/variante relevante con la organización para
que todos sus miembros y los workers reciban una decisión estable.

Nombres propuestos **native_followup_rollout_v1** para selección backend y
**followup_onboarding_v1** para la variante de experiencia. El estado efectivo que
usa la UI se obtiene del backend. La evaluación se realiza por organización.

Durante el piloto, la allowlist existente sigue siendo el techo de despliegue.
La elección de PostHog se evalúa en servidor al admitir el workspace o trabajo
nuevo y atraviesa los permisos y límites actuales de Ringee. Una preferencia de
pausa del administrador siempre prevalece sobre una selección de cohorte.

Si PostHog está inaccesible, diferir nuevas admisiones que no tengan una decisión
válida almacenada. El trabajo previamente autorizado sigue sus políticas persistidas
y los gates de Ringee. Un control operativo del backend puede retirar nuevos
despachos. Una pausa mantiene trazabilidad, compromisos y resultados de lo que ya
fue despachado. Los costos incurridos se liquidan y los comprobantes ya debidos por
resultados vigentes conservan su entrega.

Esta separación requiere revisar el gate actual que detiene correos al retirar
una organización del flag piloto. Actualizar AGENT-018/020 y sus pruebas al
implementar el comportamiento adoptado.

## 9. Dashboards y decisiones

| Vista              | Pregunta y definición inicial                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Activación         | Organizaciones con plan vigente → configuración adoptada → listas → primer objetivo → primera resolución en 7 días       |
| Tiempo hasta valor | Mediana y percentil 90 desde adopción hasta primer resultado real, mostrando los casos aún abiertos                      |
| Autonomía          | Objetivos resueltos sin intervención / elegibles iniciados por cohorte, con pendientes y cierres sin éxito visibles      |
| Operación          | Bloqueos, antigüedad, callbacks vencidos, recuperaciones, fallos por etapa y entregas de correo                          |
| Economía           | Consumo liquidado por objetivo resuelto y gasto por organización, con costos pendientes identificados                    |
| Retención          | Organizaciones elegibles que repiten uso semanal y obtienen nuevos resultados, separadas de actividad humana en pantalla |

PostHog presenta análisis internos por cohortes. El dashboard operativo del cliente
usa las consultas autorizadas de Ringee y enlaza evidencia de sus casos. Conciliar
diariamente los agregados analíticos con objetivos y ledger. Declarar períodos con
ingestión incompleta para interpretar correctamente las tasas.

Los primeros experimentos comparan claridad del texto, orden de campos y explicación
del próximo paso. Distribuir por organización y guardar versión/exposición. Hacerlos
después de estabilizar el flujo y contar con volumen suficiente. El número saliente,
los permisos y las decisiones del contacto se rigen por su configuración operativa.

Propuesta de encuesta de dos preguntas tras la primera semana de uso o varios
resultados reales. Preguntar si quedó claro qué haría la IA y si el equipo tuvo que
intervenir en tareas rutinarias. Evitar interrumpir una llamada activa.

## 10. Entregas y salida del piloto

| Entrega                 | Trabajo verificable                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| 4A — Medición mínima    | Configurar PostHog, identidad/grupos, contrato de eventos, datos protegidos y dashboards de activación |
| 4B — Preparación nativa | Reconciliar Stripe/Clerk, claims, preferencias durables, defaults y política humana autorizada         |
| 4C — Onboarding         | Pantalla única, requisitos claros, preview para existentes, pausa y estados efectivos                  |
| 4D — Piloto             | Validación real del flujo completo, telemetría conciliada y revisión de costo/experiencia              |
| 4E — Ampliación         | Cohortes estables por organización con seguimiento de resultados y límites operativos                  |

Comenzar con organizaciones internas y contactos de prueba, continuar con un grupo
pequeño de clientes que adopten la función y ampliar por cohortes observadas. Una
secuencia propuesta después del piloto es 10%, 25%, 50% y 100% de organizaciones
elegibles nuevas. Las existentes mantienen adopción explícita. El avance requiere
un período que cubra el ciclo real de citas y suficiente volumen para interpretar
sus resultados, además de cerrar las incidencias del grupo anterior.

Criterios de aceptación:

- Stripe/Clerk repetidos o en orden inverso producen una preparación por workspace.
- Una preparación interrumpida se recupera y conserva las elecciones del administrador.
- Renovar o reconectar respeta pausa, eliminación de trigger y personalización.
- Los nuevos defaults usan 240 minutos y los agentes operan con número, marca,
  calendario y responsable válidos.
- La política desde llamadas humanas conserva autorización administrativa verificable.
- El piloto comprueba llamada fría → entrega a IA → reserva → recordatorio →
  confirmación/reagenda/cancelación → notas → correo → consumo. Incluye callback
  posterior a la cita original, devolución entrante y fallo de traspaso.
- Pausa, revocación y fin de vigencia llegan a workers y nuevos despachos.
  Resultados y cargos ya incurridos siguen recuperables.
- PostHog caído o limitado deja los flujos autorizados en un estado operativo definido.
- Usuarios que cambian de workspace conservan el grupo correcto por evento.
- Eventos duplicados y entregas tardías se reconcilian con los hechos de Ringee.
- Los replays y payloads de muestra cumplen el contrato de datos protegido.

La salida exige revisar duplicación de llamadas, reservas y débitos contra evidencia
real, además de resultados y tiempos de preparación. Los objetivos de conversión
se fijan con la línea base del piloto. Tests y métricas de clics por sí solos no
prueban continuidad de audio, interoperabilidad ni exactitud de liquidación.

## 11. Pendientes de configuración y decisiones adoptadas

Confirmar proyecto/región PostHog, grant aplicado y vencimiento, productos incluidos,
presupuestos, responsables de dashboards y organizaciones/contactos del piloto.
Estas decisiones pueden cerrarse durante la implementación sin cambiar las tarifas
de consumo de Ringee.

Las propuestas iniciales de muestra del 20%, ventana de activación de siete días,
secuencia de cohortes y encuesta semanal son decisiones de diseño de este plan.
Se ajustan con la evidencia del piloto. Este trabajo preparó documentación y no
instaló SDKs, cambió flags, aprovisionó proveedores ni publicó datos de clientes.
