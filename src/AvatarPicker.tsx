import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import { AvatarArtwork } from './AvatarArtwork'
import { XENSI_AVATARS, type AvatarId } from './avatars'
import type { Locale } from './i18n'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Group = typeof XENSI_AVATARS[number]['group']
const groups = [...new Set(XENSI_AVATARS.map((avatar) => avatar.group))] as Group[]
const groupLabels: Record<Locale, Record<Group, string>> = {
  pt: { cats: 'Gatos', dogs: 'Cachorros', hamsters: 'Hamsters', neon: 'Neon' },
  en: { cats: 'Cats', dogs: 'Dogs', hamsters: 'Hamsters', neon: 'Neon' },
  es: { cats: 'Gatos', dogs: 'Perros', hamsters: 'Hámsters', neon: 'Neón' },
}
const groupOf = (id: string): Group => XENSI_AVATARS.find((avatar) => avatar.id === id)?.group ?? groups[0]

/** Current avatar shown large; "Change" reveals the collection grouped by mascot (tabs), opening on the current group. */
export function AvatarPicker({ locale, value, label, changeLabel, doneLabel, onChange }: { locale: Locale; value: AvatarId; label: string; changeLabel: string; doneLabel: string; onChange: (id: AvatarId) => void }) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<Group>(() => groupOf(value))
  const tabs = useRef<Partial<Record<Group, HTMLButtonElement | null>>>({})
  const current = XENSI_AVATARS.find((avatar) => avatar.id === value)
  const labels = groupLabels[locale]

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = groups.indexOf(group)
    const next = event.key === 'ArrowRight' ? groups[(index + 1) % groups.length] : event.key === 'ArrowLeft' ? groups[(index - 1 + groups.length) % groups.length]
      : event.key === 'Home' ? groups[0] : event.key === 'End' ? groups[groups.length - 1] : null
    if (!next) return
    event.preventDefault()
    setGroup(next)
    tabs.current[next]?.focus()
  }

  return <div className="grid gap-4">
    <div className="flex items-center gap-4">
      <div className="size-24 flex-none rounded-full bg-primary p-1 shadow-[0_18px_40px_-20px_rgba(255,64,85,.7)]"><AvatarArtwork avatarId={value} size="lg" className="size-full rounded-full border-0 bg-muted shadow-none" /></div>
      <div className="grid min-w-0 gap-2">
        <span className="text-[13px] font-medium leading-none text-muted-foreground">{label}</span>
        <strong className="truncate font-heading text-lg font-semibold leading-tight" title={current?.label}>{current?.label}</strong>
        <Button variant="outline" size="sm" className="justify-self-start" aria-expanded={open} aria-controls={`${uid}-picker`} onClick={() => { if (!open) setGroup(groupOf(value)); setOpen(!open) }}>{open ? doneLabel : changeLabel}</Button>
      </div>
    </div>
    {open && <div id={`${uid}-picker`} className="grid gap-3">
      <div role="tablist" aria-label={label} className="flex overflow-x-auto sm:gap-1 border-0 border-b border-solid border-border [scrollbar-width:none]">
        {groups.map((id) => <button key={id} ref={(node) => { tabs.current[id] = node }} type="button" role="tab" id={`${uid}-tab-${id}`} aria-selected={group === id} aria-controls={`${uid}-panel`} tabIndex={group === id ? 0 : -1}
          onClick={() => setGroup(id)} onKeyDown={onTabKey}
          className="-mb-px flex-1 cursor-pointer whitespace-nowrap border-0 border-b-2 border-solid border-transparent bg-transparent px-2 py-2.5 sm:flex-none sm:px-3 font-sans text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-selected:border-primary aria-selected:text-foreground">
          {labels[id]}{groupOf(value) === id && <span aria-hidden="true" className="ml-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />}
        </button>)}
      </div>
      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${group}`} className="profile-avatar-picker grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2.5 p-1">
        {XENSI_AVATARS.filter((avatar) => avatar.group === group).map((avatar) => {
          const selected = value === avatar.id
          return <button key={avatar.id} type="button" onClick={() => onChange(avatar.id)} aria-label={avatar.label} title={avatar.label} aria-pressed={selected}
            className={cn('relative aspect-square min-w-0 cursor-pointer overflow-hidden rounded-xl border-0 bg-muted p-0 outline-none transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
              selected ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-popover' : 'opacity-75 hover:opacity-100')}>
            <AvatarArtwork avatarId={avatar.id} size="picker" loading="lazy" className="size-full rounded-none border-0 shadow-none" />
            {selected && <span aria-hidden="true" className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_2px_6px_rgba(0,0,0,.5)]"><Check className="size-3.5" strokeWidth={3} /></span>}
          </button>
        })}
      </div>
    </div>}
  </div>
}
