import { ES_MARKETING_ROUTES } from './routes';
import type { SolutionContent } from '../solutions';
import { PRICING } from '../../site';
import { CALL_RATE_FROM, PHONE_NUMBER_COUNTRIES } from '../phone-numbers';
import { localizedHref } from '../../locale';

/** Spanish edition of the existing commercial content; prices remain shared. */
export const ES_SOLUTIONS: (SolutionContent & { path: string })[] = [
  {
    slug: 'outbound-calling',
    path: ES_MARKETING_ROUTES['/ai-voice-agents/outbound-calling'],
    parent: {
      name: 'Agentes de voz con IA',
      href: '/ai-voice-agents'
    },
    name: 'Llamadas salientes con IA',
    eyebrow: 'Agentes de voz con IA',
    tagline:
      'Agentes de voz con IA que hacen tus llamadas salientes, conversan y registran el resultado.',
    metaTitle: 'Llamadas salientes con IA y agentes de voz | Ringee',
    metaDescription:
      'Agentes de voz IA que llaman, agendan reuniones, envían recordatorios y registran resultados. Control de no llamar y sin tarifas por usuario.',
    h1: 'Llamadas salientes con IA que agendan reuniones y registran resultados',
    intro: [
      'Los agentes de voz con IA de Ringee hacen llamadas telefónicas salientes para tu equipo. Cada agente tiene su propia voz, instrucciones y contexto de empresa. Mantiene la conversación, consulta tu calendario antes de ofrecer una hora, agenda la reunión o comunica el recordatorio y guarda el resultado en el mismo historial que usan tus representantes.',
      'Inicia llamadas desde el panel, la API REST, la CLI o un asistente como ChatGPT o Claude mediante MCP. Cada llamada del agente pasa los mismos controles que una llamada humana: permisos de llamada, lista de no llamar, crédito del espacio de trabajo e identificador de llamada. Siempre se graba y transcribe.'
    ],
    whoFor: [
      'Equipos de ventas que quieren contactar a cada nuevo prospecto mientras mantiene el interés',
      'Equipos de operaciones que confirman citas y envían recordatorios',
      'Agencias que gestionan programas de llamadas para varios clientes',
      'Fundadores que necesitan iniciar la prospección telefónica antes de contratar SDR'
    ],
    benefits: [
      'Las llamadas empiezan cuando las activa tu flujo, sin esperar a que haya un representante libre',
      'Las reuniones se agendan solo en los huecos disponibles de tu calendario',
      'Resultado, resumen, sentimiento y campos personalizados después de cada llamada',
      'Representantes y agentes de IA comparten números, crédito e historial',
      `Sin tarifas por usuario: un plan de equipo de $${PRICING.organization.price}/mes y uso facturado por minuto`
    ],
    capabilitiesTitle: 'Qué puede hacer una llamada saliente con IA',
    capabilities: [
      {
        title: 'Hacer la llamada',
        description: `El agente llama desde un número de Ringee que le asignas. Hay números locales, gratuitos y móviles en ${PHONE_NUMBER_COUNTRIES.length} países. Empieza con el saludo que configuras.`
      },
      {
        title: 'Mantener una conversación real',
        description:
          'Dale un nombre, una voz —incluida una copia de la voz de alguien del equipo—, contexto de empresa e instrucciones. Añade páginas web y documentos que pueda consultar mientras habla.'
      },
      {
        title: 'Agendar la reunión',
        description:
          'Los agentes de citas consultan la disponibilidad real antes de ofrecer una hora y reservan solo el hueco que acepta la persona.'
      },
      {
        title: 'Volver a llamar más tarde',
        description:
          'Si alguien pide hablar en otro momento, el agente programa la devolución de llamada y vuelve a llamar a esa hora con el mismo contexto.'
      },
      {
        title: 'Solicitar seguimiento humano',
        description:
          'Si alguien pide hablar con una persona, el agente envía a los administradores una solicitud de seguimiento con el contexto por email y notificación push. No promete una transferencia en vivo.'
      },
      {
        title: 'Devolver resultados estructurados',
        description:
          'Después de la llamada recibes la grabación, transcripción, resultado, resumen, sentimiento opcional y los campos que hayas pedido extraer.'
      }
    ],
    howItWorksTitle: 'Cómo funcionan las llamadas salientes con IA en Ringee',
    howItWorks: [
      {
        title: 'Elige una plantilla',
        description:
          'Empieza con la plantilla de citas o la de recordatorios y notificaciones. Cada una incluye herramientas probadas y controles que no puedes romper por accidente.'
      },
      {
        title: 'Pruébalo en el navegador',
        description:
          'Habla con el agente por el micrófono antes de que llame a nadie. Las pruebas en el navegador no hacen llamadas telefónicas ni consumen crédito de llamadas.'
      },
      {
        title: 'Activa llamadas reales',
        description:
          'Inicia llamadas desde el panel, la API, la CLI o mediante MCP desde ChatGPT, Claude o tu propio agente. Revisa cada resultado en Ringee.'
      }
    ],
    sections: [
      {
        kind: 'cards',
        id: 'use-cases',
        title: 'Llamadas salientes que un agente de IA resuelve bien',
        description:
          'Las llamadas repetibles con un objetivo claro son las primeras en las que un agente aporta valor.',
        items: [
          {
            title: 'Seguimiento inmediato de nuevos prospectos',
            description:
              'Activa una llamada al recibir un formulario, confirma el interés y agenda la reunión mientras la persona aún recuerda haberlo enviado.'
          },
          {
            title: 'Confirmación de citas',
            description:
              'Confirma la cita de mañana, responde con el contexto que has proporcionado y programa una devolución de llamada si la hora ya no sirve.'
          },
          {
            title: 'Reactivar prospectos sin respuesta',
            description:
              'Llama a prospectos que dejaron de responder, averigua su situación y guarda sus respuestas en campos que tu equipo pueda filtrar.'
          },
          {
            title: 'Seguimiento de eventos y seminarios web',
            description:
              'Llama a los inscritos después del evento, registra su interés en un campo estructurado y agenda el siguiente paso.'
          }
        ]
      },
      {
        kind: 'table',
        id: 'human-or-ai',
        title: 'Cuándo llama el agente y cuándo llama tu equipo',
        description:
          'Ambos usan los mismos números e historial en Ringee. Puedes repartir el trabajo por tipo de llamada.',
        columns: [
          'Tipo de llamada',
          'Agente de voz con IA',
          'Tus representantes en Ringee'
        ],
        rows: [
          [
            'Confirmaciones, recordatorios y cualificación inicial',
            'Buena opción: tareas repetibles con reglas claras',
            'Libéralos para llamadas de mayor valor'
          ],
          [
            'Negociación, objeciones y cierre',
            'Deriva mediante una solicitud de seguimiento',
            'Buena opción: hace falta criterio humano'
          ],
          [
            'Trabajar una lista larga',
            'Una llamada por activación de tu flujo o asistente',
            'Campañas con marcación progresiva'
          ],
          [
            'Después de la llamada',
            'Resultado, resumen y campos extraídos',
            'Resultado, notas, devoluciones de llamada y reuniones'
          ]
        ]
      },
      {
        kind: 'checklist',
        id: 'guardrails',
        title: 'Controles en cada llamada con IA',
        description:
          'Las normas de llamadas con IA sobre consentimiento, identificación y horarios varían por país. Ringee aplica sus controles en cada llamada; te corresponde obtener el consentimiento.',
        items: [
          'Cada llamada del agente consulta tu lista de no llamar antes de marcar, desde el panel, la API, la CLI o MCP.',
          'El agente presenta el número que le asignaste. Si hay varios números y ninguno asignado, Ringee rechaza la llamada en vez de elegir un identificador por su cuenta.',
          'La llamada del agente se rechaza si el espacio de trabajo no tiene crédito.',
          'Cada llamada del agente se graba y transcribe para que puedas revisar exactamente lo que se dijo.',
          'El agente solo dice que una persona hará seguimiento cuando la solicitud de seguimiento ya se ha creado.'
        ]
      }
    ],
    pricing: {
      title: 'Cuánto cuestan las llamadas salientes con IA',
      body: [
        `Los agentes de voz con IA forman parte del plan Organization: $${PRICING.organization.price}/mes para toda la organización, con usuarios ilimitados y sin tarifa por usuario para agentes.`,
        `Cada llamada se factura por minuto con el crédito del espacio de trabajo: la llamada telefónica, desde ${CALL_RATE_FROM}/min, más el minuto del agente que cubre reconocimiento de voz, voz y modelo de IA. Las páginas de números muestran el precio exacto por país.`,
        'Las conversaciones de prueba en el navegador no hacen llamadas telefónicas ni consumen crédito de llamadas.'
      ]
    },
    related: [
      {
        name: 'Agentes de voz con IA',
        href: '/ai-voice-agents',
        tagline:
          'Cómo se crean los agentes: voz, conocimiento, herramientas, resultados y controles.'
      },
      {
        name: 'SDR con IA',
        href: '/ai-voice-agents/ai-sdr',
        tagline:
          'Un SDR con IA que llama a prospectos, los cualifica y agenda reuniones.'
      },
      {
        name: 'Marcador de ventas',
        href: '/sales-dialer',
        tagline:
          'Marcación progresiva y preview para las llamadas de tus representantes.'
      },
      {
        name: 'MCP para agentes de IA',
        href: '/integrations/mcp',
        tagline:
          'Inicia llamadas de agentes desde Claude, ChatGPT o cualquier cliente MCP.'
      },
      {
        name: 'Números virtuales por país',
        href: '/phone-numbers',
        tagline: `Números locales, gratuitos y móviles en ${PHONE_NUMBER_COUNTRIES.length} países.`
      },
      {
        name: 'Transcripción de llamadas',
        href: '/features/call-transcription',
        tagline:
          'Transcripciones que puedes buscar y análisis con IA de cada llamada.'
      }
    ],
    cta: {
      title: 'Pon un agente de voz con IA a hacer tus llamadas salientes',
      description:
        'Crea un agente, pruébalo en el navegador y deja que haga llamadas reales desde la misma plataforma que usa tu equipo.'
    },
    ai: true,
    faqs: [
      {
        question: '¿Qué son las llamadas salientes con IA?',
        answer:
          'Son llamadas en las que un agente de voz con IA marca el número y mantiene la conversación. En Ringee, el agente llama a un número real, habla con la persona, usa herramientas como la reserva de citas y devuelve una grabación, transcripción y resultado estructurado.'
      },
      {
        question: '¿Puede un agente de IA llamar a una lista completa?',
        answer:
          'Sí, una llamada por contacto activada por tu flujo. La API, la CLI y las herramientas MCP permiten iniciar llamadas de agentes; un script, una automatización del CRM o un asistente como Claude puede recorrer una lista. Cada llamada pasa los mismos controles de no llamar, crédito e identificador de llamada.'
      },
      {
        question:
          '¿Es legal hacer llamadas salientes con un agente de voz con IA?',
        answer:
          'Depende del país al que llames y del consentimiento obtenido. En Estados Unidos, por ejemplo, la FCC resolvió en 2024 que las voces generadas por IA son voces artificiales según la TCPA, por lo que estas llamadas generalmente requieren el consentimiento expreso previo de la persona. Consulta las normas de cada país; esto no es asesoramiento legal. Ringee revisa tu lista de no llamar y graba cada llamada del agente; obtener el consentimiento te corresponde a ti.'
      },
      {
        question: '¿Puede el agente transferir la llamada a una persona?',
        answer:
          'No en vivo. Si alguien pide hablar con una persona, el agente crea una solicitud de seguimiento con el contacto, la llamada y una breve explicación. Los administradores la reciben por email y notificación push. Tu representante devuelve la llamada desde el mismo historial.'
      },
      {
        question: '¿Desde qué número llama el agente?',
        answer:
          'Desde un número de Ringee que le asignas o el que indicas en la llamada. Si el espacio de trabajo tiene varios números y ninguno asignado, Ringee rechaza la llamada en vez de elegir uno por ti.'
      },
      {
        question: '¿Puedo usar mi propio modelo de IA?',
        answer:
          'Sí. Usa la opción gestionada por Ringee o elige un proveedor compatible y verifica tu propia clave de API al configurar el agente.'
      },
      {
        question: '¿En qué se diferencia de una API de voz con IA?',
        answer:
          'Las plataformas para desarrolladores ofrecen las piezas de un agente de voz. Ringee ofrece el agente y la operación de llamadas que lo rodea: números, marcador para tus representantes, historial compartido, grabaciones, sincronización del CRM y control mediante MCP, en una plataforma de código abierto.'
      }
    ]
  },
  {
    slug: 'ai-sdr',
    path: ES_MARKETING_ROUTES['/ai-voice-agents/ai-sdr'],
    parent: {
      name: 'Agentes de voz con IA',
      href: '/ai-voice-agents'
    },
    name: 'SDR con IA',
    eyebrow: 'Agentes de voz con IA',
    tagline:
      'Un SDR de voz con IA que llama a prospectos, los cualifica y agenda reuniones en tu calendario real.',
    metaTitle: 'SDR con IA que llama y agenda reuniones | Ringee',
    metaDescription:
      'Un SDR con IA que llama, cualifica prospectos, agenda reuniones y registra resultados. Compatible con Apollo, Claude y ChatGPT.',
    h1: 'El SDR con IA que llama, cualifica y agenda la reunión',
    intro: [
      'La mayoría de herramientas de SDR con IA escriben emails. El SDR con IA de Ringee hace llamadas. Es un agente de voz que llama a tus prospectos, hace tus preguntas de cualificación, responde con el contexto y conocimiento de tu empresa y agenda una reunión cuando hay encaje.',
      'Trabaja junto a tus representantes. Los prospectos llegan desde Apollo o Prospeo, las llamadas y resultados se guardan en el mismo historial y lo que el agente no puede resolver genera una solicitud de seguimiento humano. Puedes gestionar todo el proceso desde Claude o ChatGPT mediante MCP.'
    ],
    whoFor: [
      'Equipos SDR que quieren llamar a todos los prospectos, incluidos los menos evidentes',
      'Fundadores que hacen prospección antes de contratar su primer SDR',
      'Agencias que agendan citas para sus clientes',
      'Equipos de ventas que siguen solicitudes de demo recibidas'
    ],
    benefits: [
      'Cada prospecto recibe una llamada real, activada por tu flujo',
      'Respuestas de cualificación guardadas en los campos que defines',
      'Reuniones agendadas solo en los huecos libres de tu calendario',
      'Los representantes se concentran en las conversaciones listas para avanzar',
      'Prospección, llamadas y seguimiento en una plataforma de código abierto'
    ],
    capabilitiesTitle: 'Qué hace el SDR con IA durante una llamada',
    capabilities: [
      {
        title: 'Llama al prospecto',
        description:
          'Inicia una llamada saliente real desde un número de tu espacio de trabajo, con el nombre y los datos del prospecto como variables de la llamada.'
      },
      {
        title: 'Cualifica durante la conversación',
        description:
          'Hace tus preguntas en lenguaje natural y guarda las respuestas como campos personalizados: tamaño del equipo, plazos, herramienta actual o lo que uses para cualificar.'
      },
      {
        title: 'Responde preguntas',
        description:
          'Responde con el perfil de empresa y el conocimiento que añades: páginas web, documentos de producto y notas.'
      },
      {
        title: 'Agenda la reunión',
        description:
          'Consulta la disponibilidad real de tu calendario de Ringee, ofrece huecos libres y reserva el que acepta el prospecto.'
      },
      {
        title: 'Programa la devolución de llamada',
        description:
          'Si no es buen momento, acuerda una hora y vuelve a llamar automáticamente con el mismo contexto y variables.'
      },
      {
        title: 'Solicita seguimiento a tu equipo',
        description:
          'Si un prospecto pide hablar con una persona, el agente envía a tu equipo una solicitud de seguimiento con el contexto de la llamada.'
      }
    ],
    howItWorksTitle: 'Cómo poner en marcha un SDR con IA en Ringee',
    howItWorks: [
      {
        title: 'Incorpora los prospectos',
        description:
          'Busca en Apollo o Prospeo desde Ringee, importa una lista o pide a Claude o ChatGPT que encuentre e importe los contactos adecuados.'
      },
      {
        title: 'Configura el agente',
        description:
          'Empieza con la plantilla de citas, añade tu presentación, campos de cualificación y conocimiento, y pruébalo en el navegador.'
      },
      {
        title: 'Llama y revisa',
        description:
          'Activa llamadas desde el panel, la API, la CLI o MCP. Revisa el resultado, la transcripción y los campos extraídos; tus representantes atienden las reuniones.'
      }
    ],
    sections: [
      {
        kind: 'table',
        id: 'email-or-voice',
        title: 'SDR con IA por email y SDR con IA por teléfono',
        description:
          'Resuelven partes distintas del trabajo y se complementan: el email abre la puerta; la llamada cualifica y agenda.',
        columns: ['', 'SDR con IA por email', 'SDR con IA de Ringee'],
        rows: [
          ['Canal', 'Email y, a veces, LinkedIn', 'Llamadas telefónicas'],
          [
            'Qué produce',
            'Secuencias y respuestas',
            'Conversaciones en vivo, reuniones agendadas y transcripciones'
          ],
          [
            'Cualificación',
            'A partir de respuestas escritas',
            'Se pregunta durante la llamada y se guarda en campos'
          ],
          [
            'Tus representantes',
            'Trabajan en herramientas separadas',
            'Comparten números, marcador e historial'
          ],
          [
            'Precios',
            'Varían: suelen ser por usuario, contacto o crédito',
            `Un plan de equipo de $${PRICING.organization.price}/mes más uso por minuto`
          ]
        ]
      },
      {
        kind: 'checklist',
        id: 'guardrails',
        title: 'Controles en cada llamada del SDR con IA',
        description:
          'Las normas de llamadas con IA sobre consentimiento, identificación y horarios varían por país. Ringee aplica sus controles en cada llamada; te corresponde obtener el consentimiento.',
        items: [
          'Cada llamada del agente consulta tu lista de no llamar antes de marcar, desde el panel, la API, la CLI o MCP.',
          'El agente presenta el número que le asignaste. Si hay varios números y ninguno asignado, Ringee rechaza la llamada en vez de elegir un identificador por su cuenta.',
          'La llamada del agente se rechaza si el espacio de trabajo no tiene crédito.',
          'Cada llamada del agente se graba y transcribe para que puedas revisar exactamente lo que se dijo.',
          'El agente solo dice que una persona hará seguimiento cuando la solicitud de seguimiento ya se ha creado.'
        ]
      }
    ],
    pricing: {
      title: 'Cuánto cuesta el SDR con IA',
      body: [
        `Los agentes de voz con IA forman parte del plan Organization: $${PRICING.organization.price}/mes para toda la organización, con usuarios ilimitados y sin tarifa por usuario para agentes.`,
        `Cada llamada se factura por minuto con el crédito del espacio de trabajo: la llamada telefónica, desde ${CALL_RATE_FROM}/min, más el minuto del agente que cubre reconocimiento de voz, voz y modelo de IA. Las páginas de números muestran el precio exacto por país.`,
        'Las conversaciones de prueba en el navegador no hacen llamadas telefónicas ni consumen crédito de llamadas.'
      ]
    },
    related: [
      {
        name: 'Llamadas salientes con IA',
        href: '/ai-voice-agents/outbound-calling',
        tagline:
          'Agentes de voz con IA que hacen llamadas salientes y registran cada resultado.'
      },
      {
        name: 'Marcador de ventas',
        href: '/sales-dialer',
        tagline:
          'Marcación progresiva y preview para las llamadas de tus representantes.'
      },
      {
        name: 'Apollo',
        href: '/integrations/apollo',
        tagline: 'Busca y enriquece prospectos de Apollo; después, llámalos.'
      },
      {
        name: 'Claude',
        href: '/integrations/claude',
        tagline: 'Gestiona prospección, llamadas y seguimiento desde Claude.'
      },
      {
        name: 'Reuniones',
        href: '/features/meetings',
        tagline:
          'Reuniones agendadas durante una llamada y sincronizadas con Google Calendar.'
      },
      {
        name: 'Equipos SDR',
        href: '/use-cases/sdr-teams',
        tagline: 'Cómo hacen prospección telefónica los equipos SDR en Ringee.'
      }
    ],
    cta: {
      title: 'Llama de verdad a cada prospecto',
      description:
        'Configura un SDR con IA, pruébalo en el navegador y deja que tus representantes atiendan las reuniones que agenda.'
    },
    ai: true,
    faqs: [
      {
        question: '¿Qué es un SDR con IA?',
        answer:
          'Es un software que realiza tareas de un representante de desarrollo de ventas: contactar a prospectos, cualificarlos y agendar reuniones. La mayoría trabaja por email. El de Ringee trabaja por teléfono: un agente de voz llama al prospecto, lo cualifica durante la conversación y agenda la reunión.'
      },
      {
        question: '¿Sustituirá un SDR con IA a mi equipo SDR?',
        answer:
          'Se ocupa de las llamadas repetitivas —primer contacto, seguimiento y recordatorios— para que tus representantes atiendan las conversaciones que requieren criterio. En Ringee ambos usan los mismos números, historial y resultados, sin perder información entre ellos.'
      },
      {
        question: '¿De dónde vienen los prospectos?',
        answer:
          'Conecta Apollo o Prospeo y busca desde Ringee, importa una lista o pide a Claude o ChatGPT que prospecte e importe mediante MCP. El enriquecimiento consume créditos de tu proveedor, no crédito de Ringee.'
      },
      {
        question: '¿Puede el SDR con IA agendar reuniones en mi calendario?',
        answer:
          'Sí. Los agentes de citas consultan la disponibilidad real antes de ofrecer una hora y reservan solo el hueco que acepta el prospecto.'
      },
      {
        question:
          '¿Es legal hacer llamadas salientes con un agente de voz con IA?',
        answer:
          'Depende del país al que llames y del consentimiento obtenido. En Estados Unidos, por ejemplo, la FCC resolvió en 2024 que las voces generadas por IA son voces artificiales según la TCPA, por lo que estas llamadas generalmente requieren el consentimiento expreso previo de la persona. Consulta las normas de cada país; esto no es asesoramiento legal. Ringee revisa tu lista de no llamar y graba cada llamada del agente; obtener el consentimiento te corresponde a ti.'
      },
      {
        question: '¿Cuánto cuesta un SDR con IA?',
        answer: `El agente no tiene tarifa por usuario. Funciona con el plan Organization de $${PRICING.organization.price}/mes. Cada llamada se factura por minuto con el crédito del espacio de trabajo: la llamada telefónica, desde ${CALL_RATE_FROM}/min, más el minuto del agente.`
      }
    ]
  },
  {
    slug: 'sales-dialer',
    path: ES_MARKETING_ROUTES['/sales-dialer'],
    name: 'Marcador de ventas',
    eyebrow: 'Marcador de ventas',
    tagline:
      'Marcador de ventas en el navegador con modos progresivo y preview, presencia local y sin tarifas por usuario.',
    metaTitle: 'Marcador de ventas progresivo y power dialer | Ringee',
    metaDescription:
      'Marcador de ventas con modos progresivo y preview, presencia local, grabación y transcripción en vivo. Gratis para uno; precio fijo para equipos.',
    h1: 'El marcador de ventas para equipos que llaman cada día',
    intro: [
      'Ringee es un marcador de ventas para llamadas salientes que funciona en el navegador, las apps de iOS y Android y la extensión de Chrome. Los representantes trabajan una cola en modo progresivo, que llama al siguiente prospecto cuando quedan libres, o en modo preview, que permite revisar cada prospecto antes de llamar.',
      `Puedes grabar y transcribir llamadas en vivo, registrar resultados y devoluciones de llamada en la misma pantalla y mostrar un número local mediante la rotación del identificador de llamada. Sin tarifa por usuario: el marcador es gratis para una persona y $${PRICING.organization.price}/mes cubre a todo el equipo.`
    ],
    video: 'campanas-marcador-progresivo',
    whoFor: [
      'Equipos SDR y BDR que trabajan listas cada día',
      'Reclutadores que llaman a candidatos y clientes',
      'Agencias que llaman en nombre de sus clientes',
      'Startups cuyos fundadores hacen la prospección'
    ],
    benefits: [
      'Menos tiempo marcando y más conversando: el siguiente prospecto está listo cuando lo está el representante',
      'Presencia local con rotación del identificador de llamada',
      'Horarios y límites de reintentos integrados en cada campaña',
      'Control de no llamar en cada llamada, manual o de campaña',
      `Usuarios ilimitados con un plan de $${PRICING.organization.price}/mes`
    ],
    capabilitiesTitle: 'Todo lo que necesita un representante en una pantalla',
    capabilities: [
      {
        title: 'Marcación progresiva',
        description:
          'El marcador llama al siguiente prospecto cuando termina la llamada anterior. Nunca asigna un prospecto a un representante que sigue en una llamada.'
      },
      {
        title: 'Marcación preview',
        description:
          'Los representantes ven primero el prospecto y llaman cuando están listos: el modo adecuado para cuentas de alto valor.'
      },
      {
        title: 'Presencia local',
        description:
          'La rotación del identificador elige un número que coincide con el prefijo del prospecto desde un grupo de números en buen estado, respetando límites diarios por número.'
      },
      {
        title: 'Resultados, notas y devoluciones de llamada',
        description:
          'Registra el resultado al terminar la llamada, añade notas y programa la devolución sin salir de la pantalla.'
      },
      {
        title: 'Grabación y transcripción en vivo',
        description:
          'Graba llamadas y recibe una transcripción en tiempo real, conserves o no el audio.'
      },
      {
        title: 'Campañas compartidas del equipo',
        description:
          'Una cola para todo el equipo. Cada prospecto se asigna a un solo representante y se reintenta hasta el límite configurado.'
      }
    ],
    howItWorksTitle: 'Empieza a marcar en tres pasos',
    howItWorks: [
      {
        title: 'Carga la lista',
        description:
          'Importa un CSV, añade contactos o incorpora prospectos desde Apollo o Prospeo.'
      },
      {
        title: 'Elige el modo',
        description:
          'Elige progresivo para volumen o preview para cuentas que necesitas revisar antes. Configura el número o grupo de identificadores desde el que llamas.'
      },
      {
        title: 'Llama y registra',
        description:
          'Los representantes trabajan la cola desde el navegador o las apps. Cada llamada, resultado y nota se guarda en el historial compartido y en el CRM conectado.'
      }
    ],
    sections: [
      {
        kind: 'video',
        id: 'local-presence',
        title: 'Presencia local en cada llamada',
        description:
          'La rotación del identificador muestra a cada prospecto un número de su país, con su mismo prefijo cuando tienes uno, y reparte las llamadas entre tus números con un límite diario por número.',
        video: 'numeros-caller-id'
      },
      {
        kind: 'table',
        id: 'dialer-types',
        title:
          'Marcadores progresivos, preview, power, predictivos y paralelos',
        description:
          'Hay cinco modos habituales de marcadores de ventas. Así se diferencian y estos son los que admite Ringee.',
        columns: ['Modo', 'Cómo marca', 'En Ringee'],
        rows: [
          [
            'Preview',
            'El representante revisa el prospecto y después inicia la llamada',
            'Sí'
          ],
          [
            'Progresivo',
            'Llama automáticamente al siguiente prospecto cuando el representante queda libre: una llamada por representante',
            'Sí'
          ],
          [
            'Power',
            'Nombre habitual de la marcación progresiva; algunos proveedores también marcan varias líneas por representante',
            'Sí, como progresivo: una línea por representante'
          ],
          [
            'Predictivo',
            'Marca más números que representantes libres según la tasa de respuesta prevista; puede abandonar llamadas atendidas si no hay nadie libre',
            'No'
          ],
          [
            'Paralelo',
            'Marca varios números a la vez para un representante y conecta a la primera persona que responde',
            'No'
          ]
        ],
        note: 'Ringee llama a un prospecto por representante cada vez. Quien responde siempre encuentra a un representante disponible. Así se evitan las llamadas abandonadas que pueden producir la marcación predictiva y paralela.'
      },
      {
        kind: 'cards',
        id: 'compliance',
        title: 'Controles integrados en el marcador',
        items: [
          {
            title: 'Horarios de llamada',
            description:
              'Las campañas llaman solo en las horas y días configurados y en la zona horaria elegida: de 8:00 a 21:00 por defecto.'
          },
          {
            title: 'Listas de no llamar',
            description:
              'Cada llamada consulta tu lista de no llamar. Los prospectos marcados como no llamar salen de la cola.'
          },
          {
            title: 'Límites de reintentos',
            description:
              'Un prospecto se reintenta hasta el límite configurado —tres por defecto— y después se marca como agotado.'
          },
          {
            title: 'Identificador de llamada verificado',
            description:
              'Los representantes llaman desde números propios o verificados. Nunca se presenta un número sin verificar.'
          }
        ]
      }
    ],
    pricing: {
      title: 'Precios del marcador de ventas',
      body: [
        `Freelancer: $${PRICING.freelancer.price}/mes para una persona. Incluye llamadas manuales desde el navegador, las apps y la extensión de Chrome, sesiones de llamadas que trabajas manualmente, grabación, transcripción, devoluciones de llamada, reuniones y sincronización del CRM.`,
        `Organization: $${PRICING.organization.price}/mes para toda la organización, con usuarios ilimitados, campañas compartidas y agentes de voz con IA.`,
        `Las llamadas se pagan por uso con el crédito del espacio de trabajo, desde ${CALL_RATE_FROM}/min. Las páginas de números muestran la tarifa de cada país.`
      ]
    },
    related: [
      {
        name: 'Campañas',
        href: '/features/campaigns',
        tagline:
          'Campañas de llamadas con marcación progresiva y preview para equipos.'
      },
      {
        name: 'Rotación del identificador de llamada',
        href: '/features/caller-id-rotation',
        tagline: 'Presencia local desde un grupo de números en buen estado.'
      },
      {
        name: 'SDR con IA',
        href: '/ai-voice-agents/ai-sdr',
        tagline:
          'Deja las llamadas de primer contacto a un agente de voz con IA.'
      },
      {
        name: 'Resultados de llamadas',
        href: '/features/call-outcomes',
        tagline: 'Registra un resultado y notas en cada llamada.'
      },
      {
        name: 'Grabación de llamadas',
        href: '/features/call-recording',
        tagline: 'Graba llamadas de ventas para formación y revisión.'
      },
      {
        name: 'Conecta tu operador (BYOC)',
        href: '/byoc',
        tagline: 'Llama a través del operador y los números que ya tienes.'
      }
    ],
    cta: {
      title: 'Empieza a llamar hoy',
      description:
        'Gratis para una persona. Un precio fijo para todo tu equipo y llamadas de pago por uso.'
    },
    faqs: [
      {
        question: '¿Qué es un marcador de ventas?',
        answer:
          'Es un software que hace llamadas salientes para representantes de ventas, para que dediquen su tiempo a conversar en vez de teclear números. El de Ringee funciona en el navegador y las apps, con modos progresivo y preview, presencia local y registro de llamadas.'
      },
      {
        question:
          '¿Qué diferencia hay entre un marcador progresivo y uno predictivo?',
        answer:
          'El progresivo llama a un prospecto por representante y solo cuando este queda libre. El predictivo marca más números que representantes disponibles y estima cuántos responderán; algunas llamadas atendidas pueden abandonarse. Ringee usa marcación progresiva y preview.'
      },
      {
        question: '¿Un power dialer es lo mismo que un marcador progresivo?',
        answer:
          'En gran medida. Power dialer es un nombre habitual para la marcación automática de un número tras otro. En Ringee corresponde al modo progresivo: se llama al siguiente prospecto cuando el representante está listo.'
      },
      {
        question: '¿Hay un marcador de ventas gratuito?',
        answer:
          'Sí. El plan Freelancer es gratis para una persona: marcación manual desde el navegador, la extensión de Chrome y las apps, más sesiones de llamadas. Son colas de contactos que trabajas manualmente y puedes crear desde ChatGPT, Claude, la CLI o la API. Las campañas compartidas requieren el plan Organization.'
      },
      {
        question: '¿Funciona el marcador con mi CRM?',
        answer:
          'Ringee sincroniza llamadas y resultados con Attio y Odoo, incorpora prospectos de Apollo y Prospeo y envía webhooks firmados mediante la API de integraciones personalizadas para otras herramientas.'
      },
      {
        question: '¿Pueden los representantes llamar al extranjero?',
        answer: `Sí. Pueden llamar a más de 180 países desde el navegador y puedes comprar números locales, gratuitos o móviles en ${PHONE_NUMBER_COUNTRIES.length} países.`
      }
    ]
  },
  {
    slug: 'byoc',
    path: ES_MARKETING_ROUTES['/byoc'],
    name: 'Conecta tu operador (BYOC)',
    eyebrow: 'Conecta tu operador (BYOC)',
    tagline:
      'Conserva tus números y tu operador. Conéctalos a Ringee mediante SIP y añade su marcador.',
    metaTitle: 'BYOC: conecta tu operador y conserva tus números | Ringee',
    metaDescription:
      'Conecta tu operador SIP o centralita a Ringee. Conserva números, contrato y tarifas; tu equipo llama desde el navegador sin portabilidad.',
    h1: 'Conecta tu operador y conserva tus números de teléfono',
    intro: [
      'Cambiar de plataforma de llamadas suele implicar portar tus números y dejar tu operador. Con Ringee puedes conservar ambos. Conecta tu operador o centralita como una extensión SIP: tus números siguen donde están y usas el marcador y el historial de Ringee.',
      'Ringee se registra en tu centralita como una extensión con los ajustes SIP que introduces. Tus representantes llaman desde el navegador a través de tu operador y la centralita presenta tu identificador habitual. Las llamadas a tus números pueden entrar en Ringee y dirigirse a un compañero, grupo de llamada, extensión o teléfono de escritorio.'
    ],
    video: 'trae-tu-operador',
    whoFor: [
      'Empresas con números y contratos que no pueden trasladar',
      'Equipos que ya usan una centralita y quieren un mejor marcador',
      'Empresas cuyo operador ofrece mejores tarifas que cualquier revendedor',
      'Agencias que llaman mediante los operadores de sus clientes'
    ],
    benefits: [
      'Sin portabilidad: tus números nunca salen de tu operador',
      'Conserva contrato, tarifas e identificador de llamada',
      'Disponible al registrarse la extensión, sin esperar una portabilidad',
      'Tus llamadas se guardan en el mismo historial de Ringee que las demás',
      'Desconecta la extensión cuando quieras; nada se ha trasladado'
    ],
    capabilitiesTitle: 'Qué obtienes al conectar tu operador',
    capabilities: [
      {
        title: 'Llamadas salientes con tu operador',
        description:
          'Los representantes marcan desde el navegador de Ringee. La llamada sale por tu centralita, que presenta el identificador configurado para la extensión.'
      },
      {
        title: 'Enrutamiento de llamadas entrantes en Ringee',
        description:
          'Dirige las llamadas a tus números a un compañero, grupo de llamada, extensión interna o teléfono de escritorio registrado en Ringee.'
      },
      {
        title: 'Una ruta para cada número',
        description:
          'Asocia los números que gestiona tu centralita a la extensión que los conecta y asigna a cada uno su propia ruta entrante.'
      },
      {
        title: 'Estado del registro',
        description:
          'Ringee muestra si la extensión está registrada en tu centralita. Una contraseña o servidor incorrectos se detectan antes de intentar llamar.'
      },
      {
        title: 'Gestión de credenciales',
        description:
          'Solo introduces los ajustes de tu operador. Ringee cifra la contraseña SIP y configura el resto en su lado.'
      },
      {
        title: 'Solo Ringee puede llamar a través de tu centralita',
        description:
          'Cada llamada saliente a tu operador debe llevar un token de corta duración firmado por Ringee para impedir que otros usen tu troncal SIP (SIP trunk).'
      }
    ],
    howItWorksTitle: 'Conecta tu operador en tres pasos',
    howItWorks: [
      {
        title: 'Crea la extensión',
        description:
          'En tu centralita o portal del operador, crea una extensión SIP para Ringee con usuario, contraseña y servidor.'
      },
      {
        title: 'Añádela en Ringee',
        description:
          'Añade los ajustes del operador en tu organización, asocia los números que gestiona esa extensión y comprueba el registro.'
      },
      {
        title: 'Llama y configura las rutas',
        description:
          'Los representantes llaman desde el marcador del navegador. Tú eliges dónde suena en Ringee cada número entrante.'
      }
    ],
    sections: [
      {
        kind: 'table',
        id: 'byoc-vs-porting',
        title: '¿Conectar tu operador o portar tus números?',
        description:
          'Ambas opciones permiten usar tus números en Ringee. Cambia quién los conserva y qué ocurre el primer día.',
        columns: ['', 'Conecta tu operador (BYOC)', 'Portar tus números'],
        rows: [
          [
            'Dónde están los números',
            'Se quedan con tu operador actual',
            'Se trasladan al nuevo proveedor'
          ],
          [
            'Contrato y tarifas',
            'Conservas el contrato y las tarifas de tu operador',
            'Se sustituyen por los del nuevo proveedor'
          ],
          [
            'Tiempo para empezar',
            'En cuanto se registra la extensión SIP',
            'De días a semanas, según los operadores'
          ],
          [
            'Volver atrás',
            'Desconectar la extensión',
            'Volver a portar los números'
          ],
          [
            'Identificador de llamada',
            'El que ya presenta tu centralita',
            'El número portado'
          ]
        ]
      }
    ],
    pricing: {
      title: 'Cuánto cuesta conectar tu operador',
      body: [
        `BYOC forma parte del plan Organization: $${PRICING.organization.price}/mes para toda la organización, con usuarios ilimitados.`,
        'Tu operador sigue facturando los minutos telefónicos según tu contrato actual. Ringee factura su propio uso por llamada con el crédito del espacio de trabajo, como en las demás llamadas.'
      ]
    },
    related: [
      {
        name: 'Marcador de ventas',
        href: '/sales-dialer',
        tagline: 'Marcación progresiva y preview en el navegador y las apps.'
      },
      {
        name: 'Números virtuales por país',
        href: '/phone-numbers',
        tagline: `También puedes comprar números locales, gratuitos y móviles en ${PHONE_NUMBER_COUNTRIES.length} países.`
      },
      {
        name: 'Identificador de llamada personalizado',
        href: '/features/caller-id',
        tagline: 'Verifica un número propio y llama desde él.'
      },
      {
        name: 'Alojamiento propio',
        href: '/self-hosted',
        tagline: 'Ejecuta toda la plataforma en tu infraestructura.'
      },
      {
        name: 'Seguridad',
        href: '/security',
        tagline:
          'Cifrado, aislamiento de espacios de trabajo y controles de acceso.'
      },
      {
        name: 'Código abierto',
        href: '/open-source',
        tagline:
          'Licencia MIT: revisa cada línea de código que gestiona tus llamadas.'
      }
    ],
    cta: {
      title: 'Conserva tu operador. Mejora tus llamadas.',
      description:
        'Conecta tu centralita como una extensión SIP y ofrece a tu equipo el marcador de Ringee sin portar ningún número.'
    },
    faqs: [
      {
        question: '¿Qué significa BYOC o conectar tu propio operador?',
        answer:
          'BYOC significa conservar tu operador telefónico y tus números y conectarlos a una nueva plataforma de llamadas, sin portarlos. En Ringee conectas tu operador o centralita como una extensión SIP.'
      },
      {
        question: '¿Tengo que portar mis números a Ringee?',
        answer:
          'No. Con BYOC tus números se quedan con tu operador. También puedes comprar números nuevos en Ringee o verificar un número propio como identificador de llamada, según lo que necesites para cada número.'
      },
      {
        question: '¿Qué operadores y centralitas son compatibles?',
        answer:
          'Cualquier operador o centralita que permita crear una extensión SIP que se registre con usuario y contraseña. Ringee se registra como lo haría un teléfono de escritorio.'
      },
      {
        question: '¿Qué identificador de llamada ve la persona?',
        answer:
          'El que presenta tu centralita para esa extensión. Ringee no añade su propia identidad a las llamadas que salen por tu operador.'
      },
      {
        question: '¿Qué plan necesito?',
        answer: `BYOC está disponible para organizaciones con el plan Organization: $${PRICING.organization.price}/mes con usuarios ilimitados.`
      }
    ]
  }
];

export function getEsSolution(slug: string): SolutionContent | undefined {
  const solution = ES_SOLUTIONS.find((page) => page.slug === slug);
  return solution
    ? {
        ...solution,
        related: solution.related.map((link) => ({
          ...link,
          href: localizedHref(link.href, 'es')
        }))
      }
    : undefined;
}
export function requireEsSolution(slug: string): SolutionContent {
  const solution = getEsSolution(slug);
  if (!solution) throw new Error(`Unknown Spanish solution: ${slug}`);
  return solution;
}
