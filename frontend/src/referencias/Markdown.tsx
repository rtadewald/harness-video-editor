import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Markdown simples para ler a heurística: títulos (# a ####), listas (-), parágrafos, **negrito**, *itálico* e links.
 *  Links `exemplo:ref/plano` viram botões (quem usa decide o que fazer ao clicar). */
export default function Markdown({ texto, exemplo }: { texto: string; exemplo: (id: string, rotulo: string) => ReactNode }) {
  const blocos: ReactNode[] = []
  let lista: string[] = []
  const fecharLista = () => {
    if (lista.length) {
      blocos.push(
        <ul key={`l${blocos.length}`} className="my-2 grid list-disc gap-1.5 pl-5">
          {lista.map((l, k) => (
            <li key={k}>{inline(l, exemplo)}</li>
          ))}
        </ul>,
      )
      lista = []
    }
  }
  for (const linha of texto.split('\n')) {
    const t = linha.trim()
    if (/^[-*] /.test(t)) {
      lista.push(t.slice(2))
      continue
    }
    fecharLista()
    if (!t) continue
    const h = /^(#{1,4}) (.*)$/.exec(t)
    if (h) {
      const nivel = h[1].length
      blocos.push(
        <p
          key={blocos.length}
          className={cn(
            nivel === 1 && 'mt-1 text-[22px] font-semibold tracking-[-0.03em]',
            nivel === 2 && 'mt-6 border-b border-line-dark pb-1.5 text-[16px] font-semibold tracking-[-0.02em] text-yellow',
            nivel === 3 && 'mt-4 text-[14px] font-semibold',
            nivel === 4 && 'mt-3 text-[11px] font-semibold tracking-[0.08em] text-sage uppercase',
          )}
        >
          {inline(h[2], exemplo)}
        </p>,
      )
    } else {
      blocos.push(
        <p key={blocos.length} className="my-1">
          {inline(t, exemplo)}
        </p>,
      )
    }
  }
  fecharLista()
  return <div className="text-[13px] leading-[1.7] text-cream/90">{blocos}</div>
}

function inline(texto: string, exemplo: (id: string, rotulo: string) => ReactNode): ReactNode[] {
  const partes: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*/g
  let ultimo = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index))
    if (m[1] != null) partes.push(<b key={m.index} className="font-semibold text-cream">{m[1]}</b>)
    else if (m[4] != null) partes.push(<i key={m.index}>{m[4]}</i>)
    else if (m[3].startsWith('exemplo:')) partes.push(<span key={m.index}>{exemplo(m[3].slice(8), m[2])}</span>)
    else partes.push(m[2])
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return partes
}
