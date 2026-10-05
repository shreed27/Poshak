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

  const set = (key: keyof Prefs, on: boolean) => act.run(async () => {
    if (key === 'notify_push' && !DEMO) { if (on) await enablePush(); else await disablePush() }
    const saved = await api.updatePreferences({ [key]: on })
    setPrefs((p) => ({ ...p, [key]: saved[key] ?? on }))
  })

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
      {rows.map((r) => (
        <label key={r.key} className="radio" style={{ alignItems: 'center', justifyContent: 'space-between', opacity: r.disabled ? 0.55 : 1 }}>
          <span><strong>{r.label}</strong><br /><span className="muted">{r.hint}</span></span>
          <input type="checkbox" role="switch" aria-label={r.label} checked={prefs[r.key]} disabled={act.busy || r.disabled}
            onChange={(e) => set(r.key, e.target.checked)} style={{ width: 20, height: 20, margin: 0 }} />
        </label>
      ))}
      <ErrorText msg={act.error} />
    </div>
  )
}
