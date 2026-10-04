import { readAuthSessionState, type AuthSessionState } from './authService'

export type CollectionState<T> = {
  status: 'auth-loading' | 'data-loading' | 'ready'
  userId: string | null; items: T[]; pendingImport: number
  importOffered: boolean; busy: boolean; error: 'sync' | 'import' | 'storage' | null
}
export type CollectionPersistence<T> = {
  namespace: string
  eagerRead?: boolean
  readGuest(): T[] | Promise<T[]>
  readCache(userId: string): T[] | Promise<T[]>
  writeCache(userId: string, items: T[]): void | Promise<void>
  pendingGuest(userId: string): T[] | Promise<T[]>
  markImported(userId: string, items: T[]): void | Promise<void>
  fetch(userId: string): Promise<T[]>
  import(items: T[], userId: string): Promise<T[]>
}

// Session isolation, confirmation receipts and failure handling are shared by all account collections.
export class AccountCollectionRepository<T extends { id: string }> {
  protected state: CollectionState<T> = { status: 'auth-loading', userId: null, items: [], pendingImport: 0, importOffered: false, busy: false, error: null }
  private listeners = new Set<() => void>()
  private generation = 0
  private dismissed = false
  private refreshVersion = 0
  private guestStorageInvalid = false
  constructor(protected storage: Storage, private persistence: CollectionPersistence<T>, private offerStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    if (persistence.eagerRead !== false) {
      try { Promise.resolve(persistence.readGuest()).catch(() => { this.guestStorageInvalid = true }) } catch { this.guestStorageInvalid = true }
    }
  }
  getCollectionSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getAll = () => this.state.items
  getById = (id: string) => this.state.items.find(item => item.id === id) ?? null
  protected publish(patch: Partial<CollectionState<T>>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener())
  }
  private cache(items: T[]) {
    if (this.state.userId) {
      try { Promise.resolve(this.persistence.writeCache(this.state.userId, items)).catch(() => {}) } catch { /* Confirmed cloud writes remain successful without cache. */ }
    }
  }
  private dismissalKey(userId: string) { return `${this.persistence.namespace}:offer-dismissed:${userId}` }
  async connect(auth: AuthSessionState) {
    const userId = auth.status === 'authenticated' ? auth.userId : null
    if (auth.status !== 'loading' && this.state.status !== 'auth-loading' && userId === this.state.userId) return
    if (this.state.userId && this.state.userId !== userId) {
      try { this.offerStorage?.removeItem(this.dismissalKey(this.state.userId)) } catch { /* Memory resets on logout. */ }
    }
    this.generation++
    try { this.dismissed = userId ? this.offerStorage?.getItem(this.dismissalKey(userId)) === 'true' : false } catch { this.dismissed = false }
    this.publish({ userId, status: auth.status === 'loading' ? 'auth-loading' : 'data-loading', items: [], busy: false, pendingImport: 0, importOffered: false, error: null })
    if (auth.status === 'loading') return
    const generation = this.generation
    if (userId) {
      try {
        const cached = this.persistence.readCache(userId)
        const items = cached instanceof Promise ? await cached : cached
        if (generation !== this.generation) return
        this.publish({ items })
      } catch { /* A damaged cache is replaced by the authoritative fetch. */ }
    }
    if (generation !== this.generation) return
    await this.refresh()
  }
  async refresh() {
    if (this.state.status === 'auth-loading' || this.state.busy) return
    const generation = this.generation, version = ++this.refreshVersion, userId = this.state.userId
    this.publish({ status: 'data-loading', error: null })
    try {
      const items = userId ? await this.persistence.fetch(userId) : await this.persistence.readGuest()
      if (!userId) this.guestStorageInvalid = false
      if (generation !== this.generation || version !== this.refreshVersion) return
      let pendingImport = 0, error: CollectionState<T>['error'] = null
      if (userId) {
        try { pendingImport = (await this.persistence.pendingGuest(userId)).length } catch { error = 'import' }
      }
      if (generation !== this.generation || version !== this.refreshVersion) return
      this.cache(items)
      this.publish({ status: 'ready', items, pendingImport, importOffered: pendingImport > 0 && !this.dismissed, error })
    } catch {
      if (!userId) this.guestStorageInvalid = true
      if (generation === this.generation && version === this.refreshVersion) this.publish({ status: 'ready', error: 'sync' })
    }
  }
  dismissImport() {
    this.dismissed = true
    try { if (this.state.userId) this.offerStorage?.setItem(this.dismissalKey(this.state.userId), 'true') } catch { /* Keep dismissal in memory. */ }
    this.publish({ importOffered: false })
  }
  offerImport() {
    this.dismissed = false
    try { if (this.state.userId) this.offerStorage?.removeItem(this.dismissalKey(this.state.userId)) } catch { /* Explicit offer still works. */ }
    this.publish({ importOffered: this.state.pendingImport > 0 })
  }
  protected async mutation(action: (userId: string | null) => Promise<T[]>, error: 'sync' | 'import' = 'sync') {
    if (this.state.status !== 'ready' || this.state.busy || !this.state.userId && this.guestStorageInvalid) return false
    const generation = this.generation, userId = this.state.userId
    ++this.refreshVersion
    this.publish({ busy: true, error: null })
    try {
      if (!userId) {
        try { await this.persistence.readGuest() } catch (failure) { this.guestStorageInvalid = true; throw failure }
      }
      const items = await action(userId)
      if (generation !== this.generation) return false
      this.cache(items)
      this.publish({ items, busy: false })
      return true
    } catch {
      if (generation === this.generation) this.publish({ busy: false, error })
      return false
    }
  }
  async importGuestData() {
    const generation = this.generation
    const ok = await this.mutation(async userId => {
      if (!userId) throw new Error('Authentication required')
      const pending = await this.persistence.pendingGuest(userId)
      const items = await this.persistence.import(pending, userId)
      if (!pending.every(item => items.some(saved => saved.id === item.id))) throw new Error('Incomplete import')
      await this.persistence.markImported(userId, pending)
      return items
    }, 'import')
    if (ok && generation === this.generation) {
      this.dismissed = true
      let pendingImport = 0
      try { pendingImport = (await this.persistence.pendingGuest(this.state.userId!)).length } catch { /* Original data and receipts are already retained. */ }
      if (generation !== this.generation) return ok
      this.publish({ pendingImport, importOffered: false })
    }
    return ok
  }
}

export function bindAccountCollection<T extends { id: string }>(repository: AccountCollectionRepository<T>, keys: { guest: string[]; cache: (id: string) => string; receipt: (id: string) => string; guestEvent: string }) {
  const connect = () => { void repository.connect(readAuthSessionState()) }
  window.addEventListener('xensi-auth-updated', connect)
  window.addEventListener('storage', event => {
    const userId = repository.getCollectionSnapshot().userId
    if (event.key === null || keys.guest.includes(event.key) || userId && [keys.cache(userId), keys.receipt(userId)].includes(event.key)) void repository.refresh()
  })
  window.addEventListener(keys.guestEvent, () => { if (!repository.getCollectionSnapshot().userId) void repository.refresh() })
  connect()
}

export const isUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
export function readImportReceipts(storage: Pick<Storage, 'getItem'>, key: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {}
  } catch { return {} }
}
export function markImported<T extends { id: string }>(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, items: T[], fingerprint: (item: T) => string) {
  storage.setItem(key, JSON.stringify({ ...readImportReceipts(storage, key), ...Object.fromEntries(items.map(item => [item.id, fingerprint(item)])) }))
}
