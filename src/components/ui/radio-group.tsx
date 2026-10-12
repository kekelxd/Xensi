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
    className={cn('m-0 grid aspect-square size-[18px] shrink-0 cursor-pointer place-content-center rounded-full border border-solid border-input bg-black/30 p-0 shadow-none outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary', className)}
    {...props}>
    <RadioGroupPrimitive.Indicator data-slot="radio-group-indicator" className="size-2 rounded-full bg-primary" />
  </RadioGroupPrimitive.Item>
}

/** Selectable card: the whole surface is the radio. Children render inside; a check marks the chosen card. */
function RadioGroupCard({ className, children, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return <RadioGroupPrimitive.Item
    data-slot="radio-group-card"
    className={cn('group/radio-card relative m-0 flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-solid border-border bg-card/80 p-3.5 text-left font-sans text-sm font-medium leading-tight tracking-normal normal-case text-foreground shadow-none outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-foreground/25 hover:bg-foreground/[.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary/60 data-[state=checked]:bg-primary/[.08] data-[state=checked]:shadow-[0_14px_34px_-24px_rgba(255,64,85,.75)]', className)}
    {...props}>
    {children}
    <span aria-hidden="true" className="ml-auto grid size-5 flex-none place-content-center rounded-full border border-solid border-input text-primary-foreground transition-colors group-data-[state=checked]/radio-card:border-primary group-data-[state=checked]/radio-card:bg-primary">
      <Check className="size-3 opacity-0 transition-opacity group-data-[state=checked]/radio-card:opacity-100" strokeWidth={3} />
    </span>
  </RadioGroupPrimitive.Item>
}

export { RadioGroup, RadioGroupCard, RadioGroupItem }
