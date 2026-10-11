import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('GitHub Pages project path', () => {
  it('keeps Squad deep links and auth redirects inside the deployed project', async () => {
    vi.stubEnv('BASE_URL', '/Xensi/')
    vi.resetModules()
    const routes = await import('./routes')
    expect(routes.viewRoutePath('squad')).toBe('/Xensi/squad')
    expect(routes.withBasePath('squad/requests')).toBe('/Xensi/squad/requests')
    expect(routes.getRouteSegmentFromLocation({ pathname: '/Xensi/squad/requests' })).toBe('squad/requests')
    expect(routes.readRouteStateFromLocation({ pathname: '/Xensi/squad/requests', search: '' } as Location).canonicalPath).toBe('/Xensi/squad/requests')
    expect(routes.authRoutePath('auth-callback')).toBe('/Xensi/auth/callback')
    expect(routes.authRoutePath('reset-password')).toBe('/Xensi/reset-password')
  })
})
