/**
 * Thin fetch wrapper for the Django API.
 * - Same-origin session auth; unsafe methods send the CSRF token from the csrftoken cookie.
 * - Every failure becomes an ApiError using the backend's {detail, code, fields} envelope.
 */

export const API_BASE = '/api/v1'
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: FieldErrors

  constructor(status: number, detail: string, code = 'error', fields: FieldErrors = {}) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }

  /** The session is missing or expired; DRF's SessionAuthentication reports this as 403. */
  get isUnauthenticated(): boolean {
    return this.status === 401 || this.code === 'not_authenticated'
  }

  get isForbidden(): boolean {
    return this.status === 403 && !this.isUnauthenticated
  }
}

export function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie('csrftoken')
  if (existing) return existing
  await fetch(`${API_BASE}/auth/csrf/`, { credentials: 'same-origin' })
  return readCookie('csrftoken') ?? ''
}

const GENERIC_MESSAGES: Record<number, string> = {
  403: 'You don’t have permission to do that.',
  404: 'We couldn’t find what you were looking for.',
  429: 'Too many attempts. Please wait a minute and try again.',
}

async function toApiError(response: Response): Promise<ApiError> {
  const isJson = response.headers.get('content-type')?.includes('application/json')
  if (isJson) {
    const body = (await response.json().catch(() => null)) as
      | { detail?: string; code?: string; fields?: FieldErrors }
      | null
    if (body?.detail) return new ApiError(response.status, body.detail, body.code, body.fields ?? {})
  }
  // Non-JSON errors (e.g. Django's CSRF failure page, proxy errors).
  const fallback =
    GENERIC_MESSAGES[response.status] ??
    (response.status >= 500 ? 'The server ran into a problem. Please try again.' : 'Something went wrong.')
  return new ApiError(response.status, fallback, response.status === 403 ? 'csrf_or_forbidden' : 'error')
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
  // FormData (file uploads) sets its own multipart boundary; everything else is JSON.
  const isForm = options.body instanceof FormData
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  if (UNSAFE_METHODS.has(method)) headers['X-CSRFToken'] = await ensureCsrfToken()

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
      credentials: 'same-origin',
      signal: options.signal,
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError(0, 'Can’t reach the server. Check the connection and try again.', 'network_error')
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
