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
| 2 | **Inserts** | Escolhe vídeos de apoio para ilustrar cada trecho, recorta e encaixa | Mock |
| 3 | **Motion** | Cria motions específicos por trecho e encaixa | Mock |
| 4 | **Legenda** | Gera e estiliza legendas | Mock |

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
└── _legado/           # projeto anterior, só referência
```

## 5. Projeto em disco

✅ Uma pasta por projeto, com `projeto.json` como fonte de verdade. Os originais nunca são alterados.

💡

```text
projetos/<slug>/
├── projeto.json        # estado: fontes, briefing, timeline, etapas, chats, histórico, versões
├── transcricao.json    # palavras com id, início, fim (refinados) e inicio_whisper/fim_whisper (originais)
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
5. **Sugestão de cortes** pela LLM (ver §8.1).

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
- ✅ **Pausas e respiros dentro de frases mantidas são preservadas** (Rodrigo: dão clima e tempo para formular a frase). Só pausas **> 2 s** são encurtadas, e sobram **0,8 s**. Os números (`pausa_max`, `respiro`, `folga`) ficam no projeto (`cortes.parametros`) para ajuste. Cortes só acontecem onde há palavras removidas, com 0,1 s de ar nas bordas.
- 💡 A LLM vê as pausas reais ≥ 0,5 s na transcrição (`[pausa 1.3s]`), o que ajuda a separar tentativas. Ela também devolve **dúvidas** (intervalo + motivo), mantidas e sublinhadas em amarelo no texto.
- 💡 Bordas: o silêncio mais próximo da borda da palavra, dentro de 0,5 s antes e 0,35 s depois, vira o ponto de corte (o Whisper erra ~0,2 s).

✅ **Tela de Cortes: navegar e inspecionar** (3b-1, decidido com Rodrigo; ele usa isso para apontar erros e iterar o algoritmo de corte):
- **Timeline no bruto inteiro**, só a trilha do bruto (V2, V3 e LEG só aparecem nas suas etapas, no tempo do vídeo final): forma de onda **real** com zoom até milissegundos; trechos mantidos em menta e removidos em coral listrado; cortes numerados (✂ 1, ✂ 2…); ao aproximar, as palavras aparecem sobre a onda com início e fim.
- **Nada é renderizado em Cortes.** O player toca o proxy do bruto pulando os trechos removidos; o vídeo final só sai na exportação (fase 4), depois de Rodrigo aprovar. Um botão alterna entre "tocar o resultado" e "tocar o bruto sem pular". Limitação: o pulo é um *seek* do navegador e pode ter um pequeno tranco que o render final não terá.
- **Texto:** em cada fronteira de corte, uma marca inline com os tempos exatos no bruto e o que foi removido (`✂ 3 · 27,512 → 31,260 · −3,75 s`); tempo de cada palavra ao passar o mouse e num painel de detalhe; **modo preciso** liga o tempo de todas as palavras.
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

### 8.2 Inserts (mock na v1)

✅ Visão: selecionar vídeos de apoio ideais para ilustrar cada trecho; o agente recorta o apoio no momento certo e o encaixa na V2. Rodrigo comenta propostas de inserts, ângulos e formas de mostrar nesta etapa.
✅ Na v1: tela com layout real, inserts falsos na V2 e ferramentas fictícias no agente.
⏳ Em aberto: como os apoios são analisados (visão/LLM multimodal), layouts (apoio em tela cheia, tela dividida com apoio em cima e Rodrigo embaixo), acervo global.

### 8.3 Motion (mock na v1)

✅ Visão: criar motions explicativos por trecho e encaixá-los na V3.
✅ Na v1: mock, igual a Inserts.
⏳ Em aberto: tecnologia (ex.: Remotion), estilo, como o agente gera.

### 8.4 Legenda (mock na v1)

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
| Transcrição (bruto e briefing em áudio) | `mlx-community/whisper-large-v3-turbo`, local |

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

Depois: Inserts → Motion → Legenda, cada uma com sua própria rodada de decisões. O agente do chat (antiga 3c) vem bem depois.

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
- O **Whisper às vezes estica palavras** para dentro das pausas: uma palavra curta ("do") chegou a quase 3 s. Por isso as bordas são puxadas para os silêncios do `silencedetect`, com janela de ~0,5 s antes e ~0,35 s depois da borda.
- **Seleção por ID de palavra** funcionou bem. O Gemini 3.1 Flash Lite deixou várias retomadas óbvias; o Gemini 3.8 Flash acertou muito mais (~17 s e ~US$ 0,03 por vídeo de 2 min).
- O bruto de teste (`_legado/brutos/melhor ia design.MOV`) é 4K **vertical via metadado de rotação**: as dimensões cruas dizem 3840×2160. É preciso considerar a rotação.
- Os caminhos absolutos dos JSONs antigos quebraram quando a pasta foi renomeada. Na versão nova, os caminhos dentro do projeto são **relativos à pasta do projeto**.

## 17. Em aberto

- ⏳ Meta de desempenho (antes: 5 min de bruto processados em até 3 min). Não reconfirmada.
- ⏳ Tudo listado como "em aberto" em Inserts, Motion e Legenda.
- ⏳ Música, transições e estilo de legenda.
- ⏳ Aprendizado das correções: como uma correção recorrente vira regra.
