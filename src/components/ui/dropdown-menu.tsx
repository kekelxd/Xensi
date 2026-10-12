import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Menus share the Select surface (popover token, 8px radius, z-index above dialogs).
function DropdownMenu(props: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      data-slot="dropdown-menu-content"
      sideOffset={sideOffset}
      align={align}
      className={cn('z-[1100] min-w-44 overflow-hidden rounded-lg border border-solid border-input bg-popover p-1 font-sans text-popover-foreground shadow-[0_24px_60px_-24px_rgba(4,5,8,.9)] outline-none', className)}
      {...props} />
  </DropdownMenuPrimitive.Portal>
}

function DropdownMenuItem({ className, variant = 'default', ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: 'default' | 'destructive' }) {
  return <DropdownMenuPrimitive.Item
    data-slot="dropdown-menu-item"
    data-variant={variant}
    className={cn('relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-foreground outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-foreground/[.06] data-[variant=destructive]:text-destructive [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[variant=destructive]:[&_svg]:text-destructive', className)}
    {...props} />
}

function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger }
