import type { ComponentProps, KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

// Segmented tab bar (no Radix Tabs dependency): roving focus with arrows/Home/End, coral active pill.
function Segmented({ className, onKeyDown, ...props }: ComponentProps<'div'>) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)')]
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index - 1 + tabs.length) % tabs.length]
      : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null
    if (!next) return
    event.preventDefault()
    next.focus()
    next.click()
  }
  return <div data-slot="segmented" role="tablist" onKeyDown={move}
    className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-solid border-border bg-black/30 p-1 [scrollbar-width:none]', className)} {...props} />
}

function SegmentedItem({ className, active, ...props }: ComponentProps<'button'> & { active: boolean }) {
  return <button data-slot="segmented-item" type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
    className={cn('inline-flex h-9 flex-none cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-transparent px-4 font-sans text-sm font-semibold leading-none whitespace-nowrap text-muted-foreground outline-none transition-[color,background-color,box-shadow] duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-[0_8px_20px_-12px_rgba(255,64,85,.8)] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0', className)} {...props} />
}

export { Segmented, SegmentedItem }
