import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="card p-6 sm:p-8">
          <p className="text-sm text-gray-500 mb-3">SourcifyLending</p>
          <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
          <div className="mt-8 space-y-6 text-sm leading-7 text-gray-700">
            <section>
              <h2 className="text-base font-semibold text-gray-900">Use of the site</h2>
              <p className="mt-2">
                By using this site and submitting a form, you confirm that the information you provide is accurate and that you are authorized to provide it on behalf of yourself or your business.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-gray-900">No guarantee of results</h2>
              <p className="mt-2">
                SourcifyLending does not guarantee credit approvals, funding approvals, credit limits, or business outcomes. Any recommendations, portal access, or follow-up communications are provided as part of our services and not as a promise of approval.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-gray-900">Communications consent</h2>
              <p className="mt-2">
                If you provide your phone number and opt in, you agree to receive conversational text messages from SourcifyLending. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-gray-900">Contact</h2>
              <p className="mt-2">
                Questions about these terms can be sent to <a className="text-green-700 underline underline-offset-2" href="mailto:support@sourcifylending.com">support@sourcifylending.com</a>.
              </p>
            </section>
          </div>
          <div className="mt-8 text-sm">
            <Link href="/get-started" className="text-green-700 underline underline-offset-2">Back to the public form</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
