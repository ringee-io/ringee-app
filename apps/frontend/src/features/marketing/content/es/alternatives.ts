import { ES_MARKETING_ROUTES } from './routes';
import type { AlternativesContent } from '../alternatives';
import { PRICING } from '../../site';
import { CALL_RATE_FROM } from '../phone-numbers';

/** Spanish edition of the existing commercial content; prices remain shared. */
export const ES_ALTERNATIVES: (AlternativesContent & { path: string })[] = [
  {
    slug: 'aircall',
    competitor: 'Aircall',
    metaTitle: '7 alternativas a Aircall para llamadas e IA | Ringee',
    metaDescription:
      'Compara alternativas a Aircall: Ringee, JustCall, Ringover, CloudTalk, Dialpad, Kixie y Quo. Precios y encaje para llamadas salientes e IA.',
    h1: 'Alternativas a Aircall para llamadas salientes y con IA',
    intro: [
      'Aircall es una centralita en la nube sólida, especialmente para soporte entrante. Los equipos suelen buscar otras opciones cuando la factura por usuario crece más rápido que los resultados, las llamadas salientes se convierten en la tarea principal o necesitan agentes de IA que hagan llamadas.',
      'Estas siete alternativas muestran para quién encaja cada una y qué conviene revisar. Somos los creadores de Ringee y lo presentamos primero; las demás también son alternativas reales que merece la pena probar.'
    ],
    reasons: [
      'Precio por usuario, normalmente con un mínimo de usuarios',
      'Diseño de centro de llamadas entrantes para un equipo que hace principalmente llamadas salientes',
      'Agentes de voz y automatización con IA que requieren complementos o herramientas propias',
      'Configuración de BYOC que requiere ayuda del equipo comercial o de cuentas'
    ],
    criteria: [
      {
        title: 'Modelo de precios',
        description:
          'Por usuario, organización o uso, y cómo cambia la factura al contratar.'
      },
      {
        title: 'Herramientas de llamadas salientes',
        description:
          'Modos de marcación, presencia local, campañas, horarios y gestión de listas de no llamar.'
      },
      {
        title: 'IA durante la llamada',
        description:
          'Si la IA solo toma notas o también hace llamadas, agenda reuniones y devuelve resultados estructurados.'
      },
      {
        title: 'Tus números',
        description: 'Comprar, portar o conectar el operador que ya tienes.'
      }
    ],
    options: [
      {
        name: 'Ringee',
        isRingee: true,
        bestFor:
          'Equipos de llamadas salientes que quieren precio fijo y agentes de voz con IA',
        pricingModel: `Gratis para una persona; $${PRICING.organization.price}/mes por organización con usuarios ilimitados; llamadas desde ${CALL_RATE_FROM}/min`,
        summary:
          'Plataforma de llamadas para representantes y agentes de voz con IA, con marcador progresivo, BYOC y control mediante MCP.',
        strengths: [
          'Marcación progresiva y preview, rotación del identificador y campañas de equipo',
          'Agentes de voz con IA que hacen llamadas salientes, agendan reuniones y comunican recordatorios',
          'BYOC: conecta tu operador SIP o centralita y conserva tus números',
          'Servidor MCP, CLI y API: gestiona llamadas y seguimiento desde Claude o ChatGPT',
          'Código abierto (MIT) y alojamiento propio'
        ],
        watchOuts: [
          'Sin menús IVR ni colas para centros de llamadas entrantes',
          'Centrado en llamadas: la mensajería no es el núcleo del producto',
          'Sin marcación predictiva ni paralela'
        ]
      },
      {
        name: 'JustCall',
        compareSlug: 'justcall',
        bestFor:
          'Equipos de ventas que llaman y envían mensajes desde una herramienta',
        pricingModel: 'Por usuario al mes',
        summary:
          'Sistema telefónico para ventas y soporte con mensajería empresarial, varios modos de marcación y productos de IA.',
        strengths: [
          'SMS, MMS y mensajes masivos integrados',
          'Varios modos de marcación, incluidos predictivo y paralelo',
          'Productos como agentes de voz y formación con IA'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'SaaS propietario; sin alojamiento propio'
        ]
      },
      {
        name: 'Ringover',
        compareSlug: 'ringover',
        bestFor: 'Equipos europeos que quieren llamadas incluidas por usuario',
        pricingModel:
          'Por usuario al mes, con llamadas a muchos destinos incluidas',
        summary:
          'Centralita europea en la nube con números internacionales, power dialer, funciones de centro de llamadas y herramientas de IA.',
        strengths: [
          'Llamadas a muchos destinos incluidas en los planes',
          'Números internacionales en muchos países',
          'IVR y enrutamiento de centro de llamadas'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'SaaS propietario; sin alojamiento propio'
        ]
      },
      {
        name: 'CloudTalk',
        bestFor:
          'Equipos de ventas y soporte de pymes que necesitan funciones de centro de llamadas',
        pricingModel: 'Por usuario al mes',
        summary:
          'Software de centro de llamadas en la nube para ventas y soporte, con marcadores, IVR e integraciones con CRM.',
        strengths: [
          'Funciones de centro para llamadas entrantes y salientes',
          'Marcadores para equipos de llamadas salientes',
          'Integraciones con CRM'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'SaaS propietario; sin alojamiento propio'
        ]
      },
      {
        name: 'Dialpad',
        bestFor:
          'Empresas que quieren un proveedor de comunicaciones centrado en IA',
        pricingModel: 'Por usuario al mes',
        summary:
          'Plataforma de comunicaciones en la nube centrada en IA que reúne teléfono empresarial, reuniones y centro de contacto.',
        strengths: [
          'Transcripción con IA y análisis de llamadas integrados',
          'Teléfono, reuniones y centro de contacto de un proveedor'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'Plataforma amplia; puede superar las necesidades de un equipo de llamadas salientes'
        ]
      },
      {
        name: 'Kixie',
        bestFor:
          'Equipos SDR centrados en power dialer y automatización del CRM',
        pricingModel: 'Por usuario al mes',
        summary:
          'Plataforma de interacción comercial centrada en power dialer, presencia local y automatización del CRM.',
        strengths: [
          'Power dialer y presencia local',
          'Automatización integrada del CRM',
          'Popular entre equipos SDR y de ventas internas'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'SaaS propietario; sin alojamiento propio'
        ]
      },
      {
        name: 'Quo (antes OpenPhone)',
        bestFor:
          'Equipos pequeños que necesitan principalmente una línea empresarial compartida',
        pricingModel: 'Por usuario al mes',
        summary:
          'Teléfono empresarial sencillo para equipos pequeños, con números compartidos y mensajería.',
        strengths: [
          'Configuración sencilla para equipos pequeños',
          'Números compartidos y mensajería empresarial',
          'Apps móviles y de escritorio'
        ],
        watchOuts: [
          'No está pensado para marcación saliente de gran volumen',
          'El precio por usuario crece con cada contratación'
        ]
      }
    ],
    faqs: [
      {
        question: '¿Cuál es la mejor alternativa a Aircall?',
        answer: `Depende del trabajo. Ringee encaja para llamadas salientes con precio fijo e IA: $${PRICING.organization.price}/mes con usuarios ilimitados, marcador progresivo y agentes que hacen llamadas reales. JustCall encaja para ventas con muchos mensajes; Ringover, para equipos europeos que quieren llamadas incluidas por usuario.`
      },
      {
        question: '¿Hay una alternativa gratuita a Aircall?',
        answer:
          'Ringee tiene un plan Freelancer gratuito para una persona, con llamadas desde el navegador, grabación, transcripción, devoluciones de llamada, reuniones y sincronización del CRM. Las llamadas se pagan por uso con el crédito del espacio de trabajo.'
      },
      {
        question:
          '¿Qué alternativa a Aircall es más económica para un equipo en crecimiento?',
        answer: `Las herramientas por usuario aumentan la factura con cada contratación. Ringee cobra $${PRICING.organization.price}/mes para toda la organización con usuarios ilimitados. Las llamadas se pagan por uso desde ${CALL_RATE_FROM}/min.`
      }
    ],
    path: ES_MARKETING_ROUTES['/alternatives/aircall']
  },
  {
    slug: 'ringover',
    competitor: 'Ringover',
    metaTitle: '6 alternativas a Ringover para ventas | Ringee',
    metaDescription:
      'Compara alternativas a Ringover: Ringee, Aircall, CloudTalk, JustCall, Dialpad y Quo. Modelos de precios, coste de llamadas, marcadores e IA.',
    h1: 'Alternativas a Ringover para equipos de llamadas salientes',
    intro: [
      'Ringover es una centralita en la nube completa con llamadas incluidas por usuario. Los equipos buscan alternativas cuando ese precio deja de encajar al crecer, necesitan agentes de IA que hagan llamadas salientes o quieren mayor control de su plataforma.',
      'Estas seis alternativas muestran para quién encaja cada una y qué conviene revisar. Somos los creadores de Ringee y lo presentamos primero; las demás también son alternativas reales que merece la pena probar.'
    ],
    reasons: [
      'Precio por usuario, incluso para quienes llaman ocasionalmente',
      'Necesidad de agentes de voz con IA para llamadas salientes, además de responder',
      'Comparar compatibilidad y costes de BYOC para conservar el operador actual',
      'Preferencia por código abierto o alojamiento propio'
    ],
    criteria: [
      {
        title: 'Modelo de precios',
        description:
          'Usuarios con minutos incluidos o plan fijo con llamadas de pago por uso.'
      },
      {
        title: 'Cobertura internacional',
        description:
          'En qué países puedes comprar números y qué documentos necesitas.'
      },
      {
        title: 'IA durante la llamada',
        description: 'IA que responde llamadas, que las hace o ambas.'
      },
      {
        title: 'Necesidades de llamadas entrantes',
        description: 'Si necesitas menús IVR y colas.'
      }
    ],
    options: [
      {
        name: 'Ringee',
        isRingee: true,
        bestFor:
          'Equipos de llamadas salientes que quieren precio fijo, agentes de voz con IA y control de su plataforma',
        pricingModel: `Gratis para una persona; $${PRICING.organization.price}/mes por organización con usuarios ilimitados; llamadas desde ${CALL_RATE_FROM}/min`,
        summary:
          'Plataforma de llamadas para representantes y agentes de voz con IA, con números en decenas de países, BYOC y control mediante MCP.',
        strengths: [
          'Marcación progresiva y preview, rotación del identificador y campañas de equipo',
          'Agentes de voz con IA que hacen llamadas salientes, agendan reuniones y comunican recordatorios',
          'BYOC: conecta tu operador SIP o centralita y conserva tus números',
          'Servidor MCP, CLI y API: gestiona llamadas y seguimiento desde Claude o ChatGPT',
          'Código abierto (MIT) y alojamiento propio'
        ],
        watchOuts: [
          'Sin menús IVR ni colas para centros de llamadas entrantes',
          'Centrado en llamadas: la mensajería no es el núcleo del producto',
          'Sin marcación predictiva ni paralela'
        ]
      },
      {
        name: 'Aircall',
        compareSlug: 'aircall',
        bestFor:
          'Equipos de soporte y ventas que necesitan un centro completo de llamadas en la nube',
        pricingModel:
          'Por usuario al mes, normalmente con un mínimo de usuarios',
        summary:
          'Centralita y centro de llamadas en la nube con números compartidos, IVR y un amplio catálogo de integraciones.',
        strengths: [
          'Funciones de llamadas entrantes: IVR, colas y bandeja compartida',
          'Amplio catálogo de integraciones con CRM y soporte',
          'Ampliamente usado por equipos de soporte y ventas'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'SaaS propietario; sin alojamiento propio'
        ]
      },
      {
        name: 'CloudTalk',
        bestFor:
          'Equipos de ventas y soporte de pymes que necesitan funciones de centro de llamadas',
        pricingModel: 'Por usuario al mes',
        summary:
          'Software de centro de llamadas en la nube para ventas y soporte, con marcadores, IVR e integraciones con CRM.',
        strengths: [
          'Funciones de centro para llamadas entrantes y salientes',
          'Marcadores para equipos de llamadas salientes',
          'Integraciones con CRM'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'SaaS propietario; sin alojamiento propio'
        ]
      },
      {
        name: 'JustCall',
        compareSlug: 'justcall',
        bestFor:
          'Equipos de ventas que llaman y envían mensajes desde una herramienta',
        pricingModel: 'Por usuario al mes',
        summary:
          'Sistema telefónico para ventas y soporte con mensajería empresarial, varios modos de marcación y productos de IA.',
        strengths: [
          'SMS, MMS y mensajes masivos integrados',
          'Varios modos de marcación, incluidos predictivo y paralelo',
          'Productos como agentes de voz y formación con IA'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'SaaS propietario; sin alojamiento propio'
        ]
      },
      {
        name: 'Dialpad',
        bestFor:
          'Empresas que quieren un proveedor de comunicaciones centrado en IA',
        pricingModel: 'Por usuario al mes',
        summary:
          'Plataforma de comunicaciones en la nube centrada en IA que reúne teléfono empresarial, reuniones y centro de contacto.',
        strengths: [
          'Transcripción con IA y análisis de llamadas integrados',
          'Teléfono, reuniones y centro de contacto de un proveedor'
        ],
        watchOuts: [
          'El precio por usuario crece con cada contratación',
          'Plataforma amplia; puede superar las necesidades de un equipo de llamadas salientes'
        ]
      },
      {
        name: 'Quo (antes OpenPhone)',
        bestFor:
          'Equipos pequeños que necesitan principalmente una línea empresarial compartida',
        pricingModel: 'Por usuario al mes',
        summary:
          'Teléfono empresarial sencillo para equipos pequeños, con números compartidos y mensajería.',
        strengths: [
          'Configuración sencilla para equipos pequeños',
          'Números compartidos y mensajería empresarial',
          'Apps móviles y de escritorio'
        ],
        watchOuts: [
          'No está pensado para marcación saliente de gran volumen',
          'El precio por usuario crece con cada contratación'
        ]
      }
    ],
    faqs: [
      {
        question: '¿Cuál es la mejor alternativa a Ringover?',
        answer: `Para equipos de llamadas salientes, Ringee: $${PRICING.organization.price}/mes con usuarios ilimitados, llamadas por uso desde ${CALL_RATE_FROM}/min, marcador progresivo y agentes de voz con IA que llaman. Para un centro de llamadas entrantes con IVR y colas, Aircall o CloudTalk.`
      },
      {
        question: '¿Hay una alternativa a Ringover en español?',
        answer:
          'Sí. La app de Ringee está disponible en español para España y México. Ringee vende números en España, México, Colombia y muchos otros países.'
      }
    ],
    path: ES_MARKETING_ROUTES['/alternatives/ringover']
  }
];

export function getEsAlternatives(slug: string) {
  return ES_ALTERNATIVES.find((page) => page.slug === slug);
}
