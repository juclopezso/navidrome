import { useState, useEffect } from 'react'

/**
 * Fetches an image URL with the Navidrome auth token and returns a blob URL
 * safe to use in <img src>. Returns null while loading or on error.
 *
 * External URLs (http/https, e.g. Gravatar) are returned as-is without fetching.
 */
export const useAuthenticatedBlobUrl = (url) => {
  const [blobUrl, setBlobUrl] = useState(null)

  useEffect(() => {
    if (!url) {
      setBlobUrl(null)
      return
    }

    // External URLs work directly — no auth header needed
    if (url.startsWith('http://') || url.startsWith('https://')) {
      setBlobUrl(url)
      return
    }

    let active = true
    let objectUrl = null

    const token = localStorage.getItem('token')
    fetch(url, {
      headers: token ? { 'X-ND-Authorization': `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch error'))))
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob)
          setBlobUrl(objectUrl)
        }
      })
      .catch(() => {
        if (active) setBlobUrl(null)
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  return blobUrl
}
