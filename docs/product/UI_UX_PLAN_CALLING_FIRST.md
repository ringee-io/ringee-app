# Ringee: más llamadas, menos esfuerzo

Fecha: 30 de septiembre de 2026. Estado: propuesta, no implementada.

Parte de [UI_UX_PLAN_ALT.md](UI_UX_PLAN_ALT.md) y del [plan inicial](UI_UX_PLAN.md). Incorpora la nueva prioridad de producto: que el usuario llame mucho más mediante una experiencia funcional, intuitiva y con menos clics. El alcance es la aplicación.

## 1. La decisión principal

**Organizar Ringee alrededor de una sesión de llamadas: entrar, empezar, conversar, registrar y continuar.** La siguiente persona y su contexto deben estar preparados. El usuario no debería reconstruir ese recorrido en cada llamada.

El plan alternativo acierta al unir Hoy con el marcador. Esta propuesta da otro paso: el inicio se llama **Llamar**, con **Mi día** como una de sus vistas. El verbo hace evidente para qué sirve la pantalla. Las campañas y listas alimentan el mismo espacio de trabajo.

La meta comercial es aumentar llamadas y ventas. La hipótesis de producto es que reducir preparación repetida, navegación y cierre administrativo permite más intentos y más conversaciones. La conversión depende también de la calidad de la lista, el momento y la conversación; se medirá junto al volumen.

El objetivo de UX tiene cuatro partes:

1. **Empezar antes:** desde una cola preparada, iniciar con un clic.
2. **Seguir con menos esfuerzo:** cero navegación entre llamadas; el siguiente contacto ya está disponible.
3. **Hablar con contexto:** ver motivo, última interacción, guion y siguiente paso sin abrir otras páginas.
4. **Volver con facilidad:** conservar la lista, la posición y las preferencias; reanudar con una acción explícita.

La sesión continua se apoya primero en las campañas progresivas existentes. No se presupone que la cola personal ya tenga un motor de sesiones equivalente.

## 2. Qué conservar y qué cambiar del plan alternativo

| Decisión del alternativo                           | Propuesta revisada                                                                                 | Motivo                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Hoy reúne marcador y trabajo pendiente             | Llamar es el inicio; Mi día, listas y campañas son fuentes                                         | Hace evidente la acción y permite trabajar muchas llamadas seguidas                  |
| Cierre en dos acciones                             | Preparar el resultado durante la conversación; cero acciones posteriores cuando esté completo      | Reduce el intervalo entre llamadas sin repetir trabajo                               |
| Acciones de contacto en hover                      | Llamar siempre visible; acciones secundarias en hover y foco                                       | La velocidad debe estar disponible desde el primer uso                               |
| Nueve resultados idénticos en todas partes         | Un patrón visual común, con resultados reales del contexto y orden estable                         | Las campañas tienen resultados configurables; no se sustituyen por un catálogo fijo  |
| Callback sugerido automáticamente para interesados | Sugerir y mostrar el siguiente paso; guardar únicamente el que el usuario elige                    | Evita compromisos ficticios y una cola inflada de tareas                             |
| Cuenta atrás de cierre                             | Priorizar avance al completar el resultado; descanso opcional solo si el servidor puede respetarlo | Un temporizador obligatorio añade espera; uno solo visual no frena al motor          |
| Reordenar toda la navegación pronto                | Primero mejorar el ciclo de llamada; después agrupar Agenda e Historial                            | Produce valor antes y reduce cambios simultáneos                                     |
| Salud del número 0–100 en el marcador              | Origen claro; rendimiento reciente y muestra en el detalle                                         | El score actual usa contestación y llamadas cortas; no demuestra reputación antispam |
| Una métrica de conversaciones por hora             | Volumen por usuario activo, productividad de sesión y conversión                                   | Permite ver si el usuario llama más y si eso produce valor                           |

Configuración sigue en `SettingsDialog`, con búsqueda y enlaces directos. El producto conserva llamadas entrantes, bandeja y agentes de recepción; el flujo saliente recibe la máxima prioridad de esta propuesta.

## 3. Cómo debe verse

Una aplicación de trabajo con densidad moderada, acciones reconocibles y posiciones estables. Mantener la identidad de Ringee, Inter, la familia de iconos existente y los temas claro y oscuro. Usar el teal para la acción principal y selección, con contraste verificado. El saldo pierde su protagonismo decorativo.

### Escritorio

```text
Ringee · Equipo Ventas                  Línea lista · Saldo $…
─────────────────────────────────────────────────────────────
Llamar       Llamar · Mi día / Listas / Campañas
Bandeja      Fuente: Seguimientos de hoy    Modo: Continuo
Contactos    24 disponibles · 3 para más tarde
Campañas     [ Empezar a llamar ]
Agenda       ────────────────────────────────────────────────
Historial    COLA          CONTACTO Y CONTEXTO     RESULTADO
Agentes IA   Ana          Ana Ruiz · Empresa      Interesado
Informes     Callback     Motivo de la llamada    Volver a llamar
             10:30        Última conversación     No interesado
             Luis         Guion / Historial       Otros
Números      Solicitud    Notas                   Próximo paso
Configuración             Origen · Hora · Tarifa
─────────────────────────────────────────────────────────────
Sesión activa · 12 intentos · 4 conversaciones · Terminar al cerrar
```

Proporción orientativa del área de trabajo: cola 25 %, contacto 45 %, resultado 30 %. En portátiles, reducir la cola antes que encoger textos. El teclado numérico se despliega cuando se necesita; no ocupa el espacio principal de una sesión con contactos.

**Lo permanente:** identidad del contacto, motivo, control de llamada, resultado, estado de sesión y forma de detenerla. **Lo secundario:** historial completo, edición extensa, opciones avanzadas, informes y configuración.

Filas de aproximadamente 44–48 px en listas compactas; el texto largo puede aumentar su altura. Texto principal de 14–16 px; controles táctiles de al menos 44 px como criterio de diseño. No recortar el motivo o la hora acordada para mantener una altura rígida.

### Móvil y ventanas estrechas

Una columna: contacto y llamada; resultado inmediatamente debajo. Cola en una vista secundaria con retorno que conserve posición. “Colgar” y “Terminar al cerrar” siguen disponibles. La pantalla prioriza llamadas puntuales y devoluciones; no intenta comprimir tres columnas. Diseñar primero para escritorio, donde se trabajarán las sesiones largas, verificando desde el principio teclado, zoom y móvil.

## 4. Tres formas de llamar, una experiencia reconocible

| Forma                 | Para qué sirve                                 | Comportamiento                                                                                              |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Llamada puntual       | Buscar, pegar un número o devolver una llamada | Llamar en el lugar actual; cierre sin iniciar otra llamada por sorpresa                                     |
| Revisar cada contacto | Leads que requieren preparación                | Mostrar el siguiente al guardar; el usuario decide cuándo marcar                                            |
| Continuo              | Trabajar una lista preparada                   | El usuario inicia la sesión; el siguiente intento se inicia al terminar y guardar correctamente el anterior |

“Revisar” y “Continuo” son etiquetas de UX para las capacidades existentes de `preview` y `progressive`. No se cambia silenciosamente el modo configurado por el administrador. Donde el usuario no pueda modificarlo, se muestra como estado, con explicación.

El modo continuo se activa explícitamente al iniciar. Se recuerda la preferencia dentro del workspace, pero abrir la aplicación, recuperar conexión o visitar una página no inicia llamadas. Reanudar requiere “Continuar sesión”.

Para llamadas personales, la primera entrega ofrece una cola y “Guardar y llamar al siguiente” mediante el flujo manual canónico. La continuidad automática personal requiere ampliar el propietario de sesiones existente y validar persistencia, concurrencia e idempotencia; es trabajo posterior con backend.

## 5. El ciclo que se optimiza

### A. Entrar y empezar

Al entrar, restaurar fuente y filtros del workspace. Mostrar arriba una acción concreta: **Continuar Seguimientos · 24 disponibles** o **Llamar a Ana · callback de las 10:30**.

Comprobar anticipadamente línea, micrófono, origen, permisos y saldo utilizando capacidades existentes. La comprobación previa informa; el servidor vuelve a validar al marcar. Si falta algo, mostrar una única corrección al lado del problema: “Permitir micrófono”, “Elegir número”, “Recargar” o “Pedir al administrador”.

El caso normal no abre un asistente ni pide confirmar cada llamada. Los avisos y confirmaciones existentes de DNC y número público se conservan. Una cola automática no debe aceptar esos avisos en nombre del usuario.

### B. Durante la llamada

Mantener en la misma pantalla:

- Nombre, empresa, motivo y una frase de la última interacción, identificando su origen.
- Guion y respuestas frecuentes accesibles desde el contexto, sin imponer lectura ni IA en vivo.
- Notas editables con borrador recuperable por llamada y workspace; “Guardado” solo después de confirmación del servidor.
- Resultado seleccionable mientras se habla; la selección no cuelga.
- Próximo paso únicamente cuando corresponde: callback con fecha, reunión o ninguno.
- Colgar, silenciar y teclado telefónico; detener la sesión después de esta llamada como acción distinta.

El resultado seleccionado muestra **Se guardará al terminar**. Si requiere fecha o datos adicionales, esos campos aparecen ahí mismo. El calendario no debe abrirse para elegir opciones comunes como “En 1 hora”; antes de guardar se ve la fecha, hora y zona exactas. No convertir la hora actual del agente en hora del destinatario sin datos fiables.

La ficha siguiente puede precargarse, pero no reservar un lead ni sustituir el contexto de la conversación actual. El historial largo y recursos secundarios no bloquean la llamada.

### C. Al terminar

**Caso 1: resultado completo durante la llamada.** Guardar al recibir el estado real de fin. La sesión progresiva avanza después de la aceptación del servidor. Cero acciones administrativas después de colgar. Este patrón ya existe en campañas y debe mantenerse.

**Caso 2: resultado pendiente.** Mostrar los resultados disponibles en posiciones estables. Elegir uno y pulsar **Guardar y continuar**. Objetivo: dos activaciones si no hay campos obligatorios adicionales. Un callback necesita fecha; una reunión necesita una reserva válida para llamarse confirmada.

**Caso 3: no hubo conversación.** Conservar el estado técnico recibido: no contestó, ocupado, fallo, etc. Reducir el registro manual cuando la configuración permita un mapeo inequívoco a un resultado. Esa automatización sería una regla de negocio del servidor, no una inferencia del frontend. No deducir “no interesado” ni “buzón” por duración corta.

**Caso 4: error al guardar.** Mantener resultado y notas, detener el avance y ofrecer reintentar. Nunca iniciar otra llamada porque visualmente se mostró un mensaje optimista de éxito.

### D. Continuar, detener y recuperar

La acción principal refleja el estado real: **Empezar**, **Llamar**, **Colgar**, **Guardar y continuar** o **Reanudar**. No cambia de posición ni de tamaño bruscamente. El control de colgar se distingue del control de continuidad.

En campaña, aprovechar `closeAfterLead` y la decisión transaccional de `closeSession` para **Terminar al cerrar esta llamada**. No sustituirla por una petición tardía desde el navegador, que podría llegar después de iniciada la siguiente. Pausar una sesión lista usa el endpoint existente; cualquier pausa al final de llamada con semántica nueva exige soporte equivalente en el servidor.

Si el usuario vuelve después de recargar, sincronizar el estado del servidor antes de ofrecer acciones. Si una llamada continúa, mostrarla. Si la lista terminó, presentar el resumen y **Elegir otra lista**; no empezar otra fuente por defecto.

Una espera opcional entre llamadas solo se incorporará si existe un estado de espera controlado por el servidor. No introducir una espera obligatoria de 30 segundos ni un temporizador visual que aparente bloquear al marcador progresivo.

## 6. Presupuesto de clics y pulsaciones

Son objetivos propuestos, no mediciones de la interfaz actual. Se cuenta cada activación de botón o atajo. Escribir una nota, completar datos, resolver permisos y aceptar avisos obligatorios se mide aparte y no se oculta para mejorar el número.

| Tarea y punto de partida                                       | Objetivo                 | Condiciones                                                                                             |
| -------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Empezar desde una cola preparada y visible                     | 1                        | Fuente, modo y requisitos ya resueltos                                                                  |
| Llamar a un contacto visible                                   | 1                        | Botón Llamar permanente; sin abrir ficha ni menú                                                        |
| Devolver una llamada perdida visible                           | 1                        | Acción junto al evento                                                                                  |
| Cerrar una llamada con resultado completo elegido durante ella | 0 acciones posteriores   | Fin real confirmado; el clic de elegir resultado y el de colgar sí se contabilizan en el ciclo completo |
| Cerrar con resultado simple pendiente                          | 2                        | Elegir resultado + Guardar y continuar                                                                  |
| Cerrar con callback pendiente y un horario predefinido         | 3                        | Resultado + horario + guardar; más si se edita fecha o nota                                             |
| Mostrar historial breve o guion                                | 0–1                      | Resumen visible; detalle local                                                                          |
| Añadir N contactos seleccionados a una cola compatible         | 1 después de seleccionar | El conteo y alcance de selección son explícitos                                                         |
| Detener después del contacto actual                            | 1                        | Acción confirmada dentro del cierre del servidor                                                        |
| Reanudar una sesión detenida y preparada                       | 1                        | Acción explícita; no llamada automática al volver                                                       |

Atajos: mostrar los disponibles junto a los botones. `1–9` mantiene el orden de resultados durante la sesión; Enter guarda cuando corresponde. Nunca actúan dentro de notas, campos editables, diálogos o teclado DTMF. Para atajos de una sola letra, limitar al área de trabajo y permitir desactivarlos o remapearlos. No dedicar Espacio o Escape globales a colgar o marcar.

El objetivo es **menos acciones y menos decisiones repetidas**, no desplazar todo a atajos que el usuario debe memorizar. La visibilidad de opciones y contexto sigue el principio de reconocimiento frente a recuerdo de [NN/g](https://www.nngroup.com/articles/recognition-and-recall/).

## 7. Cómo alimentar la siguiente llamada

### Mi día

Combinar callbacks, devoluciones pendientes y acciones existentes sin crear otra entidad de tareas. Cada fila indica por qué aparece y qué ocurrirá al actuar.

Propuesta inicial de orden: compromisos vencidos o que llegan a su hora; solicitudes recientes de contacto y llamadas perdidas pendientes; seguimientos sin hora pactada; prospección de una lista elegida. Validar el orden con usuarios. No borrar pendientes por superar 24 horas ni adelantar un callback de mañana para llenar la sesión.

Un contacto puede aparecer por varias razones; mostrar esas razones juntas cuando sea el mismo destinatario y contexto. No fusionar empresas, personas o líneas diferentes solo porque tengan el mismo nombre o teléfono compartido. Tras una llamada, actualizar las fuentes pertinentes sin dar por cumplida toda tarea relacionada.

La cola activa mantiene un orden estable. Nuevos elementos se anuncian como **3 nuevos pendientes**; no mueven el objetivo bajo el cursor ni reemplazan la persona que se estaba leyendo. La elegibilidad se vuelve a validar al tomar el siguiente.

### Contactos y listas

Filtros guardados, búsqueda, selección múltiple y **Llamar a la lista**. Antes de empezar: “32 seleccionados · 27 disponibles · 5 excluidos”, con motivos consultables. Añadir a una sesión no significa llamar inmediatamente ni completar las tareas de origen.

Primera versión: llevar selecciones a campañas mediante capacidades existentes, con configuración recordada por workspace y permisos. Confirmar qué parte del flujo masivo ya está disponible antes de prometer un lanzamiento en un clic. Las listas personales continuas son la ampliación posterior descrita en la sección 4.

No perder posición, selección o filtros al abrir una ficha o terminar una llamada. Mostrar **Llamar** de forma permanente; usar un panel lateral para ampliar contexto y conservar la página completa para edición extensa.

### Campañas

Entrada visible **Continuar** y estado operativo: disponibles ahora, fuera de horario, sin origen o sin contactos. Extender el checklist de preparación existente. Usar la misma disposición de contexto, notas y resultados que en Llamar.

Una campaña activa conserva su fuente. Las devoluciones nuevas se notifican sin mezclar de forma silenciosa dos motores o sesiones. Para cambiar, terminar o pausar correctamente la fuente actual.

### Bandeja y agentes IA

Devolver o añadir un seguimiento desde el hilo. Los agentes IA pueden producir contexto o acciones ya soportadas, identificando autoría y origen. Las sugerencias no generan compromisos sin elección del usuario o una automatización configurada. Separar claramente nota interna y mensaje al contacto.

Los usuarios que gestionan recepción o agentes IA pueden elegir su inicio. No forzarles una campaña de ventas ni añadir los contadores de llamadas IA al rendimiento de un agente humano.

## 8. Confianza sin fricción repetitiva

- **Origen:** mostrar número y estrategia real de selección. Recordar la preferencia por workspace y validarla al usarla.
- **Hora del destinatario:** mostrarla si se conoce; si es estimada, indicarlo y permitir corregirla. País o prefijo no garantizan una zona horaria única. No imponer un horario universal de 8–21 desde la UI; mandan las políticas existentes.
- **Coste:** tarifa orientativa del backend antes de marcar; coste liquidado después, o “Calculando”. Sin estimar créditos disponibles como garantía de minutos exactos.
- **Rendimiento del número:** mostrar ventana temporal y tamaño de muestra; “Sin datos suficientes” cuando corresponda. No presentar `healthScore` como identidad verificada ni detección de spam.
- **Feedback:** respuesta visual local inmediata, con objetivo de unos 100 ms en la interacción; distinguir “Preparando”, “Marcando”, “Conectada” y “Guardando”. Los hitos telefónicos y de persistencia esperan evidencia real. [NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/) fundamenta la importancia del tiempo de respuesta, no una promesa de conexión en 100 ms.
- **Accesibilidad:** foco visible, orden lógico, controles con nombre, zoom y estados con texto. El tamaño táctil de 44 px es un criterio de diseño propio; [WCAG 2.2 AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) establece 24 px con excepciones para su criterio mínimo.

## 9. Que el usuario quiera volver a llamar

El hábito se construye con facilidad para continuar y resultados reconocibles:

1. Inicio con la próxima acción concreta y la última lista utilizada.
2. Progreso discreto de sesión: contactos trabajados, conversaciones y resultados confirmados.
3. Resumen al terminar: qué se logró, qué queda y cuándo es el próximo compromiso.
4. Preferencia opcional de objetivo de actividad, sin imponer cuotas ni confeti por cada intento.
5. Onboarding que termina cuando el usuario ha realizado una llamada y entiende cómo seguir: contacto o número → línea lista → llamada → resultado → siguiente.

Para usuarios nuevos, explicar el modo continuo una vez y mantener su estado visible. Para usuarios recurrentes, restaurar sus decisiones válidas. Evitar recompensar reintentos vacíos o llamadas repetidas al mismo destinatario como si fueran nuevos contactos trabajados.

## 10. Entregas en orden de impacto

Los tamaños son relativos; no equivalen a un calendario comprometido. Estimar cada entrega con sus contratos y criterios de aceptación antes de programarla.

| Entrega                       | Alcance                                                                                                                       | Dependencia                                                | Criterio de salida                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 · Llamar sin buscar botones | Llamar visible en contactos y bandeja; inicio útil; textos vacíos; acceso directo a campañas; mantener filtros y posición     | Principalmente UI y flujos manuales existentes             | Las tres tareas de llamada puntual se hacen con una activación desde el elemento visible, salvo avisos existentes |
| 2 · Sesión fluida             | Mejorar el workspace de campañas: contexto, resultado en vivo, próximo paso visible, detener al cerrar, atajos y recuperación | Motor progresivo/preview, guardado y eventos existentes    | Diez contactos seguidos sin volver a listados ni perder datos; fallo de guardado no avanza                        |
| 3 · Más fuentes preparadas    | Mi día agregado, selección a campañas, continuidad explícita desde cola manual y persistencia de posición                     | Agregación, deduplicación, permisos y contratos que falten | Cola estable, selección clara y sin duplicar intentos al reintentar                                               |
| 4 · Automatizar lo repetitivo | Mapeo autorizado de finales técnicos; listas personales continuas; espera opcional controlada por servidor si aporta valor    | Reglas de negocio y ampliación del propietario de sesiones | Ningún avance antes del cierre válido; parar, reanudar y cambiar de dispositivo se comportan correctamente        |
| 5 · Asistencia y pulido       | Sugerencias de notas/resultados con IA; agrupación Agenda/Historial; números y editor IA                                      | Capacidad real, costes e instrumentación                   | Ahorro medido sin empeorar precisión ni conversión                                                                |

**Primera apuesta recomendada: entregas 1 y 2.** Ponen el camino rápido frente al usuario y explotan capacidades ya existentes. El cambio completo de navegación, el editor IA y los informes detallados no deben retrasar ese resultado.

## 11. Qué ya existe y quién debe evolucionarlo

Inspección de código realizada el 30 de septiembre; son capacidades verificadas en la implementación, no pruebas de uso ni métricas de producción.

| Capacidad                                                | Propietario actual                                                                              | Trabajo propuesto                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Llamada manual en contexto y comprobaciones comunes      | `apps/frontend/src/features/calls/hooks/use.dial.ts`                                            | Reutilizar desde acciones visibles; no introducir otro camino de marcado         |
| Cola y llamar al callback vencido siguiente              | `apps/frontend/src/features/calls/components/dialer-side-panel/dialer-side-panel.tsx`           | Ampliar presentación y fuentes; el botón actual solo resuelve callbacks vencidos |
| Workspace de campañas                                    | `apps/frontend/src/features/dialer/components/agent-workspace.tsx`                              | Mejorar jerarquía y contexto sin recrear motor ni estado                         |
| Resultado durante llamada, atajos y guardado al terminar | `apps/frontend/src/features/dialer/components/disposition-panel.tsx`                            | Hacer visible la preparación y mantener los campos obligatorios                  |
| Guardado canónico y cierre después del lead              | `apps/frontend/src/features/dialer/hooks/use-dispose-lead.ts` y `store/dialer-session.store.ts` | Conservar la decisión de avance dentro del guardado del servidor                 |
| Llamada activa y cierre compartidos                      | `packages/dialer-ui`                                                                            | Patrón e idioma coherentes; revisar consumidores web y extensión                 |
| Preparación de campaña                                   | `apps/frontend/src/features/campaigns/components/campaign-readiness.tsx`                        | Exponer bloqueos antes de entrar a la sesión                                     |
| Rendimiento y rotación                                   | `packages/services/src/services/caller-id-rotation/caller-id-rotation.service.ts`               | Presentar datos con su significado real                                          |
| Configuración                                            | `features/settings` y `SettingsDialog`                                                          | Mantener modal y enlaces; mejorar descubrimiento                                 |

Una apariencia común no exige fusionar el marcado manual con el motor de campaña. Mantener sus propietarios y compartir componentes donde corresponda. La lógica de elegibilidad, seguimiento automático y avance pertenece a `@ringee/services`; la UI no decide reglas nuevas.

Se mantienen CALL-001, CMP-004, CMP-005, CMP-011 y CMP-012: concurrencia, horarios, DNC por ámbito, transición transaccional de sesión y un lead por agente. Toda mutación de créditos sigue pasando por `CreditService`. Las rutas y contratos existentes siguen funcionando.

## 12. Cómo saber si realmente aumenta las llamadas

### Medir el ciclo, no solo los clics

Registrar: abrir espacio de llamadas, iniciar/reanudar sesión, solicitar marcado, marcado aceptado, conexión, fin, resultado persistido, siguiente intento, pausa/fin de sesión y error. Usar correlaciones entre sesión, intento y llamada para deduplicar; no enviar teléfonos, notas ni transcripciones a analítica.

Medir por separado preparación inicial, tiempo telefónico, conversación, cierre administrativo y espera voluntaria. La diferencia entre dos timestamps de llamadas no basta para saber si el agente estaba trabajando o descansando.

| Métrica                                                             | Qué responde                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Intentos y destinatarios únicos por usuario activo por semana       | ¿Llama más y alcanza a más personas?                             |
| Intentos por hora de sesión activa                                  | ¿Aumentó el ritmo dentro del flujo?                              |
| Mediana y p90 entre fin de llamada y siguiente intento              | ¿Dónde sigue la fricción? Separar pausas voluntarias             |
| Tiempo hasta la primera solicitud de marcado                        | ¿Es más fácil empezar? Separar onboarding y usuarios recurrentes |
| Activaciones por ciclo completo y cambios de página                 | ¿Se redujo trabajo, incluso si se trasladó a durante la llamada? |
| Conversaciones útiles y reuniones/ventas verificadas                | ¿El mayor volumen produce resultados?                            |
| Coste por resultado, errores, duplicados y seguimientos incumplidos | ¿La mejora se sostiene sin degradar la operación?                |

“Respondida” es un estado técnico, no prueba de conversación humana útil. La métrica comercial usa resultado validado; las ventas requieren un registro o integración verificable y una ventana de atribución definida. Si no existe esa fuente, medir reuniones u otro resultado disponible y declarar la limitación. Segmentar humano/IA, personal/equipo, entrante/saliente y tipo de campaña.

### Validación y metas iniciales

Antes de cambiar, instrumentar o cronometrar los mismos recorridos. Hacer una prueba de diseño con 5–8 usuarios que incluyan vendedores nuevos y recurrentes; sirve para descubrir fricción, no para demostrar aumento de ventas. Después, piloto por workspaces comparables, evitando que cambios de lista o calidad del lead se atribuyan al diseño.

Objetivos iniciales a calibrar contra esa línea base: reducir al menos 30 % el tiempo administrativo mediano entre llamadas y alcanzar los presupuestos de interacción de la sección 6, sin empeorar resultados por conversación ni fiabilidad. No son resultados obtenidos ni garantías.

Ejemplo puramente ilustrativo: con 90 segundos de ciclo telefónico medio y 30 administrativos caben 30 intentos/hora; con los mismos 90 y 10 administrativos caben 36. La mejora sería 20 % manteniendo lo demás constante. No describe datos reales de Ringee ni implica 20 % más ventas.

Pruebas de aceptación: completar diez contactos, callback con fecha, pausa durante conversación, fallo de guardado, reconexión, otra pestaña, lista agotada, contacto inelegible, cambio de workspace y uso completo por teclado. Al implementar, ejecutar las verificaciones correspondientes de frontend, dialer y servicios que realmente se modifiquen.

## 13. Base de investigación y límites

La propuesta combina observaciones del plan inicial, el plan alternativo, la implementación actual y criterio de diseño de producto. No se ha medido todavía el impacto en usuarios reales. El artefacto público de Claude no estuvo accesible mediante la herramienta de lectura web; se tomó como referencia el documento local indicado por el usuario.

Referencias aplicadas, consultadas el 30 de septiembre de 2026:

- [Close: Using the Power Dialer](https://help.close.com/feature-guide/power-predictive-dialing/using-the-power-dialer): patrón de trabajo desde una lista, control de continuidad y reanudación. Inspira la sesión; no demuestra un aumento concreto para Ringee.
- [NN/g: Recognition and Recall](https://www.nngroup.com/articles/recognition-and-recall/): contexto y acciones visibles, incluidos los atajos que aceleran sin obligar a memorizarlos.
- [NN/g: Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/): reducir esperas percibidas y dar feedback inmediato sin adelantar estados reales.
- [W3C: Keyboard Control](https://www.w3.org/WAI/WCAG22/Techniques/general/G202) y [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum): acceso mediante teclado y objetivos accionables.

Las cifras comerciales y las generalizaciones regulatorias del plan alternativo no se usan como requisitos de esta propuesta. No hace falta asumirlas para justificar el cambio: el cuello de botella que queremos reducir es el trabajo que Ringee exige para preparar y completar cada intento.
