export type Locale = 'en' | 'es'

export const LOCALE_COOKIE = 'sl_locale'
export const DEFAULT_LOCALE: Locale = 'en'

export function normalizeLocale(value?: string | null): Locale {
  return value?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

const SPANISH_ROUTE_ALIASES: Record<string, string> = {
  '/partners': '/socios',
  '/pricing': '/precios',
  '/sign-in': '/ingresar',
  '/login': '/ingresar',
  '/analyzer': '/analizador-gratis',
}

const ENGLISH_ROUTE_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(SPANISH_ROUTE_ALIASES).map(([en, es]) => [es, en])
)

export function localizePathname(pathname: string, locale: Locale) {
  if (locale === 'es') {
    return SPANISH_ROUTE_ALIASES[pathname] ?? pathname
  }

  return ENGLISH_ROUTE_ALIASES[pathname] ?? pathname
}

export function localizeHref(path: string, locale: Locale) {
  const [beforeHash, hash = ''] = path.split('#')
  const [pathname, existingQuery = ''] = beforeHash.split('?')
  const query = new URLSearchParams(existingQuery)
  const localizedPath = locale === 'es' ? SPANISH_ROUTE_ALIASES[pathname] ?? pathname : pathname
  query.set('sl_locale', locale)
  const queryString = query.toString()
  return `${localizedPath}${queryString ? `?${queryString}` : ''}${hash ? `#${hash}` : ''}`
}

export function portalSignInHref(locale: Locale) {
  return localizeHref('/sign-in?next=%2Fportal', locale)
}

export function normalizeLocalizedPathname(pathname: string) {
  return ENGLISH_ROUTE_ALIASES[pathname] ?? pathname
}

type Dict = Record<string, string>

const EN: Dict = {
  'nav.partners': 'Partners',
  'nav.pricing': 'Pricing',
  'nav.signIn': 'Sign In',
  'nav.freeAnalyzer': 'Free Analyzer',
  'nav.clientLogin': 'Client Login',
  'nav.partnerLogin': 'Partner Login',
  'nav.becomePartner': 'Become a Partner',

  'home.badge': 'AI-Powered Credit Fulfillment Platform',
  'home.titleLine1': 'Build Business Credit',
  'home.titleLine2': 'With AI Guiding Every Step',
  'home.subtitle': "SourcifyLending's AI fulfillment agent manages your entire credit-building journey - from initial analysis to tradeline reporting, card acquisition, and funding readiness.",
  'home.primaryCta': 'Free Analyzer',
  'home.secondaryCta': 'Sign Into Portal',
  'home.section1': 'Everything You Need to Build Business Credit',
  'home.feature1Title': 'AI Fulfillment Agent',
  'home.feature1Desc': 'Your personal AI guides you through every stage, answers questions, reviews uploads, and keeps you on track.',
  'home.feature2Title': 'Structured Task Manager',
  'home.feature2Desc': 'Step-by-step roadmap with tracked tasks, due dates, and stage progression - like Asana for credit building.',
  'home.feature3Title': 'Reports & Deliverables',
  'home.feature3Desc': 'AI-generated credit readiness summaries, tradeline reports, and monthly monitoring delivered inside your portal.',
  'home.programsTitle': 'Three Specialized Programs',
  'home.programsSubtitle': 'The analyzer assigns you to the right program based on your profile.',
  'home.partnerTitle': 'Close, onboard, and manage clients.',
  'home.partnerSubtitle': 'Use SourcifyLending as the platform.',
  'home.partnerBody': 'This is a partner-assisted model, not a passive referral program. Partners bring in the client, close the client, onboard the client, and stay the frontline relationship owner while SourcifyLending powers the infrastructure behind the scenes.',
  'home.ctaTitle': 'Find Out Where You Stand - Free',
  'home.ctaSubtitle': 'Complete the 12-question analyzer and get your program recommendation in under 3 minutes.',
  'home.footerDisclaimer': 'Results are not guaranteed. This platform does not promise approvals, specific credit limits, or funding outcomes.',

  'portal.dashboard': 'Dashboard',
  'portal.aiAgent': 'AI Agent',
  'portal.documents': 'Documents',
  'portal.progress': 'Progress',
  'portal.reports': 'Reports',
  'portal.billing': 'Billing',
  'portal.inquiryDisputes': 'Inquiry Disputes',
  'portal.fundingResults': 'Funding Results',
  'portal.trainingVideos': 'Training Videos',
  'portal.upgrade': 'Upgrade',
  'portal.support': 'Support',
  'portal.notifications': 'Notifications',
  'portal.settings': 'Settings',
  'portal.signOut': 'Sign Out',
  'portal.adminPanel': 'Admin Panel',
  'portal.creditOptimization': 'Credit Optimization',
  'portal.bizCreditSetup': 'Biz Credit Setup',
  'portal.bizCreditMonitoring': 'Biz Credit Monitoring',
  'portal.bizResources': 'Biz Resources',
  'portal.underwriteBiz': 'Underwrite Your Biz',
  'portal.opportunities': 'Opportunities',
  'portal.roiTracker': 'ROI Tracker',
  'portal.creditDisputes': 'Credit Disputes',
  'portal.switchProgram': 'Switch Program',
  'portal.freePlan': 'Free Plan',
  'portal.freeProspect': 'Free Prospect Account',
  'portal.clientAccount': 'Client Account',
  'portal.subscriptionRequired': 'Subscription Required',
  'portal.subscriptionBody': 'This business needs its own subscription before you can access the portal. Each business is billed separately under the current plan structure.',
  'portal.choosePlan': 'Choose a Plan',
  'portal.backDashboard': 'Back to Dashboard',
  'portal.adminLabel': 'Admin',
  'portal.mobileMenu': 'Menu',
  'portal.themeLight': 'Light Mode',
  'portal.themeDark': 'Dark Mode',
  'portal.language': 'ES',
  'portal.languageTitle': 'Switch to Spanish',
}

const ES: Dict = {
  'nav.partners': 'Socios',
  'nav.pricing': 'Precios',
  'nav.signIn': 'Ingresar',
  'nav.freeAnalyzer': 'Analizador Gratis',
  'nav.clientLogin': 'Acceso Cliente',
  'nav.partnerLogin': 'Acceso Socios',
  'nav.becomePartner': 'Hazte Socio',

  'home.badge': 'Plataforma de cumplimiento de crédito con IA',
  'home.titleLine1': 'Construye crédito comercial',
  'home.titleLine2': 'con IA guiando cada paso',
  'home.subtitle': 'El agente de cumplimiento con IA de SourcifyLending maneja todo tu proceso de construcción de crédito: desde el análisis inicial hasta los reportes, adquisición de tarjetas y preparación para financiamiento.',
  'home.primaryCta': 'Analizador Gratis',
  'home.secondaryCta': 'Entrar al Portal',
  'home.section1': 'Todo lo que necesitas para construir crédito comercial',
  'home.feature1Title': 'Agente de Cumplimiento con IA',
  'home.feature1Desc': 'Tu IA personal te guía en cada etapa, responde preguntas, revisa documentos y te mantiene enfocado.',
  'home.feature2Title': 'Gestor de Tareas Estructurado',
  'home.feature2Desc': 'Ruta paso a paso con tareas, fechas límite y progreso por etapa, como Asana para construir crédito.',
  'home.feature3Title': 'Reportes y Entregables',
  'home.feature3Desc': 'Resúmenes de preparación crediticia, reportes de tradelines y monitoreo mensual dentro del portal.',
  'home.programsTitle': 'Tres Programas Especializados',
  'home.programsSubtitle': 'El analizador te asigna al programa correcto según tu perfil.',
  'home.partnerTitle': 'Cierra, incorpora y administra clientes.',
  'home.partnerSubtitle': 'Usa SourcifyLending como la plataforma.',
  'home.partnerBody': 'Este es un modelo asistido por socios, no un programa pasivo de referidos. Los socios atraen al cliente, cierran, incorporan y mantienen la relación principal mientras SourcifyLending impulsa la infraestructura detrás de escena.',
  'home.ctaTitle': 'Descubre dónde estás - Gratis',
  'home.ctaSubtitle': 'Completa el analizador de 12 preguntas y recibe tu recomendación en menos de 3 minutos.',
  'home.footerDisclaimer': 'Los resultados no están garantizados. Esta plataforma no promete aprobaciones, límites de crédito específicos ni resultados de financiamiento.',

  'portal.dashboard': 'Inicio',
  'portal.aiAgent': 'Agente IA',
  'portal.documents': 'Documentos',
  'portal.progress': 'Progreso',
  'portal.reports': 'Reportes',
  'portal.billing': 'Facturación',
  'portal.inquiryDisputes': 'Disputas de consultas',
  'portal.fundingResults': 'Resultados de financiamiento',
  'portal.trainingVideos': 'Videos de entrenamiento',
  'portal.upgrade': 'Actualizar',
  'portal.support': 'Soporte',
  'portal.notifications': 'Notificaciones',
  'portal.settings': 'Configuración',
  'portal.signOut': 'Salir',
  'portal.adminPanel': 'Panel Admin',
  'portal.creditOptimization': 'Optimización de crédito',
  'portal.bizCreditSetup': 'Configuración de crédito empresarial',
  'portal.bizCreditMonitoring': 'Monitoreo de crédito empresarial',
  'portal.bizResources': 'Recursos empresariales',
  'portal.underwriteBiz': 'Revisar tu negocio',
  'portal.opportunities': 'Oportunidades',
  'portal.roiTracker': 'Seguimiento ROI',
  'portal.creditDisputes': 'Disputas de crédito',
  'portal.switchProgram': 'Cambiar programa',
  'portal.freePlan': 'Plan Gratis',
  'portal.freeProspect': 'Cuenta Prospecto Gratis',
  'portal.clientAccount': 'Cuenta Cliente',
  'portal.subscriptionRequired': 'Se requiere suscripción',
  'portal.subscriptionBody': 'Este negocio necesita su propia suscripción antes de acceder al portal. Cada negocio se factura por separado bajo la estructura actual del plan.',
  'portal.choosePlan': 'Elegir Plan',
  'portal.backDashboard': 'Volver al Inicio',
  'portal.adminLabel': 'Admin',
  'portal.mobileMenu': 'Menú',
  'portal.themeLight': 'Modo claro',
  'portal.themeDark': 'Modo oscuro',
  'portal.language': 'EN',
  'portal.languageTitle': 'Cambiar a inglés',
}

export function t(locale: Locale, key: string, fallback = '') {
  const dict = locale === 'es' ? ES : EN
  return dict[key] ?? fallback
}

export const locales = { en: EN, es: ES }
