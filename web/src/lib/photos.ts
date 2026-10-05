import { supabase } from './supabase'
import { DEMO } from './demo'

export const MAX_PHOTOS = 6

/** Downscale + re-encode as JPEG so phone photos (often 5-10 MB) upload quickly. */
export async function compressImage(file: File, maxSide: number, quality: number): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Could not read that image') })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', quality))
}

// Demo mode keeps photos in localStorage (~5 MB), so shrink harder there.
export const compressForUpload = (file: File) => (DEMO ? compressImage(file, 480, 0.55) : compressImage(file, 1280, 0.8))

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result as string)
  r.onerror = () => reject(new Error('Could not read image'))
  r.readAsDataURL(blob)
})

/** Upload photos for a new order. Returns storage paths (real mode) or data URLs (demo). */
export async function uploadOrderPhotos(blobs: Blob[], userId: string): Promise<string[]> {
  if (DEMO) return Promise.all(blobs.map(toDataUrl))
  return Promise.all(blobs.map(async (blob) => {
    const path = `${userId}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('order-photos').upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw new Error(`Photo upload failed: ${error.message}`)
    return path
  }))
}
