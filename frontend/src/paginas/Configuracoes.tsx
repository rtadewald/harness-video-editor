import { useEffect, useState, type ReactNode } from 'react'
import { lerConfig, salvarConfig, type Config } from '@/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type CampoNumerico = 'antes_do_corte_ms' | 'depois_do_corte_ms' | 'pausa_max_ms' | 'respiro_ms'

/** O que cada aba recebe: a configuração atual e como salvar. Tudo é salvo na hora, como padrão do app. */
type Contexto = {
  config: Config | null
  escolherMotor: (motor: string) => void
  salvarNumero: (campo: CampoNumerico, valor: string, escala?: number) => void
  salvar: (mudancas: Parameters<typeof salvarConfig>[0]) => void
}

/** Categorias de configuração, uma aba cada. Quando Inserts, Motion e Legenda tiverem configurações próprias,
 *  entram aqui como mais uma linha. */
const CATEGORIAS: { id: string; nome: string; render: (c: Contexto) => ReactNode }[] = [
  { id: 'cortes', nome: 'Cortes', render: (c) => <AbaCortes {...c} /> },
  { id: 'direcao', nome: 'Direção visual', render: (c) => <AbaDirecao {...c} /> },
]

/** Preferências do app. Cada mudança é gravada no ato (projetos/_config.json) e vale para os próximos cálculos e projetos. */
export default function Configuracoes({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [aba, setAba] = useState(CATEGORIAS[0].id)

  useEffect(() => {
    if (!aberto) return
    setSalvo(false)
    setErro('')
    lerConfig().then(setConfig).catch((e) => setErro(e.message))
  }, [aberto])

  async function salvar(mudancas: Parameters<typeof salvarConfig>[0]) {
    setErro('')
    try {
      setConfig(await salvarConfig(mudancas))
      setSalvo(true)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  const contexto: Contexto = {
    config,
    escolherMotor: (motor) => salvar({ motor_padrao: motor }),
    salvar: (mudancas) => void salvar(mudancas),
    salvarNumero: (campo, valor, escala = 1) => {
      if (!valor.trim()) return // campo vazio: não salva (virar 0 desligaria o corte de pausas sem querer)
      const ms = Math.round(Number(valor.replace(',', '.')) * escala)
      if (!Number.isFinite(ms) || ms < 0 || (config && ms === config[campo])) return
      void salvar({ [campo]: ms })
    },
  }
  const atual = CATEGORIAS.find((c) => c.id === aba) ?? CATEGORIAS[0]

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <p className="eyebrow text-[#56625d]">Configurações</p>
          <DialogTitle>Padrões do app.</DialogTitle>
          <DialogDescription>Cada mudança é salva na hora como padrão. As abas agrupam as configurações por etapa.</DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="Categorias de configuração" className="flex gap-1.5">
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === atual.id}
              onClick={() => setAba(c.id)}
              className={cn(
                'rounded-full border px-4 py-2 text-[12px] font-semibold transition-colors',
                c.id === atual.id ? 'border-ink bg-ink text-cream' : 'border-line hover:border-ink',
              )}
            >
              {c.nome}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="grid gap-5">
          {atual.render(contexto)}
        </div>

        <div className="min-h-5 text-[12px]">
          {erro && <p className="text-destructive">{erro}</p>}
          {!erro && salvo && <p className="text-[#52745b]">✓ Salvo como padrão do app. Vale também depois de reiniciar.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Tudo o que define como o vídeo é cortado: quem transcreve, o ar junto às palavras e o que fazer com pausas longas. */
function AbaCortes({ config, escolherMotor, salvarNumero }: Contexto) {
  const atual = config?.motores[config.motor_padrao]
  return (
    <>
      <Grupo titulo="Motor de transcrição" texto="Quem transcreve o áudio de cada projeto novo. Os outros motores continuam rodando em segundo plano, e dá para trocar de motor dentro de qualquer projeto.">
        <Label htmlFor="motor-padrao">Padrão para novos projetos</Label>
        <select
          id="motor-padrao"
          value={config?.motor_padrao ?? ''}
          onChange={(e) => escolherMotor(e.target.value)}
          disabled={!config}
          className="h-11 rounded-[3px] border border-line bg-white px-3.5 text-[13px] text-ink outline-none focus-visible:border-ink"
        >
          {config &&
            Object.entries(config.motores).map(([vid, m]) => (
              <option key={vid} value={vid}>
                {m.nome}
                {m.chave === false ? ' — sem chave de API' : ''}
              </option>
            ))}
        </select>
        {atual?.chave === false && (
          <p className="text-[12px] leading-[1.6] text-[#c4502f]">
            Este motor precisa de uma chave de API em <b>backend/.env</b> (e envia o áudio da sua voz a um serviço externo). Sem a chave, o projeto segue com Whisper + stable-ts e avisa o motivo.
          </p>
        )}
        {atual?.chave === true && <p className="text-[12px] text-[#52745b]">Chave de API encontrada. O áudio é enviado ao serviço externo.</p>}
      </Grupo>

      <Grupo
        titulo="Margens do corte"
        texto="Quanto áudio fica junto das palavras em cada ponto de corte. O corte cai dentro de uma pausa real do áudio (e nunca invade a palavra removida ao lado); a margem é o quanto dessa pausa fica com a palavra mantida, no máximo a pausa inteira. Vale para cortes novos, para “Refazer” e para “Recalcular” no editor."
      >
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero
            rotulo="Antes do corte"
            dica="Ar que fica DEPOIS da última palavra de cada trecho mantido"
            valor={config?.antes_do_corte_ms}
            aoSalvar={(v) => salvarNumero('antes_do_corte_ms', v)}
          />
          <CampoNumero
            rotulo="Depois do corte"
            dica="Ar que fica ANTES da primeira palavra do trecho seguinte"
            valor={config?.depois_do_corte_ms}
            aoSalvar={(v) => salvarNumero('depois_do_corte_ms', v)}
          />
        </div>
      </Grupo>

      <Grupo
        titulo="Pausas longas"
        texto="Uma pausa no meio de um trecho que você manteria só é cortada se for mais longa que o limite abaixo, e então sobra o “respiro”. Pausas menores ficam como foram faladas. O detector só enxerga silêncios de pelo menos 0,3 s."
      >
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero
            rotulo="Cortar pausas maiores que"
            dica="0 = nunca cortar pausas dentro de um trecho"
            unidade="s"
            escala={1000}
            passo={0.1}
            maximo={30}
            valor={config?.pausa_max_ms}
            aoSalvar={(v) => salvarNumero('pausa_max_ms', v, 1000)}
          />
          <CampoNumero
            rotulo="Deixar de pausa"
            dica="O que sobra de uma pausa cortada"
            unidade="s"
            escala={1000}
            passo={0.1}
            maximo={5}
            valor={config?.respiro_ms}
            aoSalvar={(v) => salvarNumero('respiro_ms', v, 1000)}
          />
        </div>
      </Grupo>
    </>
  )
}

/** Como as referências são analisadas: o modelo multimodal e quantos quadros por segundo ele vê de cada trecho. */
function AbaDirecao({ config, salvar }: Contexto) {
  return (
    <>
      <Grupo
        titulo="Modelo multimodal"
        texto="Quem olha os quadros de cada trecho das referências e diz o plano, os elementos, o que aparece e a função. Qualquer modelo de visão do OpenRouter (nome como em openrouter.ai, ex.: google/gemini-3.8-flash). Trocar o modelo faz a próxima análise refazer os trechos."
      >
        <Label htmlFor="modelo-direcao">Modelo</Label>
        <input
          id="modelo-direcao"
          key={config?.modelo_direcao}
          defaultValue={config?.modelo_direcao}
          disabled={!config}
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== config?.modelo_direcao && salvar({ modelo_direcao: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-11 rounded-[3px] border border-line bg-white px-3.5 font-mono text-[12px] text-ink outline-none focus-visible:border-ink"
        />
      </Grupo>
      <Grupo
        titulo="Quadros por segundo"
        texto="Quantos quadros de cada trecho o modelo vê. Mais quadros acham letterings rápidos com mais precisão, mas custam proporcionalmente mais. Trechos longos são amostrados com no máximo 40 quadros. Trocar faz a próxima análise refazer os trechos."
      >
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => salvar({ quadros_por_segundo: n })}
              disabled={!config}
              className={cn(
                'h-10 w-14 rounded-full border text-[13px] font-semibold',
                config?.quadros_por_segundo === n ? 'border-ink bg-ink text-cream' : 'border-line hover:border-ink',
              )}
            >
              {n}/s
            </button>
          ))}
        </div>
      </Grupo>
      <Grupo
        titulo="Como os quadros vão"
        texto="Separados: cada quadro é uma imagem, todos na mesma requisição (melhor para ler detalhes). Mosaico: 6 quadros por imagem, com o tempo escrito em cada um (~2,4× mais barato, cada quadro fica menor). Trocar faz a próxima análise refazer os trechos."
      >
        <div className="flex gap-1.5">
          {(['separados', 'mosaico'] as const).map((f) => (
            <button
              key={f}
              onClick={() => salvar({ formato_quadros: f })}
              disabled={!config}
              className={cn(
                'h-10 rounded-full border px-4 text-[13px] font-semibold',
                config?.formato_quadros === f ? 'border-ink bg-ink text-cream' : 'border-line hover:border-ink',
              )}
            >
              {f === 'separados' ? 'Separados' : 'Mosaico'}
            </button>
          ))}
        </div>
      </Grupo>
    </>
  )
}

function Grupo({ titulo, texto, children }: { titulo: string; texto: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div>
        <p className="eyebrow text-[#56625d]">{titulo}</p>
        <p className="mt-1.5 text-[12px] leading-[1.7] text-[#667366]">{texto}</p>
      </div>
      {children}
    </section>
  )
}

/** Campo numérico guardado em ms mas exibido na unidade pedida (ms ou s): salva ao sair do campo ou com Enter. */
function CampoNumero({ rotulo, dica, valor, aoSalvar, unidade = 'ms', escala = 1, passo = 10, maximo = 1000 }: {
  rotulo: string
  dica: string
  valor: number | undefined
  aoSalvar: (v: string) => void
  unidade?: string
  escala?: number
  passo?: number
  maximo?: number
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={rotulo}>{rotulo}</Label>
      <div className="flex items-center gap-2">
        <input
          id={rotulo}
          key={valor}
          type="number"
          min={0}
          max={maximo}
          step={passo}
          defaultValue={valor === undefined ? undefined : valor / escala}
          disabled={valor === undefined}
          onBlur={(e) => aoSalvar(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-11 w-full rounded-[3px] border border-line bg-white px-3.5 text-[13px] text-ink tabular-nums outline-none focus-visible:border-ink"
        />
        <span className="text-[12px] text-[#667366]">{unidade}</span>
      </div>
      <p className="text-[11px] leading-[1.5] text-[#667366]">{dica}</p>
    </div>
  )
}
