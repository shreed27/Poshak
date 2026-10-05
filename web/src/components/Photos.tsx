import { useRef, useState } from 'react'
import { Camera, ImagePlus, X, ShieldCheck, Image as ImageIcon } from 'lucide-react'
import { compressForUpload, MAX_PHOTOS } from '../lib/photos'
import { ErrorText } from './ui'

export interface Pending {
  id: string
  blob: Blob
  url: string
}

/** Take a photo with the camera or pick from the gallery; shows removable thumbnails. */
export function PhotoPicker({
  photos,
  onChange
}: {
  photos: Pending[]
  onChange: (p: Pending[]) => void
}) {
  const cam = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const room = MAX_PHOTOS - photos.length

  const add = async (picked: FileList | null) => {
    const files = Array.from(picked ?? [])
    if (!files.length) return
    setError('')
    setBusy(true)
    try {
      const next: Pending[] = []
      for (const f of files.slice(0, room)) {
        const blob = await compressForUpload(f)
        next.push({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) })
      }
      onChange([...photos, ...next])
      if (files.length > room) {
        setError(`Only ${MAX_PHOTOS} photos are allowed, extras were skipped.`)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = (id: string) => {
    const p = photos.find((x) => x.id === id)
    if (p) URL.revokeObjectURL(p.url)
    onChange(photos.filter((x) => x.id !== id))
  }

  return (
    <div>
      <div className="photo-uploader-box">
        <button
          type="button"
          disabled={busy || room === 0}
          onClick={() => cam.current?.click()}
        >
          <Camera size={18} />
          <span>Take Photo</span>
        </button>
        <button
          type="button"
          disabled={busy || room === 0}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus size={18} />
          <span>Upload Images</span>
        </button>
        <input
          ref={cam}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          aria-label="Take a photo"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Upload photos"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {busy && <p className="muted">Compressing &amp; preparing photos…</p>}

      {photos.length > 0 && (
        <div className="photo-grid" style={{ marginTop: '0.85rem' }}>
          {photos.map((p) => (
            <div key={p.id} className="photo-thumbnail">
              <img src={p.url} alt="Your clothes" />
              <button
                type="button"
                className="delete-btn"
                aria-label="Remove photo"
                onClick={() => remove(p.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        <ShieldCheck size={14} color="var(--brand)" />
        <span>{photos.length}/{MAX_PHOTOS} photos added for item verification</span>
      </div>

      <ErrorText msg={error} />
    </div>
  )
}

/** Read-only thumbnails with tap-to-enlarge lightbox. */
export function PhotoStrip({
  photos,
  label
}: {
  photos?: { id: string; url: string }[]
  label?: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  if (!photos?.length) return null

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          <ImageIcon size={15} />
          <span>{label}</span>
        </div>
      )}
      <div className="photo-grid">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            className="photo-thumbnail viewable"
            onClick={() => setOpen(p.url)}
            aria-label="View photo"
          >
            <img src={p.url} alt="Clothes verification" />
          </button>
        ))}
      </div>

      {open && (
        <div className="photo-lightbox" onClick={() => setOpen(null)}>
          <button
            type="button"
            className="lightbox-close-btn"
            onClick={() => setOpen(null)}
            aria-label="Close photo"
          >
            <X size={20} />
          </button>
          <img src={open} alt="Clothes verification enlarged" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
