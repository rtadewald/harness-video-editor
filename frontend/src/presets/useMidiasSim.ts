import { useEffect, useState } from 'react'
import { abrirProjeto, listarBanco, listarProjetos, urlArquivo, urlBancoArquivo } from '@/api'
import type { MidiasSim } from '@/editor/Simulacao'

/** Os vídeos para as simulações: do banco, separados pela proporção, e o ator (o projeto mais recente: o proxy do bruto e,
 *  se já recortado, só a pessoa). */
export function useMidiasSim(): MidiasSim | null {
  const [m, setM] = useState<MidiasSim | null>(null)
  useEffect(() => {
    void (async () => {
      const banco = await listarBanco('', 'video').catch(() => [])
      const de = (f: (a: number) => boolean) => banco.filter((i) => i.largura && i.altura && f(i.largura / i.altura)).map((i) => urlBancoArquivo(i.id))
      let ator: MidiasSim['ator'] = null
      const [prj] = await listarProjetos().catch(() => [])
      if (prj) {
        const p = await abrirProjeto(prj.id).catch(() => null)
        const b = p?.fontes.find((f) => f.papel === 'bruto')
        if (p && b)
          ator = {
            video: urlArquivo(p.id, `midia/proxy/${b.id}.mp4`),
            pessoa: p.recorte?.estado === 'pronto' ? urlArquivo(p.id, `midia/recorte/${b.id}_pessoa.webm`) : null,
          }
      }
      setM({ pe: de((a) => a < 0.8), h43: de((a) => a >= 1.2 && a < 1.5), h169: de((a) => a >= 1.5), ator })
    })()
  }, [])
  return m
}
