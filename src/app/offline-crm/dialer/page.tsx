import OfflineCRMDialer from '@/components/offline-crm/OfflineCRMDialer'
import OfflineCRMSilentMirror from '@/components/offline-crm/OfflineCRMSilentMirror'
import OfflineCRMRuntimeGuard from '@/components/offline-crm/OfflineCRMRuntimeGuard'
import OfflineCRMServiceWorker from '@/components/offline-crm/OfflineCRMServiceWorker'

export default function OfflineCRMDialerPage() {
  return (
    <OfflineCRMRuntimeGuard>
      <OfflineCRMServiceWorker />
      <OfflineCRMSilentMirror />
      <OfflineCRMDialer />
    </OfflineCRMRuntimeGuard>
  )
}
