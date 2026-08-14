/**
 * Demo fixtures for the AI pipeline detail pages.
 *
 * Rendered instead of the API responses when the page URL carries `?mock=1`
 * (e.g. `/dashboard/ai-pipeline/objection-intelligence?mock=1`). Nothing here
 * touches the backend: every mutation the pages expose (toggle a context, run
 * the analysis, save a response, complete an action) is applied to local state
 * so the screens stay explorable end to end.
 *
 * Dates are computed at call time so the data always looks freshly generated.
 */

import type {
  PaginatedActions,
  PendingActionView
} from '@/features/pending-actions/types';
import type {
  ActivationRow,
  ActivationSummary,
  ObjectionInsight,
  ObjectionInsightsView,
  ObjectionTrendPoint,
  RunPreview
} from './types';

/** True when the current URL asks for the demo dataset. */
export function isMockParam(value: string | null): boolean {
  return value === '1' || value === 'true';
}

/* ── time helpers ── */

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * DAY).toISOString();
const todayAt = (hour: number) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** Stable per-context seed so each context shows its own (repeatable) numbers. */
function seedFor(contextKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < contextKey.length; i++) {
    h = (Math.imul(h, 16777619) ^ contextKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

/* ── activation summary (shared by both pipelines) ── */

const CAMPAIGN_ONE = 'campaign:11111111-1111-4111-8111-111111111111';
const CAMPAIGN_TWO = 'campaign:22222222-2222-4222-8222-222222222222';
const ORGANIZATION = 'org_no_campaign:33333333-3333-4333-8333-333333333333';

const PIPELINE_META: Record<
  string,
  { name: string; valueProposition: string; detailRoute: string }
> = {
  objection_intelligence: {
    name: 'Inteligencia de Objeciones',
    valueProposition: 'Descubre qué frena a tus prospectos y cómo responder.',
    detailRoute: '/dashboard/ai-pipeline/objection-intelligence'
  },
  follow_up_recommendations: {
    name: 'Recomendaciones de Seguimiento',
    valueProposition:
      'Convierte el resultado de cada llamada en la siguiente mejor acción.',
    detailRoute: '/dashboard/ai-pipeline/follow-up-recommendations'
  }
};

export function mockActivationSummary(pipeline: string): ActivationSummary {
  const meta = PIPELINE_META[pipeline] ?? {
    name: pipeline,
    valueProposition: '',
    detailRoute: `/dashboard/ai-pipeline/${pipeline}`
  };

  const campaigns: ActivationRow[] = [
    {
      contextKey: CAMPAIGN_ONE,
      contextType: 'campaign',
      label: 'Outbound Q3 — Fundadores SaaS',
      descriptor: {
        type: 'campaign',
        campaignId: CAMPAIGN_ONE.split(':')[1]
      },
      enabled: true,
      newEligibleSinceLastRun: 23,
      lastRunAt: hoursAgo(19),
      pendingActionCount: 12,
      lastConfidence: 'high'
    },
    {
      contextKey: CAMPAIGN_TWO,
      contextType: 'campaign',
      label: 'Renovaciones — EMEA',
      descriptor: {
        type: 'campaign',
        campaignId: CAMPAIGN_TWO.split(':')[1]
      },
      enabled: true,
      newEligibleSinceLastRun: 8,
      lastRunAt: daysAgo(3),
      pendingActionCount: 5,
      lastConfidence: 'medium'
    }
  ];

  const organization: ActivationRow = {
    contextKey: ORGANIZATION,
    contextType: 'organization_outside_campaign',
    label: 'Organización (fuera de campañas)',
    descriptor: { type: 'organization_outside_campaign' },
    enabled: false,
    newEligibleSinceLastRun: 41,
    lastRunAt: null,
    pendingActionCount: 0,
    lastConfidence: null
  };

  return {
    pipeline: { type: pipeline, ...meta, implemented: true },
    campaigns,
    organization,
    // Personal is freelancer-only; the demo org has none.
    personal: null
  };
}

/** Immutably updates one activation row — the demo stand-in for a POST + refetch. */
export function patchSummaryRow(
  summary: ActivationSummary,
  contextKey: string,
  patch: Partial<ActivationRow>
): ActivationSummary {
  const apply = (row: ActivationRow | null) =>
    row && row.contextKey === contextKey ? { ...row, ...patch } : row;
  return {
    ...summary,
    campaigns: summary.campaigns.map((r) => apply(r) as ActivationRow),
    organization: apply(summary.organization),
    personal: apply(summary.personal)
  };
}

/** Calls already analyzed in a context — the base every other number derives from. */
function analyzedCount(contextKey: string): number {
  return Math.round(148 * (0.75 + (seedFor(contextKey) % 6) * 0.1));
}

export function mockRunPreview(row: ActivationRow): RunPreview {
  // A run covers everything analyzed so far plus what came in since. A context
  // that never ran only has the new calls waiting for it.
  const eligibleCount =
    (row.lastRunAt ? analyzedCount(row.contextKey) : 0) +
    row.newEligibleSinceLastRun;
  return {
    enabled: row.enabled,
    isRunning: false,
    eligibleCount,
    newEligibleSinceLastRun: row.newEligibleSinceLastRun,
    estimatedConfidence:
      eligibleCount >= 100 ? 'high' : eligibleCount >= 50 ? 'medium' : 'low',
    lowData: eligibleCount < 50,
    lastRunAt: row.lastRunAt
  };
}

/* ── Objection Intelligence ── */

type InsightSeed = Omit<
  ObjectionInsight,
  'id' | 'count' | 'appearanceRate' | 'updatedAt'
> & { count: number };

const INSIGHT_SEEDS: InsightSeed[] = [
  {
    objectionType: 'price_vs_current_stack',
    label: 'Caro frente a lo que ya pagan',
    dynamic: true,
    count: 44,
    convertedRate: 0.19,
    underlyingObjection:
      'No te comparan contra nada: te comparan contra una herramienta que ya pagan. La pregunta real es qué pueden dar de baja, no cuánto cuesta tu plan.',
    winningPattern:
      'Los reps que preguntaron «¿qué están pagando hoy por eso?» antes de cotizar mantuvieron viva la conversación. Plantear el precio como un reemplazo (y no como un gasto extra) recuperó la mayoría de estas llamadas.',
    losingPattern:
      'Saltar directo al descuento. Todas las llamadas donde el rep ofreció un porcentaje en los primeros 60 segundos terminaron sin próximo paso.',
    recommendedResponse:
      'Totalmente válido: casi todos los equipos con los que hablamos ya están pagando algo para esto. Por curiosidad, ¿cómo es hoy ese costo? Si no podemos reemplazarlo, prefiero decírtelo ahora antes que venderte una segunda herramienta.',
    savedResponse: null,
    examples: [
      {
        excerpt:
          'Es más de lo que pagamos hoy, y sinceramente tendría que justificar el salto ante finanzas.',
        outcome: 'handled'
      },
      {
        excerpt:
          'Acabamos de renovar con el proveedor actual, así que ya no queda presupuesto.',
        outcome: 'killed'
      }
    ],
    status: 'new',
    confidence: 'high'
  },
  {
    objectionType: 'send_me_information',
    label: null,
    dynamic: false,
    count: 37,
    convertedRate: 0.08,
    underlyingObjection:
      'Una salida cortés en 4 de cada 5 llamadas. Cuando es genuina, el prospecto menciona quién más necesita leerlo: esa es la señal.',
    winningPattern:
      'Preguntar «claro, ¿quién más lo va a leer?» antes de enviar. Nombrar a un segundo lector convirtió el cierre cortés en una conversación real.',
    losingPattern:
      'Aceptar enviar y cortar sin fecha. Ninguna de esas llamadas volvió.',
    recommendedResponse:
      'Te lo envío sin problema. Para no llenarte la bandeja con lo que no sirve: ¿quién más lo leería de tu lado y qué te gustaría que responda?',
    savedResponse:
      'Te lo envío. Antes, una rápida: ¿quién lo revisa contigo? Así lo recorto a la parte que le importa.',
    examples: [
      {
        excerpt: 'Mándame información y le echo un vistazo.',
        outcome: 'killed'
      },
      {
        excerpt:
          'Envíamelo a mí y a mi responsable de operaciones, lo revisamos los viernes.',
        outcome: 'handled'
      }
    ],
    status: 'saved',
    confidence: 'high'
  },
  {
    objectionType: 'annual_contract_lock_in',
    label: 'Atados a un contrato anual',
    dynamic: true,
    count: 29,
    convertedRate: 0.14,
    underlyingObjection:
      'Rara vez es por el contrato en sí: es por no querer migrar a mitad de trimestre. La fecha de renovación es la puerta de entrada, no el muro.',
    winningPattern:
      'Conseguir el mes de renovación en la llamada y agendar el seguimiento contra esa fecha. Esas llamadas convirtieron más del doble que el resto.',
    losingPattern:
      'Ofrecer cubrir el costo del contrato vigente. Llevó la conversación a compras y se frenó siempre.',
    recommendedResponse:
      'Tiene sentido, nadie cambia de herramienta a mitad de contrato. ¿Cuándo toca la renovación? Prefiero volver seis semanas antes con números concretos que insistir ahora.',
    savedResponse: null,
    examples: [
      {
        excerpt: 'Estamos atados con ellos hasta marzo, así que no hay apuro.',
        outcome: 'handled'
      }
    ],
    status: 'new',
    confidence: 'high'
  },
  {
    objectionType: 'not_the_right_person',
    label: null,
    dynamic: false,
    count: 21,
    convertedRate: 0.26,
    underlyingObjection:
      'Casi siempre es cierta, y es la objeción que más convierte: estas llamadas terminan en una derivación interna cuando el rep la pide.',
    winningPattern:
      'Pedir el nombre y ofrecer mencionar quién te derivó. Las llamadas con referencia de este grupo convirtieron al 26 %.',
    losingPattern:
      'Seguir con el pitch igual. Dos tercios de esas llamadas terminaron antes de los 90 segundos.',
    recommendedResponse:
      'Te agradezco la franqueza. ¿Quién lleva esto de tu lado? Si te parece bien, le menciono que hablamos y se lo hago corto.',
    savedResponse: null,
    examples: [
      {
        excerpt: 'Eso lo decide Marta, yo solo llevo el día a día.',
        outcome: 'handled'
      }
    ],
    status: 'new',
    confidence: 'medium'
  },
  {
    objectionType: 'no_time',
    label: null,
    dynamic: false,
    count: 16,
    convertedRate: 0.11,
    // Measured but not yet enriched — shows the "no AI analysis yet" state.
    underlyingObjection: null,
    winningPattern: null,
    losingPattern: null,
    recommendedResponse: null,
    savedResponse: null,
    examples: null,
    status: 'new',
    confidence: 'medium'
  },
  {
    objectionType: 'security_review_required',
    label: 'Tiene que pasar por revisión de seguridad',
    dynamic: true,
    count: 11,
    convertedRate: 0.31,
    underlyingObjection:
      'No es un rechazo: es una señal de compra con una fila delante. Estos prospectos ya decidieron que quieren la herramienta.',
    winningPattern:
      'Enviar el paquete de seguridad antes de terminar la llamada y agendar el próximo paso en el mismo momento.',
    losingPattern:
      'Esperar a que ellos pidan la documentación. Esos hilos quedaron en silencio por semanas.',
    recommendedResponse:
      'Perfecto, esa parte la tenemos lista. Hoy mismo te envío nuestro informe SOC 2 y el DPA. ¿Reservamos 20 minutos la semana que viene para que tu responsable de seguridad pregunte directamente?',
    savedResponse: null,
    examples: [
      {
        excerpt:
          'Todo lo nuevo tiene que pasar primero por nuestra revisión de seguridad.',
        outcome: 'handled'
      }
    ],
    status: 'new',
    confidence: 'medium'
  },
  {
    objectionType: 'bad_timing',
    label: null,
    dynamic: false,
    count: 9,
    convertedRate: 0.07,
    underlyingObjection:
      'La mitad menciona un evento concreto (cierre de trimestre, una contratación, una migración). La otra mitad son noes suaves.',
    winningPattern: 'Preguntar qué cambia después del evento que mencionaron.',
    losingPattern: 'Aceptar «llámame el próximo trimestre» sin una fecha.',
    recommendedResponse:
      'Entendido. ¿Qué cambia para ustedes después de eso? Si ese es el momento, prefiero dejar la fecha en el calendario ahora y no adivinar.',
    savedResponse: null,
    examples: [
      { excerpt: 'Llámame cuando cierre el trimestre.', outcome: 'killed' }
    ],
    // Dismissed rows stay out of the ranked list.
    status: 'dismissed',
    confidence: 'medium'
  }
];

/** Cumulative share of the final count at each of the last four runs. */
const TREND_STEPS = [0.32, 0.58, 0.81, 1];

function buildTrend(
  insights: ObjectionInsight[],
  seed: number
): ObjectionTrendPoint[] {
  const runDays = [26, 18, 9, 1];
  return TREND_STEPS.map((step, runIdx) => {
    const counts: Record<string, number> = {};
    insights.forEach((insight, i) => {
      if (runIdx === TREND_STEPS.length - 1) {
        counts[insight.objectionType] = insight.count;
        return;
      }
      // Small deterministic jitter so the sparklines are not all identical.
      const jitter = (((seed + i * 7 + runIdx * 13) % 7) - 3) / 100;
      counts[insight.objectionType] = Math.max(
        1,
        Math.round(insight.count * (step + jitter))
      );
    });
    return { runAt: daysAgo(runDays[runIdx]), counts };
  });
}

export function mockObjectionView(row: ActivationRow): ObjectionInsightsView {
  const contextKey = row.contextKey;

  // A context that never ran has nothing to show — that is the empty state.
  if (!row.lastRunAt) {
    return {
      contextKey,
      confidence: null,
      eligibleCount: 0,
      lastRunAt: null,
      aiApplied: false,
      insights: [],
      trend: []
    };
  }

  const seed = seedFor(contextKey);
  const eligibleCount = analyzedCount(contextKey);
  const scale = eligibleCount / 148;

  const insights: ObjectionInsight[] = INSIGHT_SEEDS.map((base, i) => {
    const count = Math.max(3, Math.round(base.count * scale));
    return {
      ...base,
      id: `${contextKey}:${base.objectionType}`,
      count,
      appearanceRate: count / eligibleCount,
      updatedAt: hoursAgo(6 + i)
    };
  }).sort((a, b) => b.count - a.count);

  return {
    contextKey,
    confidence: 'high',
    eligibleCount,
    lastRunAt: row.lastRunAt,
    aiApplied: true,
    insights,
    trend: buildTrend(insights, seed)
  };
}

/* ── Follow-up Recommendations ── */

type ActionSeed = Pick<
  PendingActionView,
  | 'type'
  | 'status'
  | 'priority'
  | 'source'
  | 'title'
  | 'reason'
  | 'suggestedMessage'
  | 'nextBestAction'
> & {
  /** Offset in days from now; null = no due date. */
  dueInDays: number | null;
  contact: NonNullable<PendingActionView['contact']>;
  outcome: string;
};

const ACTION_SEEDS: ActionSeed[] = [
  {
    type: 'send_pricing_or_info',
    status: 'pending',
    priority: 'high',
    source: 'ai',
    title: 'Enviar el paquete de seguridad a Marta Ferreira',
    reason:
      'Pidió el SOC 2 y el DPA antes de sumar a su responsable de seguridad. Mencionó una fecha de decisión en dos semanas.',
    suggestedMessage:
      'Hola Marta: como quedamos, te adjunto nuestro informe SOC 2 Tipo II y el DPA. Si les resulta más rápido que revisar documentos, agendamos 20 minutos con tu responsable de seguridad.',
    nextBestAction:
      'Adjuntar SOC 2 + DPA y proponer una llamada de seguridad de 20 minutos.',
    dueInDays: 0,
    contact: {
      id: 'mock-contact-1',
      name: 'Marta Ferreira',
      phoneNumber: '+351912345678',
      company: 'Nordwind Logistics'
    },
    outcome: 'interested'
  },
  {
    type: 'book_meeting',
    status: 'pending',
    priority: 'high',
    source: 'ai',
    title: 'Agendar la demo técnica con Daniel Reyes',
    reason:
      'Duró 14 minutos, preguntó dos veces por la API y sumó a su CTO al final. La señal más fuerte de este contexto hoy.',
    suggestedMessage:
      'Daniel, excelente llamada. Reservé dos horarios para la demo técnica: jueves 10:00 o viernes 15:00. ¿Cuál les queda mejor a vos y a tu CTO?',
    nextBestAction: 'Ofrecer dos horarios concretos esta semana.',
    dueInDays: 0,
    contact: {
      id: 'mock-contact-2',
      name: 'Daniel Reyes',
      phoneNumber: '+13475550142',
      company: 'Brightpath Health'
    },
    outcome: 'meeting_requested'
  },
  {
    type: 'create_callback',
    status: 'pending',
    priority: 'high',
    source: 'rule',
    title: 'Devolver la llamada a Aisha Karim — pidió el martes',
    reason:
      'Pidió expresamente que la vuelvan a llamar. Todavía no hay callback agendado.',
    suggestedMessage: null,
    nextBestAction: 'Agendar el callback para el martes por la mañana.',
    dueInDays: -1,
    contact: {
      id: 'mock-contact-3',
      name: 'Aisha Karim',
      phoneNumber: '+447700900233',
      company: 'Levo Retail Group'
    },
    outcome: 'callback_requested'
  },
  {
    type: 'send_follow_up',
    status: 'pending',
    priority: 'medium',
    source: 'ai',
    title: 'Dar seguimiento a Tomás Ribeiro por la fecha de renovación',
    reason:
      'Atado a un contrato anual hasta marzo. Acordó una revisión seis semanas antes de la renovación.',
    suggestedMessage:
      'Tomás: dejo anotada la renovación de marzo, como me comentaste. Vuelvo a mediados de enero con una comparación equivalente para que decidan con números en la mano.',
    nextBestAction:
      'Enviar el resumen con la fecha de renovación y programar un recordatorio para enero.',
    dueInDays: 2,
    contact: {
      id: 'mock-contact-4',
      name: 'Tomás Ribeiro',
      phoneNumber: '+34611223344',
      company: 'Ancora Seguros'
    },
    outcome: 'not_now'
  },
  {
    type: 'ask_for_referral',
    status: 'pending',
    priority: 'medium',
    source: 'ai',
    title: 'Pedirle a Lena Vogt el contacto correcto',
    reason:
      'No decide, pero se ofreció a derivarte al responsable de operaciones. Las presentaciones referidas convierten al 26 % en este contexto.',
    suggestedMessage:
      'Lena, gracias por la franqueza. ¿Me podés indicar quién lleva esto? Le menciono que hablamos así no le llega como una llamada en frío.',
    nextBestAction: 'Pedir la presentación con nombre y apellido.',
    dueInDays: 1,
    contact: {
      id: 'mock-contact-5',
      name: 'Lena Vogt',
      phoneNumber: '+4915112345678',
      company: 'Halden Manufacturing'
    },
    outcome: 'wrong_person'
  },
  {
    type: 'update_crm',
    status: 'pending',
    priority: 'low',
    source: 'rule',
    title: 'Registrar el resultado de Priya Nair',
    reason: 'Llamada completada hace 3 días y sin nota en el CRM.',
    suggestedMessage: null,
    nextBestAction:
      'Cargar el resultado de la llamada y el próximo paso en el CRM.',
    dueInDays: 3,
    contact: {
      id: 'mock-contact-6',
      name: 'Priya Nair',
      phoneNumber: '+919820098200',
      company: 'Corevance Analytics'
    },
    outcome: 'answered'
  },
  {
    type: 'add_to_nurture',
    status: 'pending',
    priority: 'low',
    source: 'rule',
    title: 'Pasar a Jonas Lindqvist a nurturing',
    reason:
      'Tercera llamada sin respuesta seguida. Se alcanzó el umbral de la regla para dejar de marcar y pasar a nurturing.',
    suggestedMessage: null,
    nextBestAction: 'Sumarlo a la secuencia de nurturing trimestral.',
    dueInDays: 5,
    contact: {
      id: 'mock-contact-7',
      name: 'Jonas Lindqvist',
      phoneNumber: '+46701234567',
      company: 'Sundby Energi'
    },
    outcome: 'no_answer'
  },
  {
    type: 'review_objection_response',
    status: 'pending',
    priority: 'medium',
    source: 'ai',
    title: 'Revisar la respuesta para «atados a un contrato anual»',
    reason:
      'Inteligencia de Objeciones redactó una respuesta para la objeción que apareció en 29 llamadas este mes.',
    suggestedMessage: null,
    nextBestAction:
      'Aprobar o editar la respuesta redactada y sumarla al guion.',
    dueInDays: 4,
    contact: {
      id: 'mock-contact-8',
      name: 'Hannah Weiss',
      phoneNumber: '+4917612345678',
      company: 'Kestrel Freight'
    },
    outcome: 'objection'
  },
  {
    type: 'send_follow_up',
    status: 'completed',
    priority: 'medium',
    source: 'ai',
    title: 'Resumen enviado a Owen Bradley',
    reason:
      'Pidió un resumen de una página tras una llamada de descubrimiento positiva.',
    suggestedMessage: null,
    nextBestAction: 'Completado: resumen enviado con los planes de precios.',
    dueInDays: -4,
    contact: {
      id: 'mock-contact-9',
      name: 'Owen Bradley',
      phoneNumber: '+353861234567',
      company: 'Ferrow Systems'
    },
    outcome: 'interested'
  },
  {
    type: 'mark_not_interested',
    status: 'dismissed',
    priority: 'low',
    source: 'rule',
    title: 'Cerrar el caso de Sofía Almeida',
    reason: 'Pidió no ser contactada de nuevo. Marcada y quitada de la cola.',
    suggestedMessage: null,
    nextBestAction: 'Sin acciones pendientes.',
    dueInDays: -6,
    contact: {
      id: 'mock-contact-10',
      name: 'Sofía Almeida',
      phoneNumber: '+5511998877665',
      company: 'Vela Consultoria'
    },
    outcome: 'not_interested'
  }
];

/** Pending rows a demo run produces — mirrors the summary's pending counter. */
export const MOCK_PENDING_ACTION_COUNT = ACTION_SEEDS.filter(
  (s) => s.status === 'pending'
).length;

function buildActions(row: ActivationRow): PendingActionView[] {
  // Nothing has been generated for a context that never ran.
  if (!row.lastRunAt) return [];

  const campaignId =
    row.contextType === 'campaign' ? row.contextKey.split(':')[1] : null;

  return ACTION_SEEDS.map((seed, i) => ({
    id: `${row.contextKey}:action-${i}`,
    type: seed.type,
    status: seed.status,
    priority: seed.priority,
    source: seed.source,
    title: seed.title,
    reason: seed.reason,
    suggestedMessage: seed.suggestedMessage,
    nextBestAction: seed.nextBestAction,
    dueAt:
      seed.dueInDays === null
        ? null
        : seed.dueInDays === 0
          ? todayAt(17)
          : seed.dueInDays > 0
            ? daysAhead(seed.dueInDays)
            : daysAgo(-seed.dueInDays),
    snoozedUntil: null,
    expiresAt: null,
    contextType: row.contextType,
    contextKey: row.contextKey,
    campaignId,
    // Left null on purpose: the demo rows point at contacts that do not exist,
    // so the table renders without a link into a 404.
    contactId: null,
    callId: `${row.contextKey}:call-${i}`,
    createdAt: hoursAgo(6 + i * 5),
    completedAt: seed.status === 'completed' ? daysAgo(2) : null,
    contact: seed.contact,
    call: {
      id: `${row.contextKey}:call-${i}`,
      outcome: seed.outcome,
      startedAt: hoursAgo(8 + i * 5)
    },
    campaign: campaignId ? { id: campaignId, name: row.label } : null
  }));
}

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

function matchesFilter(
  action: PendingActionView,
  filterKey: string,
  actions: PendingActionView[]
): boolean {
  const open = action.status === 'pending' || action.status === 'snoozed';
  switch (filterKey) {
    case 'pending':
      return action.status === 'pending';
    case 'high':
      return open && action.priority === 'high';
    case 'due_today':
      return open && !!action.dueAt && isToday(action.dueAt);
    case 'overdue':
      return open && !!action.dueAt && new Date(action.dueAt) < new Date();
    case 'ai':
      return open && action.source === 'ai';
    case 'rule':
      return open && action.source === 'rule';
    case 'dismissed':
      return action.status === 'dismissed';
    case 'completed':
      return action.status === 'completed';
    default:
      return actions.includes(action);
  }
}

/** Full demo action set for a context, before any filter is applied. */
export function mockFollowUpActions(row: ActivationRow): PendingActionView[] {
  return buildActions(row);
}

/** Applies a results-tab filter to an (already mutated) demo action set. */
export function filterMockActions(
  actions: PendingActionView[],
  filterKey: string
): PaginatedActions {
  const data = actions.filter((a) => matchesFilter(a, filterKey, actions));
  return {
    data,
    meta: {
      total: data.length,
      page: 1,
      limit: 25,
      totalPages: Math.max(1, Math.ceil(data.length / 25))
    }
  };
}
