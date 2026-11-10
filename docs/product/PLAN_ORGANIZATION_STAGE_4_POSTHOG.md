# Stage 4 — Activación nativa para freelancers y organizaciones con PostHog

Propuesta de implementación · 7 de noviembre de 2026

Complementa [el plan de seguimiento completo](PLAN_ORGANIZATION_AI_FOLLOWUP.md).
El nombre del archivo se conserva para mantener los enlaces existentes. Esta
revisión incorpora la decisión del usuario: **mismas capacidades de AI Voice Agents
y mismo onboarding para freelancers y organizaciones**. La entrega 4A (alcance
personal detrás de un piloto explícito) está implementada; ver §13. PostHog (4B) y
la preparación nativa con onboarding común (4C) siguen pendientes.

La meta es que las personas prospecten y capten clientes, mientras la IA ejecuta
el seguimiento cotidiano hasta resolverlo o cerrarlo con evidencia. La etapa 4
debe convertir esa capacidad en una experiencia fácil de adoptar, financiar y
usar de nuevo, con aprendizaje medible desde el primer piloto.

## 1. Decisiones de producto

- **Paridad funcional:** Recordatorios y confirmaciones y Agendar citas, con
  seguimiento, contexto, idioma, handoff, callbacks, agenda, reagenda, cancelación
  autorizada, notas, correos y medición, en ambos tipos de workspace.
- **Un onboarding:** mismas preguntas, defaults, controles y promesa de valor.
  En personal, el propietario es el responsable; en organización, se usan los
  roles y responsables existentes. Los datos disponibles se precargan.
- **Cobro vigente:** tokens y minutos consumidos, con los créditos del workspace
  que realiza el trabajo. Esta entrega no crea tarifas, bolsas ni créditos gratis.
- **Disponibilidad personal:** el freelancer accede desde su workspace personal
  sin contratar Organization. El plan Organization conserva su contexto de
  colaboración, administración, miembros y recursos compartidos.
- **Defaults:** ambos especialistas preparados y habilitados en la configuración
  propuesta, con confirmación a 240 minutos. La adopción habitual del onboarding
  autoriza el alcance; solo se despacha con requisitos y saldo válidos.
- **Control:** editar agentes, apagar capacidades, pausar casos y tomar control.
  Los workspaces existentes adoptan explícitamente el nuevo comportamiento;
  conservar personalizaciones, exclusiones y trabajos humanos anteriores.

Texto propuesto para ambos segmentos:

> Tú consigues oportunidades. Ringee devuelve llamadas, agenda, confirma y
> reagenda. Los tokens y minutos se cobran por consumo.

La diferencia de organización se explica donde ayude a colaborar. No se exige
crear un equipo ni comprar su plan para terminar el onboarding personal.

## 2. Punto de partida y cambio de alcance necesario

El código revisado conserva restricciones de organización. Cambiar solo la pantalla
o el guard de acceso no habilita correctamente el recorrido personal.

| Responsabilidad          | Implementación existente y adaptación necesaria                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Acceso                   | `hasVoiceAgentAccess` y AGENT-011 exigen organización. Extender el dueño canónico y sus consumidores REST, MCP, CLI y frontend a ambos scopes                                  |
| Piloto                   | `AI_VOICE_AGENT_AUTOMATIONS_ORG_IDS` y `automation-access.ts` rechazan personal. Evolucionar una única política de admisión para ambos scopes y workers                        |
| Persistencia             | Automatizaciones, políticas/ejecuciones de recordatorios, correos, handoffs y participantes requieren `organizationId`. Generalizar ownership, unicidad, claims y recuperación |
| Autorización             | Hay comparaciones y callbacks basados en organización. Autorizar cada llamada, contacto, reunión y destino mediante el contexto completo del workspace                         |
| Configuración            | `VoiceAgentAutomationService` posee setup, selección/reutilización, readiness y `humanFollowUp.enabled`. Extenderlo con propietario personal o administrador autorizado        |
| Preparación Organization | `SubscriptionService.createFromStripe` y Clerk/`assignToOrganization` deben reconciliar compra y organización en ambos órdenes                                                 |
| Correos y excepciones    | `MeetingEmailService` busca organización y administradores. Personal usa propietario/responsable autorizado y sus recursos                                                     |
| Defaults                 | El formulario de recordatorios propone 24 horas. Usar 240 minutos para nuevos defaults sin sobrescribir configuraciones previas                                                |
| Analítica                | Existe `useAnalytics` con gtag/Ahrefs; la búsqueda revisada no encontró PostHog. Extender el dueño existente y evitar clientes o capturas paralelos                            |

Las entregas 0–3 están documentadas detrás del piloto de organización. Validar
rama, migraciones y recorrido real antes de ampliarlas. Sus pruebas existentes no
demuestran todavía aislamiento, audio ni liquidación en workspaces personales.

### 2.1. Ownership y compatibilidad

Usar `createOwnershipContext`/`buildOwnershipFilter`: personal filtra por `userId`
y `organizationId: null`; organización, por `organizationId` y los permisos de
miembro aplicables. Dos propietarios personales no comparten alcance porque ambos
tengan `organizationId` nulo. Tampoco se mezclan el personal y la organización del
mismo usuario. No crear organizaciones ficticias ni una arquitectura paralela.

La preparación necesita una clave estable por workspace y versión. Si hace falta
una representación externa, derivarla del contexto canónico con espacios disjuntos,
por ejemplo `personal:<ownerId>` y `organization:<organizationId>`. Esa clave sirve
para correlación y deduplicación; no es una prueba de autorización.

Hacer nullable una columna no conserva por sí solo la unicidad existente sobre
`organizationId`. Definir constraints e índices para una configuración por
workspace/capacidad/contexto, y extender los repositorios, transacciones y locks
actuales. Autorizar también todos los IDs que enlacen herramientas, callbacks,
participaciones, notas, correos y objetivos.

Los trabajos diferidos reconstruyen su contexto desde el ownership persistido y
revalidan su autorización vigente. Cambiar la organización activa del usuario en
otra sesión no cambia el scope de un callback, handoff, correo o débito pendiente.

Actualizar deliberadamente AGENT-011 y AGENT-018 al implementar, junto con reglas
de correos y pruebas. Conservar CALL-001/002 y la exclusión IA de CALL-003: el
freelancer puede prospectar con su llamada humana mientras la IA sigue trabajando.
Comprobar concurrencia, historial y consumo sin ampliar el cupo humano ni duplicar
llamadas o débitos. Revisar contratos y consumidores enumerados en `AGENTS.md`.

## 3. Preparación nativa, elegibilidad y preferencias

Extender el dueño de automatizaciones con reconciliación idempotente por workspace
y versión. El alta personal, Stripe/Clerk para Organization y la reparación de un
setup incompleto solicitan esa misma operación. Reutilizar claims, servicios de
calendario y adapters de proveedor existentes.

| Workspace    | Entrada y autorización                                                           | Elegibilidad y consumo                                                                                                            |
| ------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Personal     | Registro/primer acceso; el propietario autenticado adopta la configuración       | Acceso personal habilitado, requisitos completos y saldo personal conforme a billing; sin dependencia de suscripción Organization |
| Organización | Alta/compra asociada a la organización prevista; adopta un administrador vigente | Suscripción y vigencia aplicables, permisos, requisitos y saldo de esa organización                                               |

Una compra puede preceder o seguir al alta de Organization. Conservar la intención
de checkout y sus registros autorizados; no asignar a la primera organización del
comprador ni a la pestaña activa. Una cancelación a fin de período respeta la vigencia
pagada; impago y gracia siguen la política de billing existente. El fin de un plan
Organization no deshabilita el workspace personal financiado por separado.

Persistir versión/origen de preparación, progreso, decisión del propietario o
administrador, fecha de adopción, capacidades excluidas y siguiente requisito.
Pausas y eliminación deliberada de un trigger sobreviven a la eliminación de su
fila y a futuras reconciliaciones. Renovar, reintentar o reconectar no las revierte.

La política `humanFollowUp.enabled` conserva autorización verificable. El comprador,
creador de una organización y administrador pueden ser personas distintas. Derivar
`authorizedByUserId` de la identidad autorizada; no inventarlo desde el webhook de
compra. En personal autoriza su propietario, mediante el mismo onboarding.

| Dato                   | Default y comportamiento común                                                     |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Identidad comercial    | Perfil y marca reales; editable, sin inventar una empresa para el freelancer       |
| Número saliente        | Asignación válida o único número utilizable. Varios candidatos requieren selección |
| Calendario             | Autorizado, con disponibilidad y responsable; propietario personal precargado      |
| Zona y horario         | Valores actuales visibles y corregibles antes de activar                           |
| Idioma/voz             | Configuración compatible; idioma efectivo por conversación y contexto del contacto |
| Recordatorio           | 240 minutos como nuevo default; conservar offsets previos                          |
| Entrega humana         | Defaults habilitados al adoptar; mostrar qué resultados inician IA y su objetivo   |
| Calendarios futuros    | Cubrir solo los compatibles con marca, número, responsable y alcance adoptado      |
| Devolución de llamadas | Mostrar destino efectivo y resolver continuidad con routing existente              |

Las rutas humanas conservan su elección hasta que la persona autorizada adopte
otra. Un recurso incompatible aparece como requisito concreto. Los workers
comprueban alcance, autorización, preferencias y readiness antes de despachar.
Saldo insuficiente es una causa visible; no se presenta como preparación completada
con capacidad de llamar. Conservar historial y preferencias cuando deje de haber
elegibilidad, y aplicar las reglas de pausa al trabajo pendiente.

## 4. Un onboarding orientado al primer resultado

Una pantalla presenta **Seguimiento automático** con resumen y requisitos. La acción
principal **Activar seguimiento automático** adopta los defaults y explica el consumo.
Personalizar permite cambios avanzados. Ambos segmentos recorren las mismas etapas;
los campos resueltos se muestran completos, sin hacer repetir su configuración.

El propietario personal o administrador habilitado adopta la configuración. Un
miembro sin ese permiso ve el progreso y el requisito dirigido al administrador;
no recibe una acción que el servidor le rechazará. Los experimentos de adopción
definen su población con esta autoridad y cuentan workspaces, sin duplicar miembros.

| Momento                      | Experiencia y siguiente acción                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Primera entrada              | Promesa concreta y ambos especialistas preparados; progreso recuperable                   |
| Configuración                | Número, calendario, marca, horario, responsable y confirmación a cuatro horas precargados |
| Dato faltante                | Una instrucción específica: elegir número, dar disponibilidad o configurar devolución     |
| Falta saldo                  | Explicar qué operación está pendiente y ofrecer la recarga vigente con costos claros      |
| Preparado                    | Resumen adoptado y próxima acción; el usuario vuelve a prospectar                         |
| Primer «Interesado» elegible | El cierre habitual muestra objetivo aceptado y qué hará la IA, sin otro formulario        |
| Primer resultado real        | Aviso discreto con resultado, historial y consumo liquidado o pendiente                   |
| Uso posterior                | Resumen verificable de resultados, próximos pasos y excepciones; acción contextual        |
| Pausa                        | Compromisos afectados visibles; reanudación conserva límites y ventanas                   |

La preparación puede completarse antes de financiar el uso. Distinguir **Configuración
completa; falta saldo** de **Listo para llamar**. No inventar una prueba gratis ni
exigir obtener un resultado antes de la primera compra cuando requiere saldo.

La API devuelve estado, razón y siguiente acción desde backend. Reutilizar UI,
traducciones, accesibilidad y navegación de Ringee; abrir el panel mantiene la
llamada en curso. La experiencia no requiere seleccionar agentes o coordinar
callbacks en cada llamada. Errores recuperables siguen en IA; las excepciones van
al propietario personal o responsable autorizado de organización.

Una vista previa del recorrido puede ayudar a entenderlo. Si se incorpora, marcarla
como demostración y excluir sus datos de resultados reales, costos y activación.
No usar una llamada real a un contacto como requisito para completar una demo.

## 5. Qué conversión queremos mejorar

Medir dos resultados de Ringee: **primer valor real** y **primera recarga pagada**.
Luego comprobar continuidad. Completar configuración o pulsar un botón son señales
intermedias. El objetivo comercial del cliente se mide por separado: una cita o
confirmación no demuestra que haya adquirido un cliente.

| Recorrido                  | Secuencia y unidad                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Adquisición                | Visita atribuida → registro completado. Unidad persona, con canal de adquisición permitido                                                                         |
| Adopción                   | Workspace creado/elegible → onboarding expuesto → configuración adoptada → requisitos completos. Unidad workspace                                                  |
| Valor desde llamada humana | Workspace listo → resultado humano elegible → objetivo IA aceptado → resultado real. Unidad workspace; desglosar también por objetivo                              |
| Valor desde reunión        | Workspace listo → reunión autorizada cubierta → recordatorio ejecutado → confirmación o cambio autorizado real. No exige una nueva llamada fría                    |
| Financiación inicial       | Sin saldo suficiente → checkout de recarga iniciado → pago confirmado y crédito registrado → primera ejecución → primer resultado. No requiere un resultado previo |
| Saldo ya disponible        | Listo → ejecución → resultado; distinguir saldo comprado, saldo anterior y grants existentes. Medir después primera compra o recarga posterior según corresponda   |
| Continuidad                | Primer resultado → nuevos objetivos y resultados en semanas posteriores → consumo y nuevas recargas                                                                |
| Organization               | Intención de equipo → checkout de plan → suscripción efectiva asociada. Conversión adicional del segmento, separada de recargas                                    |

**Definiciones iniciales para el piloto:**

- Activación de producto: primer resultado real atribuible a IA con evidencia dentro
  de siete días desde la exposición al onboarding. Admite entrega humana y reuniones
  ya existentes; una confirmación puede probarse desde su registro autorizado aunque
  no tenga objetivo `PendingAction`. Mostrar cada tipo de resultado. Un callback,
  consulta de disponibilidad o cierre sin éxito no cuenta.
- Cohortes de valor: para nuevos medir primer resultado de por vida; para quienes
  ya tenían resultados medir el primero posterior a la adopción/exposición de esta
  versión. Separar estos indicadores y conservar el historial, sin reiniciar una
  métrica de primera vez al volver a mostrar onboarding.
- Configuración: proporción que queda lista y tiempo hasta readiness en 24 horas.
  Publicar el bloqueo de saldo por separado para distinguir setup de financiación.
- Conversión pagada: primera recarga comprada, confirmada por pago y ledger, dentro
  de 14 días desde la exposición entre workspaces que nunca habían pagado recargas.
  Reembolsos y disputas se muestran aparte. Una concesión no cuenta como compra.
- Retención de valor: workspaces con nuevos resultados en semanas 1 y 4 desde su
  primera resolución, con ventanas y cohortes maduras explícitas. Abrir una página
  o recibir un evento automático no demuestra continuidad de valor.
- Resultado comercial del cliente: reservas, asistencia cuando exista evidencia,
  y ventas registradas por su fuente autorizada. No inferir ventas desde citas.

Estas ventanas son propuestas de medición, no benchmarks. Fijarlas antes de cada
experimento y revisarlas con la línea base. Los funnels muestran también tiempos,
pendientes y la pérdida de cada paso, incluyendo workspaces sin contactos elegibles.
Medir tanto el recorrido total como la conversión condicionada a tener una oportunidad;
publicar solo esta última ocultaría problemas de adquisición o activación.

Segmentar por `workspace_type`, nuevos/existentes, canal, estado de financiación al
entrar, idioma de interfaz y volumen de oportunidades. Separar pilotos, demos,
cuentas internas y datos de prueba. Una persona con varios workspaces puede producir
varias activaciones de workspace, pero sigue siendo una persona en adquisición.

## 6. Identidad y contrato de eventos

Usar la misma identidad interna de usuario en cliente y servidor. Asociar adquisición
anónima al registro mediante la resolución de identidad elegida, sin unir cuentas de
personas distintas. Capturar solo parámetros de atribución permitidos; evitar URLs
completas, textos libres o identificadores sensibles en parámetros de campaña.

El grupo de PostHog es **workspace**, con claves disjuntas personal/organización y
propiedad `workspace_type`. No crear una organización ficticia para agrupar personal.
Cada evento de producto con scope incluye su workspace efectivo, incluso después
de cambiarlo en la interfaz. Visitas anónimas anteriores al alta no tienen grupo;
no inventar uno. Logout/cambio de cuenta limpian la identidad cliente correspondiente.
Group Analytics admite entidades definidas por el producto y experimentos por grupo.
[Documentación oficial](https://posthog.com/docs/product-analytics/group-analytics).

Los eventos automáticos tienen actor IA/sistema y una identidad técnica separada;
cuentan como resultados del workspace y se excluyen de DAU humano y adquisición.
La autorización original puede correlacionarse con ID interno mínimo sin atribuir
actividad de pantalla a quien configuró el trigger. Los contactos son entidades de
Ringee y no se convierten en personas de PostHog.

Propiedades mínimas: `schema_version`, `event_id`, `occurred_at`, `actor_type`,
`environment`, `release_version`; eventos con scope agregan `workspace_key`,
`workspace_type` y `rollout_cohort` cuando esté asignada.
Añadir `organization_id` solo cuando corresponda, causa normalizada, capacidad,
objetivo, resultado e intentos/latencia según el evento. IDs de correlación opacos;
consumo con unidad, importe y estado de liquidación, distinguiendo desconocido de cero.

Los siguientes nombres son propuestas. Buscar y reutilizar el evento canónico de
registro, pago o dominio que exista antes de crear uno equivalente.

| Evento propuesto                              | Dueño y momento                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `signup_completed`                            | Backend al completar el alta de usuario, una vez                                                                                       |
| `workspace_created`                           | Alta persistida; scope y origen explícitos                                                                                             |
| `organization_plan_activated`                 | Backend tras suscripción efectiva y asociación verificadas                                                                             |
| `followup_onboarding_viewed`                  | Cliente al mostrar la experiencia, versión y exposición                                                                                |
| `followup_onboarding_step_completed`          | Paso válido completado; IDs de campo/paso acotados                                                                                     |
| `followup_configuration_saved`                | Backend al aceptar configuración autorizada                                                                                            |
| `followup_provisioning_started` / `completed` | Transiciones persistidas por workspace/versión                                                                                         |
| `followup_readiness_changed`                  | Cambio real del estado o de su causa normalizada                                                                                       |
| `followup_enrollment_authorized`              | Adopción persistida de entrega desde llamadas humanas                                                                                  |
| `credit_checkout_started`                     | Creación aceptada de checkout, ligada al workspace previsto                                                                            |
| `credit_topup_confirmed`                      | Compra confirmada y crédito registrado por el dueño de billing; ID estable del pago/ledger                                             |
| `followup_source_eligible`                    | Primer resultado humano aceptado que cumple el criterio; deduplicado por llamada/revisión                                              |
| `followup_objective_started`                  | Objetivo durable con fuente y próxima acción                                                                                           |
| `followup_objective_resolved`                 | Resolución del objetivo con evidencia; diagnóstico de ese recorrido                                                                    |
| `followup_business_result_recorded`           | Proyección analítica desde evidencia autoritativa de resultado IA, incluido recordatorio sin objetivo; clave estable del hecho/versión |
| `followup_objective_closed`                   | Cierre con motivo, separado de éxito                                                                                                   |
| `followup_exception_changed`                  | Apertura o resolución de una excepción accionable                                                                                      |
| `followup_control_applied`                    | Pausa, reanudación o toma de control aceptada                                                                                          |
| `followup_charge_settled`                     | Débito confirmado vinculado a llamada/objetivo                                                                                         |
| `followup_receipt_status_changed`             | Estado persistido de entrega del comprobante                                                                                           |
| `followup_value_summary_viewed`               | Cliente al mostrar resultados verificados y próxima acción                                                                             |

Cada nombre tiene un dueño. Cliente captura interacción/exposición; backend,
aceptación y resultados. El éxito de un pago no nace de su página de retorno.
Las métricas de primera vez se derivan de hechos completos o de marcadores durables;
un retry, nuevo dispositivo o reactivación no los reinicia.
La métrica global de valor usa resultados de negocio únicos. Un hecho que resuelve
un objetivo y confirma una reunión cuenta una vez mediante su clave de evidencia;
no sumar ambos eventos como dos resultados. Reutilizar la evidencia actual, sin
crear objetivos o mutaciones de negocio únicamente para producir analítica.

Exportar eventos autoritativos desde evidencia durable con cursor/reintentos y
control de entrega, extendiendo el mecanismo existente que corresponda. Conservar
ID, fecha original, actor y payload al reintentar. PostHog deduplica eventualmente
por UUID, evento, timestamp y distinct ID: validar ese contrato en el SDK y conciliar
conteos por ID contra Ringee. [Modelo de eventos](https://posthog.com/docs/data/events).

El adapter pertenece a `@ringee/platform`, con DI y configuración; no se instala
un SDK proveedor en servicios de negocio. Declarar cualquier dependencia compartida
de runtime también donde la requieran backend/orchestrator y comprobar builds.
La entrega de analítica queda fuera de transacciones y del tiempo crítico de llamada.
Ringee conserva la verdad de reuniones, resultados, créditos y autorizaciones.

## 7. Dashboards y ciclo de aprendizaje

| Dashboard                  | Decisión que permite tomar                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Adquisición y financiación | Qué canales traen registros que pagan y obtienen valor; recargas confirmadas separadas del plan y de grants |
| Onboarding                 | Qué requisito frena a cada segmento, tiempo por paso, errores y abandono                                    |
| Primer valor               | Tiempo hasta resolución, proporción total y condicionada a oportunidades, bloqueos y casos aún abiertos     |
| Continuidad                | Resultados nuevos, recargas y pausas por cohorte; retención de valor W1/W4                                  |
| Autonomía y operación      | Resoluciones sin intervención, fallos por etapa, callbacks vencidos y antigüedad de objetivos               |
| Economía                   | Consumo liquidado por resultado, saldo/compra/consumo por workspace y costos pendientes                     |

Una recarga es financiación; consumo de créditos y costos de proveedor son otras
magnitudes. No presentar créditos consumidos como nueva caja ni costo cero cuando
la liquidación está pendiente. Conciliar diariamente eventos con dominio y ledger,
y marcar ventanas incompletas de ingestión. El dashboard del cliente sigue usando
consultas autorizadas de Ringee con enlaces a evidencia; PostHog sirve al análisis.

Revisión semanal propuesta: localizar una caída relevante del funnel, observar
replays permitidos de ese paso, contrastar una encuesta breve, priorizar una mejora
y decidir un experimento o corrección. Registrar hipótesis, responsable y resultado
de la decisión. Corregir fallos de funcionamiento para todos; reservar experimentos
para incertidumbre de producto. Con poco volumen, priorizar evidencia cualitativa
y no declarar ganadores con muestras insuficientes.

Surveys iniciales con respuestas acotadas: «¿Qué te impidió continuar?» tras un
bloqueo y «¿Quedó claro qué haría la IA?» después de un resultado o período de uso.
No interrumpir llamadas ni pedir datos de contactos. Aplicar límite de frecuencia.

## 8. Experimentos de conversión, en orden

El onboarding continúa siendo uno para ambos segmentos. Las variantes comparan
presentación y ayuda sobre las mismas funciones, autorizaciones y tarifas.

| Orden | Hipótesis y comparación                                                                                                                          | Métrica primaria propuesta                                                                     | Seguimiento y límites                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1     | Una promesa centrada en el próximo resultado y checklist con requisitos precargados facilita activar, frente a descripción centrada en funciones | Workspaces con configuración completa en 24 h / expuestos elegibles                            | Readiness con saldo, resultado real en 7 días por cohorte de valor, errores, correcciones y comprensión del consumo |
| 2     | Una guía contextual al guardar el primer «Interesado» facilita llegar al resultado, frente al aviso habitual                                     | Workspaces con resultado real vinculado a esa fuente en 7 días / expuestos con fuente elegible | Objetivos bloqueados, intervenciones, contactos repetidos y costo por resolución                                    |
| 3     | Explicar qué acción habilita recargar y cómo se cobra facilita financiar el uso, frente al aviso genérico de saldo                               | Workspaces con primera recarga confirmada en 14 días / expuestos sin compras previas           | Tarifas constantes, reembolsos/disputas, comprensión y ejecución posterior                                          |
| 4     | Un resumen de resultados con próxima acción pertinente facilita repetir, frente a confirmación genérica                                          | Workspaces con nuevos resultados en la semana siguiente / expuestos tras primer valor          | Pausas, exceso de avisos, nuevas oportunidades y costo por resultado                                                |

Si no se entiende el recorrido, priorizar una vista previa identificada como demo
antes de añadir más campos. Evaluar comprensión y primer valor real; los resultados
simulados nunca entran en los numeradores de éxito.

Para cada prueba fijar antes de lanzarla: población, una métrica primaria, denominador,
ventana de conversión, guardrails, tamaño de muestra a partir de la línea base,
duración y criterio de finalización. La ventana propuesta no es la duración mínima
del experimento: debe permitir madurar los resultados de cada cohorte. PostHog
permite métricas primarias/secundarias y exposición configurable. Elegir exposición
cuando la experiencia se haya mostrado realmente, para no contar un prefetch de
flag como visita. [Creación de experimentos](https://posthog.com/docs/experiments/creating-an-experiment).

Asignar por workspace con variante estable para todos sus miembros y workers.
Conservar versión/exposición, separar experimentos que compiten por la misma etapa
y empezar con uno activo en el onboarding. Revisar reparto y calidad de datos antes
de interpretar efectos. Segmentar personal/organización ayuda al diagnóstico, pero
una diferencia entre esos segmentos no demuestra causalidad. Declarar inconcluso
un experimento sin muestra suficiente y retirar flags obsoletos tras decidir.

Los guardrails incluyen costo por resolución, tiempo sin próximo paso, intervención
manual, llamadas no deseadas/solicitudes DNC, fallos, reembolsos y pausas tempranas.
Una mejora en clics que empeore resultados o estos controles no se publica como éxito.

## 9. PostHog, crédito y datos

Los **50.000 USD de crédito indicados por el usuario** permiten instrumentar y
aprender con continuidad. El programa público anuncia 12 meses; confirmar inicio,
vencimiento y cobertura del grant real antes de presupuestarlo. No todas sus
herramientas están cubiertas; AI Observability sí figura como incluida.
[Programa oficial](https://posthog.com/startups).

| Prioridad              | Producto y uso                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Inicial                | Product Analytics + Group Analytics para funnels, cohortes y retención por workspace                      |
| Inicial                | Feature Flags + Experiments para admisión gradual y pruebas por workspace                                 |
| Inicial                | Error Tracking para fallos de onboarding y preparación con causas normalizadas                            |
| Acotada                | Session Replay en onboarding/configuración; muestra inicial propuesta del 20% de sesiones elegibles       |
| Tras detectar fricción | Surveys breves vinculadas al paso o resultado                                                             |
| Ampliación posterior   | AI Observability de operaciones que Ringee puede instrumentar, con metadatos mínimos y consumo disponible |

Group Analytics es un add-on pagado cuya facturación alcanza todos los eventos
identificados del proyecto. Incluir ese volumen, incluso eventos sin grupo, en la
previsión. [Facturación de grupos](https://posthog.com/docs/product-analytics/group-analytics).
Estimar eventos por objetivo/workspace y sesiones elegibles, revisar gasto y
proyección semanal, y configurar presupuestos y alertas por producto. Ajustar replay
al volumen observado. Los límites pueden detener ingestión; Ringee debe operar y
mostrar su estado aunque falte telemetría. [Límites](https://posthog.com/docs/billing/limits-alerts).

No asignar cuotas arbitrarias del crédito ni perseguir agotarlo. Priorizar medición
del funnel completo y experimentos que permitan decisiones. Exportar definiciones,
diccionario de eventos y resultados para conservar aprendizaje al terminar el grant.

El contrato externo excluye teléfonos/correos de contactos, nombres, notas libres,
transcripciones, grabaciones, tokens, credenciales y URLs sensibles. Sanitizar también
rutas, atributos del DOM, query strings y mensajes de error. El identificador técnico
interno es suficiente para correlacionar sin copiar el contenido del CRM.

Replay se limita inicialmente a onboarding/configuración aprobados con entradas y
texto enmascarados; permitir contenido seguro explícitamente. Excluir contactos,
grabaciones, transcripciones y conversación; desactivar captura de cuerpos de red,
audio, canvas y consola en esta entrega. Verificar payloads y grabaciones de muestra.
[Privacidad de replay](https://posthog.com/docs/session-replay/privacy).

AI Observability registra las operaciones realmente observables de Ringee y su
consumo disponible. La conversación/audio del proveedor tiene sus propias evidencias;
no enviar contenido sensible a PostHog para explicar su facturación.

## 10. Flags y comportamiento ante fallos

El backend conserva un único dueño del estado efectivo: elegibilidad según tipo de
workspace, admisión de piloto, decisión autorizada, preferencias, preparación y
requisitos. PostHog selecciona cohortes/variantes; el backend aplica permisos y
guarda la decisión relevante por workspace. Un flag no autoriza recursos ni gasto.

Nombres propuestos: `native_followup_rollout_v1` para admisión backend y
`followup_onboarding_v1` para variante de UX. Evolucionar el piloto existente para
personal/organización antes de incorporar nuevos scopes; mantener su techo de
admisión durante las pruebas. La pausa del propietario/administrador prevalece.

Si PostHog falla, diferir admisiones sin decisión válida persistida. El trabajo ya
autorizado sigue sus políticas y los gates de Ringee. Un control operativo backend
puede detener nuevos despachos sin depender de PostHog. Mantener trazabilidad,
liquidación del consumo incurrido y correos ya debidos por resultados vigentes.
Revisar el gate actual que detiene correos al retirar el flag y actualizar
AGENT-018/020 con el comportamiento implementado.

## 11. Entregas y criterios de aceptación

| Entrega                        | Resultado verificable                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 4A — Alcance personal          | Ownership, reglas, persistencia, claims, herramientas, correos, callbacks y consumidores preparados para ambos scopes, detrás del piloto  |
| 4B — Medición base             | PostHog, identidad/grupo workspace, contrato de eventos, exportación fiable, datos protegidos y funnels; puede avanzar en paralelo con 4A |
| 4C — Preparación y onboarding  | Reconciliación por workspace, defaults, adopción autorizada, opt-outs durables y misma pantalla para ambos segmentos                      |
| 4D — Piloto completo           | Recorrido real y telemetría conciliados, con freelancers y organizaciones; línea base de financiación, valor y continuidad                |
| 4E — Optimización y ampliación | Un experimento priorizado, cohortes estables y expansión sujeta a resultados/operación                                                    |

Comenzar con workspaces personales y organizaciones internos y contactos de prueba;
continuar con clientes que adopten la función y ampliar gradualmente ambos scopes.
La secuencia 10%, 25%, 50% y 100% de workspaces elegibles nuevos es una propuesta,
condicionada al ciclo de citas, volumen observado e incidencias cerradas. Los
existentes mantienen adopción explícita. No fijar fechas que sustituyan estos gates.

Antes de admitir trabajo personal, desplegar la migración aditiva y sus índices,
regenerar Prisma y actualizar los consumidores API/repositorios/workers que asumen
organización obligatoria. Durante despliegues mixtos, ningún worker antiguo puede
reclamar filas personales. Mantener cerrada su admisión hasta comprobar compatibilidad
y un mecanismo de rollback que no deje datos nuevos a cargo de un worker incompatible.
Conservar el flujo organizacional vigente durante esa transición.

Criterios de aceptación:

- Ambos segmentos completan el mismo onboarding y obtienen las mismas capacidades;
  personal no recibe un checkout de Organization como requisito de acceso.
- Ningún scope lee o enlaza contactos, llamadas, calendarios, handoffs o saldos
  ajenos; incluir dos freelancers y personal/organización del mismo usuario.
- La llamada humana personal puede continuar mientras IA sigue otro caso, según
  CALL-001/003, con consumo e historial correctos e idempotentes.
- Un seguimiento creado en personal conserva recursos, autorización y saldo de ese
  workspace al ejecutarse después de que el usuario cambie a una organización.
- Alta, Stripe/Clerk repetidos/invertidos y reparación concurrente producen una
  preparación por workspace/versión, sin revertir pausa, eliminación ni ediciones.
- Los nuevos defaults usan 240 minutos. Número, marca, calendario, responsable,
  política de entrega y routing tienen autorización y configuración válidas.
- El piloto comprueba llamada fría → IA → reserva → recordatorio → confirmación/
  reagenda/cancelación → notas → correo → consumo. Incluye fallo de handoff,
  callback posterior a la cita original y devolución entrante, en ambos scopes.
- Pausa, pérdida de elegibilidad y reanudación llegan a workers; resultados y cargos
  incurridos conservan recuperación. Fin de Organization no afecta personal.
- PostHog caído o limitado no rompe llamadas, pagos, liquidación ni trabajo admitido.
- Cambiar de workspace conserva identidad humana y grupo correcto por evento;
  demos no cuentan como valor, actores IA/sistema no cuentan como adquisición o
  actividad humana, y grants no cuentan como compras. Los resultados IA reales
  sí cuentan como valor del workspace, una vez por hecho autorizado.
- Eventos duplicados/tardíos y primeras compras se concilian con dominio/ledger.
  Datos incompletos y costos pendientes se identifican en los dashboards.
- Replays y eventos de muestra cumplen el contrato. Cada experimento tiene métrica,
  exposición y población definidas, sin confundir clic, intento y resultado.

Ejecutar las verificaciones de las capas modificadas según sus `AGENTS.md` y scripts
reales. La salida del piloto requiere evidencia real de continuidad, aislamiento,
reservas y liquidación; los tests por sí solos no prueban audio ni proveedor.

## 12. Configuración pendiente y alcance de este documento

Durante la implementación se concretan proyecto/región PostHog, grant y vencimiento,
presupuestos, responsables de dashboards y workspaces/contactos de prueba. Medir
línea base antes de proponer porcentajes de mejora o tamaños de muestra.

Las ventanas 24 h/7 días/14 días, retención W1/W4, muestra replay del 20% y secuencia
de cohortes son decisiones iniciales de diseño ajustables con evidencia. Las mismas
capacidades, el mismo onboarding y el cobro actual por consumo son decisiones de
producto confirmadas. Este documento no instala SDKs, cambia permisos, migra bases,
activa flags, aprovisiona proveedores ni envía datos de clientes.

## 13. Estado de implementación · 4A — alcance personal (10 de noviembre de 2026)

**Implementado y validado automáticamente** (proveedores simulados; PostgreSQL
local desechable con el SQL real de Stages 1–4A y sin drift frente a
`schema.prisma`):

- Una sola política de acceso por scope, `voiceAgentAccess`, para guard, API,
  servicios, respuesta de acceso del dashboard (`workspaceType` aditivo) y
  workers. Organización: acceso y allowlist sin cambios. Personal: módulo y
  automatizaciones solo con inscripción explícita en
  `AI_VOICE_AGENT_PERSONAL_PILOT_USER_IDS` (IDs de usuario; `*` se ignora y el
  `*` de organizaciones no admite workspaces personales).
- Ownership personal real (`userId` + `organizationId: null`) en agentes,
  automatizaciones, recordatorios, correos, acciones, handoffs, participantes,
  callbacks y objetivos; comparaciones con `isInWorkspace`/`isSameWorkspace`,
  nunca solo por organización. El trabajo diferido usa el scope persistido.
- Migración aditiva `20261107120000_personal_voice_agent_scope` y SQL
  concurrente `20261107120100_personal_voice_agent_scope_indexes.sql`: unicidad
  personal de automatizaciones (índice parcial), propietario en participaciones
  con check, sin backfill.
- Recorrido de seguimiento completo en personal: resultado humano → objetivo →
  callback → commit → reserva → resolución con nota atribuida y comprobantes al
  propietario; recordatorios, traspaso y callbacks; controles del propietario;
  retirada del piloto bloquea trabajo nuevo y conserva historial.
- CALL-001/003 intactos: la llamada IA no ocupa al freelancer; una segunda
  llamada humana sigue bloqueada. Liquidación contra el saldo personal
  persistido, una sola vez.
- UI mínima: entrada de navegación por acceso del servidor, rail personal con
  Recordatorios y Agendar, «Llamar para agendar» sin selector de miembro.

**Preparado para despliegue detrás del piloto:** orden y verificación en
[FOLLOW_UP.md](../engineering/FOLLOW_UP.md) («Stage 4A»): migración, índices,
Prisma y despliegue compatible con la lista personal vacía; comprobar que no
quedan instancias antiguas; después admitir IDs concretos.

**Pendiente de validación real:** audio y herramientas del traspaso,
callbacks, recepción de comprobantes y liquidación con contactos de prueba en
un workspace personal inscrito. **Fuera de 4A:** recepcionista IA en personal
(requiere cambios de telefonía entrante), PostHog (4B), preparación nativa,
onboarding común y defaults de 240 minutos (4C).
