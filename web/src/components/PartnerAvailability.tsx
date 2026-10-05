import { useEffect, useRef, useState } from 'react'
import { Power } from 'lucide-react'
import { api } from '../lib/api'
import { DEMO } from '../lib/demo'
import { useAction, useAsync } from '../lib/useAsync'
import { ErrorText } from './ui'

const PING_MS = 30_000
const DEMO_SPOT = { lat: 12.975, lng: 77.6 } // near the demo customer's address

const currentPosition = (): Promise<{ lat: number; lng: number } | null> =>
  DEMO ? Promise.resolve(DEMO_SPOT)
    : !navigator.geolocation ? Promise.resolve(null)
    : new Promise((resolve) => navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 8000 }))

/** Go online/offline. While online, shares location every 30s so nearby orders are auto-assigned. */
export default function PartnerAvailability({ onChange }: { onChange: () => void }) {
  const status = useAsync(api.partnerMyStatus)
  const [note, setNote] = useState('')
  const online = !!status.data?.is_online
  const last = useRef(0)
  const toggle = useAction(async () => {})

  useEffect(() => {
    if (!online) return
    const send = (lat: number, lng: number) => {
      if (Date.now() - last.current < PING_MS) return
      last.current = Date.now()
      api.partnerLocation(lat, lng).then(onChange).catch(() => {})
    }
    if (DEMO) { const t = setInterval(() => send(DEMO_SPOT.lat, DEMO_SPOT.lng), PING_MS); return () => clearInterval(t) }
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition((p) => send(p.coords.latitude, p.coords.longitude), () => {}, { enableHighAccuracy: true })
    return () => navigator.geolocation.clearWatch(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  const flip = () => toggle.run(async () => {
    setNote('')
    const pos = online ? null : await currentPosition()
    const res = await api.partnerSetStatus(!online, pos?.lat, pos?.lng)
    if (!online && !pos) setNote('Location is off, so nearby orders can\'t be auto-assigned to you. You can still accept pickups manually.')
    else if (res.assigned_now) setNote(`${res.assigned_now} waiting pickup${res.assigned_now > 1 ? 's were' : ' was'} assigned to you.`)
    last.current = Date.now()
    await status.reload()
    onChange()
  })

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', borderLeft: `4px solid ${online ? 'var(--green)' : 'var(--line)'}` }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <strong>{online ? 'You are online' : 'You are offline'}</strong>
        <div className="muted" style={{ fontSize: '0.85rem' }}>
          {online ? 'Nearby pickups are assigned to you automatically.' : 'Go online to receive nearby pickups automatically.'}
        </div>
      </div>
      <button type="button" className={online ? '' : 'primary'} disabled={toggle.busy || status.loading} onClick={flip}>
        <Power size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />{online ? 'Go offline' : 'Go online'}
      </button>
      {note && <p className="muted" style={{ width: '100%', margin: 0 }}>{note}</p>}
      <ErrorText msg={toggle.error || status.error} />
    </div>
  )
}
