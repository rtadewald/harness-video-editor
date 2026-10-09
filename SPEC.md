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

---

## 1. Visão

✅ Rodrigo cria um projeto e sobe o vídeo bruto. A IA faz a primeira versão de cada etapa e ele ajusta à mão (estilo Premiere). As etapas, nesta ordem (decisão de Rodrigo, out/2026):

| # | Etapa | O que faz |
|---|---|---|
| 1 | **Pré-processamento** | O vídeo do ator: de 16:9 para 9:16 pelo rosto, os **cortes** (erros, retomadas, esperas, emendas e respiros) e o **look** (LUT e vinheta) (§8.1) |
| 2 | **Direção visual** | O que aparece na tela em cada momento (planos e elementos) e, nos inserts, o que acontece e quais mídias entram; aprende com vídeos de referência já editados (§8.2) |
| 3 | **Inserts** | As **mídias** de cada insert, os **motions** e o **enriquecimento** (presets: como as mídias aparecem, com os sons de apoio), e o rosto do ator bem posicionado no que sobra da tela (§8.3–8.7) |
| 4 | **Transições** | Como o vídeo passa de um plano para o outro, com o som (§8.8) |
| 5 | **Áudio** | A voz (limpeza e timbre), a faixa de fundo e o mixer das trilhas (§8.9) |
| 6 | **Legenda** | Legendas da fala, no estilo da casa (§8.10) |

✅ **Formatos:** **Reels** (9:16, o único implementado); **Anúncio** e **Aula** aparecem como "em breve".

Conteúdo típico: vídeos de Rodrigo (Asimov Academy) sobre IA, agentes, produtividade e design, para Reels/TikTok. Os brutos têm erros, pausas e várias tentativas da mesma fala.

## 2. Escopo

✅ **Entra:** as seis etapas acima, reais; a tela de projetos (criar, abrir e apagar — apagar manda a pasta para `projetos/_lixeira/`, recuperável); o pipeline automático ao criar o projeto; as páginas de apoio (Banco, Referências, Calibragem, Heurística, Presets, Motions, Transições); a exportação MP4 a partir de qualquer etapa.

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
│   │   ├── rotas_*.py         # as rotas por assunto: projetos, referencias, cortes, direcao, inserts (e banco),
│   │   │                      #   exportacao, presets (sons, entradas, recorte), motions, rosto, preprocessamento (look e
│   │   │                      #   enquadramento); rotas_comum.py: o que compartilham
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
│   ├── editor/        # as etapas (etapas.ts), o player, a prévia; editor/inserts/: a etapa Inserts
│   ├── presets/       # a página Presets (card com o modal, avaliação, recomendados)
│   ├── motions/       # os motions (grade, edição, página, sons)
│   ├── referencias/   # timeline de direção, edição, detalhe, painel da Calibragem
│   ├── transicoes/    # as transições entre planos (motor, etapa, página, efeito no palco)
│   ├── audio/         # o áudio (cadeia da voz e fundo na prévia, a etapa com o mixer)
│   ├── legenda/       # a legenda (os blocos, a camada da prévia, a etapa)
│   └── components/    # marca, navegação, Modal, componentes shadcn (ui/)
├── frontend/public/motion/   # o runtime e os presets de motion (HTML + GSAP)
├── ferramentas/       # scripts do Claude: montar presets (tira, curva, pose), sons (biblioteca, detecção), os LUTs (luts.py) e os das áreas novas
├── projetos/          # dados dos projetos (fora do git)
├── referencias/       # vídeos da Calibragem, _favoritos.json, _heuristica.json (fora do git)
├── banco/             # mídias dos inserts (global, fora do git)
├── presets/           # presets de enriquecimento e ordem.json (fora do git)
├── sons/              # sons do time e sons/biblioteca/ processada (fora do git: licença)
├── transicoes/        # transições entre planos (fora do git, §8.8)
├── trilhas/           # faixas de fundo geradas (fora do git, §8.9)
└── _legado/           # projeto anterior, só referência
```

## 5. Projeto em disco

✅ Uma pasta por projeto, com `projeto.json` como fonte de verdade. Os originais nunca são alterados.

💡

```text
projetos/<slug>/
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

## 6. Criação do projeto e pipeline automático

✅ **Novo projeto** (decisão de Rodrigo, out/2026): **nome**, **motor de transcrição**, **formato** (Reels; Anúncio e Aula "em breve") e o **vídeo**, vertical ou horizontal. O briefing e os vídeos de apoio saíram da criação ([preprocessamento.md](docs/preprocessamento.md)).

✅ Em seguida roda sozinho, com barra de progresso por passo:
1. Inspeção (ffprobe, considerando o metadado de rotação). **Se o vídeo é 16:9**, o enquadramento pelo rosto gera o bruto 9:16 antes de tudo (§8.1).
2. **Proxy 720p** (em paralelo com o resto), e em segundo plano o **rosto** (§8.7) e a **silhueta** do ator.
3. **Silêncios** do áudio (`silencedetect`) e a forma de onda (`picos.json`).
4. **Transcrição** com tempo por palavra, pelo motor do projeto, em pedaços separados pelas pausas, com o **alinhamento** dos tempos ([cortes.md](docs/cortes.md)).
5. **Sugestão de cortes** pela LLM (§8.1, regras no §14).
6. **Outros motores de transcrição**, em segundo plano e em fila própria (para comparar).

✅ Ao terminar, Rodrigo abre o Pré-processamento e já encontra uma primeira versão cortada. Cada passo pode ser refeito à mão.

## 7. Interface

✅ Layout de editor estilo **Premiere**, num verde profundo (`#172e2b`) como chrome do app inteiro, para o vídeo ter contraste; diálogos em creme (`#faf7ee`); pílulas de contorno fino (a ativa em creme); detalhes em coral. Tokens em `frontend/src/index.css`.

💡 O app:
- **Barra de cima** (todas as telas): os **projetos abertos como abas** (o × fecha; dois cliques no nome renomeiam), depois **Projetos · Banco · Motions · Referências** e, à direita, **Presets · Transições · Calibragem · Heurística da direção** (o que treina e regula o app; pedido de Rodrigo, out/2026).
- **Barra das etapas** (à esquerda, recolhível): Pré-processamento · Direção visual · Inserts · Transições · Áudio · Legenda. Cada projeto reabre na última etapa usada. 💡 O Pré-processamento guarda o id `cortes` (dados e etapa lembrada continuam valendo) e mostra tudo numa tela só, sem abas: os Cortes, a prévia e, à direita, o Look e o Enquadramento (P1; [preprocessamento.md](docs/preprocessamento.md)). A etapa Transições segue o arranjo da de Inserts (P2; [transicoes.md](docs/transicoes.md)). A etapa Áudio também (P3; [audio.md](docs/audio.md)). A etapa Legenda também (P4; [legenda.md](docs/legenda.md)). Nenhuma etapa fica mais em construção (a tela provisória com o selo EM CONSTRUÇÃO saiu na P4). Em janelas estreitas, os links da barra de cima ficam só com o ícone (💡 pelo espaço que sobra para os links, não pela largura da janela — uma container query: as abas dos projetos abertos ocupam até 40% da barra e rolam; a Calibragem e a Heurística perdem o rótulo primeiro; se nem os ícones couberem, os links rolam). 💡 As abas encolhem (nome cortado, até 120 px) antes de rolar, e a ativa vem sempre para a vista, inteira e com o × fora das setas (com duas abas ou mais, a faixa das abas tem lugar para uma aba entre as duas setas); o que fica fora da vista, nas abas ou nos links, ganha um degradê e uma seta naquele lado, que rola ao clicar. As buscas do Banco e das Referências encolhem com a janela (200 a 420 px).
- 💡 **Endereço sem tela** (uma rota que não existe, um projeto apagado com a aba ainda lembrada): a barra de cima e "Voltar aos projetos"; no projeto, também "Fechar a aba deste projeto" (`paginas/NaoEncontrada.tsx`). O editor só monta depois que `/editor` responde, então um projeto que não existe não dispara as leituras das etapas (um 404 só); cada projeto monta o seu editor, e trocar de aba não leva nada do anterior.
- 💡 **Lista de projetos:** o selo de cada card é a duração do **vídeo editado** (a soma da V1, `duracao_final` no resumo), o tamanho do Reels; antes dos cortes, a do bruto. A dica do selo diz as duas.
- **Topo do editor:** Configurações, o botão especial da etapa (ex.: "Refazer cortes com IA") e **Exportar**.
- **Cada etapa** tem a sua tela: a timeline do jeito que serve a ela (vertical nos Cortes e na Direção, horizontal nas outras), o vídeo no centro com o resultado no lugar e os cards de trabalho ao lado.

✅ Atalhos: espaço toca/pausa; ←/→ andam 0,5 s (com shift, 5 s); ⌘ + / ⌘ − dão zoom na linha do tempo. Clicar numa palavra ou item pula o player para ela.

## 8. Etapas

### 8.1 Pré-processamento

✅ O vídeo do ator antes da direção, em três partes ([preprocessamento.md](docs/preprocessamento.md)):
- **Enquadramento** (só num vídeo 16:9): a câmera segue o rosto devagar e gera o bruto 9:16 que o resto do processo usa.
- **Cortes:** a LLM escolhe **quais palavras ficam, pelo ID**, e o código monta os clipes puxando as bordas para os silêncios reais; a tela de inspeção (timeline vertical do bruto, forma de onda em ms, vários motores de transcrição, comparação) e a edição manual (alças, cortar e excluir trechos, restaurar, recalcular) — tudo em [cortes.md](docs/cortes.md).
- **Look:** 2 ou 3 LUTs básicos (o padrão é o da casa) com intensidade, e a **vinheta**, ligada por padrão, só no ator, iguais na prévia (WebGL) e na exportação (ffmpeg).

### 8.2 Direção visual

✅ Decide o que aparece na tela em cada momento: **planos** (Full ator, tela dividida, insert tela cheia, motion, comentário…) e **elementos** (lettering, ícones…), presos às palavras. Aprende com as **referências** (vídeos editados do time, analisados por IA multimodal e revisados por Rodrigo na Calibragem) e com a **heurística** (regras do criador + roteiros de exemplo). A direção do projeto sai em duas etapas (diretora + formatadora), com versões e comentários, e descreve cada insert (o que acontece e quais mídias entram). Detalhe em [direcao.md](docs/direcao.md).

### 8.3 Inserts

✅ Em cada plano de insert, as **mídias** (vídeos e imagens) do **Banco** (global, com descrição e palavras-chave da IA), subidas, escolhidas ou capturadas de um site, com a prévia no lugar. Detalhe em [inserts.md](docs/inserts.md).

### 8.4 Enriquecimento (presets)

✅ Como as mídias de um insert aparecem: **presets** feitos à mão pelo Claude a partir das referências (receitas de cards com entrada, saída, câmera contínua e curvas suaves), aprovados na página Presets; a **divisão da tela** pela proporção das mídias e pelo tipo do preset; **ajustes rápidos** por insert; **recomendados** por situação. Detalhe em [inserts.md](docs/inserts.md).

### 8.5 Motions

✅ Num plano de motion, um **preset** (animação pronta em HTML + CSS + GSAP, escrita à mão, em que o criador troca só os textos, a imagem e o fundo) ou um **vídeo** feito fora (do banco; entra e sai seco). Tocam ao vivo na prévia e entram na exportação. (A geração por IA saiu em out/2026.) **A especificação completa fica em [docs/motions.md](docs/motions.md)** (separada para os motions poderem andar em paralelo com o resto).

### 8.6 Sons de apoio dos presets

✅ Os presets (de enriquecimento e de motion) têm **momentos de som** (entrada, troca, saída, mergulho, zoom, digitação…) com um som da biblioteca do time e a intensidade (Baixo · Médio), relativa à voz do vídeo; tocam na prévia e entram na exportação. Detalhe em [inserts.md](docs/inserts.md) e [motions.md](docs/motions.md).

### 8.7 Rosto do ator

✅ O rosto do ator, medido uma vez por projeto, guia o enquadramento 16:9 → 9:16 e, na **tela dividida** e no **"ator embaixo"**, posiciona o ator no espaço que sobra (um enquadramento estável por plano, com ajuste manual). Detalhe em [rosto.md](docs/rosto.md).

### 8.8 Transições

✅ Em cada corte entre planos, uma transição pelo **par de categorias** (de onde sai, para onde vai), modelada das referências (corte seco, brilho, zoom de impacto, desfoque, deslize… com o som), aprovada na página **Transições** com **2 favoritas por par** e "Outras transições"; cada corte recebe sozinho a 1ª favorita e pode ser trocado na etapa. Detalhe em [transicoes.md](docs/transicoes.md).

### 8.9 Áudio

✅ A voz do ator (**limpeza** com DeepFilterNet ou o isolamento do ElevenLabs, **timbre**, compressor, −14 LUFS), a **faixa de fundo** (biblioteca gerada com o Lyria 3 Pro a partir das trilhas das referências) e o **mixer**: Ator, Sons dos presets, Transições e Fundo. Detalhe em [audio.md](docs/audio.md).

### 8.10 Legenda

✅ Gerada da fala já cortada, no **estilo da casa** medido nas referências (posição por tipo de plano, fonte, tamanho, ritmo, destaques), com edição dos blocos e desviando dos inserts. Detalhe em [legenda.md](docs/legenda.md).

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
| Faixas de fundo (§8.9) | **Lyria 3 Pro** (Google) via OpenRouter, gerado uma vez pelo Claude (biblioteca), não a cada vídeo |
| Rosto e silhueta do ator (§8.1, §8.7) | MediaPipe (detector de rosto e segmentador de selfie), local |
| Limpeza da voz (§8.9) | DeepFilterNet, local; "isolamento máximo" com o Voice Isolator do ElevenLabs (API) |

💡 Todos os modelos são criados por `comum.chat` (timeout em ms, uma nova tentativa, saída limitada).

💡 As chaves (`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`) ficam em `backend/.env` (fora do git; lido por `comum.carregar_env`, que os testes desligam: nenhum teste lê o `.env` de verdade). Sem crédito no OpenRouter, a fila da Calibragem pausa e avisa.

## 13. Prévia e exportação

✅ **Prévia:** o player toca o **proxy 720p** pulando os trechos cortados, sem renderizar nada; cada camada (look, inserts, motions, transições, legenda, sons) é desenhada ao vivo por cima.

✅ **Exportar:** um botão no topo, em qualquer etapa, sempre com o projeto inteiro; um modal (resolução até 4K, fps, codec, navegadores em paralelo, nome) e o trabalho em segundo plano, com progresso e cancelar. Detalhe e medidas em [exportacao.md](docs/exportacao.md).

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
- ⏳ Apagar (ou arquivar) um projeto: hoje não há como, nem pela tela nem pela API (decisão de produto: apagar de vez, com confirmação, ou só tirar da lista).
- ⏳ Na lista de projetos, quando Transições, Áudio e Legenda contam como prontas (hoje as barrinhas delas ficam apagadas, "ainda sem marcação de pronta"), ou se elas saem do card.
- ⏳ Cada doc de área tem os seus "em aberto".
