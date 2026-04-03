import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="card p-6 sm:p-8">
          <p className="text-sm text-gray-500 mb-3">SourcifyLending</p>
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <div className="mt-8 space-y-6 text-sm leading-7 text-gray-700">
            <section>
              <h2 className="text-base font-semibold text-gray-900">Information we collect</h2>
              <p className="mt-2">
                We collect the information you submit through our forms, including your name, business name, email address, phone number, and any details you provide about your business or financing goals.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-gray-900">How we use information</h2>
              <p className="mt-2">
                We use submitted information to contact you, evaluate your request, provide portal access, deliver service updates, and send conversational text messages when you have given consent.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-gray-900">SMS messaging</h2>
              <p className="mt-2">
                If you opt in, you agree to receive conversational SMS messages from SourcifyLending. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-gray-900">Sharing</h2>
              <p className="mt-2">
                We do not sell your personal information. We may share information with service providers that help us operate the portal, messaging, analytics, and client fulfillment workflows.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-gray-900">Contact</h2>
              <p className="mt-2">
                For privacy questions, contact <a className="text-green-700 underline underline-offset-2" href="mailto:support@sourcifylending.com">support@sourcifylending.com</a>.
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
