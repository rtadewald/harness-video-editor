import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 py-2 file:mr-3 file:h-7 file:rounded-full file:border file:border-line file:bg-cream file:px-3 file:text-xs file:font-semibold file:text-ink w-full min-w-0 rounded-[3px] border border-line bg-white px-3.5 text-[13px] text-ink transition-colors outline-none placeholder:text-[#8a958e] focus-visible:border-ink disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
