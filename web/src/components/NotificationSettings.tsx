import { useState } from 'react'
import { Bell } from 'lucide-react'
import { api, type Prefs } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { DEMO } from '../lib/demo'
import { useAction } from '../lib/useAsync'
import { ErrorText } from './ui'

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function enablePush() {
  if (Notification.permission === 'denied') throw new Error('Notifications are blocked for this site. Allow them in your browser settings.')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Permission was not granted')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const { public_key } = await api.vapidKey()
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(public_key) }))
  await api.pushSubscribe(sub.toJSON())
}

async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) { await api.pushUnsubscribe(sub.endpoint); await sub.unsubscribe() }
}

/** How the user wants to hear about order updates, beyond the in-app bell. */
export default function NotificationSettings() {
  const { profile } = useAuth()
  const [prefs, setPrefs] = useState<Prefs>({
    notify_push: profile?.notify_push ?? true, notify_whatsapp: profile?.notify_whatsapp ?? true, notify_sms: profile?.notify_sms ?? false,
  })
  const act = useAction()

  // Flip instantly for a snappy feel; roll back if enabling push or saving fails.
  const set = async (key: keyof Prefs, on: boolean) => {
    const before = prefs[key]
    setPrefs((p) => ({ ...p, [key]: on }))
    await act.run(async () => {
      try {
        if (key === 'notify_push' && !DEMO) { if (on) await enablePush(); else await disablePush() }
        await api.updatePreferences({ [key]: on })
      } catch (e) {
        setPrefs((p) => ({ ...p, [key]: before }))
        throw e
      }
    })
  }

  const rows: { key: keyof Prefs; label: string; hint: string; disabled?: boolean }[] = [
    { key: 'notify_push', label: 'Browser notifications', hint: DEMO ? 'Not available in demo mode' : pushSupported() ? 'Alerts on this device, even when the app is closed' : 'Not supported in this browser', disabled: DEMO || !pushSupported() },
    { key: 'notify_whatsapp', label: 'WhatsApp updates', hint: 'Key order updates on your phone number' },
    { key: 'notify_sms', label: 'SMS updates', hint: 'Text messages for key order updates' },
  ]

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <Bell size={16} color="var(--brand)" /><h3 style={{ margin: 0 }}>Notifications</h3>
      </div>
      {rows.map((r, i) => (
        <label
          key={r.key}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem 0', cursor: r.disabled ? 'not-allowed' : 'pointer', opacity: r.disabled ? 0.55 : 1, borderTop: i === 0 ? 'none' : '1px solid var(--line, #e5e7eb)' }}
        >
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: 'block' }}>{r.label}</strong>
            <span className="muted" style={{ display: 'block' }}>{r.hint}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={r.label}
            checked={prefs[r.key]}
            disabled={r.disabled}
            onChange={(e) => set(r.key, e.target.checked)}
            style={{ width: 22, height: 22, margin: 0, flexShrink: 0 }}
          />
        </label>
      ))}
      <ErrorText msg={act.error} />
    </div>
  )
}
