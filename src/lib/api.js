const TOKEN_KEY = 'secret-santa-admin-token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = token => {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(method, url, body, { auth = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError('Geen verbinding met de server.', 0)
  }

  let data = null
  try { data = await res.json() } catch { /* lege respons */ }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      setToken(null)
      window.dispatchEvent(new Event('admin-logout'))
    }
    throw new ApiError(data?.error || 'Er ging iets mis.', res.status)
  }
  return data
}

// Beheerder (JWT in de Authorization-header)
export const admin = {
  get: url => request('GET', url, undefined, { auth: true }),
  post: (url, body = {}) => request('POST', url, body, { auth: true }),
  put: (url, body = {}) => request('PUT', url, body, { auth: true }),
  del: url => request('DELETE', url, undefined, { auth: true }),
}

export const publicApi = {
  post: (url, body = {}) => request('POST', url, body),
}

// Deelnemer (token in de URL)
export const participantApi = token => ({
  get: () => request('GET', `/api/me/${encodeURIComponent(token)}`),
  saveWishlist: wishlist => request('PUT', `/api/me/${encodeURIComponent(token)}/wishlist`, { wishlist }),
  sendMessage: (to, body) => request('POST', `/api/me/${encodeURIComponent(token)}/messages`, { to, body }),
})
