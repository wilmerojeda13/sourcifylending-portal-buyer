import Link from 'next/link'

type PublicLegalLinksProps = {
  className?: string
}

export default function PublicLegalLinks({ className }: PublicLegalLinksProps) {
  return (
    <p className={className ?? 'text-xs text-gray-500 leading-relaxed'}>
      <Link href="/privacy" className="text-green-700 underline underline-offset-2">
        Privacy Policy
      </Link>
      {' '}and{' '}
      <Link href="/terms" className="text-green-700 underline underline-offset-2">
        Terms & Conditions
      </Link>
    </p>
  )
}
