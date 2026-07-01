export const dynamic = 'force-dynamic'

import PortalLayout from '@/components/layout/PortalLayout'
import { cookies } from 'next/headers'
import { getProgramShortLabel } from '@/lib/utils'
import OpportunitiesClient from './OpportunitiesClient'
import UnderwritingGateBanner from '@/components/dashboard/UnderwritingGateBanner'
import type { AccountOpportunity } from '@/types'
import { requirePortalPageContext } from '@/lib/business-context'
import { normalizeLocale } from '@/lib/i18n'

export default async function OpportunitiesPage() {
  const { supabase, authUser: user, activeBusinessId, activeProfile: profile, notificationCount, activePrograms } = await requirePortalPageContext('/opportunities')
  const locale = normalizeLocale((await cookies()).get('sl_locale')?.value)
  const text = (en: string, es: string) => (locale === 'es' ? es : en)

  const uwNextDue = profile?.underwriting_next_due_at
  const needsUnderwriting =
    !profile?.is_demo &&
    profile?.member_status === 'active_member' &&
    (profile?.assigned_program === 'program_a' || profile?.assigned_program === 'program_b') &&
    (!uwNextDue || new Date(uwNextDue) < new Date())

  if (needsUnderwriting) {
    return (
      <PortalLayout
        userName={profile?.full_name || user.email || 'Client'}
        programLabel={getProgramShortLabel(profile?.assigned_program)}
        notificationCount={notificationCount}
        assignedProgram={profile?.assigned_program}
        allPrograms={activePrograms}
      >
        <div className="mb-6">
          <h1 className="page-title">{text('Funding Opportunities', 'Oportunidades de financiamiento')}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {(profile?.underwriting_review_count ?? 0) > 0
              ? text('Your monthly review is due - complete it to continue accessing opportunities.', 'Tu revision mensual esta pendiente; completala para seguir accediendo a oportunidades.')
              : text('Complete your underwriting review to unlock opportunities.', 'Completa tu revision de underwriting para desbloquear oportunidades.')}
          </p>
        </div>
        <UnderwritingGateBanner
          program={profile?.assigned_program ?? 'program_b'}
          reviewCount={profile?.underwriting_review_count ?? 0}
          nextDueAt={uwNextDue ?? null}
        />
      </PortalLayout>
    )
  }

  const [{ data: opportunities }, { data: rawStatuses }] = await Promise.all([
    supabase
      .from('account_opportunities')
      .select('*')
      .in('program', [profile?.assigned_program ?? 'program_a', 'all'])
      .eq('is_active', true)
      .order('priority_score', { ascending: false }),
    supabase
      .from('opportunity_user_status')
      .select('opportunity_id, status')
      .eq('user_id', activeBusinessId),
  ])

  const userStatuses: Record<string, string> = Object.fromEntries(
    (rawStatuses ?? []).map((status) => [status.opportunity_id, status.status])
  )

  const isActive =
    profile?.billing_status === 'active' ||
    profile?.billing_status === 'trialing'

  return (
    <PortalLayout
      userName={profile?.full_name || user.email || 'Client'}
      programLabel={getProgramShortLabel(profile?.assigned_program)}
      notificationCount={notificationCount}
      assignedProgram={profile?.assigned_program}
      allPrograms={activePrograms}
    >
      <div className="mb-6">
        <h1 className="page-title">{text('Funding Opportunities', 'Oportunidades de financiamiento')}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          {text('Curated accounts and credit opportunities for your program.', 'Cuentas y oportunidades de credito seleccionadas para tu programa.')}
        </p>
      </div>

      {!isActive && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 mb-6 text-sm text-amber-800 dark:text-amber-300">
          <strong>{text('Membership inactive.', 'Membresia inactiva.')}</strong>{' '}
          {text('Reactivate to unlock full opportunity details and application guidance.', 'Reactiva para desbloquear todos los detalles y la guia de solicitud.')}
        </div>
      )}

      <OpportunitiesClient
        opportunities={(opportunities ?? []) as AccountOpportunity[]}
        currentStage={profile?.current_stage ?? null}
        assignedProgram={profile?.assigned_program ?? null}
        isActive={isActive}
        userIndustry={profile?.industry ?? null}
        userStatuses={userStatuses}
      />

      <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-5 text-xs text-gray-400 dark:text-gray-500 leading-relaxed space-y-2">
        <p>
          <strong className="text-gray-500 dark:text-gray-400">{text('Personalization Notice:', 'Aviso de personalizacion:')}</strong>{' '}
          {text(
            'All recommendations shown on this page are based on the information you provided during your profile analysis and underwriting review. SourcifyLending logs your underwriting timestamp and the data used to generate these recommendations to ensure accuracy and accountability.',
            'Todas las recomendaciones que se muestran en esta pagina se basan en la informacion que proporcionaste durante el analisis de tu perfil y la revision de underwriting. SourcifyLending registra la fecha de tu revision y los datos utilizados para generar estas recomendaciones para garantizar precision y trazabilidad.'
          )}
        </p>
        <p>
          <strong className="text-gray-500 dark:text-gray-400">{text('Disclaimer:', 'Descargo de responsabilidad:')}</strong>{' '}
          {text(
            'The funding accounts and credit opportunities listed above are provided for informational and educational purposes only. SourcifyLending does not guarantee approval, specific credit limits, or outcomes from any lender or creditor. Approval decisions are made solely by the respective issuer based on your creditworthiness and their criteria. These listings represent common opportunities used in credit-building programs and are subject to change without notice. Nothing on this page constitutes financial advice, credit repair services, or a promise of results.',
            'Las cuentas de financiamiento y oportunidades de credito listadas arriba se proporcionan solo con fines informativos y educativos. SourcifyLending no garantiza aprobaciones, limites de credito especificos ni resultados de ningun prestamista o acreedor. Las decisiones de aprobacion son tomadas unicamente por el emisor correspondiente segun tu perfil crediticio y sus criterios. Estos listados representan oportunidades comunes utilizadas en programas de construccion de credito y pueden cambiar sin previo aviso. Nada en esta pagina constituye asesoria financiera, servicios de reparacion de credito ni una promesa de resultados.'
          )}
        </p>
      </div>
    </PortalLayout>
  )
}
