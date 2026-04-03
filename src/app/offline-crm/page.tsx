import OfflineCRMApp from '@/components/offline-crm/OfflineCRMApp'
import OfflineCRMSilentMirror from '@/components/offline-crm/OfflineCRMSilentMirror'
import OfflineCRMRuntimeGuard from '@/components/offline-crm/OfflineCRMRuntimeGuard'
import OfflineCRMServiceWorker from '@/components/offline-crm/OfflineCRMServiceWorker'

export default function OfflineCRMPage() {
  return (
    <OfflineCRMRuntimeGuard>
      <OfflineCRMServiceWorker />
      <OfflineCRMSilentMirror />
      <OfflineCRMApp />
    </OfflineCRMRuntimeGuard>
  )
}
