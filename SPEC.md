# SPEC — Harness Video Editor

Editor de vídeo local, controlado por interface web, em que cada etapa da edição é feita por IA e Rodrigo corrige pela interface. A ideia é um "Premiere próprio", mais automatizado, modelado nos vídeos já editados do time.

**Legenda de status usada neste documento:**
- ✅ **Aprovado:** decidido por Rodrigo.
- 💡 **Proposta:** detalhe técnico sugerido pelo agente, que pode mudar sem nova aprovação, desde que não contradiga o que foi aprovado.
- ⏳ **Em aberto:** ainda não decidido.

**Este documento é o centro:** visão, arquitetura, estrutura, como as etapas se ligam e o contrato da exportação. O detalhe de cada área fica em `docs/` (cada uma pode andar em paralelo com as outras, §15):

| Área | Doc | Estado (out/2026) |
|---|---|---|
| Pré-processamento: novo projeto, 16:9 → 9:16, cortes, look | [preprocessamento.md](docs/preprocessamento.md) · [cortes.md](docs/cortes.md) | **Real** (Enquadramento e Look: P1, à espera da avaliação de Rodrigo) |
| Direção visual (Calibragem, referências, heurística, direção do projeto) | [direcao.md](docs/direcao.md) | **Real** |
| Inserts: mídias, banco, presets de enriquecimento, sons de apoio | [inserts.md](docs/inserts.md) | **Real** |
| Motions | [motions.md](docs/motions.md) | **Real** |
| Rosto do ator (enquadramento nas áreas que sobram) | [rosto.md](docs/rosto.md) | **Real** (F0: a medida; P5: o enquadramento na tela dividida e os modos do "ator embaixo") |
| Transições entre planos | [transicoes.md](docs/transicoes.md) | **Real** (P2: a biblioteca, a página, a etapa, a prévia e o MP4) |
| Áudio: voz, faixa de fundo, mixer | [audio.md](docs/audio.md) | **Real** (P3: limpeza, timbre, faixas geradas, mixer, −14 LUFS) |
| Legenda | [legenda.md](docs/legenda.md) | **Real** (P4: estilo medido, palavra a palavra, edição, ASS na exportação) |
| Prévia e exportação | [exportacao.md](docs/exportacao.md) | **Real** (ator, inserts, motions, sons, transições, áudio), montada por camadas |

O agente do chat e o desfazer/versões do editor ainda não foram feitos (§10, §11); o chat simulado saiu na F0.

**Índice:** §1 Visão · §2 Escopo · §3 Stack · §4 Pastas · §5 Projeto em disco · **§6 Projetos, criação e pipeline** ·
§7 Interface · **§8 Etapas, passo a passo**: 8.1 Pré-processamento (8.1a Cortes · 8.1b Look · 8.1c Enquadramento ·
8.1d Velocidade) · 8.2 Direção visual · 8.3 Inserts · 8.4 Enriquecimento · 8.5 Motions · 8.6 Sons de apoio · 8.7 Rosto ·
8.8 Transições · 8.9 Áudio · 8.10 Legenda · e as páginas de apoio: 8.11 Calibragem · 8.12 Referências · 8.13 Heurística ·
8.14 Buscar por referências · 8.15 Banco · 8.16 Presets · 8.17 Motions · 8.18 Configurações · §9 Timeline · §10 Desfazer ·
§11 Agente · §12 Modelos de IA · **§13 Prévia e exportação** (13.1 Player · 13.2 Exportação · 13.3 Contrato das camadas) ·
§14 Regras editoriais dos cortes · §15 Ordem de construção · §16 Aprendizados · §17 Em aberto.

---

## 1. Visão

✅ Rodrigo cria um projeto e sobe o vídeo bruto. A IA faz a primeira versão de cada etapa e ele ajusta à mão (estilo Premiere). As etapas, nesta ordem (decisão de Rodrigo, out/2026):

| # | Etapa | O que faz |
|---|---|---|
| 1 | **Pré-processamento** | O vídeo do ator: de 16:9 para 9:16 pelo rosto, os **cortes** (erros, retomadas, esperas, pausas longas), o **look** (LUT e vinheta) e a **velocidade** (1× a 1,5×) (§8.1) |
| 2 | **Direção visual** | O que aparece na tela em cada momento (planos e elementos) e, nos inserts, o que acontece e quais mídias entram; aprende com vídeos de referência já editados (§8.2) |
| 3 | **Inserts** | As **mídias** de cada insert, os **motions** e o **enriquecimento** (presets: como as mídias aparecem, com os sons de apoio), o rosto do ator bem posicionado no que sobra da tela e os **presets do Full ator** (zoom lento, zoom seco) (§8.3–8.7) |
| 4 | **Transições** | Como o vídeo passa de um plano para o outro, com o som (§8.8) |
| 5 | **Áudio** | A voz (limpeza e timbre), a faixa de fundo e o mixer das trilhas (§8.9) |
| 6 | **Legenda** | Legendas da fala, no estilo da casa (§8.10) |

✅ **Formatos:** **Reels** (9:16, o único implementado); **Anúncio** e **Aula** aparecem como "em breve".

Conteúdo típico: vídeos de Rodrigo (Asimov Academy) sobre IA, agentes, produtividade e design, para Reels/TikTok. Os brutos têm erros, pausas e várias tentativas da mesma fala.

## 2. Escopo

✅ **Entra:** as seis etapas acima, reais; a tela de projetos (criar, abrir e apagar — apagar manda a pasta para `dados/projetos/_lixeira/`, recuperável); o pipeline automático ao criar o projeto; as páginas de apoio (Banco, Referências, Calibragem, Heurística, Presets, Motions, Transições); a exportação MP4 a partir de qualquer etapa.

✅ **Fica fora (por ora):**
- O agente do chat (§11) e o desfazer/refazer com versões nomeadas (§10).
- Multicâmera / mais de um bruto por projeto (o modelo de dados já aceita várias fontes).
- Exportar XML para Premiere/DaVinci; publicação automática; treino de modelos; síntese de voz.
- Os formatos Anúncio e Aula.

## 3. Stack e arquitetura

✅ **Backend:** Python + FastAPI. Concentra IA, vídeo e áudio: LangChain, OpenRouter, MLX Whisper, MediaPipe, FFmpeg.
✅ **Frontend:** React + Vite + TypeScript, Tailwind, shadcn/ui, no visual descrito no §7.
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
├── docs/              # o detalhe de cada área (ver a tabela no topo)
├── README.md          # o que é e como rodar
├── dev.sh             # sobe backend + frontend (portas no .dev.env)
├── backend/
│   ├── app/
│   │   ├── main.py            # o app FastAPI: o que recomeça quando o servidor sobe e a inclusão das rotas
│   │   ├── rotas/             # as rotas por assunto: projetos, referencias, cortes, direcao, inserts (e banco),
│   │   │                      #   exportacao, presets (sons, entradas, recorte), motions, rosto, preprocessamento (look,
│   │   │                      #   enquadramento e velocidade), transicoes, audio, legenda; comum.py: o que compartilham
│   │   ├── comum.py           # .env, modelos do OpenRouter, mídia para a IA (base64), normalizador de texto, JSON atômico
│   │   ├── projeto.py         # projeto.json, configuração do app (_config.json), motores de transcrição
│   │   ├── pipeline.py        # fila do projeto: enquadramento, proxy, silêncios, transcrição, alinhamento, cortes, motores extras
│   │   ├── enquadramento.py   # 16:9 → 9:16 pelo rosto: o caminho da câmera, o recorte quadro a quadro, Reenquadrar (§8.1)
│   │   ├── look.py            # o look do ator: os LUTs, a vinheta, os filtros da exportação (§8.1)
│   │   ├── midia.py           # ffmpeg/ffprobe (erro legível, medidas), proxy, áudio, silêncios, forma de onda, miniatura
│   │   ├── transcricao.py     # MLX Whisper por pedaços + stable-ts
│   │   ├── motores.py         # outros motores (Qwen, CTC, Parakeet, ElevenLabs…)
│   │   ├── cortes.py          # seleção pela LLM, montagem dos clipes, edição manual
│   │   ├── referencias.py     # vídeos da Calibragem em disco, favoritos
│   │   ├── direcao.py         # análise das referências (cenas, IA multimodal, montagem, descrição dos inserts) e revisão
│   │   ├── calibragem.py      # roteiros dirigidos e heurística da direção (regras + roteiros de exemplo)
│   │   ├── direcao_projeto.py # direção do projeto: diretora, formatadora, corretora, versões
│   │   ├── banco.py           # banco de mídias (subir, proxies, descrever com IA, buscar, usos, trechos, corte do original)
│   │   ├── inserts.py         # os pedidos de insert vindos da direção, as mídias ligadas a cada um, enriquecimento, comentário, fundo
│   │   ├── captura_site.py    # captura de site para um insert: prévia da página inteira, dobras, gravação (Playwright)
│   │   ├── presets.py         # presets de enriquecimento (receitas), ordem e recomendados (§8.4)
│   │   ├── sons.py            # sons de apoio: catálogo, momentos de som, mistura na exportação, nível da voz (§8.6)
│   │   ├── motions.py         # motions: presets em HTML + GSAP e o motion de cada plano (§8.5)
│   │   ├── recorte_ator.py    # a silhueta do ator (MediaPipe) para a cabeça passar por cima do insert
│   │   ├── rosto.py           # o rosto do ator ao longo do vídeo (MediaPipe), medido uma vez por projeto (§8.7)
│   │   ├── entradas.py        # entradas e saídas dos inserts sem preset (configuração global, §8.4)
│   │   ├── exportacao.py      # exportação: inserts fotografados em paralelo + uma passada do ffmpeg (§13)
│   │   └── render_quadros.py  # os navegadores escondidos que fotografam a camada dos inserts
│   ├── luts/              # os LUTs do look (.cube, gerados por ferramentas/luts.py; no git)
│   ├── tests/
│   └── pyproject.toml
├── frontend/src/
│   ├── paginas/       # Projetos, Editor, Banco, Calibragem, RevisaoReferencia, Referencias, Heuristica, Presets, Transicoes, Configuracoes, NovoProjeto, Render
│   ├── editor/        # o comum às etapas: a lista (etapas.ts), os sons de apoio, a linha do tempo base, exportar
│   ├── player/        # o player e a prévia: usePlayer, a sequência (bruto → saída), a montagem no palco
│   ├── preprocessamento/ # a etapa 1: a timeline vertical dos cortes, o look, o enquadramento, a velocidade
│   ├── direcao/       # a etapa Direção visual
│   ├── inserts/       # a etapa Inserts: o insert no lugar, o banco, a captura de site, o editor de vídeo, o comentário
│   ├── ator/          # o ator nas áreas que sobram da tela dividida (P5)
│   ├── presets/       # os presets de enriquecimento (receitas, divisão da tela, ajustes, curvas) e a página Presets
│   ├── motions/       # os motions (grade, edição, página, sons)
│   ├── referencias/   # timeline de direção, edição, detalhe, painel da Calibragem
│   ├── transicoes/    # as transições entre planos (motor, etapa, página, efeito no palco)
│   ├── audio/         # o áudio (cadeia da voz e fundo na prévia, a etapa com o mixer)
│   ├── legenda/       # a legenda (os blocos, a camada da prévia, a etapa)
│   └── components/    # marca, navegação, Modal, componentes shadcn (ui/)
├── frontend/public/motion/   # o runtime e os presets de motion (HTML + GSAP)
├── ferramentas/       # scripts do Claude: montar presets (tira, curva, pose), sons (biblioteca, detecção), os LUTs (luts.py) e os das áreas novas
├── dados/             # tudo o que o app guarda (fora do git; `comum.DADOS` no backend)
│   ├── projetos/      # um projeto por pasta (§5); _config.json; _lixeira/ (os apagados)
│   ├── referencias/   # vídeos da Calibragem, _favoritos.json, _heuristica.json
│   ├── banco/         # mídias dos inserts (global)
│   ├── presets/       # presets de enriquecimento e ordem.json
│   ├── sons/          # sons do time e sons/biblioteca/ processada (licença)
│   ├── transicoes/    # transições entre planos (§8.8)
│   ├── trilhas/       # faixas de fundo geradas (§8.9)
│   └── modelos/       # os modelos de visão do MediaPipe (rosto e silhueta)
└── _legado/           # projeto anterior, só referência (fora do git)
```

## 5. Projeto em disco

✅ Uma pasta por projeto, com `projeto.json` como fonte de verdade. Os originais nunca são alterados.

💡

```text
dados/projetos/<slug>/
├── projeto.json        # estado: fontes, formato, timeline, etapas, histórico, versões (briefing e chats: de projetos antigos / do agente futuro)
├── transcricoes/       # uma transcrição por motor: whisper.json, whisper-stable.json, whisper-qwen.json, …
├── silencios.json
├── picos.json          # forma de onda real: um pico a cada 5 ms (0–255), para a timeline
├── midia/
│   ├── bruto.<ext>     # o vídeo do ator, como foi enviado (num vertical)
│   ├── bruto_9x16.mp4  # num 16:9: o 9:16 gerado pelo enquadramento (o bruto do projeto; refeito a cada Reenquadrar)
│   ├── original/       # num 16:9: o vídeo enviado, intocado
│   ├── proxy/          # versões 720p para o player
│   ├── recorte/        # a silhueta do ator (máscara e só a pessoa)
│   ├── rosto/          # o rosto do ator ao longo do vídeo (§8.7): <bruto>.json (do proxy) e, num 16:9, original.json
│   └── voz/            # a voz limpa (§8.9)
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
  "formato": "reels",                     // §6 (anúncio e aula: em breve)
  "enquadramento": { "x": 0.5, "suavidade": "normal", "desloca": 0, "original": "midia/original/bruto.mp4",   // §8.1: o resto só se
                     "feito": { "suavidade": "normal", "desloca": 0 }, "versao": 1,                          //   o bruto veio 16:9
                     "estado": "pronto", "progresso": 1, "erro": null },                                    //   (o Reenquadrar)
  "look": { "lut": "casa", "intensidade": 1, "vinheta": "normal" },   // §8.1
  "nivel_voz": { "fonte": "f1", "db": -23.3 },  // §8.6: a fala do bruto, para os sons ficarem na relação certa com a voz
  "timeline": { "V1": [] },              // V1 = clipes do bruto; A1 segue a V1 (inserts, motions, transições, áudio e legenda ficam nos campos de cada área)
  "transcricoes": { "elevenlabs": { "status": "pronto", … } }, "transcricao_ativa": "elevenlabs",
  "cortes": { "mantidas": [], "duvidas": [] },
  "direcao": { "status": "pronto", "versoes": [], "ativa": 1, "itens": [] },   // §8.2.2 (campos da versão aberta espelhados)
  "inserts": { "versao": 1, "pedidos": [] },                                 // §8.3–8.7
  "motions": {},                                                             // §8.5
  "transicoes": {},                                                          // §8.8: as trocadas à mão
  "audio": { "voz": {}, "fundo": null, "fundo_mudo": false, "niveis": {},  // §8.9 (💡 campos em docs/audio.md, "Dados")
             "limpezas": {}, "voz_lufs": {} },                               // 💡 o estado de cada limpeza e a sonoridade medida
  "legenda": { "ligada": true, "modo": "palavra", "ajustes": {} },          // §8.10 (ajustes presos às palavras)
  "rosto": { "estado": "pronto", "progresso": 1, "amostras": 732, "achados": 732 },   // §8.7: a medida em midia/rosto/
  "etapas": { "cortes": "pronta", "direcao": "pronta", … },   // ids: cortes (o Pré-processamento), direcao, inserts, transicoes, audio, legenda
  "chats": { … },                         // o chat do agente (§11), por etapa
  "historico": [],                        // ver §10
  "versoes": []
}
```

## 6. Projetos, criação e pipeline automático

✅ Do zero até a primeira versão cortada: a tela de projetos, a criação de um projeto e o que roda sozinho em seguida. Detalhe técnico em [preprocessamento.md](docs/preprocessamento.md) e [cortes.md](docs/cortes.md).

### 6.1 Tela de projetos

#### O que é
A tela inicial do app (`/`, `paginas/Projetos.tsx`): a grade com todos os projetos, do mais novo para o mais antigo. Dali se abre, cria e apaga um projeto e se chega às Configurações.

#### Passo a passo
1. Ao abrir a tela, o front pede a lista (`GET /api/projetos`). O backend lê cada `dados/projetos/*/projeto.json` e devolve um resumo por projeto (id, nome, data de criação, estado das etapas, duração do bruto e do vídeo editado, número de vídeos de apoio dos projetos antigos).
2. Cada card pede a sua miniatura (`GET /api/projetos/{id}/miniatura`). Ela é gerada **no primeiro pedido** (um quadro em 1 s, ou no meio de um vídeo menor que 2 s, com 360 px de largura) e guardada como `miniatura.jpg` na pasta do projeto.
3. **Abrir:** clicar no card leva ao editor do projeto (`/p/<id>`). O editor abre na **última etapa usada naquele projeto** (lembrada no navegador) ou, na primeira vez, no Pré-processamento. Ao abrir, o projeto vira uma **aba** na barra de cima.
4. **Criar:** "Novo projeto ↗" (no topo) ou o card tracejado "+ Novo projeto" no começo da grade abrem o diálogo de criação (ver "Criar um projeto").
5. **Apagar:** passar o mouse sobre um card mostra uma lixeira no canto de cima à esquerda. Clicar pede confirmação ("Ele sai da lista e vai para a lixeira (projetos/_lixeira/), de onde dá para recuperar"). Confirmado, o backend **move** a pasta para `dados/projetos/_lixeira/<id>-AAAAMMDD-HHMMSS` (nada é apagado do disco), o card some e a aba do projeto, se aberta, fecha.

#### O que você vê e pode fazer
- **Barra de cima** (igual em todas as telas):
  - os **projetos abertos como abas**. Clicar abre; o **×** fecha a aba (se for a aberta, volta para a tela de projetos); **dois cliques no nome da aba ativa** renomeiam (Enter ou sair do campo salva, Esc cancela; até 120 caracteres). Renomear muda só o nome exibido: o id e a pasta continuam (`PUT /api/projetos/{id}/nome`). As abas ficam guardadas no navegador (não no servidor).
  - depois, **Projetos · Banco · Motions · Referências**; à direita, **Presets · Transições · Calibragem · Heurística da direção**.
  - 💡 As abas ocupam até 40% da barra: primeiro encolhem (nome cortado, até 120 px), depois rolam, com a ativa sempre à vista. Em janela estreita os links ficam só com o ícone (a Calibragem e a Heurística perdem o rótulo primeiro). O que não cabe ganha um degradê e uma seta naquele lado.
  - **Engrenagem**: abre as Configurações (aqui, na aba Geral).
  - **Novo projeto ↗** (coral).
- **Cabeçalho da grade:** "Recentes · NN" (o total de projetos) e "Do mais novo para o mais antigo".
- **Cada card** (formato 9:16):
  - a miniatura;
  - um **selo de duração** no canto de cima à direita: a duração do **vídeo editado** (a soma dos trechos mantidos, já dividida pela velocidade do ator, ou seja, o tamanho do Reels); antes dos cortes, a do bruto. Passar o mouse mostra as duas ("Vídeo editado 0:58 · bruto 2:02");
  - **seis barrinhas** na base, uma por etapa: menta = pronta, amarela = em andamento, apagada = pendente. O Pré-processamento e a Direção ficam prontos quando a IA termina; os Inserts são calculados (prontos com mídia ou motion em todos os pedidos, em andamento com alguns). Transições, Áudio e Legenda ainda não têm critério de pronta (a dica diz "ainda sem marcação de pronta");
  - o nome, a data ("02 out") e, em projetos antigos, "· N apoios".
- Sem nenhum projeto: "Nenhum projeto ainda. Comece subindo um vídeo bruto."
- 💡 **Endereço sem tela** (rota inexistente, ou a aba lembrada de um projeto apagado): uma tela com "Voltar aos projetos" e, num projeto, "Fechar a aba deste projeto" (`paginas/NaoEncontrada.tsx`).

#### O que fica gravado
- Nada novo na tela em si, exceto a `miniatura.jpg` (na primeira vez) e, ao renomear, o campo `nome` do `projeto.json`.
- Apagar: a pasta inteira vai para `dados/projetos/_lixeira/<id>-<data-hora>/`. 💡 Para recuperar, é preciso mover a pasta de volta para `dados/projetos/` **com o nome igual ao id** do projeto (o sufixo de data precisa sair); não há botão de restaurar.
- No navegador: as abas abertas (`abas.projetos`) e a última etapa de cada projeto (`editor.etapa.<id>`).

#### No vídeo final
Nenhum efeito.

#### Ligações
É a porta de entrada: daqui se cria o projeto (que dispara o pipeline) e se abre o editor.

---

### 6.2 Criar um projeto

#### O que é
O diálogo **Novo projeto** (`paginas/NovoProjeto.tsx`, "Do bruto ao Reels."): pede só o necessário para começar. O briefing e os vídeos de apoio saíram da criação (out/2026); o backend ainda os aceita de clientes antigos, mas a tela não os pede.

#### Passo a passo
1. **Manual:** preencher os quatro campos e clicar **Criar projeto ↗**.
2. **Envio:** o vídeo sobe com uma barra de progresso ("Enviando… 63%"; ao chegar a 100%, "Lendo os vídeos…"). O diálogo não fecha enquanto envia.
3. **Automático, no servidor** (`POST /api/projetos`):
   1. confere o nome (vazio: "Dê um nome ao projeto"), o motor (desconhecido: erro) e o formato (Anúncio e Aula: "Esse formato ainda não está disponível (em breve)");
   2. cria o **id** a partir do nome (sem acentos, minúsculas, hífens: "Melhor IA design" → `melhor-ia-design`; se já existir, `-2`, `-3`…);
   3. grava o vídeo em `midia/bruto.<extensão original>`;
   4. inspeciona com o ffprobe, **considerando o metadado de rotação** (um vídeo de celular gravado em pé pode dizer 3840×2160 cru e ser vertical);
   5. **recusa** com mensagem legível, no próprio diálogo, e **apaga a pasta**: arquivo sem imagem ("Este arquivo não tem imagem: escolha um vídeo."), sem áudio ("Este vídeo não tem áudio: o editor precisa da fala para transcrever e cortar.") ou ilegível ("Não consegui ler o vídeo (formato não suportado ou arquivo corrompido)."). A linha de comando do ffmpeg nunca aparece na tela, só no log do servidor;
   6. cria o `projeto.json` e **põe o pipeline na fila** (ver a próxima seção).
4. O app navega direto para o editor do projeto, que mostra a tela de processamento.

#### O que você vê e pode fazer
- **Nome** (obrigatório). Ex.: "Melhor IA para design".
- **Motor de transcrição**: uma lista com os 8 motores; já vem marcado o **padrão das Configurações** (de fábrica, ElevenLabs Scribe v2). Um motor que precisa de chave de API e não a tem aparece com " — sem chave de API" (pode ser escolhido; ver o plano B no pipeline).
- **Formato**: **Reels** (vertical, 9:16; marcado), **Anúncio** e **Aula** (desligados, "em breve").
- **Vídeo bruto** (obrigatório): qualquer arquivo de vídeo, **vertical (9:16) ou horizontal (16:9)**.
- **Cancelar** e **Criar projeto ↗**. Erros aparecem em vermelho embaixo, sem fechar o diálogo.

#### O que fica gravado
`dados/projetos/<id>/`:
- `midia/bruto.<ext>`: o vídeo como foi enviado (num 16:9 ele depois vai para `midia/original/`, ver o pipeline).
- `projeto.json` inicial: `id`, `nome`, `criado_em`, `saida` (1080×1920), `fontes` (o bruto `f1`, com `nome_original`, `duracao`, `largura`, `altura`, `fps`, `tem_audio`), `briefing` (vazio), `formato: "reels"`, `enquadramento: {x: 0.5}`, `timeline: {V1: []}`, `etapas` (todas `pendente`), `chats` (vazios), `pipeline`, `transcricoes` (os 8 motores, `pendente`), `motor_inicial` e `transcricao_ativa` (o motor escolhido).
- 💡 `motor_inicial` congela o motor do momento da criação: mudar o padrão nas Configurações depois não altera projetos existentes.

#### No vídeo final
O formato fixa a saída em 1080×1920 (9:16). O resto vem das etapas.

#### Ligações
Dispara o pipeline automático. O motor escolhido define a transcrição de que saem os cortes (e, por eles, tudo o que se prende às palavras).

---

### 6.3 O pipeline automático ao criar

#### O que é
A sequência que roda sozinha, em segundo plano, logo depois da criação (`backend/app/pipeline.py`), para Rodrigo abrir o Pré-processamento e já encontrar uma primeira versão cortada. O estado de cada passo fica no `projeto.json` (`pipeline.passos`) e a tela consulta o projeto a cada 1 s.

#### Passo a passo
Os passos principais são, nesta ordem: **enquadramento → proxy (em paralelo) → silêncios → transcrição → alinhamento → cortes**; depois, numa fila própria, os **motores extras**. Há uma fila de um trabalho por vez para o que o criador espera e outra, separada, para os motores extras (que não atrasam os cortes).

1. **Enquadramento 16:9 → 9:16** (automático; só se o bruto é horizontal, ou seja, largura > altura depois da rotação). Roda **antes de tudo**, porque todo o resto parte do 9:16. Num vertical, o passo fica "pulado" e nem aparece na tela.
   1. Na primeira vez, o vídeo enviado vai para `midia/original/` (intocado) e o projeto passa a apontar para ele na mesma gravação (se o render falhar, o projeto continua com um bruto que existe).
   2. Mede o rosto no original reduzido (lado maior até 1280 px), a 6 quadros por segundo, com o MediaPipe (local) → `midia/rosto/original.json`. Ocupa os primeiros 40% do progresso. Não é medido de novo num Reenquadrar.
   3. Calcula o caminho da câmera (ver "Enquadramento" na Etapa 1) e renderiza o 9:16 com o ffmpeg: recorte na altura inteira (um 4K 16:9 vira **1216×2160**), HEVC pelo chip do Mac (`-q:v 80`), áudio copiado → `midia/bruto_9x16.mp4`. Os 60% restantes do progresso.
   4. O bruto do projeto passa a ser `midia/bruto_9x16.mp4` (medidas relidas), `enquadramento.feito` guarda a suavidade e o deslocamento usados, e `enquadramento.versao` sobe 1.
   5. Sem rosto nenhum no vídeo: o recorte fica no centro e o passo termina com o aviso "sem rosto: recorte no centro".
   6. 💡 "Tentar de novo" não refaz o 9:16 se ele já existe com os mesmos parâmetros.
2. **Proxy 720p** (automático, **em paralelo** com os passos 3 a 6; só serve ao player). Lado menor 720 px, H.264 por hardware a 3 Mb/s, um quadro-chave a cada 0,5 s (o player salta muito entre trechos), AAC 128 kb/s. Mantém a linha do tempo do bruto. Grava num arquivo `.parte.mp4` e troca no fim (um proxy refeito nunca some do player no meio). Se já existe, é reaproveitado.
   - **Assim que o proxy fica pronto**, entram em segundo plano, cada um na sua fila:
     - a **silhueta do ator** (`recorte_ator.py`, segmentador de selfie do MediaPipe, sobre o proxy): `midia/recorte/f1_mascara.mp4` (máscara em cinza, borda macia) e `midia/recorte/f1_pessoa.webm` (só a pessoa, com transparência, 540 px de largura), usadas no "ator embaixo" (cabeça por cima do insert);
     - a **medida do rosto** (`rosto.py`, sobre o proxy, 6 amostras por segundo, confiança mínima 0,5, vale o maior rosto; os buracos recebem a medida vizinha com confiança 0): `midia/rosto/f1.json`, usada para posicionar o ator na tela dividida. Medido no vídeo de teste (2:02): ~10 s.
3. **Silêncios e forma de onda** (automático). Extrai o áudio em WAV mono 16 kHz (`audio.wav`, preservando o atraso inicial). Detecta os silêncios com o `silencedetect` do ffmpeg (**−35 dB, pausas ≥ 0,3 s**; o silêncio que vai até o fim do arquivo fica de fora) → `silencios.json`. Calcula a forma de onda real, **um pico a cada 5 ms** (200 por segundo, 0 a 255, pela raiz da amplitude para a fala baixa aparecer) → `picos.json`.
4. **Transcrição** (automática), com tempo por palavra:
   - **Motor que escreve o próprio texto** (ElevenLabs, Parakeet, Qwen3-ASR, Whisper large-v3): roda esse motor e grava `transcricoes/<motor>.json`.
     - **Plano B:** se ele falha (sem chave, sem rede, cota), o projeto **não trava**: muda o motor ativo para **Whisper + stable-ts**, segue com o Whisper e mostra o motivo na tela de processamento (ex.: "ElevenLabs Scribe v2 não funcionou (…); segui com Whisper + stable-ts.").
   - **Motor da família Whisper** (ou o plano B): roda o **Whisper turbo local** (MLX, `whisper-large-v3-turbo`, português) **por pedaços**: o áudio é partido no meio de cada pausa ≥ 0,5 s, e pedaços com menos de 0,3 s de fala são pulados (o Whisper inventaria texto no silêncio). Transcrever tudo de uma vez fazia o Whisper fundir tentativas repetidas. Grava `transcricoes/whisper.json`.
   - Cada palavra recebe um **ID estável** (`w00000`, `w00001`…) e os tempos no áudio inteiro. Nada é limpo: repetições e retomadas ficam, porque são justamente o que os cortes decidem.
   - **Sem nenhuma palavra**, o pipeline para aqui ("Não encontrei fala neste vídeo…"), antes do alinhamento e da IA dos cortes (que seria paga à toa).
5. **Alinhamento** (automático; só quando o motor ativo é um **alinhador** do Whisper: stable-ts, Qwen3-Aligner ou CTC). Mantém o texto e os IDs do Whisper e recalcula só os tempos de cada palavra. O stable-ts guarda também os tempos originais do Whisper (`inicio_whisper`/`fim_whisper`) para comparar no detalhe. Se o alinhamento não bater palavra por palavra, mantém os tempos do Whisper e registra um aviso. Nos outros motores, o passo é pulado e some da tela.
6. **Cortes pela IA** (automático):
   1. Monta a transcrição para a LLM: uma palavra por linha (`ID<TAB>texto`), com as **pausas reais ≥ 0,3 s** intercaladas (`[pausa 1.3s]`), que ajudam a separar tentativas.
   2. Junta, antes da transcrição, o **"Sobre o criador"** das Configurações (se houver) e o briefing (só em projetos antigos).
   3. O prompt de sistema traz as instruções fixas e as **regras editoriais do SPEC §14**, lidas do próprio SPEC a cada chamada.
   4. A LLM (OpenRouter; `OPENROUTER_MODEL` no `.env`, padrão `google/gemini-3.8-flash`, temperatura 0, 180 s de limite, uma nova tentativa) devolve `manter` (intervalos de IDs, em ordem, sem sobreposição) e `duvidas` (intervalo + motivo).
   5. O código **valida** (IDs existem, em ordem, sem sobreposição, pelo menos uma palavra) e **monta os clipes** da V1 com as margens e o limite de pausas vigentes nas Configurações (regras na seção Cortes, abaixo).
   6. Grava `cortes` e a V1 e marca a etapa `cortes` como pronta. Medido: ~17 s e ~US$ 0,03 por vídeo de 2 min.
7. **Motores extras** (automático, em segundo plano, fila própria; só se os passos principais terminaram bem). Roda, nesta ordem, os que ainda não estão prontos: Whisper (puro), Whisper + stable-ts, Whisper + Qwen3-Aligner, Whisper + CTC, Parakeet v3, Qwen3-ASR 1.7B + Aligner, Whisper large-v3 + stable-ts e ElevenLabs Scribe v2. Um que falha não derruba os outros; o ElevenLabs sem chave fica "sem chave de API". Eles aparecem no seletor "Ver/Comparar" conforme ficam prontos.

💡 **Tempos medidos** (bruto de teste de 2:02): com o ElevenLabs, cortes prontos ~32 s depois de criar (transcrição em 4 s). Um 16:9 soma a conversão (~30 s na primeira vez, com a medida do rosto).

💡 **Se o servidor cair no meio**, o que estava pendente ou rodando recomeça sozinho quando ele sobe (pipeline, rosto, silhueta e Reenquadrar).

#### O que você vê e pode fazer
- Enquanto não há transcrição, o editor mostra a **tela de processamento** ("Preparando o projeto · A IA está montando o primeiro corte."), com uma linha por passo:
  - "Enquadrando o vídeo 16:9 em 9:16, seguindo o rosto" (só num vídeo que chegou horizontal);
  - "Preparando o vídeo para o player";
  - "Encontrando as pausas reais";
  - "Transcrevendo o áudio, palavra por palavra";
  - "Ajustando o tempo de cada palavra ao áudio" (só com um alinhador);
  - "Escolhendo o texto final com IA".
- Cada linha tem um ícone de estado (vazio = pendente, girando = rodando, ✓ menta = pronto, ! coral = erro) e, à direita, a % (enquadramento e proxy) ou os segundos que o passo levou.
- O aviso do plano B (motor que falhou) aparece embaixo, com borda amarela.
- **Se um passo para:** "O processamento parou.", a mensagem legível (a frase do passo, ex.: "Não consegui transcrever o áudio (…)", sem caminhos do servidor) e **Tentar de novo ↗** (roda o pipeline inteiro de novo; é recusado durante um Reenquadrar). A tela segue acompanhando o proxy, que roda em paralelo, até ele chegar ao ✓.
- Os motores extras não aparecem aqui; aparecem depois, no seletor dos Cortes.

#### O que fica gravado
`dados/projetos/<id>/`:
- `midia/original/<arquivo>` e `midia/bruto_9x16.mp4` (só num 16:9); `midia/rosto/original.json` (o rosto do original, só num 16:9).
- `midia/proxy/f1.mp4` (o proxy).
- `audio.wav`, `silencios.json` (`{silencios: [{inicio, fim, dur}]}`), `picos.json` (`{por_segundo: 200, picos: [...]}`).
- `transcricoes/<motor>.json` (`{palavras: [{id, texto, inicio, fim}]}`), um por motor.
- `midia/recorte/f1_mascara.mp4`, `midia/recorte/f1_pessoa.webm`, `midia/rosto/f1.json`.
- No `projeto.json`: `pipeline.passos.<passo>` (`status`, `segundos`, `progresso`, avisos) e `pipeline.erro`; `fontes[0]` atualizado (arquivo, medidas, `proxy`); `enquadramento` (`original`, `feito`, `versao`); `transcricoes.<motor>` (`status`: pendente · rodando · pronto · erro · sem_chave, `palavras`, `segundos`, `erro`, `aviso`); `transcricao_ativa`; `cortes` (`mantidas`, `duvidas`, `modelo`, `parametros`); `timeline.V1` (clipes `{id, fonte, inicio, fim, palavra_ini, palavra_fim}`, em segundos do bruto); `etapas.cortes: "pronta"`; `recorte` e `rosto` (estado e progresso).

#### No vídeo final
O pipeline produz a matéria-prima: o 9:16 (num 16:9), a V1 (o que fica do bruto) e as palavras com tempo, de que tudo depois depende. O proxy, as transcrições extras e a forma de onda servem só à edição.

#### Ligações
- A V1 e as palavras alimentam o Pré-processamento e, por ele, tudo o que se prende às palavras: direção, inserts, motions, transições, legenda e o áudio.
- O rosto do proxy serve à tela dividida e ao "ator embaixo" (§8.7); a silhueta, à cabeça por cima do insert.
- 💡 **Cuidado:** "Tentar de novo" roda também a transcrição, e transcrever de novo **zera o registro dos motores** e volta ao motor inicial do projeto (o texto novo invalida o que dependia do anterior).

---

## 7. Interface

✅ Layout de editor estilo **Premiere**, num verde profundo (`#172e2b`) como chrome do app inteiro, para o vídeo ter contraste; diálogos em creme (`#faf7ee`); pílulas de contorno fino (a ativa em creme); detalhes em coral. Tokens em `frontend/src/index.css`.

💡 O app:
- **Barra de cima** (todas as telas): os **projetos abertos como abas** (o × fecha; dois cliques no nome renomeiam), depois **Projetos · Banco · Motions · Referências** e, à direita, **Presets · Transições · Calibragem · Heurística da direção** (o que treina e regula o app; pedido de Rodrigo, out/2026).
- **Barra das etapas** (à esquerda, recolhível): Pré-processamento · Direção visual · Inserts · Transições · Áudio · Legenda. Cada projeto reabre na última etapa usada. 💡 O Pré-processamento guarda o id `cortes` (dados e etapa lembrada continuam valendo) e mostra tudo numa tela só, sem abas: os Cortes, a prévia e, à direita, o Look e o Enquadramento (P1; [preprocessamento.md](docs/preprocessamento.md)). A etapa Transições segue o arranjo da de Inserts (P2; [transicoes.md](docs/transicoes.md)). A etapa Áudio também (P3; [audio.md](docs/audio.md)). A etapa Legenda também (P4; [legenda.md](docs/legenda.md)). Nenhuma etapa fica mais em construção (a tela provisória com o selo EM CONSTRUÇÃO saiu na P4). Em janelas estreitas, os links da barra de cima ficam só com o ícone (💡 pelo espaço que sobra para os links, não pela largura da janela — uma container query: as abas dos projetos abertos ocupam até 40% da barra e rolam; a Calibragem e a Heurística perdem o rótulo primeiro; se nem os ícones couberem, os links rolam). 💡 As abas encolhem (nome cortado, até 120 px) antes de rolar, e a ativa vem sempre para a vista, inteira e com o × fora das setas (com duas abas ou mais, a faixa das abas tem lugar para uma aba entre as duas setas); o que fica fora da vista, nas abas ou nos links, ganha um degradê e uma seta naquele lado, que rola ao clicar.
- 💡 **Endereço sem tela** (uma rota que não existe, um projeto apagado com a aba ainda lembrada): a barra de cima e "Voltar aos projetos"; no projeto, também "Fechar a aba deste projeto" (`paginas/NaoEncontrada.tsx`). O editor só monta depois que `/editor` responde, então um projeto que não existe não dispara as leituras das etapas (um 404 só); cada projeto monta o seu editor, e trocar de aba não leva nada do anterior.
- 💡 **Lista de projetos:** o selo de cada card é a duração do **vídeo editado** (a soma da V1, `duracao_final` no resumo), o tamanho do Reels; antes dos cortes, a do bruto. A dica do selo diz as duas.
- **Topo do editor:** Configurações (abre na aba da etapa em que se está, §8.18), o botão especial da etapa (ex.: "Refazer cortes") e **Exportar**.
- **Cada etapa** tem a sua tela: a timeline do jeito que serve a ela (vertical nos Cortes e na Direção, horizontal nas outras), o vídeo no centro com o resultado no lugar e os cards de trabalho ao lado.

✅ Atalhos: espaço toca/pausa; ←/→ andam 0,5 s (com shift, 5 s); ⌘ + / ⌘ − dão zoom na linha do tempo. Clicar numa palavra ou item pula o player para ela.

## 8. Etapas, passo a passo

✅ Cada etapa descrita do jeito que funciona hoje (conferido no código, out/2026), sempre na mesma ordem: **O que é** · **Passo a passo** (o que acontece, na ordem; o que é automático e o que é manual) · **O que você vê e pode fazer** (cada controle) · **O que fica gravado** · **No vídeo final** · **Ligações**. O detalhe técnico e as decisões de cada área ficam nos docs (tabela no topo). As páginas de apoio vêm no fim (§8.11 a §8.18).

### 8.1 Pré-processamento (a tela)

#### O que é
A primeira etapa do editor (id interno `cortes`, o de antes): tudo o que se faz no vídeo do ator antes da direção. **Uma tela só, sem abas** (pedido de Rodrigo: "não esconda as coisas atrás de tabs").

#### O que você vê e pode fazer
- **Barra das etapas** à esquerda (recolhível; abaixo de 1300 px de janela começa recolhida, só os números), com, no pé, o nome original do bruto, a duração e as dimensões.
- **Três colunas:**
  1. a **linha vertical dos Cortes** (de 300 px até 38% da janela, no máximo 720 px);
  2. a **prévia** (mínimo 300 px) com o **detalhe** da seleção embaixo;
  3. **à direita, sempre à vista** (280 a 380 px): **Velocidade do ator**, **Look do ator** e **Enquadramento**, nesta ordem.
- **Topo do editor**: Desfazer, Refazer e Versões (desligados, "fase 3b"), a engrenagem (abre as Configurações **na aba Cortes**), **Refazer cortes** (botão amarelo, só nesta etapa) e **Exportar**.
- **Prévia**: voltar ao início, tocar/pausar, o tempo no vídeo final / a duração e, em amarelo, o tempo no **bruto**; a velocidade de reprodução **0,25× · 0,5× · 1× · 2×** (o tom é preservado; não muda o projeto, só a prévia). O look aparece aplicado.
- **Atalhos** (valem na etapa inteira; não valem num campo de texto, numa alça de corte selecionada, nas setas de um slider, com um modal aberto ou com ⌘/Ctrl):
  - **espaço**: toca/pausa;
  - **← / →**: anda 0,5 s no bruto (**Shift** 5 s, **Alt** 10 ms);
  - **E**: ouve a emenda do próximo corte à frente da cabeça de reprodução (ou do último);
  - **B**: alterna "Resultado" e "Bruto";
  - **⌘ + / ⌘ −** (Ctrl no Windows): zoom da linha do tempo (no lugar do zoom da página).

---

### 8.1a Cortes

#### O que é
Decidir **o que fica do bruto**. A IA escolhe quais palavras ficam (pelo ID; nada é reescrito nem inventado) e o código transforma isso em trechos (os clipes da V1), com as bordas caindo em pausas reais do áudio. Rodrigo inspeciona em milissegundos e corrige à mão. As regras editoriais (o que a IA pode remover e o que deve preservar) ficam **só no SPEC §14**.

#### Passo a passo
1. **Automático (pipeline):** a IA faz a primeira seleção e os trechos são montados (ver o pipeline, passo 6).
2. **Como cada ponto de corte é decidido** (o código, não a IA nem o motor):
   1. a LLM diz **quais palavras ficam**;
   2. cada sequência contínua de palavras mantidas vira um trecho, que vai do **início da primeira** ao **fim da última** palavra (tempos do motor de transcrição);
   3. **pausa longa:** se entre duas palavras mantidas seguidas o vão é ≥ o limite (padrão **2 s**), ou há entre elas um silêncio detectado ≥ o limite, **o trecho se parte em dois** ali. Cada nova borda segue a mesma regra das outras. Não há mais "respiro" à parte: o corte de uma pausa longa deixa as **mesmas margens** dos outros cortes. 💡 Contar o vão entre as palavras (e não só um silêncio detectado inteiro) resolve o caso do detector partir um silêncio em dois por um ruído curto (0,94 s + 1,04 s);
   4. **início de um trecho:** procura um silêncio cujo **fim** esteja entre 0,5 s antes e 0,35 s depois do início da palavra (o Whisper erra ~0,2 s). Achou: a borda fica nesse silêncio, deixando a margem **"Depois do corte"** antes da palavra (no máximo a pausa inteira). Não achou (fala contínua): o início da palavra menos a margem. Em qualquer caso, **nunca invade a palavra removida vizinha**;
   5. **fim de um trecho:** o mesmo, espelhado: um silêncio cujo **início** esteja entre 0,35 s antes e 0,5 s depois do fim da palavra; a borda deixa a margem **"Antes do corte"** depois da palavra;
   6. dois trechos que quase se tocam (até 20 ms) viram um só; trechos sem palavra mantida somem.
3. **Manual:** Rodrigo navega, ouve as emendas e corrige com as alças, o "✂ Cortar trecho", o "✕ Excluir corte", o "Restaurar da IA", o "Recalcular" e o "Refazer cortes" (detalhe abaixo). Cada edição vai ao servidor e a tela recarrega.
4. 💡 **O primeiro ajuste manual** guarda a seleção da IA (`cortes.mantidas_auto`) e, em cada trecho mexido, as bordas originais (`auto`), para poder restaurar.

#### O que você vê e pode fazer

**Linha vertical** (`preprocessamento/LinhaVertical.tsx`): o tempo do bruto corre de cima para baixo. Colunas, da esquerda para a direita: régua · forma de onda · barras de tempo exato · palavras · cortes.
- **Cabeçalho:** "Bruto 2:02 → **0:58** · 14 cortes" (a duração final já considera a velocidade do ator); **− / +** (zoom de 1,6× em 1,6×) e **caber o bruto todo na janela**.
- **Zoom:** começa em 110 px por segundo; vai de "o bruto todo na janela" até 6.000 px por segundo. Também com ⌘/Ctrl + roda do mouse (o instante sob o cursor fica parado) e ⌘ + / ⌘ −. As palavras só aparecem a partir de 60 px por segundo (antes disso: "Aproxime (+ ou Ctrl/⌘ + roda do mouse) para ver as palavras.").
- **Forma de onda real** (um pico a cada 5 ms): clara nos trechos que ficam, coral nos cortados. **Clicar ou arrastar** na régua/onda move a cabeça de reprodução. Tocando, a linha rola para manter a cabeça na parte de cima.
- **Palavras:** cada uma com uma barra do seu tempo exato (menta = fica, coral = cortada) e o rótulo ao lado (cortada = riscada). Se dois rótulos colidem, o de baixo desce e uma curva o liga ao seu instante; um rótulo nunca passa por cima de um corte compactado (o que não cabe fica só com a barra, e o último que coube mostra **+N**). Passar o mouse mostra o ID e o tempo em ms; a palavra que está tocando fica amarela. **Clicar** seleciona e leva o player a ela.
- **Cortes compactados** (o padrão): cada corte vira **uma linha de 34 px**, qualquer que seja a duração, com listras coral: "✂3 −9,6 s · 30 pal. ~~mas na minha opinião…~~" (ou "· pausa" quando nenhuma palavra saiu). Os trechos mantidos continuam proporcionais ao tempo. Na linha: clicar seleciona e leva o player ao corte; **✕** exclui o corte; **⇕** (ou dois cliques na linha) expande. Selecionar uma palavra escondida num corte compactado o expande.
- **Cortes expandidos:** a faixa listrada no tempo real. Os controles (**✕** excluir, **compactar**, o chip "✂3 · −9,6 s") ficam à direita e **acompanham a rolagem** enquanto o corte aparece.
- **Expandir tudo / Compactar tudo.**
- **Alças nas bordas** (nos cortes expandidos **e nos compactados**): uma barrinha em cada ponta do corte. A de cima move o **fim do trecho de cima**; a de baixo, o **início do trecho de baixo**.
  - Arrastar: a borda anda pelo **deslocamento do mouse desde onde foi pega** (sem salto ao começar) e só depois de 3 px. **Sem ímã**: vai exatamente onde o mouse vai. Num corte compactado, o arrasto anda no **tempo real**, na escala da régua, não na faixa de 34 px.
  - Durante o arrasto: uma linha tracejada (de onde saiu) e uma amarela (onde vai cair) com o tempo, o deslocamento em ms e onde a borda cai: "em pausa", "entre palavras" ou, em vermelho, "dentro de “x” (N ms depois do início)".
  - **Teclado** (com a alça selecionada): **↑/↓** andam 10 ms (**Shift** 1 ms, **Alt** 50 ms); cada toque vai para o servidor em fila.
  - A alça fica **amarela** quando foi ajustada à mão; a dica mostra onde a IA a tinha posto.
  - **Limites** (no servidor): a borda não passa do trecho vizinho e nenhum trecho fica com menos de 50 ms ou sem palavra mantida. As palavras entre a posição antiga e a nova passam a ficar (ou sair) se pelo menos metade delas ficar dentro de algum trecho.
- **✂ Cortar trecho** (chave; Esc sai): arrastar sobre a onda escolhe um intervalo (mostra "✂ −0,412 s · início → fim") e o corta, **mesmo no meio de um trecho mantido** (ex.: uma pausa entre duas falas boas). O corte novo já abre expandido e selecionado. Mínimo de 20 ms. 💡 Uma palavra é ancorada por um trecho que a cubra em ≥ 30 ms; pedaços que ficariam sem palavra (só pausa) somem; um trecho cortado ao meio vira dois.
- **✕ Excluir corte** (na linha compacta, nos controles do expandido e no detalhe): devolve o intervalo ao vídeo (junta os trechos vizinhos). Recusado se ali não há palavras para devolver.
- **Resultado / Bruto** (tecla B): tocar pulando os trechos cortados (o resultado) ou o bruto sem pular. 💡 Nada é renderizado: o player toca o proxy e salta; a 150 ms do fim de um trecho o salto é agendado para o instante exato, com o som silenciado no salto, para não vazar o começo da palavra cortada. Parado dentro de um trecho cortado, o player fica onde está.
- **Roteiro:** abre o texto como a IA deixou, **frase a frase**, com as palavras cortadas riscadas e o total ("312 palavras ficam · 41 cortadas"). Uma frase quebra na pontuação final, numa pausa ≥ 0,7 s, numa vírgula a partir de ~18 palavras ou em 35 palavras. Frases inteiramente cortadas aparecem apagadas. Clicar numa frase leva o player a ela e fecha; Esc fecha.
- **Recalcular:** refaz os trechos **a partir das palavras que estão mantidas agora**, com as margens e o limite de pausas atuais das Configurações, **sem chamar a IA**. Descarta os ajustes manuais de borda (pede confirmação se houver: "Recalcular as margens descarta N trecho(s) com ajuste manual de borda.") e os cortes feitos à mão que não removiam palavras (uma pausa cortada à mão). As palavras que entraram ou saíram à mão continuam. Depois dele não há mais "Restaurar da IA".
- **Refazer cortes** (botão amarelo no topo; só no Pré-processamento; desligado sem transcrição ou enquanto algo roda): pede **uma nova seleção à IA, sem retranscrever**, com as margens atuais. Se houver trechos ajustados à mão, pede confirmação ("…descarta N trecho(s) com ajuste manual"). Recusado enquanto a transcrição não terminou. Enquanto roda, o botão diz "Refazendo…"; ao terminar, a tela recarrega. **Substitui** a seleção inteira (os ajustes e as palavras ligadas ou desligadas à mão se perdem).
- **Motores de transcrição** (no topo da linha):
  - **Ver:** qual transcrição está na tela. Os que não estão prontos aparecem desligados, com o motivo (" — na fila", " — rodando…", " — erro", " — sem chave de API").
    - **Mesma família** (Whisper puro, + stable-ts, + Qwen3-Aligner, + CTC: o mesmo texto e os mesmos IDs): trocar **mantém os cortes e os ajustes** e só muda os tempos exibidos.
    - **Família diferente** (ElevenLabs, Parakeet, Qwen3-ASR, Whisper large-v3: texto próprio): os cortes da família atual ficam **guardados**; se a nova família ainda não tem cortes, a IA os faz (~25 s; a tela de processamento aparece); voltar à família anterior traz os cortes dela intactos.
  - **Comparar:** escolhe um segundo motor; o texto se divide em **duas colunas** (A, o que está sendo visto; B, o comparado, em amarelo), cada palavra no seu instante, para ver palavras que um motor perde, escreve diferente ou marca em outro tempo. Clicar numa palavra de B só move o player.
  - Um motor com **erro** ou **sem chave** ganha uma linha com o motivo e **Tentar de novo** (roda só ele; a chave é relida do `.env` sem reiniciar o servidor).
- **Cabeça de reprodução:** a linha clara com o tempo do bruto em ms ("27,512"); no começo do bruto, o chip fica logo abaixo da linha.

**Painel de detalhe** (embaixo da prévia, `DetalheCorte.tsx`; sem seleção: "Selecione uma palavra ou um corte para ver os tempos em milissegundos."):
- **Palavra:** o texto, o ID (`w00091`), **MANTIDA** ou **REMOVIDA PELA IA**, início → fim em ms e a duração. Com um motor de comparação da mesma família, os tempos dele e a diferença (início e fim, em ms); sem comparação, com o stable-ts, onde o Whisper a tinha marcado. Botões: **▶ Ouvir** (a palavra com 0,3 s antes e depois, sem pular cortes) e **Copiar referência** (`w00091 “texto” · 27,512 → 27,804 s`).
- **Corte:** "✂3", início → fim, "−3,748 s" e o tipo ("N palavras removidas" ou "pausa longa encurtada"). Para cada ponta, o diagnóstico: quantos ms ficaram até a palavra vizinha ("120 ms depois do fim de “mas”") ou "⚠ entra N ms dentro de “x”", e se cai "em pausa (início → fim)" ou "⚠ fora de pausa" (sem pausa por perto, o erro do motor passa direto para o corte). Se uma ponta foi ajustada à mão: "✎ Fim ajustado à mão: a IA tinha posto … (+N ms)" com **↺ Restaurar da IA** (volta as duas bordas do trecho e as palavras entre elas ao que a IA decidiu). O texto removido. Botões: **▶ Ouvir emenda** (~2 s antes e ~2 s depois, com o corte aplicado), **repetir** (em loop), **Copiar referência** (`✂3 · 27,512 → 31,260 s`) e **✕ Excluir corte**.

**Regras de montagem que valem para todo corte** (configuráveis; detalhes acima):
- **Margem "Antes do corte"**: o ar que fica **depois da última palavra** de cada trecho mantido. Padrão 100 ms (0 a 1.000 ms).
- **Margem "Depois do corte"**: o ar que fica **antes da primeira palavra** do trecho seguinte. Padrão 100 ms (0 a 1.000 ms).
- Cada margem é o quanto da pausa real fica com a palavra mantida, **no máximo a pausa inteira**; com 0, o corte cola nas palavras.
- **Pausas longas**: dentro de um trecho mantido, só uma pausa **maior que o limite** (padrão 2 s; 0 a 30 s; **0 = nunca cortar**) é cortada; ela parte o trecho em dois e usa as mesmas margens. Pausas menores ficam como foram faladas (dão clima e tempo para formular a frase).
- Valem para cortes novos, para "Refazer cortes" e para "Recalcular"; não mexem sozinhas em trechos já montados.

#### O que fica gravado
- `projeto.json`:
  - `timeline.V1`: os clipes `{id: "c1", fonte: "f1", inicio, fim, palavra_ini, palavra_fim}` (segundos do bruto) e, nos ajustados à mão, `auto: {inicio, fim}`;
  - `cortes.mantidas`: as faixas de IDs que ficam (`[["w00003","w00027"], …]`, refeitas a cada edição); `cortes.mantidas_auto` (a seleção da IA, depois do primeiro ajuste); `cortes.duvidas`; `cortes.modelo`; `cortes.parametros` (`pausa_max`, `folga_inicio`, `folga_fim`, em segundos);
  - `transcricao_ativa` e `familias` (os cortes guardados de cada família não aberta: `cortes`, `V1`, estado da etapa).
- Os arquivos de transcrição, silêncios e picos não mudam na edição.
- No navegador: nada (a seleção, o zoom e os cortes expandidos se perdem ao trocar de projeto).

#### No vídeo final
A exportação corta o **bruto de verdade** (o 9:16, não o proxy) exatamente nos tempos de cada clipe da V1 (`trim` + `concat` no ffmpeg), com um fade de áudio de 15 ms em cada emenda contra estalos. O vídeo final é a soma dos trechos mantidos (dividida pela velocidade do ator).

#### Ligações
- **Tudo depois se prende às palavras**, não a segundos: os planos da direção (e, por eles, inserts, motions e transições), a legenda e as falas que abaixam a música. Mexer num corte faz esses itens acompanharem a fala; um item cujas palavras saíram fica **órfão** (§9).
- As regras editoriais vêm do SPEC §14 (💡 o código as lê pelo título "## N. Regras editoriais dos cortes": o título precisa continuar nesse formato).
- O "Sobre o criador" (Configurações › Geral) entra no prompt.
- As margens e o limite de pausas vêm de Configurações › Cortes.

---

### 8.1b Look

#### O que é
A cor do **ator**: um LUT (tabela de cor 3D) com intensidade e a **vinheta** (bordas escurecidas). Vale para o vídeo inteiro do projeto e **só para o ator** (inserts e motions ficam como são). A prévia e o MP4 usam a mesma tabela e a mesma fórmula, para sair iguais.

#### Passo a passo
1. **Automático:** todo projeto começa com o look padrão, **Casa a 100% com a vinheta Normal** (projetos de antes do Look também).
2. **Manual:** escolher o LUT, a intensidade e a vinheta no card **Look do ator**. A prévia muda na hora; o servidor grava em seguida (a intensidade, 0,4 s depois que o slider para).

#### O que você vê e pode fazer
- **LUT** (quatro botões): **Sem LUT**, **Natural** (quase neutro, só um pouco de contraste), **Casa** (padrão: o look dos nossos vídeos, medido nas referências; mais contraste, pele quente, sombras um pouco frias, o verde/azul do fundo menos saturados) e **Frio / limpo** (branco mais neutro, contraste suave; para gravações com luz quente demais).
- **Intensidade**: 0 a 100%, de 5 em 5 (padrão 100%); desligada com "Sem LUT". É a mistura entre a imagem original e a com LUT.
- **Vinheta**: **Sem · Leve · Normal · Forte** (padrão Normal). Escurece as bordas em 25%, 40% e 55%; elipse com centro um pouco acima do meio (45% da altura), borda bem suave (com Normal, o canto fica a ~64% do brilho).
- **Segure para ver sem o look**: enquanto o botão está pressionado, a prévia mostra o vídeo como foi gravado, para comparar.
- O look aparece em todas as etapas, onde o ator aparece (o player, a janela do "ator embaixo", a pessoa recortada).

#### O que fica gravado
- `projeto.json` › `look: {lut: "casa" | "natural" | "frio" | null, intensidade: 0…1, vinheta: "sem" | "leve" | "normal" | "forte"}`.
- 💡 Os três LUTs são arquivos `.cube` 33×33×33 gerados por nós (`ferramentas/luts.py`, ajustados à mão) em `backend/luts/`.

#### No vídeo final
No ffmpeg, logo depois do recorte e da escala do ator, em RGB: o LUT (`lut3d`, interpolação trilinear, a mesma do WebGL da prévia), misturado com o original pela intensidade, e a máscara da vinheta multiplicada. A pessoa recortada (cabeça por cima do insert) passa pelo mesmo look. 💡 Prévia e MP4 diferem ~4 níveis de 255 no mesmo quadro (sem o look, 16 a 18). Sem look ("Sem LUT" + vinheta "Sem"), o comando da exportação é o mesmo de antes do Look.

#### Ligações
- É a camada 1 do contrato da montagem (o ator), junto com os cortes, o 9:16 e a posição do ator na tela dividida.
- ⏳ A simulação dos presets (página Presets) ainda mostra o ator sem o look. ⏳ Na tela dividida, a vinheta é a do quadro inteiro do ator (antes de ele descer para a metade de baixo): conferir no olho.

---

### 8.1c Enquadramento (16:9 → 9:16 pelo rosto)

#### O que é
Para um bruto **horizontal**: a câmera virtual segue o rosto do ator **devagar** e gera um bruto 9:16, que passa a ser o vídeo do projeto. Num vídeo que já chegou vertical, o card só avisa que não se aplica.

#### Passo a passo
1. **Automático, ao criar** (o primeiro passo do pipeline): mede o rosto, calcula o caminho da câmera e gera `midia/bruto_9x16.mp4`.
2. **Como a câmera anda** (💡):
   1. **o alvo** é o centro do rosto, com uma mediana móvel de 5 amostras (~0,8 s) para ignorar uma detecção errada isolada; onde o rosto não foi achado, vale o último visto;
   2. **zona morta**: pequenos movimentos dentro dela não mexem o quadro;
   3. fora dela, uma **mola amortecida** leva a câmera até deixar o rosto na borda da zona, com **velocidade máxima** limitada, **numa passada só** (a câmera nunca anda antes do ator);
   4. **faixa segura**: se o rosto passa de 20% da largura do recorte a partir do centro (fora de 30–70% do quadro), a mola puxa mais e a velocidade máxima cede;
   5. uma trava (rosto entre 20% e 80% do quadro), uma **suavização gaussiana** curta (σ = 0,25 s; adianta no máximo ~0,5 s) e uma trava final larga (10–90%), que só age num salto do rosto (outra pessoa, erro do detector): o salto vira uma panorâmica rápida (~0,4 s), não um corte;
   6. o recorte **nunca sai da imagem**. Sem rosto no vídeo inteiro: recorte no centro (com o deslocamento).
3. **Suavidades** (zona morta · velocidade máxima · mola):
   - **Calma**: 10% · 10% da largura do recorte por segundo · 1,5/s;
   - **Normal** (padrão): 8% · 20%/s · 2,5/s;
   - **Ágil**: 5% · 25%/s · 4/s.
   - Medido num 16:9 de teste de 2:02 (Normal): o rosto ficou entre 0,32 e 0,72 do quadro; a câmera começa a andar 0,2–0,3 s depois do ator.
4. **Manual — Reenquadrar:** mudar a suavidade e/ou o deslocamento e clicar **Reenquadrar**. Em segundo plano:
   1. refaz o 9:16 (com a medida do rosto do original já guardada; não mede de novo);
   2. refaz o proxy (num arquivo à parte; o player continua com o antigo até o novo ficar pronto);
   3. apaga e pede de novo a silhueta e o rosto do ator (do proxy novo).
   - O estado só fica "pronto" com o proxy novo no lugar. O editor (em qualquer etapa) acompanha e recarrega o player sozinho. **Os cortes e o resto continuam valendo** (o tempo é o mesmo).
   - Medido: um Reenquadrar de 2:02 em 1080p leva ~20 s.
5. 💡 **Recusas:** Reenquadrar com outro em andamento ou com o processamento do vídeo ainda rodando (409); "Tentar de novo" do processamento durante um Reenquadrar. O pipeline e o Reenquadrar nunca geram o 9:16 ao mesmo tempo. Se o servidor reinicia no meio, o Reenquadrar recomeça sozinho e as sobras (`bruto_9x16.parte.mp4`, `.cmds`) são apagadas.
6. **Projetos de antes do enquadramento** com o bruto ainda 16:9: o card explica e oferece **Converter para 9:16** (o mesmo caminho do Reenquadrar).

#### O que você vê e pode fazer
- **Texto** conforme o caso: vídeo vertical ("Este vídeo já é vertical (9:16)…"), 16:9 já convertido ou projeto antigo a converter.
- **O original 16:9** (mudo), sincronizado com o instante do player, com o **retângulo 9:16 amarelo** andando sobre ele (o resto escurecido). É o caminho da câmera atual (o que está gravado, não a escolha ainda não aplicada).
- **Suavidade da câmera**: Calma · Normal · Ágil.
- **Deslocamento do rosto no quadro**: slider de −30% a +30% da largura do recorte, de 2 em 2% ("centro", "10% ←", "10% →"). Positivo põe o rosto mais para a esquerda do quadro.
- **Reenquadrar** (ou **Converter para 9:16**): só se liga quando algo mudou; enquanto roda, "Reenquadrando… 45%". Ao lado: "Refaz o vídeo 9:16 (os cortes e o resto continuam)."
- Em erro: "Não deu para reenquadrar: …".

#### O que fica gravado
- `midia/original/<arquivo>` (o enviado, intocado), `midia/bruto_9x16.mp4` (o 9:16, refeito a cada Reenquadrar), `midia/rosto/original.json` (o rosto do original; nunca apagado num Reenquadrar).
- `projeto.json` › `enquadramento`: `suavidade`, `desloca` (−0,4 a 0,4 aceitos pelo servidor), `original`, `feito` (os parâmetros do 9:16 atual), `versao` (sobe a cada 9:16 novo; o endereço do player leva `?v=<versao>`), `estado` (fila · rodando · pronto · erro), `progresso`, `erro`; e `x: 0.5` (legado). `fontes[0].arquivo` passa a `midia/bruto_9x16.mp4`.

#### No vídeo final
O vídeo do ator **é** o 9:16 gerado: a exportação corta e monta a partir dele. 💡 Um projeto antigo ainda 16:9 e não convertido é exportado com um recorte 9:16 **parado** na posição `enquadramento.x` (o jeito de antes).

#### Ligações
- Tudo parte do 9:16: proxy, transcrição, cortes, silhueta e rosto do ator.
- A medida do rosto (`rosto.py`) é a mesma ferramenta que posiciona o ator na tela dividida e no "ator embaixo" (§8.7).
- ⏳ Duas pessoas no quadro: segue o rosto maior (o mais perto da câmera).

---

### 8.1d Velocidade do ator

#### O que é
Acelerar a fala do ator no **vídeo inteiro**, de **1× a 1,5×**, sem mudar o tom da voz (pedido de Rodrigo, out/2026).

#### Passo a passo
1. **Automático:** todo projeto começa em 1×.
2. **Manual:** um atalho ou o ajuste fino no card **Velocidade do ator** (o primeiro da coluna da direita). A prévia muda na hora; o servidor grava na hora (atalho) ou 0,4 s depois que o slider para.
3. 💡 **Como escala o tempo:** a V1 continua no tempo do bruto e cada clipe passa a durar `(fim − início) / velocidade` na saída. Por isso tudo o que vem das palavras acompanha sozinho (planos, inserts, motions, transições, legenda, sons e as falas que abaixam a música), e a duração final encolhe na mesma proporção (ex.: 60 s de trechos mantidos a 1,2× viram 50 s). O cabeçalho dos Cortes e o selo do card na lista já mostram a duração acelerada.

#### O que você vê e pode fazer
- **Atalhos**: **1× · 1,1× · 1,2× · 1,3×** (o ativo em creme).
- **Ajuste fino**: slider de 1,00× a 1,50×, de 0,05 em 0,05, com o valor ao lado.
- Na prévia, o vídeo do ator toca na velocidade da prévia (0,25× a 2×) multiplicada pela do projeto; a música e os inserts seguem o relógio da saída.

#### O que fica gravado
`projeto.json` › `velocidade` (1 a 1,5, 3 casas). O servidor recusa fora da faixa ("A velocidade vai de 1× a 1,5×").

#### No vídeo final
Cada clipe do ator é acelerado no ffmpeg: o vídeo por `setpts=(PTS-STARTPTS)/vel` e a voz por `atempo=vel` (a 1×, nada muda). As outras camadas já vêm no tempo da saída.

#### Ligações
- Muda a duração e o tempo de tudo o que vem depois.
- ⏳ Os deslocamentos à mão da direção (`off_ini`/`off_fim`, em segundos da saída) não são reescalados quando a velocidade muda.

---

### 8.2 Direção visual

#### O que é

✅ A etapa entre os Cortes e os Inserts que decide **o que aparece na tela em cada momento** do vídeo já cortado. Ela não mexe em mídia nenhuma: só escreve a "partitura visual" (que plano entra, quando troca, o que acontece em cada insert, quais elementos aparecem por cima). Inserts, Motion, Transições e Legenda partem dela.

A IA aprende a dirigir com os vídeos já editados do criador, analisados na Calibragem (os **roteiros de exemplo**), e com as **regras** da Heurística da direção. Ela não recebe imagem do vídeo novo: só a fala.

**Planos-base** — exatamente um por vez, cobrindo o vídeo do começo ao fim sem buracos. São 7 categorias fixas: a IA não cria outras, e uma categoria nova só entra se Rodrigo cadastrar.

| Chave | Nome na tela | O que é |
|---|---|---|
| `full_ator` | Full ator | O apresentador ocupa a tela, com ou sem coisas pequenas por cima. Zoom ou reenquadramento no ator continua sendo Full ator (o zoom fica para o Enriquecimento). |
| `full_ator_lettering` | Full ator com lettering | O ator em tela cheia com um texto grande de destaque sobre ele. O plano dura só enquanto o texto está na tela. O texto exato fica no campo `texto` do plano. |
| `insert_tela_cheia` | Insert tela cheia | Material **real** na tela toda, sem o ator: gravação de tela, site, app, print, foto, vídeo de apoio. |
| `motion_tela_cheia` | Motion tela cheia | Peça gráfica **animada**, feita para o vídeo, na tela toda, sem o ator: logo animado, mockup estilizado, texto animado, infográfico. |
| `tela_dividida_insert` | Tela dividida · insert | Material real em cima e o ator embaixo (ou o ator numa janela menor sobre o conteúdo). |
| `tela_dividida_motion` | Tela dividida · motion | Um motion em cima e o ator embaixo. |
| `comentario_insert_ator` | Comentário + insert + ator | O card do comentário de um seguidor sobre um insert ou motion em cima e o ator embaixo, respondendo. O texto exato do comentário fica no campo `texto`. |

Três desses planos "têm insert": `insert_tela_cheia`, `tela_dividida_insert` e `comentario_insert_ator` (`direcao.tem_insert`). Neles, a marcação conta **o que acontece no insert**, em ordem: qual material aparece, como entra, os zooms, os destaques e as trocas. Só esses três viram pedidos na etapa Inserts.

(Até out/2026, "Tela dividida" era um tipo só, com o que vai em cima num campo `conteudo`. O código ainda converte o formato antigo: `direcao.tipo_atual`. `conteudo` hoje é sempre `null`.)

**Elementos** — ficam por cima de um plano, podem durar menos que ele e podem se sobrepor:

| Chave | Nome | O que é |
|---|---|---|
| `lettering` | Lettering | Uma palavra ou expressão destacada sobre um plano que **não** é o ator em tela cheia (sobre o ator, o certo é o plano Full ator com lettering). |
| `palavra_manychat` | Palavra ManyChat | O CTA "comente PALAVRA". O texto é a palavra. |
| `caixinha_perguntas` | Caixinha de perguntas | O sticker de pergunta dos Stories, com a pergunta de um seguidor. O texto é a pergunta. |
| `print_sobreposto` | Print/imagem sobreposta | Um print, imagem ou logo pequeno sobre o plano, sem tomar a tela. |

**O que cada item guarda:** tipo; onde começa e termina **nas palavras** (com um pequeno deslocamento em segundos); a **marcação** (campo `descricao`: o que aparece e o que acontece, em 1 a 3 frases, sem repetir o layout que o nome do plano já diz; num Full ator comum, ela fica vazia); e o **texto exato** (do lettering, do comentário, da palavra do ManyChat ou da pergunta).

#### Passo a passo

**A) Primeira geração: a v1 (diretora + alinhamento + formatadora).** Você dispara à mão; o resto é automático.

1. **Manual:** com os cortes prontos, você abre a etapa 02 e clica em **"Gerar direção com IA"**. Se os cortes não estiverem prontos, o servidor recusa ("Os cortes ainda não estão prontos"). Se já houver uma geração rodando, recusa também.
2. **Automático:** o projeto passa a `direcao.status = 'rodando'` com o pedido guardado em `direcao.pedido = {tipo: 'gerar'}`. O trabalho vai para uma fila de uma tarefa por vez. Se o servidor reiniciar no meio, o pedido é retomado ao subir (`direcao_projeto.retomar_interrompidas`).
3. **Automático, entrada:** o código pega as palavras **mantidas** nos cortes e calcula o tempo de cada uma no vídeo final (a V1 tocada em sequência, cada clipe na sua velocidade). Sem fala, a geração falha com "O vídeo cortado não tem fala". Sem nenhuma referência analisada na Calibragem, falha com "Nenhuma referência analisada na Calibragem ainda".
4. **Automático, a diretora** (padrão `google/gemini-3.8-flash`, raciocínio **médio**, temperatura 0,3, até 16 mil tokens de saída, timeout de 240 s; modelo e raciocínio em Configurações › Direção visual › "Diretora (projetos)", chaves `modelo_diretora` e `raciocinio_diretora`) recebe:
   - **Prompt de sistema:** o papel dela (escrever o *roteiro dirigido* do vídeo novo no jeito do criador); o formato (os nomes dos 7 planos e dos elementos, como escrever a marcação dos inserts e como marcar letterings); o "Sobre o criador" das Configurações, se houver; e a **Heurística inteira** (Regras do criador, Regras sugeridas pela IA e os roteiros de exemplo de **todas** as referências analisadas, revisadas ou não).
   - **Mensagem:** `=== VÍDEO NOVO (N s, já cortado) ===` e a fala como **texto corrido**, sem IDs nem tempos, com uma linha nova a cada fim de frase ou pausa de 0,6 s ou mais. Se houver Regras do criador, entra no fim um "confira se a direção cumpre as REGRAS DO CRIADOR".
   - Ela devolve um texto no formato dos exemplos: uma linha `[plano: marcação + elementos]` e, embaixo, entre aspas, o pedaço da fala em que aquilo aparece, bloco após bloco. O prompt pede blocos curtos (de meia frase a uma frase) e a fala copiada exatamente. Os **letterings** não vão na marcação, vão **na fala**: `<lettering>GPT 3.7</lettering>`, ou `<lettering texto="R$ 97">noventa e sete reais</lettering>` quando o texto na tela é diferente do falado.
5. **Automático, leitura do roteiro:** cada linha `[...]` abre um bloco e o resto é a fala dele (`ler_roteiro`).
6. **Automático, o alinhamento** (código, sem IA e sem custo — transformar texto em IDs de palavra é onde as IAs mais erram):
   - As palavras da fala de cada bloco são normalizadas (minúsculas, sem pontuação) e casadas em sequência com as palavras reais (`difflib.SequenceMatcher`).
   - Uma palavra real sem par fica com o bloco de antes, e um bloco nunca volta para trás. Um bloco sem nenhuma palavra casada some.
   - No mesmo passo, o código lê as tags `<lettering>`. Cada trecho marcado vira um elemento **Lettering** preso exatamente às palavras casadas. O texto é o atributo `texto` ou, sem ele, as palavras faladas. Uma tag dentro de outra, ou sem par, é ignorada (vale a de fora). Um lettering que não casou com nenhuma palavra fica de fora.
7. **Automático, a formatadora** (padrão `google/gemini-3.8-flash`, raciocínio baixo, saída estruturada; Configurações › "Modelo da formatadora (projetos)", chave `modelo_direcao_projeto`) recebe só as marcações numeradas (`1. [Tela dividida · insert: …]`) e transforma cada uma nos campos, sem decidir nada: `tipo` (pelo nome do plano), `texto` (o que está entre « » no plano com lettering ou no comentário), `descricao` (a marcação sem o nome do plano e sem os elementos; "—" vira vazio) e `elementos` (cada "+ …": palavra ManyChat, caixinha ou print, com o texto entre « »). Ela não cria letterings.
8. **Automático, a montagem** (`direcao_projeto.montar`):
   - Cada bloco vira um plano, preso à primeira palavra do bloco. O primeiro plano sempre começa na primeira palavra e cobre o começo do vídeo. Os planos são contíguos: cada um vai até a palavra antes do começo do seguinte.
   - A troca de plano cai na pausa: começa até **80 ms** antes da palavra (metade da pausa, no máximo 80 ms).
   - Os elementos que a formatadora tirou de um bloco ocupam o bloco inteiro. Os letterings ocupam só as palavras deles. A folga de um elemento é de até **50 ms antes** e até **150 ms depois** (metade da pausa).
   - **Nas emendas dos cortes**, a folga é zero: se a palavra-âncora é a primeira de um trecho cortado, a troca fica exatamente na emenda.
   - Os ids são `p1, p2…` para planos e `e1, e2…` para elementos.
9. **Automático, o registro:** o prompt de sistema, a mensagem, o roteiro da diretora, as marcações enviadas à formatadora, a resposta formatada, os modelos e os tokens vão para `direcao_log/<AAAA-MM-DD_HH-MM-SS>.json` e `.md` (seção "O registro" abaixo).
10. **Automático, a gravação:** a v1 entra em `direcao.versoes` (`n = 1`, `origem = null`, sem comentários) e vira a versão aberta. A etapa fica marcada como `pronta`. Gerar do zero também apaga as **transições trocadas à mão** do projeto (`projeto.transicoes`), porque elas estavam presas aos ids dos planos antigos.
11. A tela consulta o projeto a cada 1,5 s enquanto a geração roda e troca para a edição quando ela termina. A tela de espera diz "Leva uns 20 segundos". (Medido: ~20 s e ~14 mil tokens no vídeo de teste; o doc fala em 40–60 s.)

**B) Versões seguintes: a corretora (v2, v3…).** Comentar é manual, gerar é automático.

1. **Manual:** você comenta pontos do vídeo (💬+ ou tecla **C**) e/ou escreve um **comentário geral** sobre o vídeo todo.
2. **Manual:** clica em **"Gerar vN"** na barra de versões. Abre um modal com os comentários da versão aberta (em ordem de tempo) e o campo "Comentário geral (opcional, sobre o vídeo todo)". O botão só libera com pelo menos um comentário ou um geral; sem nenhum dos dois, o servidor também recusa.
3. **Automático:** o geral fica guardado **na versão de origem** (`geral`), e o pedido vira `{tipo: 'corrigir', de: <versão aberta>}`. Enquanto a corretora trabalha, a versão atual continua na tela, e o botão mostra "Gerando vN…".
4. **Automático:** a versão de origem, **com os seus ajustes manuais**, é escrita de volta como roteiro dirigido (`roteiro_da_versao`): `[plano: marcação + elementos]` e a fala com os `<lettering>`. Cada comentário entra logo depois da palavra em que está preso, como `{💬 texto}`. Itens presos a palavras que foram cortadas ficam de fora.
5. **Automático, a corretora** (o mesmo modelo e o mesmo raciocínio da diretora, temperatura 0,2) recebe:
   - **Sistema:** o papel dela (revisora), as regras — os comentários do criador valem mais que os exemplos e as regras sugeridas; as Regras do criador continuam obrigatórias; mude só o necessário; não copie os {💬} —, o mesmo formato, o "Sobre o criador" e a Heurística inteira.
   - **Mensagem:** `=== ROTEIRO ATUAL (vX), com os comentários do criador ===`, o `=== COMENTÁRIO GERAL ===` (se houver) e "Escreva o roteiro corrigido inteiro".
6. **Automático:** o roteiro corrigido passa pelos mesmos passos A5–A9 (leitura, alinhamento, formatadora, montagem, registro).
7. **Automático:** a nova versão recebe o próximo número livre (o maior + 1), com `origem = de`, e entra no fim da lista sem apagar nada. Ela vira a versão aberta e começa sem comentários. Gerar a partir de uma versão antiga cria outra no fim (ex.: v4 ← v2). Aqui as transições manuais **não** são apagadas.

**C) Refazer do zero.** Manual. O botão **"Refazer direção"**, amarelo, fica na barra do topo do editor e só aparece na etapa Direção, quando já existe uma direção. Ele pede confirmação ("Gerar a direção do zero APAGA todas as versões (v1, v2…), os N comentário(s) e os seus ajustes, e começa de novo na v1") e roda o fluxo A. Ele apaga todas as versões e todos os comentários.

**D) Erros.** Se a geração falha, `direcao.status = 'erro'` com a mensagem (até 300 caracteres). Falta de crédito no OpenRouter vira "Sem crédito no OpenRouter. Adicione créditos e tente de novo." Sem direção nenhuma, a tela vazia mostra o erro e o botão vira **"Tentar de novo"**. Com versões já existentes, o erro aparece numa faixa vermelha acima da timeline.

#### O que você vê e pode fazer

A etapa tem três colunas: a **timeline vertical** à esquerda, a **prévia** no meio e o **detalhe** à direita. As larguras são `minmax(300px, min(40vw,560px)) · minmax(300px,1fr) · clamp(280px,24vw,380px)`.

**Antes da primeira geração (tela vazia):** o título "O que aparece na tela, momento a momento.", um texto curto com link para a Calibragem e o botão **"Gerar direção com IA ↗"** (vira "Tentar de novo" depois de um erro). Durante a geração aparece "Montando a direção…".

**Barra de ferramentas da timeline:**
- **Dividir plano** (tecla **S**): divide o plano sob a cabeça de reprodução em dois. O segundo nasce igual ao primeiro (tipo, marcação, texto), para você trocar. Cada metade precisa de pelo menos 0,1 s.
- **+ Elemento** (tecla **E**): cria um **Lettering** vazio de 1,5 s a partir do cursor e já o seleciona.
- **Desfazer** (**⌘Z**): até 100 passos. Um arrasto inteiro conta como um passo.
- **Prompt e resposta**: abre o registro da versão aberta (veja abaixo).
- **Indicador de salvamento**: "✓ Salvo", "Alterações…", "Salvando…" ou "⚠ erro". O salvamento é automático, 700 ms depois da última mudança. Uma mudança, ou um desfazer, feita enquanto um salvamento está em andamento é gravada logo depois dele. Uma mudança desfeita antes de ir ao servidor volta a mostrar "✓ Salvo".
- **− / +**: zoom da timeline (×1,4 por clique; de 8 a 600 px/s, começa em 60). Também funciona com **⌘+ / ⌘−** e com **Ctrl/⌘ + roda do mouse**, que mantém o ponto sob o mouse.

**Aviso de órfãos:** se as palavras de algum item foram todas cortadas depois, aparece "N item(ns) da direção ficaram órfãos…". Eles continuam guardados, fora da timeline.

**Barra de versões:** `VERSÕES  v1 · v2 ← v1 · v3 ← v2 💬2`. A aberta fica destacada, e o 💬N mostra quantos comentários a versão tem. Clicar abre a versão. Se ainda há ajustes por salvar, aparece o alerta "Espere salvar os ajustes antes de trocar de versão". À direita fica o botão **"Gerar vN"**, desligado enquanto uma correção roda.

**Timeline** (o tempo corre de cima para baixo, como nos Cortes), com as colunas **Fala · Planos-base · Elementos · 💬**:
- **Fala:** as palavras do vídeo final, uma barra por palavra e o texto ao lado. O texto só aparece com zoom de 30 px/s ou mais; abaixo disso, a dica "Aproxime (+ ou Ctrl/⌘ + roda) para ver as palavras". A régua de tempo fica à esquerda.
- **Emendas dos cortes:** linhas tracejadas atravessando as colunas.
- **Planos-base:** um bloco colorido por plano, com o nome, o texto (se houver) e a marcação, conforme a altura permite. Clicar seleciona o plano e leva o vídeo para o começo dele.
- **Trocar a borda entre dois planos:** arraste a linha entre eles (fica amarela ao passar o mouse). As duas pontas andam juntas, e cada plano mantém pelo menos 0,1 s.
- **Elementos:** blocos estreitos. Quando se sobrepõem, ficam em faixas lado a lado. Arraste o corpo para mover o elemento inteiro, ou as pontas de cima e de baixo para mudar o começo e o fim (mínimo de 0,05 s).
- **Ímã:** nos arrastos, a posição gruda (a até 6 px) no começo e no fim das palavras e nas emendas. **Alt** desliga o ímã. Durante o arrasto aparece uma linha-guia amarela com o tempo exato.
- **Cabeça de reprodução:** uma linha vermelha. Clicar num lugar vazio da timeline leva o vídeo para ali. Enquanto toca, a timeline rola sozinha.
- **Coluna 💬 (comentários):** uma bolinha amarela por comentário, no ponto dele. Passar o mouse mostra o texto e os botões **Editar** e **Excluir**. Clicar na bolinha leva o vídeo ao ponto. O botão vermelho **💬+** anda junto com a cabeça de reprodução. Ele, ou a tecla **C**, pausa o vídeo e abre o modal "Comentar · 12,3 s", que mostra a fala em volta (±2,5 s) e tem um campo de texto. **⌘/Ctrl + Enter** ou "Salvar comentário" grava. O comentário fica preso à última palavra que começa até aquele instante, mais o deslocamento.

**Prévia (meio):** o vídeo cortado, com o player do editor, e por cima um **esboço do layout** do plano sob o cursor:
- caixa azul de "Insert · tela cheia", ou amarela de "Motion · tela cheia", com a marcação escrita dentro;
- caixa na metade de cima para as telas divididas;
- "Insert + comentário" com o card 💬 e o texto do comentário;
- no Full ator com lettering, o texto grande no meio;
- os elementos numa faixa no terço de baixo (o lettering em coral; a palavra ManyChat como `Comente "X"`; os outros em verde).

Não há mídia real nesse esboço.

**Detalhe (direita):** segue sozinho o plano sob a cabeça de reprodução, menos quando você está editando um campo do painel. Sem nada selecionado, mostra a ajuda: as cores dos planos e dos elementos, os atalhos e "Tudo é salvo sozinho…". Com um item selecionado:
- o chip do tipo, "Plano-base" ou "Elemento", o início → fim e a duração;
- a fala daquele intervalo, entre aspas;
- num plano, "Elementos neste plano" em chips (clicar seleciona o elemento);
- **Tipo:** lista só das categorias da mesma camada (os 7 planos ou os 4 elementos);
- **Texto exato:** nos elementos e no Full ator com lettering; chama-se **Texto do comentário** no Comentário + insert + ator;
- **Marcação:** chama-se **"Marcação · o que acontece no insert"** nos três planos com insert;
- os campos de texto gravam ao sair do campo;
- **▶ Ver trecho:** toca o intervalo do item uma vez;
- **Juntar com o vizinho** (num plano: ele some e o anterior, ou o seguinte se for o primeiro, ocupa o lugar) ou **Excluir** (num elemento). Fica desligado quando só sobra um plano.

**Atalhos da etapa:**
- **Espaço:** toca e pausa.
- **← / →:** anda 0,5 s (**Shift** 5 s, **Alt** 10 ms). Esses vêm do editor.
- **S** divide, **E** cria um elemento, **C** comenta, **Delete/Backspace** exclui ou junta o selecionado, **⌘Z** desfaz, **⌘+ / ⌘−** dá zoom.

Os atalhos valem também depois de clicar num bloco, numa caixa de marcar ou num slider. Eles não agem dentro de um campo de texto nem com um modal aberto. **Esc** fecha o modal de cima.

**Modal "Prompt e resposta":** o título diz "da diretora (v1)" ou "da corretora (vN ← vX)". Em cima: data e hora, o modelo e o raciocínio, o modelo da formatadora, os tokens, o arquivo (`projetos/…/direcao_log/<nome>.md`) e quantas gerações estão guardadas. Abas: **Prompt de sistema** · **Mensagem** ("vídeo novo", ou "roteiro + comentários" na corretora) · **Roteiro da diretora** / **Roteiro corrigido** · **Resposta formatada** (JSON). O botão **Copiar** copia a aba aberta.

#### O que fica gravado

- `dados/projetos/<id>/projeto.json › direcao`:
  - `status` (`rodando` | `pronto` | `erro`), `erro` e `pedido` (`{tipo: 'gerar'}` ou `{tipo: 'corrigir', de: n}`, retomado se o servidor reiniciar);
  - `versoes[]`, cada uma com `n`, `origem` (null na v1), `itens` (com os seus ajustes), `itens_ia` (como a IA entregou), `roteiro` (o texto da diretora ou da corretora), `modelo`, `exemplos` (quantas referências foram no prompt, só na v1), `tokens`, `gerado_em`, `segundos`, `registro` (o nome do arquivo de log), `comentarios[]` e `geral`;
  - `ativa` (o número da versão aberta) e os campos da versão aberta **espelhados** no topo de `direcao` (`projeto.espelhar_direcao`).
- **Cada item:** `{id, camada: 'plano'|'elemento', tipo, conteudo: null, palavra_ini, palavra_fim, off_ini, off_fim, texto, descricao}`.
  - **Âncora nas palavras:** o item começa em `palavra_ini` + `off_ini` (segundos a partir do começo da palavra; negativo = antes) e termina em `palavra_fim` + `off_fim` (a partir do fim da palavra). Num plano, `off_fim` é sempre 0, porque o fim dele é o começo do seguinte. O servidor limita os deslocamentos a ±10 s.
  - Os tempos no vídeo final **nunca são guardados**: a tela os calcula a cada vez.
  - Se a palavra-âncora foi cortada, vale a primeira (ou a última) palavra que sobrou dentro do intervalo, sem o deslocamento. Um item nunca atravessa a borda do trecho cortado em que está. Os planos são refeitos contíguos (o primeiro no 0, o último até o fim).
  - Um item sem nenhuma palavra sobrando fica **órfão**: guardado, fora da timeline, com aviso.
- **Cada comentário:** `{id, palavra, off, texto, criado_em}` (`off` entre −10 e 10 s; texto de até 2.000 caracteres). Um comentário preso a uma palavra cortada não aparece e não vai para a corretora.
- **Ao salvar à mão** (`PUT /api/projetos/{id}/direcao`), o servidor confere: categorias fixas, âncoras em palavras que existem, ids únicos e pelo menos um plano. Os ajustes ficam só na versão aberta.
- **O registro:** `dados/projetos/<id>/direcao_log/<AAAA-MM-DD_HH-MM-SS>.json` (cru: etapa, versão, origem, modelo, raciocínio, modelo da formatadora, tokens, sistema, mensagem, roteiro, marcações enviadas à formatadora, resposta formatada) e `.md` (o mesmo, legível). Nada é apagado, nem ao refazer do zero.
- **Configurações** (`dados/projetos/_config.json`):

  | Chave | Valor hoje | O que é |
  |---|---|---|
  | `modelo_diretora` | `google/gemini-3.8-flash` | modelo da diretora e da corretora |
  | `raciocinio_diretora` | `medium` | raciocínio da diretora e da corretora |
  | `modelo_direcao_projeto` | `google/gemini-3.8-flash` | modelo da formatadora |
  | `perfil_criador` | — | o "Sobre o criador" |
  | `regras_direcao` | — | antigo; já migrado para a Heurística |

- **Rotas:**
  - `POST /api/projetos/{id}/direcao/gerar`
  - `POST …/direcao/corrigir {geral}`
  - `PUT …/direcao/versao {n}`
  - `POST …/direcao/comentarios {palavra, off, texto}`
  - `PUT|DELETE …/direcao/comentarios/{cid}`
  - `GET …/direcao/registro?versao=n`
  - `PUT …/direcao {itens}`

#### No vídeo final

- **Os planos definem o layout** na prévia montada e na exportação: o ator em tela cheia, a tela dividida (com a mídia dos Inserts ou o motion em cima), a tela cheia, o card do comentário no Comentário + insert + ator (com o texto do plano).
- **Transições:** os cortes entre planos são onde entram as transições, que dependem do grupo dos dois planos.
- **Legenda:** a altura dela depende do tipo do plano (ex.: 0,554 da altura no Full ator, 0,409 no Comentário + insert + ator).
- **Presets:** os movimentos de câmera do Enriquecimento valem nos planos de Full ator.
- **Os elementos (Lettering, Palavra ManyChat, Caixinha, Print) ainda não são desenhados no vídeo final:** no código atual, eles só aparecem no esboço da etapa e nos roteiros. (O lettering do plano "Full ator com lettering" também não tem render próprio; só muda a altura da legenda.)

#### Ligações

- **Vem de:** Cortes (as palavras mantidas e as emendas), Calibragem e Heurística (os roteiros de exemplo e as regras), Configurações › Direção visual e Geral ("Sobre o criador").
- **Vai para:**
  - **Inserts:** cada plano com insert da versão aberta vira um pedido (`inserts.sincronizar`), com a fala, a duração e a marcação. As mídias já escolhidas acompanham versões novas quando o plano é o mesmo; os pedidos que saem ficam guardados (até 40) para voltar.
  - **Motion:** os planos de motion.
  - **Transições:** os cortes entre planos.
  - **Enriquecimento:** os Full ator.
  - **Legenda:** a altura por plano.
  - **Buscar por referências:** já abre filtrado pelo tipo do plano.
- Mexer nos cortes depois não quebra a direção, porque ela está presa às palavras.

---

### 8.3 Inserts

#### O que é

✅ A etapa em que cada plano da direção que pede material real recebe as suas **mídias** (vídeos e imagens do Banco), em que os planos de motion recebem o seu **motion** (§8.5) e em que se escolhe, à direita, o **Enriquecimento** (como as mídias aparecem, §8.4). Por ora é **manual**: a direção diz o que acontece em cada insert e quais mídias ele pede; você sobe ou escolhe os arquivos e os liga. O agente automático que buscava na web e gravava sites saiu (out/2026); a captura de site ficou, mas só quando você pede.

Código: `frontend/src/inserts/EtapaInserts.tsx` (a tela), `DetalheInsert.tsx` (as mídias de um insert), `MidiaCard.tsx`, `SeletorBanco.tsx`, `EditorVideo.tsx`, `CapturaDeSite.tsx`, `ComentarioIG.tsx`, `BuscarReferencias.tsx`, `LinhaInserts.tsx`, `PainelEnriquecimento.tsx`, `pecas.tsx`, `layout.tsx`; backend `backend/app/inserts.py`, `captura_site.py`, `banco.py`, rotas em `backend/app/rotas/inserts.py`.

**Quais planos viram insert** (`direcao.tem_insert`): só três categorias têm insert de verdade:

| Categoria da direção | Formato do insert | O que a etapa mostra |
|---|---|---|
| Insert tela cheia (`insert_tela_cheia`) | `vertical` (a tela toda) | mídias + Enriquecimento |
| Tela dividida · insert (`tela_dividida_insert`) | `dividida` (a parte de cima; o ator embaixo) | mídias + Enriquecimento + opções do ator |
| Comentário + insert + ator (`comentario_insert_ator`) | `dividida` | o mesmo da tela dividida + o card do comentário do Instagram |
| Motion tela cheia / Tela dividida · motion | — (não é insert) | o painel do motion (§8.5) |
| Full ator / Full ator com lettering | — (não é insert) | os **Presets do Full ator** à direita (§8.4) |

(O tipo antigo `tela_dividida` é lido como `tela_dividida_insert`, ou `tela_dividida_motion` se o conteúdo era motion.)

#### Passo a passo

1. **(automático)** Ao abrir a etapa, o app lê os inserts (`GET /api/projetos/{id}/inserts`), o que **sincroniza** com a versão aberta da direção. Sem direção gerada, aparece o erro "Gere a direção visual antes dos inserts".
2. **(automático)** Cada plano com insert vira um **pedido**, em ordem: a marcação (o que acontece no insert), o texto (no comentário), a fala do bloco, o começo e a duração (do começo do plano ao começo do seguinte; no mínimo 0,3 s).
3. **(automático)** Os pedidos que já existiam continuam com tudo o que você fez (mídias, enriquecimento, comentário, capturas). A ligação é feita nesta ordem: (a) mesma **chave** (tipo + conteúdo + palavras + marcação); (b) senão, o mesmo **id de plano** (a categoria mudou ou o plano foi cortado: as mídias seguem o plano); (c) senão, um **guardado** com a mesma chave, ou com a mesma primeira palavra e o mesmo plano.
4. **(automático)** Um insert que deixou de existir (o plano virou Full ator ou motion) e tinha algo seu vai para os **guardados** (até os 40 mais recentes). Se o plano voltar a ter insert, ele volta inteiro.
5. **(automático)** O plano selecionado é sempre o que está **sob o cursor** da linha do tempo (tocando, parado, clicando ou arrastando na régua). Os cards da esquerda e da direita mostram esse plano.
6. **(manual)** Escolha um plano na linha do tempo. Clicar num plano (ou nas mídias dele) seleciona e leva o cursor para 0,6 s depois do começo (ou para o meio, se o plano for mais curto), para o insert aparecer já inteiro.
7. **(manual, opcional)** Abra "Sugestão da IA ▸" para ler a fala e o que a direção pede. Se a categoria estiver errada, troque no seletor **Categoria**.
8. **(manual)** Ligue as mídias: "Subir mídia", arrastar arquivos para o card, "Escolher do banco" ou "Capturar site". Vídeos novos abrem no **editor de vídeo**, para você marcar trechos.
9. **(manual)** À direita, no **Enriquecimento**, escolha um **preset** (§8.4). A coluna ao lado do vídeo abre sozinha com o card **Preset** (ajustes rápidos) e o **Fundo**.
10. **(manual)** Ajuste no próprio vídeo, se precisar: o ator (tela dividida e "ator embaixo"), o card do comentário.
11. **(manual)** Aperte **R** para rever o plano do começo ao fim; passe para o próximo plano.
12. Quando todos os inserts tiverem mídia (ou motion), a barrinha dos Inserts na lista de projetos fica menta (amarela com algum, apagada sem nenhum).

#### O que você vê e pode fazer

**Arranjo da tela** (estilo Premiere; a Direção continua vertical):

| Lugar | O que tem |
|---|---|
| Esquerda (padrão 440 px; 300 a 760) | Cabeçalho "Inserts" (ou "Motion") com o contador **"N/M com mídia"** e o botão amarelo **Buscar por referências**; depois a **Categoria**, a **Sugestão da IA** e o trabalho do plano (as mídias, o painel do motion, ou o aviso "Este plano não tem insert") |
| Centro | O player com a montagem no lugar (ator, insert com o preset, motion, comentário, legenda) |
| Coluna ao lado do vídeo (268 px) | Cards recolhíveis: **Preset** (ajustes rápidos), o editor de outro preset (engrenagem), **Motion** (campos de um motion), **Fundo**, **Comentário** |
| Direita (padrão 400 px; 300 a 680) | **Enriquecimento** (presets do insert; Presets do Full ator num Full ator) |
| Embaixo (padrão 200 px; 150 a 420) | A linha do tempo horizontal, só de leitura |

- As bordas dos dois cards laterais e o topo da linha do tempo se **arrastam** (realçam em coral com o mouse em cima). As medidas ficam neste navegador (`localStorage` `inserts.tamanhos`).
- Se a janela não comporta, os dois cards encolhem juntos e o vídeo fica com **300 px no mínimo**. Se a coluna ao lado do vídeo só coubesse apertando os cards abaixo de 80%, ela aparece **recolhida sozinha**; a faixa a abre mesmo assim, sem mudar a preferência lembrada.
- **Coluna ao lado do vídeo:** no topo, o botão **Legenda / Legenda escondida** (só esconde na prévia desta etapa; o vídeo final continua com legenda) e **Recolher**. Recolhida, vira uma faixa de 36 px com o botão de abrir e os cards como **abas em pé** (texto girado 90°, como os painéis recolhidos do Photoshop): Preset, Motion, Fundo, Comentário (os que existem no plano). Aberta ou fechada fica lembrado (`inserts.colunaAberta`); cada card lembra se está aberto (`inserts.aberto.<card>`). Abertos de saída: Preset e Fundo; o Comentário começa fechado.
- Selecionar um insert que tem preset **abre a coluna** sozinha.

**Card da esquerda, em cima de tudo (qualquer plano):**
- **Categoria:** um seletor com as 7 categorias de plano. A que a direção sugeriu (guardada em `itens_ia`) aparece marcada "· sugestão". Quando a atual é outra, aparece em cima o link **"Sugestão: <categoria> ↺"**, que volta a ela.
  - Trocar a categoria muda a **versão aberta da direção** (salva na hora) e relê os inserts. As mídias seguem o plano (passo 3).
  - Uma categoria que não usa texto apaga o texto do plano (o lettering, o comentário). **Voltar à categoria sugerida pela IA traz de volta** o texto, a descrição e o conteúdo que a IA tinha preenchido.
  - Se o plano deixa de ter insert (vira Full ator, por exemplo), o insert vai para os guardados; voltar à categoria de insert o traz de volta com as mídias, o preset e o comentário.
- **Sugestão da IA** (card recolhível, fechado por padrão, lembrado): no cabeçalho, o chip da categoria na cor do tipo (amarelo motion, azul tela cheia, menta tela dividida/comentário). Aberto: a fala entre aspas e "O que acontece no insert" (num motion, "O que a direção pede"), ou "A direção não descreveu este plano".

**Card da esquerda num insert — as mídias** (`DetalheInsert`):
- Título "Mídias deste insert (N)", com "· subindo…" enquanto envia.
- Cada mídia ligada é um card (`MidiaCard`):
  - vídeo: um player pequeno (até 200 px de altura), mudo, com play/pausa, tempo "x / y s" e barra para buscar; num **trecho**, toca só a parte dele e mostra o tempo dele;
  - imagem: a miniatura;
  - nome (a descrição aparece passando o mouse) e "trecho · N s" ou "Vídeo · 16:9" / "Imagem · 1:1";
  - **Editar** (só vídeo): abre o editor de vídeo;
  - ↑ / ↓ mudam a ordem; × tira a mídia do insert (ela continua no banco).
- Sem mídia: "Nenhuma ainda. Arraste arquivos para este painel, ou use os botões."
- Botões (descem de linha numa coluna estreita): **Subir mídia** (vira "+ outra mídia" quando já tem uma), **Escolher do banco**, **Capturar site**.
- **Arrastar arquivos** para o card sobe e liga (borda coral enquanto arrasta). Aceita MP4, MOV, WebM, PNG, JPG, WebP.
- Subir: o arquivo vai para o banco e entra no **fim** da lista. Cada vídeo novo abre no editor de vídeo, um depois do outro.
- Até **12 mídias** por insert (o servidor recusa mais). Não há divisão de tempo entre elas aqui: com preset, é o preset que decide.
- Andamento das capturas de site, uma linha por captura: "Na fila: site.com", "Capturando site.com · dobra 2 de 3…", "Capturado: site.com" (menta) ou "A captura de site.com falhou: …" (coral). Enquanto alguma está na fila ou rodando, a tela relê os inserts e o banco a cada 2,5 s, e cada dobra pronta já entra como mídia.

**Escolher do banco** (`SeletorBanco`, modal largo):
- Busca no nome, na descrição e nas palavras-chave (sem diferenciar acentos; responde 0,2 s depois de parar de digitar), filtro **Todos · Vídeo · Imagem**.
- Grade de 5 colunas, os mais novos primeiro. Cada original: miniatura 16:9, ícone de vídeo/imagem, duração, nome, "06 out, 17:27 · formato". **Logo abaixo, os trechos dele** (miniatura, nome, duração), para escolher direto.
- Lixeira ao passar o mouse: apaga do banco com confirmação (avisa quantos trechos vão junto) e tira a mídia de todos os inserts.
- Clicar num **vídeo original** abre o editor de vídeo (com o botão "← Banco" para voltar à escolha). Clicar num **trecho** ou numa **imagem** liga direto.

**Editor de vídeo** (`EditorVideo`, modal largo). Abre ao subir um vídeo, ao escolher um original do banco, em "Editar" numa mídia ligada e em "Editar vídeo" na página Banco. Aberto a partir de um trecho, abre o original com aquele trecho marcado.
- Player grande (clicar toca/pausa) e, embaixo, play, tempo "m:ss,cc / m:ss,cc" e a dica dos atalhos.
- **Timeline:** régua (clicar ou arrastar só anda pelo vídeo; marcas automáticas, até ~12 na largura), tira de quadros (`GET /api/banco/{id}/tira`), cabeça de reprodução coral.
- Aba **Trechos**:
  - arrastar no vazio (6 px ou mais) cria um trecho; um clique só busca e tira a seleção;
  - clicar num trecho o seleciona (amarelo, com a lixeira no canto); arrastá-lo o move; as pontas ajustam;
  - **I** marca a entrada no ponto do player ("entrada em … · aperte O para fechar"); **O** fecha o trecho;
  - **Delete/Backspace** apaga o selecionado; **espaço** toca só o trecho selecionado (ou toca/pausa); **← / →** andam um quadro (1/30 s), com **Shift** 1 s; **Esc** fecha;
  - precisão de 1/30 s; trecho mínimo de 0,2 s;
  - lista à direita: número, caixa de marcar (dentro de um insert), nome editável, duração, ▶ tocar, lixeira. Os trechos que já estão no insert vêm marcados.
  - Botão: dentro de um insert, **"Usar N trechos no insert"** (ou **"Usar o vídeo inteiro"** sem nenhum marcado); fora, "Salvar trechos".
  - Mudar um trecho que está em **outros inserts** pergunta: OK muda em todos; Cancelar salva como trecho novo.
  - Apagar um trecho já salvo pede confirmação (avisa em quantos inserts está) e o tira de todos.
- Aba **Cortar o original**: arrastar as pontas na timeline, ou "Começo aqui" / "Fim aqui" no ponto do player; mostra "início → fim · fica N s de M s". **Cortar o original** pede confirmação e regrava o arquivo em segundo plano (H.264 CRF 14). É o único jeito de o original mudar. Os trechos acompanham o novo começo; os que ficam fora somem.
- Ao salvar dentro de um insert, os trechos marcados **entram no lugar** das mídias daquele vídeo, em ordem, cada um uma mídia (na posição em que o vídeo estava). Fechar sem salvar deixa o vídeo inteiro.

**Capturar site** (`CapturaDeSite`, modal):
1. Digite o endereço ("Insira o endereço do site"; Enter também dispara).
2. Escolha a proporção: **16:9** (janela 1440×810), **4:3** (1200×900), **1:1** (1080×1080), **9:16** (1200×2133). Sempre a versão de computador (a 9:16 é um computador em pé). Padrão: a da última captura deste insert; senão 9:16 num insert de tela cheia e 16:9 nos outros.
3. **Gravar N s** por dobra: de 1 a 30 s, passo 0,5, padrão 5 s.
4. Modo rápido (padrão): **"Capturar · 5 s do topo, com o carregamento"** grava a 1ª dobra direto, sem prévia.
5. Com **Várias dobras** marcado: "Ler a página para marcar as dobras" lê a página inteira numa imagem (~6–8 s). Na imagem, clicar no vazio marca uma dobra (até **3**), clicar numa dobra a seleciona e arrastar a move, × ou Delete apaga (sempre fica pelo menos uma). À direita, o título e a lista ("Dobra 1 · topo, com o carregamento", "Dobra 2 · 48% da página"). Botão **"Capturar N dobras"**.
6. **(automático)** A captura vai para uma fila em segundo plano: até **3 gravando ao mesmo tempo**, o resto espera; vale no mesmo insert ou em outros. Cada dobra grava em tempo real com as animações de entrada (screencast do Chrome a 2×, 1,8× na 9:16; reamostrado para 30 quadros/s; H.264 CRF 16), ~10–13 s por dobra.
7. **(automático)** Cada dobra vira uma mídia do banco ("Título · dobra 2", origem "captura de site" com a URL) e entra no fim da lista do insert. As capturas que terminaram bem saem da lista na próxima captura; as com erro ficam até lá. Uma captura interrompida por reinício do servidor vira erro.
- Banners de cookies comuns são fechados sozinhos; login fica de fora.

**Card de comentário do Instagram** (só em Comentário + insert + ator):
- **Na prévia:** o card branco igual ao do app (foto, usuário e tempo **borrados**, o texto, "Responder" e "Ver tradução"), na fonte do sistema da Apple (SF Pro). Clicar seleciona (contorno amarelo), arrastar move, a **alça amarela do canto** muda o tamanho (de 60% a 130%; 100% = 75% da largura do vídeo). Clicar fora tira a seleção. O card fica sempre inteiro no quadro: arrastar para fora para na borda; crescer encostado na borda empurra o card para dentro.
- **Lugar automático** (sem você ter arrastado): na costura do insert com o ator; no "ator embaixo", acima da cabeça do ator (no modo e na posição em que ele estiver), com a borda de baixo do card acima dele.
- **Card "Comentário"** na coluna (fechado por padrão; o resumo mostra o texto): **Texto** (padrão: o da direção; mudar aqui não mexe na direção; grava ao sair do campo; "↺ Voltar ao texto da direção"), **↺ Posição automática**, **Foto (vai borrada)**: 5 rostos gerados por IA (pessoas que não existem).
- A tela muda na hora e grava **0,35 s depois** da última mudança (arrastar não manda um pedido por pixel).

**Ator no vídeo (tela dividida e "ator embaixo")**: ver §8.4, "Divisão da tela e o ator".

**Buscar por referências** (`BuscarReferencias`, modal "tela": até 1320 px de largura, 90% da altura):
- Os planos dos vídeos de referência (a galeria de Referências), **já filtrados pelo grupo do plano selecionado**.
- Em cima: **Favoritos** (amarelo quando ligado), **Todos** e os grupos com a contagem, **Agrupar insert e motion** (desmarcado, tela dividida e tela cheia aparecem separadas em insert e motion; lembrado), **Ignorar Full ator** (marcado por padrão, a mesma caixa lembrada da página Referências) e a busca ("Buscar na marcação, no texto ou na fala", sem diferenciar acentos).
- Grade com cards a partir de 200 px; favoritos primeiro, o resto numa ordem sorteada uma vez (favoritar não embaralha). Passar o mouse toca o trecho mudo.
- Clicar abre o trecho ao lado (360 px), com som e controles, em loop: categoria, duração, referência e minuto, o texto, a marcação e a fala. Dá para favoritar daqui.

**Linha do tempo** (`LinhaInserts`, só de leitura):
- Barra: **Cortar (D)**, zoom − / + e **Ajustar** (o vídeo inteiro na largura). ⌘ + / ⌘ − também dão zoom.
- Régua: clicar ou arrastar anda pelo vídeo.
- Trilha **Planos**: blocos na cor do tipo, com número e nome; **✦** amarelo quando o insert tem algo seu no enriquecimento (preset, ajustes, ator…); motions com borda tracejada; o selecionado com contorno amarelo. Passar o mouse mostra a marcação.
- Trilha **Mídias**:
  - insert com 0 ou 1 mídia (ou sem preset com 3+): as miniaturas lado a lado; sem mídia, "+ mídia" em coral;
  - insert **com preset e 2 ou mais mídias**: uma faixa por mídia, do instante em que ela entra ao em que sai pela receita, numeradas; sem alça (os tempos são do preset);
  - insert **sem preset e com 2 mídias**: dois blocos e uma **alça amarela** no corte (onde a 2ª começa). Arrastar muda o corte, com **ímã** no começo das palavras (a até 10 px; Shift solta) e no mínimo 0,5 s para cada mídia; a tela muda na hora e grava ao soltar; **duplo clique** volta ao meio;
  - motion: "✦ nome" (amarelo) ou "+ motion" (tracejado).
- Trilha **Elementos**: lettering, palavra ManyChat, caixinha de perguntas, print sobreposto, com o texto.

**Cortar (D):** divide o plano sob o cursor em dois (o cursor precisa estar a mais de 0,1 s das bordas). Muda a versão aberta da direção; o plano novo fica selecionado; as mídias continuam com o plano original. **Juntar** planos continua só na Direção.

**Atalhos da etapa:**

| Tecla | Faz |
|---|---|
| Espaço | toca/pausa |
| ← / → | anda 0,5 s (Shift: 5 s) |
| **R** | toca o plano sob o cursor do começo até 2 quadros antes do fim (o cursor fica dentro do plano); R de novo logo no fim repete o mesmo plano |
| **D** | Cortar: divide o plano sob o cursor |
| ⌘ + / ⌘ − | zoom na linha do tempo |

R e D não agem com o foco num campo de texto nem com um modal aberto. Dentro do editor de vídeo valem as teclas dele.

#### O que fica gravado

No `projeto.json`, em `inserts`:
- `versao`: a versão da direção com que os pedidos foram sincronizados.
- `pedidos[]`: `id`, `plano`, `chave`, `tipo`, `conteudo`, `palavra_ini`, `palavra_fim`, `descricao`, `texto`, `formato` (`vertical` · `dividida`), `fala`, `inicio`, `duracao`, e o que é seu:
  - `midias[]`: `{id, banco}` em ordem (item do banco, original ou trecho);
  - `capturas[]`: `{id, status (fila · rodando · pronto · erro), url, proporcao, dobras, feitas, erro, duracao}`;
  - `enriquecimento` (§8.4) e `comentario` (só o que difere do padrão: `texto`, `avatar` 0–4, `x`/`y` em % (5 a 95), `escala`; também aceita `usuario`, `tempo`, `traducao`, sem controle na tela).
- `guardados[]`: até 40 inserts que saíram da direção com algo seu.
- `fundo`, `ator_planos` (§8.4), `transicao` (seca · zoom · piscada; só no backend, sem tela aqui).
- A categoria e o corte de planos vão para a **direção** (`direcao.itens` da versão aberta); a sugestão da IA fica em `itens_ia`.
- Neste navegador: `inserts.tamanhos`, `inserts.colunaAberta`, `inserts.verLegenda`, `inserts.aberto.<card>`, `referencias.semFullAtor`.

Rotas: `GET /api/projetos/{id}/inserts` (sincroniza), `PUT …/inserts/{pid}/midias {midias}` (até 12; confere que cada item existe no banco), `PUT …/inserts/{pid}/comentario {campos}` (`null` volta ao padrão), `POST …/inserts/captura/previa {url, proporcao}`, `GET …/inserts/captura/previa/{cid}`, `POST …/inserts/{pid}/captura {url, proporcao, dobras, titulo, duracao}`.

#### No vídeo final

- Os inserts são desenhados pela página de render (`/render/p/<id>`) com o mesmo componente da prévia (`InsertNoLugar`) e fotografados pelos navegadores escondidos (camada 2 do §13, ProRes 4444 com transparência). Os vídeos do banco entram em **qualidade de exportação** (resolução original, quadro-chave a cada 6 quadros), não a versão leve.
- Uma mídia mais curta que o insert fica parada no último quadro (igual na prévia).
- O **card do comentário** sai junto com a camada dos inserts, na posição que a prévia mostra (o ator vai por cima dele, como na prévia).
- O aviso "Insert sem mídia" (contorno discreto) só existe na prévia desta etapa; nas outras etapas e no MP4, um insert sem mídia mostra o ator limpo.

#### Ligações

- **Direção (§8.2):** de onde vêm os pedidos; a Categoria e o Cortar (D) daqui mudam a versão aberta dela.
- **Banco:** toda mídia mora lá (página Banco, mais abaixo).
- **Enriquecimento / Presets (§8.4)**, **Sons (§8.6)**, **Motions (§8.5)**: no mesmo arranjo de tela.
- **Rosto do ator (§8.7):** o enquadramento do ator na tela dividida.
- **Legenda (§8.10):** aparece na prévia daqui e desvia da costura e do card do comentário.
- **Transições, Áudio, Legenda:** reaproveitam a montagem desta etapa (`MontagemNoPalco`) para mostrar o quadro montado.
- **Lista de projetos:** a barrinha dos Inserts sai do número de inserts com mídia (ou motion).

---

### 8.4 Enriquecimento (presets, divisão da tela, o ator nas áreas que sobram, presets do Full ator)

#### O que é

✅ Como as mídias de um insert aparecem: onde fica cada card, como entra, como se mexe e como sai. Tudo vem de **presets**: receitas prontas, feitas à mão pelo Claude a partir de um trecho de referência (ou de um print) que você manda, e aprovadas na página Presets. No insert você só **escolhe** o preset e mexe em poucos **ajustes rápidos**; nada é aplicado sozinho. O "Personalizar" (layout, entrada e saída à mão) saiu.

Código: `frontend/src/presets/` (`presets.ts` a receita e o motor; `ajustes.ts` e `CardAjustes.tsx` os ajustes rápidos; `divisao.ts` a divisão da tela; `curvas.ts`; `EditorPreset.tsx`; `CardPreset.tsx`, `Avaliacao.tsx`, `OrdemPresets.tsx`, `Simulacao.tsx` na página Presets), `frontend/src/ator/` (`ator.ts`, `AtorArrastavel.tsx`, `AtorRecortado.tsx`, `movimento.ts`), `frontend/src/inserts/PainelEnriquecimento.tsx`; backend `backend/app/presets.py`, `inserts.py` (`enriquecer`, `definir_movimento_ator`), rotas em `backend/app/rotas/presets.py`.

**A biblioteca hoje** (`dados/presets/`, 16 presets, todos aprovados): Sobe, flutua e sai por cima · Corte seco · Surge gigante de baixo · Passeio de câmera em 4 tomadas · Sobe e o próximo sobe por cima · Sobe desfocado · Tela cheia com zoom borrado · Tablet em perspectiva · Mergulho · Cascata de janelas · Cresce e desliza · Janela abre na vertical · Sobe e mergulha · Empurra a próxima de baixo · Sobe para o topo e chega o segundo · Mosaico com destaque.

**O que é uma receita** (o motor é genérico: preset novo não exige código):
- `formato` para o qual foi desenhada (`vertical` ou `dividida`), `duracao_ref` (a do trecho de referência), `fundo` (`proprio`: o fundo do vídeo; ou `nenhum`).
- **Cards**, um por mídia (ou mais: vários cards podem mostrar a mesma mídia, `midia`). Cada card tem:
  - **repouso**: centro (`cx`, `cy`), largura e altura em % da área do insert, inclinação, perspectiva 3D (`rx`, `ry`), cantos (`raio`), sombra, ordem (`z`) e, opcional, desfoque permanente (um fundo feito da própria mídia);
  - **como a mídia preenche**: Preenche (`cover`) · Preenche pelo topo (`topo`) · Inteira (`contain`);
  - **tempo**: começa numa fração do insert (`inicio_frac`, 0 a 0,95) e sai N s antes do fim (`sai_antes_do_fim`, até 10 s) ou numa fração (`fim_frac`, para tomadas trocadas no corte), com `fim_mais` (s a mais, numa sequência em que o card sai enquanto o próximo entra);
  - **entrada** (estado de partida) e **saída** (estado de chegada), relativos ao repouso: deslocamento, escala, altura (a janela abre na vertical sem deformar a mídia), giro, giro 3D, opacidade, desfoque; uma duração (0,04 a 5 s) e **uma curva cubic-bezier por propriedade** (posição, escala, giro, opacidade, desfoque), com atraso e duração próprios por propriedade; entrada ou saída "seca" = sem animação;
  - **movimento contínuo** (`continuo`): enquanto o card está na tela, zoom em fração por segundo (ex.: 0,03 = +3%/s), deslocamento em % por segundo e giro em graus por segundo, contados desde que ele aparece;
  - **zoom na mídia** (`zoom`): o conteúdo dá zoom com a moldura parada (começo, duração, quanto, para onde, curva);
  - **cantos medidos** (`quadros`): o card segue os 4 cantos medidos na referência ao longo da vida dele (para câmeras que torcem em 3D);
  - `deslize`: quanto anda um card que transborda e desliza (vem do ajuste "Até onde desliza").
- **`repete`**: a receita serve a qualquer número de mídias: o último card é o molde da 2ª mídia em diante, cada uma numa parte igual do insert. Com tantas mídias quanto os cards da receita (as da referência), os tempos medidos valem como estão. **`sai_ultimo`**: numa sequência que repete, o último card também sai.
- **`sons`**: os momentos de som (§8.6).
- Em volta da receita, o preset guarda: `nome`, `descricao`, `fontes` (referência, início, fim; ou `externa:<nome>`, um vídeo de fora em `dados/presets/externas/`), `recortes` (onde está a mídia de cada card na referência, para a miniatura da revisão), `aprovado`, `formatos` (onde aparece), `divisao_tipo`, `usos` ("Vale em"), `rapidos` (os ajustes rápidos que aparecem), `tela_toda_em_pe`.

**Curvas:** nenhuma transição linear (regra de Rodrigo). Base em `presets/curvas.ts`: CHEGAR `(0.16, 1, 0.3, 1)` · MOLA `(0.34, 1.56, 0.64, 1)` · SAIR `(0.7, 0, 0.84, 0)` · SUAVE `(0.65, 0, 0.35, 1)`. O editor de curva oferece 6 prontas: Freia bem devagar `(0, 0.7, 0.3, 0.9)`, Chega rápido e assenta (expo out), Easy Ease `(0.33, 0, 0.67, 1)`, Assenta bem suave (quint out), Sai e chega suave, Sedoso `(0.83, 0, 0.17, 1)`.

**Insert mais curto que a referência:** o quanto antes do fim cada card sai encolhe na mesma proporção; entradas e saídas mantêm a duração (a suavidade) e só encolhem se não couberem na vida do card. Num insert mais longo, só o repouso cresce.

#### Passo a passo

1. **(fora do app)** Você manda ao Claude um trecho de referência ou um print. O Claude mede quadro a quadro (`ferramentas/preset_tira.py`), monta a receita e grava com `presets.criar(nome, receita, fontes)`. O preset entra **"a revisar"**. Não há análise automática no app.
2. **(manual, página Presets)** Você revisa a referência ao lado da recriação, simula, marca o **Vale em**, escolhe os **ajustes rápidos** que aparecem no insert e os **sons**, e **aprova**. Só aprovados aparecem no Enriquecimento (a não ser com "ver os não aprovados").
3. **(manual, opcional)** Em **Recomendados**, ordene e favorite até 3 presets por situação.
4. **(automático, no insert)** O Enriquecimento lista os presets que servem ao insert: pelo modo de tela, pelo número de mídias e pela proporção delas; favoritos em cima.
5. **(manual)** Clique num preset para aplicar (clicar de novo tira). A prévia muda na hora; a coluna ao lado do vídeo abre o card **Preset** com os ajustes rápidos.
6. **(automático)** A receita se adapta ao insert: cada card ganha a proporção da sua mídia, a tela dividida ganha a altura certa, o ator se enquadra pelo rosto.
7. **(manual, opcional)** Mexa nos ajustes rápidos (só este insert); "Salvar como padrão do preset" grava no preset para todos.
8. **(manual, opcional)** Na tela dividida, ligue **Ator embaixo** e escolha o modo; arraste o ator no vídeo.
9. **(manual, opcional)** "Aplicar a todos “<tipo>”" copia o enriquecimento deste insert para todos os inserts da mesma categoria.
10. **(manual, Full ator)** Num plano de Full ator, escolha Nada, Zoom in lento ou Zoom seco.

#### O que você vê e pode fazer

**Card Enriquecimento, num insert** (`PainelEnriquecimento`):
- **Ator embaixo, cropado numa janela** (só tela dividida/comentário com mídia): liga o "ator embaixo" (`divisao: 'atras'`). Logo abaixo, as opções do ator (ver "Divisão da tela e o ator").
- Aviso amarelo se o preset escolhido não serve mais ao número de mídias ("… não serve a 3 mídias: escolha outro").
- **Presets** (só com pelo menos 1 mídia), com "· N mídias" e a caixa **ver os não aprovados** (os não aprovados ganham um ● amarelo):
  - sem ordem definida para a situação: uma grade só, de 3 por linha;
  - com ordem: **Recomendados** (os favoritos, 3 por linha) e **Outros presets** (menores, 4 por linha), na ordem escolhida; os que ficaram fora da ordem vêm no fim, e os não aprovados por último;
  - cada miniatura é animada **com as mídias do próprio insert**, já adaptada (divisão, proporções); toca com o mouse em cima e quando escolhida (borda coral). Nome embaixo, com "· adaptado" quando o preset foi desenhado para o outro formato;
  - **clicar** aplica; clicar no ativo tira. Ao trocar de preset, só ficam os ajustes rápidos que aparecem no preset novo (e Posição e Largura); tirar limpa todos;
  - **engrenagem** (canto da miniatura): abre o **editor completo** daquele preset na coluna ao lado do vídeo (card "Preset", com ▶ Ver, que toca o insert). **Vale para todos os inserts que usam o preset.** (No código, a engrenagem do preset **já aplicado** ao insert não abre o editor completo: a coluna mostra só os ajustes rápidos dele.)
  - sem nenhum: "Nenhum preset aprovado para N mídias neste formato. Peça um ao Claude (mande o trecho de referência) e aprove na página Presets."
- Embaixo: **Tirar o preset** (volta ao estilo do tipo: limpa preset, ajustes, corte e as escolhas antigas de layout/entrada/saída; apagado se o insert não tem nada seu) e **Aplicar a todos “<tipo>”** (copia o enriquecimento inteiro, inclusive preset, ajustes, ator e divisão).
- Num **plano de motion**, o card mostra só o aviso "O enriquecimento dos motions passa a valer junto com os motions (em construção)".
- Num plano sem insert nem motion: "Este plano não tem insert nem motion." Num **Full ator**: os Presets do Full ator.

**Quais presets aparecem num insert** (`presetsPara` / `serve`):
- **Modo de tela** do insert: Tela cheia (`vertical`), Tela dividida (`dividida`) ou Ator embaixo (`atras`). O preset precisa estar marcado para ele no "Vale em".
- **Número de mídias**: 1 · 2 · "2+" (3 ou mais). Uma receita que repete serve a quantas forem (as marcadas). Uma que não repete serve **até** o número de mídias que pede; com menos (se marcado), as mídias se repetem nos cards em rodízio; com mais, alguma ficaria de fora e o preset não aparece.
- **Proporções**: em pé (largura/altura < 0,8), quadrada (0,8 a 1,2) ou horizontal (> 1,2). O preset só aparece se **todas** as mídias estão entre as marcadas (só filtra quando o banco já deu as medidas).
- Sem "Vale em" marcado, vale o que a receita suporta: as telas de "Aparece em" (e "ator embaixo" se vale na dividida), 1 mídia ou "2 e 2+" se repete, todas as proporções.
- Os do mesmo formato vêm primeiro; os do outro formato aparecem **adaptados**: a metade de cima da tela dividida é tratada como a faixa central da tela cheia, na mesma largura (as alturas dobram de tela cheia para dividida e caem pela metade no caminho contrário).

**Recomendados e ordem:** guardados por **situação** = modo de tela × (1 mídia 9:16 · 1 mídia horizontal, a quadrada junto · 2 mídias · 3 ou mais), 12 situações. Até **3 favoritos** por situação, sempre no começo. Montados na página Presets (mais abaixo).

**Card "Preset" — ajustes rápidos** (`CardAjustes`, na coluna ao lado do vídeo; o resumo mostra o nome do preset):
- Cada controle tem 2 ou 3 opções; vem marcada a que o preset já é. Escolher a opção do preset apaga a escolha (não conta como ajuste). Valem **só para este insert**.
- Quais aparecem: os marcados no preset (`rapidos`); sem marca, até 4 deduzidos da receita, nesta prioridade: Até onde desliza, Forma, Entrada, Zoom, Mergulha em, Quando o próximo entra, Saída, Desfoque na entrada, Zoom lento, Tamanho do card. **Som** aparece sempre no fim quando o preset tem som.
- Somem os que não mudariam nada no insert (a não ser que já tenham uma escolha, para dar para desfazer): "Quando o próximo entra" com um card só; "Tamanho do card", Posição e Largura quando todos os cards ocupam a área toda.

| Ajuste | Opções | O que faz |
|---|---|---|
| Entrada | Lenta · Normal · Rápida | duração das entradas ×1,4 ou ×0,7 |
| Saída | Lenta · Normal · Rápida | duração das saídas ×1,4 ou ×0,7 |
| Até onde desliza | Pouco · Como na referência · Até a borda | num card que transborda e desliza (o Cresce e desliza): anda 12% da área, 23% (o da referência) ou até a outra borda encostar na tela |
| Zoom | Menos · Normal · Mais | o quanto o zoom aproxima (zoom na mídia e mergulho) ×0,6 ou ×1,5 |
| Mergulha em | grade 3 × 3 (Topo à esquerda … Base à direita) | o ponto da imagem que fica parado no zoom de saída; relativo ao card (acompanha se o card muda de tamanho) |
| Forma | Card · Tela toda | Card: centrado, 88% × 70%, cantos e sombra; Tela toda: ocupa a área |
| Zoom lento | Parado · Leve · Mais | zoom in linear e contínuo: 0, 1,5%/s ou 3%/s, a partir do centro de cada card |
| Desfoque na entrada | Sem · Normal · Mais | 0, o do preset, ou 1,8× o do preset (no mínimo 12 px) |
| Tamanho do card | Menor · Normal · Maior | ×0,86 ou ×1,12 |
| Quando o próximo entra | Antes · Normal · Depois | as entradas dos cards seguintes ×0,75 ou ×1,25 (até 0,9 do insert); numa sequência, a saída do anterior vai junto (sem vão nem sobreposição) |
| Som | Sem · Baixo · Médio | tira todos os sons do preset neste insert, ou deixa todos baixos ou médios (trocar o som em si é na página Presets) |

- **"Tela toda" só vale quando a mídia não é cortada:** na tela dividida, só horizontais; na tela cheia e no ator embaixo, só 9:16. É decidido mídia a mídia: as que seriam cortadas ficam em card. O botão só trava ("Esta mídia seria cortada…") quando nenhuma pode. Num preset com `tela_toda_em_pe` (o Corte seco), a forma padrão é "Tela toda" quando todas as mídias são 9:16.
- Na tela toda, o zoom contínuo cresce do centro na horizontal e **preso pelo topo** na vertical (a não ser que a receita tenha deriva vertical própria, como uma rolagem). Um zoom que afastaria vira o mesmo zoom aproximando (afastar descobriria o fundo). Uma saída que só desliza um pouco amplia junto para continuar cobrindo a tela.
- Sempre, numa linha: dois sliders livres, **Posição** (sobe ↑ ou desce ↓ os cards, −25 a +25% da área, passo 0,5) e **Largura** (70% a 130%). Mudam ao soltar; dois cliques voltam ao do preset. Não mexem nos cards que ocupam a área toda.
- **Salvar como padrão do preset** (apagado sem nada mexido): grava as escolhas na receita do preset (passa a valer em todos os inserts que o usam) e limpa as deste insert.
- Sem ajustes: "Este preset não tem ajustes rápidos."

**Editor completo do preset** (`EditorPreset`; engrenagem no Enriquecimento ou na página Presets). Os sliders mudam a prévia na hora e gravam ao soltar; **vale para todos os inserts com o preset**:
- Geral (só na coluna dos Inserts): nome editável, ▶ Ver, **Aparece em** (Tela cheia · Tela dividida · Ambos; em "Ambos", "Desenhado para … ; no outro formato aparece adaptado"), **Ajustes rápidos** (o que aparece na edição do insert, chips liga/desliga), **Na tela dividida** (Ocupa a área · Card · Ator embaixo).
- Seletor da mídia em edição ("1ª mídia", "2ª mídia"…), quando há mais de um card.
- **Tempo:** Começa em (fração do insert, 0 a 0,9) · Sai antes do fim (0 a 5 s).
- **Movimento contínuo:** Zoom por segundo (−20 a +20%) · Deslocamento horizontal e vertical por segundo (−30 a +30%) · Giro por segundo (−20 a +20°).
- **Zoom na mídia:** caixa "O conteúdo dá zoom dentro do card" (ao ligar: começa 0,8 s, dura 0,8 s, 1,5×, no centro) · Começa · Duração (0,1 a 4 s) · Quanto (0,5 a 4×) · Para onde (horizontal e vertical, 0 a 100%).
- **Onde fica:** Centro horizontal e vertical (−20 a 120%) · Largura e Altura (10 a 160%) · Inclinação (±30°) · Perspectiva vertical e horizontal (±60°) · Cantos (0 a 15%) · Sombra · Preenche / Preenche pelo topo / Inteira.
- **Entrada** e **Saída:** "Seca (aparece/some de uma vez)"; senão Duração (0,1 a 3 s), "Começa assim / Termina assim (em relação ao repouso)": deslocamentos (±150%), escala (0,3 a 3×), altura (0,2 a 2×), giro (±45°), giro 3D (±80°), opacidade (0 a 1), desfoque (0 a 60 px); e um **editor de curva** para cada propriedade que a receita anima.

**Divisão da tela e o ator** (inserts de tela dividida e comentário; automática, sem escolha à mão):
- O **tipo** vem do preset (`divisao_tipo`) ou, sem marca, "Ocupa a área" se o card ocupa a área toda, senão "Card". O ajuste rápido **Forma** manda por cima ("Tela toda" = área, "Card" = card). Ligar **Ator embaixo** no insert manda por cima dos dois.
- **Ocupa a área:** a parte de cima tem a altura da 1ª mídia na largura toda: 1:1 → 56%, 4:3 → 42%, 16:9 → 32% (entre 28% e 56%); mídia em pé → 50%. Só se a mídia é horizontal; senão vira card.
- **Card:** o card ganha a proporção da 1ª mídia (até 90% da largura) e a parte de cima tem a altura dele mais 6% em cima e embaixo (de 40% a 62% do quadro).
- **Vários cards** (receita que repete ou com mais de um card): a parte de cima fica em **56%** e cada card ganha a proporção da sua mídia, cabendo na caixa que o preset deu a ele (até 96% da área; mídia em pé num card largo cresce até 84% da altura e fica centrada). Cards empilhados de verdade (longe do meio, sem repete) que encolheram ficam presos pela borda virada para o meio, mantendo o vão; numa sequência, cada um fica centrado.
- Na **tela cheia**, uma mídia só ocupa a tela se for em pé; 1:1, 4:3 e 16:9 viram card centrado (90% da largura, até 90% da altura, com cantos e sombra).
- **Card que transborda e desliza** (desenhado maior que a área, deslizando na horizontal): não encolhe para caber a mídia; fica preso pela borda do desenho e anda os 23% da referência, sem abrir margem.
- **O ator na tela dividida** (P5, `ator/ator.ts`): enquadrado **pelo rosto** do plano (a mediana do rosto medido no trecho): o rosto no meio da largura, os olhos a 40% da altura da área do ator, o rosto com 30% dessa altura, o topo da cabeça com 6% de folga, ampliando até **1,6×** se preciso, sempre cobrindo a área. Sem rosto medido: o ator desce metade da altura do insert (como antes). No vídeo, a alça **"Ator"** (canto de cima da área do ator) arrasta o enquadramento (até ±50% do quadro) e a alça amarela do canto de baixo dá **zoom** (de 1/1,6 a 1,6× sobre o automático). Um arraste além da borda não acumula deslocamento invisível. No Enriquecimento: "O ator fica enquadrado pelo rosto na parte de baixo…" e o link **Automático** quando mexido.
- **"Ator embaixo"** (o insert na tela toda, o ator por cima, embaixo), três modos no seletor **Janela · Recortado · Canto**:
  - **Janela** (padrão): o ator a 55%, numa janela de cantos redondos que começa em 72% da altura do quadro, apoiada embaixo; a **cabeça e os ombros saem da janela** por cima do insert, com a borda macia (o recorte da pessoa);
  - **Recortado**: só a pessoa, sem o cenário, a 62%, apoiada embaixo;
  - **Canto**: o ator inteiro a 34%, no canto de baixo à direita, com cantos redondos.
  - Na janela e no recortado, sem posição escolhida, o rosto fica no meio da largura.
  - No vídeo: clicar no ator seleciona (contorno amarelo tracejado), arrastar move, a alça do canto muda o tamanho (15% a 100%); janela e recortado apoiados embaixo crescem para cima. "Posição automática" volta à de fábrica do modo.
  - O card fica no espaço livre acima da janela (até 96% da largura, um pouco acima do meio).
  - O recorte da pessoa (`recorte_ator.py`, segmentador de selfie do MediaPipe, local, ~1 min por vídeo) roda sozinho depois do proxy. Sem ele pronto, o modo Recortado mostra o ator com cenário no mesmo lugar.
- A **prévia muda enquanto arrasta** e grava **ao soltar**. A cópia do ator por cima do insert segue o vídeo principal quadro a quadro (menos de 0,015 s de atraso, medido).

**Presets do Full ator** (`ator/movimento.ts`; card à direita num plano Full ator ou Full ator com lettering): três cartões com um boneco animado:
- **Nada** (padrão): o ator como foi gravado.
- **Zoom in lento:** +3% por segundo, no máximo +15% no plano; metade linear, metade suavizada (sai e chega andando, nunca para).
- **Zoom seco:** +18% de uma vez no começo do plano, até o fim.
- O centro do zoom é o **rosto** do plano (sem medida, um pouco acima do meio: 50%, 40%). A prévia muda na hora (um `scale` no vídeo do ator).

**Fundo** (card "Fundo" na coluna; vale para o **vídeo todo**, atrás dos inserts com moldura): 3 claros (Verde claro · Papel · Névoa azul) e 2 escuros (**Chuva** · **Gradiente escuro**, o padrão). A chuva toca como vídeo (`chuva.mp4`, loop de 12 s, 2160×3840 a 60 fps, sem emenda visível). O resumo do card mostra a amostra e o nome.

**Inserts sem preset** (casos antigos ou sem preset que sirva): valem o estilo do formato (tela cheia: card, entrada "surgir", zoom lento, saída em corte seco; tela dividida: metade inteira, o resto igual) e a configuração **global** de entradas e saídas (`entradas.py`, `GET /api/entradas`, `PUT /api/entradas/{entrada|saida}/{tipo}`), que hoje não tem tela. Com 2 mídias sem preset, a 2ª começa no corte (padrão: no meio), ajustável na alça da trilha Mídias.

#### O que fica gravado

- No pedido do insert, `enriquecimento` (só o que difere do estilo; `PUT /api/projetos/{id}/inserts/{pid}/enriquecimento {campos}`, `null` num campo volta ao padrão):
  - `preset`: o id do preset (o preset é **referenciado**: melhorar o preset muda todos os inserts que o usam);
  - `ajustes`: `{id do ajuste: opção}` e os sliders `y` e `largura` (texto, até 20 caracteres cada);
  - `divisao`: `atras` (ou vazio = automático; o backend também aceita `50`, `56`, `42`, `32`, sem tela);
  - `ator`: `modo` (janela · recortado · canto), `x`, `y` (0 a 1), `escala` (0,15 a 1) no ator embaixo; `dx`, `dy` (−0,5 a 0,5), `zoom` (0,625 a 1,6) na tela dividida;
  - `corte` (0 a 0,95) e as escolhas antigas (`layout`, `entrada`, `entrada_2`, `entre`, `movimento`, `saida`, `saida_2`).
- "Aplicar a todos": `POST …/inserts/{pid}/enriquecimento/tipo`.
- `inserts.fundo` (`PUT …/inserts/fundo {fundo}`).
- `inserts.ator_planos[plano]`: `zoom_lento` ou `zoom_seco` (sem chave = Nada) (`PUT …/inserts/ator/{plano} {movimento}`).
- A biblioteca: `dados/presets/<id>.json` (id de 10 hex; global, fora do git), `dados/presets/ordem.json` (`{situação: {ids, favoritos}}`), `dados/presets/amostras/` (recortes e quadros da revisão), `dados/presets/externas/`.
- Rotas: `GET /api/presets`, `PATCH /api/presets/{id}` (nome, aprovado, receita, formato, formatos, divisao_tipo, rapidos (até 8), usos), `DELETE /api/presets/{id}` (tira também da ordem), `GET /api/presets/fontes`, `GET|PUT /api/presets/ordem[/{tela:mídias}]`, `GET /api/presets/{id}/amostra/{k}`, `GET /api/presets/quadro/{ref}?t=`, `GET /api/presets/externa/{nome}`.

#### No vídeo final

- A receita final do insert (preset → ajustes "antes" → adaptada às mídias e à divisão → ajustes "depois") é a mesma na prévia e na página de render; a camada dos inserts é fotografada (os quadros parados reaproveitam a foto; nada com movimento contínuo, cantos medidos ou zoom é tratado como parado).
- A **divisão da tela** e a **geometria do ator** de cada trecho vão no `__render` (`trechos[].divisao.ator`); o ffmpeg posiciona o ator (`exportacao._ator`, `_ator_na_geometria`) e põe a pessoa recortada por cima do insert no "ator embaixo" (camada 3 do §13).
- Os **Presets do Full ator** vão como `__render.movimentos` (início, fim, tipo, centro do rosto) e o ffmpeg aplica a mesma conta (`exportacao._movimentos`: escala no tempo + recorte com o rosto parado), no ator **antes do look**, então a vinheta não aproxima junto.
- O **fundo** escolhido sai atrás dos inserts com moldura (a chuva como vídeo).

#### Ligações

- **Página Presets:** onde os presets são revisados, aprovados, simulados, ordenados e editados.
- **Referências / Calibragem:** os trechos que viraram preset ganham o selo **preset** no cartão e "Virou preset" no player.
- **Sons (§8.6):** cada receita tem os seus momentos de som; o ajuste rápido Som.
- **Rosto do ator (§8.7, docs/rosto.md):** o enquadramento na tela dividida e o centro do zoom do Full ator.
- **Legenda (§8.10):** desvia da costura, da janela do ator e do card do comentário (pela mesma divisão).
- **Linha do tempo:** com preset e 2+ mídias, a trilha Mídias desenha os tempos do preset.

---

### 8.5 Motions

#### O que é

✅ O que entra num plano de **motion** (Motion tela cheia ou Tela dividida · motion). Decisão de Rodrigo (out/2026): no app ficam só coisas simples, de poucos elementos e poucos segundos; o que for mais elaborado é feito fora e entra como vídeo. Dois caminhos:
- **Preset:** uma animação pronta em HTML + CSS + GSAP, **escrita à mão** a partir de uma referência, em que você troca só os campos (textos, imagem do banco) e escolhe o **fundo**.
- **Vídeo:** um vídeo do banco (subido ali ou escolhido; um trecho vale) que ocupa o palco e **entra e sai seco**, como um insert.

(A 1ª versão, em que a IA escrevia cada motion, saiu; ficou em `_legado/motions-antigo/`, sem uso.)

Código: `backend/app/motions.py`, rotas `backend/app/rotas/motions.py`; presets em `frontend/public/motion/presets/*.html`; runtime, GSAP e fontes em `frontend/public/motion/`; front em `frontend/src/motions/` (`PainelMotion.tsx`, `PresetMotion.tsx`, `MotionNoLugar.tsx`, `PaginaMotions.tsx`, `sons.ts`, `api.ts`). Detalhe em `docs/motions.md`.

**Formato da página:** cada motion é uma página web num **palco** de **1080×1920** (tela cheia) ou **1080×960** (tela dividida: a metade de cima, com o ator descendo embaixo), com fundo transparente. O fundo escolhido é desenhado atrás pelo app (o mesmo `Fundo` dos inserts, chuva em vídeo inclusive). O preset monta uma timeline do GSAP pausada com a duração do plano e a entrega com `motion.pronto(tl)`; quem manda no tempo é o app (`window.__ir(t)`: posiciona a timeline e os vídeos, espera fontes e vídeos e responde depois de pintar; 8 s de limite se o preset quebrar). Cada preset declara num JSON: nome, descrição, fundo sugerido, duração de referência, instante da miniatura (fração; padrão 0,8), os **campos** (`texto`, `cor`, `imagem`) e os **sons**.

**Ferramentas do runtime:** `motion.digitar(texto, ini, fim, ritmo)` (se as palavras do texto são ditas em sequência na fala do plano, ignorando maiúsculas, acentos e pontuação, cada uma é digitada enquanto é falada; senão, em rajadas com pausas depois de vírgula e ponto), `motion.curva(x1, y1, x2, y2)` (cubic-bezier), `motion.som(momento, t, dur)`. Curvas medidas nas referências: entrada curta e suave e chegada bem longa, perto de `(0.25, 0.1, 0.1, 1)` em 0,8 a 1 s. **A cena nunca para:** depois da entrada, algo segue andando devagar até o corte.

**Fontes:** Inter e Instrument Serif locais; SF Pro, SF Pro Rounded e SF Mono lidas do próprio Mac pelo backend (`/api/motions/fonte/{pro|rounded|mono}`), sem ir para o git.

**Os presets hoje** (4):

| Preset (arquivo) | Duração ref. | Fundo sugerido | Campos | Sons padrão |
|---|---|---|---|---|
| Janela do Claude Code (`claude-code`) | 2,6 s | Verde claro | O que é digitado | A janela aparece (UI Pop 02) · Digitação |
| Lettering com destaque (`lettering`) | 1,2 s | Chuva | Texto · Palavra de destaque | Cada palavra (clique pequeno) · A palavra de destaque (UI Pop 02) |
| Caixa de prompt (`prompt`) | 2,5 s | Verde claro | O que é digitado | Digitação |
| Barra de busca (`site`) | 2,6 s | Névoa azul | Link | A lupa surge (UI Pop 02) · Digitação |

(Todos os sons padrão em intensidade Baixo.)

#### Passo a passo

1. **(manual)** Na etapa Inserts, selecione um plano de motion. O card da esquerda vira **Motion**, com a Categoria, a Sugestão da IA ("O que a direção pede") e as abas **Preset** e **Vídeo**.
2. **(manual, Preset)** Clique num preset da grade. Ele vai para o plano com o **fundo sugerido** pelo preset e os campos no padrão (trocar de preset recomeça os campos e o fundo).
3. **(automático)** A prévia toca o motion no lugar do plano (na tela dividida, o ator desce); a coluna ao lado do vídeo abre o card **Motion**.
4. **(manual)** No card Motion, troque os textos (a prévia muda na hora; grava 0,35 s depois), a imagem (do banco), os sons e o fundo.
5. **(manual, Vídeo)** Na aba Vídeo, "Subir vídeo" (ou arrastar; só o 1º arquivo) ou "Escolher do banco" (só vídeos). O vídeo substitui o preset do plano.
6. **(manual)** "Tirar" (com confirmação) deixa o plano sem motion.

#### O que você vê e pode fazer

**Card da esquerda num motion** (`PainelMotion`):
- Abas **Preset** e **Vídeo**; um ponto coral marca a que está em uso.
- Em uso: "✦ nome" e o botão **Tirar**.
- **Preset:** a frase de ajuda ("Escolha um preset; o texto e o fundo se editam no card ao lado do vídeo", ou "Clicar em outro preset troca") e a **grade dos presets** em 2 colunas, no formato do plano. A miniatura fica parada perto do fim (no instante da miniatura) e **toca em loop com o mouse em cima**; a em uso fica com borda coral. Clicar põe no plano ou troca. A grade mostra todos os presets.
- **Vídeo:** a miniatura do vídeo em uso, a frase "Um motion feito fora do app. Toca na tela toda (ou na metade de cima), entrando e saindo seco, como um insert", **Subir vídeo / Subir outro**, **Escolher do banco**; arrastar um arquivo para a aba também sobe.

**Card "Motion"** na coluna ao lado do vídeo (`EdicaoPreset`; o resumo mostra o nome):
- Um campo por campo do preset: texto (caixa de texto), cor (seletor de cor), imagem ("Escolher do banco" / "Trocar a imagem", só imagens). Até 500 caracteres.
- **Sons:** uma linha por momento que o preset declara: select, Baixo · Médio, ▶ (sem o "quando cai").
- **Fundo:** os 5 fundos dos inserts como amostras; o em uso com borda coral.
- Se o preset não existe mais: "Este preset não existe mais: escolha outro."

**Na linha do tempo:** trilha Mídias com "✦ nome" (amarelo) ou "+ motion" (tracejado); o bloco do plano com borda tracejada.

**No Enriquecimento (direita):** só o aviso "O enriquecimento dos motions passa a valer junto com os motions (em construção)".

**Sons dos motions:** o preset declara os momentos no JSON (rótulo, som e intensidade padrão) e a página marca cada um com `motion.som(momento, t, dur)` (com `dur`, o som dura isso, como a digitação: toca enquanto as letras aparecem, com fade no fim). O app lê as marcas da página (`window.__sons()`, no tempo do plano) e toca o som escolhido para o plano (ou o padrão). As marcas de todos os motions do projeto são lidas de antemão, uma página por vez, ao abrir as etapas com o quadro montado: na 1ª passagem a digitação já começa com as letras.

#### O que fica gravado

- `projeto.motions[plano]`:
  - preset: `{tipo: 'preset', preset, nome, formato (vertical · dividida), valores {campo: texto}, fundo, sons? {momento: {som, intensidade}}, usado_em}`;
  - vídeo: `{tipo: 'video', banco, nome, formato, usado_em}`.
- O preset é **referenciado**, não copiado: melhorar o arquivo do preset muda os vídeos que o usam.
- Os presets são arquivos no código (`frontend/public/motion/presets/<id>.html`); preset novo = arquivo novo, escrito pelo Claude.
- Rotas: `GET /api/motions/presets`, `GET /api/motions/presets/{id}/pagina?formato=&duracao=&valores=&fala=`, `GET /api/motions/fonte/{nome}`; `GET /api/projetos/{id}/motions`, `PUT …/motions/{plano} {tipo, formato, preset|banco, valores, fundo}`, `PATCH …/motions/{plano} {valores, fundo, sons}`, `DELETE …/motions/{plano}`, `GET …/motions/{plano}/pagina?duracao=&fala=&exportacao=`.

#### No vídeo final

- A página de render põe o mesmo `MotionNoLugar` (com o fundo e a fala) nos planos com motion; os vídeos e imagens do banco em qualidade de exportação; a foto espera o motion pintar o instante. Motion nunca é tratado como quadro parado.
- Os sons dos motions entram nos eventos de `__render.sons()` (marcas lidas de cada página) e são misturados como os dos presets (§8.6).

#### Ligações

- **Direção (§8.2):** decide quais planos são motion; a Categoria pode ser trocada na etapa Inserts.
- **Banco:** os vídeos e imagens dos motions.
- **Fundos dos inserts (§8.4):** os mesmos 5.
- **Sons (§8.6).**
- **Página Motions:** a galeria.
- ⏳ Em aberto: o Enriquecimento dos motions; fundos próprios dos motions; mais presets conforme Rodrigo pedir; motions sobre inserts.

---

### 8.6 Sons de apoio dos presets

#### O que é

✅ Os sons pequenos do time de audiovisual (cliques, pops, whooshes, risers, impactos, digitação…) que acompanham o que acontece dentro de um insert ou de um motion: o card que aparece, a troca de mídia, a saída, o mergulho, a digitação. Cada preset diz **em que momento** toca **qual som** e **com que intensidade**; a prévia toca junto com o vídeo e a exportação mistura com a voz. Por ora, só dentro dos presets (os sons entre planos são das Transições, §8.8).

Código: `frontend/src/editor/sons.ts` (momentos, eventos, Web Audio), `frontend/src/editor/EscolhaSons.tsx`, `frontend/src/motions/sons.ts`; backend `backend/app/sons.py`, rotas em `backend/app/rotas/presets.py`; ferramentas `ferramentas/sons_biblioteca.py` e `ferramentas/sons_detectar.py`.

#### Passo a passo

1. **(uma vez, pelo Claude)** Os arquivos brutos do time ficam em `dados/sons/` (fora do git: o repositório é público e os sons são licenciados). `ferramentas/sons_biblioteca.py` gera `dados/sons/biblioteca/`: cada som só com o trecho útil (sem o silêncio do começo, até onde o som morre, no máximo 8 s com fade), no mesmo volume percebido (pico de energia em janelas de 50 ms a −18 dBFS; os contínuos, como a digitação, 6 dB abaixo), AAC mono quando os canais são iguais, e o `catalogo.json` (nome, família, duração e o `ataque`: o instante do golpe dentro do arquivo).
2. **(uma vez, pelo Claude)** `ferramentas/sons_detectar.py` achou onde o time usa cada som nas referências (correlação da forma de onda acima de 1,5 kHz). Daí os padrões: UI Pop 02 quando um card aparece; Click Classic 01 nos cortes; Riser 07 subindo até o corte; Instant Camera 01 no corte para tela cheia; Mechanical Click 03 e Correct Ding 02 em motions. Os sons ficam de 14 a 20 dB abaixo da voz.
3. **(pelo Claude, ao criar o preset)** A receita já vem com os sons padrão: o pop nas entradas, o clique seco nas trocas, cliques pequenos em cascata, whooshes curtos nas saídas, o Riser 07 terminando no fim do mergulho.
4. **(manual, página Presets)** No card **Sons** do modal do preset, troque o som, a intensidade e "quando cai" de cada momento. Vale para todos os inserts com o preset.
5. **(manual, no insert)** O ajuste rápido **Som** (Sem · Baixo · Médio) só abaixa, aumenta ou tira os sons naquele insert.
6. **(automático)** Ao abrir a etapa, os arquivos dos sons dos presets dos inserts e dos motions do projeto são baixados e decodificados de antemão; o áudio "acorda" no primeiro clique ou tecla na página.
7. **(automático)** O projeto mede uma vez o nível da voz do bruto e ajusta todos os sons na mesma proporção.

#### O que você vê e pode fazer

**A biblioteca hoje:** 50 sons em 11 famílias: Clique (13), Riser (7), Whoosh (7), Impacto (5), Outros (4), Pop (4), Ding (3), Câmera (2), Digitação (2), Marca-texto (2), Tesoura (1). Nenhum foi descartado; os que os presets não usam ficam para as transições.

**Momentos de som de um preset de enriquecimento** (só aparecem os que a receita tem):

| Momento | Quando existe | Quando toca |
|---|---|---|
| Entrada de cada card | sempre | o golpe cai quando cada card começa a entrar (mais o atraso da posição) |
| Troca (cada mídia nova) | com mais de um card, ou receita que repete | quando cada card depois do 1º aparece |
| Saída | algum card sai sem ampliar | quando a saída começa |
| Mergulho (acompanha o zoom do começo ao fim) | algum card sai ampliando (escala > 1,05) | abrange o zoom de verdade (a janela da escala dentro da saída): começa quando o zoom começa e o golpe cai quando o zoom **para aos olhos** (95% do caminho pela curva) |
| Zoom na mídia (acompanha o zoom) | algum card tem zoom na mídia | igual ao mergulho, sobre o zoom no conteúdo |

- Nos que acompanham um movimento, o som acelera ou desacelera de **0,65× a 1,6×** para caber (o tom acompanha, como numa fita); num movimento curto demais, começa já adiantado no arquivo; depois do golpe, um rabo longo é cortado em **0,15 s** (com fade).
- Uma saída que só desliza e, na tela toda, amplia junto para cobrir continua com o som de **Saída** (não vira mergulho).
- Sons iguais a menos de 0,04 s um do outro (cards que entram juntos) tocam uma vez só. Um som cujo instante passa do fim do insert não toca.

**Card Sons** (modal do preset na página Presets; `EscolhaSons`), uma linha por momento:
- **select** com "Nenhum" e a biblioteca agrupada por família;
- **Baixo · Médio** (apagado sem som);
- **▶ Ouvir**, na intensidade escolhida;
- **Quando cai** (ajuste fino): onde o golpe cai em relação ao momento, de −0,6 a +1,6 s (passo 0,02); grava ao soltar; dois cliques voltam ao zero.
- Biblioteca vazia: "A biblioteca de sons está vazia (rode ferramentas/sons_biblioteca.py com os arquivos em sons/)."

**Intensidade e volume:**
- As intensidades são ganhos sobre o som normalizado: **Baixo 0,25** e **Médio 0,5**, pensados para uma voz no nível das referências (−14 dBFS, o percentil 90 da energia da fala em janelas de 50 ms): Baixo fica ~16 dB e Médio ~10 dB abaixo da voz.
- Cada projeto mede a voz do bruto uma vez (primeiros 180 s; `nivel_voz` no projeto) e todos os sons sobem ou descem junto (`fator`, de 0,1 a 3), na prévia e na exportação. O bruto cru costuma vir ~10 dB abaixo de um vídeo finalizado.
- Na prévia, os sons dos presets passam pelo fader **Sons dos presets** do mixer do Áudio (§8.9).

**Como a prévia toca** (`useSonsNoTempo`):
- Toca cada som cujo instante o relógio cruza andando para a frente. Pular o cursor (arrastar, clicar longe) não toca nada.
- Dar play com o cursor parado no meio de um som que já começou (um riser que começa antes do corte) faz ele entrar já adiantado, como se a prévia viesse tocando. Um pulo com a prévia andando conta como um play naquele ponto.
- Um som no instante 0 do insert toca quando o relógio sai do zero (também depois do R).
- O tempo de baixar e decodificar no 1º toque é descontado (o golpe cai no lugar).
- Pausar para os sons que estão soando; um insert que sai da tela com a prévia andando não corta o som.
- Também tocam na simulação e na recriação da página Presets (o loop liga os sons só no 1º quadro andando).

**Sons dos motions:** ver §8.5.

#### O que fica gravado

- Na receita do preset: `sons[]` = `{momento (entrada · troca · saida · mergulho · zoom), som (id da biblioteca ou null), intensidade (baixo · medio), atraso (s, −3 a 3)}`, um por momento.
- No insert, só o ajuste rápido `ajustes.som` (Sem · Baixo · Médio).
- No projeto: `nivel_voz: {fonte, db}`.
- Em disco: `dados/sons/` (bruto) e `dados/sons/biblioteca/` (os `.m4a` e o `catalogo.json`), fora do git.
- Rotas: `GET /api/sons` (catálogo e ganhos), `GET /api/sons/{id}.m4a`, `GET /api/projetos/{id}/sons/fator`.

#### No vídeo final

- A página de render entrega os eventos (`__render.sons()`): o instante no vídeo final, o som, o ganho (já com o fator da voz), de onde tocar no arquivo e, opcional, a duração e a velocidade. Inclui os dos inserts, os dos motions (lidos de cada página de motion) e os das transições.
- O ffmpeg (`sons.filtro_mistura`) abre um arquivo de entrada por som (dividido entre os usos), corta, ajusta a velocidade, aplica o fade e o volume, atrasa até o instante e soma tudo à voz com `amix` **sem normalizar** (a voz fica como estava). Depois vem o resto do áudio (§8.9).

#### Ligações

- **Presets (§8.4)** e **Motions (§8.5):** onde os momentos são definidos.
- **Áudio (§8.9):** o fader "Sons dos presets" e a mistura final (−14 LUFS).
- **Transições (§8.8):** os sons entre planos usam a mesma biblioteca e o mesmo mecanismo de eventos.

---

### 8.7 Rosto do ator

✅ O rosto do ator, medido uma vez por projeto, guia o enquadramento 16:9 → 9:16 e, na **tela dividida** e no **"ator embaixo"**, posiciona o ator no espaço que sobra (um enquadramento estável por plano, com ajuste manual). Detalhe em [rosto.md](docs/rosto.md).

O uso do rosto em cada área está em §8.1c (enquadramento 16:9 → 9:16), §8.4 (o ator nas áreas que sobram, o centro do zoom dos presets do Full ator) e [rosto.md](docs/rosto.md) (a medida).

### 8.8 Transições (a etapa e a página)

#### O que é

Uma **transição** é o jeito como o vídeo passa de um plano da direção para o seguinte, em cada **corte entre planos** (o instante em que um plano termina e o próximo começa). Ela tem duas partes:

- **O efeito** (`efeito.tipo`), um de quatro:
  - **seco**: nada, troca direta;
  - **luz**: um vídeo de luz colorida (azul-esverdeado, limão, cinza) varre o quadro, cobre quase tudo no corte e some;
  - **brilho**: um véu branco sobe até o corte e se dissipa depois;
  - **zoom**: o quadro inteiro aproxima e desfoca até o corte, e o plano novo chega aproximado e desfocado e assenta.
  Cada efeito diz quanto começa **antes** do corte (`antes`, s), quanto dura **depois** (`depois`, s) e a **força** (0 a 1). A curva é sempre suave (smoothstep): sobe em `antes` s até o corte e desce em `depois` s; sem `antes`, nada antes do corte.
- **O som** (opcional): um som da biblioteca de sons de apoio, com a **intensidade** (Baixo = ganho 0,25 · Médio = 0,5) e o `atraso` (onde o golpe do som cai em relação ao corte; negativo = antes).

O efeito age sobre o **quadro inteiro já montado** (ator, inserts, motions); a legenda fica por cima, fora do efeito.

**A biblioteca** (7 transições, em `dados/transicoes/<id>.json`; hoje todas marcadas como aprovadas):

| Transição (id) | Efeito | antes / depois / força | Som | Intensidade · atraso |
|---|---|---|---|---|
| Corte seco (`corte-seco`) | seco | — | nenhum | — |
| Corte com clique (`corte-clique`) | seco | — | Click Classic 01 | Baixo · 0 |
| Corte com câmera (`corte-camera`) | seco | — | Instant Camera 01 | Baixo · 0 |
| Subida até o corte (`subida-ao-corte`) | seco | — | Riser 07 (sobe e termina no corte) | Baixo · 0 |
| Luz colorida (`luz-colorida`) | luz | 0,22 s / 0,23 s / 100% | Click Classic 01 | Médio · 0 |
| Zoom com desfoque (`zoom-desfoque`) | zoom | 0,18 s / 0,25 s / 100% | Whoosh Fast Swipe 06 | Baixo · −0,2 s |
| Brilho branco (`brilho-branco`) | brilho | 0,22 s / 0,1 s / 100% | Riser 07 | Baixo · 0 |

Os números do efeito (iguais na prévia e no MP4):
- **zoom**: escala até 1 + 0,22 × força × curva; desfoque com σ = (maior lado do quadro / 120) × min(força × curva, 1);
- **brilho**: branco com opacidade até 0,85 × força × curva;
- **luz**: o vídeo `backend/transicoes_efeitos/luz.webm` (0,433 s, 540×960, 30 fps, VP9 com transparência), começando `antes` s antes do corte e tocando até o fim dele (no MP4, ampliado para o tamanho do vídeo).

**Os 3 grupos de plano** (a unidade das favoritas; decisão de Rodrigo, out/2026, no lugar do par exato de categorias):

| Grupo | Categorias de plano que entram nele |
|---|---|
| **Full ator** (`ator`) | Full ator, Full ator com lettering, Full ator com zoom (tudo que começa com `full_ator`) |
| **Tela dividida** (`dividida`) | Tela dividida · insert, Tela dividida · motion, Comentário + insert + ator |
| **Tela cheia** (`cheia`) | Insert tela cheia, Motion tela cheia (o resto) |

**Os 9 pares de grupos** (de onde sai → para onde vai), cada um com a sua ordem e **2 favoritas** (a 1ª é o **padrão do par**), como estão hoje em `dados/transicoes/ordem.json`, com o nº de cortes que as referências têm em cada par (294 cortes em 30 pares de categorias, somados por grupo):

| Par | Cortes nas referências | 1ª favorita (padrão) | 2ª favorita |
|---|---|---|---|
| Full ator → Full ator | 5 | Corte seco | Corte com clique |
| Full ator → Tela dividida | 33 | Corte com câmera | Luz colorida |
| Full ator → Tela cheia | 36 | Corte com câmera | Corte seco |
| Tela dividida → Full ator | 42 | Corte seco | Subida até o corte |
| Tela dividida → Tela dividida | 30 | Corte seco | Corte com câmera |
| Tela dividida → Tela cheia | 40 | Corte seco | Zoom com desfoque |
| Tela cheia → Full ator | 34 | Corte com câmera | Brilho branco |
| Tela cheia → Tela dividida | 42 | Corte seco | Corte com clique |
| Tela cheia → Tela cheia | 32 | Corte seco | Corte com câmera |

**A regra de cada corte** (uma só, igual no front `padraoDoPar` e no back `transicoes.padrao_do_par`):
1. Se o corte tem uma **escolha à mão** válida, vale ela.
2. Senão, vale a **1ª favorita da ordem do grupo** (`familia:<de>><para>`); sem ordem de grupo, a ordem antiga do par exato de categorias (`full_ator>tela_dividida_insert`), se existir.
3. Uma ordem **sem nenhuma favorita** deixa o corte **seco** (não cai em outra ordem); sem ordem nenhuma, também **Corte seco**.

#### Passo a passo

1. **(automático)** Quando o editor abre, ele calcula os planos da direção já no tempo do vídeo final (os planos presos às palavras, depois dos cortes e da velocidade do ator) e, entre cada dois planos seguidos, um **corte** no início do plano que entra (`cortesDoVideo`). O id do corte é o id do plano que entra (`p5` = 5º plano).
2. **(automático)** Para cada corte, decide a transição pela regra acima (escolha à mão → 1ª favorita do par → corte seco). Uma escolha à mão guarda o **par em que foi feita** e só vale enquanto o corte com aquele id ainda for do mesmo par (os ids são de posição; com outra direção, `p5` pode ser outro corte). Escolhas antigas, só com o id, valem em qualquer par.
3. **(automático)** A prévia de todas as etapas recebe a lista de cortes com a transição (`TransicoesDoVideo`), mas o efeito e o som **só aparecem onde o quadro está montado**: nas etapas Inserts, Transições, Áudio e Legenda. No Pré-processamento e na Direção o ator fica limpo (sem flashes ao avaliar o look, sem cliques ao ouvir uma emenda).
4. **(manual)** Na etapa Transições, você anda pelo vídeo; o corte mostrado à esquerda é sempre **o próximo corte a partir do cursor** (o primeiro com instante ≥ cursor − 0,05 s; depois do último, o último). Enquanto o vídeo toca, o corte selecionado **fica parado** (não pula para o seguinte quando o cursor passa dele).
5. **(manual)** Para trocar a transição de um corte, clique no **nome** de um dos cards (favoritas ou outras). A troca é gravada na hora (`PUT /api/projetos/{id}/transicoes`) com o par do corte.
6. **(manual)** Para ver como ficou: **▶ Ver o corte** ou a tecla **R** — toca de 1,5 s antes a 1,5 s depois do corte e para.
7. **(manual, opcional)** Para mexer em todos os cortes de uma vez, use o card **Todos os cortes** (Variar favoritas / Sortear todas / Voltar às favoritas).
8. **(manual, opcional)** Para mudar o que entra sozinho em cada par (o padrão), vá à **página Transições** e mude as favoritas (★) ou "Tornar o padrão do par".
9. **(automático, na exportação)** A página de render recalcula os cortes com a biblioteca e as escolhas do projeto lidas na hora, manda os cortes com efeito ao ffmpeg (`__render.transicoes`) e os sons junto com os sons dos presets (`__render.sons`).

#### O que você vê e pode fazer — a etapa Transições

Arranjo igual ao da etapa Inserts: coluna da esquerda, prévia no meio com o card "Todos os cortes" ao lado, linha do tempo embaixo.

**Coluna da esquerda** (largura padrão 820 px, no máximo 62% da tela; arrastável pela borda de 480 a 1100 px, lembrada neste navegador):
- Cabeçalho **Transições** com o contador "**N cortes · K com efeito ou som**".
- Sem planos na direção: "Este vídeo ainda não tem planos na direção (a etapa Direção visual)."
- **O corte selecionado**:
  - "**<categoria de saída> → <categoria de entrada>**" (os nomes das categorias, não dos grupos);
  - o instante do corte · "**a favorita do par**" ou "**escolhida à mão**" (em coral);
  - botão **▶ Ver o corte  R** (toca o trecho de −1,5 s a +1,5 s em volta do corte, pelo mesmo `tocarTrecho` do player; pausar esquece o trecho);
  - **Voltar à favorita do par** (só aparece quando o corte foi escolhido à mão; apaga a escolha).
- **Favoritas do par** (rótulo amarelo) e **Outras transições** (rótulo cinza), em grades de **4 cards por linha**. A ordem é a do par (as que não estão na ordem vão para o fim). Cada card:
  - a **demonstração**: só a **referência** (o corte das referências de onde a transição veio, um trecho do proxy da referência tocando **com o som dela**). Clicar na demonstração toca em loop / para; só uma toca por vez;
  - embaixo, o **nome**, que **escolhe** a transição para o corte; ★ amarela se é favorita do par; ✓ verde na que está valendo (o card fica com contorno creme); 🔊 se a transição tem som; a descrição aparece na dica do nome.
  - De qual corte vem a demonstração (`fonteDaTransicao`): um corte-fonte da transição que caia no par de grupos do corte; senão a 1ª fonte dela. Um corte que é fonte de uma transição **com efeito** nunca é mostrado como fonte de uma transição só de som. O Corte seco (sem fontes próprias): um corte seco **sem som** do par; senão um seco do par mesmo com som; senão um seco sem som de qualquer par.
- **Aviso amarelo** quando nenhum corte que segue a favorita tem efeito nem som: "Pelas favoritas de hoje, os cortes que seguem a favorita do par ficam todos secos… Troque à mão aqui ou mude a 1ª favorita do par na página Transições" (com link).

**Card "Todos os cortes"** (coluna de 170 px à direita da prévia; só aparece com a biblioteca carregada e pelo menos um corte). Cada clique sorteia de novo, para os sons que estão tocando e grava **tudo num PUT só**:
- **★ Variar favoritas**: cada corte recebe uma das 2 favoritas do seu par, meio a meio. Um par sem favorita fica sem escolha (volta ao padrão).
- **🎲 Sortear todas**: 50% de chance de uma favorita (sorteada entre elas) e 50% de uma das outras transições (sorteada entre elas); sem favorita no par (ou sem "outras"), cai no grupo que existir.
- Em ambos, se a transição sorteada for a própria **1ª favorita** (o padrão), o corte **não** fica marcado como escolhido à mão (a escolha é apagada).
- **↺ Voltar às favoritas · N** (só quando há N cortes escolhidos à mão): apaga todas as escolhas à mão.

**Prévia** (no meio): o quadro montado igual ao das etapas seguintes (ator, inserts, motions — `MontagemDoProjeto`, que lê os inserts, o banco e os motions do projeto) com o efeito da transição e a legenda por cima. Detalhes do player na seção "O player e a prévia".

**Linha do tempo** (embaixo; altura padrão 200 px, arrastável de 150 a 420 px; zoom ⌘+ / ⌘− e botões; a régua leva o cursor). Três trilhas:
- **Planos** (34 px): cada plano com o nº e a categoria, na cor da categoria. Clicar num plano seleciona o corte que **entra** nele e leva o cursor para **0,4 s antes** do corte.
- **Transições** (30 px): em volta de cada corte, a **janela do efeito** (de `corte − antes` a `corte + depois`; na luz, até `corte − antes + 0,433 s`), com no mínimo 16 px (um marcador centrado no corte quando a janela é estreita). Cores: cinza = seco sem som; verde-sálvia = seco com som; coral = com efeito. Contorno amarelo no corte selecionado; **ponto vermelho (coral)** no que foi escolhido à mão. Com 70 px ou mais mostra o nome; senão 🔊 (se tem som) ou "|". A dica diz instante · categorias · nome · "(escolhida à mão)". Clicar seleciona e leva o cursor para 0,4 s antes.
- **Sons** (20 px): cada som de transição, do começo do arquivo ao fim dele (a duração do arquivo), com o nome.

**Atalho R**: toca o corte selecionado (para antes os sons que estão tocando). Não vale com o foco num campo de texto, com um modal aberto, com ⌘/Ctrl/Alt, nem sem cortes.

#### O que você vê e pode fazer — a página Transições

Na barra de cima (ao lado de Presets). Ao abrir, mostra **Todas as transições**. Só um card toca por vez; sair da página para todos os sons.

**Barra da esquerda** (300 px):
- **Biblioteca → Todas as transições** (com o total, "ver, ouvir e aprovar").
- **De onde sai → para onde vai**: os 3 grupos de origem (**Full ator**, **Tela dividida**, **Tela cheia**), todos abertos de início, cada um com a seta para recolher e o total de cortes das referências que saem dele. Dentro de cada um, os 3 destinos ("→ Full ator", "→ Tela dividida", "→ Tela cheia"), cada um com o nº de cortes das referências naquele par e, embaixo, o nome do **padrão do par** (ou "Corte seco" se não houver favorita).

**Vista "Todas as transições"**: título, "7 transições, cada uma com um corte das referências de onde veio…", a escolha **Som da referência / Som da recriação** (de qual lado sai o som ao tocar um card; padrão: recriação) e a grade de cards (colunas de no mínimo 270 px). Aqui os cards não têm a ★ (favorita é por par).

**Vista de um par** (ex.: "Tela cheia → Full ator"):
- Cabeçalho: "N cortes nas referências · <sons achados nesses cortes com a contagem>" (ou "sem som de corte" / "Nenhum corte assim nas referências.") e a escolha de som.
- **Favoritas do par**: os cards das favoritas (no máximo 2). Sem nenhuma: "Nenhuma favorita: os cortes deste par ficam secos. Marque a estrela de uma transição."
- **Outras transições**: o resto, na ordem do par.
- **Os cortes deste par nas referências**: uma prévia grande (180 px de largura) que toca o corte escolhido de 1,5 s antes a 1,5 s depois, **com o som**, em loop; ao lado, um chip por corte ("referência · instante", 🔊 se há som; a dica diz a classe — seco ou o efeito medido — e os sons achados). Clicar num chip toca aquele corte.

**O card de transição** (`CardTransicao`):
- A **miniatura** de borda a borda: à esquerda a **Referência** (o trecho do proxy da referência em volta do corte de onde a transição veio) e à direita a **Recriação** (o quadro de antes do efeito até o corte e o quadro de depois a partir dele, tirados da própria referência, com o efeito e o som do motor por cima), no mesmo relógio. O trecho começa pelo menos 1,5 s antes do corte (mais, se o efeito ou o som pedirem: um riser sobe ~1 s até o golpe) e vai pelo menos 1,5 s depois. Rótulos "Referência" / "Recriação" embaixo sobre um degradê; selo **Aprovada** (verde) ou **A revisar** (coral) no canto; **Padrão do par** (amarelo) no outro canto na 1ª favorita; o ▶ no meio; tocando, uma barra de progresso com um traço no instante do corte. Clicar toca as duas juntas em loop (o som do lado escolhido em "Som da referência / da recriação").
- Embaixo: o **nome** (clicar abre o modal) e o tipo de efeito ("Corte seco", "Luz colorida", "Brilho", "Zoom com desfoque") + " · com som"; a **★** (só na vista de par) liga/desliga a favorita; o **✓** aprova / tira a aprovação; a **engrenagem** abre o modal.
- **Tornar o padrão do par** (só numa favorita que não é a 1ª): sobe ela para 1ª.
- Regras da ★: tirar uma favorita a manda para logo depois das favoritas; marcar uma quando há menos de 2 a põe no fim das favoritas; marcar uma terceira faz ela entrar no lugar da 2ª, que vai para "Outras". Toda mudança grava a ordem do par (`PUT /api/transicoes/ordem/familia:<de>><para>`).
- "Aprovada" é só a marca da revisão de Rodrigo: **não muda o que entra no vídeo**.

**O modal da transição** (clicar no nome ou na engrenagem; o card que estava tocando para):
- À esquerda (420 px): a miniatura grande com **um play em cada metade**: tocar a Referência toca com o som da referência; tocar a Recriação toca com o som do motor; clicar no lado que está tocando para. Texto: "Toque a referência ou a recriação: cada uma com o próprio som." e a descrição da transição.
- **Som**: a lista de sons da biblioteca ("Sem som" e todos os sons), e a **intensidade** Baixo / Médio num grupo compacto. Um som novo entra com Baixo e atraso 0. "O golpe do som cai no corte. Vale para todos os cortes que usam esta transição." (grava em `PATCH /api/transicoes/{id}`).
- **Efeito**: o tipo e, se não é seco, "começa X s antes do corte e acaba Y s depois · força Z%" (só leitura).
- **Favorita em**: os pares em que ela é favorita (chips).
- **Onde aparece nas referências · N**: miniaturas (4 por linha) dos cortes das referências ligados a ela, com a referência, o instante e o par. São as fontes dela e, nas transições sem efeito, os cortes em que o som dela cai (no Corte seco, os cortes secos sem som). Clicar numa miniatura põe aquele corte na prévia do modal e toca com o som da referência.

#### Como os sons tocam na prévia

- **O instante do som**: o golpe do arquivo (o `ataque` de cada som da biblioteca) cai em `corte + atraso`. O som começa em `corte + atraso − ataque`; se isso fosse antes do zero do vídeo, começa no zero já adiantado no arquivo (`eventoNoTempo`).
- **O volume**: intensidade (0,25 ou 0,5) × o **fator de som do projeto** (a voz do bruto medida e comparada com a das referências, o mesmo fator da exportação; vem do Editor para todas as etapas) × o fader **Transições** do mixer (o barramento `transicoes` do Web Audio).
- **Tocar**: um contexto de áudio só para a prévia; os arquivos dos sons são baixados e decodificados de antemão quando a lista muda; o áudio é "acordado" já no primeiro clique ou tecla da página (senão o primeiro som perdia o começo).
- **Quando cada som toca** (`useSonsNoTempo`, a cada quadro do relógio da saída):
  - com a prévia andando, toca cada som cujo instante foi cruzado desde o quadro anterior;
  - um passo maior que 0,5 s é um **pulo** (clicar na régua, num corte, arrastar);
  - recuos de menos de 0,05 s com o vídeo tocando são ressincronização do vídeo e não tocam nada de novo;
  - ao dar **play** com o cursor no meio de um som (por exemplo, um riser que começa ~1,3 s antes do corte), ele entra **já adiantado**, como se a prévia viesse tocando (até 6 s depois do começo do som);
  - parar a prévia para na hora todos os sons que estão soando.
- **As correções de "não tocou 100% das vezes"** (out/2026):
  1. **Pulo com a prévia andando** (clicar num corte na linha do tempo, arrastar o cursor) agora entra como um **play naquele ponto**: o som que já estaria soando ali entra adiantado. Antes, como o clique leva o cursor a 0,4 s antes do corte e o riser começa ~1,3 s antes, 7 de 19 risers ficavam mudos no teste.
  2. **Tocar um trecho** (R, Ver o corte) já põe o relógio da saída no ponto do trecho antes do primeiro quadro (`tocarTrecho`): antes, o primeiro quadro ainda trazia o ponto antigo, e um som tocava fora de hora e de novo no lugar certo.
  3. **Trocar o corte selecionado** não para mais os sons que estão tocando.
  4. Um som que **ainda não começou** nunca é pedido ao áudio com um ponto antes do início do arquivo: ele é agendado para entrar na hora certa, do começo. Só um som que de fato começou entra na lista do que para ao pausar, e parar um som que já acabou não derruba os outros (antes, "Ver o corte" num corte com riser deixava a página em branco no fim do trecho).
- Qualquer erro inesperado numa tela mostra um aviso com "Recarregar" (não a página em branco).

#### A ferramenta de teste de ponta a ponta (`ferramentas/e2e_sons_transicoes.py`)

- **Para que serve**: confere no navegador, de verdade, se cada som de transição toca uma vez e na hora.
- **Como rodar**: com o app no ar (`./dev.sh`, back em `localhost:8000`, front em `localhost:5173`) e o Chrome instalado: `uv run --with playwright python ferramentas/e2e_sons_transicoes.py [projeto]` (padrão: `melhor-ia-design`).
- **O que faz**:
  1. Guarda as escolhas de transição do projeto num arquivo temporário (`escolhas_<projeto>.json`).
  2. Põe uma transição **com som** em todos os cortes `p2` a `p59`, em rodízio entre Corte com clique, Subida até o corte, Brilho branco, Zoom com desfoque, Corte com câmera e Luz colorida.
  3. Abre o editor no Chrome (1900×1050, autoplay liberado), com o registro `window.__sonsLog` ligado (o front anota cada som que de fato começou, com o instante e o adiantamento) e lê os sons esperados (`window.__sonsEsperados`), vai à etapa Transições e dá um clique para acordar o áudio.
  4. **Teste A** — o vídeo inteiro a **1×** e a **2×**: cada som esperado tem de tocar **exatamente uma vez**, com no máximo **0,12 s** de diferença.
  5. **Teste B** — **R em cada corte**: os sons do trecho (−1,5 s a +1,5 s) tocam uma vez cada, sem duplicados e sem sons de fora (só vale a cauda de um som que começou até 2,5 s antes do trecho).
  6. **Teste C** — com o vídeo tocando, **clicar em cada corte** (o cursor pula para 0,4 s antes dele): o som que estaria soando nesse ponto, ou que começa até 0,75 s depois, tem de tocar uma vez.
  7. Imprime "TUDO CERTO 0" ou "FALHAS N" com a lista, e os erros da página.
  8. No fim (mesmo se falhar), apaga as escolhas de `p1` a `p59` e devolve as que estavam guardadas, conferindo.
- A velocidade do ator (1× / 1,2×) não é trocada pelo script: para testar com o ator acelerado, mude a velocidade no projeto antes de rodar.

#### O que fica gravado

- **Biblioteca (global, fora do git)**: `dados/transicoes/<id>.json` = `{id, nome, descricao, efeito: {tipo, antes, depois, forca}, som: {som, intensidade, atraso} | null, fontes: [{ref, t}] (até 12), aprovado}`. Validação: `antes`/`depois` de 0 a 2 s, força de 0 a 1.
- `dados/transicoes/pares.json`: os pares de categorias vistos nas referências (da análise `ferramentas/transicoes_analisar.py`): nº de cortes, classes (seco / efeito medido), sons e a lista de cortes `{ref, t, classe, sons}`.
- `dados/transicoes/ordem.json`: `{ "familia:<de>><para>": {ids: [ordem inteira], favoritas: 0..2} }` (aceita também a chave antiga de par exato).
- `backend/transicoes_efeitos/luz.webm` (no git): o vídeo da luz colorida.
- **No projeto**: `projeto.transicoes = { <id do plano que entra>: {id: <transição>, par: "<cat_de>><cat_para>"} }` — **só as trocadas à mão**; o resto segue o padrão do par na hora. Mandar `null` num plano volta ao padrão.
- **Gerar a direção do zero** apaga as escolhas; pedir uma correção (v2, v3…) as mantém.
- Rotas: `GET /api/transicoes` (biblioteca + pares + ordem), `PATCH /api/transicoes/{id}` (aprovado, nome, som, efeito), `PUT /api/transicoes/ordem/{par}`, `GET /api/transicoes/efeitos/{nome}.webm`, `GET/PUT /api/projetos/{id}/transicoes`.

#### No vídeo final

- Os cortes **com efeito** (luz, brilho, zoom) vão em `__render.transicoes` como `{t, tipo, antes, depois, forca}` e são aplicados pelo ffmpeg **depois de toda a montagem** (ator, inserts, ator por cima), antes da legenda (`transicoes.filtros`):
  - o quadro montado é convertido para `yuv420p` bt709 antes (fora das janelas, o quadro sai **idêntico** a uma exportação sem transições);
  - **zoom**: `scale` com `eval=frame` + recorte central (fora da janela, só repassa) e um `gblur` que só liga dentro da janela, com o σ mudando quadro a quadro por `sendcmd`;
  - **brilho**: uma fonte branca do tamanho da janela, com a transparência pela curva, sobreposta por `overlay`;
  - **luz**: o `luz.webm` (decodificado com `libvpx-vp9`, marcado bt709) ampliado e sobreposto a partir de `corte − antes`.
  O custo é só o das janelas (medido: brilho + zoom + luz juntos somam ~4,5% de CPU à passada final de 1:01,7 em 4K).
- Os **sons** de todas as transições (inclusive as secas com som) vão em `__render.sons`, marcados com o grupo `transicoes`, e entram na mistura com o fader **Transições** (ver Áudio).
- Cortes secos sem som não geram nada.

#### Ligações

- **Direção visual**: os planos e as categorias decidem onde há corte e qual o par. Mexer na direção pode invalidar escolhas à mão (o par não bate mais).
- **Pré-processamento** (cortes e velocidade do ator): mudam o instante dos cortes no vídeo final (os planos seguem as palavras).
- **Inserts e motions**: o efeito age sobre o quadro já montado com eles (`MontagemNoPalco`).
- **Sons de apoio (§8.6)**: a mesma biblioteca de sons, o mesmo tocador, o mesmo fator de som do projeto.
- **Áudio**: o fader **Transições** do mixer; os sons das transições aparecem na linha do tempo da etapa Áudio.
- **Legenda**: fica por cima, fora do efeito (na prévia e no MP4).
- **Exportação**: `_pos_montagem` → `_transicoes`; os sons em `_audio`.

---

### 8.9 Áudio

#### O que é

O som do vídeo final em quatro trilhas — **Ator** (a voz), **Sons dos presets**, **Transições** e **Fundo** (a música) — com o mesmo resultado na prévia e no MP4:
- **A voz**: limpeza de ruído → passa-altas de 80 Hz → **timbre** → **compressor leve** → fader do Ator.
- **A faixa de fundo**: uma música da biblioteca, 11 dB abaixo da voz, abaixando 3 dB enquanto o ator fala (ducking), repetida em laço com crossfade e com fade no fim.
- **O mixer**: um fader por trilha, de −12 a +6 dB (o fundo também com "mudo").
- **No MP4**, o volume final em **−14 LUFS** (o padrão do Instagram), com o pico abaixo de −1,5 dBTP. A prévia toca no nível de trabalho (sem essa normalização).

#### Passo a passo

1. **(automático, ao abrir o projeto em qualquer etapa)** O editor lê `GET /api/projetos/{id}/audio`. Se a limpeza escolhida (padrão **Leve**) ainda falta e o proxy do vídeo atual existe, ela entra na fila em segundo plano (uma limpeza por vez no servidor). Sem proxy ainda, espera ("esperando o vídeo").
2. **(automático)** A limpeza: extrai a voz do bruto em mono (média dos canais) a 48 kHz → roda o DeepFilterNet 3 (num ambiente Python à parte, chamado por subprocesso; ~0,7 s para 30 s de voz) com o limite de 6, 12 ou 24 dB → grava `midia/voz/<bruto>_<nível>.wav` → mede a sonoridade da voz (LUFS, como ela entra na mistura) e guarda no projeto → monta um **proxy com essa voz** (o vídeo copiado sem recodificar, a voz em AAC 192k) → marca "pronta". A tela acompanha de 1,5 em 1,5 s.
3. **(automático)** Com a voz pronta, a prévia passa a tocar o proxy com a voz limpa, **do mesmo ponto** e tocando se tocava. 10 s depois, os proxies com a voz das outras limpezas são apagados (o wav fica; o proxy é refeito em segundos se a escolha voltar).
4. **(manual)** Escolher a **limpeza** e o **timbre**; o timbre muda na hora (é só a cadeia do Web Audio na prévia).
5. **(manual)** Escolher uma **faixa de fundo** (ou "Sem fundo"); ▶ ouve a faixa sozinha.
6. **(manual)** Ajustar os **faders** do mixer; a prévia muda enquanto arrasta, e o servidor recebe 350 ms depois de parar.
7. **(automático, na exportação)** A voz da escolha (feita na hora se faltar), o fundo e os sons são misturados; o ganho do −14 LUFS é medido antes só no áudio, e a passada final aplica o ganho e um limitador de pico.

#### O que você vê e pode fazer

Arranjo: à esquerda "Voz e fundo" (largura arrastável, no máximo 480 px), no meio a prévia montada, à direita o **Mixer** (300 px), embaixo a linha do tempo.

**Limpeza de ruído** (com o estado ao lado: "limpando… X%" em amarelo, "pronta", "esperando o vídeo", "falhou" em coral com o erro na dica):
- **Sem · Leve · Média · Forte** (DeepFilterNet, no Mac, grátis): o ruído de fundo cai 6, 12 ou 24 dB; a fala fica igual. Padrão: **Leve** (também para projetos antigos). O Forte para em 24 dB porque sem limite as pausas viram silêncio digital.
- **Isolamento máximo · ElevenLabs** (botão separado): o Voice Isolator do ElevenLabs (pago; manda a voz ao serviço; precisa da `ELEVENLABS_API_KEY`). Pede confirmação: "O isolamento máximo usa o Voice Isolator do ElevenLabs: é pago e envia o áudio da sua voz a esse serviço. Continuar?". Clicar de novo desliga e volta à limpeza de antes dele (ou à Leve). **Nunca roda sozinho**: só pedido na tela (ou se a voz isolada já existe e falta só o proxy).
- Com **erro**: "Não deu para limpar: <erro>. A prévia e o MP4 usam a voz original. **Tentar de novo**". Uma limpeza que falhou fica em erro até ser pedida de novo (não se refaz em laço).
- Enquanto uma limpeza nova é feita, a prévia continua com a voz que já tocava; com erro ou "Sem", toca a voz do bruto (como o MP4).
- Num reinício do servidor, as limpezas locais interrompidas voltam à fila; o isolamento interrompido vira erro ("peça de novo").
- Num **Reenquadrar**, a limpeza não monta o proxy enquanto o vídeo é refeito e descarta o resultado se a versão do vídeo mudou no meio; o wav continua valendo (o áudio do bruto não muda).

**Timbre** — **Natural · Quente · Clara** (padrão Natural), sempre depois de um passa-altas de 80 Hz:
- Natural: só o passa-altas;
- Quente: +2,5 dB em 180 Hz (Q 0,9) e −1,5 dB em 3,5 kHz (Q 1);
- Clara: −2 dB em 250 Hz e +3 dB em 4,5 kHz (Q 1).
- Depois, o compressor: limiar −20 dB, razão 2,5:1, ataque 10 ms, soltura 150 ms, joelho 6 dB.

**Faixa de fundo**:
- **Sem fundo** (padrão) e as 8 faixas da biblioteca (geradas com o Lyria 3 Pro a partir da música das referências, normalizadas em −16 LUFS): **Piano lo-fi** (calmo, 86 BPM), **Arpejo suave** (103), **Pads ambiente** (108), **Chillhop** (92), **Sinos leves** (118), **Cinemático** (86), **Grave tech** (103), **Piano pulsante** (152). Cada linha mostra o clima · BPM · duração; a descrição na dica.
- **▶** ouve a faixa **sozinha**: se a prévia está tocando, ela pausa; dar play na prévia para a faixa que se estava ouvindo. Clicar no nome escolhe a faixa.

**Mixer** — quatro faders verticais: **Ator**, **Sons dos presets**, **Transições**, **Fundo**:
- de **−12 a +6 dB**, passo de 0,5 dB, 0 dB = o nível medido nas referências; o valor aparece em cima ("+1,5", "−3,0");
- **duplo clique** volta a 0 dB;
- o Fundo tem o botão **mudo**; com "Sem fundo", o fader e o mudo ficam apagados.
- Texto: "Os faders ajustam cada trilha em volta do nível medido nas referências (0 dB). No MP4, o volume final fica em −14 LUFS…".

**Linha do tempo** (três trilhas):
- **Voz** (26 px): os trechos em que o ator fala (as palavras juntas quando a pausa é menor que 0,6 s).
- **Transições** (22 px): os sons das transições, em coral, cada um com 0,4 s de largura (ou a duração dele, se tiver). ⏳ Os sons dos presets ainda não aparecem aqui, só tocam.
- **Fundo** (30 px): a curva do nível do fundo (desce nas falas, some no fim), só com uma faixa escolhida e sem mudo.

**Onde vale**: a cadeia da voz e os faders valem em **todas as etapas**; o fundo toca nas etapas com o vídeo montado (todas menos o Pré-processamento).

**Como a prévia faz igual ao MP4** (Web Audio):
- a voz do player passa por `BiquadFilter` (passa-altas Butterworth, Q −3,01 dB), os filtros do timbre, `DynamicsCompressor` e um ganho que **desfaz o makeup** que o compressor do Chrome aplica sozinho (+6,2 dB com estes números) — senão a voz soaria 6 dB acima do fundo e dos sons;
- os sons dos presets e os das transições têm um barramento cada (os faders);
- o fundo: dois elementos de áudio que se alternam nas voltas do laço (para o crossfade), sincronizados com o relógio da saída (ressincroniza se desviar mais de 0,25 s tocando), na **velocidade do player** (0,25× a 2×), parados quando a prévia para; o ganho = sonoridade da voz tocada − 11 dB − (−16) + fader, × ducking × fade do fim.

#### O que fica gravado

- `projeto.audio`:
  - as escolhas: `voz {limpeza: sem|leve|media|forte|isolamento, timbre: natural|quente|clara}`, `fundo` (id da faixa ou null), `fundo_mudo`, `niveis {ator, presets, transicoes, fundo}` (dB, −12 a +6);
  - o que o app grava: `limpezas.<nível> = {estado: fila|rodando|pronta|erro, progresso, erro}` (sem entrada = falta) e `voz_lufs.<bruto>_<nível>` (a sonoridade medida da voz, a base do fundo).
- Arquivos: `midia/voz/<bruto>_<nível>.wav` e `midia/proxy/<bruto>_voz_<nível>[_v<versão>].mp4`.
- Biblioteca global: `dados/trilhas/<id>.m4a` + `catalogo.json` (nome, clima, BPM, duração, prompt). O **laço** de cada faixa (o trecho estável: onde a energia em janelas de 2 s fica a menos de 5 dB da mediana) é medido uma vez por arquivo.
- Rotas: `GET /api/audio` (catálogo + todos os números da cadeia), `GET /api/audio/trilhas/{id}.m4a`, `GET/PUT /api/projetos/{id}/audio` (o PUT com a limpeza refaz uma que falhou).

#### No vídeo final

1. A **voz da escolha** (a limpa; com "Sem", a do bruto) entra como entrada própria; a voz do bruto vai para um `anullsink`. Se a limpeza falhar (DeepFilterNet não roda, ElevenLabs não responde), o vídeo sai com a voz original e um **aviso** no fim ("Não deu para limpar a voz…: o vídeo saiu com a voz original.") em vez de falhar.
2. A voz é cortada nos clipes da V1 como o ator (cada clipe com fade de 15 ms nas pontas e `atempo` se o ator estiver acelerado), emendada, passa pela cadeia (`highpass`, `equalizer`, `acompressor`, `volume` do fader) e vai a **estéreo com ganho 1** nos dois canais.
3. Os **sons** (dos presets e das transições) entram com ganho × fator do projeto × o fader do grupo deles.
4. O **fundo**: cada volta numa entrada (a 1ª do 0 ao fim do laço, as outras dentro do laço), emendadas com `acrossfade` de **2 s** (`qsin`, potência constante); cortado na duração do vídeo; **fade de 1,5 s** no fim; ganho = voz_lufs − 11 + fader − (−16) dB; ducking por `volume` com `eval=frame` (−3 dB nas falas, abaixando 0,15 s antes e voltando em 0,35 s, smoothstep); somado com `amix` sem normalizar. Um vídeo mais curto que o laço toca a faixa do começo.
5. O **−14 LUFS**: o ganho parte de −14 − (voz_lufs + fader do Ator), limitado a ±30 dB; a mistura inteira (só o áudio, rápido) é medida com `ebur128` já com o limitador, e o ganho é corrigido até ficar a **0,3 LU** do alvo (no máximo 3 passadas; em geral 1, ~2,5 s por minuto). A passada final aplica o `volume` e um `alimiter` em −2 dBFS (ataque 5 ms, soltura 50 ms). Medido: −14,2 LUFS e −1,9 dBTP no vídeo de teste.
6. Saída AAC 320 kbps, 48 kHz, estéreo.

#### Ligações

- **Pré-processamento**: os cortes (a voz é cortada igual ao ator), a velocidade do ator (`atempo`), o Reenquadrar (refaz o proxy; a limpeza espera).
- **Sons de apoio (§8.6)** e **Transições**: chegam como eventos (`__render.sons`), cada grupo no seu fader.
- **Transcrição**: as palavras no tempo da saída dão as falas do ducking.
- **Player**: o proxy com a voz limpa troca o `src` do vídeo; o player retoma do mesmo ponto.
- **Exportação**: `_audio` → `audio.filtros`; `audio.da_exportacao` e `audio.medir` rodam antes da passada final (com o cancelar conferido antes e depois).

---

### 8.10 Legenda

#### O que é

A legenda gerada **sozinha da fala já cortada**, no **estilo da casa** medido nas referências (OCR em 2.777 quadros de 10 referências):
- **SF Pro Display Bold**, branca, com uma **sombra escura difusa** logo abaixo; minúsculas como na fala; centralizada;
- **tamanho**: 56 px num quadro 1080×1920 (2,92% da altura), em qualquer resolução proporcional;
- **uma palavra por vez** (padrão; 7 das 10 referências) ou **frases curtas**;
- **altura por tipo de plano**, desviando da costura da tela dividida, do ator encolhido e do card do comentário;
- **sem destaques** (nenhuma referência muda a cor ou o tamanho de uma palavra).

#### Passo a passo

1. **(automático)** Das palavras que ficaram no vídeo (no tempo da saída), monta os **blocos** (`blocosDaLegenda`, a mesma conta na prévia, na etapa e na página de render):
   - **Palavra a palavra**: um bloco por palavra.
   - **Frase curta**: junta até **3 palavras** e **18 letras**, quebrando na pontuação (`. ! ? , ; : …` no fim de uma palavra) e em pausas de **0,3 s** ou mais.
   - A vírgula, o ponto e vírgula e os dois-pontos do fim de cada palavra saem; a interrogação e a exclamação ficam.
2. **(automático)** O **tempo** de cada bloco: entra **0,17 s antes** da 1ª palavra (nunca antes do zero e no mínimo 0,12 s depois do bloco anterior); se a pausa até o próximo é menor que 0,3 s, fica até o próximo entrar; senão sai **~0,1 s antes** do fim da última palavra; nunca passa do início do próximo.
3. **(automático)** A **altura** (centro do texto, fração da altura do quadro, de cima):
   - pelo tipo de plano (medianas das referências): Full ator 0,554 · Full ator com lettering 0,524 · Tela dividida · insert 0,453 · Tela dividida · motion 0,476 · Insert tela cheia 0,428 · Motion tela cheia 0,504 · Comentário + insert + ator 0,409 (padrão 0,554);
   - **tela dividida com insert**: na **costura real** daquele insert (a divisão dele), entre 0,3 e 0,7; o motion dividido fica em 0,5;
   - **"ator embaixo"** (insert na tela toda e o ator encolhido): na janela ou no recortado, a altura do Full ator dentro do ator encolhido (no peito); no canto, logo acima da caixa do ator;
   - **card do comentário**: se a legenda bateria no card, vai logo **acima** dele (se couber acima de 0,08) ou **abaixo** (se couber abaixo de 0,92), com 0,015 de folga. Como o bloco entra 0,17 s antes da fala, a 1ª palavra de um plano também desvia de um card que ainda está na tela.
   - Inserts em tela cheia e motions **não** são lidos por dentro: fica a altura medida (⏳ a legenda pode cair sobre o conteúdo deles).
4. **(manual, opcional)** Na etapa, corrigir textos, juntar, separar, esconder blocos; trocar o ritmo; desligar a legenda.
5. **(automático)** Se os cortes mudam, os ajustes acompanham as palavras; os que perderam todas as palavras viram **órfãos** para você decidir.
6. **(automático, na exportação)** A página de render manda os blocos visíveis; o backend escreve um **ASS** e o libass o desenha por cima de tudo.

#### O que você vê e pode fazer

Arranjo: à esquerda o painel (largura arrastável, no máximo 480 px), no meio a prévia montada com a legenda, embaixo a linha do tempo.

- **Cabeçalho "Legenda"** com a caixa **ligada / desligada** (padrão: ligada). Desligada, o painel fica apagado e nada sai no vídeo.
- **Ritmo**: **Palavra a palavra** · **Frase curta**. Texto com o estilo e "N blocos · K mexidos à mão".
- **Voltar tudo ao automático** (só com ajustes; pede confirmação): apaga todos os ajustes.
- **Órfãos** (caixa amarela, se houver): "N ajustes ficaram órfãos: as palavras saíram do vídeo nos cortes." Cada um mostra o texto corrigido, "escondido: <fala>" ou "junção: <fala>", com **Reatar** (prende o ajuste à próxima palavra que ficou no vídeo; desligado se não houver) e **Descartar**.
- **O bloco selecionado** — o bloco sob o cursor; entre dois blocos, o último clicado (o clicado vale enquanto o cursor estiver nele ou a até 0,1 s). Sem bloco: "Escolha um bloco na linha do tempo…". Mostra:
  - o tempo "início → fim", "1 palavra" / "N palavras" e "mexido à mão" (amarelo) se for o caso;
  - o **campo de texto** (placeholder "(escondido)"): grava ao sair do campo ou com Enter, só se você digitou algo; tira espaços das pontas e repetidos; se ficar igual ao atual, nada é gravado. Corrigir o texto **prende também as palavras** do bloco (o `fim`), para o texto não se espalhar se o ritmo mudar.
  - **Juntar com o próximo**: o bloco passa a ir até a última palavra do próximo. Só grava o texto junto se um dos dois tinha texto corrigido. Desligado se não há próximo ou se um dos dois está escondido ("Mostre o bloco escondido antes de juntar").
  - **Separar** (desligado com menos de 2 palavras): a 1ª palavra num bloco, o resto noutro. Um texto corrigido é dividido entre as partes (as últimas palavras do texto vão para o resto). No Frase curta, as duas partes ficam "presas" (presilhas que só valem no Frase curta), para o agrupamento automático não desfazer a separação.
  - **Esconder / Mostrar**: esconde o bloco (texto vazio, preso às palavras); mostrar devolve o texto automático.
  - **Automático** (só em bloco mexido): volta o bloco ao automático.
- **Linha do tempo**: **Planos** (26 px, na cor de cada categoria) e **Legenda** (34 px): cada bloco com a largura exata do seu tempo; claro = automático, **amarelo** = mexido à mão, apagado com "—" = escondido, contorno coral = selecionado; o texto só quando cabe (14 px ou mais). Clicar num bloco leva o cursor para o início dele.
- **Na prévia**: a legenda é uma camada HTML por cima do palco, **fora do efeito das transições**, com tamanhos em unidades do quadro (igual em qualquer tamanho de tela). Aparece também nas prévias das etapas Inserts (com um botão para escondê-la só ali), Transições e Áudio.

#### O que fica gravado

- `projeto.legenda = { ligada (padrão true), modo: 'palavra' | 'frase' (padrão 'palavra'), ajustes }`.
- `ajustes = { <id da palavra que começa o bloco>: { fim?: <id da última palavra>, texto?: <texto> ('' esconde), modo?: 'frase' (só nas presilhas do Separar) } }`. Os blocos em si **não** são gravados: são recalculados das palavras.
- O PUT (`/api/projetos/{id}/legenda`, campos `ligada`, `modo`, `ajustes`, `limpar`) mescla dentro da trava do projeto: dois cliques seguidos não apagam um ao outro. Texto limitado a 200 caracteres.

#### No vídeo final

- A página de render manda `__render.legenda = { blocos: [{ini, fim, texto, y}] }` (só os visíveis) ou `null` se desligada.
- `legenda.py` grava `legenda.ass` na pasta temporária da exportação: resolução do vídeo, fonte **SF Pro Display**, tamanho **66/1920 da altura** (o libass mede a fonte de outro jeito; conferido pelo OCR), **dois eventos por bloco**: a sombra (texto preto com transparência 0x55, 3/1920 da altura abaixo, `\blur` de 6/1920 da altura — 6 em 1080p, 12 em 4K) e o texto branco por cima; posição `\pos(centro, y)`; espaço entre letras `\fsp` −0,13/1920 da altura por evento; margens laterais de 6%.
- O filtro `ass` desenha o arquivo **por cima de tudo** (depois das transições). O caminho é escapado nos dois níveis do ffmpeg (o nome da exportação pode ter apóstrofo, vírgula…).
- ⏳ A SF Pro Display precisa estar instalada no Mac (`~/Library/Fonts`); sem ela, o libass usa outra fonte.

#### Ligações

- **Pré-processamento**: os cortes e a velocidade decidem as palavras e o tempo; os ajustes ficam presos às palavras (órfãos quando todas saem).
- **Direção visual**: o tipo de plano decide a altura.
- **Inserts**: a divisão de cada insert (a costura), a geometria do ator e o card do comentário ajustam a altura (`zonasDaLegenda`, relidas a cada troca de etapa).
- **Transições**: a legenda fica fora do efeito.
- **Exportação**: `_legenda` (camada 5), depois de `_transicoes`.

---

### 8.11 Página Calibragem

#### O que é

✅ A tela do app (vale para todos os projetos) onde você sobe **vídeos seus já editados** (Reels verticais). A IA descobre como cada um foi dirigido: que plano aparece em cada corte de cena, quais elementos aparecem e o que acontece em cada insert. Depois você revisa. Cada vídeo analisado vira um **roteiro de exemplo**: a fala com a marcação do que aparecia na tela, uma linha por corte de cena. É com esses roteiros que a diretora aprende. As referências analisadas também alimentam a galeria de Referências, a Heurística, o "Buscar por referências" e os pares de transição.

Ela fica em `/calibragem`, na barra de cima (**Projetos · Banco · Referências · Calibragem · Heurística da direção**).

#### Passo a passo

1. **Manual, subir:** arraste vários vídeos para qualquer lugar da tela (ela fica com um tom coral), ou use **"Adicionar vídeos ↗"** ou o card **"+ Adicionar"**. A tela aceita arquivos de vídeo (`video/*` ou `.mp4/.mov/.m4v/.webm`).
2. **Automático, conferência na entrada** (`POST /api/referencias`, vários de uma vez): cada arquivo é gravado e inspecionado.
   - É recusado, com o motivo, se não tem imagem ("não tem imagem"), se não é **vertical** ("é 1920×1080; por enquanto só vídeos verticais") ou se não dá para ler.
   - Os recusados aparecem numa caixa "N vídeo(s) não entrou:" com o motivo de cada um e um "ok" para fechar.
   - Os aceitos ganham um id a partir do nome do arquivo (com `-2`, `-3`… se repetir), uma miniatura e o status **Na fila**.
3. **Automático, a fila:** uma referência por vez. Ao reiniciar o servidor, as que estavam na fila ou no meio recomeçam, das mais curtas para as mais longas. Os passos, nesta ordem (o andamento fica em `referencia.json › analise.passos`, com status, segundos e detalhes):
   1. **proxy** ("Preparando o vídeo N%"): `proxy.mp4` em 720p. Se já existe, é reaproveitado.
   2. **transcricao** ("Transcrevendo"): extrai o `audio.wav`, acha os silêncios (`silencios.json`) e transcreve com o **motor padrão do app** (`motor_padrao`, hoje ElevenLabs). Se ele falhar, cai no Whisper + stable-ts. Grava `palavras.json` com o motor usado; se já existe, é reaproveitado.
   3. **cenas** ("Detectando cortes"): o **PySceneDetect adaptativo** acha os cortes duros no proxy, com precisão de quadro. Cortes a menos de 0,05 s do começo ou do fim são ignorados. Grava `cenas.json`. Os **trechos** são os intervalos entre cortes (trechos de até 0,02 s são descartados).
   4. **analise** ("Analisando trechos f/t", com barra de progresso no card): uma chamada ao **modelo multimodal** por trecho, **2 trechos em paralelo**.
      - **Modelo:** padrão `google/gemini-3.8-flash` via OpenRouter, chave `modelo_direcao`, em Configurações › "Modelo multimodal (Calibragem)". Raciocínio baixo, até 4.096 tokens de saída, timeout de 90 s.
      - **O que ele recebe:** "TRECHO n: de a s a b s (o vídeo tem X s)"; a transcrição **do começo do vídeo até o fim do trecho** (nada depois), em linhas com o tempo, com a fala do trecho entre `<momento_analisado>` e `</momento_analisado>` e o tempo de cada palavra; um quadro logo antes do trecho (se o trecho não abre o vídeo); e o trecho em si.
      - **O trecho em si:** por padrão, **Vídeo**: um MP4 do trecho com áudio, 640 px de altura (o Gemini amostra ~1 quadro/s e ouve). Na opção **Mosaico**: imagens 3×2 ou 3×1 de quadros com o tempo escrito no canto, de 1 a 4 quadros/s (padrão 2), no máximo 40 quadros por trecho, mais um quadro depois do trecho.
      - **O que ele devolve,** em saída estruturada (as categorias são impostas pelo esquema): `continua_anterior`, `planos[]` (tipo, texto, início, fim, marcação) e `elementos[]` (tipo, início, fim, texto, o que é).
      - O prompt manda **ignorar a legenda palavra a palavra** queimada no vídeo e não criar um lettering que é o próprio motion. Se os tempos vierem do clipe e não do vídeo inteiro, o código soma o início do trecho.
      - **Cache:** cada trecho fica em `trechos/NNN.json`, com a chave (início, fim, modelo, quadros/s, formato, grade e `VERSAO_ANALISE`, hoje 10). Trocar o modelo, o formato ou o prompt refaz os trechos; o resto é reaproveitado.
      - **Falhas:** cada trecho tem **2 tentativas**. Se um trecho falha nas duas por outro motivo que não crédito, **a referência inteira vai para Erro** ("analise: …"). Só a etapa de inserts tolera falhas.
   5. **montagem** ("Montando a direção"): o código junta tudo (`direcao.montar`).
      - Os planos ficam contíguos dentro de cada trecho, e um plano com menos de 0,1 s se junta ao anterior.
      - **Cada corte de cena vira um plano** (uma linha do roteiro). A exceção são os jump cuts do Full ator: Full ator seguido de Full ator igual se juntam.
      - Os elementos são cortados ao trecho, os de menos de 0,05 s somem, e o mesmo elemento atravessando um corte (mesmo tipo e texto, menos de 0,3 s de intervalo) vira um só.
      - O primeiro plano começa no 0 e o último termina no fim. Cada item é preso às palavras que cobre (`palavra_ini`, `palavra_fim`) e ganha uma miniatura do quadro do meio (`quadros/<id>.jpg`).
      - Grava `direcao.json` com `itens`, `itens_ia` (cópia do que a IA entregou) e `cortes`.
   6. **inserts** ("Descrevendo os inserts"): cada plano **com insert** é assistido de novo, **inteiro** (a análise só viu pedaços entre cortes), 3 por vez.
      - O modelo é o mesmo da análise (raciocínio baixo, até 2.000 tokens, timeout de 120 s). Ele recebe o nome do plano e a marcação anterior, e reescreve a **marcação**: o que acontece no insert, em ordem, sem descrever o layout. A marcação é cortada em 1.200 caracteres.
      - 💡 **Um bloco com menos de 1 s vai como imagem** (o quadro do meio, 640 px), não como vídeo: o Gemini recusa vídeos curtos assim ("Provider returned error" num insert de 0,45 s).
      - 💡 **Um bloco que falha não derruba mais a referência:** fica com a marcação que já tinha, e o passo registra `falhas: [ids]`. Só a falta de crédito interrompe.
      - Os campos de formatos antigos (`captura`, `insert`, `como_gerar`) são apagados.
4. **Automático, fim:** o status vira **A revisar**.
5. **Manual, revisar:** clique no card para abrir a revisão (`/calibragem/<id>`), corrija o que a IA errou e clique **"✓ Marcar como revisada"**.

**Erro e "Tentar de novo":** um card em **Erro** mostra a mensagem (até 3 linhas) e o botão **"↻ Tentar de novo"**. Ele recoloca a referência na fila reaproveitando o que já foi feito (proxy, transcrição e trechos já analisados com a mesma chave).

**Sem crédito:**
- Se o OpenRouter recusa por falta de crédito (o erro fala em "credit" ou "402"), a fila **pausa**. A referência atual vai para Erro com o aviso "Sem crédito no OpenRouter: a fila de análise pausou. Adicione créditos e clique em 'Tentar de novo' (o que já foi analisado é reaproveitado)."
- As próximas da fila também vão direto para Erro com o mesmo aviso, sem gastar transcrição nem análise.
- Qualquer "Tentar de novo" (ou "Reanalisar") desliga a pausa.

**Reanalisar** (na revisão): pede confirmação e põe a referência na fila **do zero na parte da IA**. Ela volta a "na fila" (sai de revisado). Os trechos em cache, `analise.json` e `cenas.json` são apagados, e o `direcao.json` atual vira `direcao.anterior.json`. O proxy e a transcrição são reaproveitados. Depois, você volta para a Calibragem.

#### O que você vê e pode fazer

**Página da Calibragem:**
- **Cabeçalho:** "Calibragem · NN vídeos" e os números "N revisada(s) · N a revisar · N na fila · N com erro". Um texto curto explica a tela; ele diz que "Só as referências revisadas ensinam a Direção visual", o que hoje não é verdade (veja as contradições).
- **Grade de cards** 9:16, dos mais novos para os mais antigos. Cada um tem a miniatura, a duração no canto e a etiqueta de status: **Na fila** · **Analisando** (com o passo atual e a barra da análise) · **A revisar** · **Revisado** · **Erro**. Embaixo, o nome e a data · resolução, ou o passo em andamento.
- **Ações no card:**
  - Clicar na capa abre a revisão (só a revisar ou revisado).
  - Ícone de **gráfico** (ao passar o mouse): abre o modal **"Roteiro dirigido"**, com o vídeo à esquerda e o roteiro decupado à direita, uma linha por plano: a bolinha da cor do plano, a marcação em amarelo e a fala, com os letterings destacados e o texto da tela quando é diferente do falado. Clicar numa linha toca aquele trecho em loop. No topo ficam o status (✓ Revisado / A revisar) e **"Abrir calibragem ↗"**. **Esc** fecha.
  - Ícone de **lixeira**: apaga a referência, com confirmação.
  - **Renomear:** dois cliques no nome ou o lápis. **Enter** salva, **Esc** cancela, até 120 caracteres. O nome aparece nos roteiros de exemplo e nas Referências.
  - **"Tentar de novo"** nos cards com erro.
- Com a fila andando, a página se atualiza sozinha a cada 1,5 s.
- **Vazia:** "Nenhuma referência ainda. Comece com 5 a 10 Reels editados que você considera bons."

**Revisão de uma referência (`/calibragem/<id>`)** — a mesma linguagem da etapa de Direção, sobre o vídeo de referência:
- **Topo:** a barra comum (com a Calibragem acesa), o nome da referência, o indicador de salvamento, **"↻ Reanalisar"** e **"✓ Marcar como revisada"**. Esse botão fica desligado enquanto há algo por salvar; depois de marcar, vira **"✓ Revisada · desmarcar"**, que volta para "a revisar".
- **Timeline à esquerda:**
  - colunas Fala · Planos-base · Elementos;
  - os **cortes de cena detectados** tracejados;
  - as miniaturas nos planos altos o bastante;
  - os mesmos botões: Dividir plano (S), + Elemento (E), Desfazer (⌘Z), −/+ zoom;
  - o mesmo arrasto de bordas e de elementos, com ímã nas palavras e nos cortes de cena (Alt desliga).
- **Vídeo no centro:** clicar toca e pausa; o botão ▶/❚❚; o tempo atual / total; as velocidades **0,5× · 1× · 2×**; e "No cursor: <plano>".
- **Detalhe à direita:** o mesmo da etapa de Direção (tipo, texto, marcação — "o que acontece no insert" nos inserts —, Ver trecho, Juntar/Excluir), mais a **miniatura** do item.
- **Atalhos:**
  - **Espaço** toca e pausa;
  - **← / →** anda 0,1 s (**Shift** 1 s);
  - **S**, **E**, **Delete/Backspace**, **⌘Z**, **⌘+/⌘−**;
  - nenhum deles vale dentro de input, textarea ou select.
- **Salvamento automático** 700 ms depois da última mudança (`PUT /api/referencias/{id}/direcao`). O servidor confere tudo (`direcao.validar_edicao`):
  - categorias fixas;
  - plano de pelo menos 0,1 s e elemento de pelo menos 0,05 s;
  - planos cobrindo do 0 ao fim, sem buraco nem sobreposição maior que 0,05 s.

  Depois ele prende tudo às palavras de novo e refaz a miniatura que ficou fora do item.

#### O que fica gravado

- `dados/referencias/<id>/`:
  - `video.<ext>` (o original), `miniatura.jpg`;
  - `referencia.json`: `id`, `nome`, `criado_em`, `formato` (vertical), `video{arquivo, nome_original, duracao, largura, altura…}`, `status` (`na_fila` | `analisando` | `a_revisar` | `revisado` | `erro`), `erro`, e `analise.passos.<passo>` (`status`, `segundos`, `progresso`, `feitos/total`, `modelo`, `tokens`, `motor`, `trechos`, `planos/elementos`, `blocos`, `falhas`, `reaproveitado`);
  - os arquivos dos passos: `proxy.mp4`, `audio.wav`, `silencios.json`, `palavras.json` (`motor`, `palavras`), `cenas.json` (`cortes`), `trechos/NNN.json` (`chave` + `analise`), `analise.json` (`modelo`, `trechos`);
  - `direcao.json`: `itens` (revisados), `itens_ia` e `cortes`; cada item tem `id`, `camada`, `tipo`, `conteudo` (null), `inicio`, `fim` (em segundos), `descricao`, `texto`, `miniatura`, `miniatura_t`, `palavra_ini` e `palavra_fim`;
  - `direcao.anterior.json` (depois de um Reanalisar) e `quadros/<id>.jpg`.
- **Rotas:**
  - `GET/POST /api/referencias`
  - `GET /api/referencias/{id}`
  - `POST /api/referencias/{id}/analisar?refazer=`
  - `GET /api/referencias/{id}/revisao`
  - `PUT /api/referencias/{id}/direcao`
  - `PUT /api/referencias/{id}/status {revisado}`
  - `PUT /api/referencias/{id}/nome`
  - `DELETE /api/referencias/{id}`
  - `GET /api/referencias/{id}/roteiro`
- **Configurações › Direção visual:**

  | Chave | Padrão | O que é |
  |---|---|---|
  | `modelo_direcao` | `google/gemini-3.8-flash` | o modelo multimodal |
  | `formato_analise` | `video` (ou `mosaico`) | como a IA vê cada trecho |
  | `grade_mosaico` | `3x2` (ou `3x1`) | a grade do mosaico |
  | `quadros_por_segundo` | 2 (de 1 a 4) | só vale no mosaico |

#### No vídeo final

Não entra direto no vídeo. Entra pela **Direção do projeto**: os roteiros de exemplo vão inteiros para a diretora e a corretora.

#### Ligações

- **Roteiros de exemplo** (Heurística e prompt da diretora): entram **todas** as referências com status a revisar ou revisado. Hoje não há filtro por revisada.
- **Referências** (galeria) e **Buscar por referências:** os planos das referências analisadas.
- **Transições:** os pares de planos vistos nas referências.
- **Presets:** os presets criados a partir de trechos aparecem marcados nos cards.
- O lettering das referências vai para a fala do roteiro (`<lettering>…</lettering>`): uma palavra é do lettering se o meio dela cai dentro do intervalo do elemento.

---

### 8.12 Página Referências

#### O que é

✅ A página `/referencias`: uma galeria de **todos os planos-base** identificados nos vídeos já analisados da Calibragem (a revisar ou revisados), cada um como um clipe que toca sozinho. Serve para ver de verdade como cada tipo de plano foi usado, comparar e marcar **favoritos**. A caixa de busca do topo saiu desta página (pedido de Rodrigo, out/2026); a busca continua no "Buscar por referências".

#### Passo a passo

1. **Automático:** ao abrir, a página pede `GET /api/referencias/clipes`. O servidor monta, para cada plano de cada referência analisada, os seus dados (`direcao.clipes`):
   - a duração e a posição (tempo, % do vídeo, "plano N de M");
   - **como ele entra na fala**: numa pausa (≥ 150 ms sem fala), entre palavras coladas, no meio de uma palavra ou depois que a fala acabou; no começo ou no meio de uma frase; a quantos ms da palavra mais próxima;
   - as palavras e as palavras por minuto (só com 2 s ou mais e 3 palavras ou mais);
   - o plano anterior e o seguinte;
   - os elementos dentro dele;
   - e se é favorito.

   Para cada vídeo de origem, monta um resumo: duração, todos os planos e quanto do tempo cada categoria ocupa.
2. **Automático:** a página também carrega a lista de presets, para marcar os clipes que já viraram preset.
3. **Manual:** você filtra, ordena, passa o mouse para ver, abre o modal e favorita.

#### O que você vê e pode fazer

- **Topo:** a barra comum e, à direita, a contagem "N clipes" visíveis.
- **Segunda barra:**
  - **★ Favoritos** (com o total): mostra só os favoritos.
  - **Chips das categorias, agrupados** (cada um com ícone e contagem): **Todos** (grade) · **Tela dividida** (duas faixas; insert e motion) · **Tela cheia** (celular; insert e motion) · **Full ator com lettering** (T) · **Full ator** (pessoa) · e por último **Comentário + insert + ator** (balão). Uma categoria nova, fora dos grupos, vira um chip próprio antes do Comentário.
  - **"Agrupar insert e motion"** (marcado por padrão, lembrado neste navegador): desmarcado, os grupos se separam em **Tela dividida · insert**, **Tela dividida · motion**, **Tela cheia · insert** e **Tela cheia · motion**. Trocar volta o filtro para Todos.
  - **"Ignorar Full ator"** (marcado por padrão, lembrado neste navegador): esconde os planos em que só o ator fala (Full ator e Full ator com lettering), e os chips deles somem. Se um desses chips estava selecionado, volta para Todos.
  - **"Só revisadas":** só os planos de referências marcadas como revisadas.
  - **Ordenar:** **Aleatório** (padrão; o sorteio é feito uma vez por clipe enquanto a página está aberta, então favoritar não embaralha) · **Mais longos** · **Mais curtos** · **Por vídeo** (nome do vídeo, depois tempo).
- **Grade de 8 clipes por linha.** Cada card mostra:
  - a miniatura 9:16; ao passar o mouse, o próprio trecho toca **mudo, em loop**;
  - o chip colorido do tipo;
  - o selo **"preset"** se algum preset foi feito a partir desse trecho (o trecho do preset cabe no clipe, com 0,5 s de folga);
  - a duração e **"✓ revisado"**;
  - embaixo: vídeo de origem · início, o texto entre aspas (se houver) e a marcação (2 linhas);
  - a **estrela** no canto (aparece ao passar o mouse; fica fixa quando ligada). Ela liga e desliga o favorito na hora e volta se o servidor recusar.
- Mensagens: "Nenhum clipe ainda. Suba vídeos editados em Calibragem…" ou "Nenhum clipe com esses filtros."

**Modal do clipe** (clicar no card):
- **Este trecho** (em loop, com som; se o navegador barrar o som, toca mudo) ou **Vídeo de origem** (o vídeo inteiro a partir do começo do plano). O player tem controles.
- **Cabeçalho:**
  - o chip do tipo, "✓ revisado" e "N de M" (a posição na lista filtrada);
  - **"Virou preset"** ou "N presets", com link para `/presets`;
  - **Favoritar/Favorito**;
  - fechar.
- O **texto** em destaque, se houver, e a **Marcação**.
- **Dados:** Duração · Onde no vídeo (início → fim, %, "plano N de M") · Entra (numa pausa / entre palavras / no meio de uma palavra; no começo ou no meio de uma frase; "X ms antes/depois de 'palavra'"; ou "abre o vídeo") · Fala no trecho (palavras e palavras/min) · Vem depois de (tipo e duração, ou "— (abre o vídeo)") · Vai para (ou "— (fecha o vídeo)").
- **Elementos dentro do plano:** tipo, texto e início.
- **Fala:** a fala do trecho.
- **Vídeo de origem:** nome, duração, nº de planos, link **"abrir na calibragem ↗"** e as barras de quanto do tempo cada categoria ocupa.
- **Faixa de planos** do vídeo de origem, embaixo, na largura do modal: todos os planos coloridos, este destacado com borda amarela, mais a cabeça de reprodução. Clicar leva o vídeo de origem para aquele ponto.
- **Teclas:** **← / →** clipe anterior e seguinte (na ordem filtrada) · **F** favorita · **Espaço** toca e pausa · **Esc** fecha.

#### O que fica gravado

- **Favoritos:** `dados/referencias/_favoritos.json`, uma lista de `{ref, inicio, fim, criado_em, tipo, conteudo, descricao, texto}`.
  - O favorito é identificado pela referência e pelo **intervalo** (com tolerância de 0,05 s), não pelo id do plano, que muda ao reanalisar.
  - O resto é uma cópia do plano no momento em que você favoritou.
  - Rota: `PUT /api/referencias/{id}/favorito {inicio, fim, favorito}`.
- **Preferências do navegador:** "Ignorar Full ator" (`referencias.semFullAtor`) e "Agrupar insert e motion" (`referencias.agruparMotion`), as mesmas do "Buscar por referências".
- O resto é só leitura: `GET /api/referencias/clipes` devolve `clipes`, `origens`, `categorias` e `elementos`.

#### No vídeo final

Nada direto. 💡 Os favoritos foram pensados como as **preferências** de Rodrigo para guiar as IAs, mas hoje nenhuma IA os lê (nem a diretora, nem a corretora, nem as regras sugeridas).

#### Ligações

- Vem da **Calibragem** (análise e revisão).
- Divide os componentes (Chip, Cartão, grupos, "Ignorar Full ator", "Agrupar") com o **Buscar por referências**.
- Os selos de preset vêm de **Presets**.
- Os links levam para a revisão da Calibragem.

---

### 8.13 Página Heurística da direção

#### O que é

✅ A página `/heuristica`: o documento que a **diretora e a corretora leem inteiro**. Ele tem duas partes:
- **As regras** (texto Markdown que você edita), com duas seções:
  - **`## Regras do criador`**: suas, obrigatórias. A IA nunca mexe nelas.
  - **`## Regras sugeridas pela IA`**: a IA escreve a partir dos roteiros, e você mantém, edita ou apaga.

  Cada seção pode ter uma subseção **`### Inserts`**: como escrever a marcação dos inserts (o que aparece, como entra, zooms, destaques, trocas; nunca o layout).
- **Os roteiros de exemplo:** os vídeos analisados na Calibragem, escritos como roteiro dirigido. Eles são montados na hora a partir da análise; não se editam aqui.

Hoje (`_heuristica.json`), as Regras do criador têm 4 regras gerais: não começar com o ator em tela cheia; vídeo de dúvida começa com Comentário + insert + ator; gancho visual nos primeiros segundos; nunca mais de 3–4 s de Full ator seguido. Têm também 3 regras em `### Inserts`. As sugeridas pela IA são 4 regras, geradas com 6 vídeos em 06/10/2026, sem subseção de Inserts.

#### Passo a passo

1. **Automático, ao abrir:** `GET /api/referencias/heuristica` devolve as regras, a data e o nº de vídeos da última sugestão, se há uma versão anterior e os roteiros de todas as referências analisadas.
   - Na primeira leitura, formatos antigos são **migrados** sozinhos: o documento com padrões, o catálogo em JSON e o campo "Regras da direção" das Configurações (`regras_direcao`) viram a seção "Regras do criador".
2. **Manual, editar as regras:** troque para **Editar**, mexa no texto e saia do campo. Grava sozinho (`PUT`, até 20.000 caracteres), com "✓ Salvo" por 1,5 s.
3. **Manual, "Sugerir regras com IA":** confirma ("A IA lê os roteiros e refaz as 'Regras sugeridas pela IA'. As suas regras ficam como estão, e a versão atual é guardada (dá para voltar)."). Enquanto roda, o botão mostra "Lendo os roteiros…".
4. **Automático, a sugestão** (`calibragem.sugerir_regras`):
   - **Modelo:** o "Modelo da formatadora" (`modelo_direcao_projeto`, padrão `google/gemini-3.8-flash`), raciocínio médio, temperatura 0,3, até 4.000 tokens, saída estruturada.
   - **O que recebe:** as Regras do criador (para não repeti-las), o "Sobre o criador" e **todos os roteiros**.
   - **O que devolve:** de **2 a 5 regras de direção** e de **2 a 5 regras de inserts**, no imperativo, uma frase cada.
   - **Onde grava:** o código reescreve **só** a seção "Regras sugeridas pela IA", com as regras em lista e as de inserts embaixo de `### Inserts`. Guarda o documento anterior em `anterior`, mais o nº de `videos` e `gerado_em`. Sem nenhuma referência analisada, responde "Nenhuma referência analisada para sugerir regras".
5. **Manual, "↺ Voltar às regras anteriores":** aparece quando existe uma versão anterior. Troca as regras atuais pelas anteriores e guarda as atuais como "anterior", então clicar de novo volta e a troca vai e vem.
6. **Automático, uso:** a cada geração ou correção de direção, `calibragem.documento` monta: as regras + `## Roteiros de exemplo` + uma frase de explicação + um `### <nome do vídeo>` por referência, cada bloco com `[plano: marcação + elementos]` e a fala com `<lettering>`.

#### O que você vê e pode fazer

- **Cabeçalho:** "Heurística da direção", **"Sugerir regras com IA"**, **"↺ Voltar às regras anteriores"** (quando houver) e "✓ Salvo".
- Um texto curto explicando que o diretor lê tudo e que, para corrigir uma marcação, você abre a calibragem do vídeo.
- **Regras:** o seletor **Ler** (o Markdown formatado) / **Editar** (uma caixa de texto monoespaçada que grava ao sair).
- **Roteiros de exemplo:** "N vídeo(s) · N linhas. Clique numa linha para assistir àquele trecho." Cada vídeo é uma sanfona com o nome, "N linhas · ✓ revisado" e **"abrir calibragem ↗"**. Aberto, mostra as linhas do roteiro: a bolinha da cor do plano, a marcação e a fala com os letterings destacados. Clicar numa linha abre um player com o trecho **em loop**, a marcação e a fala. **Esc** ou um clique fora fecha.

#### O que fica gravado

- `dados/referencias/_heuristica.json`: `regras` (o Markdown das duas seções), `anterior` (o documento antes da última sugestão ou do último Voltar), `videos` e `gerado_em`.
- `dados/referencias/_heuristica_captura.antiga.json`: a antiga heurística de captura, só guardada.
- Os roteiros **não** são gravados aqui: vêm de `direcao.json` + `palavras.json` de cada referência.
- **Rotas:**
  - `GET|PUT /api/referencias/heuristica`
  - `POST /api/referencias/heuristica/sugerir`
  - `POST /api/referencias/heuristica/voltar`

#### No vídeo final

Indiretamente: é o "manual de estilo" que a diretora e a corretora seguem.

#### Ligações

- Os roteiros vêm da **Calibragem**: corrigir uma marcação na revisão muda o roteiro na hora.
- O documento vai inteiro para a **Direção do projeto**, tanto para a diretora quanto para a corretora.
- O modelo da sugestão é configurado em **Configurações › Direção visual**.

---

### 8.14 Buscar por referências (modal da etapa Inserts)

#### O que é

O mesmo acervo da galeria de Referências, aberto **de dentro da etapa Inserts**, para ver como planos parecidos foram feitos nos seus vídeos. Fica no botão amarelo **"🔍 Buscar por referências"**, no topo da coluna da esquerda dos Inserts.

#### Passo a passo

1. **Manual:** com um plano selecionado nos Inserts, clique em "Buscar por referências".
2. **Automático:** abre um modal de tela cheia, **já filtrado pelo grupo do plano selecionado**. Por exemplo, num `tela_dividida_insert`, abre no chip "Tela dividida" (ou "Tela dividida · insert", com o agrupamento desligado).
3. **Manual:** filtre, busque, passe o mouse (o trecho toca mudo) e clique num card. Ele abre ao lado, com som, em loop.

#### O que você vê e pode fazer

- **★ Favoritos** (só favoritos), **Todos** e os mesmos chips agrupados, com contagem.
- **"Agrupar insert e motion"** e **"Ignorar Full ator"**: as mesmas caixas da página Referências, lembradas juntas. Trocar o agrupamento volta para o grupo do plano.
- **Caixa de busca** "Buscar na marcação, no texto ou na fala": procura na marcação, no texto, na fala e no nome do vídeo, sem diferenciar acentos.
- **Grade de cards** (os mesmos da galeria, com a estrela para favoritar), em ordem aleatória sorteada uma vez.
- **Painel do trecho aberto, à direita:** o tipo, a duração, o vídeo com som e controles em loop, o vídeo de origem · início, o texto, a marcação, a fala e o X para fechar.
- **Esc** fecha o modal.
- O botão **"+ Usar como referência"** existe no componente, mas só aparece quando quem abre passa a função `usar`. A etapa Inserts não passa, então ali ele não aparece.

#### O que fica gravado

Só os favoritos (a mesma rota e o mesmo arquivo da galeria) e as duas caixas lembradas no navegador. A busca e os filtros não são gravados.

#### Ligações

- Usa os dados das **Referências** (`GET /api/referencias/clipes`) e os componentes de `paginas/Referencias.tsx`.
- O grupo inicial vem do tipo do plano selecionado nos **Inserts**, que vem da **Direção**.

### 8.15 Página Banco

#### O que é

✅ O banco de mídias **global** (fora dos projetos): os vídeos e imagens que os inserts e os motions de todos os projetos usam. A IA descreve cada mídia ao subir, para achar depois. Página **Banco** na barra de cima (`/banco`; `frontend/src/paginas/Banco.tsx`; backend `backend/app/banco.py`).

#### Passo a passo

1. **(manual)** Arraste vários arquivos para **qualquer lugar da página** (o fundo fica coral) ou use **Adicionar mídias** (canto de cima) / o card **Adicionar**.
2. **(automático)** Cada arquivo vira um item: o original como veio, a versão leve para tocar (vídeo: lado maior até 1280, H.264 CRF 23, quadro-chave a cada 12 quadros) e a miniatura (vídeo: 360 px de altura, tirada em 1 s ou no meio; imagem: até 640 px de largura). Tipo pela extensão; formato pela proporção real.
3. **(automático, em segundo plano)** A IA descreve (o modelo da análise das referências, vendo uma versão leve: até 120 s do vídeo): descrição e palavras-chave sugeridas. Não apaga o que você escreveu; a dela fica em `descricao_ia`. Descrições interrompidas por um reinício voltam para a fila. Enquanto alguma está descrevendo (ou um original está sendo cortado), a página se atualiza a cada 3 s.
4. **(manual)** Clique numa mídia para abrir o detalhe e corrigir nome, descrição e palavras-chave.
5. **(manual, opcional)** Em "Editar vídeo", marque trechos ou corte o original.

#### O que você vê e pode fazer

- **Cabeçalho:** barra de cima e **Adicionar mídias ↗** ("Enviando N…" durante o envio).
- **Filtros:** **Todos · Vídeos · Imagens**, cada um com a contagem; à direita, "IA descrevendo N · " e quantas mídias estão à vista. **A caixa de busca saiu da página** (pedido de Rodrigo, out/2026); a busca continua no "Escolher do banco" dos inserts.
- Texto de ajuda: "Os vídeos e imagens dos inserts, de todos os projetos…" e o total ("Banco · 23 mídias").
- **Grade de 6 colunas**, os mais novos primeiro; o 1º card é **Adicionar** ("Vídeos e imagens, vários de uma vez"). Só aparecem os **originais**. Cada card:
  - miniatura 16:9 (a mídia inteira, sem cortar); um vídeo **toca mudo com o mouse em cima**;
  - selo "Vídeo · 16:9" (azul) ou "Imagem · 1:1" (menta), a duração, o selo coral **"N trechos"**, e "cortando o original…" por cima enquanto corta;
  - nome e, embaixo, o estado da IA ("descrição na fila", "descrevendo…", "a descrição falhou", "sem descrição") ou as 2 primeiras linhas da descrição;
  - lixeira ao passar o mouse: "Apagar “nome” do banco? Os inserts que a usam ficam sem ela."
- **Detalhe** (janela por cima; Esc ou clicar fora fecha):
  - à esquerda, o vídeo com controles (mudo) ou a imagem;
  - selo do tipo e formato; **Dimensões**, **Duração**, **Origem** (Upload com o nome do arquivo · Captura de site com a URL · Captura automática), **Entrou em**;
  - **Nome**, **Descrição**, **Palavras-chave** (separadas por vírgula; até 30) e **Salvar** (aceso só com mudança);
  - **Descrever de novo** (a IA vê de novo e sugere; não apaga o que você escreveu);
  - **Editar vídeo** (só vídeo; abre o editor de vídeo, aba Trechos ou Cortar o original);
  - **Apagar** (avisa em quantos inserts está e tira de todos; apaga junto os trechos);
  - "Cortando o original…" / "O corte falhou: …";
  - **Trechos · N**: miniatura, nome, duração e "em N" inserts; clicar abre o editor; sem trechos: "Nenhum. Em “Editar vídeo”, marque trechos…";
  - **Descrição da IA** (ou o estado dela);
  - **Usada em · N**: cada insert que usa a mídia (nome do projeto e a fala), com link para o projeto.

**Trechos** (no banco em geral): itens filhos (`pai`, `inicio`, `fim`), **virtuais**: sem arquivo próprio, tocam o original; herdam dele descrição, palavras-chave, formato e dimensões. Mínimo de 0,2 s. Na grade só aparecem os originais; no "Escolher do banco", cada original mostra os trechos logo abaixo. Apagar o original apaga os trechos.

#### O que fica gravado

- `dados/banco/<id>/` (id de 10 hex): `original.<ext>`, `proxy.mp4` (vídeo), `miniatura.jpg`, `item.json` com `nome`, `descricao`, `palavras`, `descricao_ia`, `tipo` (video · imagem), `formato` (o mais próximo entre 16:9 · 16:10 · 4:3 · 1:1 · 4:5 · 3:4 · 9:16 · alto), `largura`, `altura`, `duracao`, `origem`, `criado_em`, `ia {status, erro}`, `edicao {status, erro}` (corte do original).
- Um trecho: `item.json` só com `pai`, `inicio`, `fim`, `nome`.
- Aceita MP4, MOV, M4V, WebM, PNG, JPG/JPEG, WebP (outras extensões dão erro).
- **Usos** não são guardados: são calculados lendo os projetos.
- Rotas: `GET /api/banco?busca=&tipo=` (originais, cada um com os trechos; a busca olha também o nome dos trechos), `POST /api/banco` (multipart `arquivos`), `GET|PUT|DELETE /api/banco/{id}` (num trecho, o PUT aceita `inicio`/`fim`), `POST /api/banco/{id}/trechos {inicio, fim, nome}`, `POST /api/banco/{id}/cortar {inicio, fim}`, `POST /api/banco/{id}/descrever`, `GET /api/banco/{id}/arquivo[?qualidade=exportacao]`, `GET /api/banco/{id}/miniatura`, `GET /api/banco/{id}/tira`.

#### No vídeo final

- A exportação usa o vídeo em resolução original (`?qualidade=exportacao`: uma cópia com quadro-chave a cada 6 quadros, CRF 14, sem áudio, feita na 1ª vez), não a versão leve. Imagens: o original.

#### Ligações

- **Etapa Inserts** (subir, escolher, capturar, editar trechos), **Motions** (vídeo e imagem), **Simulação da página Presets** (os vídeos do banco servem de mídia de amostra, separados pela proporção).
- ⏳ Próximos: categorizar o banco; a IA sugerir mídias para cada insert pelas descrições; captura automática por tipo.

---

### 8.16 Página Presets

#### O que é

✅ A revisão da biblioteca de presets de enriquecimento (`/presets`, barra de cima, à direita; `frontend/src/paginas/Presets.tsx`, `presets/CardPreset.tsx`, `Avaliacao.tsx`, `OrdemPresets.tsx`, `Simulacao.tsx`). Aqui você vê cada preset ao lado da referência de onde veio, aprova ou descarta, simula em outras situações, marca onde vale, escolhe os ajustes rápidos e os sons, e monta os recomendados.

#### Passo a passo

1. **(manual)** Abra Presets. Os "a revisar" vêm primeiro.
2. **(manual)** Clique na miniatura: referência e recriação tocam juntas em loop.
3. **(manual)** Abra a engrenagem para avaliar: simule, marque o "Vale em", escolha os ajustes rápidos e os sons; corrija a receita se precisar.
4. **(manual)** **Aprovar** (no card ou no título do modal). Só aprovados aparecem no Enriquecimento.
5. **(manual, opcional)** **Recomendados**: ordene e favorite por situação.
6. Um preset ruim: **Descartar** ou pedir ao Claude para refazer.

#### O que você vê e pode fazer

- **Barra de filtros:** **Todos · A revisar · Aprovados** e **Qualquer nº de mídias · 1 mídia · 2 mídias · 3 ou mais** (cada um com a contagem); à direita, **★ Recomendados**.
- Sem presets: "Nenhum preset ainda. Mande ao Claude o trecho de uma referência (ou um print) e ele monta o preset."
- **Grade** (cards a partir de 340 px), no estilo dos cards da Home. Cada card:
  - a miniatura junta **Referência** e **Recriação** lado a lado, paradas no repouso (depois da última entrada); selo **Aprovado** (menta) ou **A revisar** (coral);
  - **clicar toca as duas em loop**, em sincronia (a recriação segue o relógio do vídeo de referência; tocando, o card da recriação mostra o próprio vídeo da referência recortado onde o card estava, a não ser que o card mude de tamanho). Um preset toca por vez; fora da tela, para; o vídeo só carrega tocando;
  - título; "Tela cheia e dividida · 1 mídia · <referência> 0:21" (ou "2 ou mais mídias"); "ref 1 / ref 2" quando o preset veio de mais de uma referência;
  - ícones: **✓ Aprovar / tirar a aprovação**, **Descartar** (confirmação: "os inserts que o usam voltam ao manual"), **engrenagem**.
- **Modal da engrenagem** (quase a tela toda):
  - título: o **nome** (dois cliques para renomear; Enter grava, Esc cancela) e o botão **Aprovar / Aprovado**;
  - à esquerda (504 px): a miniatura (Referência | Recriação, ou **Simulação**), **Simular**, **Vale em**, **Sons**;
  - à direita, em duas colunas: **Ajustes rápidos** (para experimentar na simulação, com "Salvar como padrão do preset") e o editor da receita (Tempo, Movimento contínuo, Zoom na mídia, Onde fica, Entrada, Saída; o seletor da mídia em edição). (O "Aparece em" e o "Na tela dividida" não aparecem neste modal; ficam na engrenagem do Enriquecimento, na etapa Inserts.)
  - **R** recomeça o trecho e os vídeos da simulação. Simulando, o loop é só o do efeito (até 5 s). Fechar o modal para a prévia e os sons.
- **Simular:** **Original** (como na referência) e as telas em que o preset vale (Tela dividida · Tela cheia · Ator embaixo); os números de mídias em que vale; as proporções (1 mídia: 9:16 · 1:1 · 4:3 · 16:9; várias: Todas 9:16 · 9:16 + horizontais · Só horizontais), só as permitidas pelo "Vale em". A metade "Recriação" vira **Simulação**: o quadro inteiro com o ator, pelas mesmas contas do editor, na posição de fábrica (janela no "ator embaixo"; na tela dividida, o ator descendo metade do insert, sem rosto). As mídias são vídeos do Banco com a proporção certa; o ator é o vídeo do projeto mais recente com a pessoa recortada.
- **Vale em:** chips dos modos de tela, dos números de mídias e das proporções (9:16 · Quadrada · Horizontal). Numa receita que não repete, "3 ou mais" vira "3 mídias" (ou "3 a N mídias") e um número que ela não comporta fica apagado. Precisa ficar ao menos uma tela, um número e uma proporção. Embaixo, **Ajustes na edição do insert**: os chips de cada ajuste rápido (menos o Som, que aparece sozinho quando o preset tem som).
- **Sons:** o card de sons do §8.6.
- **Recomendados** (modal quase a tela toda, "Recomendados por situação"):
  - à esquerda, as situações por tela (Tela dividida · Tela cheia · Ator embaixo) × (1 mídia 9:16 · 1 mídia horizontal · 2 mídias · 3 ou mais), cada uma com quantos presets valem e "★N" favoritos;
  - à direita, "<tela> · <situação> · N/3 favoritos", **Limpar a ordem** (volta a uma lista só) e a grade de **6 por linha** com os aprovados que valem na situação: a prévia na situação, tocando ao passar o mouse; número de ordem; as proporções em que vale;
  - **arrastar** reordena: a grade mostra onde vai cair (o card fica tracejado no lugar novo e os outros abrem espaço); soltar entre os favoritos o torna favorito (o último sai);
  - **estrela** favorita até 3 (sempre no começo); com 3, a estrela dos outros fica apagada ("Já há 3 favoritos: tire um antes").

#### O que fica gravado

- Tudo na biblioteca global: `dados/presets/<id>.json` (nome, aprovado, receita, formato/formatos, divisao_tipo, usos, rapidos) e `dados/presets/ordem.json`. Rotas no §8.4.
- Descartar apaga o arquivo e tira o preset da ordem de todas as situações.

#### No vídeo final

Nada direto: a página só muda presets; o que muda no vídeo é o que os inserts que usam o preset passam a mostrar.

#### Ligações

- **Enriquecimento (§8.4):** só os aprovados aparecem; os recomendados ficam em cima.
- **Referências:** o selo "preset" nos trechos que viraram preset, e "Virou preset" no player (com link para esta página).
- **Banco e projetos:** as mídias e o ator da simulação.
- **Claude Code:** quem cria e refaz os presets (`presets.criar`, `ferramentas/preset_tira.py`, a página `/render/preset` para comparar quadro a quadro).

---

### 8.17 Página Motions

#### O que é

✅ A galeria dos presets de motion (`/motions`, link com ícone na barra de cima; `frontend/src/motions/PaginaMotions.tsx`). Só para ver: para usar, escolha o preset num plano de motion na etapa Inserts.

#### Passo a passo

1. Abra Motions.
2. Escolha **Tela cheia** ou **Tela dividida**.
3. Passe o mouse num preset para vê-lo tocar.

#### O que você vê e pode fazer

- Linha de cima: "N presets · passe o mouse para tocar · para usar, escolha num plano de motion na etapa Inserts" e o seletor **Tela cheia · Tela dividida**.
- Grade (cards a partir de 220 px na tela cheia, 300 px na dividida): a miniatura parada no instante que o preset pede (padrão: 80% da duração) e **tocando em loop com o mouse em cima**, no fundo sugerido; o **nome**, a **descrição** e, embaixo, os **campos** e a **duração** ("O que é digitado · 2,6 s").

#### O que fica gravado

Nada: a página só lê os presets (`GET /api/motions/presets`).

#### No vídeo final

Nada direto.

#### Ligações

- **Etapa Inserts / Motions (§8.5):** onde os presets são usados.
- Os presets são arquivos em `frontend/public/motion/presets/`, escritos pelo Claude a partir das referências.

### 8.18 Configurações

#### O que é
As **preferências do app** (`paginas/Configuracoes.tsx`), num diálogo com abas por etapa. Não são do projeto: valem para o app todo, para os próximos cálculos e os próximos projetos.

#### Passo a passo
1. **Abrir:** a engrenagem na tela de projetos (abre em **Geral**) ou no topo do editor. No editor, **abre na aba da etapa em que se está**: **Cortes** no Pré-processamento, **Direção visual** na Direção visual e **Geral** nas outras (pedido de Rodrigo, out/2026).
2. **Mudar um campo:** cada mudança é **gravada na hora** (`PUT /api/config`) em `dados/projetos/_config.json`. Escolhas de lista e botões salvam no clique; campos de texto e números salvam ao sair do campo ou com Enter. Aparece "✓ Salvo como padrão do app. Vale também depois de reiniciar."; um erro aparece em vermelho.
3. 💡 Um campo numérico **vazio não salva** (virar 0 desligaria o corte de pausas sem querer). Valores fora da faixa são presos aos limites no servidor; um arquivo ausente ou ilegível volta aos padrões.

#### O que você vê e pode fazer

**Geral**
- **Sobre o criador** (texto, até 1.000 caracteres, opcional; salva ao sair do campo): quem grava os vídeos e do que o canal fala. Vai como contexto para as IAs: no prompt dos cortes (antes da transcrição) e no da direção visual (fim do prompt de sistema). É o que mantém o app sem nome de pessoa fixo nos prompts.

**Cortes**
- **Motor de transcrição — Padrão para novos projetos**: a lista dos 8 motores (padrão de fábrica: **ElevenLabs Scribe v2**). Um motor que precisa de chave mostra " — sem chave de API" e o aviso de que, sem a chave em `backend/.env`, o projeto segue com Whisper + stable-ts; com a chave, "Chave de API encontrada. O áudio é enviado ao serviço externo." Não muda projetos existentes.
- **Margens do corte**:
  - **Antes do corte** (ms; padrão 100; 0 a 1.000, de 10 em 10): ar que fica **depois** da última palavra de cada trecho mantido;
  - **Depois do corte** (ms; padrão 100; 0 a 1.000): ar que fica **antes** da primeira palavra do trecho seguinte.
- **Pausas longas — Cortar pausas maiores que** (em segundos; padrão 2; 0 a 30, de 0,1 em 0,1; **0 = nunca cortar pausas dentro de um trecho**). O texto lembra que o detector só enxerga silêncios de pelo menos 0,3 s.
- Margens e pausas valem para cortes novos, "Refazer cortes" e "Recalcular"; não alteram sozinhas os trechos já montados.

**Direção visual**
- **Modelo multimodal (Calibragem)** (texto, nome como no openrouter.ai; padrão `google/gemini-3.8-flash`): quem analisa os trechos das referências. Trocar faz a próxima análise refazer os trechos.
- **Diretora (projetos)**: o modelo (padrão `google/gemini-3.8-flash`) e o **raciocínio** (Baixo · **Médio** · Alto) de quem escreve o roteiro dirigido do vídeo novo.
- **Modelo da formatadora (projetos)** (padrão `google/gemini-3.8-flash`, só texto): transforma o roteiro da diretora nos campos e sugere as regras da heurística.
- **Como a IA vê cada trecho**: **Vídeo** (padrão; o trecho como clipe com áudio, ~1 quadro/s em resolução reduzida, o mais barato) ou **Mosaico** (quadros com o tempo escrito, vários por imagem; enxerga detalhes pequenos, custa mais). Trocar faz a próxima análise refazer os trechos.
- **Mosaico** (só com Mosaico): a grade **3 × 2** (padrão, 6 quadros menores) ou **3 × 1** (3 maiores) e **1/s · 2/s · 3/s · 4/s** (padrão 2/s); trechos longos ficam com no máximo 40 quadros.

#### O que fica gravado
`dados/projetos/_config.json` (um arquivo só, para o app todo):
- `perfil_criador`;
- `motor_padrao`, `antes_do_corte_ms`, `depois_do_corte_ms`, `pausa_max_ms`;
- `modelo_direcao`, `modelo_diretora`, `raciocinio_diretora` (`low` · `medium` · `high`), `modelo_direcao_projeto`, `formato_analise` (`video` · `mosaico`), `grade_mosaico` (`3x2` · `3x1`), `quadros_por_segundo` (1 a 4).
- 💡 O mesmo arquivo guarda chaves de outras áreas sem aba aqui (ex.: `entradas`, as entradas e saídas dos inserts sem preset, gravadas por `entradas.py`) e algumas antigas (`regras_direcao`, migrada para a heurística). Chaves antigas (`respiro_ms`, as do agente automático de inserts, `formato_quadros`) são descartadas ao ler.
- 💡 O **modelo da seleção de cortes** não está nas Configurações: vem de `OPENROUTER_MODEL` em `backend/.env` (padrão `google/gemini-3.8-flash`). As chaves de API também ficam no `.env`.

#### No vídeo final
Indireto: o motor e as margens definem os cortes; os modelos da direção definem os planos. Mudar uma configuração não refaz nada sozinho; vale no próximo cálculo.

#### Ligações
- **Geral** → prompts dos cortes e da direção.
- **Cortes** → pipeline (motor dos projetos novos), montagem dos clipes, "Refazer cortes" e "Recalcular".
- **Direção visual** → Calibragem (análise das referências) e direção do projeto.

⏳ Na P4 a legenda desvia da costura da tela dividida, da janela do "ator embaixo" e da caixinha de comentário, mas não do conteúdo dos inserts em tela cheia e dos motions (só existe desenhado na hora): a decidir com Rodrigo. Destaques: as referências não têm (nenhuma palavra muda de cor nem de tamanho). Detalhe em [legenda.md](docs/legenda.md).

## 9. Timeline e ligação entre etapas

✅ A timeline nasce **multitrilha**: V1 (o ator), V2 (inserts), V3 (motion), LEG (legenda) e o áudio (a voz, os sons dos presets, as transições e o fundo). Cada etapa mostra as trilhas que lhe interessam.

✅ Tudo que vem depois dos cortes (inserts, motion, legendas) fica **preso às palavras** da transcrição, não a segundos. Ao mexer no corte, esses itens acompanham a fala. Se as palavras de um item forem removidas, ele fica marcado como **órfão** para Rodrigo decidir.

💡 Ancoragem: `{ "palavra_ini": "w00051", "palavra_fim": "w00060", "off_ini": -0.08, "off_fim": 0 }` (deslocamentos em segundos a partir do começo da primeira e do fim da última palavra). A posição na saída é sempre calculada, nunca guardada. Vale para os planos da direção (e, por eles, inserts, motions e transições) e para os blocos da legenda.

## 10. Desfazer e versões

✅ Toda ação, de Rodrigo ou do agente, entra numa pilha de histórico, com Ctrl+Z / Ctrl+Shift+Z.
✅ Versões nomeadas podem ser salvas e restauradas (ex.: "antes do agente mexer").
💡 Cada entrada do histórico guarda autor (`criador` ou `agente`), etapa, descrição curta e um snapshot da timeline. O snapshot é JSON pequeno, então é mais simples do que guardar diffs.

## 11. Agente

✅ **Adiado para depois da fase 4** (decisão de Rodrigo). 💡 O chat simulado (respostas prontas, só nas etapas que eram mock) saiu na F0, com as trilhas falsas (V2, V3, LEG) do editor; os históricos (`chats`) continuam no projeto, por etapa. Quando vier:
✅ **Um agente só**, LangChain. O prompt de sistema e as ferramentas mudam conforme a etapa aberta. Cada etapa tem seu próprio histórico de chat, salvo no projeto.
✅ O agente enxerga o estado do projeto (briefing, transcrição, timeline). Tudo que ele altera passa por ferramentas, então aparece na timeline e pode ser desfeito.
✅ Transcrições e briefings são **dados, não instruções**: comandos que apareçam dentro de falas são ignorados.
💡 Ele pode ser separado em vários agentes no futuro, se houver motivo concreto.

## 12. Modelos de IA

✅ **App agnóstico de criador (decisão de Rodrigo, out/2026):** nenhum prompt ou texto do app tem nome de pessoa ou marca fixo. Quem é o criador e do que o canal fala é uma configuração opcional, **Configurações › Geral › "Sobre o criador"** (`perfil_criador`, até 1.000 caracteres), que entra como contexto no prompt de cortes (antes do briefing) e no da direção visual (fim do prompt de sistema). As regras do §14 são escritas sem nomes porque vão para o prompt. Mensagens do chat usam o autor `criador` (históricos antigos são migrados ao abrir o projeto).

✅ Configuráveis nas Configurações (§8.18), menos o da seleção de cortes, que vem do `.env` (`OPENROUTER_MODEL`).

| Uso | Padrão |
|---|---|
| Chat do agente (futuro) | `google/gemini-3.8-flash` via OpenRouter |
| Seleção de cortes | `google/gemini-3.8-flash` via OpenRouter (`OPENROUTER_MODEL` no `.env`) |
| Transcrição | **ElevenLabs Scribe v2** (API; Configurações › Cortes), com plano B Whisper turbo local + stable-ts. Outros motores rodam em segundo plano para comparar (§8.1) |
| Análise das referências (Calibragem) | `google/gemini-3.8-flash`, multimodal, vídeo do trecho com áudio (Configurações › Direção visual) |
| Diretora e corretora (direção do projeto) | `google/gemini-3.8-flash`, raciocínio médio (Configurações › Direção visual › "Diretora") |
| Formatadora e regras sugeridas | `google/gemini-3.8-flash`, só texto ("Modelo da formatadora") |
| Marcação dos inserts nas referências e descrição das mídias do banco | `google/gemini-3.8-flash`, raciocínio baixo (o mesmo modelo da análise das referências) |
| Faixas de fundo (§8.9) | **Lyria 3 Pro** (Google) via OpenRouter, gerado uma vez pelo Claude (biblioteca), não a cada vídeo |
| Rosto e silhueta do ator (§8.1, §8.7) | MediaPipe (detector de rosto e segmentador de selfie), local |
| Limpeza da voz (§8.9) | DeepFilterNet, local; "isolamento máximo" com o Voice Isolator do ElevenLabs (API) |

💡 Todos os modelos são criados por `comum.chat` (timeout em ms, uma nova tentativa, saída limitada).

💡 As chaves (`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`) ficam em `backend/.env` (fora do git; lido por `comum.carregar_env`, que os testes desligam: nenhum teste lê o `.env` de verdade). Sem crédito no OpenRouter, a fila da Calibragem pausa e avisa.

## 13. Prévia e exportação

✅ **Prévia:** o player toca o **proxy 720p** pulando os trechos cortados, sem renderizar nada; cada camada (look, inserts, motions, transições, legenda, sons) é desenhada ao vivo por cima.

✅ **Exportar:** um botão no topo, em qualquer etapa, sempre com o projeto inteiro; um modal (resolução até 4K, fps, codec, navegadores em paralelo, nome) e o trabalho em segundo plano, com progresso e cancelar. Detalhe e medidas em [exportacao.md](docs/exportacao.md).

### 13.1 O player e a prévia

#### O que é

O player do editor toca o **proxy 720p do bruto** (ou o proxy com a voz limpa) e **pula os trechos cortados** em tempo real: o vídeo final nunca é renderizado para a prévia. O que vai por cima (look, inserts, motions, ator recortado, transições, legenda, sons, fundo) é desenhado ao vivo no navegador. Há dois relógios: **`tempo`** (segundos do vídeo final) e **`bruto`** (segundos do arquivo original).

#### Passo a passo

1. **(automático)** A **sequência** (`montarSequencia`): os clipes da V1 em ordem; cada um ocupa na saída `(fim − início) / vel` segundos, onde `vel` é a velocidade do ator do projeto (1× a 1,5×). Daí saem:
   - **bruto → saída** (`fonteParaSaida`): o clipe que contém o instante; fora de qualquer clipe = null (cortado);
   - **saída → bruto** (`saidaParaFonte`): o clipe onde cai o instante da saída;
   - **onde cada palavra toca** (`palavraNaSaida`): só o pedaço que cai num clipe (o Whisper às vezes estica uma palavra para dentro de uma pausa cortada);
   - **o intervalo de um item ancorado** em palavras (`intervalo`): da 1ª à última palavra; null = órfão.
2. **(automático, a cada quadro de tela)** O player lê o `currentTime` do vídeo, atualiza `bruto` e converte para `tempo`.
3. **(automático) Pular os cortes com precisão**: quando faltam menos de **0,15 s** para o fim do clipe atual (estimando onde o som está pelo relógio do sistema), o salto é **agendado para o instante exato**; o vídeo é silenciado nesse instante, salta para o início do próximo clipe e o som volta quando o salto termina (sem vazar o que foi cortado). Clipes colados (menos de 0,5 ms entre eles) não saltam. Se mesmo assim cair dentro de um corte tocando, salta para o próximo clipe ou para no fim.
4. **(automático)** **Parado dentro de um corte**, o vídeo fica onde está (dá para inspecionar o que saiu).
5. **(automático) Troca de vídeo**: quando o `src` muda (a voz limpa ficou pronta, outra limpeza, um Reenquadrar) ou quando outra etapa monta o seu próprio `<video>`, o player guarda onde estava e se tocava, e retoma do mesmo ponto, tocando se tocava.
6. **(manual)** Tocar, pausar, buscar, mudar a velocidade, tocar trechos (ver abaixo).

#### O que você vê e pode fazer

**A tela** (`Preview`): um monitor **9:16**, o maior que cabe no espaço livre. O vídeo do ator usa o centro do enquadramento (`objectPosition`). Por cima, nesta ordem: o **look** (LUT + vinheta, em WebGL); a **sobreposição** da etapa (o quadro montado: inserts, motions, ator por cima — `MontagemNoPalco`); tudo isso dentro do **efeito das transições** (só nas etapas com o quadro montado); e, por fora do efeito, a **legenda**.

**O quadro montado** (`MontagemNoPalco`, nas etapas Inserts, Transições, Áudio e Legenda):
- o **motion** do plano sob o cursor, se houver (com os sons dele);
- senão o **insert** sob o cursor no lugar (entrada, fundo, card do comentário), o ator descendo/encolhendo pela divisão da tela e pelo rosto, a **pessoa recortada** por cima (quando o recorte do ator está pronto) — o ator por cima do insert fica também por cima do card do comentário, como no MP4;
- nos planos de **Full ator** com preset de movimento, o **zoom no ator** (Zoom in lento: +3% por segundo, no máximo +15% no plano, saindo e chegando suave; Zoom seco: +18% de uma vez), centrado no rosto (sem rosto medido, em x 0,5, y 0,4) — a mesma conta da exportação;
- os sons dos presets e dos motions do projeto são baixados ao abrir a etapa.

**Os controles** (embaixo do monitor):
- **⏮ Voltar ao início** (vai ao 0 da saída);
- **▶ / ⏸** (clicar no vídeo também alterna); dar play parado no fim volta ao começo;
- o tempo "**atual / duração**" do vídeo final; no Pré-processamento, também "bruto <tempo>" em amarelo;
- **velocidade da prévia**: **0,25× · 0,5× · 1× · 2×** (o tom é preservado).

**Velocidade da prévia × velocidade do ator**:
- A **velocidade do ator** (painel no Pré-processamento: 1×, 1,1×, 1,2×, 1,3× ou ajuste fino de 1× a 1,5× em passos de 0,05) muda o **vídeo final**: cada segundo do bruto dura 1/vel na saída; planos, inserts e legenda seguem as palavras; o tom da voz não muda.
- A **velocidade da prévia** só muda como você assiste.
- O `<video>` do ator toca a **prévia × ator** (ex.: 2× com o ator a 1,2× = 2,4×). A música de fundo e os inserts seguem o relógio da saída, só na velocidade da prévia.

**Trecho e loop** (`tocarTrecho(de, até, {pular, loop})`, em segundos do bruto):
- toca de `de` a `até` e **para** no fim (o fim também é agendado com precisão); com `loop`, volta ao `de`;
- já põe o relógio da saída no ponto do trecho antes do 1º quadro (os sons não tocam fora de hora);
- **pausar esquece o trecho**.
- Usos: ouvir uma emenda (E, com "repetir" para loop, pulando os cortes) e ouvir uma palavra (0,3 s antes a 0,3 s depois, sem pular) no Pré-processamento; **Ver o corte / R** nas Transições (1,5 s antes a 1,5 s depois); os trechos da etapa Inserts.
- **Pular cortes** (`pular`): ligado por padrão; só no Pré-processamento a tecla **B** alterna entre o resultado (pulando) e o bruto inteiro; fora dele, é sempre o vídeo cortado.

**Teclado** (no editor inteiro):
- **Espaço**: toca / pausa;
- **← / →**: −/+ 0,5 s; com **Shift**, 5 s; com **Alt**, 0,01 s (no Pré-processamento andam no bruto; nas outras, no vídeo final);
- **E** (Pré-processamento): ouve a próxima emenda a partir do cursor;
- **B** (Pré-processamento): alterna resultado / bruto;
- **R** (Transições): toca o corte selecionado;
- **⌘ + / ⌘ −**: zoom na linha do tempo.
- Os atalhos valem com o foco num botão ou slider (o controle solta o foco), mas não num campo de texto, numa alça de corte (as setas movem a alça), com um modal aberto, ou com ⌘/Ctrl (fora o zoom).

**Linhas do tempo horizontais** (`LinhaBase`, nas etapas Inserts, Transições, Áudio, Legenda): barra com o zoom (−, +, ajustar à largura), régua (clicar ou arrastar leva o cursor), nomes das trilhas fixos, a cabeça de reprodução seguida enquanto toca.

#### O que fica gravado

Nada do player em si: a velocidade da prévia, o trecho e o cursor são só da sessão. A **velocidade do ator** fica em `projeto.velocidade` (1 a 1,5). As larguras dos painéis e a altura da linha do tempo ficam lembradas neste navegador.

#### No vídeo final

O player não renderiza nada: o MP4 é montado do zero pela exportação, com as **mesmas contas** (a sequência, as curvas das transições, os zooms do Full ator, o tempo e a altura da legenda, os níveis do áudio). A prévia é a referência de "o que você aprova é o que sai".

#### Ligações

- **Pré-processamento**: a V1 (cortes) e a velocidade do ator definem a sequência.
- **Áudio**: o player toca o proxy com a voz limpa e passa pela cadeia do Web Audio; o fundo segue o relógio da saída.
- **Transições e sons**: tocam pelo relógio `tempo` (`useSonsNoTempo`).
- **Legenda, inserts, motions**: desenhados pelo `tempo`.

---

### 13.2 Exportação

#### O que é

O botão **Exportar** no topo do editor (em qualquer etapa) gera o **MP4 final do projeto inteiro**, em segundo plano. O ator e o áudio saem do **bruto original** pelo ffmpeg; a camada dos inserts e motions é a **própria prévia, fotografada quadro a quadro** por vários navegadores escondidos em paralelo; tudo se junta numa **única passada do ffmpeg**, codificada pelo chip de vídeo do Mac.

#### Passo a passo

1. **(manual)** Clicar em **Exportar** → abre o modal; escolher as opções e o nome → **Exportar ↗**. As opções ficam lembradas neste navegador.
2. **(automático)** O servidor confere (opções válidas, o projeto tem V1, não há outra exportação deste projeto rodando), grava `projeto.exportacao = {status: 'rodando', …}` e põe na fila (até 2 exportações de projetos diferentes ao mesmo tempo).
3. **(automático)** Prepara os **vídeos do banco** usados nos inserts em resolução original, com quadro-chave a cada 6 quadros (busca quadro a quadro rápida), feitos uma vez e guardados no banco.
4. **(automático)** Abre a **página de render** (`/render/p/<id>` do front) num Chromium escondido e lê `window.__render`: os **trechos** dos inserts e motions (com a divisão da tela e a geometria do ator em cada um), os **sons** (dos presets, dos motions e das transições), as **transições** com efeito, os **blocos da legenda** e os **movimentos** do Full ator. Os sons são multiplicados pelo fator de som do projeto.
5. **(automático)** **Fotografa a camada dos inserts**: os quadros de cada insert/motion são cortados em pedaços de **12 a 48 quadros** e distribuídos entre os navegadores (processos `render_quadros.py`, cada um com o seu Chromium na janela do tamanho do vídeo; o desenho da prévia de 540 px de largura ampliado por CSS `zoom` — 4K = 4×). Para cada quadro, a página vai ao instante exato (vídeos parados no quadro certo, fontes e imagens carregadas, dois quadros de tela) e tira a foto rápida do protocolo do Chrome (`Page.captureScreenshot` com `optimizeForSpeed`). Um **insert parado** (sem vídeo na tela e com a entrada terminada) reaproveita a foto anterior. As fotos passam por RGBA cru e cada pedaço vira um clipe **ProRes 4444 com transparência** (pelo chip); os pedaços de um insert são emendados sem recodificar. Se uma página recarregar no meio, espera voltar e refaz o quadro.
6. **(automático)** Grava o **ASS da legenda** (se ligada) e prepara a **máscara da vinheta** do look (se o look estiver ligado).
7. **(automático)** Prepara o **áudio**: a voz da escolha (faz a limpeza agora se faltar; se falhar, a do bruto + aviso) e **mede o ganho do −14 LUFS** só no áudio.
8. **(automático)** Monta e roda a **passada única do ffmpeg** (camadas abaixo).
9. **(automático)** No fim, renomeia o arquivo parcial para o nome final e marca "pronta" (ou "cancelada" / "erro"); apaga os temporários.

#### O que você vê e pode fazer

**O botão Exportar** (coral, no topo):
- desligado enquanto o projeto não tem cortes, com a dica "Sem cortes ainda: o vídeo final sai deles (espere o processamento terminar).";
- durante a exportação, vira "**Exportando 42%**" com uma barra por dentro; clicar abre o andamento.

**O modal "Exportar vídeo"**:
- **Resolução**: 720p (720×1280) · 1080p (1080×1920) · **4K** (2160×3840, padrão).
- **Quadros por segundo**: **24** (padrão) · 30 · 60. Acima de 24: "O bruto tem 24 fps: o ator repete quadros; os inserts saem fluidos em N fps." (sem interpolar).
- **Codec**: **HEVC** (padrão, "menor (H.265)") · H.264 ("abre em tudo").
- **Navegadores em paralelo**: 2 ("mais leve") · 4 · **6** ("padrão") · 8 ("mais rápido"). O servidor aceita de 1 a 8.
- **Nome do arquivo**: padrão "<projeto> · AAAA-MM-DD HHhMM · <resolução> <fps>" (acompanha as opções até você editá-lo).
- **Resumo**: "N inserts · fundo <nome> · K comentários" (só os inserts com mídia) — ou "sem direção visual: só o ator" — · a duração · **≈ tamanho estimado** (pelos Mbit/s medidos em HEVC a 24 fps: 720p 3,7 · 1080p 8 · 4K 28; H.264 ≈ o dobro; 30 fps +15%, 60 fps +50%; mais o áudio).
- **Última exportação** (se houver uma pronta): o arquivo, **Abrir no Finder** e **Baixar**.
- **Cancelar** (fecha o modal) e **Exportar ↗** (desligado sem nome ou sem duração).

**Durante a exportação** (o mesmo botão abre): "Exportando", o nome, a barra e "X% · roda em segundo plano: pode fechar esta janela, trocar de etapa ou de projeto." e **Cancelar exportação**.

**No fim**, um aviso no canto inferior direito: "**Vídeo exportado**" (com o arquivo, **Abrir no Finder**, **Baixar** e, se houver, o aviso amarelo — ex.: a voz não pôde ser limpa), "**Exportação cancelada**" ou "**A exportação falhou**" (com o erro).

**O progresso**: a fase das fotos e a passada final dividem a barra pelo peso estimado (~18 quadros/s fotografados e ~0,45 s de passada por segundo de vídeo); a passada final avança pelo `out_time` do ffmpeg até 99%.

**Cancelar**: conferido a cada pedaço fotografado, antes e depois da limpeza da voz e da medida do −14, e a cada linha de progresso do ffmpeg (que é morto na hora). O arquivo parcial é apagado e o status fica "cancelada".

#### As camadas da passada única (na ordem)

Entradas do ffmpeg, nesta ordem: o bruto (decodificado pelo chip, `-hwaccel videotoolbox`), a máscara da pessoa (se usada), os clipes dos inserts, a voz limpa, os sons, as voltas do fundo, a máscara da vinheta (em loop) e, por último, um `luz.webm` por transição de luz.

1. **Ator** (`_ator`):
   - cada clipe da V1 vira um par vídeo + áudio (`trim`/`atrim`), com **fade de 15 ms** no áudio em cada ponta, e o `concat` os emenda juntos;
   - **velocidade do ator**: vídeo com `setpts=(PTS−STARTPTS)/vel` e áudio com `atempo=vel` (o tom não muda);
   - recorte 9:16 pelo enquadramento (se o bruto for horizontal), escala **lanczos** para a resolução, `fps` de saída (repete quadros);
   - **zoom do Full ator** (`_movimentos`, antes do look, para a vinheta não aproximar junto): em cada plano de Full ator com preset, a escala no tempo (Zoom in lento: amplitude = min(0,03 × duração do plano, 0,15), curva meio linear, meio suave; Zoom seco: +0,18 o plano inteiro) e o recorte que mantém o centro do rosto parado;
   - o **look** (LUT + vinheta) só no ator;
   - o ator posto pela **geometria** de cada tela dividida (enquadrado pelo rosto, embaixo dos inserts).
2. **Inserts e motions** (`_inserts`): cada clipe ProRes 4444 sobreposto no seu instante (`overlay`).
3. **Ator por cima** (a parte de cima de `_ator`): o ator na **janela**, no **canto** ou a **pessoa recortada** (máscara + `alphamerge`) nos trechos de "ator embaixo", por cima da camada dos inserts (e do card do comentário). Cada pedaço começa com quadros transparentes até o instante dele e só é desenhado dentro do trecho (isso evita guardar o ator inteiro na memória).
4. **Transições** (`_pos_montagem` → `_transicoes`): zoom com desfoque, brilho e luz, só nas janelas (ver Etapa 4).
5. **Legenda** (`_legenda`): o filtro `ass` por cima de tudo. Depois, `format=yuv420p`.
6. **Áudio** (`_audio`): a voz limpa com a cadeia e o fader, os sons por grupo, o fundo com laço/ducking/fade e o −14 LUFS (ver Etapa 5).

Codificação: HEVC (`hevc_videotoolbox`, `-q:v 65`, tag `hvc1`) ou H.264 (`h264_videotoolbox`, `-q:v 65`); `yuv420p`, cores bt709 em faixa de TV; AAC 320 kbps 48 kHz; `-t` = duração do vídeo final; `+faststart`.

#### O que fica gravado

- O MP4 em `dados/projetos/<id>/exports/<nome>.mp4`; um nome repetido ganha " (2)", " (3)"…
- Durante: `<nome>.parte.mp4`, a pasta `<nome>.parte.camadas/` (os clipes dos inserts, o ASS, a vinheta) e `<nome>.parte.log` (o stderr do ffmpeg) — todos apagados no fim.
- `projeto.exportacao = { status: rodando|pronta|cancelada|erro, progresso, resolucao, fps, codec, navegadores, nome, arquivo, erro, aviso, inicio, fim }` (só a última).
- Se o servidor reiniciar no meio, a exportação vira erro ("Interrompida (o servidor reiniciou): exporte de novo") e os pedaços são apagados.
- Rotas: `GET/POST /api/projetos/{id}/exportacao` (409 se não há cortes ou já há uma rodando), `POST …/exportacao/cancelar`, `GET …/exportacao/arquivo`, `POST …/exportacao/finder`.

#### No vídeo final

É o próprio vídeo final. Medido (vídeo de teste, 1:02, 2 inserts com 5,4 s de insert, 4K 24 HEVC): **40 s** de exportação (antes, 3 min 33 s); 6 navegadores fotografam ~22 quadros/s em 4K; a passada final leva ~23 s por minuto de vídeo; as transições custam ~4,5% de CPU a mais.

#### Ligações

- **Todas as etapas**: a exportação usa as mesmas contas da prévia, calculadas no front pela página de render (`window.__render`).
- **Front no ar**: precisa do front (`HARNESS_FRONT`, padrão `http://localhost:5173`); o websocket do Vite é silenciado nas páginas de render.
- **Banco**: as cópias de exportação dos vídeos (`exportacao.mp4`), refeitas se o original mudar.
- **Áudio**: a limpeza pode rodar durante a exportação.

### 13.3 O contrato da montagem

💡 **O contrato da montagem** (a ordem das camadas, igual na prévia e na exportação; cada área mexe só na sua parte):

| # | Camada | Prévia | Exportação | Área |
|---|---|---|---|---|
| 1 | **Ator**: cortes, 9:16, **look** (LUT + vinheta), posição na divisão da tela (pelo rosto) | vídeo + WebGL + CSS | ffmpeg (`_ator`: trim/concat, `lut3d`, máscara, escala/posição por trecho) | §8.1, §8.7 |
| 2 | **Inserts e motions** | componentes React | fotografados pelos navegadores (ProRes 4444 com transparência), sobrepostos | §8.3–8.5 |
| 3 | **Pessoa recortada** (cabeça por cima do insert, no "ator embaixo") | vídeo com alfa | máscara sobre o bruto | §8.4 |
| 4 | **Transições** (sobre o quadro já montado) | transformações e véu no palco | escala, `gblur` e véu por expressões de tempo | §8.8 |
| 5 | **Legenda** (por cima de tudo) | camada HTML | ASS desenhado pelo libass | §8.10 |
| A | **Áudio**: voz limpa → timbre → compressor; sons dos presets; sons das transições; fundo com ducking; −14 LUFS | Web Audio, um ganho por trilha | grafo do ffmpeg (`amix`, `acrossfade` nas voltas do fundo, ducking por `volume` com `eval=frame`, ganho medido + `alimiter`) | §8.6, §8.9 |

💡 A página de render (`/render/p/<id>`) entrega ao backend tudo o que é calculado no front (`window.__render`): os trechos dos inserts, a divisão da tela, os eventos de som e, quando existirem, as transições e os blocos da legenda. Cada área acrescenta o seu campo (`transicoes` desde a P2, `legenda` desde a P4: os blocos para o ASS; desde a P5, `trechos[].divisao.ator`: a geometria do ator em cada trecho dividido, [rosto.md](docs/rosto.md)); o backend monta a passada do ffmpeg por partes, uma função por camada em `exportacao.py`: `_ator` (1 e 3; com a geometria, `_ator_na_geometria`), `_inserts` (2), `_pos_montagem` → `_transicoes` (4) e `_legenda` (5), `_audio` (A) — ver [exportacao.md](docs/exportacao.md).

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

✅ Feito e em uso: Fundação, Cortes, Direção visual (D1–D7), Inserts e Banco, Enriquecimento por presets (divisão da tela, ajustes rápidos, avaliação, recomendados), Motions, Sons de apoio, Exportação.

💡 F0 feita (out/2026, branch `f0-fundacao`), à espera da avaliação de Rodrigo.

✅ **Próximas, uma branch por funcionalidade** (decisão de Rodrigo, out/2026), cada uma com a sua spec em `docs/` antes do código:

| # | Entrega | Pronto quando |
|---|---|---|
| F0 | **Fundação das novas etapas:** as etapas renomeadas (Pré-processamento, Transições, Áudio, Legenda, cada uma com a sua tela vazia), o novo projeto (nome, motor, formato), o `rosto.py` (a medida do rosto, usada por duas áreas) e a exportação separada por camadas (§13), com os ganchos de cada área | O app abre nas etapas novas e exporta igual a hoje |
| P1 ✅ (à espera da avaliação) | **Pré-processamento:** 16:9 → 9:16 pelo rosto e o look (LUTs + vinheta) | Um vídeo 16:9 vira 9:16 seguindo o rosto; o look igual na prévia e no MP4 |
| P2 ✅ (à espera da avaliação) | **Transições:** análise das referências, transições recriadas, página e etapa | Os cortes do vídeo de teste com as transições favoritas, aprovadas por Rodrigo |
| P3 ✅ (à espera da avaliação) | **Áudio:** faixas de fundo geradas, limpeza da voz, timbre, mixer, −14 LUFS | O MP4 com a voz limpa, a faixa de fundo e os níveis certos, aprovados no ouvido |
| P4 ✅ (à espera da avaliação) | **Legenda:** o estilo da casa medido, a geração e a edição, o ASS | As legendas do vídeo de teste iguais às das referências |
| P5 ✅ (à espera da avaliação) | **Rosto nos inserts:** o enquadramento do ator na tela dividida e no "ator embaixo" | O rosto bem posicionado em todos os planos divididos do vídeo de teste |

💡 **Em paralelo** (quando Rodrigo pedir): depois da F0, P1 a P5 mexem em arquivos separados (cada uma no seu doc, nos seus módulos, na sua camada da exportação e no seu campo do `__render`), então podem ser feitas por agentes em paralelo, cada um numa cópia da pasta (`git worktree`) e numa branch própria; o Claude principal junta uma de cada vez na main, rodando todos os testes e a exportação de ponta a ponta a cada junção. O que pede o olho de Rodrigo (aprovar transições, o estilo da legenda, ouvir as faixas) fica para a revisão no fim de cada uma.

## 16. Aprendizados medidos

Os fatos medidos sobre transcrição e cortes estão em [cortes.md](docs/cortes.md); os da exportação, em [exportacao.md](docs/exportacao.md); os dos sons, em [inserts.md](docs/inserts.md).

## 17. Em aberto

- ⏳ Meta de desempenho (antes: 5 min de bruto processados em até 3 min). Não reconfirmada.
- ⏳ As migrações de dados antigos no `projeto.ler` (apagá-las tiraria o suporte a projetos antigos — só com um script de migração único) e dividir `direcao.py` (análise · captura · revisão · galeria) e o `LinhaVertical` (um componente de ~600 linhas).
- ⏳ Aprendizado das correções: como uma correção recorrente vira regra.
- ⏳ Direção: quando os exemplos passarem de algumas dezenas, mandar só os mais parecidos? Usar só as referências revisadas (hoje, todas)?
- ⏳ Regra de abertura: uma pergunta retórica do criador às vezes é tratada como "leitura de comentário" (ambíguo só pela transcrição).
- ⏳ A diretora às vezes põe 1 mídia onde a fala cita duas coisas ("esses dois sites"): reforçar nas regras ou nos exemplos.
- ⏳ Na lista de projetos, quando Transições, Áudio e Legenda contam como prontas (hoje as barrinhas delas ficam apagadas, "ainda sem marcação de pronta"), ou se elas saem do card.
- ⏳ Achados da revisão do SPEC contra o código (out/2026), a decidir:
  - **Referências revisadas:** a Calibragem diz que "só as referências revisadas ensinam a Direção visual", mas a diretora e as regras sugeridas recebem todas as analisadas, sem marcar as revisadas nem os favoritos (§8.2, §8.11).
  - **Elementos no vídeo final:** lettering, palavra ManyChat, caixinha e print sobreposto aparecem no esboço da Direção, mas não na prévia montada nem na exportação (§8.2).
  - **Dúvidas da IA nos cortes:** a IA devolve as dúvidas (`cortes.duvidas`), mas a tela não as mostra (§8.1a).
  - **Uma falha na análise por trecho** (2 tentativas) ainda derruba a referência inteira; só o passo dos inserts tolera falhas (§8.11).
  - **Engrenagem do preset aplicado:** na etapa Inserts, a engrenagem do preset que já está no insert selecionado não abre o editor completo (só a dos outros) (§8.4).
  - **Sons na etapa Áudio:** a linha do tempo mostra só os sons das transições, com largura fixa; o §9 promete as trilhas de áudio completas (§8.9).
- ⏳ Cada doc de área tem os seus "em aberto".
