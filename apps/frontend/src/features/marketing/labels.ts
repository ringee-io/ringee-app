import type { MarketingLocale } from './locale';

const en = {
  home: 'Home',
  related: 'Related',
  plans: 'See plans',
  rates: 'Rates by country',
  faq: 'Frequently asked questions',
  whoFor: 'Who it’s for',
  benefits: 'Benefits',
  primaryLabel: 'Request demo',
  secondaryLabel: 'View pricing',
  ctaTitle: 'Start calling more leads today',
  alternatives: 'Alternatives',
  comparison: 'Comparison',
  shortAnswer: 'The short answer',
  glance: (name: string) => `Ringee vs ${name} at a glance`,
  disclaimer: (name: string) =>
    `A check marks the side a row favors. Comparison reflects each product's general positioning. Vendor features and pricing change — verify ${name}'s current details on its own website.`,
  teamCost: 'What your team would pay',
  teamCostDescription: (name: string) =>
    `${name} is priced per user. Enter the per-user price you pay or were quoted to compare it with Ringee’s flat team plan.`,
  whyRingee: 'Why teams choose Ringee',
  whenCompetitor: (name: string) => `When ${name} may fit better`,
  seeAlternatives: (name: string) => `See the best ${name} alternatives`,
  switching: (name: string) => `Switching from ${name}`,
  explore: 'Explore Ringee',
  pricing: 'Pricing',
  pricingTagline: 'Free for one person, one flat price for the whole team.',
  numbers: 'Phone numbers by country',
  numbersTagline: 'Prices and requirements for numbers in every country.',
  beyond: (name: string) => `Why teams look beyond ${name}`,
  howCompared: 'How we compared them',
  alternativesGlance: (name: string) => `${name} alternatives at a glance`,
  alternativesName: (name: string) => `${name} alternatives`,
  tool: 'Tool',
  bestFor: 'Best for',
  pricingModel: 'Pricing model',
  strengths: 'Strengths',
  watchOut: 'Watch out for',
  sideBySide: (name: string) => `Ringee vs ${name}, side by side`,
  alternativesDisclaimer:
    'We make Ringee, so it is listed first. Descriptions of other tools reflect their general positioning; features and pricing change, so check each vendor’s current details on its own website.'
};

const es: typeof en = {
  home: 'Inicio',
  related: 'Contenido relacionado',
  plans: 'Ver planes',
  rates: 'Tarifas por país',
  faq: 'Preguntas frecuentes',
  whoFor: 'Para quién es',
  benefits: 'Ventajas',
  primaryLabel: 'Solicitar demo',
  secondaryLabel: 'Ver precios',
  ctaTitle: 'Empieza a llamar a más prospectos hoy',
  alternatives: 'Alternativas',
  comparison: 'Comparativa',
  shortAnswer: 'La respuesta breve',
  glance: (name) => `Ringee vs ${name} de un vistazo`,
  disclaimer: (name) =>
    `La marca indica qué opción favorece cada fila. La comparativa refleja el enfoque general de cada producto. Las funciones y precios cambian: verifica los datos actuales de ${name} en su propia web.`,
  teamCost: 'Cuánto pagaría tu equipo',
  teamCostDescription: (name) =>
    `${name} cobra por usuario. Introduce el precio que pagas o te han ofrecido para compararlo con el plan de equipo de precio fijo de Ringee.`,
  whyRingee: 'Por qué los equipos eligen Ringee',
  whenCompetitor: (name) => `Cuándo puede encajar mejor ${name}`,
  seeAlternatives: (name) => `Ver las mejores alternativas a ${name}`,
  switching: (name) => `Cómo cambiar desde ${name}`,
  explore: 'Explora Ringee',
  pricing: 'Precios',
  pricingTagline:
    'Gratis para una persona, un precio fijo para todo el equipo.',
  numbers: 'Números virtuales por país',
  numbersTagline: 'Precios y requisitos de números en cada país.',
  beyond: (name) => `Por qué los equipos buscan alternativas a ${name}`,
  howCompared: 'Cómo las hemos comparado',
  alternativesGlance: (name) => `Alternativas a ${name} de un vistazo`,
  alternativesName: (name) => `Alternativas a ${name}`,
  tool: 'Herramienta',
  bestFor: 'Ideal para',
  pricingModel: 'Modelo de precios',
  strengths: 'Puntos fuertes',
  watchOut: 'Qué revisar',
  sideBySide: (name) => `Ringee vs ${name}, cara a cara`,
  alternativesDisclaimer:
    'Somos los creadores de Ringee y lo presentamos primero. Las descripciones de otras herramientas reflejan su enfoque general. Las funciones y precios cambian: verifica los datos actuales de cada proveedor en su propia web.'
};

export function marketingLabels(locale: MarketingLocale) {
  return locale === 'es' ? es : en;
}
