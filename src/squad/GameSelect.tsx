import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type GameOption = { id: string; name: string; keywords?: string }
type Copy = { search: string; empty: string; popular: string }

const normalize = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const mobileQuery = '(max-width: 639px)'

/**
 * Single-line game field. Opens an anchored popover (desktop) or bottom sheet (mobile) with search,
 * "most used" chips and a keyboard-driven listbox. Built on Radix Dialog so it also works inside other
 * dialogs (focus trap, Esc, focus returns to the trigger). With `allowAll`, '' means "all games".
 */
export function GameSelect({ label, value, onValueChange, options, popular = [], allowAll = false, allLabel = '', copy, disabled = false, className }: {
  label: string; value: string; onValueChange: (id: string) => void; options: readonly GameOption[]; popular?: readonly string[]
  allowAll?: boolean; allLabel?: string; copy: Copy; disabled?: boolean; className?: string
}) {
  const uid = useId()
  const listId = `${uid}-list`, optionId = (i: number) => `${uid}-opt-${i}`
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<{ sheet: boolean; style?: CSSProperties }>({ sheet: false })
  const current = options.find(o => o.id === value)
  const shown = current?.name ?? (allowAll ? allLabel : '')

  const items = useMemo(() => {
    const q = normalize(query.trim())
    const all: GameOption[] = allowAll ? [{ id: '', name: allLabel }, ...options] : [...options]
    return q ? all.filter(o => o.id && normalize(`${o.name} ${o.keywords ?? ''}`).includes(q)) : all
  }, [query, options, allowAll, allLabel])
  const chips = useMemo(() => popular.map(id => options.find(o => o.id === id)).filter((o): o is GameOption => Boolean(o)).slice(0, 4), [popular, options])

  const openPicker = () => {
    const sheet = window.matchMedia(mobileQuery).matches
    let style: CSSProperties | undefined
    const rect = trigger.current?.getBoundingClientRect()
    if (!sheet && rect) {
      const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 32)
      const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16)
      const below = window.innerHeight - rect.bottom - 16, above = rect.top - 16
      const up = below < 320 && above > below
      style = { left, width, maxHeight: Math.min(440, (up ? above : below) - 6), ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) }
    }
    setPlace({ sheet, style })
    setQuery('')
    setActive(Math.max(0, (allowAll ? [{ id: '' }, ...options] : options).findIndex(o => o.id === value)))
    setOpen(true)
  }
  const choose = (id: string) => { onValueChange(id); setOpen(false) }

  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' }) }, [active, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = items.length - 1
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(last, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)) }
    else if (e.key === 'Home' && !query) { e.preventDefault(); setActive(0) }
    else if (e.key === 'End' && !query) { e.preventDefault(); setActive(last) }
    else if (e.key === 'Enter') { e.preventDefault(); const item = items[active]; if (item) choose(item.id) }
  }

  return <DialogPrimitive.Root open={open} onOpenChange={next => { if (next) openPicker(); else setOpen(false) }}>
    <DialogPrimitive.Trigger asChild disabled={disabled}>
      <button ref={trigger} type="button" aria-label={`${label}: ${shown}`}
        className={cn('m-0 flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-solid border-input bg-black/30 px-3 text-left font-sans text-[15px] font-medium leading-none text-foreground outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/35 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-ring', className)}>
        <span className="flex-none text-muted-foreground">{label}:</span>
        <span className="min-w-0 flex-1 truncate" title={shown}>{shown}</span>
        <ChevronDown aria-hidden="true" className="size-4 flex-none text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
      </button>
    </DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn('fixed inset-0 z-[1100]', place.sheet ? 'bg-[rgba(4,5,8,.6)]' : 'bg-transparent')} />
      <DialogPrimitive.Content aria-describedby={undefined} style={place.style} tabIndex={-1}
        // Focus search on desktop; on the mobile sheet focus the panel so the keyboard does not cover the list.
        onOpenAutoFocus={e => { e.preventDefault(); (place.sheet ? e.currentTarget as HTMLElement : document.getElementById(`${uid}-search`))?.focus() }}
        className={cn('game-select-panel fixed z-[1101] flex flex-col overflow-hidden border border-solid border-input bg-popover font-sans text-popover-foreground shadow-[0_24px_60px_-24px_rgba(4,5,8,.9)] outline-none',
          place.sheet ? 'is-sheet inset-x-0 bottom-0 max-h-[78dvh] rounded-t-2xl border-b-0 pb-[env(safe-area-inset-bottom)]' : 'rounded-xl')}>
        <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
        {place.sheet && <span aria-hidden="true" className="mx-auto mt-2 h-1 w-10 flex-none rounded-full bg-foreground/20" />}
        <div className="relative flex-none border-0 border-b border-solid border-border p-2">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-subtle" />
          <input id={`${uid}-search`} role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-label={copy.search}
            aria-activedescendant={items[active] ? optionId(active) : undefined} placeholder={copy.search} autoComplete="off" spellCheck={false}
            value={query} onChange={e => { setQuery(e.target.value); setActive(0) }} onKeyDown={onKey}
            className="h-10 w-full rounded-lg border-0 bg-black/30 pr-3 pl-9 font-sans text-base text-foreground outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm" />
        </div>
        {!query && chips.length > 0 && <div role="group" aria-label={copy.popular} className="flex flex-none flex-wrap gap-1.5 border-0 border-b border-solid border-border px-3 py-2.5">
          {chips.map(o => <button key={o.id} type="button" title={o.name} aria-pressed={o.id === value} onClick={() => choose(o.id)}
            className="max-w-full cursor-pointer truncate rounded-full border border-solid border-input bg-white/[.03] px-3 py-1.5 font-sans text-[13px] font-medium leading-none text-foreground outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary/60 aria-pressed:bg-primary/12">{o.name}</button>)}
        </div>}
        <ul ref={list} id={listId} role="listbox" aria-label={label} className="m-0 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-1">
          {items.map((o, i) => <li key={o.id || 'all'} id={optionId(i)} role="option" aria-selected={o.id === value} title={o.name}
            data-active={i === active || undefined} onMouseMove={() => setActive(i)} onClick={() => choose(o.id)}
            className={cn('flex cursor-pointer items-center gap-2 rounded-md py-2.5 pr-2.5 pl-3 text-sm font-medium text-foreground data-[active]:bg-foreground/[.06] aria-selected:text-primary', !o.id && 'text-muted-foreground')}>
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            {o.id === value && <Check aria-hidden="true" className="size-4 flex-none" />}
          </li>)}
          {!items.length && <li role="presentation" className="px-3 py-6 text-center text-sm text-muted-foreground">{copy.empty}</li>}
        </ul>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
