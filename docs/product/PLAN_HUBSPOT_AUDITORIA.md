# HubSpot: auditoría y plan de correcciones

Auditoría de código · 22 de octubre de 2026 · base `236e0218` (main)

Estado (22 de octubre de 2026): **ninguna corrección implementada.** Solo se auditó; no se cambió código. Marca cada casilla al cerrar el punto y cita su ID (`HS-01`…) en el commit.

Alcance: el adaptador `packages/platform/src/crm/providers/hubspot/`, los servicios `packages/services/src/services/crm/`, los repositorios CRM de `packages/database`, `apps/backend/src/api/routes/crm.controller.ts`, la app `apps/hubspot`, el frontend de integraciones y todo lo que dispara una sincronización: colgado, outcome, campañas, reuniones, grabaciones y transcripciones.

## 0. En una página

El adaptador de HubSpot en sí está bien construido: endpoints versionados que existen, scopes iguales a los de la app, IDs de asociación y outcomes correctos, HTML escapado, reintentos sensatos (ver §7). Los problemas están en la capa de sincronización que lo rodea, que **duplica o pierde llamadas en HubSpot**, y en tres puntos de **seguridad y privacidad**.

| ID       | Severidad  | Problema                                                                                 | Dónde (principal)                                                    |
| -------- | ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| HS-01    | Crítico    | Dos drenados del outbox procesan el mismo evento: llamadas y contactos duplicados        | `crm-outbox.repository.ts:63-99`                                     |
| HS-02    | Crítico    | Llamadas contestadas que nunca llegan a HubSpot (SDK, recepcionista IA, pestaña cerrada) | `crm-call-log.service.ts:180-182`                                    |
| HS-03    | Crítico    | La resolución de coincidencias ambiguas no funciona                                      | `crm-call-log.service.ts:531-604`, `crm-matching.service.ts:180-219` |
| HS-04    | Crítico    | Un `call.hangup` repetido o tardío deja la sync atascada en `pending`                    | `crm-call-log.service.ts:225-375`                                    |
| HS-05    | Crítico    | Un fallo al encolar pierde la llamada en todos los CRM del workspace                     | `crm-matching.service.ts:81-82`                                      |
| HS-06    | Seguridad  | OAuth: secuestro de conexión y redirección abierta                                       | `crm.controller.ts:106-130, 222-270`                                 |
| HS-07    | Seguridad  | IDOR en `POST /crm/syncs/:id/retry` y `/resolve`                                         | `crm.controller.ts:300-326`                                          |
| HS-08    | Privacidad | Registros crudos de HubSpot (PII) en los logs de producción                              | `crm-contact-sync.service.ts:195-207`                                |
| HS-09    | Medio      | Un secret mal configurado revoca todas las conexiones de HubSpot                         | `abstract-provider.ts:191-197`                                       |
| HS-10    | Medio      | Enlaces obsoletos: contacto borrado en HubSpot o cambio de portal                        | `crm-matching.service.ts:48-68`                                      |
| HS-11    | Medio      | Contactos duplicados en HubSpot para leads sin email                                     | `meeting.service.ts:296-319`, `hubspot.provider.ts:587-640`          |
| HS-12    | Medio      | Grabaciones: descarga sin timeout ni reintento, destino arbitrario                       | `crm-sync.service.ts:296-313`                                        |
| HS-13    | Medio      | Bulk sync: tope de 5.000, corre dentro de la API, ejecuciones en paralelo                | `crm-bulk-sync.service.ts`                                           |
| HS-14    | Bajo       | Reuniones y tareas sin owner (no usan el enlace de miembros)                             | `meeting.service.ts:309-314`                                         |
| HS-15    | Bajo       | Outcome cambiado tarde y reuniones modificadas no actualizan HubSpot                     | `crm-call-log.service.ts:469-502`                                    |
| HS-16    | Bajo       | Configuración que no hace nada (mapeo de campos, `CRM_DRY_RUN`, `rateLimit`)             | `crm-field-mapping.service.ts`                                       |
| HS-17    | Decisión   | Cinco decisiones de producto a confirmar                                                 | §6                                                                   |
| HS-18…24 | Menor      | Siete detalles menores                                                                   | §5                                                                   |

## 1. Lista de trabajo

Orden propuesto: primero lo trivial y lo que duplica, luego seguridad, luego lo que pierde llamadas.

**Fase 0 — hoy, trivial**

- [ ] HS-08 Borrar el volcado "TEMP DEBUG" de PII

**Fase 1 — duplicados y seguridad**

- [ ] HS-01 Reclamación atómica del outbox (`FOR UPDATE SKIP LOCKED`) y `enqueue` que no reactiva eventos en curso
- [ ] HS-07 Comprobar el workspace en `retry` y `resolve`
- [ ] HS-06 Validar `redirect` y atar el `state` de OAuth al usuario

**Fase 2 — llamadas que se pierden o se registran mal**

- [ ] HS-02 Retener solo fuentes con pantalla post-llamada y barrido de respaldo
- [ ] HS-03 Arreglar `needs_resolution` y `resolveAmbiguousMatch`
- [ ] HS-04 `enqueueCallLog` idempotente ante colgados repetidos o tardíos
- [ ] HS-05 Aislar cada conexión al encolar

**Fase 3 — robustez**

- [ ] HS-09 Solo `invalid_grant` / `BAD_REFRESH_TOKEN` revoca
- [ ] HS-10 Invalidar enlaces obsoletos y limpiar al cambiar de portal
- [ ] HS-11 Evitar crear dos veces la misma persona
- [ ] HS-12 Timeout, reintento y destino correcto de grabaciones
- [ ] HS-13 Bulk sync por cursor, en Temporal y con lock por conexión

**Fase 4 — resto**

- [ ] HS-14 Owner en reuniones y tareas desde el enlace de miembros
- [ ] HS-15 Actualizar la actividad en HubSpot en vez de añadir notas
- [ ] HS-16 Aplicar o retirar la configuración muerta
- [ ] HS-17 Confirmar las decisiones de producto (§6)
- [ ] HS-18 … HS-24 Menores (§5)

## 2. Críticos

### HS-01 — Dos drenados del outbox procesan el mismo evento

**Qué pasa.** `CrmOutboxRepository.claimDueBatch` (`packages/database/src/database/repositories/crm-outbox.repository.ts:63-99`) reclama en tres pasos:

1. `findMany` de los ids debidos;
2. `updateMany` que los pasa a `in_progress` y mueve `nextAttemptAt` diez minutos adelante;
3. `findMany({ id: { in: ids }, status: "in_progress" })` (`:96`).

El paso 3 no distingue quién arrendó cada fila. Si otro drenado leyó los mismos ids en su paso 1 antes del paso 2 del primero, su paso 2 no actualiza nada, pero su paso 3 devuelve las filas igual. Los dos procesan el lote entero.

**Por qué ocurre en producción.** `triggerCrmDrain` (`packages/platform/src/temporal/orchestrator.service.ts:77-83`) arranca un workflow con id único por cada colgado sin contestar, cada outcome guardado y cada finalización (`crm-call-log.service.ts:197-205`, `:374`, `:505`), además del schedule de 60 s (`apps/orchestrator/src/temporal/schedules.ts:56-61`). El comentario de `orchestrator.service.ts:72-76` da por hecho que el arrendamiento lo hace seguro. La ventana es de milisegundos, así que falla de forma intermitente, y más con varios agentes llamando.

**Agravante.** `enqueue` (`crm-outbox.repository.ts:37-47`) devuelve a `pending` con `nextAttemptAt = now` un evento que está `in_progress`. Un segundo encolado del mismo evento (outcome y cierre, reserva y outcome, la subida de la grabación desde dos sitios) lo deja reclamable otra vez mientras el primero aún lo procesa.

**Consecuencia.** HubSpot recibe la misma llamada dos veces: la búsqueda anti-duplicado de `findLoggedActivity` no ve la primera por el retraso del índice de búsqueda. También crea dos veces el contacto de un lead nuevo sin email y repite notas, tareas y adjuntos.

**Evidencia.** Reproducido contra la base local con el repositorio real (apéndice A): con dos `claimDueBatch` simultáneos, **los dos se llevaron el mismo evento en 199 de 200 rondas**.

**Reglas que incumple.** `packages/database/AGENTS.md`: "Queue claims use `SELECT FOR UPDATE SKIP LOCKED`". `AGENTS.md`: "Retries must never produce a duplicate call, charge, balance mutation, or event".

**Corrección.**

- Reclamar en una sola sentencia: `UPDATE "CrmOutboxEvent" SET status = 'in_progress', "nextAttemptAt" = <lease> WHERE id IN (SELECT id … WHERE status IN ('pending','in_progress') AND "nextAttemptAt" <= <now> ORDER BY "nextAttemptAt" LIMIT <n> FOR UPDATE SKIP LOCKED) RETURNING *`. Modelo: `meeting-email-delivery.repository.ts:43-70`, con las fechas normalizadas `::timestamptz AT TIME ZONE 'UTC'` como pide `packages/database/AGENTS.md`.
- En `enqueue`, si el evento existente está `in_progress`, actualizar solo el payload y dejar `status` y `nextAttemptAt` como están (o marcarlo para reprocesar al terminar).
- Corregir el comentario de `orchestrator.service.ts`.
- El mismo patrón de tres pasos está en `custom-integration-delivery.repository.ts:61`, `enrichment-job.repository.ts:101` y `triggerloop-outbox.repository.ts:59`. Hoy no se solapan porque solo los drena un schedule con política SKIP, pero cualquier disparo bajo demanda los expondría: conviene corregirlos igual.

**Pruebas.** Test de repositorio con dos `claimDueBatch` concurrentes que exija cero solapamiento (el script del apéndice sirve de base). Test de `enqueue` sobre un evento `in_progress`.

### HS-02 — Llamadas contestadas que nunca llegan a HubSpot

**Qué pasa.** `handleCallCompleted` retiene toda llamada contestada que no venga de un teléfono de escritorio (`holdForDisposition = call.answeredAt != null && call.source !== "sip_device"`, `crm-call-log.service.ts:180-182`): prepara el snapshot y no encola nada. El push depende solo de la petición post-llamada (`enqueueOutcomeUpdate`). No existe barrido de respaldo ("there is NO timed fallback", `:176`).

Superficies que nunca envían esa petición:

- **Dialer SDK** (`source: "sdk"`). Sus endpoints son solo initialize, auth, session y `calls/authorize` (`apps/backend/src/api/sdk/*.ts`, `packages/dialer-sdk/src/api-client.ts:75-101`).
- **Recepcionista IA.** Las entrantes se crean con `source: "ai_voice_agent"` (`call.service.ts:291-292`). El resultado del agente se aplica en `voice-agent-result.service.ts:387-430` sin llamar a `enqueueOutcomeUpdate` (lo dice el comentario de `:412`).
- **Web y extensión** cuando la petición no llega: pestaña cerrada, recarga, red caída o petición fallida durante el cierre.
- **Agentes de voz IA salientes.** Cierran la llamada en `voice-agent-result.service.ts:510` (`completeCall`) sin pasar por `handleCallCompleted`, cuyo único llamador es el webhook (`call.service.ts:2169`). Ni siquiera se prepara la sync.

**Consecuencia.** Justo las llamadas con conversación quedan fuera de HubSpot, en silencio: la sync se queda `pending` sin evento.

**Corrección.**

- Retener solo las fuentes con pantalla post-llamada (web, sesiones, campañas, móvil, extensión). Para `sdk` y `ai_voice_agent`, empujar al colgar.
- Añadir un barrido programado que encole `call.log` para las syncs retenidas con más de N minutos (p. ej. 30) sin evento.
- Para los agentes de voz IA salientes, decidir si se registran en el CRM (ver HS-17) y, si sí, llamar a `enqueueCallLog` al cerrar la llamada y a `enqueueOutcomeUpdate` en `applyKnownOutcome`.

**Pruebas.** Spec de `CrmCallLogService` para `sdk` y `ai_voice_agent`; spec del barrido.

**Docs.** Describir la regla de retención y el respaldo en `docs/engineering/INTEGRATIONS.md` (CRM sync).

### HS-03 — La resolución de coincidencias ambiguas no funciona

**Cuándo ocurre.** `resolveByPhone` encuentra dos o más candidatos exactos, o ninguno exacto y dos o más por sufijo (`crm-matching.service.ts:112-136`), y la sync queda `needs_resolution` (`crm-call-log.service.ts:348-355`). Con contactos duplicados en HubSpot es frecuente.

**Fallos.**

1. **La grabación y la transcripción sacan la sync de ese estado.** `enqueueRecordingNote` y `enqueueTranscriptSync` tratan `needs_resolution` como `pending` y llaman a `upsertPending` (`crm-call-log.service.ts:531-545`, `:589-604`), que escribe `status: "pending"` (`crm-call-sync.repository.ts:50-54`). Entonces:
   - desaparece el botón «Resolver» (`sync-history-tab.tsx:137`);
   - `resolveAmbiguousMatch` ya la rechaza (`crm-matching.service.ts:187-189`);
   - al guardar el outcome, la llamada sale con `needsPersonCreation`, `upsertPerson` adopta el contacto del email o el primer match por teléfono (`hubspot.provider.ts:426-442`) y `afterPush` enlaza el número a él para siempre (`crm-call-log.service.ts:114-129`).
2. **La elección no se guarda.** `resolveAmbiguousMatch` cambia `linkedRecords` y `needsPersonCreation` solo en memoria y guarda únicamente el estado (`crm-matching.service.ts:203-208`). En salientes funciona por casualidad: `prepareForPush` encuentra el enlace por teléfono (`crm-call-log.service.ts:86-95`).
3. **En entrantes enlaza el número equivocado.** Usa `payload.to ?? payload.from` (`crm-matching.service.ts:192`), y en una entrante `to` es el número de Ringee. Enlaza tu DID al contacto elegido, y la llamada se registra donde decida `upsertPerson`, no donde eligió el usuario.
4. **UI.** El diálogo pide pegar un ID de HubSpot a mano (`sync-history-tab.tsx:209-330`), sin lista de candidatos y sin validar que el ID sea uno de ellos: los candidatos no se guardan en la sync.

**Corrección.**

- Al plegar grabación o transcripción, actualizar solo el payload sin tocar el estado (método de repositorio nuevo, p. ej. `updatePayload`).
- En `resolveAmbiguousMatch`: persistir el payload modificado, usar el teléfono de la contraparte según `direction` (o `needsPersonCreation.phoneE164`), comprobar el workspace (HS-07) y validar el ID contra los candidatos.
- Guardar los candidatos en la sync al marcarla `needs_resolution` y mostrarlos en el diálogo para elegir con un clic.

**Pruebas.** Spec de `enqueueRecordingNote` y `enqueueTranscriptSync` sobre `needs_resolution`. Spec de `resolveAmbiguousMatch` entrante y saliente que compruebe el payload persistido y el teléfono enlazado.

### HS-04 — Un `call.hangup` repetido o tardío deja la sync atascada

**Qué pasa.** El webhook no se deduplica por evento (`call.controller.ts:67`) y `completeCall` actualiza y devuelve la llamada aunque ya estuviera completada (`call.repository.ts:795-860`), así que `handleCallCompleted` vuelve a ejecutarse (`call.service.ts:2169`). `enqueueCallLog` reconstruye el snapshot desde cero, con `recordingUrl` y `transcript` en null (`crm-call-log.service.ts:313-338`), y `upsertPending` lo guarda con `status: "pending"` aunque la sync estuviera `done` (`crm-call-sync.repository.ts:50-54`). El evento `call.log:<conexión>:<llamada>:v1` ya está `sent`, así que `enqueue` no hace nada (`crm-outbox.repository.ts:37-38`) y la sync queda `pending` para siempre.

**Efectos.**

- La nota de transcripción y la del enlace de grabación nunca se envían: se pliegan en un payload que nadie manda (`crm-call-log.service.ts:531-545`, `:589-604`).
- Si la sync estaba retenida, se pierden la grabación y la transcripción ya plegadas.
- El historial de sincronización muestra llamadas pendientes para siempre.

**No hace falta un reintento de Telnyx.** En campañas el outcome se guarda al colgar (`call-attempt.service.ts:750-758`). Si llega antes que el webhook, `enqueueOutcomeUpdate` no encuentra sync y empuja la llamada al momento, sin `endedAt` ni duración (`crm-call-log.service.ts:403-410`). Luego el webhook la devuelve a `pending`.

**Regla que incumple.** `AGENTS.md`: "Webhook handlers must be safe to replay; guard on a stored marker".

**Corrección.**

- En `enqueueCallLog`, si ya existe una sync para esa conexión y esa llamada, no reconstruirla ni cambiar su estado. Si sigue `pending`, solo completar lo que falte (duración, `endedAt`). Nunca devolver `done` o `in_progress` a `pending`.
- Además, o en su lugar: ejecutar `handleCallCompleted` solo en la primera transición a completada.
- Opcional: cuando la duración llegue después del push, actualizar la actividad en HubSpot (PATCH de `hs_call_duration` por `externalActivityId`).

**Pruebas.** Spec con dos `handleCallCompleted` seguidos sobre una sync `done` y sobre una retenida con la grabación ya plegada. Spec del orden outcome → webhook en campañas.

### HS-05 — Un fallo al encolar pierde la llamada en todos los CRM

**Qué pasa.** `enqueueCallLog` busca el contacto de cada conexión en línea (`crm-call-log.service.ts:288-293`). `resolveByPhone` pide credenciales válidas fuera del `try` (`crm-matching.service.ts:81-82`):

- un refresh que falla (5xx o timeout de HubSpot) lanza;
- `registry.get` lanza `NotFoundException` para una conexión activa de un proveedor no registrado, como la legada `gohighlevel` (`registry.ts:13-17`).

La excepción sale del bucle y `handleCallCompleted` solo la registra en el log (`crm-call-log.service.ts:183-189`).

**Consecuencia.** La llamada no se encola para ninguna conexión del workspace, HubSpot incluido, y nadie la reintenta. Lo mismo ocurre con `enqueueOutcomeUpdate` cuando aún no hay sync.

**Corrección.**

- Aislar cada conexión con try/catch.
- Si falla la búsqueda, encolar igual con `linkedRecords: []` y `needsPersonCreation`: en el push, `upsertPerson` vuelve a buscar.
- Saltar las conexiones cuyo proveedor no esté registrado.
- Revisar producción: `select provider, status, count(*) from "CrmConnection" where provider in ('gohighlevel','salesforce') group by 1, 2;`

**Pruebas.** Spec con una primera conexión que lanza y una segunda que debe recibir su sync.

## 3. Seguridad y privacidad

### HS-06 — OAuth: secuestro de conexión y redirección abierta

**Qué pasa.** `createAuthorizationUrl` cifra en el `state` el usuario y la organización de quien inicia (`crm-oauth.service.ts:65-76`), y el callback `@Public()` (`crm.controller.ts:222-270`) acepta ese `state` venga de quien venga: no comprueba que el navegador que vuelve de HubSpot sea el mismo usuario. Además, `redirect` se guarda tal cual (`crm.controller.ts:106-130`) y el callback redirige a esa URL (`:254-260`).

**Ataque.**

1. Un atacante con una cuenta gratuita llama a `GET /api/crm/hubspot/oauth/start?redirect=https://atacante.example` y obtiene una URL real de instalación (app.hubspot.com, app "Ringee").
2. Se la envía a un admin de HubSpot, que la aprueba en menos de 10 minutos (lo que dura el nonce).
3. El portal de la víctima queda conectado al workspace del atacante. El bulk sync inicial (`crm.controller.ts:252`) le copia hasta 5.000 contactos y 5.000 empresas, y las llamadas del atacante se escriben en el HubSpot de la víctima.
4. La víctima termina en `https://atacante.example?crm=connected&…`, lista para phishing.

Afecta igual a Attio.

**Regla.** `AGENTS.md`: "Every `@Public()` route must carry its own proof of authorization". El `state` prueba que alguien inició el flujo, no que sea quien lo termina.

**Corrección.**

- Aceptar en `redirect` solo rutas relativas o el origen de `FRONTEND_URL`.
- Atar el `state` al usuario: que el callback redirija al frontend con `code` y `state`, y que el frontend, autenticado con Clerk, haga un POST que verifique `state.userId === usuario actual` (y la organización activa) antes de canjear el código. Alternativa: una cookie HttpOnly con el nonce, emitida en `/oauth/start` y comprobada en el callback.
- Nonce con `crypto.randomBytes` y consumo atómico (`GETDEL` o `SET NX`); ver HS-21.

**Pruebas.** Callback con el `state` de otro usuario → rechazo. `redirect` externo → rechazo.

**Docs.** Documentar el flujo en `docs/engineering/SECURITY.md` e `INTEGRATIONS.md`.

### HS-07 — IDOR en `POST /crm/syncs/:id/retry` y `/crm/syncs/:id/resolve`

**Qué pasa.** `retrySync` (`crm.controller.ts:300-304`) y `resolveMatch` (`:308-326`) no reciben al usuario ni comprueban de qué workspace es la sync. `manualRetry` (`crm-call-log.service.ts:508-521`) y `resolveAmbiguousMatch` (`crm-matching.service.ts:180-219`) actúan solo por id. `@OrgAdminOnly` deja pasar a cualquier usuario sin organización activa (`packages/platform/src/auth/org-admin.guard.ts:44-47`), es decir, a cualquiera que se registre.

**Consecuencia.** Quien tenga el UUID de una sync ajena puede reencolarla (y dejarla atascada en `pending` si estaba `done`) o resolverla: crea un `CrmContactLink` en la conexión de otro workspace hacia un ID arbitrario y empuja allí su llamada. El UUID no se adivina, pero se filtra, por ejemplo a un ex-miembro que lo vio en el historial.

**Regla.** `AGENTS.md`: "Never look a resource up by its id alone and act on it".

**Corrección.** Pasar `createOwnershipContext(user)` a los dos métodos; cargar la sync y su conexión y llamar a `assertAccess(ctx, connection)`, como hace `listRecentSyncs` (`crm-status.service.ts:63-75`). `manualRetry` solo para syncs `failed`. `ParseUUIDPipe` en `:id`.

**Pruebas.** Spec de ambos con una sync de otro workspace → NotFound.

### HS-08 — Registros crudos de HubSpot en los logs de producción

**Qué pasa.** `crm-contact-sync.service.ts:195-207` ("TEMP DEBUG… Remove once the mapping is fixed") hace `console.log` del registro completo (`result.raw`: todas las propiedades, nombre, emails, empresa…) y de teléfonos, emails y nombre de cada persona sin teléfono marcable. Corre en cada bulk sync (cada 30 minutos por conexión activa, hasta 5.000 personas) y en `syncFromCrm`. Se añadió en el commit `041e58c6` ("add logs", 2026-09-10).

**Consecuencia.** Datos personales de clientes en los logs de producción, con volumen alto y continuo. El propio adaptador evita registrar payloads a propósito (`hubspot.provider.ts:1190-1193`).

**Corrección.** Borrar las dos llamadas a `console.log` y dejar el `logger.debug` sin datos. Revisar la retención de los logs ya emitidos.

## 4. Medios

### HS-09 — Un secret mal configurado revoca todas las conexiones

**Qué pasa.** `HubSpotProvider` no sobrescribe `isRefreshFailureTerminal`. El valor por defecto (`abstract-provider.ts:191-197`) trata `AUTH_REVOKED`, `AUTH_EXPIRED` y `VALIDATION` como terminales, y `refreshTokens` marca entonces la conexión `revoked` (`crm-connection.service.ts:350-353`). `classifyHubSpotHttpError` convierte un 400 en `VALIDATION` y un 401 en `AUTH_EXPIRED` (`hubspot.errors.ts:48-92`). Cualquier error del endpoint de token que no sea `invalid_grant` o `BAD_REFRESH_TOKEN` —por ejemplo `invalid_client` con un `HUBSPOT_OAUTH_CLIENT_SECRET` mal puesto o rotado; HubSpot declara seguir RFC 6749— revoca cada conexión en su siguiente refresh, y los tokens duran 30 minutos.

`handleCallLogError` (`crm-sync.service.ts:344-351`) y el bulk sync (`crm-bulk-sync.service.ts:208-223`) también marcan `revoked` cualquier `AUTH_EXPIRED` que sobreviva a un refresh y un reintento.

**Consecuencia.** Todos los clientes tienen que reconectar HubSpot aunque se corrija la variable: no hay forma de reactivar sin reconectar.

**Comprobado contra HubSpot.** Un refresh token inválido responde `400 {"status":"BAD_REFRESH_TOKEN","error":"invalid_request",…}`, y el clasificador sí lo trata bien como revocación. `docs/engineering/INTEGRATIONS.md` ya dice: "Revocation is `invalid_grant` from the OAuth endpoints".

**Corrección.** Sobrescribir `isRefreshFailureTerminal` en `HubSpotProvider` para que solo `AUTH_REVOKED` (`invalid_grant` / `BAD_REFRESH_TOKEN`) sea terminal. El resto, error transitorio con estado `error` y alerta, no `revoked`.

**Pruebas.** Provider test con `400 invalid_client` y con un 401 en el endpoint de token → no terminal.

### HS-10 — Enlaces obsoletos

1. **Contacto borrado en HubSpot.** `resolveByPhone` usa primero el `CrmContactLink` guardado, sin verificarlo (`crm-matching.service.ts:48-68`). Si ese contacto se borra en HubSpot (limpieza, GDPR), crear la llamada, nota o reunión asociada falla con un error no reintentable (`VALIDATION`/`NOT_FOUND` → `failed`, `crm-sync.service.ts:352-359`), y el enlace nunca se invalida: cada llamada futura a ese número falla. Las fusiones no rompen nada, porque HubSpot resuelve los IDs viejos al registro fusionado.
2. **Reconectar otro portal.** `upsertConnection` reutiliza la misma fila y solo cambia tokens y `externalAccountId` (`crm-connection.repository.ts:100-125`). Los `CrmContactLink`, `CrmCompanyLink`, `CrmMemberLink` y syncs del portal anterior siguen colgando de ella.

**Corrección.** Ante un `NOT_FOUND` o un error de asociación al registrar, borrar el enlace y reintentar con matching (`needsPersonCreation`). Si `upsertConnection` recibe otro `externalAccountId`, borrar los enlaces de la conexión o crear una conexión nueva.

**Pruebas.** Spec del drenado con un enlace a un contacto inexistente → re-matching. Spec de `upsertConnection` con otro portal.

### HS-11 — Contactos duplicados en HubSpot para leads sin email

1. **Reunión reservada durante la llamada.** `createMeeting` dispara `enqueueOutcomeUpdate` sin esperar (`meeting.service.ts:296-304` → `:82-99`, `void`), que encola el `call.log` y lanza un drenado, y justo después `enqueueMeetingSync` (`:309`), cuyo `establishLink` crea la persona en línea (`crm-meeting-sync.service.ts:57-106`). El drenado y `establishLink` buscan y crean en paralelo. El índice de búsqueda de HubSpot tarda segundos, así que ninguno ve al otro.
2. **Fallo parcial en `logCall`.** Si se crea el contacto (`hubspot.provider.ts:592-599`) y luego falla la creación de la llamada (5xx), el ID creado no se guarda: el enlace se escribe solo en `afterPush`, tras el éxito (`crm-call-log.service.ts:104-129`). El reintento, 2–4 s después (`crm-sync.service.ts:442-449`), vuelve a buscar por teléfono, no lo encuentra y crea otro.

Solo el email protege: un 409 hace adoptar el contacto existente (`hubspot.provider.ts:393-414`).

**Corrección.**

- Para (1): que la reunión no cree la persona si hay un `call.log` pendiente del mismo contacto; resolver su destino en el drenado, después de ese `call.log`.
- Para (2): guardar el enlace en cuanto `upsertPerson` crea la persona, para que el reintento lo use.
- Alternativa más fuerte: una propiedad propia y única en HubSpot (p. ej. `ringee_contact_id`) para que la creación sea idempotente.

**Pruebas.** Spec de `logCall` con fallo después de crear el contacto → el reintento no crea otro.

### HS-12 — Grabaciones

1. **Sin timeout ni tope de tamaño.** `fetch(payload.publicRecordingUrl)` (`crm-sync.service.ts:296-313`). Como el drenado procesa en serie, una descarga colgada bloquea el lote hasta el timeout de la actividad.
2. **Sin reintento.** Cualquier fallo de descarga → `markFailed("recording_binary_unavailable")`. Un 5xx momentáneo del storage deja la grabación fuera de HubSpot para siempre.
3. **Destino arbitrario.** Se usa el primer `CrmContactLink` del contacto en esa conexión (`listByContact(…).find(…)`, `crm-recording-upload.service.ts:100-121`), sin orden. Si el contacto tiene varios enlaces (dos teléfonos ligados a dos registros, o uno de empresa), el audio puede acabar en otro registro distinto del de la llamada. El destino correcto es el `CrmCallSync.externalRecordId` de esa llamada.

**Corrección.** `AbortController` con timeout (p. ej. 60 s) y tope de tamaño; tratar los fallos de red y 5xx como reintentables; preferir el registro de la sync de la llamada.

### HS-13 — Bulk sync

1. **Tope.** `PAGE_SIZE = 50` y `MAX_PAGES = 100` (`crm-bulk-sync.service.ts:12-13`): como mucho 5.000 contactos y 5.000 empresas por pasada, siempre desde la primera página porque no se guarda cursor. En portales más grandes el resto nunca se importa.
2. **Dónde corre.** El sync inicial corre dentro del proceso de la API sin esperar (`crm.controller.ts:188-192`), y «Sync now» espera el sync entero dentro de la petición HTTP (`:91-102`). Regla: `apps/backend/AGENTS.md`, "The API process does not do slow work inline. Start a Temporal workflow".
3. **Ejecuciones en paralelo.** El flag `inFlight` es por proceso (`crm-bulk-sync.service.ts:19`, `:29-31`): el sync inicial, «Sync now» y el programado cada 30 minutos pueden correr a la vez sobre la misma conexión. `upsertContact` no es seguro en paralelo (`findByExternalId` → `findByPhone` → `create`, `crm-contact-sync.service.ts:119-223`), y el índice único de `Contact` `(userId, phoneNumber, deletedAt)` no lo impide porque `deletedAt` es NULL en los contactos activos (`schema.prisma:104`) → contactos duplicados en Ringee.
4. **Promesa sin esperar.** `handleProviderError` se llama sin `await` (`crm-bulk-sync.service.ts:135`, `:182`).

**Corrección.** Cursor guardado por conexión (o sync incremental por `lastmodifieddate`) sin tope fijo de páginas; lanzar el sync desde Temporal, con un workflow por conexión de id fijo (`crm-bulk-sync:<connectionId>`, conflicto `USE_EXISTING`); lock por conexión.

## 5. Bajos y menores

### HS-14 — Reuniones y tareas sin owner

`createMeeting` llama a `enqueueMeetingSync` sin `ownerEmail` ni `ownerName` (`meeting.service.ts:309-314`), así que `upsertMeeting` no pone owner (`hubspot.provider.ts:741-745`). Aunque lo pasara, el adaptador resuelve por email (`resolveOwnerId`), no por el enlace de miembro de la pestaña Team. `createTask` hace lo mismo con `assigneeEmail`. Es inconsistente con la llamada y el contacto, que sí usan `CrmMemberLinkService.resolveCrmMemberId`.

**Corrección.** Añadir `ownerExternalId` a `CrmMeetingInput` y `CrmTaskInput`, resolverlo con `resolveCrmMemberId` en el servicio y escribirlo con la misma retirada si HubSpot lo rechaza (`writeWithoutRejected`).

### HS-15 — Cambios posteriores que no actualizan HubSpot

1. Si el outcome cambia después de registrar la llamada, solo se añade una nota "Call Disposition" (`crm-call-log.service.ts:469-502`): no se actualizan `hs_call_disposition`, `hs_call_status` ni las notas de la actividad. Y la clave `note.sync:<conexión>:<llamada>:disposition:v1` hace que solo llegue el primer cambio (`:501`), porque `enqueue` devuelve el evento ya `sent` sin hacer nada.
2. Reservar una reunión y luego guardar el mismo outcome añade una nota redundante.
3. Reprogramar o cancelar una reunión nunca llega a HubSpot: `updateMeeting` y `cancelMeeting` (`meeting.service.ts:434`, `:501`) no sincronizan. Además, la clave `meeting.sync:<conexión>:<reunión>:v1` ya estaría `sent`, y el adaptador buscaría por la hora original y crearía otra reunión.

**Corrección.** Actualizar la actividad existente (PATCH de la llamada por `externalActivityId`, de la reunión por su id guardado) en vez de añadir notas. Clave de dedupe por revisión, como `call.outcome.updated` (`<callId>:outcome:<outcome>:<updatedAt>`).

### HS-16 — Configuración que no hace nada

- La pestaña de mapeo de campos siembra y muestra mapeos (`crm-field-mapping.service.ts:79-260`, `field-mappings-tab.tsx`), pero ninguna sincronización los aplica: `getMappings`, `applyPushMappings` y `applyPullMappings` no tienen llamadores.
- `CRM_DRY_RUN` (`api.configuration.ts:194`) no se usa en ningún sitio.
- `capabilities.rateLimit` (`hubspot.capabilities.ts:23-25`) no se aplica: Ringee no limita la tasa, solo espera tras un 429.

**Corrección.** Aplicar los mapeos o retirar la pestaña (o marcarla como informativa); borrar o implementar `CRM_DRY_RUN`.

### HS-18 … HS-24 — Menores

- [ ] **HS-18** Reencolar un evento `failed` conserva su `attemptCount` (≥ 10) (`crm-outbox.repository.ts:37-47`): un reintento manual o un outcome tardío tienen un solo intento, y cualquier error transitorio lo vuelve a marcar `failed` (`crm-sync.service.ts:361`, `:376`, `:400`). Reiniciar el contador al reencolar desde `failed`.
- [ ] **HS-19** `findLoggedActivity` se traga un 429 y sigue a crear (`hubspot.provider.ts:1030-1036`): con límite de tasa, un reintento tras una respuesta perdida se salta la comprobación anti-duplicado. Propagar `RATE_LIMITED` para que el evento espere.
- [ ] **HS-20** El refresh de tokens no se serializa por conexión: dos drenados que ven el token vencido lo renuevan a la vez. Es inocuo mientras HubSpot mantenga estable el refresh token (su documentación no aclara si rota), pero cualquier fallo pasa por la clasificación de HS-09. Lock por conexión en Redis alrededor de `refreshTokens`.
- [ ] **HS-21** OAuth: nonce con `Math.random` (`crm-oauth.service.ts:172-178`); comprobar y borrar el nonce no es atómico (`:101-105`); `provider` se inserta sin codificar en las URLs de redirección (`crm.controller.ts:235-266`).
- [ ] **HS-22** Desconectar no revoca el token en HubSpot: `HubSpotProvider` no implementa `revoke` y `disconnect` solo cambia el estado (`crm-connection.service.ts:379-384`). Hay endpoint `/oauth/2026-09/token/revoke` según un issue de Nango (fuente externa: confirmar en la documentación).
- [ ] **HS-23** `GET /crm/connections/:id/syncs?limit=` no tiene tope (`crm.controller.ts:285-288` → `take` en `crm-status.service.ts:71-74`). Limitar a 200.
- [ ] **HS-24** Ruido en HubSpot: para una sync ya enviada, la grabación genera dos notas, "Call Recording Link" (`crm-call-log.service.ts:548-563`) y la del adjunto (`hubspot.provider.ts:777-795`).

## 6. HS-17 — Decisiones de producto a confirmar

- [ ] **URL pública de la grabación en HubSpot.** `hs_call_recording_url` recibe la URL pública y permanente del mp3 sin cifrar (`recording-processing.service.ts:126-138` → `crm-call-log.service.ts:523-546` → `hubspot.mapper.ts:558-574`), mientras la subida del archivo es `PRIVATE` porque "el audio es dato personal" (`hubspot.provider.ts:804-831`). Cualquiera con el enlace escucha la llamada, para siempre.
- [ ] **Borrados y GDPR desde HubSpot.** No llegan a Ringee: no hay webhooks activos (`apps/hubspot/src/app/webhooks/webhooks-hsmeta.json`: todo `active: false`, `targetUrl` de ejemplo) y el bulk sync solo hace upsert. Un contacto borrado en HubSpot, o con una solicitud GDPR, sigue en Ringee.
- [ ] **Quién manda en los datos del contacto.** Ringee sobrescribe cada 30 minutos el nombre, nombre y apellido, cargo y email de los contactos enlazados con lo de HubSpot (`crm-contact-sync.service.ts:334-364`): lo editado en Ringee se pierde. Hacia HubSpot, en cambio, solo se rellenan huecos.
- [ ] **Contactos creados por llamadas sin respuesta.** Cada marcación sin respuesta a un número que HubSpot no tiene crea un contacto en HubSpot, con owner, además de la llamada `NO_ANSWER`: las no contestadas se empujan al colgar (`crm-call-log.service.ts:304-307`). En campañas en frío eso puede crear miles de contactos.
- [ ] **Agentes de voz IA salientes.** Decidir si deben registrarse en el CRM (hoy no lo hacen; HS-02).

## 7. Verificado y correcto

- **Endpoints.** Las rutas versionadas `2026-09` existen en HubSpot: sin credenciales responden 401, y una versión inexistente (`2099-01`) da 404. Los endpoints OAuth existen y su formato de error coincide con `classifyHubSpotHttpError`.
- **Valores contra la documentación de HubSpot.** IDs de asociación 194 / 182 / 202 / 190 / 204 / 192 / 200 / 188; GUID de outcome (Busy, Connected, Left live message, Left voicemail, No answer, Wrong number); valores de `hs_call_status`; la regla de que la grabación se reproduce solo con HTTPS .mp3/.wav (`playableRecordingUrl`).
- **Scopes.** Los de `apps/hubspot/src/app/app-hsmeta.json` son iguales a los de `HUBSPOT_OAUTH_SCOPES` y `HUBSPOT_OAUTH_OPTIONAL_SCOPES`.
- **Comportamiento del adaptador.**
  - escapa el HTML de los cuerpos;
  - un 403 no se trata como revocación;
  - quita y reintenta las propiedades opcionales rechazadas, nunca el teléfono;
  - solo rellena huecos y nunca sobrescribe lo que alguien escribió en HubSpot;
  - el owner solo se pone al crear;
  - resolver el owner nunca hace fallar una sync;
  - el archivo de grabación se sube como privado y con `RETURN_EXISTING`.
- **Enlaces de miembros.** Los endpoints comprueban el workspace (`assertAccess`) y validan los ids con `ParseUUIDPipe`. El enlace por email solo acepta el email principal o uno verificado.
- **Llamadas entrantes.** El owner es quien contestó: `assignToAnswerer` reasigna `Call.userId`.

## 8. Cómo se verificó

| Comprobación                 | Comando                                                                                                                                                                                                                            | Resultado                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Tests CRM de platform        | `cd packages/platform && npx vitest run src/crm`                                                                                                                                                                                   | 97/97                         |
| Tests CRM de services        | `cd packages/services && TS_NODE_PROJECT=tsconfig.json node --env-file-if-exists=../../.env --require ts-node/register --require tsconfig-paths/register --test src/services/crm/*.spec.ts`                                        | 41/41                         |
| Tipos                        | `npx tsc --noEmit -p tsconfig.json` en `packages/platform` y `packages/services`                                                                                                                                                   | exit 0                        |
| Lint                         | `node_modules/.bin/eslint packages/platform/src/crm packages/services/src/services/crm apps/backend/src/api/routes/crm.controller.ts apps/frontend/src/features/integrations packages/database/src/database/repositories/crm-*.ts` | 0 errores, 3 warnings previos |
| Rutas de HubSpot             | `curl` sin credenciales a `/crm/objects/2026-09/*`, `/crm/owners/2026-09`, `/crm/lists/2026-09/search`, `/files/2026-09/files`, `/oauth/2026-09/token`                                                                             | 401 / 415; `2099-01` → 404    |
| Formato de error del refresh | `POST /oauth/2026-09/token` con un refresh token inventado                                                                                                                                                                         | `400 BAD_REFRESH_TOKEN`       |
| Carrera del outbox           | Apéndice A, contra la base local                                                                                                                                                                                                   | 199/200 rondas duplicadas     |

Los tests existentes cubren bien el adaptador, pero ninguno cubre la concurrencia ni los estados de la sync: cada corrección debe traer el test que habría detectado el fallo.

## Apéndice A — Reproducir la carrera del outbox

Solo contra la base **local**: `claimDueBatch` reclama todo lo debido, así que no debe haber eventos `pending` reales ni un worker local corriendo. El script solo crea y borra filas propias (`kind: "audit.race"`, `dedupeKey` `audit-race-*`).

```ts
// outbox-race.ts — ejecutar desde packages/database
const DB = process.cwd();
const req = (m: string) => require(require.resolve(m, { paths: [DB] }));
req("reflect-metadata");
const { PrismaClient } = req("@prisma/client");
const { CrmOutboxRepository } = require(
  `${DB}/src/database/repositories/crm-outbox.repository`,
);

async function main() {
  const prisma = new PrismaClient();
  const repo = new CrmOutboxRepository(prisma);
  const rounds = Number(process.env.ROUNDS ?? 200);
  let doubles = 0;
  try {
    for (let i = 0; i < rounds; i++) {
      const ev = await prisma.crmOutboxEvent.create({
        data: {
          provider: "hubspot",
          kind: "audit.race",
          payload: {},
          dedupeKey: `audit-race-${Date.now()}-${i}-${Math.random()}`,
          status: "pending",
          nextAttemptAt: new Date(Date.now() - 1000),
        },
      });
      // Dos drenados a la vez: el schedule de 60 s y un disparo bajo demanda.
      const [a, b] = await Promise.all([
        repo.claimDueBatch(new Date(), 25),
        repo.claimDueBatch(new Date(), 25),
      ]);
      const inA = a.some((e: { id: string }) => e.id === ev.id);
      const inB = b.some((e: { id: string }) => e.id === ev.id);
      if (inA && inB) doubles++;
      await prisma.crmOutboxEvent.delete({ where: { id: ev.id } });
    }
  } finally {
    await prisma.crmOutboxEvent.deleteMany({
      where: { dedupeKey: { startsWith: "audit-race-" } },
    });
    await prisma.$disconnect();
  }
  console.log(
    `both drainers got the same event in ${doubles}/${rounds} rounds`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

```bash
cd packages/database
TS_NODE_PROJECT=tsconfig.json TS_NODE_TRANSPILE_ONLY=true ROUNDS=200 \
  node --env-file-if-exists=../../.env --require ts-node/register /ruta/a/outbox-race.ts
```

Antes de la corrección imprime casi siempre `200/200` o `199/200`; después debe imprimir `0/200`.

## Fuentes

- [HubSpot — Refresh an access token](https://developers.hubspot.com/docs/api-reference/latest/authentication/oauth-tokens/refresh-oauth-token)
- [HubSpot — New OAuth v3 endpoints and standardized error responses](https://developers.hubspot.com/changelog/new-oauth-v3-api-endpoints-and-standardized-error-responses)
- [HubSpot — Migrate from the OAuth v1 API to the date-based versioned API](https://developers.hubspot.com/docs/api-reference/legacy/authentication/oauth-tokens/v1/migration-guide)
- [HubSpot — Calls guide](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/calls/guide)
- [HubSpot — Associate records (association type IDs)](https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide)
- [HubSpot — Search guide](https://developers.hubspot.com/docs/api-reference/search/guide)
- [HubSpot — Updated merge functionality for CRM objects](https://developers.hubspot.com/changelog/updated-merge-functionality-for-crm-objects-including-contacts-and-companies)
- [NangoHQ/nango #7664 — HubSpot v1 OAuth endpoints and the 2026-03 replacements](https://github.com/NangoHQ/nango/issues/7664)
