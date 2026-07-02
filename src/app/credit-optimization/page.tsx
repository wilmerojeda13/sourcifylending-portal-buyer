export const dynamic = 'force-dynamic'

import PortalLayout from '@/components/layout/PortalLayout'
import { cookies } from 'next/headers'
import { getProgramShortLabel } from '@/lib/utils'
import CreditOptimizationClient from './CreditOptimizationClient'
import { requirePortalPageContext } from '@/lib/business-context'
import { normalizeLocale } from '@/lib/i18n'
import { redirect } from 'next/navigation'

type CreditOptimizationPageProps = {
  searchParams?: Promise<{ sl_locale?: string }>
}

export default async function CreditOptimizationPage({ searchParams }: CreditOptimizationPageProps) {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/credit-optimization')
  const params = searchParams ? await searchParams : undefined
  const locale = normalizeLocale(params?.sl_locale ?? (await cookies()).get('sl_locale')?.value)
  const text = (en: string, es: string) => (locale === 'es' ? es : en)
  const [
    { data: tasks },
  ] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', activeBusinessId).order('sort_order'),
  ])

  // Redirect non-Program-A users
  if (profile?.assigned_program && profile.assigned_program !== 'program_a') {
    redirect('/dashboard')
  }

  const isActive =
    profile?.billing_status === 'active' ||
    profile?.billing_status === 'trialing'

  const nextTask = tasks?.find((t) => t.status === 'pending') ?? null

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      notificationCount={notificationCount}
      assignedProgram={profile?.assigned_program}
      allPrograms={activePrograms}
    >
      <div className="mb-6">
        <h1 className="page-title">{text('Personal Credit Optimization', 'Optimizacion de credito personal')}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {text('Funding readiness guidance for Program A members.', 'Guia de preparacion para financiamiento para miembros del Programa A.')}
        </p>
      </div>

      <CreditOptimizationClient
        profile={{
          credit_score_range: profile?.credit_score_range ?? null,
          utilization_range: profile?.utilization_range ?? null,
          inquiry_range: profile?.inquiry_range ?? null,
          nsf_flag: profile?.nsf_flag ?? false,
          readiness_status: profile?.readiness_status ?? null,
          business_name: profile?.business_name ?? null,
        }}
        nextTask={nextTask}
        isActive={isActive}
      />

      {/* Legal disclaimer */}
      <div className="mt-8 border-t border-gray-200 pt-5 text-xs text-gray-400 leading-relaxed">
        <p>
          <strong className="text-gray-500">{text('Important Notice:', 'Aviso importante:')}</strong>{' '}
          {text(
            'The information on this page is for educational and informational purposes only and constitutes funding readiness guidance, not credit repair services. SourcifyLending does not dispute items on your behalf, does not contact credit bureaus or creditors as your representative, and does not guarantee any improvement to your credit profile. Any dispute letters generated here are educational templates for your personal use. Always review dispute letters carefully before sending. Results vary by individual.',
            'La informacion de esta pagina es solo para fines educativos e informativos y constituye orientacion de preparacion para financiamiento, no servicios de reparacion de credito. SourcifyLending no disputa elementos en tu nombre, no contacta a las agencias de credito ni a los acreedores como tu representante y no garantiza ninguna mejora en tu perfil de credito. Cualquier carta de disputa generada aqui es una plantilla educativa para tu uso personal. Revisa siempre cuidadosamente las cartas de disputa antes de enviarlas. Los resultados varian segun cada persona.'
          )}
        </p>
      </div>
    </PortalLayout>
  )
}
