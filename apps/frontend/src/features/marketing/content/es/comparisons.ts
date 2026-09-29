import { ES_MARKETING_ROUTES } from './routes';
import type { ComparisonContent } from '../comparisons';
import { PRICING } from '../../site';
import { CALL_RATE_FROM, PHONE_NUMBER_COUNTRIES } from '../phone-numbers';

/** Spanish edition of the existing commercial content; prices remain shared. */
export const ES_COMPARISONS: (ComparisonContent & { path: string })[] = [
  {
    slug: 'aircall',
    competitor: 'Aircall',
    competitorBlurb:
      'Aircall es una centralita y sistema de centro de llamadas en la nube, conocido por sus números compartidos, IVR y amplio catálogo de integraciones con CRM y soporte.',
    metaTitle: 'Ringee vs Aircall: precios, IA y marcador de ventas',
    metaDescription: `Ringee vs Aircall: $${PRICING.organization.price}/mes con usuarios ilimitados frente a planes por usuario. Compara marcadores, agentes de voz IA, BYOC, MCP y código abierto.`,
    h1: 'Ringee vs Aircall',
    intro: [
      'Aircall es una centralita en la nube para equipos que buscan números compartidos, IVR y un amplio catálogo de integraciones. Cobra por usuario, normalmente con un mínimo de usuarios, por lo que la factura crece con cada persona que añades.',
      `Ringee está pensado para llamadas salientes: marcador de ventas progresivo y preview, agentes de voz con IA que hacen llamadas reales y un plan de $${PRICING.organization.price}/mes para todo el equipo. Es de código abierto, permite conectar tu operador y se controla desde Claude, ChatGPT o cualquier cliente MCP.`
    ],
    summary: [
      'Elige Ringee para llamadas salientes con representantes y agentes de IA a un precio fijo.',
      'Elige Aircall para un centro centrado en llamadas entrantes con IVR, colas y un amplio catálogo de integraciones.',
      'Ambos graban llamadas y funcionan en el navegador. Sus principales diferencias son el modelo de precios, las llamadas con IA y la apertura de la plataforma.'
    ],
    rows: [
      {
        label: 'Modelo de precios',
        ringee: `Gratis para una persona; $${PRICING.organization.price}/mes por organización con usuarios ilimitados`,
        competitor:
          'Planes mensuales por usuario, normalmente con un mínimo de usuarios',
        edge: 'ringee'
      },
      {
        label: 'Coste de llamadas',
        ringee: `Pago por uso desde ${CALL_RATE_FROM}/min`,
        competitor: 'Depende del plan y del destino'
      },
      {
        label: 'Marcador de llamadas salientes',
        ringee:
          'Marcación progresiva y preview, rotación del identificador y horarios de llamada',
        competitor: 'Power dialer'
      },
      {
        label: 'Agentes de voz con IA',
        ringee:
          'Los agentes hacen llamadas salientes, agendan reuniones, comunican recordatorios y devuelven resultados estructurados',
        competitor:
          'Agente de voz con IA para responder llamadas y automatizar llamadas salientes'
      },
      {
        label: 'Agentes de IA y automatización',
        ringee:
          'Servidor MCP para Claude, ChatGPT y cualquier cliente MCP, más CLI y API',
        competitor:
          'API, webhooks, catálogo de integraciones y herramientas MCP externas para agentes de IA'
      },
      {
        label: 'Conserva tus números',
        ringee: 'BYOC: conecta tu operador SIP o centralita',
        competitor:
          'Compra o portabilidad; BYOC se configura con el equipo comercial o de cuentas'
      },
      {
        label: 'Centro de llamadas entrantes',
        ringee:
          'Enrutamiento a usuarios, grupos de llamada y teléfonos de escritorio; sin menús IVR',
        competitor: 'IVR, colas, bandeja compartida y enrutamiento avanzado',
        edge: 'competitor'
      },
      {
        label: 'Integraciones',
        ringee:
          'Attio, Odoo, Apollo, Prospeo, Google Calendar y API de integraciones personalizadas',
        competitor: 'Amplio catálogo de integraciones con CRM y soporte',
        edge: 'competitor'
      },
      {
        label: 'Código abierto y alojamiento propio',
        ringee: 'Licencia MIT; puedes alojarlo en tu infraestructura',
        competitor: 'SaaS propietario',
        edge: 'ringee'
      },
      {
        label: 'Grabación y transcripción',
        ringee:
          'Grabación y transcripción en tiempo real, conserves o no el audio',
        competitor: 'Disponible; las funciones de IA dependen del plan'
      }
    ],
    perSeat: true,
    whyRingee: [
      `Precio fijo: usuarios ilimitados con un plan de $${PRICING.organization.price}/mes, sin aumentar la suscripción con cada contratación.`,
      'Personas e IA en una plataforma: tus representantes usan modo progresivo o preview y los agentes de voz hacen sus propias llamadas.',
      'Conserva tu operador: conecta tu troncal SIP (SIP trunk) o centralita sin portar los números.',
      'Control desde asistentes: gestiona llamadas, sesiones de llamadas y seguimiento desde Claude, ChatGPT o cualquier cliente MCP.',
      `Código abierto y alojamiento propio, con llamadas de pago por uso desde ${CALL_RATE_FROM}/min.`
    ],
    whenCompetitor: [
      'Necesitas un centro completo de llamadas entrantes —IVR, colas y bandejas compartidas— más que llamadas salientes.',
      'Dependes de una integración exclusiva de Aircall de su amplio catálogo.',
      'Prefieres un SaaS totalmente gestionado y no quieres código abierto ni alojamiento propio.'
    ],
    switching: [
      {
        title: 'Conserva o añade tus números',
        description: `Conecta tu operador o centralita mediante BYOC, compra números nuevos en ${PHONE_NUMBER_COUNTRIES.length} países o verifica un número propio como identificador de llamada.`
      },
      {
        title: 'Incorpora tus contactos',
        description:
          'Exporta los contactos de tu CRM o Aircall, importa el CSV en Ringee y agrupa los prospectos en campañas.'
      },
      {
        title: 'Invita a todo el equipo',
        description:
          'Añade a todos a tu organización sin tarifa por usuario, conecta tu CRM y empieza a llamar desde el navegador.'
      }
    ],
    faqs: [
      {
        question: '¿Es Ringee una buena alternativa a Aircall?',
        answer: `Sí, especialmente para equipos de llamadas salientes que buscan precio fijo. Ringee ofrece usuarios ilimitados con un plan de $${PRICING.organization.price}/mes, llamadas por uso desde ${CALL_RATE_FROM}/min, marcador progresivo, agentes de voz con IA que hacen llamadas salientes y BYOC. Es de código abierto y admite alojamiento propio.`
      },
      {
        question: '¿En qué se diferencian los precios de Ringee y Aircall?',
        answer: `Aircall cobra por usuario al mes, normalmente con un mínimo de usuarios. Ringee cobra $${PRICING.organization.price}/mes por organización con usuarios ilimitados, más crédito de llamadas de pago por uso desde ${CALL_RATE_FROM}/min. El coste de uso depende de las llamadas, no del tamaño del equipo.`
      },
      {
        question: '¿Puedo conservar mis números si cambio desde Aircall?',
        answer: `Si los números están en un operador o centralita que controlas, sí: conéctalo mediante BYOC y sigue llamando desde ellos. También puedes comprar números locales nuevos en Ringee en ${PHONE_NUMBER_COUNTRIES.length} países.`
      },
      {
        question:
          '¿Puedo alojar Ringee en mi infraestructura en vez de usar una centralita SaaS?',
        answer:
          'Sí. Ringee es de código abierto con licencia MIT y admite alojamiento en tu propia infraestructura, una opción que Aircall no ofrece.'
      }
    ],
    path: ES_MARKETING_ROUTES['/compare/aircall']
  },
  {
    slug: 'justcall',
    competitor: 'JustCall',
    competitorBlurb:
      'JustCall es un sistema telefónico para ventas y soporte con mensajería empresarial, varios modos de marcación y productos de IA, vendido por usuario.',
    metaTitle: 'Ringee vs JustCall: precios, marcadores e IA',
    metaDescription: `Ringee vs JustCall: $${PRICING.organization.price}/mes con usuarios ilimitados frente a planes por usuario. Compara marcadores, agentes de voz IA, mensajes, BYOC y MCP.`,
    h1: 'Ringee vs JustCall',
    intro: [
      'JustCall es un sistema telefónico de ventas con varios marcadores, mensajería empresarial y productos como agentes de voz con IA y formación con IA. Como muchas herramientas del sector, cobra por usuario al mes: la factura crece con el equipo.',
      'Ringee cubre las llamadas salientes: marcación progresiva y preview, campañas, grabación, transcripción en vivo, resultados, devoluciones de llamada y sincronización del CRM, más agentes de voz con IA a un precio fijo para todo el equipo. Es de código abierto, permite conectar tu operador y funciona desde Claude o ChatGPT mediante MCP.'
    ],
    summary: [
      'Elige Ringee para llamadas salientes a precio fijo con un marcador progresivo y agentes de voz que controlas desde tus herramientas de IA.',
      'Elige JustCall si los mensajes empresariales son centrales en tu trabajo o necesitas marcación predictiva o paralela.',
      'Ambos funcionan en el navegador y graban llamadas. Se diferencian sobre todo en precios, mensajería y modos de marcación.'
    ],
    rows: [
      {
        label: 'Modelo de precios',
        ringee: `Gratis para una persona; $${PRICING.organization.price}/mes por organización con usuarios ilimitados`,
        competitor: 'Planes mensuales por usuario',
        edge: 'ringee'
      },
      {
        label: 'Plan gratuito individual',
        ringee:
          'Sí: plan Freelancer gratuito para llamadas humanas y automatización',
        competitor: 'Sin plan gratuito permanente; hay prueba',
        edge: 'ringee'
      },
      {
        label: 'Modos de marcación',
        ringee: 'Progresivo y preview',
        competitor: 'Varios modos, incluidos power, predictivo y paralelo',
        edge: 'competitor'
      },
      {
        label: 'Mensajería empresarial',
        ringee: 'Centrado en llamadas',
        competitor: 'SMS, MMS y mensajes masivos integrados',
        edge: 'competitor'
      },
      {
        label: 'Agentes de voz con IA',
        ringee: `Incluidos en el plan de $${PRICING.organization.price}/mes; llamadas facturadas por minuto`,
        competitor: 'Productos de agentes de voz y SDR con IA'
      },
      {
        label: 'Agentes de IA y automatización',
        ringee:
          'Servidor MCP para Claude, ChatGPT y cualquier cliente MCP, más CLI y API',
        competitor: 'Servidor MCP, API e integraciones'
      },
      {
        label: 'Conserva tus números',
        ringee: 'BYOC: conecta tu operador SIP o centralita',
        competitor: 'Opción habitual: comprar números de JustCall o portarlos',
        edge: 'ringee'
      },
      {
        label: 'Código abierto y alojamiento propio',
        ringee: 'Licencia MIT; puedes alojarlo en tu infraestructura',
        competitor: 'SaaS propietario',
        edge: 'ringee'
      },
      {
        label: 'Grabación y transcripción',
        ringee:
          'Grabación y transcripción en tiempo real, conserves o no el audio',
        competitor: 'Disponible, con resúmenes y análisis con IA según el plan'
      }
    ],
    perSeat: true,
    whyRingee: [
      `Precio fijo: usuarios ilimitados con un plan de $${PRICING.organization.price}/mes, sin aumentar la suscripción con cada contratación.`,
      'Personas e IA en una plataforma: tus representantes usan modo progresivo o preview y los agentes de voz hacen sus propias llamadas.',
      'Conserva tu operador: conecta tu troncal SIP (SIP trunk) o centralita sin portar los números.',
      'Control desde asistentes: gestiona llamadas, sesiones de llamadas y seguimiento desde Claude, ChatGPT o cualquier cliente MCP.',
      `Código abierto y alojamiento propio, con llamadas de pago por uso desde ${CALL_RATE_FROM}/min.`
    ],
    whenCompetitor: [
      'Los SMS y mensajes integrados son centrales en tu trabajo actual.',
      'Necesitas marcación predictiva o paralela, que Ringee no ofrece.',
      'Solo quieres SaaS gestionado y no necesitas código abierto ni alojamiento propio.'
    ],
    switching: [
      {
        title: 'Conserva o añade tus números',
        description: `Conecta tu operador o centralita mediante BYOC, compra números nuevos en ${PHONE_NUMBER_COUNTRIES.length} países o verifica un número propio como identificador de llamada.`
      },
      {
        title: 'Incorpora tus contactos',
        description:
          'Exporta los contactos de tu CRM o JustCall, importa el CSV en Ringee y agrupa los prospectos en campañas.'
      },
      {
        title: 'Invita a todo el equipo',
        description:
          'Añade a todos a tu organización sin tarifa por usuario, conecta tu CRM y empieza a llamar desde el navegador.'
      }
    ],
    faqs: [
      {
        question: '¿Es Ringee una buena alternativa a JustCall?',
        answer: `Sí. Para equipos que quieren evitar tarifas por usuario, Ringee ofrece usuarios ilimitados con un plan de $${PRICING.organization.price}/mes, llamadas por uso desde ${CALL_RATE_FROM}/min, marcador progresivo, agentes de voz con IA, grabación, transcripción en vivo y sincronización del CRM. Es de código abierto y admite alojamiento propio.`
      },
      {
        question: '¿Cobra Ringee por usuario como JustCall?',
        answer: `No. Ringee cobra $${PRICING.organization.price}/mes por organización con usuarios ilimitados. JustCall, como muchos marcadores, cobra por usuario al mes.`
      },
      {
        question: '¿Tiene Ringee un marcador predictivo como JustCall?',
        answer:
          'No. Ringee llama a un prospecto por representante cada vez en modo progresivo o preview, para que quien responda encuentre a alguien disponible. Si necesitas marcación predictiva, JustCall la ofrece.'
      }
    ],
    path: ES_MARKETING_ROUTES['/compare/justcall']
  },
  {
    slug: 'ringover',
    competitor: 'Ringover',
    competitorBlurb:
      'Ringover es una centralita europea en la nube con números internacionales, power dialer, funciones de centro de llamadas y herramientas de IA, vendida por usuario.',
    metaTitle: 'Ringee vs Ringover: precios, IA y marcador',
    metaDescription: `Ringee vs Ringover: $${PRICING.organization.price}/mes con usuarios ilimitados frente a planes por usuario. Compara agentes de voz IA, marcadores, números y BYOC.`,
    h1: 'Ringee vs Ringover',
    intro: [
      'Ringover es una centralita en la nube popular entre equipos europeos: números internacionales, power dialer, IVR, funciones de centro de llamadas y herramientas de IA. Cobra por usuario al mes e incluye llamadas a muchos destinos en sus planes.',
      `Ringee ofrece a los equipos de llamadas salientes un precio fijo para usuarios ilimitados, llamadas por uso desde ${CALL_RATE_FROM}/min, marcador progresivo, agentes de voz con IA que llaman y una plataforma de código abierto que puedes alojar o conectar a tu operador.`
    ],
    summary: [
      'Elige Ringee para llamadas salientes con precio fijo, agentes de voz con IA y control de tu plataforma.',
      'Elige Ringover para una centralita completa con IVR, colas y llamadas incluidas por usuario.',
      'Ambos venden números en muchos países. Ringee publica el precio y los requisitos documentales de cada uno.'
    ],
    rows: [
      {
        label: 'Modelo de precios',
        ringee: `Gratis para una persona; $${PRICING.organization.price}/mes por organización con usuarios ilimitados`,
        competitor: 'Planes mensuales por usuario',
        edge: 'ringee'
      },
      {
        label: 'Coste de llamadas',
        ringee: `Pago por uso desde ${CALL_RATE_FROM}/min, sin paquetes`,
        competitor: 'Llamadas a muchos destinos incluidas en planes por usuario'
      },
      {
        label: 'Números virtuales',
        ringee: `Números locales, gratuitos y móviles en ${PHONE_NUMBER_COUNTRIES.length} países, con precios y requisitos publicados`,
        competitor: 'Números internacionales en muchos países'
      },
      {
        label: 'Marcador de llamadas salientes',
        ringee:
          'Marcación progresiva y preview, rotación del identificador de llamada',
        competitor: 'Power dialer'
      },
      {
        label: 'Agentes de voz con IA',
        ringee:
          'Los agentes hacen llamadas salientes, agendan reuniones y comunican recordatorios',
        competitor:
          'Agente de voz con IA centrado en responder llamadas entrantes'
      },
      {
        label: 'Agentes de IA y automatización',
        ringee:
          'Servidor MCP para Claude, ChatGPT y cualquier cliente MCP, más CLI y API',
        competitor:
          'API pública, integraciones con CRM y servidor MCP de solo lectura'
      },
      {
        label: 'Conserva tus números',
        ringee: 'BYOC: conecta tu operador SIP o centralita',
        competitor: 'Portabilidad y BYOC con un operador compatible'
      },
      {
        label: 'Centro de llamadas entrantes',
        ringee:
          'Enrutamiento a usuarios, grupos de llamada y teléfonos de escritorio; sin menús IVR',
        competitor: 'IVR, colas y enrutamiento de centro de llamadas',
        edge: 'competitor'
      },
      {
        label: 'Código abierto y alojamiento propio',
        ringee: 'Licencia MIT; puedes alojarlo en tu infraestructura',
        competitor: 'SaaS propietario',
        edge: 'ringee'
      }
    ],
    perSeat: true,
    whyRingee: [
      `Precio fijo: usuarios ilimitados con un plan de $${PRICING.organization.price}/mes, sin aumentar la suscripción con cada contratación.`,
      'Personas e IA en una plataforma: tus representantes usan modo progresivo o preview y los agentes de voz hacen sus propias llamadas.',
      'Conserva tu operador: conecta tu troncal SIP (SIP trunk) o centralita sin portar los números.',
      'Control desde asistentes: gestiona llamadas, sesiones de llamadas y seguimiento desde Claude, ChatGPT o cualquier cliente MCP.',
      `Código abierto y alojamiento propio, con llamadas de pago por uso desde ${CALL_RATE_FROM}/min.`
    ],
    whenCompetitor: [
      'Necesitas un centro completo de llamadas entrantes con menús IVR y colas.',
      'Prefieres llamadas incluidas por usuario en vez de minutos de pago por uso.',
      'Quieres un proveedor para teléfono, mensajería y videollamadas.'
    ],
    switching: [
      {
        title: 'Conserva o añade tus números',
        description: `Conecta tu operador o centralita mediante BYOC, compra números nuevos en ${PHONE_NUMBER_COUNTRIES.length} países o verifica un número propio como identificador de llamada.`
      },
      {
        title: 'Incorpora tus contactos',
        description:
          'Exporta los contactos de tu CRM o Ringover, importa el CSV en Ringee y agrupa los prospectos en campañas.'
      },
      {
        title: 'Invita a todo el equipo',
        description:
          'Añade a todos a tu organización sin tarifa por usuario, conecta tu CRM y empieza a llamar desde el navegador.'
      }
    ],
    faqs: [
      {
        question: '¿Es Ringee una buena alternativa a Ringover?',
        answer: `Sí, especialmente para llamadas salientes. Ringee ofrece usuarios ilimitados con un plan de $${PRICING.organization.price}/mes, llamadas por uso desde ${CALL_RATE_FROM}/min, marcador progresivo, agentes de voz con IA que llaman y BYOC. Es de código abierto y admite alojamiento propio.`
      },
      {
        question: '¿Es Ringee más barato que Ringover?',
        answer: `Depende del tamaño del equipo y del volumen de llamadas. Ringover cobra por usuario con llamadas incluidas; Ringee cobra $${PRICING.organization.price}/mes por organización y los minutos se pagan por uso. El precio fijo beneficia a equipos en crecimiento; las llamadas incluidas pueden beneficiar a pocas personas que llaman todo el día.`
      },
      {
        question: '¿Tiene Ringee números en España, Francia y México?',
        answer: `Sí. Ringee vende números locales y gratuitos en España y Francia, y locales, gratuitos y móviles en México: ${PHONE_NUMBER_COUNTRIES.length} países en total, con precios y requisitos normativos publicados.`
      }
    ],
    path: ES_MARKETING_ROUTES['/compare/ringover']
  },
  {
    slug: 'dapta',
    competitor: 'Dapta',
    competitorBlurb:
      'Dapta es una plataforma de agentes de IA para pequeñas y medianas empresas, con agentes de voz y WhatsApp y automatización de ventas y soporte.',
    metaTitle: 'Ringee vs Dapta: agentes de voz IA y llamadas',
    metaDescription: `Ringee vs Dapta: agentes de voz IA, marcador para tu equipo, BYOC y MCP con un plan de $${PRICING.organization.price}/mes. Compara dónde encaja cada opción.`,
    h1: 'Ringee vs Dapta',
    intro: [
      'Dapta se centra en agentes de IA: voz y WhatsApp para llamar, enviar mensajes y hacer seguimiento, con automatizaciones que los conectan a tus herramientas. Encaja cuando quieres automatizar conversaciones de principio a fin.',
      'Ringee reúne llamadas humanas y de IA. Los agentes de voz hacen llamadas salientes y tus representantes usan los mismos números con un marcador progresivo, historial compartido, grabaciones y sincronización del CRM. Es de código abierto, permite conectar tu operador y se controla desde Claude, ChatGPT o cualquier cliente MCP.'
    ],
    summary: [
      'Elige Ringee cuando tus representantes y agentes de IA necesitan llamar desde la misma plataforma.',
      'Elige Dapta cuando quieres agentes de voz y WhatsApp con automatizaciones listas para usar.',
      'Ambos funcionan con Claude: Dapta para crear agentes y consultar análisis; Ringee para gestionar llamadas, sesiones y seguimiento.'
    ],
    rows: [
      {
        label: 'Enfoque',
        ringee: 'Llamadas humanas y de agentes de voz con IA en una plataforma',
        competitor: 'Agentes de IA y automatizaciones para ventas y soporte'
      },
      {
        label: 'Marcador para representantes',
        ringee:
          'Marcación progresiva y preview, campañas, navegador y apps móviles',
        competitor:
          'Centrado en agentes de IA más que en un marcador para representantes',
        edge: 'ringee'
      },
      {
        label: 'Agentes de voz con IA',
        ringee:
          'Agentes de citas y recordatorios con conocimiento, herramientas y resultados estructurados',
        competitor: 'Agentes de voz con IA para ventas, soporte, cobros y más'
      },
      {
        label: 'Agentes de WhatsApp y texto',
        ringee: 'Solo voz',
        competitor: 'Agentes de WhatsApp y texto',
        edge: 'competitor'
      },
      {
        label: 'MCP',
        ringee:
          'Servidor MCP para cualquier cliente: prospectos, contactos, sesiones de llamadas, llamadas de agentes y seguimiento',
        competitor: 'MCP para crear agentes y consultar análisis desde Claude'
      },
      {
        label: 'Precios',
        ringee: `Gratis para una persona; $${PRICING.organization.price}/mes con usuarios ilimitados; uso facturado por minuto`,
        competitor: 'Planes de suscripción mensual'
      },
      {
        label: 'Código abierto y alojamiento propio',
        ringee: 'Licencia MIT; puedes alojarlo en tu infraestructura',
        competitor: 'SaaS propietario',
        edge: 'ringee'
      }
    ],
    perSeat: false,
    whyRingee: [
      'Tus representantes y agentes de IA comparten números, crédito, historial y resultados.',
      'Un marcador para personas: modos progresivo y preview, campañas y presencia local.',
      'Conecta tu operador y conserva tus números donde están.',
      `Código abierto y alojamiento propio, con $${PRICING.organization.price}/mes para usuarios ilimitados.`,
      'Control desde cualquier cliente MCP, la CLI o la API.'
    ],
    whenCompetitor: [
      'Quieres agentes de WhatsApp y texto además de voz.',
      'Quieres automatizaciones listas para conectar agentes a muchas herramientas empresariales.',
      'Tu equipo no hace llamadas humanas y no necesita un marcador.'
    ],
    switching: [
      {
        title: 'Recrea el agente',
        description:
          'Empieza con la plantilla de citas o recordatorios, añade tus instrucciones y conocimiento y pruébalo en el navegador.'
      },
      {
        title: 'Configura tus números',
        description: `Compra números locales en ${PHONE_NUMBER_COUNTRIES.length} países o conecta tu operador actual mediante BYOC.`
      },
      {
        title: 'Conecta tus herramientas',
        description:
          'Integra Ringee en tu flujo con Attio, Odoo, la API de integraciones personalizadas o MCP desde Claude y ChatGPT.'
      }
    ],
    faqs: [
      {
        question: '¿Es Ringee una buena alternativa a Dapta?',
        answer: `Sí, si necesitas representantes y agentes de IA en la misma plataforma de llamadas. Ringee combina agentes de voz, marcador progresivo, historial y grabaciones compartidos, BYOC y control MCP con un plan de $${PRICING.organization.price}/mes. Si necesitas agentes de WhatsApp, Dapta los ofrece y Ringee no.`
      },
      {
        question: '¿Puedo usar Ringee desde Claude, como Dapta?',
        answer:
          'Sí. El servidor MCP de Ringee funciona con Claude, ChatGPT y cualquier cliente MCP: busca e importa prospectos, crea sesiones, inicia llamadas de agentes de voz, registra resultados y programa seguimiento.'
      },
      {
        question: '¿Está Ringee disponible en español?',
        answer:
          'Sí. La app de Ringee está disponible en español para España y México, además de inglés, francés, portugués, alemán, italiano y neerlandés.'
      }
    ],
    path: ES_MARKETING_ROUTES['/compare/dapta']
  }
];

export function getEsComparison(slug: string) {
  return ES_COMPARISONS.find((page) => page.slug === slug);
}
