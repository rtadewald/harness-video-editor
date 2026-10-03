import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 py-3 leading-[1.7] w-full min-w-0 rounded-[3px] border border-line bg-white px-3.5 text-[13px] text-ink transition-colors outline-none placeholder:text-[#8a958e] focus-visible:border-ink disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
