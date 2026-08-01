# Ringee Dialer SDK

SDK de navegador para integrar llamadas salientes de Ringee dentro de un CRM,
backoffice o aplicación web.

El paquete ofrece tres formas de integración:

1. **Floating:** botón flotante que abre un marcador completo.
2. **Bar:** marcador inline dentro de un elemento de la página.
3. **Headless:** motor sin interfaz para construir una experiencia propia.

Las interfaces incluidas no dependen de React: se renderizan en un Shadow DOM,
funcionan con JavaScript, TypeScript o cualquier framework, incluyen español e
inglés y se pueden personalizar. El SDK encapsula WebRTC y Telnyx; la aplicación
host no maneja credenciales SIP ni tokens de Telnyx.

> Este paquete es exclusivamente para navegador. No debe inicializarse en un
> servidor de Node.js, Server Component, API route o proceso SSR.

## Contenido

- [Elegir una integración](#elegir-una-integración)
- [Requisitos](#requisitos)
- [Preparar la integración](#preparar-la-integración)
- [Opción 1: Floating](#opción-1-floating)
- [Opción 2: Bar inline](#opción-2-bar-inline)
- [Opción 3: Headless](#opción-3-headless)
- [React y Next.js](#react-y-nextjs)
- [Contactos del CRM](#contactos-del-crm)
- [Personalización](#personalización)
- [Referencia de la API](#referencia-de-la-api)
- [Cómo funciona internamente](#cómo-funciona-internamente)
- [Seguridad](#seguridad)
- [Troubleshooting](#troubleshooting)

## Elegir una integración

| Modalidad        | Cuándo usarla                         | Inicialización | Interfaz               |
| ---------------- | ------------------------------------- | -------------- | ---------------------- |
| Floating con CDN | Prueba rápida o página sin build      | Automática     | Botón flotante + panel |
| Floating con npm | SPA o aplicación con bundler          | Automática     | Botón flotante + panel |
| Bar con CDN/npm  | Toolbar, sidebar o ficha de contacto  | Automática     | Marcador inline        |
| Headless         | Diseño y lógica completamente propios | Manual         | Ninguna                |

La recomendación general es empezar con **Floating**. Use **Bar** cuando el CRM
ya tenga una zona reservada para telefonía y **Headless** únicamente cuando
necesite controlar todos los estados, formularios y mensajes.

### Lo que no incluye esta versión

- No existe todavía un URL público de Ringee para insertar directamente con
  `<iframe src="...">`.
- No existe todavía un loader automático mediante atributos
  `data-ringee-key`/`data-ringee-mode`.
- No existe un paquete React separado. El SDK actual puede usarse desde React
  mediante `useEffect`, como se muestra más adelante.

Es posible ejecutar el SDK dentro de un iframe creado por la aplicación host,
pero la aplicación debe cargar y controlar el paquete dentro de ese documento.
El iframe necesita su propio origen autorizado, acceso al micrófono y storage;
esta versión no proporciona un puente `postMessage` listo para usar.

## Requisitos

Antes de integrar el marcador se necesita:

- una integración personalizada activa en Ringee;
- una publishable key `pk_live_...` con el origen del CRM autorizado;
- un agente de Ringee con acceso al workspace de la integración;
- al menos un caller ID disponible para el agente/workspace;
- crédito y permisos suficientes para llamar;
- una página servida por HTTPS en producción, necesario para el micrófono;
- un navegador moderno con WebRTC y `navigator.mediaDevices`.

Los números de destino deben enviarse en formato **E.164**, por ejemplo
`+13055550198`, `+34911234567` o `+18095550123`.

## Preparar la integración

### 1. Crear o elegir una integración personalizada

La forma recomendada es hacerlo desde el dashboard de Ringee. También existe la
ruta administrativa:

```http
POST /api/integrations/custom
Authorization: Bearer <sesion-de-administrador>
Content-Type: application/json

{
  "name": "Mi CRM"
}
```

Crear y administrar integraciones requiere una sesión de Ringee con permisos de
administrador. No debe hacerse desde el navegador público del CRM.

### 2. Crear una publishable key

Solicite una publishable key desde un backend o cliente administrativo
autenticado, indicando todos los orígenes exactos donde se cargará el SDK:

```http
POST /api/integrations/custom/<integrationId>/publishable-keys
Authorization: Bearer <sesion-de-administrador>
Content-Type: application/json

{
  "allowedOrigins": [
    "https://crm.example.com",
    "http://localhost:5173"
  ]
}
```

Respuesta:

```json
{
  "publishableKey": "pk_live_xxxxx",
  "integrationId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "apiKeyPrefix": "cik_live_a1b2c3d4",
  "allowedOrigins": ["https://crm.example.com", "http://localhost:5173"]
}
```

Los orígenes se comparan de forma exacta:

- `https://crm.example.com` no autoriza `http://crm.example.com`;
- `https://crm.example.com` no autoriza `https://app.crm.example.com`;
- `http://localhost:5173` no autoriza `http://localhost:3000`;
- no se aceptan paths, queries, credenciales ni wildcards.

Cada combinación de protocolo, host y puerto debe añadirse explícitamente.

### 3. Usar la clave correcta

| Clave          | Dónde se usa                       | ¿Puede estar en frontend? |
| -------------- | ---------------------------------- | ------------------------- |
| `pk_live_...`  | SDK del marcador                   | Sí                        |
| `cik_live_...` | API privada de Custom Integrations | **No**                    |

La publishable key identifica una instalación y sus orígenes autorizados. No
identifica ni autentica por sí sola a un agente. La identidad se verifica con un
código de un solo uso enviado al correo del agente.

Rotar la clave secreta `cik_live_...` revoca automáticamente todas las
publishable keys asociadas. Deshabilitar la integración también las invalida.

## Instalar con npm

```bash
npm install @ringee-io/dialer-sdk
```

También puede usarse `pnpm add` o `yarn add`.

## Opción 1: Floating

Floating monta un botón en la esquina de la página. Al abrirlo, el agente puede
autenticarse, elegir el caller ID, escribir un número y controlar la llamada.

### CDN: un script, sin build

```html
<script src="https://unpkg.com/@ringee-io/dialer-sdk"></script>
<script>
  const ringee = Ringee.mount({
    key: "pk_live_xxxxx",
    locale: "es",
    side: "right",
  });
</script>
```

`Ringee.mount(options)` es un alias de `Ringee.createFloating(options)`.

En producción se recomienda fijar una versión para que un deploy del host no
reciba cambios inesperados:

```html
<script src="https://unpkg.com/@ringee-io/dialer-sdk@0.1.0/dist/ringee.global.js"></script>
```

### npm

```ts
import { createFloating } from "@ringee-io/dialer-sdk/ui";

const ringee = createFloating({
  key: "pk_live_xxxxx",
  agentEmail: currentUser.email,
  locale: "es",
  side: "right",
  defaultOpen: false,
  rememberOpen: true,
  allowHold: true,
});
```

La UI llama a `initialize()` automáticamente. `agentEmail` solamente prellena el
campo: Ringee siempre exige que el agente demuestre acceso al correo mediante
OTP.

### Abrir, cerrar y lanzar llamadas desde el CRM

```ts
ringee.open();
ringee.close();
ringee.toggle();

ringee.setContact({
  name: "Marcos Herrera",
  number: "+13055550142",
  externalContactId: "crm-contact-294",
});

// Abre el panel y coloca la llamada cuando el agente esté autenticado y listo.
ringee.startCall({
  to: "+13055550142",
  name: "Marcos Herrera",
  externalContactId: "crm-contact-294",
});
```

`startCall()` puede invocarse antes de que finalice la restauración de sesión.
La UI conserva la llamada solicitada y la inicia al llegar a la pantalla
`ready`. Si el agente aún no está autenticado, primero mostrará el flujo de OTP.

## Opción 2: Bar inline

Bar renderiza el marcador dentro de un contenedor. Su ancho se adapta al ancho
disponible y no crea un launcher flotante.

### CDN

```html
<div id="ringee-bar"></div>

<script src="https://unpkg.com/@ringee-io/dialer-sdk"></script>
<script>
  const ringeeBar = Ringee.createBar({
    key: "pk_live_xxxxx",
    container: "#ringee-bar",
    locale: "es",
  });

  ringeeBar.setContact({
    name: "Ana Torres",
    number: "+34911234567",
    externalContactId: "contact-802",
  });
</script>
```

### npm

```ts
import { createBar } from "@ringee-io/dialer-sdk/ui";

const ringeeBar = createBar({
  key: "pk_live_xxxxx",
  container: document.getElementById("ringee-bar")!,
  agentEmail: currentUser.email,
  locale: "es",
});
```

`container` acepta un `HTMLElement`, un id (`"ringee-bar"`), o un selector CSS
(`"#sidebar .dialer"`). Si el elemento no existe al llamar `createBar`, el SDK
lanza un error.

## Opción 3: Headless

Headless expone autenticación, llamadas, dispositivos y eventos sin renderizar
ninguna UI. La aplicación debe construir las pantallas y responder a cada
estado.

```ts
import { RingeeDialer, RingeeError } from "@ringee-io/dialer-sdk";

const dialer = new RingeeDialer({
  key: "pk_live_xxxxx",
  debug: false,
});

// Suscribirse antes de initialize() evita perder los primeros estados.
dialer.on("authStateChanged", ({ state }) => renderAuthState(state));
dialer.on("stateChanged", ({ state }) => renderCallState(state));
dialer.on("authRequired", () => showEmailForm());
dialer.on("ready", () => enableDialButton());
dialer.on("answered", ({ call }) => startTimer(call.answeredAt));
dialer.on("ended", ({ call }) => showSummary(call));
dialer.on("failed", ({ error }) => showError(error.code, error.message));

try {
  await dialer.initialize();
} catch (error) {
  if (error instanceof RingeeError) {
    showError(error.code, error.message);
  }
}
```

`initialize()` puede resolver con el agente autenticado o anónimo:

- si encuentra una sesión válida en `sessionStorage`, la restaura y emite
  `signedIn` y `ready`;
- si no existe una sesión, emite `authRequired` y espera el flujo OTP.

### Autenticación OTP

```ts
const challenge = await dialer.requestEmailCode("agent@company.com");

// challenge.id debe conservarse hasta verificar o reenviar.
const agent = await dialer.verifyEmailCode({
  challengeId: challenge.id,
  code: "184279",
});

console.log("Agente autenticado", agent.email);
```

Para reenviar el código:

```ts
const nextChallenge = await dialer.resendEmailCode(challenge.id);
```

Respete `challenge.resendAvailableAt` para deshabilitar temporalmente el botón
de reenvío, y `challenge.expiresAt` para mostrar la expiración.

### Colocar y controlar una llamada

```ts
const call = await dialer.call({
  to: "+13055550198",
  callerIdId: selectedCallerId,
  externalContactId: "crm-contact-294",
});

dialer.mute();
dialer.unmute();
await dialer.hold();
await dialer.resume();
dialer.sendDigits("123#");
await dialer.hangup();
```

Solo puede existir una llamada activa por instancia/agente. Ringee también
intenta impedir llamadas simultáneas desde distintas pestañas mediante Web
Locks y vuelve a validarlo en el servidor.

### Cerrar sesión y destruir la instancia

```ts
await dialer.signOut(); // elimina la sesión del agente
await dialer.destroy(); // desconecta WebRTC y libera recursos del navegador
```

`signOut()` y `destroy()` tienen propósitos diferentes. Destruir la instancia no
es el mecanismo para cerrar la sesión persistida; cerrar sesión sí elimina el
token guardado.

## React y Next.js

Monte el SDK después de que exista el DOM y destrúyalo al desmontar el
componente. En Next.js, la importación dinámica dentro de `useEffect` garantiza
que el paquete de navegador no se ejecute durante SSR.

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { FloatingController } from "@ringee-io/dialer-sdk/ui";

export function RingeeDialer({ email }: { email: string }) {
  const controller = useRef<FloatingController | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import("@ringee-io/dialer-sdk/ui").then(({ createFloating }) => {
      if (cancelled) return;

      controller.current = createFloating({
        key: process.env.NEXT_PUBLIC_RINGEE_KEY!,
        agentEmail: email,
        locale: "es",
      });
    });

    return () => {
      cancelled = true;
      const current = controller.current;
      controller.current = null;
      if (!current) return;

      current.destroy();
      void current.dialer.destroy();
    };
  }, [email]);

  return null;
}
```

Para Bar, renderice primero el contenedor y créelo dentro del efecto:

```tsx
export function RingeeBar() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    let mounted = true;
    let cleanup: (() => void) | undefined;

    void import("@ringee-io/dialer-sdk/ui").then(({ createBar }) => {
      if (!mounted || !container.current) return;
      const bar = createBar({
        key: process.env.NEXT_PUBLIC_RINGEE_KEY!,
        container: container.current,
      });
      cleanup = () => {
        bar.destroy();
        void bar.dialer.destroy();
      };
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  return <div ref={container} />;
}
```

## Contactos del CRM

Ringee puede asociar la llamada con el contacto mostrado por la aplicación host.

```ts
ringee.setContact({
  name: "Marcos Herrera",
  number: "+13055550142",
  imageUrl: "https://crm.example.com/avatars/294.png",
  externalContactId: "crm-contact-294",
});
```

| Campo               | Uso                                 |
| ------------------- | ----------------------------------- |
| `name`              | Etiqueta visual en la UI            |
| `number`            | Prellena el destino                 |
| `imageUrl`          | Avatar visual en la UI              |
| `contactId`         | ID de un contacto nativo de Ringee  |
| `externalContactId` | ID del contacto en el CRM integrado |

Use `contactId` cuando ya conoce el UUID interno de Ringee. Use
`externalContactId` cuando la integración mantiene un vínculo entre el ID del
CRM y un contacto de Ringee. No es necesario enviar ambos.

Si solo quiere precargar un número:

```ts
ringee.prefill("+13055550142");
```

## Personalización

### Idioma

```ts
createFloating({
  key: "pk_live_xxxxx",
  locale: "es", // "es" por defecto; también "en"
});
```

### Textos

`strings` permite reemplazar etiquetas individuales sobre el idioma elegido:

```ts
createBar({
  key: "pk_live_xxxxx",
  container: "#ringee-bar",
  locale: "es",
  strings: {
    callButton: "Marcar ahora",
    numberLabel: "Teléfono del prospecto",
  },
});
```

Los códigos de error del backend se traducen a mensajes accionables en las UIs
incluidas. En modo headless, la aplicación decide cómo presentarlos.

### Tema

```ts
const ringee = createFloating({
  key: "pk_live_xxxxx",
  theme: {
    primary: "#4f46e5",
    primaryHover: "#4338ca",
    onPrimary: "#ffffff",
    radius: "14px",
    fontFamily: "Inter, sans-serif",
    colorScheme: "auto",
  },
});

// El tema también puede cambiarse después del montaje.
ringee.setTheme({
  primary: "#0f766e",
  colorScheme: "dark",
});
```

`colorScheme` acepta `"auto"`, `"light"` o `"dark"`. Los campos disponibles
son:

- `primary`, `primaryHover`, `onPrimary`;
- `background`, `surface`, `text`, `textMuted`, `border`;
- `danger`, `success`, `warning`;
- `radius`, `shadow`, `fontFamily`;
- `colorScheme`.

Los mismos valores se exponen como custom properties:

```css
#crm-shell {
  --ringee-primary: #4f46e5;
  --ringee-primary-hover: #4338ca;
  --ringee-on-primary: #ffffff;
  --ringee-background: #ffffff;
  --ringee-surface: #f8fafc;
  --ringee-text: #0f172a;
  --ringee-text-muted: #64748b;
  --ringee-border: #e2e8f0;
  --ringee-danger: #dc2626;
  --ringee-success: #16a34a;
  --ringee-warning: #d97706;
  --ringee-radius: 14px;
  --ringee-shadow: 0 20px 50px rgb(15 23 42 / 18%);
  --ringee-font-family: Inter, sans-serif;
}
```

## Referencia de la API

### Opciones comunes de las UIs

| Opción          | Tipo               | Default                 | Descripción                                  |
| --------------- | ------------------ | ----------------------- | -------------------------------------------- |
| `key`           | `string`           | requerida               | Publishable key `pk_live_...`                |
| `apiUrl`        | `string`           | `https://api.ringee.io` | Base de la API, sin `/api` al final          |
| `agentEmail`    | `string`           | —                       | En las UIs, prellena el correo; no autentica |
| `debug`         | `boolean`          | `false`                 | Activa logs detallados del motor             |
| `dialer`        | `RingeeDialer`     | —                       | Reutiliza una instancia headless             |
| `theme`         | `RingeeTheme`      | tema Ringee             | Personaliza colores y medidas                |
| `locale`        | `string`           | `"es"`                  | Idioma `es` o `en`                           |
| `strings`       | `Partial<Strings>` | —                       | Reemplaza textos puntuales                   |
| `allowHold`     | `boolean`          | `false`                 | Muestra Hold/Resume                          |
| `workspaceName` | `string`           | —                       | Nombre mostrado en el footer                 |
| `onError`       | `(error) => void`  | —                       | Recibe errores que la UI también muestra     |

Floating añade:

| Opción         | Tipo                | Default         | Descripción                     |
| -------------- | ------------------- | --------------- | ------------------------------- |
| `side`         | `"left" \| "right"` | `"right"`       | Lado del launcher               |
| `defaultOpen`  | `boolean`           | `false`         | Abre inicialmente el panel      |
| `rememberOpen` | `boolean`           | `true`          | Recuerda apertura en la pestaña |
| `container`    | `HTMLElement`       | `document.body` | Padre donde monta el Shadow DOM |

Bar requiere `container: HTMLElement | string`.

### Controladores de UI

| Método/propiedad      | Floating | Bar | Descripción                      |
| --------------------- | :------: | :-: | -------------------------------- |
| `dialer`              |    Sí    | Sí  | Instancia headless subyacente    |
| `open()`              |    Sí    |  —  | Abre el panel                    |
| `close()`             |    Sí    |  —  | Cierra el panel                  |
| `toggle()`            |    Sí    |  —  | Alterna el panel                 |
| `startCall(input)`    |    Sí    |  —  | Abre y encola/inicia una llamada |
| `setContact(contact)` |    Sí    | Sí  | Adjunta el contacto actual       |
| `prefill(number)`     |    Sí    | Sí  | Prellena el número               |
| `setTheme(theme)`     |    Sí    | Sí  | Cambia el tema                   |
| `on(event, handler)`  |    Sí    | Sí  | Suscribe un evento headless      |
| `destroy()`           |    Sí    | Sí  | Retira la UI y sus listeners     |

`controller.destroy()` retira la superficie visual, pero no destruye
automáticamente la instancia headless. Para liberar también WebRTC, audio y el
lock de llamada:

```ts
controller.destroy();
await controller.dialer.destroy();
```

Si pasó un `dialer` compartido en las opciones, destrúyalo solamente cuando ya
ningún otro componente lo use.

### Métodos de `RingeeDialer`

| Método                         | Resultado                 | Uso                                                      |
| ------------------------------ | ------------------------- | -------------------------------------------------------- |
| `initialize()`                 | `Promise<void>`           | Valida instalación y restaura sesión                     |
| `destroy()`                    | `Promise<void>`           | Desconecta y libera recursos                             |
| `requestEmailCode(email)`      | `Promise<EmailChallenge>` | Inicia OTP                                               |
| `verifyEmailCode(input)`       | `Promise<RingeeAgent>`    | Verifica OTP                                             |
| `resendEmailCode(challengeId)` | `Promise<EmailChallenge>` | Reenvía OTP                                              |
| `signOut()`                    | `Promise<void>`           | Cierra sesión del agente                                 |
| `getAuthState()`               | `AuthState`               | Estado de autenticación actual                           |
| `getAgent()`                   | `RingeeAgent \| null`     | Agente autenticado                                       |
| `getCallerIds()`               | `RingeeCallerId[]`        | Caller IDs autorizados                                   |
| `call(input)`                  | `Promise<RingeeCall>`     | Autoriza e inicia llamada                                |
| `hangup()`                     | `Promise<void>`           | Termina llamada                                          |
| `mute()` / `unmute()`          | `void`                    | Controla micrófono durante llamada                       |
| `hold()` / `resume()`          | `Promise<void>`           | Controla espera                                          |
| `sendDigits(digits)`           | `void`                    | Envía DTMF                                               |
| `getState()`                   | `DialerState`             | Estado actual del marcador                               |
| `getActiveCall()`              | `RingeeCall \| null`      | Snapshot de la llamada activa                            |
| `getInputDevices()`            | `Promise<AudioDevice[]>`  | Enumera micrófonos                                       |
| `getOutputDevices()`           | `Promise<AudioDevice[]>`  | Enumera salidas                                          |
| `setInputDevice(id)`           | `Promise<void>`           | Guarda la entrada preferida y la valida al pedir permiso |
| `setOutputDevice(id)`          | `Promise<void>`           | Selecciona salida donde el navegador lo soporte          |
| `on(event, handler)`           | `() => void`              | Suscribe y devuelve unsubscribe                          |

### Estados de autenticación

```text
checking -> anonymous -> sending_code -> awaiting_code -> verifying
                                                     -> authenticated
                                                     -> error
authenticated -> expired | signed_out
```

Valores posibles de `AuthState`:

`checking`, `anonymous`, `sending_code`, `awaiting_code`, `verifying`,
`authenticated`, `expired`, `signed_out`, `error`.

### Estados de llamada

```text
uninitialized -> initializing -> ready -> dialing -> ringing -> active
                                      -> error                 -> held
active | held -> reconnecting -> active
active | held -> ending -> ended -> ready
```

Valores posibles de `DialerState`:

`uninitialized`, `initializing`, `ready`, `connecting`, `dialing`, `ringing`,
`active`, `held`, `reconnecting`, `ending`, `ended`, `error`.

La secuencia exacta puede saltar estados según el navegador, la red o la
respuesta del destino. La UI no debe asumir que siempre recibirá todos.

### Eventos

Toda suscripción devuelve una función para desuscribirse:

```ts
const off = dialer.on("stateChanged", ({ state }) => {
  console.log(state);
});

off();
```

| Evento             | Payload           | Momento                                                 |
| ------------------ | ----------------- | ------------------------------------------------------- |
| `ready`            | `{}`              | WebRTC y agente listos                                  |
| `authStateChanged` | `{ state }`       | Cambia autenticación                                    |
| `authRequired`     | `{}`              | Se necesita OTP                                         |
| `codeSent`         | `{ challenge }`   | Código enviado/reenviado                                |
| `signedIn`         | `{ agent }`       | Agente autenticado                                      |
| `signedOut`        | `{}`              | Sesión cerrada                                          |
| `sessionExpired`   | `{}`              | Sesión vencida                                          |
| `stateChanged`     | `{ state }`       | Cambia estado de llamada                                |
| `dialing`          | `{ call }`        | Comienza a marcar                                       |
| `ringing`          | `{ call }`        | Destino sonando                                         |
| `answered`         | `{ call }`        | Llamada contestada                                      |
| `held`             | `{ call }`        | Llamada en espera                                       |
| `resumed`          | `{ call }`        | Llamada reanudada                                       |
| `muted`            | `{ call }`        | Micrófono silenciado                                    |
| `unmuted`          | `{ call }`        | Micrófono habilitado                                    |
| `ended`            | `{ call }`        | Llamada finalizada normalmente                          |
| `failed`           | `{ call, error }` | Falló autorización o llamada                            |
| `tokenExpiring`    | `{}`              | Reservado para renovación anticipada de credenciales    |
| `microphoneDenied` | `{}`              | Reservado; actualmente use `error`/`failed` y su código |
| `deviceChanged`    | `{}`              | Cambió selección de audio                               |
| `error`            | `{ error }`       | Error general tipado                                    |

### Errores

Las promesas rechazadas usan `RingeeError`:

```ts
import { RingeeError } from "@ringee-io/dialer-sdk";

try {
  await dialer.call({ to: "+13055550198" });
} catch (error) {
  if (error instanceof RingeeError) {
    console.log(error.code);
    console.log(error.message);
    console.log(error.retryable);
  }
}
```

Códigos frecuentes:

- instalación: `INVALID_PUBLISHABLE_KEY`, `DOMAIN_NOT_ALLOWED`,
  `INTEGRATION_DISABLED`;
- autenticación: `INVALID_EMAIL`, `INVALID_EMAIL_CODE`,
  `EMAIL_CHALLENGE_EXPIRED`, `EMAIL_CODE_ATTEMPTS_EXCEEDED`, `AUTH_REQUIRED`,
  `SESSION_EXPIRED`;
- permisos: `AGENT_NOT_ALLOWED`, `AGENT_NOT_IN_WORKSPACE`, `USER_BLOCKED`,
  `CALLING_DISABLED`;
- llamada: `INVALID_PHONE_NUMBER`, `NO_CALLER_ID`, `CALLER_ID_NOT_ALLOWED`,
  `INSUFFICIENT_CREDIT`, `DNC_BLOCKED`, `CALL_ALREADY_ACTIVE`,
  `NO_ACTIVE_CALL`, `CALL_FAILED`;
- navegador/red: `MICROPHONE_DENIED`, `NO_AUDIO_DEVICE`,
  `AUDIO_PLAYBACK_BLOCKED`, `TELNYX_CONNECTION_FAILED`, `NETWORK_ERROR`,
  `TIMEOUT`.

`retryable` es `true` para errores transitorios conocidos como rate limit,
timeout, red o conexión Telnyx. La aplicación no debe reintentar
automáticamente errores de permisos, crédito, DNC o autenticación.

## Cómo funciona internamente

### Al cargar

1. El SDK lee `window.location.origin`.
2. Envía la publishable key y el origen a Ringee.
3. El backend valida firma, integración activa y coincidencia exacta del
   origen.
4. El SDK busca una sesión del agente en `sessionStorage`.
5. Si existe, Ringee la revalida y entrega una credencial WebRTC nueva.
6. Si no existe, el SDK solicita autenticación por email OTP.

### Al autenticar al agente

1. El agente introduce su correo.
2. Ringee envía un código de un solo uso sin revelar si el correo existe.
3. El agente verifica el código.
4. El backend comprueba que pertenece al workspace y que puede llamar.
5. El navegador recibe una sesión Ringee y credenciales WebRTC temporales.
6. El SDK conecta el motor de llamadas y emite `ready`.

### Al llamar

1. El SDK valida localmente que el número tenga formato E.164.
2. Adquiere un lock para evitar una segunda llamada en otra pestaña.
3. El backend valida sesión, caller ID, crédito, DNC, bloqueos y contacto.
4. Ringee precrea el registro de llamada y devuelve un token de correlación.
5. El navegador solicita acceso al micrófono.
6. El SDK inicia la llamada WebRTC y traduce los estados del proveedor a los
   estados públicos de Ringee.
7. Al finalizar, libera audio y lock, calcula la duración y emite `ended` o
   `failed`.

La aplicación host nunca recibe el password SIP, el JWT de Telnyx ni objetos
internos del proveedor como parte de la API pública.

### Persistencia

La sesión del agente se guarda en `sessionStorage` usando una clave aislada por
integración y origen. Esto permite recargar la pestaña sin repetir OTP, pero la
sesión desaparece al cerrar la pestaña o llamar `signOut()`.

Las credenciales WebRTC viven únicamente en memoria. Al restaurar la sesión se
generan de nuevo. Si el navegador bloquea `sessionStorage`, el SDK funciona,
pero pedirá OTP después de cada recarga.

## Seguridad

La seguridad no depende de ocultar `pk_live_...`. Cada llamada requiere:

- publishable key firmada;
- origen autorizado exacto;
- agente verificado por OTP;
- membresía vigente en el workspace;
- sesión Ringee válida;
- validación server-side de permisos, caller ID, crédito, DNC y bloqueos.

Nunca coloque `cik_live_...`, credenciales SIP, secretos de Ringee o tokens
administrativos en el frontend.

### Content Security Policy

Una política CSP restrictiva debe permitir la API y el WebSocket de llamadas.
Adapte los demás valores a la política del host:

```text
script-src 'self' https://unpkg.com;
connect-src 'self' https://api.ringee.io wss://rtc.telnyx.com;
media-src 'self' blob:;
```

Si instala por npm, no necesita autorizar `unpkg.com`. Si usa un backend Ringee
propio, reemplace `https://api.ringee.io` por su origen. Una configuración de
Telnyx con host regional puede requerir autorizar ese WebSocket adicional.

### Micrófono e iframes

La llamada debe originarse en un contexto seguro (`https://` o localhost). Si
el SDK se ejecuta dentro de un iframe, el host debe conceder el micrófono:

```html
<iframe src="https://dialer.crm.example.com" allow="microphone"></iframe>
```

El origen que debe figurar en `allowedOrigins` es el del documento que ejecuta
el SDK, no necesariamente el de la página padre. Un iframe con sandbox también
debe conservar los permisos de origen y storage necesarios.

## Self-hosting y desarrollo local

Para usar una API Ringee propia, pase solamente el origen base, sin `/api`:

```ts
const ringee = createFloating({
  key: "pk_live_xxxxx",
  apiUrl: "https://ringee-api.example.com",
});
```

En desarrollo:

```ts
const ringee = createFloating({
  key: "pk_live_xxxxx",
  apiUrl: "http://localhost:3000",
  debug: true,
});
```

Recuerde añadir el origen exacto del frontend, por ejemplo
`http://localhost:4200`, a la publishable key. El origen de `apiUrl` y el origen
del frontend son valores distintos.

Este repositorio incluye dos playgrounds:

- `apps/sdk-playground/vanilla-headless`: flujo real sin framework;
- `apps/sdk-playground/ui-gallery`: estados visuales de Floating y Bar con un
  dialer simulado, sin red ni WebRTC.

Para validar el paquete dentro del monorepo:

```bash
pnpm --filter @ringee-io/dialer-sdk typecheck
pnpm --filter @ringee-io/dialer-sdk test
pnpm --filter @ringee-io/dialer-sdk build
```

## Troubleshooting

### `DOMAIN_NOT_ALLOWED`

Compruebe `window.location.origin` en la consola y compárelo literalmente con
`allowedOrigins`. Revise protocolo, subdominio y puerto. Después de cambiar la
lista hay que usar la publishable key que contiene la lista nueva.

### `INVALID_PUBLISHABLE_KEY`

La clave está mal copiada, la integración fue eliminada o la clave secreta de la
integración fue rotada. Genere una publishable key nueva.

### `AUTH_REQUIRED` o vuelve a pedir OTP

Espere `ready` antes de llamar. Si el OTP reaparece tras cada recarga, revise si
el navegador, iframe o política de privacidad bloquea `sessionStorage`.

### `MICROPHONE_DENIED`

Sirva la página por HTTPS, permita el micrófono para el sitio y revise
`Permissions-Policy`. En un iframe añada `allow="microphone"`.

### `AUDIO_PLAYBACK_BLOCKED`

El navegador exige una interacción del usuario antes de reproducir audio. Haga
que la llamada se inicie desde un click/tap real y evite autollamar al cargar la
página.

### `INVALID_PHONE_NUMBER`

Envíe E.164: signo `+`, código de país y número, sin extensiones. Por ejemplo
`+13055550198`.

### `CALL_ALREADY_ACTIVE`

Ya existe una llamada en la instancia o en otra pestaña que usa la misma
integración. Finalícela antes de crear otra.

### El Bar no aparece

El contenedor debe existir antes de ejecutar `createBar`. Compruebe también que
el elemento no tenga ancho o alto colapsado por el layout del host.

### La UI desaparece pero WebRTC sigue conectado

`controller.destroy()` desmonta la UI. Destruya además el motor:

```ts
controller.destroy();
await controller.dialer.destroy();
```

## Licencia

MIT
