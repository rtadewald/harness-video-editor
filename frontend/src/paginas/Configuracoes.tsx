import { useEffect, useState, type ReactNode } from 'react'
import { lerConfig, salvarConfig, type Config } from '@/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type CampoNumerico = 'antes_do_corte_ms' | 'depois_do_corte_ms' | 'pausa_max_ms'

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
  { id: 'geral', nome: 'Geral', render: (c) => <AbaGeral {...c} /> },
  { id: 'cortes', nome: 'Cortes', render: (c) => <AbaCortes {...c} /> },
  { id: 'direcao', nome: 'Direção visual', render: (c) => <AbaDirecao {...c} /> },
]

/** Preferências do app. Cada mudança é gravada no ato (dados/projetos/_config.json) e vale para os próximos cálculos e
 *  projetos. `aba`: a etapa em que se está (o id dela); abre na aba dela, se tiver uma, senão em Geral. */
export default function Configuracoes({ aberto, aoFechar, aba: abaInicial }: { aberto: boolean; aoFechar: () => void; aba?: string }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [aba, setAba] = useState(CATEGORIAS[0].id)

  useEffect(() => {
    if (!aberto) return
    setAba(CATEGORIAS.some((c) => c.id === abaInicial) ? abaInicial! : CATEGORIAS[0].id)
    setSalvo(false)
    setErro('')
    lerConfig().then(setConfig).catch((e) => setErro(e.message))
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

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

/** O que vale para o app todo: quem é o criador (contexto para as IAs de cortes e de direção). */
function AbaGeral({ config, salvar }: Contexto) {
  return (
    <Grupo
      titulo="Sobre o criador"
      texto="Quem grava os vídeos e do que o canal fala. Vai como contexto para as IAs (cortes e direção visual), para elas entenderem os termos e o assunto. Opcional; salva ao sair do campo."
    >
      <textarea
        key={config?.perfil_criador}
        defaultValue={config?.perfil_criador}
        disabled={!config}
        rows={4}
        maxLength={1000}
        placeholder="Ex.: Maria Souza, nutricionista; vídeos curtos sobre alimentação e receitas rápidas."
        onBlur={(e) => e.target.value.trim() !== (config?.perfil_criador ?? '') && salvar({ perfil_criador: e.target.value.trim() })}
        className="rounded-[3px] border border-line bg-white px-3.5 py-2.5 text-[13px] leading-[1.6] text-ink outline-none focus-visible:border-ink"
      />
    </Grupo>
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
        texto="Uma pausa no meio de um trecho que você manteria só é cortada se for mais longa que o limite abaixo, e o corte deixa as mesmas margens de antes e depois dos outros cortes. Pausas menores ficam como foram faladas. O detector só enxerga silêncios de pelo menos 0,3 s."
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
        titulo="Modelo multimodal (Calibragem)"
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
        titulo="Diretora (projetos)"
        texto="Quem lê as regras e os roteiros de exemplo e escreve o roteiro dirigido do vídeo novo. Escolhido comparando variações: Gemini 3.8 Flash com raciocínio médio. Nome do modelo como em openrouter.ai."
      >
        <input
          key={config?.modelo_diretora}
          defaultValue={config?.modelo_diretora}
          disabled={!config}
          aria-label="Modelo da diretora"
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== config?.modelo_diretora && salvar({ modelo_diretora: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-11 rounded-[3px] border border-line bg-white px-3.5 font-mono text-[12px] text-ink outline-none focus-visible:border-ink"
        />
        <Opcoes
          valor={config?.raciocinio_diretora}
          opcoes={[['low', 'Raciocínio baixo'], ['medium', 'Médio'], ['high', 'Alto']]}
          aoEscolher={(v) => salvar({ raciocinio_diretora: v as Config['raciocinio_diretora'] })}
          desligado={!config}
        />
      </Grupo>
      <Grupo
        titulo="Modelo da formatadora (projetos)"
        texto="Quem transforma o roteiro da diretora nos campos (tipo, texto, elementos, como gerar) e sugere as regras da heurística. Só texto. Nome como em openrouter.ai."
      >
        <input
          key={config?.modelo_direcao_projeto}
          defaultValue={config?.modelo_direcao_projeto}
          disabled={!config}
          aria-label="Modelo da proposta"
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== config?.modelo_direcao_projeto && salvar({ modelo_direcao_projeto: e.target.value.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-11 rounded-[3px] border border-line bg-white px-3.5 font-mono text-[12px] text-ink outline-none focus-visible:border-ink"
        />
      </Grupo>
      <Grupo
        titulo="Como a IA vê cada trecho"
        texto="Vídeo: o trecho vai como um clipe com áudio e o modelo vê o movimento (padrão; o mais barato, ~1 quadro/s em resolução reduzida). Mosaico: quadros com o tempo escrito, vários por imagem (você escolhe quantos por segundo; enxerga detalhes pequenos melhor, custa mais). Trocar faz a próxima análise refazer os trechos."
      >
        <Opcoes
          valor={config?.formato_analise}
          opcoes={[['video', 'Vídeo'], ['mosaico', 'Mosaico']]}
          aoEscolher={(v) => salvar({ formato_analise: v as Config['formato_analise'] })}
          desligado={!config}
        />
      </Grupo>
      {config?.formato_analise === 'mosaico' && (
        <Grupo titulo="Mosaico" texto="Quantos quadros por imagem (3×2 = 6, cada quadro menor; 3×1 = 3, cada quadro maior) e quantos quadros por segundo do trecho. Trechos longos ficam com no máximo 40 quadros.">
          <Opcoes valor={config.grade_mosaico} opcoes={[['3x2', '3 × 2'], ['3x1', '3 × 1']]} aoEscolher={(v) => salvar({ grade_mosaico: v as Config['grade_mosaico'] })} />
          <Opcoes
            valor={String(config.quadros_por_segundo)}
            opcoes={[['1', '1/s'], ['2', '2/s'], ['3', '3/s'], ['4', '4/s']]}
            aoEscolher={(v) => salvar({ quadros_por_segundo: Number(v) })}
          />
        </Grupo>
      )}
    </>
  )
}

function Opcoes({ valor, opcoes, aoEscolher, desligado }: { valor: string | undefined; opcoes: [string, string][]; aoEscolher: (v: string) => void; desligado?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(([v, nome]) => (
        <button
          key={v}
          onClick={() => aoEscolher(v)}
          disabled={desligado}
          className={cn('h-10 rounded-full border px-4 text-[13px] font-semibold', valor === v ? 'border-ink bg-ink text-cream' : 'border-line hover:border-ink')}
        >
          {nome}
        </button>
      ))}
    </div>
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
