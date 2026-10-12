import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function RadioGroup({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn('grid gap-3', className)} {...props} />
}

function RadioGroupItem({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return <RadioGroupPrimitive.Item
    data-slot="radio-group-item"
    className={cn('m-0 grid aspect-square size-[18px] shrink-0 cursor-pointer place-content-center rounded-full border border-solid border-input bg-black/30 p-0 shadow-none outline-none transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none motion-reduce:duration-0 hover:border-foreground/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary', className)}
    {...props}>
    <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" className="size-2 rounded-full bg-primary" />
  </RadioGroupPrimitive.Item>
}

/** Selectable card: the whole surface is the radio. Children render inside; a check marks the chosen card.
    indicator="corner" floats a small check in the corner (only when chosen) so dense grids keep their width for text. */
function RadioGroupCard({ className, children, indicator = 'inline', ...props }: ComponentProps<typeof RadioGroupPrimitive.Item> & { indicator?: 'inline' | 'corner' }) {
  if (indicator === 'corner') return <RadioGroupPrimitive.Item
    data-slot="radio-group-card"
    className={cn('group/radio-card relative m-0 flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-solid border-border bg-card/80 p-3.5 pr-6 text-left font-sans text-sm font-medium leading-tight tracking-normal normal-case text-foreground shadow-none outline-none transition-[border-color,background-color,box-shadow] duration-200 motion-reduce:transition-none motion-reduce:duration-0 hover:border-foreground/25 hover:bg-foreground/[.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary/60 data-[state=checked]:bg-primary/[.08] data-[state=checked]:shadow-[0_14px_34px_-24px_rgba(255,64,85,.75)]', className)}
    {...props}>
    {children}
    <Check aria-hidden="true" className="absolute top-2 right-2 size-3.5 text-primary opacity-0 transition-opacity group-data-[state=checked]/radio-card:opacity-100" strokeWidth={3} />
  </RadioGroupPrimitive.Item>
  return <RadioGroupPrimitive.Item
    data-slot="radio-group-card"
    className={cn('group/radio-card relative m-0 flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-solid border-border bg-card/80 p-3.5 text-left font-sans text-sm font-medium leading-tight tracking-normal normal-case text-foreground shadow-none outline-none transition-[border-color,background-color,box-shadow] duration-200 motion-reduce:transition-none motion-reduce:duration-0 hover:border-foreground/25 hover:bg-foreground/[.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary/60 data-[state=checked]:bg-primary/[.08] data-[state=checked]:shadow-[0_14px_34px_-24px_rgba(255,64,85,.75)]', className)}
    {...props}>
    {children}
    <span aria-hidden="true" className="ml-auto grid size-5 flex-none place-content-center rounded-full border border-solid border-input text-primary-foreground transition-colors group-data-[state=checked]/radio-card:border-primary group-data-[state=checked]/radio-card:bg-primary">
      <Check className="size-3 opacity-0 transition-opacity group-data-[state=checked]/radio-card:opacity-100" strokeWidth={3} />
    </span>
  </RadioGroupPrimitive.Item>
}

/** Compact segmented option (durations, levels, crosshair styles). */
function RadioGroupChip({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return <RadioGroupPrimitive.Item
    data-slot="radio-group-chip"
    className={cn('m-0 inline-flex h-9 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-solid border-input bg-black/25 px-3 font-sans text-[13px] font-medium leading-none tracking-normal normal-case whitespace-nowrap text-muted-foreground shadow-none outline-none transition-[border-color,background-color,color] duration-200 motion-reduce:transition-none motion-reduce:duration-0 hover:border-foreground/30 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary/60 data-[state=checked]:bg-primary/[.1] data-[state=checked]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0', className)}
    {...props} />
}

export { RadioGroup, RadioGroupCard, RadioGroupChip, RadioGroupItem }
