import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/* Botões do Otto: canto 3px, peso 600; o creme "salta" em amarelo no hover, a tinta vira azul. */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-[3px] border border-transparent text-[13px] font-semibold whitespace-nowrap select-none outline-none transition-[background,color,transform,box-shadow,border-color] duration-300 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-cream hover:bg-blue",
        cream: "bg-cream text-ink hover:-translate-y-[3px] hover:bg-yellow hover:shadow-[0_7px_0_#182d2a16]",
        coral: "bg-coral text-cream hover:-translate-y-[3px] hover:bg-yellow hover:text-ink hover:shadow-[0_7px_0_#182d2a16]",
        outline: "border-line bg-transparent hover:border-ink",
        pill: "rounded-full border-current/25 bg-transparent hover:border-current",
        ghost: "hover:bg-current/8",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
        link: "underline underline-offset-4",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-8 px-3 text-xs",
        lg: "h-14 px-6 text-sm",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
