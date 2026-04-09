'use client'

import { useMemo, useState } from 'react'

export function useBulkSelection(allIds: string[], visibleIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const visibleSelectedCount = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)).length,
    [selectedIds, visibleIds],
  )
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(allIds))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function removeIds(ids: string[]) {
    setSelectedIds((current) => {
      const next = new Set(current)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    visibleSelectedCount,
    allVisibleSelected,
    toggleOne,
    toggleVisible,
    selectAllFiltered,
    clearSelection,
    removeIds,
  }
}
