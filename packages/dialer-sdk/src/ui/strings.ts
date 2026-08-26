/**
 * All user-facing copy. Two shipped locales (`en` default and `es`), fully
 * overridable via the `strings` UI option. Nothing here is
 * technical: backend error codes are translated to plain, actionable sentences
 * by {@link errorCopy}, never surfaced raw.
 */
import type { RingeeErrorCode } from "../types";

/** A recovery action the UI knows how to render for an error. */
export type ErrorAction =
  | "retry"
  | "resend"
  | "changeEmail"
  | "allowMic"
  | "reload"
  | "contactAdmin"
  | "signIn"
  | "none";

export interface ErrorCopy {
  title: string;
  message: string;
  action: ErrorAction;
  /** `warning` renders softer (amber) than a hard `error` (red). */
  tone?: "error" | "warning";
}

export interface Strings {
  brand: string;
  // Launcher / chrome
  launcherOpen: string;
  launcherClose: string;
  minimize: string;
  close: string;
  back: string;
  ongoingCall: string;
  // Restoring
  restoring: string;
  connectingAudio: string;
  preparingCall: string;
  // Email screen
  emailTitle: string;
  emailSubtitle: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailInvalid: string;
  sendCode: string;
  sending: string;
  emailSecurityNote: string;
  // OTP screen
  otpTitle: string;
  otpSubtitle: (masked: string) => string;
  verify: string;
  verifying: string;
  resend: string;
  resendIn: (seconds: number) => string;
  changeEmail: string;
  otpIncomplete: string;
  // Ready screen
  readyGreeting: (name: string) => string;
  numberLabel: string;
  numberPlaceholder: string;
  callerIdLabel: string;
  callerIdAuto: string;
  contactLabel: string;
  unknownContact: string;
  callButton: string;
  keypadToggle: string;
  // Calling
  dialing: string;
  ringing: string;
  inCall: string;
  onHold: string;
  ending: string;
  reconnecting: string;
  // Controls
  mute: string;
  unmute: string;
  hold: string;
  resume: string;
  keypad: string;
  hangup: string;
  cancel: string;
  // Ended
  callEnded: string;
  callFailedTitle: string;
  notConnected: string;
  duration: string;
  newCall: string;
  callAgain: string;
  // Agent menu
  workspacePersonal: string;
  signOut: string;
  // Generic errors
  genericErrorTitle: string;
  genericErrorMsg: string;
  tryAgain: string;
  // Error action labels
  actionRetry: string;
  actionResend: string;
  actionChangeEmail: string;
  actionAllowMic: string;
  actionReload: string;
  actionContactAdmin: string;
  actionSignIn: string;
  errors: Record<RingeeErrorCode, ErrorCopy>;
}

export const es: Strings = {
  brand: "Ringee",
  launcherOpen: "Abrir el marcador de Ringee",
  launcherClose: "Cerrar el marcador",
  minimize: "Minimizar",
  close: "Cerrar",
  back: "Volver",
  ongoingCall: "Llamada en curso",
  restoring: "Restaurando tu sesión…",
  connectingAudio: "Conectando el audio…",
  preparingCall: "Preparando la llamada…",
  emailTitle: "Identifica tu cuenta",
  emailSubtitle: "Ingresa el correo que utilizas en Ringee para continuar.",
  emailLabel: "Correo electrónico",
  emailPlaceholder: "tucorreo@empresa.com",
  emailInvalid: "Ingresa un correo válido.",
  sendCode: "Enviar código",
  sending: "Enviando código…",
  emailSecurityNote:
    "Te enviaremos un código de verificación. No compartas este código con nadie.",
  otpTitle: "Revisa tu correo",
  otpSubtitle: (masked) => `Enviamos un código de 6 dígitos a ${masked}.`,
  verify: "Verificar",
  verifying: "Verificando…",
  resend: "Reenviar código",
  resendIn: (s) => `Reenviar en ${s}s`,
  changeEmail: "Cambiar correo",
  otpIncomplete: "Ingresa los 6 dígitos del código.",
  readyGreeting: (name) => `Hola, ${name}`,
  numberLabel: "Número de destino",
  numberPlaceholder: "+52 55 1234 5678",
  callerIdLabel: "Identificador de llamada",
  callerIdAuto: "Selección automática",
  contactLabel: "Contacto",
  unknownContact: "Contacto sin identificar",
  callButton: "Llamar",
  keypadToggle: "Teclado",
  dialing: "Marcando…",
  ringing: "Sonando…",
  inCall: "En llamada",
  onHold: "En espera",
  ending: "Finalizando llamada…",
  reconnecting: "Reconectando…",
  mute: "Silenciar",
  unmute: "Activar micrófono",
  hold: "Poner en espera",
  resume: "Reanudar",
  keypad: "Teclado",
  hangup: "Colgar",
  cancel: "Cancelar",
  callEnded: "Llamada finalizada",
  callFailedTitle: "No se pudo conectar",
  notConnected: "La llamada no se conectó.",
  duration: "Duración",
  newCall: "Nueva llamada",
  callAgain: "Volver a llamar",
  workspacePersonal: "Espacio personal",
  signOut: "Cerrar sesión",
  genericErrorTitle: "Algo salió mal",
  genericErrorMsg: "Ocurrió un problema. Inténtalo de nuevo.",
  tryAgain: "Intentar de nuevo",
  actionRetry: "Intentar de nuevo",
  actionResend: "Reenviar código",
  actionChangeEmail: "Cambiar correo",
  actionAllowMic: "Permitir micrófono",
  actionReload: "Recargar",
  actionContactAdmin: "Contactar al administrador",
  actionSignIn: "Iniciar sesión",
  errors: {
    INVALID_PUBLISHABLE_KEY: {
      title: "Integración no válida",
      message:
        "Esta integración de Ringee no es válida. Contacta al administrador.",
      action: "contactAdmin",
    },
    DOMAIN_NOT_ALLOWED: {
      title: "Dominio no autorizado",
      message: "Este dominio no está autorizado para utilizar Ringee.",
      action: "contactAdmin",
    },
    INTEGRATION_DISABLED: {
      title: "Integración deshabilitada",
      message:
        "La integración de Ringee está deshabilitada. Contacta al administrador.",
      action: "contactAdmin",
    },
    RATE_LIMITED: {
      title: "Demasiados intentos",
      message: "Espera unos segundos antes de intentarlo nuevamente.",
      action: "retry",
      tone: "warning",
    },
    INVALID_EMAIL: {
      title: "Correo no válido",
      message: "Ingresa un correo electrónico válido.",
      action: "changeEmail",
    },
    EMAIL_CHALLENGE_EXPIRED: {
      title: "El código expiró",
      message: "El código caducó. Solicita uno nuevo para continuar.",
      action: "resend",
      tone: "warning",
    },
    INVALID_EMAIL_CODE: {
      title: "Código incorrecto",
      message: "El código no es correcto. Revísalo e inténtalo nuevamente.",
      action: "none",
    },
    EMAIL_CODE_ATTEMPTS_EXCEEDED: {
      title: "Demasiados intentos",
      message: "Superaste los intentos permitidos. Solicita un código nuevo.",
      action: "resend",
      tone: "warning",
    },
    AGENT_NOT_ALLOWED: {
      title: "Cuenta sin acceso",
      message:
        "Este correo no tiene acceso a Ringee. Contacta al administrador.",
      action: "changeEmail",
    },
    AGENT_NOT_IN_WORKSPACE: {
      title: "Cuenta sin acceso",
      message: "Tu cuenta no pertenece a este espacio de trabajo.",
      action: "contactAdmin",
    },
    USER_BLOCKED: {
      title: "Cuenta bloqueada",
      message: "Tu cuenta está bloqueada. Contacta al administrador.",
      action: "contactAdmin",
    },
    CALLING_DISABLED: {
      title: "Llamadas deshabilitadas",
      message: "Las llamadas están deshabilitadas para tu cuenta.",
      action: "contactAdmin",
    },
    SESSION_EXPIRED: {
      title: "Tu sesión expiró",
      message: "Por seguridad, vuelve a iniciar sesión para continuar.",
      action: "signIn",
      tone: "warning",
    },
    SDK_NOT_INITIALIZED: {
      title: "Cargando",
      message: "El marcador aún se está iniciando. Espera un momento.",
      action: "retry",
    },
    AUTH_REQUIRED: {
      title: "Inicia sesión",
      message: "Inicia sesión para realizar una llamada.",
      action: "signIn",
    },
    MICROPHONE_DENIED: {
      title: "Micrófono bloqueado",
      message: "Ringee necesita acceso al micrófono para realizar llamadas.",
      action: "allowMic",
    },
    NO_AUDIO_DEVICE: {
      title: "Sin micrófono",
      message: "No detectamos un micrófono. Conecta uno e inténtalo de nuevo.",
      action: "retry",
    },
    AUDIO_PLAYBACK_BLOCKED: {
      title: "Audio bloqueado",
      message: "Toca para permitir el audio de la llamada.",
      action: "retry",
    },
    NO_CALLER_ID: {
      title: "Sin identificador",
      message:
        "No hay un identificador de llamada disponible. Contacta al administrador.",
      action: "contactAdmin",
    },
    CALLER_ID_NOT_ALLOWED: {
      title: "Identificador no permitido",
      message: "El identificador seleccionado no está permitido.",
      action: "contactAdmin",
    },
    INSUFFICIENT_CREDIT: {
      title: "Crédito insuficiente",
      message: "No hay crédito suficiente para realizar esta llamada.",
      action: "contactAdmin",
    },
    DNC_BLOCKED: {
      title: "Número en lista de exclusión",
      message:
        "Este número está en la lista de no llamar y no puede contactarse.",
      action: "none",
    },
    INVALID_PHONE_NUMBER: {
      title: "Número no válido",
      message: "Ingresa un número de teléfono válido en formato internacional.",
      action: "none",
    },
    CALL_ALREADY_ACTIVE: {
      title: "Llamada activa en otra pestaña",
      message:
        "Ya existe una llamada activa en otra pestaña. Ciérrala para continuar.",
      action: "none",
      tone: "warning",
    },
    NO_ACTIVE_CALL: {
      title: "Sin llamada activa",
      message: "No hay ninguna llamada activa.",
      action: "none",
    },
    INVALID_CALL_STATE: {
      title: "Acción no disponible",
      message: "Esta acción no está disponible en este momento.",
      action: "none",
    },
    TELNYX_CONNECTION_FAILED: {
      title: "Error de conexión",
      message:
        "No pudimos conectar el audio. Revisa tu conexión e inténtalo de nuevo.",
      action: "retry",
    },
    CALL_FAILED: {
      title: "La llamada falló",
      message: "No se pudo completar la llamada. Inténtalo de nuevo.",
      action: "retry",
    },
    NETWORK_ERROR: {
      title: "Sin conexión",
      message: "No pudimos conectar con Ringee. Revisa tu conexión a internet.",
      action: "retry",
    },
    TIMEOUT: {
      title: "Tiempo agotado",
      message: "La solicitud tardó demasiado. Inténtalo de nuevo.",
      action: "retry",
    },
    UNKNOWN_ERROR: {
      title: "Algo salió mal",
      message: "Ocurrió un problema inesperado. Inténtalo de nuevo.",
      action: "retry",
    },
  },
};

export const en: Strings = {
  brand: "Ringee",
  launcherOpen: "Open the Ringee dialer",
  launcherClose: "Close the dialer",
  minimize: "Minimize",
  close: "Close",
  back: "Back",
  ongoingCall: "Ongoing call",
  restoring: "Restoring your session…",
  connectingAudio: "Connecting audio…",
  preparingCall: "Preparing the call…",
  emailTitle: "Identify your account",
  emailSubtitle: "Enter the email you use with Ringee to continue.",
  emailLabel: "Email",
  emailPlaceholder: "you@company.com",
  emailInvalid: "Enter a valid email.",
  sendCode: "Send code",
  sending: "Sending code…",
  emailSecurityNote:
    "We'll send you a verification code. Never share it with anyone.",
  otpTitle: "Check your email",
  otpSubtitle: (masked) => `We sent a 6-digit code to ${masked}.`,
  verify: "Verify",
  verifying: "Verifying…",
  resend: "Resend code",
  resendIn: (s) => `Resend in ${s}s`,
  changeEmail: "Change email",
  otpIncomplete: "Enter all 6 digits.",
  readyGreeting: (name) => `Hi, ${name}`,
  numberLabel: "Destination number",
  numberPlaceholder: "+1 415 555 0132",
  callerIdLabel: "Caller ID",
  callerIdAuto: "Automatic selection",
  contactLabel: "Contact",
  unknownContact: "Unknown contact",
  callButton: "Call",
  keypadToggle: "Keypad",
  dialing: "Dialing…",
  ringing: "Ringing…",
  inCall: "On call",
  onHold: "On hold",
  ending: "Ending call…",
  reconnecting: "Reconnecting…",
  mute: "Mute",
  unmute: "Unmute",
  hold: "Hold",
  resume: "Resume",
  keypad: "Keypad",
  hangup: "Hang up",
  cancel: "Cancel",
  callEnded: "Call ended",
  callFailedTitle: "Couldn't connect",
  notConnected: "The call didn't connect.",
  duration: "Duration",
  newCall: "New call",
  callAgain: "Call again",
  workspacePersonal: "Personal workspace",
  signOut: "Sign out",
  genericErrorTitle: "Something went wrong",
  genericErrorMsg: "Something went wrong. Please try again.",
  tryAgain: "Try again",
  actionRetry: "Try again",
  actionResend: "Resend code",
  actionChangeEmail: "Change email",
  actionAllowMic: "Allow microphone",
  actionReload: "Reload",
  actionContactAdmin: "Contact your admin",
  actionSignIn: "Sign in",
  errors: {
    INVALID_PUBLISHABLE_KEY: {
      title: "Invalid integration",
      message: "This Ringee integration is invalid. Contact your admin.",
      action: "contactAdmin",
    },
    DOMAIN_NOT_ALLOWED: {
      title: "Domain not allowed",
      message: "This domain isn't authorized to use Ringee.",
      action: "contactAdmin",
    },
    INTEGRATION_DISABLED: {
      title: "Integration disabled",
      message: "The Ringee integration is disabled. Contact your admin.",
      action: "contactAdmin",
    },
    RATE_LIMITED: {
      title: "Too many attempts",
      message: "Please wait a few seconds and try again.",
      action: "retry",
      tone: "warning",
    },
    INVALID_EMAIL: {
      title: "Invalid email",
      message: "Enter a valid email address.",
      action: "changeEmail",
    },
    EMAIL_CHALLENGE_EXPIRED: {
      title: "Code expired",
      message: "The code expired. Request a new one to continue.",
      action: "resend",
      tone: "warning",
    },
    INVALID_EMAIL_CODE: {
      title: "Incorrect code",
      message: "That code isn't right. Check it and try again.",
      action: "none",
    },
    EMAIL_CODE_ATTEMPTS_EXCEEDED: {
      title: "Too many attempts",
      message: "You've used all attempts. Request a new code.",
      action: "resend",
      tone: "warning",
    },
    AGENT_NOT_ALLOWED: {
      title: "No access",
      message: "This email doesn't have access to Ringee. Contact your admin.",
      action: "changeEmail",
    },
    AGENT_NOT_IN_WORKSPACE: {
      title: "No access",
      message: "Your account isn't part of this workspace.",
      action: "contactAdmin",
    },
    USER_BLOCKED: {
      title: "Account blocked",
      message: "Your account is blocked. Contact your admin.",
      action: "contactAdmin",
    },
    CALLING_DISABLED: {
      title: "Calling disabled",
      message: "Calling is disabled for your account.",
      action: "contactAdmin",
    },
    SESSION_EXPIRED: {
      title: "Session expired",
      message: "For your security, sign in again to continue.",
      action: "signIn",
      tone: "warning",
    },
    SDK_NOT_INITIALIZED: {
      title: "Loading",
      message: "The dialer is still starting up. One moment.",
      action: "retry",
    },
    AUTH_REQUIRED: {
      title: "Sign in",
      message: "Sign in to place a call.",
      action: "signIn",
    },
    MICROPHONE_DENIED: {
      title: "Microphone blocked",
      message: "Ringee needs microphone access to place calls.",
      action: "allowMic",
    },
    NO_AUDIO_DEVICE: {
      title: "No microphone",
      message: "We couldn't find a microphone. Connect one and try again.",
      action: "retry",
    },
    AUDIO_PLAYBACK_BLOCKED: {
      title: "Audio blocked",
      message: "Tap to allow the call audio.",
      action: "retry",
    },
    NO_CALLER_ID: {
      title: "No caller ID",
      message: "No caller ID is available. Contact your admin.",
      action: "contactAdmin",
    },
    CALLER_ID_NOT_ALLOWED: {
      title: "Caller ID not allowed",
      message: "The selected caller ID isn't allowed.",
      action: "contactAdmin",
    },
    INSUFFICIENT_CREDIT: {
      title: "Insufficient credit",
      message: "There isn't enough credit to place this call.",
      action: "contactAdmin",
    },
    DNC_BLOCKED: {
      title: "Number on do-not-call list",
      message: "This number is on the do-not-call list and can't be contacted.",
      action: "none",
    },
    INVALID_PHONE_NUMBER: {
      title: "Invalid number",
      message: "Enter a valid phone number in international format.",
      action: "none",
    },
    CALL_ALREADY_ACTIVE: {
      title: "Call active in another tab",
      message:
        "There's already an active call in another tab. Close it to continue.",
      action: "none",
      tone: "warning",
    },
    NO_ACTIVE_CALL: {
      title: "No active call",
      message: "There is no active call.",
      action: "none",
    },
    INVALID_CALL_STATE: {
      title: "Action unavailable",
      message: "This action isn't available right now.",
      action: "none",
    },
    TELNYX_CONNECTION_FAILED: {
      title: "Connection error",
      message:
        "We couldn't connect the audio. Check your connection and try again.",
      action: "retry",
    },
    CALL_FAILED: {
      title: "Call failed",
      message: "The call couldn't be completed. Try again.",
      action: "retry",
    },
    NETWORK_ERROR: {
      title: "No connection",
      message: "We couldn't reach Ringee. Check your internet connection.",
      action: "retry",
    },
    TIMEOUT: {
      title: "Timed out",
      message: "The request took too long. Try again.",
      action: "retry",
    },
    UNKNOWN_ERROR: {
      title: "Something went wrong",
      message: "An unexpected problem occurred. Try again.",
      action: "retry",
    },
  },
};

const LOCALES: Record<string, Strings> = { es, en };

/** Resolve a strings bundle from a locale id or explicit overrides. */
export function resolveStrings(
  locale: string | undefined,
  overrides?: Partial<Strings>,
): Strings {
  const base = LOCALES[(locale ?? "en").slice(0, 2)] ?? en;
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    errors: { ...base.errors, ...overrides.errors },
  };
}

/** Translate a typed error code into human copy for the current locale. */
export function errorCopy(code: RingeeErrorCode, s: Strings): ErrorCopy {
  return s.errors[code] ?? s.errors.UNKNOWN_ERROR;
}

/** Label for a resolved {@link ErrorAction}. */
export function actionLabel(action: ErrorAction, s: Strings): string {
  switch (action) {
    case "retry":
      return s.actionRetry;
    case "resend":
      return s.actionResend;
    case "changeEmail":
      return s.actionChangeEmail;
    case "allowMic":
      return s.actionAllowMic;
    case "reload":
      return s.actionReload;
    case "contactAdmin":
      return s.actionContactAdmin;
    case "signIn":
      return s.actionSignIn;
    default:
      return s.tryAgain;
  }
}
