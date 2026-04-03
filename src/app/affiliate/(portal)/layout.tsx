import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AffiliateSidebar from '@/components/affiliate/AffiliateSidebar'

export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/affiliate/login')

  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, name, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!affiliate || affiliate.status === 'suspended') {
    redirect('/affiliate/login?error=access_denied')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex overflow-x-hidden">
      <AffiliateSidebar affiliateName={affiliate.name} />
      <main className="flex-1 min-w-0 w-full max-w-full lg:ml-64 px-4 pb-28 pt-4 lg:px-8 lg:pb-8 lg:pt-8 overflow-x-hidden">
        <div className="w-full max-w-5xl min-w-0 mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
