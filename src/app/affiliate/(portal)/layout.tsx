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
    <div className="min-h-screen bg-gray-50 flex">
      <AffiliateSidebar affiliateName={affiliate.name} />
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 pb-24 lg:pb-8">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
