import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Same field metrics as Input (44px, 8px radius, mint focus). Content sits above dialogs (z 1001).
function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup(props: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({ className, size = 'default', children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'default' }) {
  return <SelectPrimitive.Trigger
    data-slot="select-trigger"
    data-size={size}
    className={cn('m-0 flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg border border-solid border-input bg-black/30 px-3 py-0 text-left font-sans text-[15px] font-medium leading-none tracking-normal normal-case whitespace-nowrap text-foreground shadow-none outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/35 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[placeholder]:text-subtle data-[size=default]:h-11 data-[size=sm]:h-9 data-[size=sm]:text-sm data-[state=open]:border-ring *:data-[slot=select-value]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0', className)}
    {...props}>
    {children}
    <SelectPrimitive.Icon asChild><ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
}

function SelectContent({ className, children, position = 'popper', align = 'start', ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      data-slot="select-content"
      className={cn('relative z-[1100] max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-solid border-input bg-popover font-sans text-popover-foreground shadow-[0_24px_60px_-24px_rgba(4,5,8,.9)]', position === 'popper' && 'data-[side=bottom]:translate-y-1.5 data-[side=top]:-translate-y-1.5', className)}
      position={position}
      align={align}
      {...props}>
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'w-full min-w-(--radix-select-trigger-width) scroll-my-1')}>{children}</SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
}

function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label data-slot="select-label" className={cn('px-2.5 py-1.5 text-xs font-medium text-subtle', className)} {...props} />
}

function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item
    data-slot="select-item"
    className={cn('relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-2.5 pr-9 pl-2.5 text-sm font-medium text-foreground outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-foreground/[.06] data-[state=checked]:text-primary [&_svg]:pointer-events-none [&_svg]:shrink-0', className)}
    {...props}>
    <span data-slot="select-item-indicator" className="absolute right-2.5 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
}

function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)} {...props} />
}

function SelectScrollUpButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return <SelectPrimitive.ScrollUpButton data-slot="select-scroll-up-button" className={cn('flex cursor-default items-center justify-center py-1 text-muted-foreground', className)} {...props}><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
}

function SelectScrollDownButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return <SelectPrimitive.ScrollDownButton data-slot="select-scroll-down-button" className={cn('flex cursor-default items-center justify-center py-1 text-muted-foreground', className)} {...props}><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue }
