'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useNavigationState, buildCRMUrl } from '@/contexts/NavigationContext'
import { usePathname } from 'next/navigation'

interface SmartBackButtonProps {
  fallbackHref?: string
  fallbackLabel?: string
  className?: string
  showLabel?: boolean
  variant?: 'link' | 'button'
  size?: 'sm' | 'md' | 'lg'
}

export function SmartBackButton({ 
  fallbackHref = '/admin', 
  fallbackLabel = 'Back',
  className = '',
  showLabel = true,
  variant = 'link',
  size = 'sm'
}: SmartBackButtonProps) {
  const { state, canGoBack, goBack } = useNavigationState()
  const pathname = usePathname()

  // Determine the appropriate back destination
  const getBackDestination = () => {
    // CRM detail pages - go back to CRM with preserved state
    if (pathname.startsWith('/admin/crm/') && pathname !== '/admin/crm') {
      return {
        href: buildCRMUrl('/admin/crm', state.crm),
        label: 'Leads'
      }
    }

    // Admin portal pages
    if (pathname.startsWith('/admin/') && !pathname.startsWith('/admin/crm')) {
      if (state.admin.currentPage && state.admin.currentPage !== pathname) {
        return {
          href: state.admin.currentPage,
          label: 'Admin'
        }
      }
      return {
        href: '/admin',
        label: 'Admin'
      }
    }

    // Member portal pages
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/documents') || 
        pathname.startsWith('/progress') || pathname.startsWith('/reports') || 
        pathname.startsWith('/billing') || pathname.startsWith('/settings')) {
      if (state.member.currentPage && state.member.currentPage !== pathname) {
        return {
          href: state.member.currentPage,
          label: 'Dashboard'
        }
      }
      return {
        href: '/dashboard',
        label: 'Dashboard'
      }
    }

    // Default fallback
    return {
      href: fallbackHref,
      label: fallbackLabel
    }
  }

  const destination = getBackDestination()

  const baseClasses = {
    link: 'inline-flex items-center gap-1 text-gray-400 hover:text-green-600 font-medium transition-colors',
    button: 'inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-medium transition-colors'
  }

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  const classes = `${baseClasses[variant]} ${sizeClasses[size]} ${className}`

  if (variant === 'button') {
    return (
      <button onClick={goBack} className={classes}>
        <ChevronLeft size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} />
        {showLabel && destination.label}
      </button>
    )
  }

  return (
    <Link href={destination.href} className={classes}>
      <ChevronLeft size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} />
      {showLabel && destination.label}
    </Link>
  )
}

// Specialized back buttons for different contexts
export function CRMBackButton({ className = '', size = 'sm' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <SmartBackButton 
      fallbackHref="/admin/crm" 
      fallbackLabel="Leads"
      className={className}
      size={size}
    />
  )
}

export function AdminBackButton({ className = '', size = 'sm' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <SmartBackButton 
      fallbackHref="/admin" 
      fallbackLabel="Admin"
      className={className}
      size={size}
    />
  )
}

export function MemberBackButton({ className = '', size = 'sm' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <SmartBackButton 
      fallbackHref="/dashboard" 
      fallbackLabel="Dashboard"
      className={className}
      size={size}
    />
  )
}
