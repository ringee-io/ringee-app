# Auditoría del audio del dialer — 26 de octubre de 2026

## Resultado

Se reprodujo un defecto en el reproductor del dialer manual y las listas: cada
actualización del contador vuelve a asignar el mismo `MediaStream` al elemento
`audio`. El navegador reinicia la carga del audio incluso cuando el objeto no ha
cambiado. Esto interrumpe la reproducción que escucha el agente.

El usuario confirmó que los agentes están en España, llaman a números españoles
con un número local español y **los cortes los escucha el agente**. El defecto
coincide con esa dirección y con las superficies de uso reportadas. Es el
candidato principal; todavía no se ha contrastado con una llamada afectada ni
validado la corrección desplegada en España. No es un defecto específico del
prefijo +34 y no demuestra que todos los incidentes tengan la misma causa.

Se dejó una corrección local mínima, pruebas y una regla de reproducción en
`TELEPHONY.md`. No se desplegó ni se modificó la configuración de Telnyx.

## Alcance y evidencia

- Código de partida: `f6425630`.
- SDK instalado y declarado: `@telnyx/webrtc` 2.27.9.
- Revisión de manual, listas, campañas, sesiones por enlace, SDK y extensión;
  creación del cliente, reproducción, reconexión, notificaciones y webhooks.
- Consultas de solo lectura a Telnyx: configuración de conexiones y aplicación
  Call Control; metadatos de registros WebRTC.
- Prueba local en Chrome 155 con audio sintético, sin micrófono, llamadas reales
  ni acceso a grabaciones.
- No se recibieron identificadores ni horas de llamadas afectadas. No se
  verificó qué revisión de código está desplegada en los navegadores afectados.

## Hallazgo principal: reinicio de reproducción cada segundo

**Prioridad P1. Defecto reproducido; correlación con el incidente pendiente.**

En `packages/dialer-ui/src/components/active-call-modal.tsx`, el temporizador
actualiza `elapsed` cada 1.000 ms. Su callback `ref` se crea en cada render y
asignaba `el.srcObject = remoteStream` incondicionalmente. React vuelve a invocar
el callback al actualizarlo; el setter del navegador ejecuta nuevamente el
algoritmo de carga de medios. Las actualizaciones por controles y otros cambios
de interfaz también pueden provocar el mismo reinicio.

La prueba comparó una asignación inicial y cuatro actualizaciones con el mismo
stream:

| Comportamiento                   | Asignaciones | `loadstart` | `emptied` | `playing` |
| -------------------------------- | -----------: | ----------: | --------: | --------: |
| Código anterior                  |            5 |           5 |         4 |         5 |
| Asignar solo si cambia el stream |            1 |           1 |         0 |         1 |

La prueba verifica reinicios del reproductor; no mide la duración acústica de los
cortes ni la pérdida de paquetes de una llamada real. El comportamiento también
está documentado en la implementación de
[HTMLMediaElement de Chromium](https://chromium.googlesource.com/chromium/src/+/b19e3c4c551574f7a697154228bce1f6c850b4ef/third_party/blink/renderer/core/html/media/html_media_element.cc).

**Corrección:** asignar únicamente cuando `el.srcObject !== remoteStream`.
Conserva la conexión, el stream, los controles, la espera de respuesta antes de
reproducir y el reemplazo del stream cuando realmente cambia. El SDK y la
extensión ya aplicaban esta comprobación en sus propios reproductores.

## Qué comparten las superficies

| Superficie        | Inicio de llamada                                           | Reproducción                                                 | Alcance del defecto periódico |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| Manual y listas   | `useDial` → `useCall` → `placeCall`                         | `ShowActiveCall` → `ActiveCallModal`                         | Sí                            |
| Campañas normales | Cliente compartido; `useDialerCallEngine` llama a `newCall` | `softphone-panel.tsx`, efecto por llamada/estado             | No reproduce el mismo patrón  |
| Campañas BYOC     | `useDialerCallEngine` → `placeCall` con ruta de carrier     | Mismo panel de campañas                                      | No reproduce el mismo patrón  |
| Sesiones/enlaces  | Cliente propio creado con `createTelnyxClient`              | `use-session-call.ts`, actualización por notificación        | No por el contador            |
| Extensión         | Motor compartido, documento offscreen                       | Comprobación de identidad del stream antes de asignarlo      | Ya protegido                  |
| SDK embebido      | Adaptador sobre el motor compartido                         | `RemoteAudioManager.attachStream`, comprobación de identidad | Ya protegido                  |

Las campañas comparten cliente y proveedor con el manual, pero las campañas
normales no pasan por `placeCall` y tampoco usan el modal para reproducir audio.
Por tanto, un cambio en un único helper no cubre automáticamente todas las rutas.
Los reproductores de campañas y sesiones también tienen asignaciones sin la
comprobación de identidad, pero sus efectos dependen de llamadas, estados o
notificaciones: no se demostró un reinicio periódico allí. No se modificaron
esas rutas como parte de esta corrección.

## Ruta de audio y configuración consultada

El código crea clientes con selección automática y no fuerza `region`,
`rtcIp` ni servidores ICE personalizados. El país del número llamante no prueba
por dónde viaja el audio.

La conexión indicada por la configuración local tiene un webhook de desarrollo.
Para evitar confundirla con producción, se consultó también el inventario de
conexiones de la cuenta: cuatro conexiones activas apuntan a `api.ringee.io`.
En las cuatro se observó:

| Ajuste                               | Valor observado          | Interpretación                                             |
| ------------------------------------ | ------------------------ | ---------------------------------------------------------- |
| `anchorsite_override`                | `Latency`                | No hay un anclaje geográfico fijo configurado              |
| `jitter_buffer.enable_jitter_buffer` | `false`                  | Búfer adaptativo opcional de Telnyx desactivado            |
| `rtcp_settings.capture_enabled`      | `false`                  | Captura RTCP de la conexión desactivada                    |
| Códecs configurados de entrada       | G722, G711U, G711A, G729 | No demuestra qué códec negoció una llamada WebRTC concreta |

El número de conexiones y el host no identifican cuál usó un agente afectado.
`Latency` tampoco demuestra que el camino efectivo de una llamada, incluido un
relay TURN, permanezca en Europa. Hace falta correlacionar su sesión y tramo.
La aplicación Call Control configurada localmente también usa `Latency` y un
webhook de desarrollo; no se extrapoló ese dato a producción.

Según la documentación de
[AnchorSite](https://developers.telnyx.com/docs/voice/sip-trunking/routing/anchorsite-configuration),
la colocación de medios se controla independientemente del código del dialer.
El [búfer adaptativo de Telnyx](https://developers.telnyx.com/docs/voice/sip-trunking/features/jitter-buffer)
puede amortiguar variaciones de llegada de paquetes, a costa de demora de
reproducción. Tenerlo desactivado no prueba un fallo ni implica que el navegador
carezca de su propio búfer. No se recomienda cambiar globalmente región, códecs
o búfer sin una medición de las llamadas afectadas.

## Medición y antecedente del repositorio

**Prioridad P2. Falta correlación de calidad en la aplicación.**

No se encontró un consumidor de estadísticas de calidad en el dialer actual ni
persistencia específica de jitter, pérdida o RTT en el flujo revisado. El handler
de `call.hangup` procesa duración y causa, pero no extrae `call_quality_stats`.
La animación de ondas del modal es decorativa: no verifica continuidad del audio.

El commit `03445d1e` del 11 de octubre añadió mediciones de calidad e indicador;
`1890b498` del 12 de octubre revirtió ese trabajo. La documentación conservada
no significa que esa instrumentación siga activa. No se restauró todo el cambio
revertido sin conocer el motivo de la reversión.

Esto **no** implica que Telnyx no reciba informes: el SDK instalado 2.27.9 activa
su recolector cuando `enableCallReports` no es explícitamente `false`, y Ringee
omite la opción. Se verificó ese comportamiento en el bundle instalado. La
disponibilidad efectiva de informes para las llamadas afectadas no se comprobó.

Las consultas de registros WebRTC, filtradas por los usuarios SIP de las
conexiones consultadas y `last_7_days`, devolvieron cero filas. Ese resultado
limitado no demuestra ausencia de llamadas ni de informes en otras superficies
de Telnyx. Sin una sesión afectada no hay evidencia para atribuir el problema a
un operador español, una red local, un códec o una ruta intercontinental.

## Validación y siguiente comprobación

- Chrome: cuatro reinicios con el patrón anterior, cero con la comprobación.
- Pruebas de regresión sobre el componente real: fallaron antes de la corrección
  por reasignaciones repetidas y pasaron después.
- `pnpm --filter frontend run test`: 32 pruebas correctas, incluidas tres nuevas.
- `pnpm --filter @ringee/dialer-ui run typecheck`: correcto.
- ESLint de los archivos de código modificados: cero errores; un aviso
  preexistente por `playsInline` en `audio`.
- Prettier de los archivos modificados y `git diff --check`: correctos.
- `pnpm build:frontend`: correcto, incluidas las 360 páginas estáticas. El build
  omite tipos y lint por configuración del proyecto; se ejecutaron por separado
  las comprobaciones indicadas arriba sobre el paquete y los archivos afectados.

La comprobación decisiva es desplegar la corrección y repetir una llamada desde
el puesto afectado en España, con la misma red, auriculares y destino. Confirmar
que el agente deja de escuchar los cortes periódicos. Registrar ID de llamada,
hora y tramo para cualquier corte restante.

Si persisten, correlacionar estadísticas del navegador de recepción (pérdida,
jitter, concealment y RTT), tipo/protocolo de la pareja ICE seleccionada y los
informes del tramo Telnyx–operador. Revisar también el envío si aparecen reportes
de cortes escuchados por el cliente. No almacenar grabaciones, direcciones ICE
ni frames completos como telemetría de diagnóstico.
