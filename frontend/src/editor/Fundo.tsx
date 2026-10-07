import { createContext, useContext, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Os fundos atrás dos inserts com moldura (SPEC §8.4): 3 claros e 2 escuros. A **chuva** é o fundo do Overview do design
 *  system da Asimov, reproduzido com os arquivos originais (em `public/fundos/aura/`): a cena do Unicorn Studio (arco de
 *  luz e riscos de chuva) em mix-blend screen com o filtro do tema teal, por baixo da paisagem a 30% e dos degradês. Na
 *  prévia e na exportação ela toca como vídeo (`chuva.mp4`, um loop de 12 s gravado da cena ao vivo, quadro a quadro). */
export const FUNDOS: { id: string; nome: string; claro: boolean; amostra: string }[] = [
  { id: 'verde_claro', nome: 'Verde claro', claro: true, amostra: 'linear-gradient(180deg,#dfe8e1 0%,#a9c6b3 55%,#6f9c84 100%)' },
  { id: 'papel', nome: 'Papel', claro: true, amostra: 'radial-gradient(120% 90% at 50% 40%,#f1ecdd 0%,#e4dcc7 70%,#d6ccb3 100%)' },
  { id: 'nevoa', nome: 'Névoa azul', claro: true, amostra: 'linear-gradient(180deg,#d9d6e2 0%,#a9b2c7 45%,#8a97ad 75%,#c8ccd8 100%)' },
  { id: 'chuva', nome: 'Chuva', claro: false, amostra: 'radial-gradient(90% 70% at 50% 40%,#0c3b35 0%,#06201c 55%,#050505 100%)' },
  { id: 'gradiente', nome: 'Gradiente escuro', claro: false, amostra: 'radial-gradient(85% 70% at 50% 45%,#24423b 0%,#13201d 60%,#0b1412 100%)' },
]

type Cena = { destroy: () => void }
type Unicorn = { addScene: (o: Record<string, unknown>) => Promise<Cena> }

let carregando: Promise<void> | null = null
/** Carrega uma vez o runtime do Unicorn Studio e a cena local (nenhum fetch remoto), como no design system. */
function carregarAura(): Promise<void> {
  if (carregando) return carregando
  const script = (src: string) =>
    new Promise<void>((ok, falha) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = () => ok()
      s.onerror = () => falha(new Error(`não carregou ${src}`))
      document.head.appendChild(s)
    })
  carregando = Promise.all([script('/fundos/aura/unicornStudio.umd.js'), script('/fundos/aura/aura-scene.js')]).then(() => {
    if (document.getElementById('asimov-aura-scene')) return
    const json = document.createElement('script')
    json.type = 'application/json'
    json.id = 'asimov-aura-scene'
    json.textContent = JSON.stringify((window as unknown as { AsimovAuraScene: unknown }).AsimovAuraScene)
    document.head.appendChild(json)
  })
  return carregando
}

/** O relógio da exportação (s): com ele, vídeos e animações mostram exatamente esse instante, parados. */
export const RelogioRender = createContext<number | null>(null)

/** A cena ao vivo (só para gravar o `chuva.mp4`; `fps` alto para a gravação quadro a quadro não pular nenhum). */
export function ChuvaAoVivo({ fps = 30 }: { fps?: number }) {
  const alvo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cena: Cena | null = null
    let vivo = true
    void carregarAura().then(async () => {
      const us = (window as unknown as { UnicornStudio?: Unicorn }).UnicornStudio
      if (!vivo || !alvo.current || !us) return
      // mesmos parâmetros do design system: cena local pelo id do JSON, dpi 1, 30 fps, sem mouse
      const c = await us.addScene({
        element: alvo.current, filePath: 'asimov-aura-scene', dpi: 1, fps, scale: 1, production: true, lazyLoad: false,
        fixed: false, interactivity: { mouse: { disabled: true } },
      })
      if (vivo) cena = c
      else c.destroy()
    })
    return () => {
      vivo = false
      cena?.destroy()
    }
  }, [fps])
  return (
    <div className="absolute inset-0 bg-[#050505]">
      {/* a cena do Unicorn Studio, com o filtro do tema teal (o mesmo do Overview) */}
      <div className="absolute inset-0 mix-blend-screen saturate-50" style={{ filter: 'hue-rotate(-102deg) saturate(93%) brightness(0.96)' }}>
        <div ref={alvo} className="absolute inset-0" />
      </div>
      {/* paisagem a 30% e os degradês por cima, como no Overview */}
      <div className="absolute inset-0">
        <img src="/fundos/aura/landscape-1280.webp" alt="" className="size-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/90 via-[#050505]/60 to-[#050505]" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, color-mix(in srgb, #0d9488 16%, transparent), transparent 72%)' }} />
      </div>
    </div>
  )
}

function ChuvaEmVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const relogio = useContext(RelogioRender)
  // na exportação: parado no instante do relógio (o loop dá a volta)
  const aplicar = () => {
    const v = ref.current
    if (!v || relogio == null || !v.duration) return
    v.pause()
    const alvo = relogio % v.duration
    if (Math.abs(v.currentTime - alvo) > 0.001) v.currentTime = alvo
  }
  useEffect(aplicar, [relogio]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <video ref={ref} src="/fundos/aura/chuva.mp4" autoPlay={relogio == null} loop muted playsInline preload="auto" onLoadedMetadata={aplicar} className="absolute inset-0 size-full object-cover" />
  )
}

export default function Fundo({ id, className }: { id: string; className?: string }) {
  const f = FUNDOS.find((x) => x.id === id) ?? FUNDOS[4]
  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)} style={{ background: f.id === 'chuva' ? '#050505' : f.amostra }}>
      {f.id === 'chuva' && <ChuvaEmVideo />}
      {f.id === 'nevoa' && (
        // névoa: manchas desfocadas, como no fundo de referência
        <>
          <div className="absolute -top-[10%] -left-[20%] h-[55%] w-[90%] rounded-full bg-[#eae6f0] opacity-70 blur-3xl" />
          <div className="absolute top-[40%] -right-[25%] h-[45%] w-[80%] rounded-full bg-[#6f7f99] opacity-50 blur-3xl" />
        </>
      )}
    </div>
  )
}
