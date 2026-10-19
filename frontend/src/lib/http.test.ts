import { ApiError, apiFetch } from './http'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('apiFetch', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-token'
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the CSRF token on unsafe requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await apiFetch('/auth/logout/', { method: 'POST' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/auth/logout/')
    expect((init?.headers as Record<string, string>)['X-CSRFToken']).toBe('test-token')
  })

  it('maps the error envelope onto ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { detail: 'Please correct the highlighted fields.', code: 'invalid', fields: { sku: ['Taken.'] } }),
    )
    const error = await apiFetch('/x/', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'invalid', fields: { sku: ['Taken.'] } })
  })

  it('treats not_authenticated as a missing session, not a permission error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(403, { detail: 'Authentication credentials were not provided.', code: 'not_authenticated', fields: {} }),
    )
    const error = (await apiFetch('/auth/me/').catch((e: unknown) => e)) as ApiError
    expect(error.isUnauthenticated).toBe(true)
    expect(error.isForbidden).toBe(false)
  })

  it('gives a readable message for non-JSON failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>oops</html>', { status: 502 }))
    const error = (await apiFetch('/x/').catch((e: unknown) => e)) as ApiError
    expect(error.message).toBe('The server ran into a problem. Please try again.')
  })

  it('reports network failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const error = (await apiFetch('/x/').catch((e: unknown) => e)) as ApiError
    expect(error.code).toBe('network_error')
  })
})
