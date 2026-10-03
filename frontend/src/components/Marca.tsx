import { cn } from '@/lib/utils'

/** A marca de 4 pétalas do Otto, desenhada em CSS (herda a cor do texto). */
export function Marca({ className }: { className?: string }) {
  const petala = 'bg-current rounded-[45%_45%_12%_45%]'
  return (
    <span aria-hidden="true" className={cn('grid size-9 shrink-0 grid-cols-2 gap-[3px]', className)}>
      <i className={petala} />
      <i className={cn(petala, 'rotate-90')} />
      <i className={cn(petala, '-rotate-90')} />
      <i className={cn(petala, 'rotate-180')} />
    </span>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.07em]">
      <Marca className="size-6 gap-[2px] text-coral" /> harness
    </span>
  )
}
