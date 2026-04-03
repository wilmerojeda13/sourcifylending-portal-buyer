import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { ContentPageRecord, ContentSection } from '@/lib/content-engine-types'
import ContentAttributionTracker from './ContentAttributionTracker'
import TrackedContentLink from './TrackedContentLink'

function renderParagraphs(text: string) {
  return text.split('\n\n').filter(Boolean).map((paragraph) => (
    <p key={paragraph.slice(0, 32)} className="text-gray-600 leading-7">
      {paragraph}
    </p>
  ))
}

function renderSection(section: ContentSection) {
  return (
    <section key={section.heading} className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">{section.heading}</h2>
      <div className="space-y-4">
        {renderParagraphs(section.body)}
      </div>
      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-2">
          {section.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2 text-gray-600">
              <CheckCircle2 size={16} className="mt-1 shrink-0 text-green-600" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
      {section.table && (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {section.table.headers.map((header) => (
                  <th key={header} className="px-4 py-3 text-left font-semibold text-gray-700">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {section.table.rows.map((row, index) => (
                <tr key={`${section.heading}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${section.heading}-${index}-${cellIndex}`} className="px-4 py-3 text-gray-600">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function PublicContentPage({ page }: { page: ContentPageRecord }) {
  const sections = page.body_sections ?? []
  const faqs = page.faq_items ?? []
  const links = page.internal_links ?? []
  const ctas = page.cta_blocks ?? []
  const trustPoints = page.trust_points ?? []
  const contentPageParam = `content_page=${encodeURIComponent(page.id)}`
  const relatedLinksTitle = page.route_group.startsWith('partner-') || page.route_group === 'partners'
    ? 'Related partner pages'
    : 'Related answers'

  return (
    <div className="min-h-screen bg-white">
      <ContentAttributionTracker pageId={page.id} path={page.canonical_path} />

      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="font-semibold text-gray-900">SourcifyLending</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
              <Link href="/get-started" className="brand-link">Get Started</Link>
              <Link href="/privacy" className="brand-link">Privacy</Link>
              <Link href="/terms" className="brand-link">Terms</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="space-y-10">
            <div className="space-y-5">
              <div className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-700">
                {page.route_group.replace(/-/g, ' ')}
              </div>
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">{page.h1}</h1>
              <p className="max-w-3xl text-lg leading-8 text-gray-600">{page.hero_summary}</p>
              <div className="rounded-3xl border border-green-200 bg-green-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-green-700">Short answer</p>
                <p className="mt-2 text-base leading-7 text-green-950">{page.intro_text}</p>
              </div>
            </div>

            {sections.map(renderSection)}

            {faqs.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-2xl font-semibold text-gray-900">Frequently asked questions</h2>
                <div className="space-y-3">
                  {faqs.map((faq) => (
                    <div key={faq.question} className="rounded-2xl border border-gray-200 bg-white p-5">
                      <h3 className="font-semibold text-gray-900">{faq.question}</h3>
                      <p className="mt-2 text-gray-600 leading-7">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </article>

          <aside className="space-y-6">
            {ctas.map((cta) => (
              <div key={cta.title} className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
                <h2 className="text-xl font-semibold text-gray-900">{cta.title}</h2>
                <p className="mt-3 text-sm leading-7 text-gray-600">{cta.body}</p>
                <div className="mt-5 flex flex-col gap-3">
                  <TrackedContentLink
                    href={`${cta.primaryHref}${cta.primaryHref.includes('?') ? '&' : '?'}${contentPageParam}`}
                    pageId={page.id}
                    destinationPath={cta.primaryHref}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white"
                  >
                    {cta.primaryLabel}
                    <ArrowRight size={16} />
                  </TrackedContentLink>
                  {cta.secondaryHref && cta.secondaryLabel && (
                    <TrackedContentLink
                      href={`${cta.secondaryHref}${cta.secondaryHref.includes('?') ? '&' : '?'}${contentPageParam}`}
                      pageId={page.id}
                      destinationPath={cta.secondaryHref}
                      className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700"
                    >
                      {cta.secondaryLabel}
                    </TrackedContentLink>
                  )}
                </div>
              </div>
            ))}

            {trustPoints.length > 0 && (
              <div className="rounded-3xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900">Why this page is useful</h2>
                <ul className="mt-4 space-y-3">
                  {trustPoints.map((point) => (
                    <li key={point} className="flex gap-2 text-sm text-gray-600">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {links.length > 0 && (
              <div className="rounded-3xl border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900">{relatedLinksTitle}</h2>
                <div className="mt-4 space-y-3">
                  {links.map((link) => (
                    <Link key={`${link.href}-${link.label}`} href={link.href} className="block text-sm text-green-700 hover:text-green-800">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(page.schema_json || {}) }}
      />
    </div>
  )
}
