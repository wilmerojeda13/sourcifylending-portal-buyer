'use client'

import { useEffect, useRef } from 'react'
import { useNavigationState } from '@/contexts/NavigationContext'

interface ScrollPositionOptions {
  threshold?: number
  debounceMs?: number
}

export function useScrollPosition(pageKey: string, options: ScrollPositionOptions = {}) {
  const { saveScrollPosition, getScrollPosition } = useNavigationState()
  const { threshold = 100, debounceMs = 100 } = options
  const scrollContainerRef = useRef<HTMLElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  // Save scroll position with debouncing
  const savePosition = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(() => {
      if (scrollContainerRef.current) {
        const scrollTop = scrollContainerRef.current.scrollTop
        if (scrollTop > threshold) {
          saveScrollPosition(pageKey, scrollTop)
        }
      }
    }, debounceMs)
  }

  // Restore scroll position when component mounts
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const savedPosition = getScrollPosition(pageKey)
    if (savedPosition > threshold) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        container.scrollTop = savedPosition
      })
    }

    // Add scroll listener
    container.addEventListener('scroll', savePosition, { passive: true })

    return () => {
      container.removeEventListener('scroll', savePosition)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [pageKey, threshold, saveScrollPosition, getScrollPosition])

  return scrollContainerRef
}

// Hook for window scroll position
export function useWindowScrollPosition(pageKey: string, options: ScrollPositionOptions = {}) {
  const { saveScrollPosition, getScrollPosition } = useNavigationState()
  const { threshold = 100, debounceMs = 100 } = options
  const timeoutRef = useRef<NodeJS.Timeout>()

  // Save scroll position with debouncing
  const savePosition = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(() => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      if (scrollTop > threshold) {
        saveScrollPosition(pageKey, scrollTop)
      }
    }, debounceMs)
  }

  // Restore scroll position when component mounts
  useEffect(() => {
    const savedPosition = getScrollPosition(pageKey)
    if (savedPosition > threshold) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition)
      })
    }

    // Add scroll listener
    window.addEventListener('scroll', savePosition, { passive: true })

    return () => {
      window.removeEventListener('scroll', savePosition)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [pageKey, threshold, saveScrollPosition, getScrollPosition])
}
