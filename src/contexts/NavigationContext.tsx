'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

interface NavigationState {
  // CRM specific state
  crm: {
    search: string
    stage: string
    temperature: string
    callability: string
    openTasksOnly: boolean
    view: 'list' | 'board'
    listPage: number
    boardPages: Record<string, number>
    selectedStage?: string
  }
  // Admin portal state
  admin: {
    currentPage: string
    filters: Record<string, string>
    search: string
    page: number
  }
  // Member portal state
  member: {
    currentPage: string
    section: string
    tab: string
    filters: Record<string, string>
  }
  // Common state
  scrollPositions: Record<string, number>
  lastVisitedPage: string
}

interface NavigationContextType {
  state: NavigationState
  saveCRMState: (state: Partial<NavigationState['crm']>) => void
  saveAdminState: (state: Partial<NavigationState['admin']>) => void
  saveMemberState: (state: Partial<NavigationState['member']>) => void
  saveScrollPosition: (page: string, position: number) => void
  getScrollPosition: (page: string) => number
  clearState: () => void
  goBack: () => void
  canGoBack: () => boolean
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined)

const STORAGE_KEY = 'sourcifylending-navigation-state'

function getDefaultState(): NavigationState {
  return {
    crm: {
      search: '',
      stage: '',
      temperature: '',
      callability: '',
      openTasksOnly: false,
      view: 'list',
      listPage: 1,
      boardPages: {},
    },
    admin: {
      currentPage: '',
      filters: {},
      search: '',
      page: 1,
    },
    member: {
      currentPage: '',
      section: '',
      tab: '',
      filters: {},
    },
    scrollPositions: {},
    lastVisitedPage: '',
  }
}

function loadStateFromStorage(): NavigationState {
  if (typeof window === 'undefined') return getDefaultState()
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...getDefaultState(), ...parsed }
    }
  } catch (error) {
    console.warn('Failed to load navigation state from storage:', error)
  }
  
  return getDefaultState()
}

function saveStateToStorage(state: NavigationState) {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('Failed to save navigation state to storage:', error)
  }
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavigationState>(loadStateFromStorage)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Save state to localStorage whenever it changes
  useEffect(() => {
    saveStateToStorage(state)
  }, [state])

  // Update last visited page
  useEffect(() => {
    setState(prev => ({
      ...prev,
      lastVisitedPage: pathname
    }))
  }, [pathname])

  // Sync with URL params for CRM
  useEffect(() => {
    if (pathname.startsWith('/admin/crm') && !pathname.includes('/admin/crm/')) {
      setState(prev => ({
        ...prev,
        crm: {
          ...prev.crm,
          search: searchParams.get('search') ?? '',
          stage: searchParams.get('stage') ?? '',
          temperature: searchParams.get('temperature') ?? '',
          callability: searchParams.get('callability') ?? '',
          openTasksOnly: searchParams.get('open_tasks') === 'true',
          view: searchParams.get('view') === 'board' ? 'board' : 'list',
        }
      }))
    }
  }, [pathname, searchParams])

  const saveCRMState = (crmState: Partial<NavigationState['crm']>) => {
    setState(prev => ({
      ...prev,
      crm: { ...prev.crm, ...crmState }
    }))
  }

  const saveAdminState = (adminState: Partial<NavigationState['admin']>) => {
    setState(prev => ({
      ...prev,
      admin: { ...prev.admin, ...adminState }
    }))
  }

  const saveMemberState = (memberState: Partial<NavigationState['member']>) => {
    setState(prev => ({
      ...prev,
      member: { ...prev.member, ...memberState }
    }))
  }

  const saveScrollPosition = (page: string, position: number) => {
    setState(prev => ({
      ...prev,
      scrollPositions: {
        ...prev.scrollPositions,
        [page]: position
      }
    }))
  }

  const getScrollPosition = (page: string): number => {
    return state.scrollPositions[page] || 0
  }

  const clearState = () => {
    setState(getDefaultState())
  }

  const goBack = () => {
    // Try to navigate back to the last visited page with preserved state
    if (state.lastVisitedPage && state.lastVisitedPage !== pathname) {
      router.push(state.lastVisitedPage)
    } else {
      // Fallback to browser back
      router.back()
    }
  }

  const canGoBack = (): boolean => {
    return !!state.lastVisitedPage && state.lastVisitedPage !== pathname
  }

  const value: NavigationContextType = {
    state,
    saveCRMState,
    saveAdminState,
    saveMemberState,
    saveScrollPosition,
    getScrollPosition,
    clearState,
    goBack,
    canGoBack,
  }

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigationState() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigationState must be used within a NavigationProvider')
  }
  return context
}

// Helper hooks for specific areas
export function useCRMNavigationState() {
  const { state, saveCRMState, saveScrollPosition, getScrollPosition } = useNavigationState()
  
  return {
    crmState: state.crm,
    saveCRMState,
    saveScrollPosition,
    getScrollPosition,
  }
}

export function useAdminNavigationState() {
  const { state, saveAdminState, saveScrollPosition, getScrollPosition } = useNavigationState()
  
  return {
    adminState: state.admin,
    saveAdminState,
    saveScrollPosition,
    getScrollPosition,
  }
}

export function useMemberNavigationState() {
  const { state, saveMemberState, saveScrollPosition, getScrollPosition } = useNavigationState()
  
  return {
    memberState: state.member,
    saveMemberState,
    saveScrollPosition,
    getScrollPosition,
  }
}

// Utility function to build URL with preserved state
export function buildCRMUrl(baseUrl: string, crmState: NavigationState['crm']): string {
  const params = new URLSearchParams()
  
  if (crmState.search) params.set('search', crmState.search)
  if (crmState.stage) params.set('stage', crmState.stage)
  if (crmState.temperature) params.set('temperature', crmState.temperature)
  if (crmState.callability) params.set('callability', crmState.callability)
  if (crmState.openTasksOnly) params.set('open_tasks', 'true')
  if (crmState.view === 'board') params.set('view', 'board')
  
  const paramString = params.toString()
  return paramString ? `${baseUrl}?${paramString}` : baseUrl
}
