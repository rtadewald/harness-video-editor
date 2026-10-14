/** O desenho dos elementos (as medidas e o estilo em `elementos.ts`, portados do 19). */
import type { CSSProperties, ReactNode } from 'react'
import { urlBancoMiniatura, type ItemBanco } from '@/api'
import { limite01 } from '@/presets/curvas'
import {
  AVIAO,
  BARRA,
  CAIXINHA,
  DESFOQUE,
  DIGITAR,
  FONTE,
  MONO,
  POP,
  SOMBRA_TEXTO,
  TAM,
  caberEm,
  digitacao,
  lettering,
  medidasCaixinha,
  medidasPrint,
  queixo,
  yBarra,
  type Elemento,
} from './elementos'

const pop = (rel: number) => {
  const p = POP.curva(limite01(rel / POP.dur))
  return { escala: POP.escala + (1 - POP.escala) * p, opacidade: p }
}
const centrado = (y: number, rel: number): CSSProperties => {
  const p = pop(rel)
  return { position: 'absolute', left: '50%', top: `${y * 100}%`, transform: `translate(-50%, -50%) scale(${p.escala})`, opacity: p.opacidade }
}
const estiloLettering = (tam: number): CSSProperties => ({
  fontFamily: FONTE,
  fontWeight: 700,
  fontSize: `${tam.toFixed(3)}cqh`,
  lineHeight: 1.08,
  color: '#fff',
  textAlign: 'center',
  whiteSpace: 'pre',
  textShadow: SOMBRA_TEXTO,
})

function LetteringNoAtor({ e, rel }: { e: Elemento; rel: number }) {
  const { tam, texto } = lettering(e.texto ?? '', TAM.grande)
  const y = Math.min(Math.max(queixo(e.lugar) + 0.08, 0.5), 0.6)
  return <div style={{ ...centrado(y, rel), ...estiloLettering(tam) }}>{texto}</div>
}

function LetteringNoInsert({ e, rel }: { e: Elemento; rel: number }) {
  const { modo, f } = e.lugar
  const y = modo === 'metade' ? f / 2 : modo === 'atras' ? Math.min(f, 0.72) / 2 : 0.3
  const { tam, texto } = lettering(e.texto ?? '', TAM.insert)
  const p = pop(rel).opacidade
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          ...(modo === 'metade' ? { left: 0, right: 0, top: 0, height: `${f * 100}%` } : { inset: 0 }),
          backdropFilter: `blur(${(DESFOQUE.raio * p).toFixed(3)}cqw) brightness(${1 - DESFOQUE.escurece * p})`,
        }}
      />
      <div style={{ ...centrado(y, rel), ...estiloLettering(tam) }}>{texto}</div>
    </div>
  )
}

function Manychat({ e, rel }: { e: Elemento; rel: number }) {
  const d = digitacao(e)
  const letras = [...(e.texto ?? '')]
  const n = rel < d.ini ? 0 : Math.min(letras.length, Math.floor(((rel - d.ini) / d.dur) * letras.length) + 1)
  const digitando = rel < d.ini + d.dur
  const toque = rel - d.ini - d.dur
  const escala = toque < 0 ? 1 : 0.9 + 0.1 * POP.curva(limite01(toque / DIGITAR.toque))
  const botao = BARRA.h * 0.9 * 100
  return (
    <div
      style={{
        ...centrado(yBarra(e.lugar), rel),
        width: `${BARRA.w * 100}cqw`,
        height: `${BARRA.h * 100}cqh`,
        borderRadius: 9999,
        background: 'linear-gradient(180deg, #fbfbfb 0%, #f3f3f3 55%, #e8e8e8 100%)',
        boxShadow: '0 0.5cqh 1.6cqh rgba(0,0,0,0.28), 0 0.1cqh 0.3cqh rgba(0,0,0,0.2), inset 0 -0.15cqh 0.3cqh rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          left: `${(BARRA.texto - (1 - BARRA.w) / 2) * 100}cqw`,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          fontFamily: FONTE,
          fontWeight: 400,
          fontSize: `${TAM.manychat.toFixed(3)}cqh`,
          color: '#2a2a2a',
          whiteSpace: 'pre',
        }}
      >
        <span>{letras.slice(0, n).join('')}</span>
        {digitando && <span style={{ width: '0.3cqw', height: '1.15em', marginLeft: '0.2cqw', background: '#2a2a2a', borderRadius: '0.2cqw' }} />}
      </div>
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          borderRadius: 9999,
          right: `${(BARRA.h * 100 - botao) / 2}cqh`,
          top: '50%',
          width: `${botao}cqh`,
          height: `${botao}cqh`,
          transform: `translateY(-50%) scale(${escala})`,
          background: '#151515',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src={AVIAO} alt="" style={{ width: '48%', height: '48%', transform: 'translate(-6%, 6%)' }} />
      </div>
    </div>
  )
}

function Caixinha({ e, rel }: { e: Elemento; rel: number }) {
  const m = medidasCaixinha(e)
  return (
    <div
      style={{
        ...centrado(m.y, rel),
        overflow: 'hidden',
        background: '#fff',
        width: `${CAIXINHA.w * 100}cqw`,
        borderRadius: '3.4cqw',
        boxShadow: '0 1cqh 3cqh rgba(0,0,0,0.3), 0 0.2cqh 0.6cqh rgba(0,0,0,0.18)',
        fontFamily: FONTE,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          padding: `${CAIXINHA.padCab}cqh 4cqw`,
          background: 'linear-gradient(90deg, #f58529 0%, #dd2a7b 45%, #8134af 78%, #515bd4 100%)',
          color: '#fff',
          fontWeight: 500,
          fontSize: `${CAIXINHA.cabecalho}cqh`,
          lineHeight: 1.2,
        }}
      >
        Faça uma pergunta
      </div>
      <div style={{ padding: `${CAIXINHA.pad}cqh 5cqw`, color: '#000', fontWeight: 600, fontSize: `${CAIXINHA.pergunta}cqh`, lineHeight: 1.25, whiteSpace: 'pre' }}>
        {m.linhas.join('\n')}
      </div>
    </div>
  )
}

/** O print sobreposto: a mídia do banco num card (a miniatura, parada); sem mídia, uma etiqueta mono com o texto. */
function Print({ e, rel, banco }: { e: Elemento; rel: number; banco: Map<string, ItemBanco> }) {
  const item = e.banco ? banco.get(e.banco) : undefined
  const m = medidasPrint(e, item)
  if (item)
    return (
      <div style={{ ...centrado(m.y, rel), overflow: 'hidden', width: `${m.w * 100}cqw`, height: `${m.h * 100}cqh`, borderRadius: '2.2cqw', background: '#111', boxShadow: '0 1cqh 3cqh rgba(0,0,0,0.35)' }}>
        <img src={urlBancoMiniatura(item.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  if (!e.texto) return null
  return (
    <div
      style={{
        ...centrado(m.y, rel),
        padding: '1.2cqh 3.2cqw',
        borderRadius: '1.8cqw',
        background: 'rgba(14,14,14,0.62)',
        boxShadow: '0 0.6cqh 2cqh rgba(0,0,0,0.3), inset 0 0 0 0.12cqw rgba(255,255,255,0.14)',
        fontFamily: MONO,
        fontWeight: 500,
        fontSize: `${caberEm(e.texto, 2.6, 0.84, 500).toFixed(3)}cqh`,
        lineHeight: 1.2,
        color: '#fff',
        whiteSpace: 'pre',
      }}
    >
      {e.texto}
    </div>
  )
}

/** Os elementos na tela no instante `t` (dentro do palco, acima dos inserts, motions e do card do comentário). */
export default function ElementosNoPalco(p: { elementos: Elemento[]; tempo: number; banco: Map<string, ItemBanco> }) {
  const agora = p.elementos.filter((e) => e.inicio <= p.tempo && p.tempo < e.fim)
  if (!agora.length) return null
  const filhos: ReactNode[] = agora.map((e) => {
    const rel = p.tempo - e.inicio
    if (e.tipo === 'full_ator_lettering' || (e.tipo === 'lettering' && e.lugar.modo === 'ator')) return <LetteringNoAtor key={e.id} e={e} rel={rel} />
    if (e.tipo === 'lettering') return <LetteringNoInsert key={e.id} e={e} rel={rel} />
    if (e.tipo === 'palavra_manychat') return <Manychat key={e.id} e={e} rel={rel} />
    if (e.tipo === 'caixinha_perguntas') return <Caixinha key={e.id} e={e} rel={rel} />
    if (e.tipo === 'print_sobreposto') return <Print key={e.id} e={e} rel={rel} banco={p.banco} />
    return null
  })
  return (
    <div className="pointer-events-none absolute inset-0 select-none" style={{ containerType: 'size', zIndex: 20 }}>
      {filhos}
    </div>
  )
}
