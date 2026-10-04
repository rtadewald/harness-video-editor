# SPEC — Harness Video Editor

Editor de vídeo local, controlado por interface web, em que cada etapa da edição é feita por IA e Rodrigo corrige pela interface ou conversando com um agente. A ideia é um "Premiere próprio", mais automatizado.

**Legenda de status usada neste documento:**
- ✅ **Aprovado:** decidido por Rodrigo.
- 💡 **Proposta:** detalhe técnico sugerido pelo agente, que pode mudar sem nova aprovação, desde que não contradiga o que foi aprovado.
- ⏳ **Em aberto:** ainda não decidido.

**Estado:** fases 1, 2, 3a, 3b-0 e 3b-1 implementadas; a 3b-1 (tela de navegação e inspeção dos cortes) aguarda avaliação de Rodrigo (§15). Depois: experimento em branch separada com a timeline vertical só na etapa de Cortes.

---

## 1. Visão

✅ Rodrigo cria um projeto, sobe o vídeo bruto, um briefing e vídeos de apoio. A IA faz a primeira versão de cada etapa e ele ajusta: à mão (estilo Premiere), editando o texto ou pedindo ao agente no chat. As etapas são:

| # | Etapa | O que faz | Na v1 |
|---|---|---|---|
| 1 | **Cortes** | Remove erros, retomadas e esperas; ajusta emendas e respiros; reenquadra para 9:16 | **Real** |
| 2 | **Direção visual** | Decide o que aparece na tela em cada momento (planos e elementos), aprendendo com vídeos de referência já editados (§8.2) | Mock → real depois das Referências |
| 3 | **Inserts** | Escolhe vídeos de apoio para ilustrar cada trecho, recorta e encaixa | Mock |
| 4 | **Motion** | Cria motions específicos por trecho e encaixa | Mock |
| 5 | **Legenda** | Gera e estiliza legendas | Mock |

Conteúdo típico: vídeos de Rodrigo (Asimov Academy) sobre IA, agentes, produtividade e design, para Reels/TikTok. Os brutos têm erros, pausas e várias tentativas da mesma fala.

## 2. Escopo da v1

✅ **Entra:**
- Tela de projetos: criar novo e abrir existente.
- Upload de bruto, briefing (texto ou áudio) e vídeos de apoio.
- Pipeline automático ao criar o projeto, até a primeira sugestão de cortes.
- Interface completa (etapas, preview, timeline multitrilha, chat) em todas as etapas.
- Etapa **Cortes** funcionando de verdade.
- **Inserts, Motion e Legenda** como mocks: layout real, dados falsos na timeline e ferramentas fictícias no agente.
- Desfazer/refazer e versões nomeadas.
- Exportação MP4 a partir de qualquer etapa.

✅ **Fica fora da v1:**
- Lógica real de inserts, motion e legenda (cada uma é implementada depois, uma de cada vez).
- Multicâmera / mais de um bruto por projeto (o modelo de dados já aceita várias fontes).
- Acervo global de apoios compartilhado entre projetos.
- Exportar XML para Premiere/DaVinci.
- Anotações entre etapas (comentários sobre inserts são feitos na etapa de inserts).
- Formatos de saída além de 9:16.
- Publicação automática, treino de modelos e síntese de voz.

## 3. Stack e arquitetura

✅ **Backend:** Python + FastAPI. Concentra IA e vídeo: LangChain, OpenRouter, MLX Whisper, FFmpeg.
✅ **Frontend:** React + Vite + TypeScript, Tailwind, shadcn/ui, com o design system Otto (§7).
✅ **Local:** tudo roda no Mac de Rodrigo (Apple Silicon) e sobe com um comando só. Git desde o primeiro commit.

💡 Detalhes:
- Python gerenciado com `uv`; frontend com `npm`.
- Tarefas longas rodam em background no próprio backend: fila de uma thread (`pipeline.py`), estado de cada passo salvo no `projeto.json`. O frontend consulta o projeto a cada 1 s enquanto algo roda (mais simples que SSE para a PoC). Se o servidor cair no meio, o que ficou pendente recomeça sozinho ao subir.
- A mídia é servida pelo backend com suporte a range requests, para o player conseguir pular no vídeo.
- Sem banco de dados: o estado fica em arquivos (ver §5).

## 4. Estrutura de pastas

💡

```text
18-harness-video-editor/
├── AGENTS.md          # instruções curtas para agentes (≤ ~40 linhas)
├── SPEC.md            # este documento
├── dev.sh             # sobe backend + frontend
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI, rotas
│   │   ├── projeto.py     # ler/salvar projeto.json, histórico, versões
│   │   ├── jobs.py        # fila de tarefas + progresso
│   │   ├── midia.py       # ffprobe, proxy, silêncios, render (FFmpeg)
│   │   ├── transcricao.py # MLX Whisper
│   │   ├── agente.py      # agente LangChain + ferramentas por etapa
│   │   └── etapas/        # cortes.py, inserts.py (mock), motion.py (mock), legenda.py (mock)
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   └── src/ (telas, timeline, player, chat)
├── projetos/          # dados dos projetos (fora do git)
├── referencias/       # vídeos de referência analisados para a Direção visual (fora do git, §8.2)
└── _legado/           # projeto anterior, só referência
```

## 5. Projeto em disco

✅ Uma pasta por projeto, com `projeto.json` como fonte de verdade. Os originais nunca são alterados.

💡

```text
projetos/<slug>/
├── projeto.json        # estado: fontes, briefing, timeline, etapas, chats, histórico, versões
├── transcricoes/       # uma transcrição por motor: whisper.json, whisper-stable.json, whisper-qwen.json, …
├── silencios.json
├── picos.json          # forma de onda real: um pico a cada 5 ms (0–255), para a timeline
├── midia/
│   ├── bruto.<ext>     # original, intocado
│   ├── apoio/          # vídeos de apoio originais
│   └── proxy/          # versões 720p para o player
├── briefing/           # texto e/ou áudio
└── exports/            # MP4 finais, com data e hora no nome
```

💡 Esboço do `projeto.json`:

```jsonc
{
  "id": "melhor-ia-design",
  "nome": "Melhor IA design",
  "criado_em": "2026-10-02T19:00:00",
  "saida": { "largura": 1080, "altura": 1920, "fps": "fonte" },
  "fontes": [
    { "id": "f1", "papel": "bruto", "arquivo": "midia/bruto.mov", "proxy": "midia/proxy/f1.mp4",
      "duracao": 122.0, "largura": 2160, "altura": 3840 },
    { "id": "a1", "papel": "apoio", "arquivo": "midia/apoio/site.mp4", "proxy": "..." }
  ],
  "briefing": { "texto": "...", "audio": "briefing/audio.m4a", "transcricao_audio": "..." },
  "enquadramento": { "x": 0.5 },          // centro do recorte parado (só se o bruto for horizontal)
  "timeline": { "trilhas": { "V1": [], "V2": [], "V3": [], "LEG": [], "A1": "segue V1" } },
  "etapas": { "cortes": "pronta", "inserts": "mock", "motion": "mock", "legenda": "mock" },
  "chats": { "cortes": [], "inserts": [], "motion": [], "legenda": [] },
  "historico": [],                        // ver §10
  "versoes": []
}
```

## 6. Criação do projeto e pipeline automático

✅ Ao criar o projeto, Rodrigo sobe:
- **Bruto:** um vídeo, vertical ou horizontal.
- **Briefing:** texto e/ou áudio. O áudio é transcrito pelo Whisper.
- **Vídeos de apoio:** zero ou mais, só daquele projeto.

✅ Em seguida roda sozinho, com barra de progresso por passo:
1. Inspeção (ffprobe, considerando o metadado de rotação) e geração do **proxy 720p** (em paralelo com o resto).
2. **Silêncios** do áudio (`silencedetect` do FFmpeg).
3. **Transcrição** com timestamp por palavra (MLX Whisper), **em pedaços separados pelas pausas ≥ 0,5 s**.
4. **Alinhamento:** o texto transcrito é realinhado ao áudio com **stable-ts** para apertar o início e o fim de cada palavra. O texto não muda; os tempos originais do Whisper ficam guardados (`inicio_whisper`, `fim_whisper`). Se o alinhamento não bater palavra a palavra, mantém tudo e registra um aviso.
5. **Sugestão de cortes** pela LLM (ver §8.1), sobre a transcrição ativa.
6. **Outros motores de transcrição**, em segundo plano e em fila própria (não atrasam nada): Whisper + Qwen3-Aligner, Whisper + CTC, Parakeet v3 e, se houver chave, ElevenLabs Scribe v2 (§8.1).

O passo de silêncios também gera a forma de onda real (`picos.json`).

✅ Ao terminar, Rodrigo abre a etapa Cortes e já encontra uma primeira versão cortada. Cada passo pode ser refeito manualmente (ex.: "refazer cortes com outro modelo").

## 7. Interface

✅ Layout de editor estilo **Premiere**, com a cara do design system **Otto** (`frontend/otto-cinematic-9-design-system/`): cores, tipografia (Manrope + Inter 800), botões, pílulas, eyebrows e a marca de 4 pétalas.

💡 Como o Otto foi aplicado (implementado na fase 2):
- **Verde profundo** (`#172e2b`, a seção "trust" do Otto) como chrome do app inteiro (início e editor), para o vídeo ter contraste como no Premiere.
- **Início:** grade de projetos em cartões 9:16 com miniatura do bruto, duração, uma barrinha de progresso por etapa e busca. O primeiro cartão cria projeto.
- **Creme** (`#faf7ee`) nos diálogos (ex.: novo projeto).
- **Chat** no creme claro do "workspace" do Otto; ferramentas usadas pelo agente aparecem como as linhas de execução ✓.
- Cores das trilhas: V1 menta, V2 azul, V3 amarelo, LEG creme, A1 coral. Cabeça de reprodução coral.
- Tokens em `frontend/src/index.css`; botões (`default` tinta, `cream`, `coral`, `pill`) em `components/ui/button.tsx`.

```text
┌─ topo: marca · nome do projeto · desfazer/refazer/versões · Exportar ───────────┐
├──────────┬──────────────────────────────────────────────┬──────────────────────┤
│ Etapas   │  Painel da etapa (sem     │  Preview 9:16    │  Chat do agente      │
│ 01 Cortes│  título: texto riscado,   │  + controles     │  (da etapa aberta)   │
│ 02 Inser.│  listas)                  │                  │                      │
│ 03 Motion├──────────────────────────────────────────────┤                      │
│ 04 Leg.  │  Timeline: LEG · V3 · V2 · V1 · A1, régua,   │                      │
│ Projeto  │  cabeça arrastável, zoom                     │                      │
└──────────┴──────────────────────────────────────────────┴──────────────────────┘
```

✅ Telas: **lista de projetos** (criar/abrir) → **editor** do projeto.
✅ Cada etapa tem seus próprios controles manuais, além do chat.
💡 Atalhos: espaço toca/pausa; ←/→ andam 0,5 s (com shift, 5 s). Clicar numa palavra ou item pula o player para ela.

## 8. Etapas

### 8.1 Cortes (real na v1)

✅ **O que a IA faz:**
- Uma LLM escolhe **quais palavras ficam, pelo ID**, e o código reconstrói o texto e os intervalos. Assim, falas idênticas em tentativas diferentes não se confundem, e nada é reescrito nem inventado.
- O código transforma as palavras mantidas em clipes e puxa as bordas para silêncios reais, para não cortar no meio de fonema.
- Pausas longas internas são encurtadas, mantendo um respiro natural.
- ✅ **Pausas e respiros dentro de frases mantidas são preservadas** (Rodrigo: dão clima e tempo para formular a frase). Só pausas acima de `pausa_max` (padrão **2 s**) são encurtadas, e sobra o `respiro` (padrão **0,8 s**). Os dois são configuráveis em Configurações > Cortes > Pausas longas (`pausa_max_ms` e `respiro_ms`; `pausa_max` 0 = nunca cortar pausas dentro de um trecho; o respiro não pode passar do limite). Valem para os próximos cálculos. Cortes só acontecem onde há palavras removidas, com 0,1 s de ar nas bordas.
- 💡 A LLM vê as pausas reais ≥ 0,5 s na transcrição (`[pausa 1.3s]`), o que ajuda a separar tentativas. Ela também devolve **dúvidas** (intervalo + motivo), mantidas e sublinhadas em amarelo no texto.
- ✅ **Como o ponto exato do corte é decidido** (não é o ASR nem a IA): (1) a **LLM** escolhe *quais palavras ficam*; (2) o **código** parte do tempo da primeira e da última palavra mantida de cada trecho (os tempos vêm do motor de transcrição) e procura, na detecção de silêncio do áudio (`silencedetect`, −35 dB, pausas ≥ 0,3 s), a pausa mais próxima: até 0,5 s antes e 0,35 s depois da borda; (3) a borda cai **dentro dessa pausa**, a uma margem da palavra mantida; sem pausa por perto (fala contínua), vale o tempo da palavra ± a margem, e aí o erro do motor passa direto para o corte (é o caso do "⚠ fora de pausa" no detalhe); (4) a borda **nunca invade a palavra removida vizinha**. O motor de transcrição só importa pela âncora: quando há pausa perto, o corte vem do áudio, e erros de até ~0,5 s da âncora são absorvidos.
- ✅ **Margens do corte (decisão de Rodrigo; configuráveis):** *Antes do corte* = ar que fica **depois da última palavra** de cada trecho mantido; *Depois do corte* = ar que fica **antes da primeira palavra** do trecho seguinte. Padrão 100 ms cada (0 a 1000 ms), em Configurações. Cada margem é o quanto da pausa fica com a palavra mantida, no máximo a pausa inteira. Valem para cortes novos, para "Refazer" e para **"Recalcular"** (botão no editor: refaz os trechos a partir das palavras já mantidas, sem chamar a IA; descarta os ajustes manuais de borda, as palavras ligadas ou desligadas à mão continuam).
- 💡 Bordas: o silêncio mais próximo da borda da palavra, dentro de 0,5 s antes e 0,35 s depois, vira o ponto de corte (o Whisper erra ~0,2 s).

✅ **Tela de Cortes: navegar e inspecionar** (3b-1, decidido com Rodrigo; ele usa isso para apontar erros e iterar o algoritmo de corte):
- **Timeline no bruto inteiro**, só a trilha do bruto (V2, V3 e LEG só aparecem nas suas etapas, no tempo do vídeo final): forma de onda **real** com zoom até milissegundos; trechos mantidos em menta e removidos em coral listrado; cortes numerados (✂ 1, ✂ 2…); ao aproximar, as palavras aparecem sobre a onda com início e fim.
- **Nada é renderizado em Cortes.** O player toca o proxy do bruto pulando os trechos removidos; o vídeo final só sai na exportação (fase 4), depois de Rodrigo aprovar. Um botão alterna entre "tocar o resultado" e "tocar o bruto sem pular". Limitação: o pulo é um *seek* do navegador e pode ter um pequeno tranco que o render final não terá.
- **Texto:** em cada fronteira de corte, uma marca inline com os tempos exatos no bruto e o que foi removido (`✂ 3 · 27,512 → 31,260 · −3,75 s`); tempo de cada palavra ao passar o mouse e num painel de detalhe.
- 🧪 **Experimento (branch `timeline-vertical`, descartável):** na etapa de Cortes a timeline fica **vertical**, entre a sidebar e o vídeo: o tempo corre de cima para baixo, com régua, forma de onda, barras de tempo exato e cada palavra ao lado do seu instante (se dois rótulos colidem, o de baixo desce e uma linha o liga ao seu tempo). O vídeo ocupa a coluna central, com o detalhe embaixo. Os controles (Resultado/Bruto, ✂ Cortar trecho, Ímã, Recalcular, Expandir tudo, zoom) ficam no topo da timeline. **Refazer cortes com IA** é um botão de destaque na barra do topo, à direita da engrenagem de Configurações (só na etapa de Cortes). Na `main` continua a versão horizontal.
- ✅ **Vários motores de transcrição (decidido com Rodrigo; na branch vertical):** o mesmo áudio é transcrito por mais de um motor e Rodrigo escolhe, na tela, qual **ver** e qual **comparar** (o texto do motor B aparece numa **segunda coluna ao lado do A, com as palavras e os tempos de cada um** e o instante exato de cada palavra no `title` e no detalhe; assim se veem palavras que um motor perde, escreve diferente ou marca em outro instante. Com o mesmo texto, o detalhe da palavra mostra a diferença em ms). **Nesta etapa o chat do agente não aparece** (Rodrigo: não é necessário agora; volta quando o agente existir).
  - **Famílias:** motores que só realinham o texto do Whisper (stable-ts, Qwen3-ForcedAligner, CTC, Whisper puro) compartilham texto e IDs de palavra, então **trocar entre eles mantém os cortes e os ajustes** e só muda os tempos exibidos. Motores que escrevem texto próprio (Parakeet, ElevenLabs) têm **cortes próprios**: ao escolher um pela primeira vez a IA os faz (~25 s); os cortes da família anterior ficam guardados e voltam intactos ao retornar.
  - **Padrão (decisão de Rodrigo, depois de comparar):** o **ElevenLabs Scribe v2** — acertou as palavras repetidas ("gastando gastando") que o Whisper reduzia a uma, sem "limpar" o texto. O motor padrão dos projetos **novos** é uma configuração do app (engrenagem na tela inicial e no editor; `projetos/_config.json`) e também pode ser escolhido ao criar cada projeto. Mudar a configuração não altera projetos existentes (`motor_inicial` fica no projeto).
  - **Fluxo:** o passo de transcrição usa o motor do projeto; os cortes saem dele. Os outros motores (inclusive o Whisper e o Whisper + stable-ts, que os alinhadores usam como base) rodam depois, em segundo plano e em fila própria, e aparecem no seletor quando ficam prontos; falhas e falta de chave aparecem com o motivo e "Tentar de novo". Um motor que falha não derruba os outros. **Se o motor padrão falhar** (sem chave, sem rede, cota), o projeto **segue com Whisper + stable-ts** e avisa o motivo na tela de processamento, em vez de travar. Medido no bruto de teste (2:02): com o ElevenLabs, cortes prontos ~32 s depois de criar o projeto (transcrição 4 s).
  - **Motores que transcrevem + dão tempos** (interesse de Rodrigo, para achar palavras que o Whisper perde): Parakeet v3, **Qwen3-ASR 1.7B + Qwen3-ForcedAligner** (o ASR escreve pedaço a pedaço entre as pausas e o alinhador dá os tempos de cada pedaço), **Whisper large-v3 + stable-ts** e ElevenLabs Scribe v2. O Qwen3-ForcedAligner sozinho (`whisper-qwen`) **não transcreve**: só calcula tempos para um texto pronto.
  - **ElevenLabs:** só roda com `ELEVENLABS_API_KEY` em `backend/.env` (lida a cada execução, sem reiniciar). **Envia o áudio da voz a um terceiro** (Rodrigo autorizou API na Q8 b). Já rodou com a API real no bruto de teste (3,4 s, 353 palavras).
- 🧪 **Cortes compactados (na branch vertical):** cada corte aparece como uma linha de 34 px (`✂3 −9,6 s · 30 pal. “mas na minha opinião…”`) com o ícone ⇕ para expandi-lo no tempo real; os trechos mantidos continuam proporcionais ao tempo. O botão **"Expandir tudo" / "Compactar tudo"** (com texto, na linha de controles) abre ou fecha todos de uma vez. O ícone de expandir fica no **canto direito** da linha compactada, e o controle de compactar de um corte expandido **acompanha a rolagem** (gruda no topo da janela enquanto o corte aparece), para não precisar rolar de volta até ele. Selecionar uma palavra escondida num corte compactado o expande.
- 🧪 **Precisão do arrasto (corrigida a pedido de Rodrigo):** o limite se move pelo **deslocamento do mouse desde onde a alça foi pega** (antes saltava até metade da altura da alça ao começar: medido +227 ms para um arrasto esperado de +182 ms; agora +182 ms em qualquer ponto de pegada) e só começa a andar após 3 px. O **ímã** (chip "Ímã" no cabeçalho; Alt desliga só durante o arrasto) tem alcance de **4 px** (antes 8 px ≈ 73 ms a 110 px/s) e gruda em bordas de palavras e de pausas reais; desligado, o limite vai exatamente onde o mouse vai. Os tempos das palavras vêm do motor de transcrição e podem errar dezenas de ms: gruda-se no que o motor marcou, não no que o áudio tem. Por isso o rótulo do arrasto diz onde a borda cai ("em pausa", "entre palavras" ou "dentro de “x”, N ms depois do início" em vermelho) e, com uma alça selecionada, **↑/↓ ajustam 10 ms (Shift 1 ms, Alt 50 ms)**. A forma de onda tem um pico a cada 5 ms.
- 🧪 **Arrastar os limites dos cortes (na branch vertical):** nos cortes expandidos, as duas pontas têm alças. Arrastar muda o fim do trecho mantido de cima ou o início do de baixo (ímã nas bordas de palavras e de pausas reais; Alt desliga). Uma linha tracejada mostra de onde a borda saiu e uma amarela, onde vai cair, com o deslocamento em ms. Regras no servidor (`cortes.ajustar_borda`): a borda não passa do trecho vizinho nem deixa um trecho com menos de 50 ms ou sem palavras mantidas; as palavras entre a posição antiga e a nova passam a ficar (ou sair) conforme pelo menos metade delas esteja dentro de algum trecho; a âncora do trecho é recalculada. O primeiro ajuste guarda o valor da IA em `auto` (e a seleção original em `cortes.mantidas_auto`), e o detalhe do corte mostra "ajustado à mão" com **Restaurar da IA**. Refazer os cortes com a IA pede confirmação se houver ajustes e os descarta. Desfazer/refazer em geral continua para a 3b-2.
- 🧪 **Cortes à mão (branch vertical):** o botão **✂ Cortar trecho** arrasta um intervalo sobre a onda (ímã nas bordas de palavras e pausas, Esc sai) e cria um corte onde a IA não cortou; o novo corte já abre selecionado. Cada corte tem um **✕ Excluir corte** (na linha compacta e nos controles do corte expandido, que acompanham a rolagem) que devolve o trecho. No servidor, `POST /cortes/faixa {inicio, fim, manter}` (`cortes.alterar_faixa`): ancora por sobreposição de palavra (≥ 30 ms), descarta pedaços sem palavras e respeita `MIN_CORTE` 20 ms e `MIN_CLIPE` 50 ms.
- ✏️ **Renomear o projeto:** clique no nome na barra do topo (Enter ou sair do campo salva, Esc cancela). Muda só o nome exibido; o id e a pasta continuam (`PUT /api/projetos/{id}/nome`).
- ⚙️ **Configurações com abas por categoria:** hoje só "Cortes" (motor, margens, pausas longas); Inserts, Motion e Legenda entram como novas abas. Cada mudança é gravada na hora em `projetos/_config.json` como padrão do app (`GET/PUT /api/config`).
- ✅ **Correção (montagem dos clipes):** a borda de um trecho mantido nunca passa do início da palavra removida vizinha. Antes, a borda era puxada para o silêncio mais próximo e, se esse silêncio ficasse depois de uma palavra removida, o áudio dela voltava para o vídeo.
- ✅ **Velocidade do vídeo:** 0,25×, 0,5×, 1× e 2× ao lado do play (o tom é preservado); vale também para "ouvir emenda".
- 💡 **Atalhos na etapa:** espaço toca/pausa; ←/→ 0,5 s (Shift 5 s, Alt 10 ms); **E** ouve a emenda mais próxima; **B** alterna "tocar resultado" e "tocar bruto"; Ctrl/⌘ + roda do mouse dá zoom na timeline (até 1 ms ≈ 12 px). Parado dentro de um trecho cortado, o player fica onde está (dá para inspecionar o que saiu); o pulo só acontece ao tocar.
- 💡 **Diagnóstico no detalhe do corte:** a que distância (ms) cada ponta do corte está da palavra vizinha, se entra dentro da palavra (⚠) e se cai numa pausa real do áudio (⚠ se não). A faixa "Whisper" mostra, sob cada palavra, onde o Whisper a tinha marcado.
- **Referências:** cortes e palavras têm rótulos estáveis (✂ 3, w00091); botão "copiar referência" (`✂3 · 27,512 s · w00091`) para colar no chat. Marcadores com nota ficam para depois.
- **Ouvir emenda:** botão e atalho em cada corte, tocando ~2 s antes e ~2 s depois com o corte aplicado, com loop opcional.

✅ **Como Rodrigo corrige** (3b-2, só depois de usar a tela acima). São três formas, sempre sincronizadas: mudar em uma atualiza as outras.
1. **Texto:** transcrição com as palavras cortadas riscadas. Clicar ou selecionar liga e desliga o corte, o que permite escolher outra tentativa da mesma frase.
2. **Timeline:** clipes com waveform, alças para arrastar as bordas, ajuste fino quadro a quadro pelo teclado e aumento ou redução de respiros.
3. **Chat:** pedidos em linguagem natural ("volta a primeira tentativa da abertura", "corta mais seco entre 0:12 e 0:20"). ✅ **Adiado para bem depois** (o chat segue simulado).

✅ **Reenquadramento:** a saída é sempre 9:16, 1080×1920. Se o bruto for horizontal, um recorte **parado** (sem tracking, sem zoom) é arrastado no preview e vale para o vídeo inteiro. Se o bruto já for vertical, o controle não aparece.

💡 Ferramentas do agente nesta etapa: `ver_transcricao`, `ver_timeline`, `sugerir_cortes` (refaz a seleção inteira), `manter_palavras(ids)`, `remover_palavras(ids)`, `ajustar_borda(clipe, lado, segundos)`, `ajustar_respiro(entre_clipes, segundos)`, `tocar_trecho(inicio, fim)` (posiciona o player).

💡 Representação: cada clipe da V1 guarda o intervalo de palavras que realiza e um ajuste manual de borda (início/fim, em segundos). Ligar ou desligar palavras regenera os clipes, preservando os ajustes manuais dos clipes que continuarem existindo.

✅ **Refazer cortes com IA** (botão na timeline) pede uma nova seleção sem retranscrever. Depois da 3b, as palavras que Rodrigo ligou ou desligou à mão ficam **travadas**: a IA refaz o resto e respeita essas escolhas.

### 8.2 Direção visual

✅ **O que é (decisão de Rodrigo, out/2026):** etapa entre Cortes e Inserts que decide **o que aparece na tela em cada momento** do vídeo cortado. Não edita mídia: escolher e recortar clipes fica em Inserts e Motion, que partem desta direção. Aprende com pares **transcrição → transcrição + o que aparece na tela**, tirados de vídeos já editados de Rodrigo e revisados por ele.

✅ **Duas camadas, categorias fixas** (a IA não cria categorias; novas só quando Rodrigo cadastrar):
- **Planos-base** (um por vez, cobrem o vídeo sem buracos; um grupo novo a cada troca): `Full ator` · `Insert tela cheia` · `Motion tela cheia` · `Tela dividida` (em cima insert **ou** motion, guardado como campo; embaixo o ator).
- **Elementos** (dentro de um plano, podem durar menos e se sobrepor): `Lettering` (palavra destacada) · `Palavra ManyChat` (CTA de comentário) · `Caixinha de perguntas` · `Print/imagem sobreposta`.
- Zoom/punch-in no ator não é plano: fica para Inserts/edição.

✅ **Cada item guarda:** tipo; início e fim **nas palavras** (§9) **e em segundos** (pode começar no meio de uma palavra ou numa pausa); **descrição contando a história** do que aparece (o que é, como é visualmente, o que acontece entre os quadros: "primeiro aparece…, depois troca para…"); texto exato (lettering, palavra do ManyChat, pergunta da caixinha); miniatura (um quadro do meio). O campo "função" saiu (decisão de Rodrigo, out/2026).

#### 8.2.1 Referências (treinamento) — construída primeiro

✅ Tela **"Referências"** na home, ao lado de Projetos. É do app (vale para todos os projetos). Só vídeos **verticais** por enquanto; cada referência guarda `formato`.
✅ **Entrada: só o MP4 final editado.** Upload de vários de uma vez; cada um entra numa fila com status visível: na fila → analisando → a revisar → revisado.
✅ **Análise automática (híbrida):**
1. **Código:** detector de cena (PySceneDetect, local) acha os cortes duros com precisão de quadro; a transcrição usa o motor padrão do app (ElevenLabs).
2. **LLM multimodal em paralelo, uma chamada por trecho:** recebe os quadros do trecho (2/s, cada um uma imagem com o seu tempo, todos na mesma requisição) e a **transcrição do começo do vídeo até o fim do trecho** (nada do que vem depois), com a fala do trecho marcada entre `<momento_analisado>` e `</momento_analisado>`. Devolve plano-base, elementos com início/fim, descrição e texto exato, em saída estruturada, sempre dentro das categorias fixas.
3. **Código:** prende os tempos às palavras e junta trechos vizinhos com o mesmo plano.
✅ **Revisão** (mesma linguagem da tela de Cortes): vídeo de referência no centro, timeline vertical à esquerda com as palavras, uma faixa de planos-base e uma de elementos; bordas arrastáveis com ímã em palavras e cortes detectados; detalhe editável (tipo, descrição, texto, função, miniatura); criar item onde o detector perdeu o corte; **"✓ Marcar como revisado"**. Só pares revisados entram no dataset.
✅ ~~Estatísticas~~: construídas na D4 e **removidas** (decisão de Rodrigo, out/2026): o de-para transcrição → direção será montado de outro jeito.
✅ **Configurações › aba "Direção visual":** modelo multimodal (padrão `google/gemini-3.8-flash` via OpenRouter; os quadros vão como imagens) e quadros por segundo por trecho (1 a 4, padrão 2; trechos longos limitados a 40 quadros). Trocar qualquer um faz a próxima análise refazer os trechos.
💡 Fatos levantados (out/2026): o OpenRouter aceita vídeo para Gemini como `video_url` com data URL base64 (o `langchain-openrouter` converte o bloco `video`); não está confirmado que repassa `fps`/recorte, então o recorte e a taxa de quadros são feitos antes, com FFmpeg. O Gemini sozinho localiza eventos com erro de ~±1 s (1 quadro/s padrão): por isso os cortes vêm do detector de cena. Custo estimado: centavos de dólar por vídeo de 2 min.
✅ **Como foi construído (D2–D4, out/2026):**
- Passos por referência (estado em `referencia.json` › `analise.passos`, a tela acompanha): proxy 720p → áudio, silêncios e transcrição (motor padrão; ElevenLabs ou, se falhar, Whisper + stable-ts) → cenas (PySceneDetect **adaptativo** no proxy; ~1–6 s por vídeo) → análise por trecho → montagem. Arquivos: `proxy.mp4`, `palavras.json`, `cenas.json`, `trechos/NNN.json` (cache por trecho, chave = início, fim, modelo e quadros/s), `analise.json`, `direcao.json` (`itens` revisados, `itens_ia` como a IA entregou, `cortes`), `quadros/` (miniaturas).
- A LLM recebe os quadros **separados** (cada um uma imagem de até 384 px de altura, precedida de `t=`; opção "mosaico" 3×2 com o tempo escrito, ~2,4× mais barata, em Configurações), a transcrição até o fim do trecho com o momento marcado e um quadro antes e um depois. Responde em saída estruturada (`AnaliseTrecho`: `continua_anterior`, `planos[]`, `elementos[]`; LangChain `with_structured_output(..., method='json_schema')`, os `Literal` viram `enum` e impõem as categorias). Raciocínio `low`, saída máx. 4.096 tokens, timeout 90 s, 2 trechos em paralelo. `VERSAO_ANALISE` entra na chave do cache: mudar o prompt refaz os trechos.
- Montagem: planos contíguos; trechos vizinhos com o **mesmo plano** viram um só quando é Full ator (jump cut) ou quando a IA diz que o trecho **continua o mesmo conteúdo** (as descrições são emendadas com "Depois:"); inserts diferentes em sequência continuam separados. Itens presos às palavras (`palavra_ini`/`palavra_fim`), com miniatura do meio.
- Revisão (`/referencias/:id`): timeline vertical própria (tempo linear, zoom 8–600 px/s), colunas fala · planos-base · elementos (elementos sobrepostos em faixas lado a lado), cortes de cena tracejados, ímã em palavras e cortes (Alt desliga), arrastar a troca entre planos e as pontas/corpo de elementos, dividir plano no cursor (S), novo elemento (E), excluir/juntar (Delete), desfazer (⌘Z), salvamento automático (`PUT /direcao`, o servidor valida com `direcao.validar_edicao`), "✓ Marcar como revisada" (`PUT /status`), "↻ Reanalisar" (refaz com o prompt atual; a versão anterior fica em `direcao.anterior.json`). O detalhe da direita segue o plano sob o cursor.
- Erros: se o OpenRouter recusar por **falta de crédito**, a fila pausa (as próximas referências ficam em erro com o aviso, sem gastar transcrição) até alguém clicar "Tentar de novo"; o que já foi analisado é reaproveitado.
💡 Medido (out/2026, Gemini 3.8 Flash): o Gemini 3 cobra ~1.100 tokens **por imagem**, qualquer que seja o tamanho; mandar um quadro por imagem custava ~9–19 mil tokens por trecho. Com mosaicos 3×2, o mesmo trecho de 6,5 s caiu de 18,7 mil para 7,7 mil tokens (5,5 s), mesma análise. Um Reel de ~50 s tem ~20 trechos. A análise acerta muito bem planos, caixinha de perguntas (com o texto) e motions; a legenda palavra a palavra precisa ser ignorada explicitamente no prompt, e um texto que é o próprio motion não deve virar lettering.
💡 Lição: `referencias/` no `.gitignore` sem a barra inicial ignorava também `frontend/src/referencias/` (o Tailwind não lia as classes e o git não versionaria os arquivos). Pastas de dados ficam ancoradas na raiz (`/referencias/`).
💡 Lição: um `ffmpeg` filho continua rodando quando o servidor recarrega no meio do proxy; dois escrevendo no mesmo arquivo temporário corromperam um proxy. O temporário agora é único por processo/thread.

#### 8.2.2 Direção visual no projeto — depois de 5 a 10 pares revisados

✅ Até lá, a etapa aparece no projeto como **mock**.
✅ Quando real: uma LLM recebe a transcrição do vídeo cortado, **todos os pares revisados** e as estatísticas, e propõe planos e elementos no mesmo formato da revisão, presos às palavras (acompanham mudanças nos cortes; itens sem palavras ficam órfãos, §9). Rodrigo corrige na mesma timeline. Inserts e Motion partem dessa direção.
✅ Evolução: com o dataset maior, uma LLM **destila um guia de estilo** editável por Rodrigo (regra editorial explícita, como a §14 para cortes), e a Direção passa a usar guia + alguns exemplos.

### 8.3 Inserts (mock na v1)

✅ Visão: selecionar vídeos de apoio ideais para ilustrar cada trecho; o agente recorta o apoio no momento certo e o encaixa na V2. Rodrigo comenta propostas de inserts, ângulos e formas de mostrar nesta etapa.
✅ Na v1: tela com layout real, inserts falsos na V2 e ferramentas fictícias no agente.
⏳ Em aberto: como os apoios são analisados (visão/LLM multimodal) e acervo global. Os layouts (tela cheia, tela dividida) agora vêm da Direção visual (§8.2).

### 8.4 Motion (mock na v1)

✅ Visão: criar motions explicativos por trecho e encaixá-los na V3.
✅ Na v1: mock, igual a Inserts.
⏳ Em aberto: tecnologia (ex.: Remotion), estilo, como o agente gera.

### 8.5 Legenda (mock na v1)

✅ Visão: gerar legendas a partir da transcrição já cortada e estilizar.
✅ Na v1: mock, com legendas falsas na trilha LEG.
⏳ Em aberto: estilo visual, palavra a palavra ou por frase, destaque de palavras.

## 9. Timeline e ligação entre etapas

✅ A timeline nasce **multitrilha**: V1 (Rodrigo/bruto), V2 (inserts), V3 (motion), LEG (legenda), A1 (áudio do bruto). Na v1 só V1/A1 têm conteúdo real.

✅ Tudo que vem depois dos cortes (inserts, motion, legendas) fica **preso às palavras** da transcrição, não a segundos. Ao mexer no corte, esses itens acompanham a fala. Se as palavras de um item forem removidas, ele fica marcado como **órfão** para Rodrigo decidir.

💡 Ancoragem: `{ "palavra_ini": "w00051", "palavra_fim": "w00060", "offset_ini": 0, "offset_fim": 0 }`. A posição em segundos na saída é sempre calculada, nunca guardada.

## 10. Desfazer e versões

✅ Toda ação, de Rodrigo ou do agente, entra numa pilha de histórico, com Ctrl+Z / Ctrl+Shift+Z.
✅ Versões nomeadas podem ser salvas e restauradas (ex.: "antes do agente mexer").
💡 Cada entrada do histórico guarda autor (`rodrigo` ou `agente`), etapa, descrição curta e um snapshot da timeline. O snapshot é JSON pequeno, então é mais simples do que guardar diffs.

## 11. Agente

✅ **Adiado para depois da fase 4** (decisão de Rodrigo). Até lá o chat segue simulado. Quando vier:
✅ **Um agente só**, LangChain. O prompt de sistema e as ferramentas mudam conforme a etapa aberta. Cada etapa tem seu próprio histórico de chat, salvo no projeto.
✅ O agente enxerga o estado do projeto (briefing, transcrição, timeline). Tudo que ele altera passa por ferramentas, então aparece na timeline e pode ser desfeito.
✅ Transcrições e briefings são **dados, não instruções**: comandos que apareçam dentro de falas são ignorados.
💡 Ele pode ser separado em vários agentes no futuro, se houver motivo concreto.

## 12. Modelos de IA

✅ Configuráveis por etapa, numa tela de configurações.

| Uso | Padrão |
|---|---|
| Chat do agente | `google/gemini-3.8-flash` via OpenRouter |
| Seleção de cortes | `google/gemini-3.8-flash` via OpenRouter |
| Transcrição (bruto e briefing em áudio) | `mlx-community/whisper-large-v3-turbo`, local, refinada por stable-ts. Alternativas por projeto: Qwen3-ForcedAligner 0.6B 8-bit (só tempos), CTC (MMS/ONNX), Parakeet TDT v3, Qwen3-ASR 1.7B 8-bit + Aligner, Whisper large-v3 + stable-ts, ElevenLabs Scribe v2 (API) |

💡 A chave do OpenRouter fica em `backend/.env` (fora do git). `OPENROUTER_MODEL` no `.env` troca o modelo dos cortes.

## 13. Preview e exportação

✅ **Preview:** o player toca o **proxy 720p** pulando os trechos cortados, então é instantâneo e não renderiza nada. O recorte 9:16 também é simulado no player.
✅ **Exportar:** botão disponível em qualquer etapa. Gera MP4 1080×1920 a partir do **bruto original**, com o que existir até ali.
💡 H.264 com CRF ~18 e AAC. Fade de áudio de ~15 ms em cada emenda, para evitar estalos. Mesmo fps do bruto.

## 14. Regras editoriais dos cortes

✅ Aprovadas por Rodrigo. Ficam só aqui, sem cópia em prompts ou outros docs; o prompt do agente lê esta seção.

**Pode remover:**
- Erros de gravação, tentativas abandonadas e retomadas da mesma fala.
- Esperas entre tentativas e sobras no início e no fim.
- Vícios de fala claramente isolados, se o corte não prejudicar a naturalidade.

**Recomeços na mesma frase:** quando a mesma ideia é retomada várias vezes seguidas, mesmo com pouca pausa entre elas ("é X, é Y, é Y completo"), fica só a versão completa e final. O texto resultante deve ler como uma fala corrida, sem trechos repetidos.

**Escolha entre tentativas:** priorizar a **última tentativa válida**. É permitido emendar partes de tentativas diferentes se o texto resultante fizer sentido. "Última" não vale se a tentativa estiver incompleta ou perder informação.

**Deve preservar:**
- Sentido, coerência e ordem dos argumentos.
- Conteúdo correto e informação que só aparece uma vez.
- Jeito coloquial, pausas expressivas e respiros naturais.
- Repetição usada como ênfase.

**Não fazer sem pedido:** encurtar argumentos corretos para caber numa duração, reordenar ou criar nova abertura.

**Na dúvida com impacto no sentido:** manter e sinalizar.

Uma correção pontual num vídeo vale só para aquele vídeo, a menos que Rodrigo diga que é regra geral.

## 15. Ordem de construção

✅ Uma fase por vez; Rodrigo avalia ao fim de cada uma antes de a próxima começar.

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1. Fundação | `git init`, esqueleto backend + frontend, `dev.sh`, criar/abrir projeto, upload de bruto, briefing e apoios | Criar um projeto pela interface e ver os arquivos na pasta dele |
| 2. Casca com mocks | Editor completo: etapas, preview, timeline multitrilha, chat, mocks de todas as etapas | Navegar pelas 4 etapas com dados falsos e o chat respondendo |
| 3a. Cortes: pipeline real | Proxy, transcrição, silêncios e seleção pela LLM rodando ao criar o projeto; preview tocando o corte real; "Refazer cortes com IA" | Rodrigo avalia o corte da IA no player |
| 3b-0. Teste de transcrição ✅ | Comparou Whisper atual, + alinhador forçado, + stable-ts e Parakeet no áudio real (§16). Adotado: stable-ts como refinamento | Feito |
| 3b-1. Cortes: navegar e inspecionar (implementada, aguardando avaliação) | A tela descrita em §8.1: timeline do bruto, forma de onda real, milissegundos no texto, ouvir emenda | Rodrigo consegue apontar com precisão onde e como o algoritmo errou |
| 3b-2. Cortes: edição manual | Ligar/desligar palavras no texto, alças e respiros na timeline, travas manuais, desfazer/refazer e versões | Com o bruto de teste, chegar a um corte aprovado por Rodrigo só pela interface |
| 4. Exportação | Render FFmpeg a partir do bruto | MP4 1080×1920 exportado, emendas aprovadas no ouvido por Rodrigo |

| D1. Referências: casca ✅ | Tela Referências na home, upload múltiplo com fila, pasta `referencias/`, etapa "Direção visual" como mock na sidebar | Subir vários MP4 e vê-los na lista com status |
| D2. Referências: análise (implementada, aguardando avaliação) | Detector de cena, transcrição, LLM multimodal por trecho em paralelo, montagem dos itens | Uma referência real analisada, com planos e elementos plausíveis |
| D3. Referências: revisão (implementada, aguardando avaliação) | Timeline com faixas de planos e elementos, edição, "revisado" | Rodrigo revisa uma referência inteira só pela interface |
| ~~D4. Estatísticas~~ | Removida (o de-para vai ser montado de outro jeito) | — |
| D5. Direção visual no projeto | Proposta real a partir dos pares + estatísticas | Rodrigo avalia a direção proposta para um vídeo novo |

A Direção visual (D1–D5) entra antes de Inserts (decisão de Rodrigo, out/2026). Depois: Inserts → Motion → Legenda, cada uma com sua própria rodada de decisões. O agente do chat (antiga 3c) vem bem depois.

💡 Medido na 3a com o bruto de teste (2:02, 4K HEVC, M1 Max): proxy 19 s (em paralelo), silêncios 0,2 s, transcrição por pedaços ~19 s, seleção da LLM 18–42 s (varia muito). Total ≈ 40–60 s.

## 16. Aprendizados do projeto anterior

Fatos medidos em `_legado/`, úteis para a implementação:
- **MLX Whisper turbo** transcreveu 122 s de vídeo em ~7 s no M1 Max, com cache. O primeiro uso baixa os pesos (~5 min). A qualidade foi aprovada.
- ✅ **Transcrever o áudio inteiro de uma vez faz o Whisper fundir tentativas repetidas** (fase 3a, apontado por Rodrigo): "Qual a melhor IA… qual é a melhor IA do mundo" saiu como uma frase só, com "do" esticado por 3 s sobre a pausa, e o corte manteve as duas falas. Transcrevendo **por pedaços entre pausas ≥ 0,5 s**, todas as tentativas aparecem (com 0,7 s ainda sobravam 4 fundidas no bruto de teste). Custo: transcrição de ~11 s para ~19 s. Sinal de alerta: palavra com mais de 1,5 s contendo uma pausa.
- ✅ **Teste de transcrição (fase 3b-0, no bruto de teste, métricas medidas no próprio áudio, sem ouvido humano):**

  | | Whisper atual | + CTC (ctc-forced-aligner) | **+ stable-ts** (adotado) | Parakeet v3 inteiro | Parakeet v3 por pedaços |
  |---|---|---|---|---|---|
  | Tempo | 19 s | +21 s | +4 a 9 s | 94 s | 5 s |
  | Folga no p90 / pior caso | 230 / 830 ms | 149 / 1190 ms | 120 / 420 ms | 232 / 1110 ms | 256 / 810 ms |
  | Palavras com folga > 300 ms | 19 | 4 | 4 | 14 | 28 |
  | Texto igual ao Whisper | 100% | 100% | 100% | 8% | 94% |

  O Parakeet no áudio inteiro funde e "limpa" as repetições (158 de 352 palavras); por pedaços funciona, mas com limites piores e erros de texto ("Because", "Astro"). O CTC dá duração ~0 a palavras curtas (quadros de 20 ms). Os limites melhores deslocam 5–9 de 22 bordas de corte em 0,4–1 s, mas a energia do áudio no ponto do corte quase não muda (1–2 de 22 cortes em cima de fala em todos). API externa não foi necessária. **Ressalva:** um vídeo só; o stable-ts piorou "palavras sem som" (24 vs 12) e "fala fora de palavras" (5,1 s vs 1,6 s), possivelmente por causa do limiar de −35 dB da métrica.
- ✅ **Qwen3-ForcedAligner-0.6B (8 bits, mlx-audio)** no mesmo bruto de teste: 4,6 s (1,2 s sem carregar o modelo), folga no p90 de 140 ms, pior caso 390 ms, 1,1 s de fala fora de palavras (stable-ts: 5,1 s), texto idêntico. Devolve as palavras sem pontuação e sem item para símbolos isolados ("%"): casa-se pela parte alfanumérica e os símbolos ficam no vão entre as vizinhas. Segundo a pesquisa (fontes não verificadas; FA-Bench é só inglês), o Whisper começa as palavras ~150 ms adiantado em média, o que bate com o "Qual" marcado 280 ms antes da fala.
- ✅ **Todos os motores no bruto de teste, rodados pelo app (um vídeo; métricas medidas no próprio áudio, sem ouvido humano):**

  | Motor | Tempo | Palavras | Folga p90 / pior | > 300 ms | Fala fora de palavras | Texto vs Whisper |
  |---|---|---|---|---|---|---|
  | Whisper (puro) | 19 s | 352 | 230 / 830 ms | 19 | 1,6 s | — |
  | Whisper + stable-ts (padrão) | +4 a 9 s | 352 | 130 / 800 ms | 7 | 4,3 s | igual |
  | Whisper + Qwen3-Aligner | 9 s | 352 | 140 / 390 ms | 4 | 1,1 s | igual |
  | Whisper + CTC | 22 s | 352 | 149 / 1190 ms | 4 | 2,3 s | igual |
  | Qwen3-ASR 1.7B + Aligner | 14 s | 362 | 140 / 430 ms | 2 | **0,7 s** | 95% |
  | ElevenLabs Scribe v2 (API) | 3 s | 353 | 130 / 370 ms | 4 | 7,5 s | 92% |
  | Parakeet v3 | 7 s | 355 | 256 / 810 ms | 28 | 2,6 s | 95% |
  | Whisper large-v3 + stable-ts | 34 s | 355 | 140 / 1120 ms | 14 | 5,2 s | 98% |

  O Qwen3-ASR 0,6B escreve bem pior que o 1,7B ("melhoria" por "melhor IA"). Os dois ASR com tempos próprios e boa cobertura (Qwen3-ASR e ElevenLabs) acharam 1 a 10 palavras a mais que o Whisper turbo; o ElevenLabs deixa mais fala sem palavra marcada (7,5 s). **Decisão de qual fica como padrão: de Rodrigo, depois de comparar na tela.**
- O **Whisper às vezes estica palavras** para dentro das pausas: uma palavra curta ("do") chegou a quase 3 s. Por isso as bordas são puxadas para os silêncios do `silencedetect`, com janela de ~0,5 s antes e ~0,35 s depois da borda.
- **Seleção por ID de palavra** funcionou bem. O Gemini 3.1 Flash Lite deixou várias retomadas óbvias; o Gemini 3.8 Flash acertou muito mais (~17 s e ~US$ 0,03 por vídeo de 2 min).
- O bruto de teste (`_legado/brutos/melhor ia design.MOV`) é 4K **vertical via metadado de rotação**: as dimensões cruas dizem 3840×2160. É preciso considerar a rotação.
- Os caminhos absolutos dos JSONs antigos quebraram quando a pasta foi renomeada. Na versão nova, os caminhos dentro do projeto são **relativos à pasta do projeto**.

## 17. Em aberto

- ⏳ Meta de desempenho (antes: 5 min de bruto processados em até 3 min). Não reconfirmada.
- ⏳ Tudo listado como "em aberto" em Inserts, Motion e Legenda.
- ⏳ Música, transições e estilo de legenda.
- ⏳ Aprendizado das correções: como uma correção recorrente vira regra.
