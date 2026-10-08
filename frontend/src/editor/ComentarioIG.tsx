import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

/** O card de comentário do Instagram (plano Comentário + insert + ator; SPEC §8.3): foto, usuário e tempo borrados,
 *  o texto, "Responder" e "Ver tradução". Fonte do sistema da Apple (a que o Instagram usa no iPhone). */
export type Comentario = { texto: string | null; avatar: number; usuario: string; tempo: string; traducao: boolean; x: number; y: number; escala: number }
export const COMENTARIO_PADRAO: Comentario = { texto: null, avatar: 0, usuario: 'usuario.do.ig', tempo: '4 sem', traducao: true, x: 50, y: 50, escala: 1 }
/** O comentário do insert; sem posição salva (nunca arrastado), fica no lugar automático da divisão (`auto`). */
export const comentarioDe = (x: { comentario?: Partial<Comentario> }, auto?: { x: number; y: number }): Comentario => ({
  ...COMENTARIO_PADRAO,
  ...(auto ?? {}),
  ...(x.comentario ?? {}),
})

const FONTE_IG = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", "Helvetica Neue", system-ui, sans-serif'

// 5 fotos de perfil de pessoas que não existem (rostos gerados por IA, thispersondoesnotexist.com), em `public/avatares/`
export function Avatar({ n, borrado = true, className, tamanho }: { n: number; borrado?: boolean; className?: string; tamanho?: string }) {
  return (
    <img
      src={`/avatares/${(n % 5) + 1}.jpg`}
      alt=""
      draggable={false}
      className={cn('rounded-full object-cover', className)}
      style={{ ...(borrado ? { filter: 'blur(2.5px)' } : {}), ...(tamanho ? { width: tamanho, height: tamanho } : {}) }}
    />
  )
}

/** O card na prévia (centro em `x`, `y` %; largura 75% × escala). Editável no próprio vídeo: clicar seleciona, arrastar
 *  move, a alça do canto muda o tamanho; clicar fora tira a seleção. */
export function CardComentario({ c, texto, mudar }: { c: Comentario; texto: string; mudar?: (campos: Partial<Comentario>) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState(false)
  useEffect(() => {
    if (!sel) return
    const fora = (e: PointerEvent) => !card.current?.contains(e.target as Node) && setSel(false)
    window.addEventListener('pointerdown', fora)
    return () => window.removeEventListener('pointerdown', fora)
  }, [sel])
  const segue = (mover: (ev: PointerEvent) => void) => {
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  const mover = (e: React.PointerEvent) => {
    if (!mudar) return
    e.stopPropagation()
    e.preventDefault()
    setSel(true)
    const r = caixa.current!.getBoundingClientRect()
    const dx = e.clientX - (r.left + (c.x / 100) * r.width)
    const dy = e.clientY - (r.top + (c.y / 100) * r.height)
    segue((ev) =>
      mudar({
        x: Math.round(Math.max(5, Math.min(95, ((ev.clientX - dx - r.left) / r.width) * 100))),
        y: Math.round(Math.max(5, Math.min(95, ((ev.clientY - dy - r.top) / r.height) * 100))),
      }),
    )
  }
  const redimensionar = (e: React.PointerEvent) => {
    if (!mudar) return
    e.stopPropagation()
    e.preventDefault()
    const r = caixa.current!.getBoundingClientRect()
    const centro = r.left + (c.x / 100) * r.width
    // a largura acompanha a distância do mouse ao centro do card (75% da tela = tamanho 100%)
    segue((ev) => mudar({ escala: Math.round(Math.max(0.6, Math.min(1.3, (Math.abs(ev.clientX - centro) * 2) / (r.width * 0.75))) * 100) / 100 }))
  }
  const u = (v: number) => `${v * c.escala}cqw` // medidas proporcionais à largura do vídeo
  return (
    <div ref={caixa} className="pointer-events-none absolute inset-0 z-10" style={{ containerType: 'size' }}>
      <div
        ref={card}
        onPointerDown={mover}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute flex -translate-x-1/2 -translate-y-1/2 items-start bg-white text-black shadow-[0_6px_24px_#0005] select-none',
          mudar && 'pointer-events-auto cursor-move',
          sel && 'outline-2 outline-offset-2 outline-yellow',
        )}
        style={{ left: `${c.x}%`, top: `${c.y}%`, fontFamily: FONTE_IG, gap: u(2.6), padding: `${u(2.6)} ${u(3.2)}`, borderRadius: u(3), width: `${Math.min(75 * c.escala, 96)}%` }}
        title={mudar ? 'Arraste para mover; a alça do canto muda o tamanho' : undefined}
      >
        <Avatar n={c.avatar} className="shrink-0" tamanho={u(8.2)} />
        <div className="min-w-0 flex-1" style={{ lineHeight: 1.3 }}>
          <div className="flex items-baseline" style={{ gap: u(1.6), fontSize: u(2.9), filter: `blur(${u(0.55)})` }}>
            <span className="font-semibold text-[#262626]">{c.usuario}</span>
            <span className="text-[#737373]">{c.tempo}</span>
          </div>
          <p className="text-[#000] [overflow-wrap:anywhere]" style={{ fontSize: u(3.6), marginTop: u(0.4) }}>
            {texto}
          </p>
          <div className="flex font-semibold text-[#737373]" style={{ gap: u(4), fontSize: u(2.9), marginTop: u(1.2) }}>
            <span>Responder</span>
            {c.traducao && <span>Ver tradução</span>}
          </div>
        </div>
        {sel && (
          <span
            onPointerDown={redimensionar}
            className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-yellow shadow"
            title="Arraste para mudar o tamanho"
          />
        )}
      </div>
    </div>
  )
}

/** A configuração do card: só o texto e a foto (posição e tamanho se ajustam no próprio vídeo). */
export function PainelComentario(p: { c: Comentario; textoDirecao: string; mudar: (campos: Partial<Record<keyof Comentario, string | number | boolean | null>>) => void }) {
  const { c } = p
  const campo = 'w-full rounded-[4px] border border-line-dark bg-deeper px-2.5 py-1.5 text-[12.5px] text-cream outline-none focus:border-cream/50'
  return (
    <div className="grid gap-4 text-[12px]">
      <label className="grid gap-1.5">
        <span className="eyebrow text-sage">Texto</span>
        <textarea
          key={c.texto ?? p.textoDirecao}
          defaultValue={c.texto ?? p.textoDirecao}
          rows={4}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v !== (c.texto ?? p.textoDirecao)) p.mudar({ texto: v === p.textoDirecao ? null : v })
          }}
          className={cn(campo, 'resize-y leading-[1.5]')}
        />
        {c.texto != null && (
          <button onClick={() => p.mudar({ texto: null })} className="flex w-fit items-center gap-1 text-[11px] text-fog hover:text-cream">
            <RotateCcw className="size-3" /> Voltar ao texto da direção
          </button>
        )}
      </label>

      <button onClick={() => p.mudar({ x: null, y: null })} className="flex w-fit items-center gap-1 text-[11px] text-fog hover:text-cream" title="Volta para o lugar que a divisão da tela escolhe">
        <RotateCcw className="size-3" /> Posição automática
      </button>
      <div className="grid gap-1.5">
        <span className="eyebrow text-sage">Foto (vai borrada)</span>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => p.mudar({ avatar: n })}
              className={cn('rounded-full p-0.5 ring-2 transition-shadow', c.avatar === n ? 'ring-coral' : 'ring-transparent hover:ring-cream/40')}
              aria-label={`Foto ${n + 1}`}
            >
              <Avatar n={n} borrado={false} className="size-9" />
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] leading-[1.6] text-fog">Posição e tamanho: clique no comentário no vídeo, arraste para mover e use a alça do canto.</p>
    </div>
  )
}
