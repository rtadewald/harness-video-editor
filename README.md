# Harness Video Editor

Editor de vídeo local onde a **IA faz cada etapa da edição** e você corrige numa interface no estilo Premiere. Feito para Reels (9:16): você sobe o vídeo bruto, com erros, pausas e várias tentativas da mesma fala, e sai com o MP4 pronto, com inserts, motions, transições, trilha e legenda.

![Linha do tempo vertical da etapa de Cortes](docs/img/demo.gif)

## As seis etapas

Cada projeto passa por seis etapas, nesta ordem. Em todas, a IA faz a primeira versão e você corrige. A prévia mostra o resultado ao vivo, igual ao MP4.

1. **Pré-processamento.** O vídeo do ator:
   - **Cortes:** a IA escolhe quais palavras ficam (tira erros, retomadas e esperas), e o código cola cada corte num silêncio real. Você revisa numa linha do tempo vertical, com a onda e cada palavra no seu milissegundo.
   - **Enquadramento:** num vídeo 16:9, a câmera segue o rosto e gera o 9:16.
   - **Look:** LUT e vinheta.
   - **Velocidade:** acelera a fala de 1× a 1,5×.
2. **Direção visual.** O que aparece na tela em cada momento:
   - os planos: Full ator, tela dividida, insert ou motion em tela cheia, comentário;
   - os elementos: lettering, prints, palavras.
   Ela aprende com os seus vídeos já editados, na **Calibragem**.
3. **Inserts.** As mídias de cada insert, que vêm do **Banco**, de um upload ou de uma captura de site. Também:
   - os **presets** de como elas aparecem, com sons de apoio;
   - os **motions**;
   - o ator bem posicionado no que sobra da tela;
   - os **presets do Full ator**: zoom lento ou zoom seco.
4. **Transições.** Em cada troca de plano, uma transição com som (corte seco, clique, câmera, riser, luz, brilho, zoom), pelo par de grupos: de onde sai e para onde vai.
5. **Áudio.** A voz limpa, com timbre e compressor, a faixa de fundo com o volume caindo na fala, o mixer das trilhas e −14 LUFS no final.
6. **Legenda.** Palavra a palavra ou por frase, no estilo medido nas referências, com edição dos blocos.

O **Exportar** fica no topo de qualquer etapa e gera o MP4 do projeto inteiro (até 4K), em segundo plano.

O passo a passo de cada etapa (o que a IA faz, o que você vê e pode corrigir, o que fica gravado e o que vai para o vídeo final) está no [SPEC.md](SPEC.md). O detalhe técnico de cada área está em [`docs/`](docs).

## As páginas de apoio

| Página | Para que serve |
|---|---|
| **Projetos** | Criar, abrir e apagar projetos. Um projeto apagado vai para a lixeira, de onde dá para recuperar. |
| **Banco** | As mídias dos inserts, de todos os projetos. A IA descreve cada uma, e dá para cortar trechos de vídeo. |
| **Motions** | As animações prontas (HTML + GSAP) para os planos de motion. |
| **Referências** | Todos os planos dos seus vídeos editados, por categoria, para assistir e favoritar. |
| **Presets** | Os presets de enriquecimento (como as mídias entram e saem), para aprovar e ordenar. |
| **Transições** | A biblioteca de transições, a referência ao lado da recriação, e as favoritas de cada par de grupos. |
| **Calibragem** | Sobe os seus Reels editados. A IA analisa cada um e você revisa. |
| **Heurística da direção** | As regras do criador, as regras sugeridas pela IA e os roteiros de exemplo que guiam a direção. |
| **Configurações** (engrenagem) | Sobre o criador, motor de transcrição, margens dos cortes, pausas longas e modelos de IA. Abre na aba da etapa em que você está. |

| Projetos | Configurações |
|---|---|
| ![Tela de projetos](docs/img/projetos.png) | ![Configurações](docs/img/configuracoes.png) |

## Como rodar

**Requisitos:** macOS com Apple Silicon (o proxy e a exportação usam o VideoToolbox, e os modelos locais usam MLX), [uv](https://docs.astral.sh/uv/), Node 20+, `ffmpeg` (com `ffprobe`) no PATH e o Google Chrome (a exportação fotografa a camada dos inserts em navegadores escondidos).

```bash
git clone https://github.com/rtadewald/harness-video-editor.git
cd harness-video-editor
```

Crie `backend/.env` com as chaves (o arquivo é ignorado pelo git):

```env
OPENROUTER_API_KEY=...        # obrigatória: cortes, direção, análise das referências, descrição do banco
OPENROUTER_MODEL=google/gemini-3.8-flash
ELEVENLABS_API_KEY=...        # opcional: o motor de transcrição padrão e o isolamento de voz
```

Sem a `ELEVENLABS_API_KEY`, o app usa Whisper + stable-ts localmente e avisa o motivo. O ElevenLabs envia o áudio da sua voz a um serviço externo.

Suba tudo com um comando:

```bash
./dev.sh
```

- Interface: http://localhost:5173
- API: http://localhost:8000 (FastAPI)

Na primeira vez os modelos locais baixam sozinhos, o que demora um pouco.

Tudo o que o app guarda fica em `dados/`, fora do git: projetos, referências, banco, presets, sons, transições, trilhas e os modelos de visão. Para rodar duas cópias ao mesmo tempo (`git worktree`), ponha portas próprias num `.dev.env` (`HARNESS_API_PORT`, `HARNESS_FRONT_PORT`) e faça de `dados/` um link para a pasta da cópia principal.

### Testes

```bash
cd backend && uv run pytest -q     # não usa chaves nem rede
cd frontend && npm run build       # checa os tipos e gera o bundle
uv run --with playwright python ferramentas/e2e_sons_transicoes.py   # com o app no ar: os sons das transições no player, no navegador
```

## Estrutura

```text
backend/app/        FastAPI: pipeline, IA, vídeo e áudio (um módulo por área; as rotas em app/rotas/)
frontend/src/       React + Vite + Tailwind, uma pasta por área:
                      preprocessamento/ direcao/ inserts/ presets/ ator/ motions/ transicoes/ audio/ legenda/
                      player/ (a prévia), editor/ (o comum às etapas), paginas/, referencias/, components/
ferramentas/        scripts de apoio (montar presets, sons, LUTs, transições, trilhas, o teste de ponta a ponta dos sons)
dados/              os dados do app (fora do git)
docs/               o detalhe técnico de cada área
SPEC.md             a especificação: visão, cada etapa passo a passo, arquitetura, exportação, regras dos cortes
AGENTS.md           regras de trabalho do projeto
```
