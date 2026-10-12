import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root
    data-slot="checkbox"
    className={cn('peer m-0 grid size-[18px] shrink-0 cursor-pointer place-content-center rounded-[5px] border border-solid border-input bg-black/30 p-0 text-primary-foreground shadow-none outline-none transition-[background-color,border-color,box-shadow] duration-200 hover:border-foreground/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[state=checked]:border-primary data-[state=checked]:bg-primary', className)}
    {...props}>
    <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current">
      <Check className="size-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
}

export { Checkbox }
