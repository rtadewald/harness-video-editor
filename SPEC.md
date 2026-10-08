# SPEC — Harness Video Editor

Editor de vídeo local, controlado por interface web, em que cada etapa da edição é feita por IA e Rodrigo corrige pela interface ou conversando com um agente. A ideia é um "Premiere próprio", mais automatizado.

**Legenda de status usada neste documento:**
- ✅ **Aprovado:** decidido por Rodrigo.
- 💡 **Proposta:** detalhe técnico sugerido pelo agente, que pode mudar sem nova aprovação, desde que não contradiga o que foi aprovado.
- ⏳ **Em aberto:** ainda não decidido.

**Estado (out/2026):** **Cortes** real (timeline vertical, vários motores de transcrição, edição manual das bordas e dos cortes). **Direção visual** real: Calibragem (referências analisadas por IA multimodal e revisadas), Referências (galeria dos planos), Heurística da direção (regras + roteiros de exemplo) e a direção do projeto em duas etapas (diretora + formatadora), com versões e comentários. **Inserts** real e **manual**: o criador liga a cada insert vídeos e imagens do **Banco** (página própria, com descrição e palavras-chave sugeridas pela IA), com prévia no lugar. Enriquecimento de inserts, Motion, Áudio e Legenda continuam mock; agente do chat e desfazer/versões do editor ainda não foram feitos; a **exportação** existe (§13), com os inserts como na prévia.

---

## 1. Visão

✅ Rodrigo cria um projeto, sobe o vídeo bruto, um briefing e vídeos de apoio. A IA faz a primeira versão de cada etapa e ele ajusta: à mão (estilo Premiere), editando o texto ou pedindo ao agente no chat. As etapas são:

| # | Etapa | O que faz | Na v1 |
|---|---|---|---|
| 1 | **Cortes** | Remove erros, retomadas e esperas; ajusta emendas e respiros; reenquadra para 9:16 | **Real** |
| 2 | **Direção visual** | Decide o que aparece na tela em cada momento (planos e elementos) e, nos inserts, o que acontece e quais mídias entram; aprende com vídeos de referência já editados (§8.2) | **Real** |
| 3 | **Inserts** | A pós-produção dos planos, em três trabalhos: as **mídias** de cada insert (subir, escolher do banco, capturar site), os **motions** e o **enriquecimento** (como cada insert aparece, entra, combina as mídias e sai) (§8.3–8.5) | Mídias **real**; enriquecimento **mock**; motion **em construção** |
| 4 | **Transições e Áudio** | Efeitos sonoros (whoosh na entrada dos inserts, cliques…) | Mock |
| 5 | **Legenda** | Gera e estiliza legendas | Mock |

Ordem decidida por Rodrigo (out/2026): Cortes → Direção → Inserts → Transições e Áudio → Legendas. (Enriquecimento e Motion foram etapas separadas; viraram abas da etapa Inserts — decisão de Rodrigo, out/2026.) A **Direção** decide o que aparece e descreve cada insert (o que acontece nele e quais mídias entram: vídeo ou imagem, formato); a **Inserts** liga as mídias reais (por ora, manualmente, a partir do banco); tudo o que é edição do insert (moldura, zoom, rolagem animada, transição) é do **Enriquecimento**; o som, do **Áudio**.

Conteúdo típico: vídeos de Rodrigo (Asimov Academy) sobre IA, agentes, produtividade e design, para Reels/TikTok. Os brutos têm erros, pausas e várias tentativas da mesma fala.

## 2. Escopo da v1

✅ **Entra:**
- Tela de projetos: criar novo e abrir existente.
- Upload de bruto, briefing (texto ou áudio) e vídeos de apoio.
- Pipeline automático ao criar o projeto, até a primeira sugestão de cortes.
- Interface completa (etapas, preview, timeline multitrilha, chat) em todas as etapas.
- Etapa **Cortes** funcionando de verdade.
- Etapa **Direção visual** funcionando de verdade, com a Calibragem (§8.2).
- Etapa **Inserts** funcionando de verdade para sites, páginas e vídeos por URL (§8.3).
- **Enriquecimento, Motion, Áudio e Legenda** como mocks: layout real, dados falsos na timeline e ferramentas fictícias no agente.
- Desfazer/refazer e versões nomeadas.
- Exportação MP4 a partir de qualquer etapa.

✅ **Fica fora da v1:**
- Lógica real de enriquecimento, motion, áudio e legenda (cada uma é implementada depois, uma de cada vez).
- Multicâmera / mais de um bruto por projeto (o modelo de dados já aceita várias fontes).
- ~~Acervo global de apoios compartilhado entre projetos.~~ Entrou: o Banco de mídias dos Inserts (§8.3).
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
├── README.md          # o que é e como rodar
├── dev.sh             # sobe backend + frontend
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI, rotas
│   │   ├── comum.py           # .env, modelos do OpenRouter, mídia para a IA (base64), normalizador de texto, JSON atômico
│   │   ├── projeto.py         # projeto.json, configuração do app (_config.json), motores de transcrição
│   │   ├── pipeline.py        # fila do projeto: proxy, silêncios, transcrição, alinhamento, cortes, motores extras
│   │   ├── midia.py           # ffmpeg/ffprobe (erro legível, medidas), proxy, áudio, silêncios, forma de onda, miniatura
│   │   ├── transcricao.py     # MLX Whisper por pedaços + stable-ts
│   │   ├── motores.py         # outros motores (Qwen, CTC, Parakeet, ElevenLabs…)
│   │   ├── cortes.py          # seleção pela LLM, montagem dos clipes, edição manual
│   │   ├── referencias.py     # vídeos da Calibragem em disco, favoritos
│   │   ├── direcao.py         # análise das referências (cenas, IA multimodal, montagem, descrição dos inserts) e revisão
│   │   ├── calibragem.py      # roteiros dirigidos e heurística da direção (regras + roteiros de exemplo)
│   │   ├── direcao_projeto.py # direção do projeto: diretora, formatadora, corretora, versões
│   │   ├── inserts.py         # banco de mídias (subir, descrever com IA, buscar, usos, trechos, corte do original) e as mídias ligadas a cada insert
│   │   ├── captura_site.py    # captura de site para um insert: prévia da página inteira, dobras, gravação (Playwright)
│   │   └── mocks.py           # V2/V3/LEG e chat simulados
│   ├── tests/
│   └── pyproject.toml
├── frontend/src/
│   ├── paginas/       # Projetos, Editor, Banco, Calibragem, RevisaoReferencia, Referencias, Heuristica, Configuracoes, NovoProjeto
│   ├── editor/        # timeline vertical de Cortes, player, preview, etapas Direção e Inserts, painel/timeline das etapas simuladas
│   ├── components/    # marca, navegação da home, Modal, componentes shadcn (ui/)
│   └── referencias/   # timeline de direção, edição, detalhe (com o editor do insert), Markdown, painel da Calibragem
├── projetos/          # dados dos projetos (fora do git)
├── referencias/       # vídeos da Calibragem, _favoritos.json, _heuristica.json (fora do git, §8.2)
├── banco/             # mídias dos inserts (global, fora do git, §8.3)
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
├── direcao_log/        # prompt e resposta de cada geração da direção (§8.2.2)
├── inserts_log/        # registro de cada busca de insert (§8.3)
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
  "timeline": { "V1": [], "V2": [], "V3": [], "LEG": [] },   // V1 = clipes do bruto; A1 segue a V1
  "transcricoes": { "elevenlabs": { "status": "pronto", … } }, "transcricao_ativa": "elevenlabs",
  "cortes": { "mantidas": [], "duvidas": [] },
  "direcao": { "status": "pronto", "versoes": [], "ativa": 1, "itens": [] },   // §8.2.2 (campos da versão aberta espelhados)
  "inserts": { "versao": 1, "pedidos": [] },                                 // §8.3
  "etapas": { "cortes": "pronta", "direcao": "pronta", "inserts": "pendente", "enriquecimento": "pendente", "motion": "pendente", "audio": "pendente", "legenda": "pendente" },
  "chats": { "cortes": [], "direcao": [], "inserts": [], "enriquecimento": [], "motion": [], "audio": [], "legenda": [] },
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

💡 Layout atual do editor (o chat só aparece nas etapas ainda simuladas):
- **Barra de cima** (todas as telas, inclusive o editor; pílulas no estilo `.tab` do Otto: contorno fino, a ativa em creme): primeiro os **projetos abertos como abas**, depois de um separador **Projetos · Banco · Referências · Calibragem · Heurística da direção** (§8.2.0). Abas de projeto (decisão de Rodrigo, out/2026): abrir um projeto cria a aba; ela fica nas outras telas para voltar; o × fecha (e, se é a aba atual, volta a Projetos); dois cliques no nome da aba ativa renomeiam o projeto. Guardadas neste navegador (`abas.projetos`). Cada projeto reabre na última etapa usada (`editor.etapa.<id>`).
- **Barra das etapas** (à esquerda, em todas as etapas): recolhível — recolhida, só os números (01, 02…, com o nome ao passar o mouse); a escolha fica guardada neste navegador (`editor.barraRecolhida`).
- **Topo do editor:** marca · a barra de cima (com a aba do projeto) · desfazer/refazer/versões (futuro) · Configurações · botão especial da etapa ("Refazer cortes" / "Refazer direção") · selo "Simulados" (o detalhe ao passar o mouse) · Exportar (fase 4).
- **Cortes:** etapas · timeline vertical do bruto · vídeo + detalhe.
- **Direção visual:** etapas · barra de versões + timeline vertical (fala, planos, elementos, 💬 comentários) · vídeo cortado com esboço do layout · detalhe.
- **Inserts** (estilo editor de vídeo, horizontal): etapas · à esquerda o card de trabalho do plano (Inserts num insert, Motion num motion) · vídeo cortado com as mídias no lugar e o enriquecimento aproximado · à direita o card de Enriquecimento · linha do tempo horizontal embaixo (planos · mídias · elementos · fala).
- **Áudio, Legenda (mock):** etapas · painel + preview com timeline horizontal multitrilha · chat.

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
- ✅ **Timeline vertical (adotada; começou como experimento numa branch):** na etapa de Cortes a timeline fica **vertical**, entre a sidebar e o vídeo: o tempo corre de cima para baixo, com régua, forma de onda, barras de tempo exato e cada palavra ao lado do seu instante (se dois rótulos colidem, o de baixo desce e uma linha o liga ao seu tempo). O vídeo ocupa a coluna central, com o detalhe embaixo. Os controles (Resultado/Bruto, ✂ Cortar trecho, Recalcular, Expandir tudo, zoom) ficam no topo da timeline. **Refazer cortes com IA** é um botão de destaque na barra do topo, à direita da engrenagem de Configurações (só na etapa de Cortes).
- ✅ **Vários motores de transcrição (decidido com Rodrigo):** o mesmo áudio é transcrito por mais de um motor e Rodrigo escolhe, na tela, qual **ver** e qual **comparar** (o texto do motor B aparece numa **segunda coluna ao lado do A, com as palavras e os tempos de cada um** e o instante exato de cada palavra no `title` e no detalhe; assim se veem palavras que um motor perde, escreve diferente ou marca em outro instante. Com o mesmo texto, o detalhe da palavra mostra a diferença em ms). **Nesta etapa o chat do agente não aparece** (Rodrigo: não é necessário agora; volta quando o agente existir).
  - **Famílias:** motores que só realinham o texto do Whisper (stable-ts, Qwen3-ForcedAligner, CTC, Whisper puro) compartilham texto e IDs de palavra, então **trocar entre eles mantém os cortes e os ajustes** e só muda os tempos exibidos. Motores que escrevem texto próprio (Parakeet, ElevenLabs) têm **cortes próprios**: ao escolher um pela primeira vez a IA os faz (~25 s); os cortes da família anterior ficam guardados e voltam intactos ao retornar.
  - **Padrão (decisão de Rodrigo, depois de comparar):** o **ElevenLabs Scribe v2** — acertou as palavras repetidas ("gastando gastando") que o Whisper reduzia a uma, sem "limpar" o texto. O motor padrão dos projetos **novos** é uma configuração do app (engrenagem na tela inicial e no editor; `projetos/_config.json`) e também pode ser escolhido ao criar cada projeto. Mudar a configuração não altera projetos existentes (`motor_inicial` fica no projeto).
  - **Fluxo:** o passo de transcrição usa o motor do projeto; os cortes saem dele. Os outros motores (inclusive o Whisper e o Whisper + stable-ts, que os alinhadores usam como base) rodam depois, em segundo plano e em fila própria, e aparecem no seletor quando ficam prontos; falhas e falta de chave aparecem com o motivo e "Tentar de novo". Um motor que falha não derruba os outros. **Se o motor padrão falhar** (sem chave, sem rede, cota), o projeto **segue com Whisper + stable-ts** e avisa o motivo na tela de processamento, em vez de travar. Medido no bruto de teste (2:02): com o ElevenLabs, cortes prontos ~32 s depois de criar o projeto (transcrição 4 s).
  - **Motores que transcrevem + dão tempos** (interesse de Rodrigo, para achar palavras que o Whisper perde): Parakeet v3, **Qwen3-ASR 1.7B + Qwen3-ForcedAligner** (o ASR escreve pedaço a pedaço entre as pausas e o alinhador dá os tempos de cada pedaço), **Whisper large-v3 + stable-ts** e ElevenLabs Scribe v2. O Qwen3-ForcedAligner sozinho (`whisper-qwen`) **não transcreve**: só calcula tempos para um texto pronto.
  - **ElevenLabs:** só roda com `ELEVENLABS_API_KEY` em `backend/.env` (lida a cada execução, sem reiniciar). **Envia o áudio da voz a um terceiro** (Rodrigo autorizou API na Q8 b). Já rodou com a API real no bruto de teste (3,4 s, 353 palavras).
- ✅ **Cortes compactados:** cada corte aparece como uma linha de 34 px (`✂3 −9,6 s · 30 pal. “mas na minha opinião…”`) com o ícone ⇕ para expandi-lo no tempo real; os trechos mantidos continuam proporcionais ao tempo. O botão **"Expandir tudo" / "Compactar tudo"** (com texto, na linha de controles) abre ou fecha todos de uma vez. O ícone de expandir fica no **canto direito** da linha compactada, e o controle de compactar de um corte expandido **acompanha a rolagem** (gruda no topo da janela enquanto o corte aparece), para não precisar rolar de volta até ele. Selecionar uma palavra escondida num corte compactado o expande.
- ✅ **Precisão do arrasto (corrigida a pedido de Rodrigo):** o limite se move pelo **deslocamento do mouse desde onde a alça foi pega** (antes saltava até metade da altura da alça ao começar: medido +227 ms para um arrasto esperado de +182 ms; agora +182 ms em qualquer ponto de pegada) e só começa a andar após 3 px. **Sem ímã** (removido a pedido de Rodrigo, out/2026: prefere controle preciso): o limite vai exatamente onde o mouse vai. Os tempos das palavras vêm do motor de transcrição e podem errar dezenas de ms, então o rótulo do arrasto diz onde a borda cai ("em pausa", "entre palavras" ou "dentro de “x”, N ms depois do início" em vermelho) e, com uma alça selecionada, **↑/↓ ajustam 10 ms (Shift 1 ms, Alt 50 ms)**. A forma de onda tem um pico a cada 5 ms.
- ✅ **Emendas precisas na prévia (out/2026, a pedido de Rodrigo: sobrava o começo do "mas" depois de um corte):** o dado do corte estava certo (medido: o "mas" começa em 13,29 s no áudio, o corte termina em 13,213 s; o ASR marcava 13,42 s); o vazamento era do player, que conferia o tempo só a cada quadro de tela e depois saltava (o salto também demora). Agora, a 150 ms do fim de um trecho, o salto é agendado para o instante exato (tempo extrapolado pelo relógio do sistema), o vídeo é silenciado nesse instante e o som volta quando o salto termina (`usePlayer`). Vale também para o fim de "ouvir trecho". A exportação, quando existir, corta no ponto exato pelo ffmpeg.
- ✅ **Arrastar os limites dos cortes:** nos cortes expandidos, as duas pontas têm alças. Arrastar muda o fim do trecho mantido de cima ou o início do de baixo. Uma linha tracejada mostra de onde a borda saiu e uma amarela, onde vai cair, com o deslocamento em ms. Regras no servidor (`cortes.ajustar_borda`): a borda não passa do trecho vizinho nem deixa um trecho com menos de 50 ms ou sem palavras mantidas; as palavras entre a posição antiga e a nova passam a ficar (ou sair) conforme pelo menos metade delas esteja dentro de algum trecho; a âncora do trecho é recalculada. O primeiro ajuste guarda o valor da IA em `auto` (e a seleção original em `cortes.mantidas_auto`), e o detalhe do corte mostra "ajustado à mão" com **Restaurar da IA**. Refazer os cortes com a IA pede confirmação se houver ajustes e os descarta. Desfazer/refazer em geral continua para a 3b-2.
- ✅ **Cortes à mão:** o botão **✂ Cortar trecho** arrasta um intervalo sobre a onda (Esc sai) e cria um corte onde a IA não cortou; o novo corte já abre selecionado. Cada corte tem um **✕ Excluir corte** (na linha compacta e nos controles do corte expandido, que acompanham a rolagem) que devolve o trecho. No servidor, `POST /cortes/faixa {inicio, fim, manter}` (`cortes.alterar_faixa`): ancora por sobreposição de palavra (≥ 30 ms), descarta pedaços sem palavras e respeita `MIN_CORTE` 20 ms e `MIN_CLIPE` 50 ms.
- ✏️ **Renomear o projeto:** clique no nome na barra do topo (Enter ou sair do campo salva, Esc cancela). Muda só o nome exibido; o id e a pasta continuam (`PUT /api/projetos/{id}/nome`).
- ⚙️ **Configurações com abas por categoria:** **Geral** (sobre o criador), **Cortes** (motor, margens, pausas longas) e **Direção visual** (modelos, formato da análise, o que o diretor recebe); Inserts, Motion e Legenda entram como novas abas. Cada mudança é gravada na hora em `projetos/_config.json` como padrão do app (`GET/PUT /api/config`).
- ✅ **Correção (montagem dos clipes):** a borda de um trecho mantido nunca passa do início da palavra removida vizinha. Antes, a borda era puxada para o silêncio mais próximo e, se esse silêncio ficasse depois de uma palavra removida, o áudio dela voltava para o vídeo.
- ✅ **Velocidade do vídeo:** 0,25×, 0,5×, 1× e 2× ao lado do play (o tom é preservado); vale também para "ouvir emenda".
- 💡 **Zoom da linha do tempo** (pedido de Rodrigo, out/2026): ⌘ + e ⌘ − (Ctrl no Windows) aproximam e afastam a linha do tempo da tela aberta (Cortes, Direção, Inserts, as outras etapas e a revisão da Calibragem), no lugar do zoom da página do Chrome (`editor/useAtalhoZoom.ts`).
- 💡 **Atalhos na etapa:** espaço toca/pausa; ←/→ 0,5 s (Shift 5 s, Alt 10 ms); **E** ouve a emenda mais próxima; **B** alterna "tocar resultado" e "tocar bruto"; Ctrl/⌘ + roda do mouse dá zoom na timeline (até 1 ms ≈ 12 px). Parado dentro de um trecho cortado, o player fica onde está (dá para inspecionar o que saiu); o pulo só acontece ao tocar.
- 💡 **Diagnóstico no detalhe do corte:** a que distância (ms) cada ponta do corte está da palavra vizinha, se entra dentro da palavra (⚠) e se cai numa pausa real do áudio (⚠ se não). A faixa "Whisper" mostra, sob cada palavra, onde o Whisper a tinha marcado.
- **Referências:** cortes e palavras têm rótulos estáveis (✂ 3, w00091); botão "copiar referência" (`✂3 · 27,512 s · w00091`) para colar no chat. Marcadores com nota ficam para depois.
- **Ouvir emenda:** botão e atalho em cada corte, tocando ~2 s antes e ~2 s depois com o corte aplicado, com loop opcional.

✅ **Como Rodrigo corrige** (3b-2). Feito: alças nas bordas, cortar e excluir trechos, restaurar da IA, recalcular. Falta: ligar/desligar palavras pelo texto, travas manuais, desfazer/refazer e versões. São três formas, sempre sincronizadas: mudar em uma atualiza as outras.
1. **Texto:** transcrição com as palavras cortadas riscadas. Clicar ou selecionar liga e desliga o corte, o que permite escolher outra tentativa da mesma frase.
2. **Timeline:** clipes com waveform, alças para arrastar as bordas, ajuste fino quadro a quadro pelo teclado e aumento ou redução de respiros.
3. **Chat:** pedidos em linguagem natural ("volta a primeira tentativa da abertura", "corta mais seco entre 0:12 e 0:20"). ✅ **Adiado para bem depois** (o chat segue simulado).

✅ **Reenquadramento:** a saída é sempre 9:16, 1080×1920. Se o bruto for horizontal, um recorte **parado** (sem tracking, sem zoom) é arrastado no preview e vale para o vídeo inteiro. Se o bruto já for vertical, o controle não aparece.

💡 Ferramentas do agente nesta etapa: `ver_transcricao`, `ver_timeline`, `sugerir_cortes` (refaz a seleção inteira), `manter_palavras(ids)`, `remover_palavras(ids)`, `ajustar_borda(clipe, lado, segundos)`, `ajustar_respiro(entre_clipes, segundos)`, `tocar_trecho(inicio, fim)` (posiciona o player).

💡 Representação: cada clipe da V1 guarda o intervalo de palavras que realiza e um ajuste manual de borda (início/fim, em segundos). Ligar ou desligar palavras regenera os clipes, preservando os ajustes manuais dos clipes que continuarem existindo.

✅ **Refazer cortes com IA** (botão na timeline) pede uma nova seleção sem retranscrever. Depois da 3b, as palavras que Rodrigo ligou ou desligou à mão ficam **travadas**: a IA refaz o resto e respeita essas escolhas.

### 8.2 Direção visual

✅ **O que é (decisão de Rodrigo, out/2026):** etapa entre Cortes e Inserts que decide **o que aparece na tela em cada momento** do vídeo cortado. Não edita mídia: escolher e recortar clipes fica em Inserts e Motion, que partem desta direção. Aprende com vídeos já editados do criador (Calibragem): os pares **fala → o que apareceu na tela**, os **indicadores** tirados deles e a **heurística** escrita a partir dos indicadores (§8.2.1). Só jogar os pares para a IA não funcionou tão bem, e uma heurística numérica ("62% das vezes depois de X vem Y") também não captou o espírito (Rodrigo, out/2026): o que vale é a **intuição qualitativa** — que tipo de frase casa com que visual —, com os números só como noção de proporção e duração.

✅ **Duas camadas, categorias fixas** (a IA não cria categorias; novas só quando Rodrigo cadastrar):
- **Planos-base** (um por vez, cobrem o vídeo sem buracos; um grupo novo a cada troca): `Full ator` · `Full ator com lettering` (o ator em tela cheia com um texto de destaque sobre ele; dura enquanto o texto está na tela, então pode dividir um trecho sem corte de cena) · `Insert tela cheia` · `Motion tela cheia` · `Tela dividida · insert` (material real em cima — gravação de tela, site, app, print, filmagem —, o ator embaixo) · `Tela dividida · motion` (motion em cima, o ator embaixo). Até out/2026 era um tipo só, `Tela dividida`, com o que vai em cima num campo (`conteudo`); Rodrigo pediu dois tipos (`tela_dividida_insert`, `tela_dividida_motion`). Os dados salvos foram convertidos e o código ainda aceita o formato antigo (`direcao.tipo_atual`), inclusive no cache de trechos das referências · `Comentário + insert + ator` (comentário de seguidor sobre um insert/motion em cima, o ator embaixo respondendo). Os dois planos com texto guardam o texto exato (do lettering ou do comentário).
- **Elementos** (dentro de um plano, podem durar menos e se sobrepor): `Lettering` (palavra destacada sobre um plano que não é o ator em tela cheia) · `Palavra ManyChat` (CTA de comentário) · `Caixinha de perguntas` · `Print/imagem sobreposta`.
- Zoom/punch-in no ator não é plano: fica para a edição (Enriquecimento).
- **Inserts na marcação** (decisão de Rodrigo, out/2026, quando a Inserts passou a ser manual): nos planos com insert, a **marcação é o que acontece no insert**, em ordem, edições incluídas ("o GitHub do Graphify entra subindo, zoom no número de estrelas, troca para o README"). Um campo só: sem lista de mídias, sem vídeo × imagem, sem formato (as mídias sobem à mão; distinguir material com movimento próprio de imagem editada era pouco confiável) e sem "como gerar" (a receita de captura perdeu o sentido). Em nenhum plano a marcação descreve o layout que o nome do plano já diz (tela dividida, apresentador embaixo); num full ator sem nada de especial, ela pode ficar vazia. (Antes houve uma `captura` com categoria e takes, depois um `insert` com narrativa e mídias; os dois saíram.)

✅ **Cada item guarda:** tipo; início e fim **nas palavras** (§9) **e em segundos** (pode começar no meio de uma palavra ou numa pausa); **marcação** — a anotação de roteiro do bloco, em 1 a 2 frases: o que aparece e o que acontece na tela, ligado à fala, sem repetir o nome do plano (campo `descricao`; substituiu a descrição longa em out/2026); texto exato (lettering, palavra do ManyChat, pergunta da caixinha, comentário); miniatura (um quadro do meio). (Houve um campo "função", depois uma "função da fala" em lista fixa, e um "como gerar"; saíram em out/2026.)

#### 8.2.0 Telas na home (decisão de Rodrigo, out/2026)

✅ Barra de cima: **Projetos** · **Banco** (§8.3) · **Referências** · **Calibragem** · **Heurística da direção**. (Houve abas dentro da Calibragem e de Referências, e uma heurística de captura separada por categoria; saíram quando a captura passou a fazer parte da direção.)
- **Calibragem** (`/calibragem`, antiga "Referências"): sobe os vídeos editados, a IA analisa e Rodrigo revisa (§8.2.1). O nome deixa claro que ainda estamos calibrando o modelo. Clicar num vídeo analisado abre a revisão dele; o ícone de gráfico abre os números; dois cliques no nome (ou o lápis) renomeiam (`PUT /api/referencias/{id}/nome`).
- **Heurística da direção** (`/heuristica`): as regras (do criador e sugeridas pela IA, cada uma com a seção "Inserts") e os roteiros de exemplo de cada referência (§8.2.1).
- **Referências** (`/referencias`): galeria de **todos os planos-base** (com a marcação de cada um) identificados nos vídeos analisados (`GET /api/referencias/clipes`). Segunda barra com as categorias (Todos + os 6 planos, com contagem), busca na descrição/texto/fala, "só revisadas" e ordem (aleatório, mais longos, mais curtos, por vídeo). Cada card toca o seu trecho, mudo, ao passar o mouse; clicar abre um modal com o player ("Este trecho" em loop ou "Vídeo de origem" inteiro), uma faixa com todos os planos do vídeo de origem (este destacado; clique leva o vídeo para ali), texto, descrição, fala e os dados do clipe: duração, posição (tempo, % e "plano N de M"), como entra na fala (pausa / entre palavras / dentro da palavra, começo ou meio de frase, ms até a palavra), palavras e ritmo, plano anterior e seguinte, elementos dentro dele; e do vídeo de origem: duração, nº de planos e quanto do tempo cada categoria ocupa (`direcao.clipes`). ← → passam para o próximo; a faixa de planos ocupa a largura do modal, embaixo. Grade de 8 clipes por linha.
- **Favoritos** (estrela no card, no modal ou tecla F; filtro "★ Favoritos"): ficam em `referencias/_favoritos.json`, identificados pela referência e pelo intervalo (não pelo id do plano, que muda ao reanalisar), com uma cópia de tipo, conteúdo, descrição e texto. São as **preferências** de Rodrigo que vão guiar as IAs na próxima etapa (`PUT /api/referencias/{id}/favorito`).
- **Chips das categorias agrupados**, cada um com um ícone (`referencias/IconeGrupo.tsx`: grade, duas faixas, celular, T, pessoa, balão), aqui e no "Buscar por referências": Tela dividida (insert e motion), Tela cheia (insert e motion), Full ator com lettering, Full ator e, no fim, Comentário + insert + ator (uma categoria nova vira chip próprio antes do comentário); e **"Ignorar Full ator"** à direita, marcado por padrão (lembrado no navegador): esconde os planos em que só o ator fala (Full ator e Full ator com lettering). Favoritar não tira o card do lugar: a ordem aleatória é sorteada uma vez por clipe enquanto a página está aberta (pedidos de Rodrigo, out/2026).

#### 8.2.1 Calibragem (treinamento) — construída primeiro

✅ Tela **"Calibragem"** na home (§8.2.0). É do app (vale para todos os projetos). Só vídeos **verticais** por enquanto; cada referência guarda `formato`.
✅ **Entrada: só o MP4 final editado.** Upload de vários de uma vez; cada um entra numa fila com status visível: na fila → analisando → a revisar → revisado.
✅ **Análise automática (híbrida):**
1. **Código:** detector de cena (PySceneDetect, local) acha os cortes duros com precisão de quadro; a transcrição usa o motor padrão do app (ElevenLabs).
2. **LLM multimodal em paralelo, uma chamada por trecho:** recebe o **trecho em vídeo, com áudio** (padrão; opção: mosaicos de quadros com o tempo escrito) e a **transcrição do começo do vídeo até o fim do trecho** (nada do que vem depois), com a fala do trecho marcada entre `<momento_analisado>` e `</momento_analisado>`. Devolve plano-base, elementos com início/fim, descrição e texto exato, em saída estruturada, sempre dentro das categorias fixas.
3. **Código:** prende os tempos às palavras e junta trechos vizinhos com o mesmo plano.
4. **Inserts (etapa "inserts", depois da montagem):** cada plano com insert é assistido de novo, inteiro (a análise só viu pedaços entre cortes de cena), e o modelo reescreve a **marcação** dele: o que acontece no insert, sem descrever o layout. 3 blocos por vez. A detecção de planos e elementos não muda. Medido nas 8 referências: 141 blocos em ~4 min. As marcações dos planos sem insert das 8 referências passaram uma vez por uma limpeza só de texto (out/2026), que tirou o layout e o óbvio ("o apresentador falando para a câmera"); full ator comum ficou com a marcação vazia. O original ficou em `direcao.antes-limpeza.json`. Sem isso, a diretora imitava os exemplos e continuava descrevendo layout.
✅ **Revisão** (mesma linguagem da tela de Cortes): vídeo de referência no centro, timeline vertical à esquerda com as palavras, uma faixa de planos-base e uma de elementos; bordas arrastáveis com ímã em palavras e cortes detectados; detalhe editável (tipo, marcação — nos inserts, "o que acontece no insert" —, texto, miniatura); criar item onde o detector perdeu o corte; **"✓ Marcar como revisado"**. Só pares revisados entram no dataset.
✅ **Roteiros dirigidos (decisão de Rodrigo, out/2026):** a Calibragem não produz números nem padrões: produz **roteiros**. Cada vídeo de referência vira a fala com a marcação do que aparecia na tela, uma linha por corte de cena:
```text
[Comentário + insert + ator: pergunta do seguidor sobre um print do YouTube «Por onde começo?»]
“Se eu tivesse que começar a IA hoje, por onde começaria?”

[Full ator: ele olhando para a câmera, respondendo direto]
“Cara, eu não tentaria aprender tudo ao mesmo tempo.”
```
Sem tempos nem proporções: só o roteiro e o que fazia sentido mostrar ali. Montado pelo código (`calibragem.roteiro`) a partir da análise: a marcação vem do campo do bloco, com o nome do plano, o texto, os elementos (`+ palavra manychat «X»`, `+ caixinha…`, `+ print…`). O **lettering vai na fala**, preso às palavras (decisão de Rodrigo, out/2026): `<lettering>GPT 3.7 Flash</lettering>`, ou `<lettering texto="R$ 97">noventa e sete reais</lettering>` quando o que aparece na tela é diferente do falado; uma palavra é do lettering se o meio dela cai dentro do intervalo do elemento analisado (sem reanalisar nada). Na tela da Calibragem, as palavras com lettering aparecem destacadas. Corrige-se na revisão do vídeo e o roteiro acompanha. A **função da fala** e os **números** (D4 e a versão seguinte) saíram: "a coisa mais importante é a direção sobre o roteiro".
✅ **Telas:** clicar num vídeo da Calibragem abre um **modal** com o **roteiro decupado** ao lado do vídeo (clicar numa linha toca aquele trecho em loop) e **"Abrir calibragem"** (a revisão). A **Heurística da direção** é uma página própria na barra de cima (§8.2.0).
✅ **Heurística da direção = regras + roteiros de exemplo** (`calibragem.py`, `referencias/_heuristica.json › regras`):
- **`## Regras do criador`** (dele, obrigatórias) e **`## Regras sugeridas pela IA`** — texto Markdown, com **Ler** e **Editar**. Cada uma tem uma subseção **`### Inserts`** (como escrever a marcação dos inserts: o que aparece, como entra, zooms, destaques, trocas; nunca o layout). A heurística de captura que existiu separada foi unificada (out/2026; a versão separada ficou em `referencias/_heuristica_captura.antiga.json`) e depois trocada pela de inserts. "Sugerir regras com IA" lê os roteiros e refaz só a seção sugerida (2 a 5 regras de direção + 2 a 5 de inserts); as do criador nunca são tocadas; a versão anterior fica guardada ("↺ Voltar"). As versões anteriores da heurística (catálogo, padrões, campo das Configurações) migraram: ficaram só as regras.
- **`## Roteiros de exemplo`**: todos os vídeos analisados, montados na hora a partir da análise (não se editam no documento). Na tela, cada vídeo abre e cada linha toca o trecho.
- Vai **inteiro** para o prompt do diretor dos projetos (§8.2.2): ele aprende a dirigir "olhando o roteiro acima de tudo".
✅ **Configurações › aba "Direção visual":** modelo multimodal (padrão `google/gemini-3.8-flash` via OpenRouter) e como a IA vê cada trecho: **Vídeo** (padrão) ou **Mosaico** (grade 3×2 ou 3×1, 1 a 4 quadros/s, no máximo 40 quadros por trecho). Trocar qualquer um faz a próxima análise refazer os trechos.
💡 Fatos levantados (out/2026): o OpenRouter aceita vídeo para Gemini como `video_url` com data URL base64 (o `langchain-openrouter` converte o bloco `video`); não está confirmado que repassa `fps`/recorte, então o recorte e a taxa de quadros são feitos antes, com FFmpeg. O Gemini sozinho localiza eventos com erro de ~±1 s (1 quadro/s padrão): por isso os cortes vêm do detector de cena. Custo estimado: centavos de dólar por vídeo de 2 min.
✅ **Como foi construído (D2–D3, out/2026):**
- Passos por referência (estado em `referencia.json` › `analise.passos`, a tela acompanha): proxy 720p → áudio, silêncios e transcrição (motor padrão; ElevenLabs ou, se falhar, Whisper + stable-ts) → cenas (PySceneDetect **adaptativo** no proxy; ~1–6 s por vídeo) → análise por trecho → montagem → descrição dos inserts. Arquivos: `proxy.mp4`, `palavras.json`, `cenas.json`, `trechos/NNN.json` (cache por trecho, chave = início, fim, modelo e quadros/s), `analise.json`, `direcao.json` (`itens` revisados, `itens_ia` como a IA entregou, `cortes`), `quadros/` (miniaturas).
- A LLM recebe, por padrão, o **trecho como vídeo MP4 com áudio** (640 px de altura; o Gemini amostra ~1 quadro/s em resolução reduzida e ouve o áudio), a transcrição até o fim do trecho com o momento marcado e um quadro logo antes do trecho. Os tempos que ela devolve são do vídeo inteiro (se vierem do clipe, o código soma o início). Opção em Configurações: **mosaico** 3×2 ou 3×1 de quadros com o tempo escrito (1–4 quadros/s), mais um quadro depois do trecho. Quadros separados (um por imagem) foram testados e descartados. Responde em saída estruturada (`AnaliseTrecho`: `continua_anterior`, `planos[]`, `elementos[]`; LangChain `with_structured_output(..., method='json_schema')`, os `Literal` viram `enum` e impõem as categorias). Raciocínio `low`, saída máx. 4.096 tokens, timeout 90 s, 2 trechos em paralelo. `VERSAO_ANALISE` entra na chave do cache: mudar o prompt refaz os trechos.
- Montagem: planos contíguos, **um por corte de cena** (cada um é uma linha do roteiro); só os jump cuts do Full ator se juntam. Itens presos às palavras (`palavra_ini`/`palavra_fim`), com miniatura do meio.
- Revisão (`/calibragem/:id`): timeline vertical própria (tempo linear, zoom 8–600 px/s), colunas fala · planos-base · elementos (elementos sobrepostos em faixas lado a lado), cortes de cena tracejados, ímã em palavras e cortes (Alt desliga), arrastar a troca entre planos e as pontas/corpo de elementos, dividir plano no cursor (S), novo elemento (E), excluir/juntar (Delete), desfazer (⌘Z), salvamento automático (`PUT /direcao`, o servidor valida com `direcao.validar_edicao`), "✓ Marcar como revisada" (`PUT /status`), "↻ Reanalisar" (refaz com o prompt atual; a versão anterior fica em `direcao.anterior.json`). O detalhe da direita segue o plano sob o cursor.
- Erros: se o OpenRouter recusar por **falta de crédito**, a fila pausa (as próximas referências ficam em erro com o aviso, sem gastar transcrição) até alguém clicar "Tentar de novo"; o que já foi analisado é reaproveitado.
💡 Medido (out/2026, Gemini 3.8 Flash): **vídeo é o mais barato**: trecho de 2,7 s = 2,4 mil tokens em vídeo × 9,9 mil em quadros separados; trecho de 13 s = 4,1 mil × 34 mil, com descrições tão boas ou melhores (vê o movimento). Rodrigo escolheu vídeo como padrão. Antes disso: o Gemini 3 cobra ~1.100 tokens **por imagem**, qualquer que seja o tamanho; mandar um quadro por imagem custava ~9–19 mil tokens por trecho. Com mosaicos 3×2, o mesmo trecho de 6,5 s caiu de 18,7 mil para 7,7 mil tokens (5,5 s), mesma análise. Um Reel de ~50 s tem ~20 trechos. A análise acerta muito bem planos, caixinha de perguntas (com o texto) e motions; a legenda palavra a palavra precisa ser ignorada explicitamente no prompt, e um texto que é o próprio motion não deve virar lettering.
💡 Lição: `referencias/` no `.gitignore` sem a barra inicial ignorava também `frontend/src/referencias/` (o Tailwind não lia as classes e o git não versionaria os arquivos). Pastas de dados ficam ancoradas na raiz (`/referencias/`).
💡 Lição: um `ffmpeg` filho continua rodando quando o servidor recarrega no meio do proxy; dois escrevendo no mesmo arquivo temporário corromperam um proxy. O temporário agora é único por processo/thread.

#### 8.2.2 Direção visual no projeto

✅ **Implementada (D5, out/2026), aguardando avaliação.** Decisões de Rodrigo: entrada só o necessário (a transcrição do vídeo cortado); exemplos = **todas** as referências analisadas por enquanto (revisadas ✓ e favoritos ★ marcados no prompt; a regra muda depois); saída no formato da Calibragem; bordas por **intervalos de palavras** escolhidos pela IA; exemplos inteiros no prompt; **nenhuma regra extra** (a IA infere dos exemplos); modelo Gemini Flash configurável (Configurações › Direção visual › "Modelo da proposta").
- **Em duas etapas (decisão de Rodrigo, out/2026):** (1) a **diretora** recebe a heurística inteira (regras + roteiros de exemplo) e a fala do vídeo novo **como texto corrido** (sem IDs nem tempos) e escreve o **roteiro dirigido** no mesmo formato dos exemplos (`[plano: marcação + elementos]` + a fala copiada, bloco a bloco) — só intuição, sem formatação; (2) o **código alinha** a fala de cada bloco às palavras reais em sequência (`difflib`, tolera acentos, pontuação e palavras puladas; palavras sem par ficam com o bloco anterior; bloco sem nenhuma palavra some) — exato e sem custo, porque transformar texto em IDs de palavra é onde as IAs mais erram; (3) a **formatadora** transforma cada marcação nos campos (tipo, texto, elementos e marcação limpa), sem decidir nada. Nos inserts, a marcação da diretora conta o que acontece neles (§8.2), como nos roteiros de exemplo. **Letterings:** a diretora os marca na fala com `<lettering>` (uma tag por trecho, sem aninhar; tag aninhada ou sem par é ignorada e vale a de fora); o **código** lê as tags no mesmo passo do alinhamento e cada trecho marcado vira um elemento Lettering preso exatamente às palavras casadas (texto = o atributo `texto` ou as palavras faladas). A formatadora não cria letterings. Não há agente separado para destaques (cogitado e descartado por Rodrigo). O roteiro intermediário fica no registro. Medido no vídeo de teste: 224 de 224 palavras alinhadas; ~20 s e ~14 mil tokens; a diretora fez blocos mais longos que a versão de uma etapa (14 contra 20 planos), mesmo com o pedido de blocos curtos.
- Montagem (`direcao_projeto.montar`): planos contíguos (o primeiro começa na primeira palavra) e a troca dentro da pausa (até 80 ms antes da palavra; elementos 50 ms antes e até 150 ms depois).
- **Diretora (decidido por Rodrigo, out/2026):** Gemini 3.8 Flash com raciocínio médio; modelo e raciocínio ficam em Configurações › Direção visual › "Diretora" (`modelo_diretora`, `raciocinio_diretora`). A formatadora usa o "Modelo da formatadora". Uma direção por projeto (`projeto.json › direcao`); projetos antigos com `direcoes` por variação migram para a variação (a). Comparação que embasou a escolha (vídeo de teste, só a diretora): Flash raciocínio baixo 14 blocos, 2 Full ator > 4 s; Flash médio 22 blocos, 2 > 4 s, 51 s; Claude Sonnet 5.5 22 blocos, nenhum > 4 s; fala em pedaços curtos 28 blocos, picado demais.
- **Trocas de plano nas emendas:** a folga em volta da palavra-âncora (para a troca cair no silêncio) nunca atravessa uma emenda de corte: se a palavra é a primeira do trecho, a troca fica exatamente na emenda (no servidor, `_folga` = 0; na tela, o item é preso às bordas do trecho da palavra).
- **Versões e comentários (decisão de Rodrigo, out/2026):** a **v1** é a diretora + formatadora (numeração a partir de 1, pedido de Rodrigo). A partir dela, o criador **comenta pontos do vídeo** e pede a próxima versão: a **corretora** (mesmo modelo e raciocínio da diretora) parte da versão aberta, com os ajustes manuais, reescrita como roteiro dirigido (`roteiro_da_versao`: `[plano: marcação]` + fala com `<lettering>`). Cada comentário entra no ponto da fala como `{💬 comentário}`, e há um **comentário geral** opcional. Ela recebe também a heurística e devolve o roteiro inteiro corrigido, mudando só o necessário. Ele passa pelo mesmo alinhamento + formatadora. v2 = v1 + comentários + corretora, v3 = v2 + comentários…; gerar a partir de uma versão antiga cria uma nova no fim (ex.: v4 ← v2) sem apagar nada.
  - **Dados:** `projeto.json › direcao.versoes[]` (`n`, `origem`, `itens`, `itens_ia`, `roteiro`, `comentarios[]`, `geral`, `registro`…), `direcao.ativa`, e os campos da versão aberta espelhados no topo de `direcao` (`projeto.espelhar_direcao`). Direções de antes viram a v1 (e versões numeradas a partir de v0 são renumeradas). Ajustes e comentários ficam na versão aberta; os comentários de uma versão ficam guardados nela (a nova começa sem). O pedido em andamento fica em `direcao.pedido` (`gerar` ou `corrigir` + `de`) e é retomado se o servidor reiniciar.
  - **Comentário:** preso a um ponto (palavra + deslocamento, como os itens, para acompanhar os cortes); a IA entende que fala daquela região. Na tela, uma coluna 💬 à direita dos elementos, com uma bolinha por comentário; passar o mouse mostra o texto com Editar e Excluir; clicar leva o vídeo ao ponto. O botão **💬+** anda com a cabeça de reprodução (e a tecla **C**), pausa o vídeo e abre o modal para escrever.
  - **Barra de versões** acima da timeline: `v1 · v2 ← v1 · v3 ← v2` (com 💬N); clicar abre a versão. **"Gerar vN"** abre um modal com os comentários da versão aberta e o comentário geral (exige pelo menos um dos dois); enquanto a corretora trabalha, a versão atual continua na tela. **"Refazer direção do zero"** (barra do topo) apaga todas as versões e comentários e gera uma nova v1, com aviso antes.
  - Rotas: `POST /direcao/corrigir {geral}`, `PUT /direcao/versao {n}`, `POST /direcao/comentarios {palavra, off, texto}`, `PUT|DELETE /direcao/comentarios/{cid}`, `GET /direcao/registro?versao=n`.
  - Medido (cópia do vídeo de teste, um comentário "aqui prefiro tela dividida mostrando o GPT Astra" + geral "lettering nos números"): 44 s, ~20 mil tokens; o Full ator comentado virou Tela dividida, entraram letterings nos números e os outros 20 planos ficaram iguais. A v3 do vídeo de teste foi gerada pela corretora com o geral "acrescente a captura": os 14 inserts saíram com captura (ex.: "designs de sites, de aplicativos, de apresentações" → 3 takes, o 2º na versão de celular 9:16); ponto fraco: "esses dois sites aqui" saiu com 1 take só.
  - 💡 Depois: comentários que se repetem entre vídeos virarem sugestões de Regras do criador.
- **Registro de cada geração** (pedido de Rodrigo): `projetos/<id>/direcao_log/<data-hora>.json` (cru: modelo e raciocínio da diretora, modelo da formatadora, tokens, prompt de sistema, mensagem, roteiro da diretora, resposta formatada) e `.md` (legível). Na etapa, "Prompt e resposta" mostra o da versão aberta (diretora na v1, corretora nas outras), em abas (`GET /api/projetos/{id}/direcao/registro`).
- Guardado em `projeto.json › direcao` (versões; os campos da versão aberta espelhados: `itens`, `itens_ia`, `roteiro`, `modelo`, `segundos`…). Cada item é **preso a palavras** + deslocamento (`palavra_ini`, `palavra_fim`, `off_ini`, `off_fim`); os tempos no vídeo final são calculados na tela. Se as palavras de um item forem cortadas, ele fica órfão (guardado, fora da timeline, com aviso).
- **Regras do criador:** ficavam em Configurações › Direção visual › "Regras da direção" e migraram para as Regras gerais da heurística. As de Rodrigo (out/2026): não começar com o apresentador em tela cheia (começar com tela dividida ou, no máximo, comentário + insert + ator); vídeo que começa lendo uma pergunta é de dúvida e começa com comentário + insert + ator.
- Tela (etapa 02): "Gerar direção com IA" na primeira vez (roda em segundo plano, ~40–60 s, alguns centavos); depois versões pela corretora ou "Refazer direção do zero" no topo. Mesma timeline e mesmo detalhe da revisão, sobre o vídeo cortado, com as emendas dos cortes tracejadas e no ímã; salvamento automático (`PUT /api/projetos/{id}/direcao`, convertido de volta para palavras); o preview desenha um **esboço do layout** (caixa de insert/motion em tela cheia ou em cima, lettering, comentário, elementos).
✅ O "guia de estilo destilado" previsto para depois virou a **Heurística** (§8.2.1). Com mais vídeos, falta decidir se os exemplos inteiros continuam no prompt ou só os mais parecidos (⏳ §17).

### 8.3 Inserts

✅ **O que é (Rodrigo, out/2026, inspirado num colega que começou assim):** por ora, **manual**. A direção diz o que acontece em cada insert e quais mídias ele pede (§8.2); o criador **sobe** os vídeos e imagens para o banco e os **liga** a cada insert. Zoom, destaques, caixas, entradas e o arranjo das mídias (lado a lado, uma depois da outra) são do **Enriquecimento**; o som, do **Áudio**. Um agente automático (busca na web, captura de páginas com Playwright, download de vídeos, login em ferramentas, sites úteis) existiu e foi **removido** nesta mudança; a captura automática pode voltar depois, separada por tipo (imagem: print da página no formato; vídeo: gravação).

✅ **Pedidos:** cada plano com insert da versão aberta da direção vira um pedido: a marcação (o que acontece no insert), a fala do bloco e a duração. Um pedido é identificado por tipo + palavras + marcação: numa versão nova da direção, os que não mudaram mantêm as mídias ligadas (`inserts.sincronizar`). Os candidatos escolhidos no agente antigo viraram mídias ligadas.

✅ **Mídias ligadas** (`pedido.midias`, em ordem): `{id, banco}` — um item do banco, original ou **trecho**. Até 12 por insert, opcionais, reordenáveis; sem divisão de tempo entre elas (é do Enriquecimento). `PUT …/inserts/{pid}/midias` grava a lista inteira (`inserts.definir_midias`, confere que cada item existe no banco). (Houve um "ponto de início" por mídia; saiu quando vieram os trechos.)

✅ **Buscar por referências** (`editor/BuscarReferencias.tsx`; pedido de Rodrigo, out/2026): botão amarelo no topo da coluna Inserts, no lugar do atalho para o Banco (que segue na barra de cima e em "Escolher do banco"). Abre um modal com os planos dos vídeos de referência (a galeria de Referências) já filtrados pelo grupo do plano selecionado (Tela dividida, Tela cheia, Full ator com lettering, Full ator, Comentário + insert + ator), com Favoritos, os outros grupos, busca e "Ignorar Full ator" (a mesma caixa da página Referências, marcada por padrão). Modal entre o largo e a tela toda (até 1320 px), cards a partir de 200 px. Passar o mouse toca o trecho mudo; clicar abre ao lado, com som e controles, em loop, com a marcação, o texto e a fala. Dá para favoritar dali.

✅ **Banco de mídias** (`banco/<id>/`, global, fora dos projetos; página **Banco** na barra de cima): `original.<ext>` (o arquivo como veio), no vídeo `proxy.mp4` (lado maior 1280, para tocar) e `miniatura.jpg`; `item.json` com nome, descrição, palavras-chave, **tipo** (vídeo · imagem, pela extensão), **formato** (o mais próximo da proporção real do arquivo, entre 16:9 · 16:10 · 4:3 · 1:1 · 4:5 · 3:4 · 9:16 · alto), dimensões, duração, origem e o estado da IA. Ao subir, a **IA descreve** em segundo plano (`modelo_direcao`; vê a versão leve `analise.mp4`/`analise.jpg`): descrição e palavras-chave sugeridas (não apaga o que o criador escreveu; a dela fica em `descricao_ia`), para no futuro sugerir o que vai onde. Descrições interrompidas por um reinício voltam para a fila. Busca no nome, na descrição e nas palavras-chave; filtro vídeo/imagem; **usos** calculados lendo os projetos; apagar tira a mídia de todos os inserts. As capturas do agente antigo ficaram (origem "captura automática").

✅ **Trechos e edição de vídeo (decisão de Rodrigo, out/2026):** um vídeo do banco pode ter **trechos** — itens filhos (`pai`, `inicio`, `fim`), **virtuais**: sem arquivo próprio, tocam o original; herdam dele descrição, palavras-chave e formato (descrição própria fica para o futuro). O **editor de vídeo** (modal) abre ao subir um vídeo num insert, ao escolher um vídeo original do banco e em "Editar" numa mídia ligada (e em "Editar vídeo" na página Banco): player, régua de tempo (clicar ou arrastar nela só anda pelo vídeo), timeline com tira de quadros (`GET /api/banco/{id}/tira`), cabeça de reprodução; clicar na timeline só busca, arrastar no vazio (6 px ou mais) cria um trecho, clicar num trecho o seleciona (com a lixeira no canto dele; Delete também apaga; espaço toca só ele) e arrastá-lo o move, as pontas ajustam, **I**/**O** marcam entrada e saída no ponto do player, setas andam um quadro (shift = 1 s), precisão de 1/30 s. Dentro de um insert, os trechos marcados entram no lugar das mídias daquele vídeo, em ordem, cada um uma mídia; sem trecho marcado, entra o vídeo inteiro (fechar sem salvar também deixa o inteiro). Mudar um trecho usado em outros inserts pergunta: muda em todos, ou salva como trecho novo. **Cortar o original** (aba do editor) regrava o arquivo só com a parte escolhida (H.264 CRF 14, em segundo plano; `edicao.status` no item) — é o único jeito de o original mudar; os trechos acompanham o novo começo e os que caem fora somem. Apagar o original apaga os trechos. Na grade do Banco só aparecem os originais, com o selo "N trechos"; o detalhe lista os trechos; no "Escolher do banco" cada original mostra os trechos logo abaixo, para escolher direto.

✅ **Captura de site** (`captura_site.py`; botão "Capturar site" no insert): URL e proporção — 16:9 (1440×810), 4:3 (1200×900), 1:1 (1080×1080) e 9:16 (1200×2133), **sempre a versão de computador** (a 9:16 é um computador em pé; a de celular mostrava pouco, pedido de Rodrigo). **Rápido por padrão** (pedido de Rodrigo): "Capturar" grava direto a 1ª dobra, do topo, com o carregamento, sem prévia. Só com **"Várias dobras"** o app lê a página inteira numa imagem — tela por tela, no Chrome com GPU: rola, espera 0,3 s o conteúdo aparecer, fotografa e empilha (a foto da página inteira de uma vez pegava as seções que só aparecem ao rolar ainda escondidas; cabeçalhos fixos só na 1ª tela; sobras de menos de 16 px no fim ficam de fora; ~6–8 s) — e o criador marca até 3 dobras na própria imagem: clicar no vazio marca, clicar numa dobra seleciona e arrastar a move, × (ou Delete) apaga. Se o site está num iframe do tamanho da tela (ex.: galerias do ds.asimov.academy), a prévia abre o iframe direto e é ele que é gravado → a captura roda em segundo plano; **várias ao mesmo tempo** (até 3 gravando, o resto na fila), no mesmo insert ou em outros, cada uma com o seu andamento no insert (`pedido.capturas`; as que terminam bem saem da lista na próxima captura, as com erro ficam até lá). Cada dobra grava **em tempo real** (decisão de Rodrigo: qualidade máxima), parada, com as animações de entrada: screencast do Chrome (CDP `Page.startScreencast`, JPEG q100) no headless novo com GPU (`channel='chromium'`, Metal; o headless antigo renderiza WebGL em software e cai à metade dos quadros), densidade real forçada (`--force-device-scale-factor`) — 2× (16:9 → 2880×1620), 1,8× na 9:16 (2160×3840) — e os quadros (que chegam quando a tela muda, ~47–56/s) reamostrados para 30/s constantes (em cada tique, o último quadro chegado) e gravados em H.264 CRF 16. Antes de gravar, uma visita de aquecimento aceita os cookies e deixa a rede quente; a gravação abre uma aba nova, com o estado da página limpo (só os cookies de consentimento ficam). A 1ª dobra grava o carregamento e começa no 1º quadro pintado do site (sem o branco); as outras recarregam a página sem gravar, pulam direto até a dobra (inclusive com Lenis) e começam no 1º quadro já na posição nova. Medido (Linear, 4 s): ~10–13 s por dobra. Limite conhecido: o screencast às vezes engasga uma vez (~100–250 ms) logo no começo; sem engasgo só gravando uma janela visível pela captura nativa do macOS, que nesta máquina (monitor 3440×1440 em 1×) sairia em 1×. Duração de cada dobra: escolhida no modal ("Gravar … s", de 1 a 30 s, padrão 5 s — há sites cuja animação de entrada só termina depois de 3 a 4 s, como os loaders do ds.asimov.academy). Cada dobra vira uma mídia do banco ("Site · dobra 2", origem "captura de site" com a URL), ligada ao insert. Cookies: tenta fechar os banners mais comuns; login fica de fora. Captura interrompida por um reinício vira erro (pede-se de novo). Rotas: `POST /api/projetos/{id}/inserts/captura/previa {url, proporcao}`, `GET …/captura/previa/{cid}`, `POST …/inserts/{pid}/captura {url, proporcao, dobras, titulo}`.

✅ **Tela da etapa** (decisão de Rodrigo, out/2026: "a versão premiere", já que aqui a fala não precisa ser lida palavra a palavra; a Direção continua vertical): **à esquerda**, o card de trabalho do plano selecionado — num insert, **Inserts** (a fala, o que acontece no insert, as mídias ligadas com vídeo tocável — um trecho toca só a parte dele —, Editar, ordem, tirar, "Subir mídia"/"+ outra mídia", "Escolher do banco" e "Capturar site"; arrastar arquivos sobe e liga; no topo, quantos inserts têm mídia e o link do Banco); num motion, a **criação do motion** (a marcação e a fala, "em construção"). **No centro**, a prévia com as mídias no lugar e o enriquecimento aproximado. **À direita**, sempre o card de **Enriquecimento** (§8.4); num motion, as mesmas grades só para ver, com o aviso de que passam a valer junto com os motions. **Embaixo**, a **linha do tempo horizontal, só de leitura** (`editor/LinhaInserts.tsx`): régua (clicar ou arrastar anda pelo vídeo), zoom − / + e "Ajustar" à largura, e as trilhas **Planos** (blocos na cor do tipo, com número e nome; ✦ quando o enriquecimento difere do estilo; motions tracejados), **Mídias** (as miniaturas de cada insert; "em construção" nos motions) e **Elementos** (a trilha da fala saiu). Os cards mostram sempre o plano sob o cursor da linha do tempo (tocando, parado, clicando ou arrastando na régua); clicar num plano ou nas mídias dele leva o cursor até ele (nos inserts, já depois da entrada). As bordas dos dois cards e o topo da linha do tempo são **arrastáveis**, e as medidas ficam guardadas neste navegador (`localStorage` `inserts.tamanhos`; padrão 440 · 400 px e 200 px de linha do tempo); se a janela não comporta, os cards encolhem juntos e o vídeo fica com 300 px no mínimo. A tecla **R** toca de novo o trecho do plano atual, do começo ao fim. A **categoria** do plano muda ali mesmo (card da esquerda, com a sugestão da direção marcada e "↺" para voltar a ela) e a ferramenta **Cortar (D)**, na barra da linha do tempo, divide o plano sob o cursor em dois; as duas mudam a versão aberta da direção (a sugestão da IA fica em `itens_ia`) e as mídias seguem o plano (os inserts casam pelo id do plano quando a chave muda). Juntar continua na Direção. (Houve um roteiro com a lista dos planos à direita; saiu por repetir a linha do tempo.)

✅ **Página Banco** (`/banco`): grade com miniaturas (o vídeo toca mudo com o mouse em cima), subir vários arquivos arrastando para qualquer lugar da página, busca, filtro; o detalhe edita nome, descrição e palavras-chave, mostra a descrição da IA ("Descrever de novo"), onde é usada e apaga (com aviso quando está em uso).

💡 **Rotas:** `GET /api/projetos/{id}/inserts` (sincroniza), `PUT …/inserts/{pid}/midias {midias}`, `GET /api/banco?busca=&tipo=` (originais, cada um com os trechos), `POST /api/banco` (multipart `arquivos`), `GET|PUT|DELETE /api/banco/{id}` (num trecho, o PUT aceita `inicio`/`fim`), `POST /api/banco/{id}/trechos {inicio, fim, nome}`, `POST /api/banco/{id}/cortar {inicio, fim}`, `POST /api/banco/{id}/descrever`, `GET /api/banco/{id}/arquivo` (num trecho, o do original), `GET /api/banco/{id}/miniatura`, `GET /api/banco/{id}/tira`.

💡 **Histórico (out/2026):** fase 1 gravava a página no formato do espaço com roteiro de navegação; fase 2 trouxe modos, enquadramentos, takes e heurística de captura (depois por categoria e, por fim, dentro da direção, com a Inserts só executando); depois (decisão de Rodrigo) o agente saiu e a etapa virou manual, com o banco no centro.

⏳ Próximos: categorizar o banco; a IA sugerir mídias do banco para cada insert (pelas descrições); captura automática por tipo.

✅ **Card de comentário do Instagram** (planos Comentário + insert + ator; decisão de Rodrigo, out/2026): na prévia, igual ao comentário do app — fundo branco, foto, usuário e tempo **borrados**, o texto, "Responder" e "Ver tradução" —, na fonte do sistema da Apple (SF Pro, a que o Instagram usa no iPhone; a Instagram Sans é só da marca). **Editável no próprio vídeo:** clicar seleciona, arrastar move (`x`, `y` em %), a alça do canto muda o tamanho (`escala`, 60–130%; 100% = 75% da largura). A configuração fica no espaço livre ao lado do vídeo e tem só o **texto** (padrão: o da direção; mudar aqui não mexe na direção) e a **foto**, entre 5 de pessoas que não existem (rostos gerados por IA, de thispersondoesnotexist.com, em `frontend/public/avatares/`). O pedido guarda só o que difere do padrão (`pedido.comentario`, `PUT …/inserts/{pid}/comentario {campos}`, `null` volta ao padrão); a tela muda na hora e salva 0,35 s depois. ⏳ A exportação renderiza o card junto.

### 8.4 Enriquecimento de inserts (mock, aba da etapa Inserts)

✅ Visão (Rodrigo, out/2026): define a moldura de cada insert (card arredondado com sombra sobre degradê, ou tela inteira), o zoom (se, onde e como: curva, intensidade), a rolagem na pós sobre as imagens de página inteira (com easing), entradas ("sobe e assenta") e transições entre as mídias (corte seco, chicote com borrão). Referência: os favoritos mostram o site num card de ~90% da largura sobre degradê, entrada subindo e crescendo de ~85% a 100% em 0,4–0,8 s, zoom de até ~3%. Inspirado também num editor de um colega (layouts e animações de entrada em grade, com presets "do estilo").

✅ **Por número de mídias (decisão de Rodrigo, out/2026):** o enriquecimento muda conforme o insert tem 1, 2 ou mais mídias. **1 mídia:** o painel mostra **Layout** e **Entrada**, e a prévia aplica só esses dois (movimento parado, saída em corte seco).
  - **2 mídias** (decisões de Rodrigo, out/2026): o painel mostra **Layout das duas** — como elas convivem, cada opção com um desenho das duas (1ª clara, 2ª coral): **Sequência** ★ (a 2ª **substitui** a 1ª no corte, no mesmo lugar — pedido de Rodrigo: a 1ª some no corte, não fica por baixo; cada uma na **proporção original**, centrada no espaço da moldura), **Empilhadas** (uma em cima, outra embaixo; cada card na proporção da mídia — 16:9, 4:3, 1:1 —; mídia **em pé** (9:16, largura/altura < 0,8) preenche a sua metade mostrando a **parte de cima**, que é a que importa) e **Lado a lado** (duas colunas; em pé, também pela parte de cima) — Cascata e Picture-in-picture saíram (Rodrigo, out/2026); a proporção vem das dimensões da mídia no banco (sem elas, 16:9) —; na Sequência, também a **Moldura** (o layout de 1 mídia, valendo para as duas); e a **Entrada** de cada uma, em duas seções ("Entrada · 1ª mídia" e "Entrada · 2ª mídia", com a miniatura; `entrada` e `entrada_2`). Ao lado do vídeo, um card **Curva da entrada** para cada mídia (`curva`/`duracao` e `curva_2`/`duracao_2`; some para "sem animação" e "seca + zoom leve"). A 2ª mídia começa no **corte** (`enriquecimento.corte`, fração do insert, 0–0,95; padrão: no meio; 0 = junto com a 1ª, só nos layouts juntos — na Sequência a 1ª fica pelo menos 0,5 s): na Sequência a 1ª vai do começo ao corte e a 2ª do corte ao fim; nos outros, a 1ª fica o insert todo e a 2ª entra no corte. A entrada da 2ª é a transição entre as duas; a 1ª não tem saída própria (fica para depois).
  - **Trilha Mídias** com 2 mídias: cada uma é um bloco (na Sequência, uma depois da outra; nos layouts juntos, a 1ª em cima o insert todo e a 2ª embaixo, do corte ao fim). Uma **alça** amarela no corte se **arrasta** para mudar onde a 2ª começa, com **ímã** no começo das palavras da fala (a até 10 px; Shift solta) e no mínimo 0,5 s para cada mídia (nos layouts juntos, a 2ª pode ir até o início, com ímã nele); a tela muda na hora e salva ao soltar; **duplo clique** volta ao meio. Clicar num bloco seleciona o plano.
  - **3 ou mais:** por enquanto em sequência, divididas igualmente, com a entrada da 1ª; vira um modo próprio no futuro.

✅ **Curvas:** nenhuma transição linear, em nenhum elemento — entradas, saídas, zooms, rolagens e misturas usam cubic-bezier (`editor/curvas.ts`: CHEGAR `(0.16, 1, 0.3, 1)` chega rápido e assenta; MOLA `(0.34, 1.56, 0.64, 1)` passa do ponto e volta; SAIR `(0.7, 0, 0.84, 0)`; SUAVE `(0.65, 0, 0.35, 1)`); entrada em 0,7 s por padrão. **Curva da entrada**: virou parte da engrenagem de cada entrada e saída (ver abaixo).

✅ **Entrada e saída** (`transicoes.py`, `editor/transicoes.ts`, `editor/ConfigTransicao.tsx`; decisões de Rodrigo, out/2026): no painel, a seção **"Entrada e saída"** (uma por mídia, com 2) tem um toggle **Entrada | Saída** acima da grade. Entradas: sem animação · surgir ★ · **deslizar** · voo 3D · zoom borrado · seca + zoom leve; saídas: **corte seco** ★ · sumir · **deslizar** · voo 3D · zoom borrado (`saida`/`saida_2` no pedido). A opção escolhida ganha uma **engrenagem** (não as que não têm o que configurar: sem animação e corte seco) que abre, logo abaixo, a configuração **global** daquele tipo — vale para todos os inserts de todos os vídeos que o usam (configurou uma vez, fica sendo o padrão daquele tipo; nas Configurações, `transicoes`): curva (os 3 presets), duração (0,25 a 5 s) e os detalhes — surgir: escala inicial; deslizar: **direção** (cima · baixo · esquerda · direita), distância de partida/saída, posição final e fade; voo 3D: ângulo, deslocamento e fade; zoom borrado: escala, desfoque e fade; seca + zoom leve: zoom final. Os sliders mudam a prévia na hora e salvam ao soltar; "▶ Ver" toca a transição no insert; "Padrão de fábrica" volta tudo. A saída termina exatamente no fim da mídia (na sequência de 2, a 1ª sai terminando no corte) e usa a mesma curva espelhada (acelera ao sair), com no máximo metade da mídia. Saíram a curva e a duração por insert e o padrão do vídeo (`inserts.curva_padrao`), e o card "Curva da entrada" ao lado do vídeo. Rotas: `GET /api/transicoes`, `PUT /api/transicoes/{entrada|saida}/{tipo} {campos}` (`null` volta ao padrão de fábrica).

⏳ **Transição** entre os planos: saiu da etapa Inserts (decisão de Rodrigo, out/2026) e vai para a etapa seguinte, **Transições e Áudio**. Já existe a escolha do vídeo todo no backend (`inserts.transicao`, `PUT …/inserts/transicao`: seca · zoom com desfoque, da referência "cursor free" — o que sai desfoca e cresce em ~0,12 s; o que entra começa 10% maior e desfocado e assenta em ~0,3 s · piscada suave, ~0,24 s); a tela vem quando essa etapa for construída.

✅ **Cards** (card e card na metade; decisão de Rodrigo, out/2026): sem borda, cantos de 18 px e sombra larga e suave; o card na metade ocupa ~88% da largura.

✅ **Fundo** (do vídeo todo, não de cada insert; `inserts.fundo`, `PUT …/inserts/fundo {fundo}`): atrás dos inserts com moldura, num card recolhível no espaço livre ao lado do vídeo (junto do card de comentário, também recolhível; a coluna inteira recolhe para o lado, numa faixa fina encostada no Enriquecimento, com os cards (fundo e comentário) como abas em pé, de nome girado 90°, como os painéis recolhidos do Photoshop; tudo lembrado neste navegador): 3 claros — verde claro · papel · névoa azul — e 2 escuros — **chuva** e gradiente escuro (padrão). A chuva é o fundo do Overview do design system da Asimov reproduzido com os arquivos originais (`public/fundos/aura/`: runtime do Unicorn Studio, a cena local `aura-scene.js` e a paisagem): a cena (arco de luz e riscos de chuva) em mix-blend screen com o filtro do tema teal, por baixo da paisagem a 30% e dos mesmos degradês (`editor/Fundo.tsx`). **Na prévia e na exportação ela toca como vídeo** (decisão de Rodrigo, out/2026): `chuva.mp4`, um loop de 12 s em 2160×3840 a 60 fps (6 MB, H.264), gravado da cena ao vivo (`/render/chuva`) quadro a quadro com o relógio da página controlado (requestAnimationFrame, `performance.now` e `Date.now` falsos, avançando 1/60 s por foto) e com os 2 s finais fundidos no começo, para a emenda não aparecer (medido: 49 dB de PSNR na emenda). A cena ao vivo ficou só para regravar.

✅ **Mock (out/2026)**, só nos planos com insert: grades de opções por categoria — **Layout** (tela cheia: tela cheia · card ★ · janela 3D · inclinado · destaque; tela dividida e comentário: metade inteira ★ · card na metade · janela 3D · tela mesclada), **Entrada** (decisão de Rodrigo, out/2026: só sem animação · surgir ★ · deslizar para cima · voo 3D · zoom borrado · **seca + zoom leve** — aparece de uma vez, sem fade, e o **card inteiro** vai aproximando (pedido de Rodrigo: o card, não o conteúdo dentro dele), de 100% a 106%, ao longo do tempo todo da mídia, numa curva que já começa andando e vai assentando (`ZOOM_LEVE`, `(0.3, 0.2, 0.4, 1)`); como ela dura a mídia toda, o card da curva some e a exportação nunca a trata como parada; deslizar para o lado, mola e girar saíram — a mola continua como curva; inserts com uma entrada que saiu voltam ao estilo) (sem · surgir ★ · deslizar · subir · mola · girar · voo 3D · zoom borrado), **Entre as mídias** (em sequência com corte ★ · em sequência com transição · lado a lado · grade · empilhadas), **Movimento** (parado · zoom lento ★ · zoom num ponto · rolagem) e **Saída** (corte seco ★ · sumir · deslizar). ★ = o **estilo** do formato do plano; o pedido guarda só o que difere (`pedido.enriquecimento`, `PUT …/inserts/{pid}/enriquecimento {campos}`, `null` volta ao estilo; catálogo em `inserts.OPCOES_ENRIQUECIMENTO`/`ESTILO`, nomes em `editor/enriquecimento.ts`). "Voltar ao estilo", "Aplicar a todos deste tipo" (`POST …/enriquecimento/tipo`) e "▶ Ver a entrada" (toca o começo do plano). A prévia aproxima com CSS: layout (moldura, inclinação, perspectiva, fundo desfocado, máscara da tela mesclada), entrada e saída (pelo tempo dentro do plano, então funciona parado e arrastando), como as mídias se combinam e o movimento. Uma versão nova da direção mantém o enriquecimento dos inserts que não mudaram. ⏳ Rodrigo vai refletir sobre cada opção (tipos de transição, combinações de elementos); o enriquecimento de verdade vem na exportação.

✅ **Presets** (decisões de Rodrigo, out/2026: "o enriquecimento será um grande banco de presets que vamos enriquecer mais e mais"; `presets.py`, `editor/presets.ts`, `editor/CenaPreset.tsx`, `editor/EditorPreset.tsx`, `paginas/Presets.tsx`): um preset é a **receita inteira** de como as mídias de um insert aparecem — quantas (1, 2 ou mais), onde fica cada card em repouso (centro, largura e altura em % da área do insert, inclinação, perspectiva 3D, cantos, sombra, como a mídia preenche: inteira, preenche, preenche pelo topo), quando cada um começa (fração do insert) e sai (s antes do fim), e como entra e sai: o estado de partida/chegada em relação ao repouso (deslocamento, escala, giro, giro 3D, opacidade, desfoque), a duração e **uma curva cubic-bezier por propriedade** (posição, escala, giro, opacidade, desfoque; com atraso e duração próprios quando a propriedade começa depois ou termina antes). O motor é genérico: a receita é só dados, preset novo não exige código. Fundo: o do vídeo (`proprio`) ou nenhum.
- **De onde vêm:** feitos **à mão pelo Claude** (na conversa do Claude Code), a partir de um trecho de referência ou de um print que o criador manda: o Claude olha o trecho quadro a quadro, monta a receita e grava com `presets.criar(nome, receita, fontes)`; o preset entra "a revisar" e guarda o trecho de onde veio (`fontes`: ref, início, fim). Não há análise automática no app (decisão de Rodrigo, out/2026: uma recriação automática perfeita não vale o custo; os presets que não ficarem bons são refeitos pelo Claude). Presets em `presets/<id>.json` (biblioteca global, fora do git).
- **Como o Claude monta um preset:** `ferramentas/preset_tira.py` tira os quadros do trecho (com grade de 10%) e compara referência × recriação nos mesmos instantes (a recriação é desenhada pelo próprio app, na página `/render/preset`); o Claude mede posição, tamanho, cantos e tempos nos quadros, ajusta as curvas pelos pontos medidos e corrige até bater. O preset guarda um nome curto pelo efeito, uma **descrição** em palavras e o **recorte** da mídia de cada card na referência (os 4 cantos, desentortados), para a miniatura da revisão sair certa mesmo com o card em perspectiva ou passando da tela. Efeitos de destaque dentro do card (uma parte que sai e desfoca o resto) ficam para depois (Rodrigo, out/2026).
- **Altura:** na entrada e na saída, o card pode mudar de altura sem deformar a mídia (`altura`, fator sobre a de repouso; segue a curva da escala), como uma janela que abre na vertical.
- **Onde aparece:** cada preset é marcado para tela cheia, tela dividida ou ambos (`formatos`, na engrenagem); em "ambos", no formato para o qual não foi desenhado ele aparece adaptado.
- **Tomadas:** um card pode terminar numa fração do insert (`fim_frac`), para tomadas trocadas no corte; vários cards podem mostrar a mesma mídia (`midia`), e o repouso pode ter desfoque permanente (`desfoque`, um fundo feito da própria mídia). Juntos, fazem um "passeio de câmera" sobre uma mídia só.
- **Referências de fora:** um preset pode vir de um vídeo que não está nas Referências (um post do Instagram), guardado em `presets/externas/<nome>.mp4` e citado como `externa:<nome>`; vídeos de outro formato aparecem cortados no centro em 9:16 na revisão. Esses não marcam nada nas Referências.
- **Cantos medidos:** um card pode seguir os 4 cantos medidos na referência ao longo da vida dele (`quadros`, chaves suavizadas, desenhadas com matrix3d), para câmeras que torcem em 3D; e uma receita pode servir a qualquer número de mídias (`repete`: o último card é o molde da 2ª mídia em diante, cada uma numa parte igual do insert).
- **Zoom na mídia:** o conteúdo do card pode dar um zoom (quanto, para onde, quando e por quanto tempo) com a moldura parada (`zoom`).
- **Movimento contínuo:** um card pode ter um zoom e/ou deslocamento lento enquanto está na tela (`continuo`: escala em fração por segundo, deslocamento em % por segundo e giro em graus por segundo, contando desde que aparece), como um zoom de câmera; editável na engrenagem.
- **Marcação nas Referências:** o clipe que já virou preset ganha o selo **preset** no cartão e "Virou preset" no player (link para a página Presets); a página Presets mostra em cada preset a referência e o minuto de onde veio.
- **Página Presets** (barra de cima): grade de cards (3 por linha numa tela comum), no estilo dos cards da Home (sem moldura: miniatura, título e ações em ícones embaixo); a miniatura junta a **referência e a recriação lado a lado**, paradas no repouso; **clicar toca as duas em loop** (um preset por vez; só os cards à vista carregam o vídeo), em sincronia (a recriação segue o relógio do vídeo de referência; o card é recortado da própria referência; fora da tela, para). **Aprovar / Tirar a aprovação**, a **engrenagem** (o card ocupa a linha toda, com o editor ao lado) e **Descartar**. Só os **aprovados** aparecem no Enriquecimento ("ver os não aprovados" mostra todos).
- **Avaliar na página Presets** (decisões de Rodrigo, out/2026): o modal da engrenagem tem o nome editável no título (dois cliques), a prévia (referência | recriação), o **Simular** (Original, as telas e os números de mídias em que o preset vale, depois as proporções; proporções: com 1 mídia 9:16 · 1:1 · 4:3 · 16:9, com várias Todas 9:16 · 9:16 + horizontais · Só horizontais; a metade "Recriação" vira "Simulação": o quadro inteiro com o ator no lugar dele, pelas mesmas regras do editor; as mídias são vídeos do Banco com a proporção certa e o ator é o vídeo do projeto mais recente, com o recorte da pessoa no "ator embaixo"), os ajustes rápidos para experimentar (e "Salvar como padrão do preset") e o **Vale em**: chips dos modos de tela, dos números de mídias (1 · 2 · 3 ou mais) e das proporções das mídias (9:16 · Quadrada · Horizontal; o insert só sugere o preset se todas as mídias estão entre as marcadas; o Simular só mostra essas) em que o preset aparece no Enriquecimento (`usos`; sem marca, o que a receita suporta e todas as proporções), e quais ajustes rápidos aparecem no insert. No insert de tela dividida, o modo é escolhido em **Tela dividida · Ator embaixo**, e só aparecem os presets marcados para ele.
- **Recomendados** (decisões de Rodrigo, out/2026): na página Presets, o botão **Recomendados** abre um modal grande com as situações (modo de tela × 1 mídia 9:16 · 1 mídia horizontal, a quadrada junto · 2 mídias · 3 ou mais) e, em cada uma, os presets aprovados que valem nela numa grade de 6 por linha ( a prévia na situação ocupando o card e tocando ao passar o mouse). **Arrastar** reordena, com a grade mostrando onde vai cair enquanto arrasta (o card fica tracejado no lugar novo e os outros abrem espaço); a **estrela** favorita até 3, que ficam sempre no começo (soltar um entre os favoritos o torna favorito e o último sai). Guardado em `presets/ordem.json` (`{ids, favoritos}` por situação; `GET /api/presets/ordem`, `PUT /api/presets/ordem/{tela:mídias}`). No Enriquecimento do insert, os favoritos que servem ao insert ficam em **Recomendados**, em cima, e os demais em **Outros presets**, na ordem, menores, logo abaixo (os não aprovados, com "ver os não aprovados", no fim). Situação sem ordem: uma lista só, como antes. A escolha do preset continua manual (nada é aplicado sozinho).
- **Ajustes rápidos** (decisão de Rodrigo, out/2026): ao selecionar um insert com preset, abre sozinho, ao lado do vídeo, o card **Preset** com poucos controles de 3 opções (marcada, a que o preset já é): Entrada e Saída (lenta · normal · rápida), Zoom (menos · normal · mais), **Forma** (card · tela toda: um preset só serve aos dois; num preset com `tela_toda_em_pe`, como o Corte seco, o padrão é "Tela toda" quando todas as mídias são 9:16; e "Tela toda" só vale quando a mídia não é cortada: na tela dividida só horizontais, na tela cheia e no ator embaixo só 9:16 — mídia a mídia: as que seriam cortadas ficam em card; só trava quando nenhuma pode; na tela toda o zoom contínuo cresce a partir do centro na horizontal e preso pelo topo na vertical, a não ser que a receita tenha a própria deriva vertical, como uma rolagem; com vários cards, o que encolhe na altura para caber a mídia fica preso pela borda virada para o meio, mantendo o vão entre eles), **Zoom lento** (parado · leve · mais: zoom in linear e contínuo), Desfoque na entrada, Tamanho do card, Quando o próximo entra, **Mergulha em** (a zona da imagem para onde vai o zoom de saída, numa grade 3 × 3); e sempre dois sliders numa linha, **Posição** (sobe ou desce os cards) e **Largura** (70% a 130%). Valem **só para aquele insert** (`enriquecimento.ajustes`); **"Salvar como padrão do preset"** grava no preset (vale para os outros) e limpa as do insert. Cada preset tem o seu conjunto (`rapidos`, escolhido na página Presets, em "Ajustes rápidos"; sem marca, até 4 deduzidos da receita). O editor completo fica na página Presets. Na coluna ao lado do vídeo, abertos: o Preset e o Fundo; o Comentário começa recolhido.
- **Divisão da tela** (inserts de tela dividida; decisões de Rodrigo, out/2026): automática, sem escolha à mão. O **tipo vem do preset** (`divisao_tipo`, na engrenagem: **Ocupa a área**, **Card** ou **Ator embaixo**; sem marca, "área" se a mídia ocupa a área toda, senão "card") e as medidas vêm da **proporção da 1ª mídia**: na "área", a parte de cima tem a altura da mídia na largura toda (1:1 → 56%, 4:3 → 42%, 16:9 → 32%; em pé, 50%); no "card", o card ganha a proporção da mídia (até 90% da largura) e a parte de cima, a altura dele mais 6% em cima e embaixo (40% a 62%); com vários cards, a parte de cima fica em 56% e **cada card ganha a proporção da sua mídia**, cabendo na caixa que o preset deu a ele (vale também na tela cheia e nas miniaturas do Enriquecimento; na tela cheia, uma mídia só ocupa a tela se for em pé: 1:1, 4:3 e 16:9 viram card centrado); no "ator embaixo", o insert vai na tela toda e o ator encolhe a 55% numa janela arredondada embaixo (a partir de 72% da altura), com o card no espaço acima. O ator desce para o meio da parte dele sem mudar de tamanho. O "ator embaixo" também liga no próprio insert ("Ator embaixo, cropado numa janela", no Enriquecimento). A **caixinha do comentário** fica sozinha na costura do insert com o ator (no "ator embaixo", na borda de baixo do card), até ser arrastada ("Posição automática" volta). No "ator embaixo" (e só nele), a **cabeça e os ombros saem da janela** por cima do insert, com a borda macia: o recorte da pessoa (`recorte_ator.py`, segmentador de selfie do MediaPipe, local, ~1 min por vídeo) roda sozinho depois do proxy e gera a máscara (exportação) e a pessoa em VP9 com alfa (prévia).
- **No Enriquecimento:** a seção **Presets** (filtrada pelo número de mídias do insert; os do outro formato também aparecem, marcados "adaptado": a metade de cima da tela dividida é tratada como a faixa central da tela cheia, na mesma largura — alturas dobram ou caem pela metade —, decisão de Rodrigo, out/2026) com miniaturas animadas (com as mídias do próprio insert; tocam com o mouse em cima e quando escolhidas); clicar aplica (`enriquecimento.preset`), clicar de novo tira. Cada preset tem uma **engrenagem** que abre o editor na coluna ao lado do vídeo (card "Preset"): tempo, onde fica, entrada e saída de cada mídia, com sliders que mudam a prévia na hora e salvam ao soltar — **vale para todos os inserts que usam o preset**. Só presets: o "Personalizar" (layout, entrada e saída escolhidos à mão) saiu (Rodrigo, out/2026); "Tirar o preset" volta ao estilo do tipo e "Aplicar a todos" copia para os planos do mesmo tipo. Rotas: `GET /api/presets`, `PATCH/DELETE /api/presets/{id}`, `GET /api/presets/fontes` (os trechos que viraram preset), `GET /api/presets/{id}/amostra/{k}`.

### 8.5 Motions

✅ Num plano de motion, um **preset** (animação pronta em HTML + CSS + GSAP, escrita à mão, em que o criador troca só os textos, a imagem e o fundo) ou um **vídeo** feito fora (do banco; entra e sai seco). Tocam ao vivo na prévia e entram na exportação. (A geração por IA saiu em out/2026.) **A especificação completa fica em [docs/motions.md](docs/motions.md)** (separada para os motions poderem andar em paralelo com o resto).

### 8.6 Áudio (mock)

✅ Visão: efeitos sonoros do vídeo (whoosh na entrada dos inserts, cliques, transições). Os efeitos de áudio dos inserts ficam aqui, não na Inserts. Por ora, simulada.

### 8.7 Legenda (mock na v1)

✅ Visão: gerar legendas a partir da transcrição já cortada e estilizar.
✅ Na v1: mock, com legendas falsas na trilha LEG.
⏳ Em aberto: estilo visual, palavra a palavra ou por frase, destaque de palavras.

## 9. Timeline e ligação entre etapas

✅ A timeline nasce **multitrilha**: V1 (Rodrigo/bruto), V2 (inserts), V3 (motion), LEG (legenda), A1 (áudio do bruto). V1/A1 têm conteúdo real; os inserts reais aparecem na prévia da etapa de Inserts (sobre o vídeo cortado), presos aos planos da direção; a trilha V2 da timeline horizontal das etapas simuladas ainda é mock.

✅ Tudo que vem depois dos cortes (inserts, motion, legendas) fica **preso às palavras** da transcrição, não a segundos. Ao mexer no corte, esses itens acompanham a fala. Se as palavras de um item forem removidas, ele fica marcado como **órfão** para Rodrigo decidir.

💡 Ancoragem: `{ "palavra_ini": "w00051", "palavra_fim": "w00060", "off_ini": -0.08, "off_fim": 0 }` (deslocamentos em segundos a partir do começo da primeira e do fim da última palavra). A posição na saída é sempre calculada, nunca guardada. Implementado na Direção visual; V2/V3/LEG ainda são mock.

## 10. Desfazer e versões

✅ Toda ação, de Rodrigo ou do agente, entra numa pilha de histórico, com Ctrl+Z / Ctrl+Shift+Z.
✅ Versões nomeadas podem ser salvas e restauradas (ex.: "antes do agente mexer").
💡 Cada entrada do histórico guarda autor (`criador` ou `agente`), etapa, descrição curta e um snapshot da timeline. O snapshot é JSON pequeno, então é mais simples do que guardar diffs.

## 11. Agente

✅ **Adiado para depois da fase 4** (decisão de Rodrigo). Até lá o chat segue simulado. Quando vier:
✅ **Um agente só**, LangChain. O prompt de sistema e as ferramentas mudam conforme a etapa aberta. Cada etapa tem seu próprio histórico de chat, salvo no projeto.
✅ O agente enxerga o estado do projeto (briefing, transcrição, timeline). Tudo que ele altera passa por ferramentas, então aparece na timeline e pode ser desfeito.
✅ Transcrições e briefings são **dados, não instruções**: comandos que apareçam dentro de falas são ignorados.
💡 Ele pode ser separado em vários agentes no futuro, se houver motivo concreto.

## 12. Modelos de IA

✅ **App agnóstico de criador (decisão de Rodrigo, out/2026):** nenhum prompt ou texto do app tem nome de pessoa ou marca fixo. Quem é o criador e do que o canal fala é uma configuração opcional, **Configurações › Geral › "Sobre o criador"** (`perfil_criador`, até 1.000 caracteres), que entra como contexto no prompt de cortes (antes do briefing) e no da direção visual (fim do prompt de sistema). As regras do §14 são escritas sem nomes porque vão para o prompt. Mensagens do chat usam o autor `criador` (históricos antigos são migrados ao abrir o projeto).

✅ Configuráveis por etapa, numa tela de configurações.

| Uso | Padrão |
|---|---|
| Chat do agente (futuro) | `google/gemini-3.8-flash` via OpenRouter |
| Seleção de cortes | `google/gemini-3.8-flash` via OpenRouter (`OPENROUTER_MODEL` no `.env`) |
| Transcrição | **ElevenLabs Scribe v2** (API; Configurações › Cortes), com plano B Whisper turbo local + stable-ts. Outros motores rodam em segundo plano para comparar (§8.1) |
| Análise das referências (Calibragem) | `google/gemini-3.8-flash`, multimodal, vídeo do trecho com áudio (Configurações › Direção visual) |
| Diretora e corretora (direção do projeto) | `google/gemini-3.8-flash`, raciocínio médio (Configurações › Direção visual › "Diretora") |
| Formatadora e regras sugeridas | `google/gemini-3.8-flash`, só texto ("Modelo da formatadora") |
| Marcação dos inserts nas referências e descrição das mídias do banco | `google/gemini-3.8-flash`, raciocínio baixo (o mesmo modelo da análise das referências) |

💡 Todos os modelos são criados por `comum.chat` (timeout em ms, uma nova tentativa, saída limitada).

💡 As chaves (`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`) ficam em `backend/.env` (fora do git; lido por `comum.carregar_env`, que os testes desligam: nenhum teste lê o `.env` de verdade). Sem crédito no OpenRouter, a fila da Calibragem pausa e avisa.

## 13. Preview e exportação

✅ **Preview:** o player toca o **proxy 720p** pulando os trechos cortados, então é instantâneo e não renderiza nada. O recorte 9:16 também é simulado no player.
✅ **Exportar** (`exportacao.py`, `editor/Exportar.tsx`; decisões de Rodrigo, out/2026): botão no topo, em qualquer etapa, sempre com o **projeto inteiro** (tudo o que existe). Abre um modal com **resolução** 720p · 1080p · **4K** (720×1280, 1080×1920, 2160×3840), **fps** **24** · 30 · 60, **codec** **HEVC** (~metade do tamanho) · H.264 (abre em tudo), os **navegadores em paralelo** (2 · 4 · **6** · 8), o **nome** do arquivo (padrão: projeto · data e hora · resolução fps; editável) e um resumo (inserts, fundo, comentários, duração e tamanho estimado). A última escolha fica lembrada neste navegador. Exportar começa em **segundo plano**: o botão vira "Exportando 42%" (clicar mostra o andamento e **cancela**), dá para trocar de etapa ou de projeto, e ao terminar um aviso oferece **Abrir no Finder** e **Baixar**. Uma por projeto; o MP4 vai para `projetos/<id>/exports/` (nome repetido ganha " (2)"). Se o servidor reiniciar no meio, ela vira erro (pede-se de novo) e os pedaços são apagados. Rotas: `GET/POST /api/projetos/{id}/exportacao`, `POST …/exportacao/cancelar`, `GET …/exportacao/arquivo`, `POST …/exportacao/finder`.
- **O que entra:** cortes, recorte 9:16, áudio com fade de 15 ms em cada emenda, e os inserts com mídia como na prévia — layout, entrada com a curva, fundo (a chuva em vídeo) e o card de comentário (o contador "1/2" das sequências é só da prévia). Motion, legenda e áudio extra ainda não (são mock); nos planos de motion fica o ator.
- **Como** (out/2026, a pedido de Rodrigo: tinha de ficar perto do tempo real; antes era ~3,5 min por minuto em 4K): (1) **A camada dos inserts** é a própria prévia, fotografada quadro a quadro: **vários navegadores em paralelo** (processos `render_quadros.py`, padrão 6, de 1 a 8 no modal — "Navegadores em paralelo"), cada um com o Chromium escondido em `/render/p/<id>` (o front: só os inserts, em fundo transparente, na janela do tamanho do vídeo, com o desenho de uma prévia de 540 px de largura ampliado por CSS `zoom` — 4K = 4× —; com densidade de pixels em vez de zoom, o Chrome desenhava os vídeos com perspectiva 3D em baixa resolução, serrilhados). Os quadros de cada insert são cortados em pedaços (12 a 48 quadros) distribuídos entre os navegadores; para cada quadro, a página vai ao instante exato (`window.__render.ir(t)`: vídeos do banco e da chuva parados no quadro certo, fontes e imagens carregadas, dois quadros de tela) e a foto é a rápida do protocolo do Chrome (`Page.captureScreenshot` com `optimizeForSpeed`, 4× mais rápida que a do Playwright); **insert parado** (sem vídeo na tela e com a entrada terminada) reaproveita a foto anterior. Cada pedaço vira um clipe **ProRes 4444** com transparência, pelo chip de vídeo do Mac (as fotos passam por RGBA cru: o Chrome tira o alfa dos PNGs todo opacos), e os pedaços de um insert são emendados sem recodificar. Os vídeos do banco entram na **resolução original** (`GET /api/banco/{id}/arquivo?qualidade=exportacao`: uma cópia com quadro-chave a cada 6 quadros, para a busca quadro a quadro ser rápida, feita no começo da exportação e guardada no banco como `exportacao.mp4`, refeita se o original mudar); a prévia continua com a versão leve. (2) **Uma passada do ffmpeg**: o bruto decodificado pelo chip de vídeo; cada clipe da V1 vira um par vídeo + áudio (trim/atrim, fade de 15 ms) e o concat os mantém juntos em cada emenda; recorte 9:16 (se o bruto for horizontal), escala lanczos, fps de saída (com bruto de 24 fps, 30 e 60 **repetem quadros**, sem interpolar), o ator descendo um quarto da altura nas telas divididas, cada clipe de insert sobreposto no seu instante, e o vídeo codificado pelo chip (HEVC ou H.264 do VideoToolbox, `-q:v 65`) com AAC 320k. O websocket do Vite é silenciado nas páginas de render (um aviso do servidor de desenvolvimento as recarregava no meio); se uma recarregar mesmo assim, espera voltar e refaz o quadro. O front precisa estar no ar (`HARNESS_FRONT`, padrão `http://localhost:5173`).
- **Medido** (vídeo de teste, 1:02, 2 inserts com mídia, 5,4 s de insert, 4K 24 HEVC): **40 s** (antes, 3 min 33 s), 1481 quadros exatos, inserts nos quadros certos. Medidas de base: 6 navegadores fotografam ~22 quadros/s em 4K; a passada do ffmpeg leva ~23 s por minuto de vídeo. Estimativa para 1 min em 4K 24 com metade em insert: ~1 min.

## 14. Regras editoriais dos cortes

✅ Aprovadas pelo criador. Ficam só aqui, sem cópia em prompts ou outros docs; o prompt do agente lê esta seção (por isso ela é escrita sem nomes: o app serve a qualquer criador).

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

Uma correção pontual num vídeo vale só para aquele vídeo, a menos que o criador diga que é regra geral.

## 15. Ordem de construção

✅ Uma fase por vez; Rodrigo avalia ao fim de cada uma antes de a próxima começar.

| Fase | Entrega | Pronto quando |
|---|---|---|
| 1. Fundação ✅ | `git init`, esqueleto backend + frontend, `dev.sh`, criar/abrir projeto, upload de bruto, briefing e apoios | Criar um projeto pela interface e ver os arquivos na pasta dele |
| 2. Casca com mocks ✅ | Editor completo: etapas, preview, timeline multitrilha, chat, mocks de todas as etapas | Navegar pelas etapas com dados falsos e o chat respondendo |
| 3a. Cortes: pipeline real ✅ | Proxy, transcrição, silêncios e seleção pela LLM rodando ao criar o projeto; preview tocando o corte real; "Refazer cortes com IA" | Rodrigo avalia o corte da IA no player |
| 3b-0. Teste de transcrição ✅ | Comparou motores no áudio real (§16); padrão hoje: ElevenLabs | Feito |
| 3b-1. Cortes: navegar e inspecionar ✅ (em uso) | Timeline vertical do bruto, forma de onda real, milissegundos, vários motores, ouvir emenda | Rodrigo aponta com precisão onde o algoritmo errou |
| 3b-2. Cortes: edição manual (parcial) | Feito: alças, cortar/excluir trecho, restaurar, recalcular. Falta: palavras pelo texto, travas, desfazer/refazer e versões | Chegar a um corte aprovado só pela interface |
| D1. Calibragem: casca ✅ | Upload múltiplo com fila, pasta `referencias/`, etapa "Direção visual" na sidebar | Subir vários MP4 e vê-los na lista |
| D2. Calibragem: análise (aguardando avaliação) | Detector de cena, transcrição, IA multimodal por trecho (vídeo), montagem, marcação dos inserts | Uma referência real analisada com planos e elementos plausíveis |
| D3. Calibragem: revisão (aguardando avaliação) + Referências | Timeline de planos e elementos, edição, "revisado"; galeria de Referências com favoritos | Rodrigo revisa uma referência inteira só pela interface |
| D4. Estatísticas (1ª versão) | Removida e refeita na D6 | — |
| D5. Direção visual no projeto (aguardando avaliação) | Proposta da IA a partir da Calibragem, regras do criador, esboço do layout | Rodrigo avalia a direção proposta para um vídeo novo |
| D6. Roteiros dirigidos e heurística (aguardando avaliação) | Marcação por bloco, um bloco por corte; roteiro decupado por vídeo; heurística = regras (do criador + sugeridas) + roteiros de exemplo; diretor aprende pelos roteiros e responde frase a frase. (Função da fala e números foram tentados e saíram.) | A direção proposta se lê como um dos roteiros do criador |
| D7. Direção: versões e comentários, descrição dos inserts | Corretora, v1/v2…, comentários por ponto; a diretora conta o que acontece em cada insert | Cada insert diz o que acontece |
| I1. Inserts manuais + Banco | Pedidos da direção, banco de mídias (subir, descrição por IA, busca, usos), mídias ligadas por insert, prévia em sequência. (Um agente de captura automática existiu e saiu.) | Cada insert do vídeo de teste com mídia ligada |
| 4. Exportação (aguardando avaliação) | Modal (resolução, fps, codec, nome), segundo plano com progresso e cancelar; ator e áudio pelo ffmpeg a partir do bruto, inserts fotografados da própria prévia | MP4 exportado igual à prévia, emendas aprovadas no ouvido por Rodrigo |

A Direção visual (D1–D7) entrou antes de Inserts (decisão de Rodrigo, out/2026). Depois: Inserts → Enriquecimento → Motion → Áudio → Legenda, cada uma com sua própria rodada de decisões. O agente do chat (antiga 3c) vem bem depois.

💡 Medido na 3a com o bruto de teste (2:02, 4K HEVC, M1 Max): proxy 19 s (em paralelo), silêncios 0,2 s, transcrição por pedaços ~19 s, seleção da LLM 18–42 s (varia muito). Total ≈ 40–60 s.

## 16. Aprendizados medidos

Fatos medidos (no projeto anterior, em `_legado/`, e neste), úteis para a implementação:
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
  | Whisper + stable-ts (plano B) | +4 a 9 s | 352 | 130 / 800 ms | 7 | 4,3 s | igual |
  | Whisper + Qwen3-Aligner | 9 s | 352 | 140 / 390 ms | 4 | 1,1 s | igual |
  | Whisper + CTC | 22 s | 352 | 149 / 1190 ms | 4 | 2,3 s | igual |
  | Qwen3-ASR 1.7B + Aligner | 14 s | 362 | 140 / 430 ms | 2 | **0,7 s** | 95% |
  | ElevenLabs Scribe v2 (API) | 3 s | 353 | 130 / 370 ms | 4 | 7,5 s | 92% |
  | Parakeet v3 | 7 s | 355 | 256 / 810 ms | 28 | 2,6 s | 95% |
  | Whisper large-v3 + stable-ts | 34 s | 355 | 140 / 1120 ms | 14 | 5,2 s | 98% |

  O Qwen3-ASR 0,6B escreve bem pior que o 1,7B ("melhoria" por "melhor IA"). Os dois ASR com tempos próprios e boa cobertura (Qwen3-ASR e ElevenLabs) acharam 1 a 10 palavras a mais que o Whisper turbo; o ElevenLabs deixa mais fala sem palavra marcada (7,5 s). **Decidido por Rodrigo, depois de comparar na tela: ElevenLabs Scribe v2** (§8.1).
- O **Whisper às vezes estica palavras** para dentro das pausas: uma palavra curta ("do") chegou a quase 3 s. Por isso as bordas são puxadas para os silêncios do `silencedetect`, com janela de ~0,5 s antes e ~0,35 s depois da borda.
- **Seleção por ID de palavra** funcionou bem. O Gemini 3.1 Flash Lite deixou várias retomadas óbvias; o Gemini 3.8 Flash acertou muito mais (~17 s e ~US$ 0,03 por vídeo de 2 min).
- O bruto de teste (`_legado/brutos/melhor ia design.MOV`) é 4K **vertical via metadado de rotação**: as dimensões cruas dizem 3840×2160. É preciso considerar a rotação.
- Os caminhos absolutos dos JSONs antigos quebraram quando a pasta foi renomeada. Na versão nova, os caminhos dentro do projeto são **relativos à pasta do projeto**.

## 17. Em aberto

- ⏳ Meta de desempenho (antes: 5 min de bruto processados em até 3 min). Não reconfirmada.
- 💡 Limpeza feita (out/2026) a partir de uma auditoria: rotas, funções, trilha DIR e arquivos sem uso removidos; `.env`, modelos, mídia para a IA, normalizador e JSON atômico em `comum.py`; ffmpeg/ffprobe em `midia.py`; `Modal` e `tempoBR` compartilhados no frontend. Ficaram de fora, de propósito: as migrações de dados antigos no `projeto.ler` (apagá-las tiraria o suporte a projetos antigos — só com um script de migração único), e dividir `direcao.py` (análise · captura · revisão · galeria), `inserts.py` (banco · pedidos) e `main.py` (rotas por domínio), que são refatorações maiores para quando a estrutura estabilizar.
- ⏳ Tudo listado como "em aberto" em Inserts, Enriquecimento, Motion, Áudio e Legenda.
- ⏳ Música, transições e estilo de legenda.
- ⏳ Aprendizado das correções: como uma correção recorrente vira regra.
- ⏳ Direção: quando os exemplos passarem de algumas dezenas, mandar só os mais parecidos? Usar só as referências revisadas (hoje, todas)?
- ⏳ Regra de abertura: uma pergunta retórica do criador às vezes é tratada como "leitura de comentário" (ambíguo só pela transcrição).
- ⏳ Briefing e vídeos de apoio ainda não entram na Direção visual (só a transcrição cortada).
- ⏳ A diretora às vezes põe 1 mídia onde a fala cita duas coisas ("esses dois sites"): reforçar nas regras ou nos exemplos.
