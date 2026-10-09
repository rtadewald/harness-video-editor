import { ESTILO, blocoNoTempo, type Bloco } from './legenda'

/** A legenda por cima do palco do player (a mesma conta e o mesmo estilo do ASS da exportação): o bloco do instante,
 *  centralizado, com o centro na altura do tipo de plano; tamanhos em unidades do quadro (cqh). */
export default function CamadaLegenda(p: { blocos: Bloco[]; tempo: number }) {
  const b = blocoNoTempo(p.blocos, p.tempo)
  if (!b) return null
  return (
    <div className="pointer-events-none absolute inset-0 [container-type:size]">
      <span
        className="absolute left-1/2 text-center text-white"
        style={{
          top: `${b.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          maxWidth: `${(1 - 2 * ESTILO.margem) * 100}%`,
          width: 'max-content',
          fontFamily: ESTILO.fonte,
          fontWeight: ESTILO.peso,
          fontSize: `${ESTILO.tamanho * 100}cqh`,
          letterSpacing: ESTILO.espaco,
          lineHeight: 1.15,
          textShadow: `0 ${ESTILO.sombra.y * 100}cqh ${ESTILO.sombra.blur * 100}cqh ${ESTILO.sombra.cor}`,
        }}
      >
        {b.texto}
      </span>
    </div>
  )
}
