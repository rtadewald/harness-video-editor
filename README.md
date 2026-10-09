# Harness Video Editor

Editor de vídeo local onde a **IA faz cada etapa da edição** e você corrige numa interface no estilo Premiere.

![Linha do tempo vertical da etapa de Cortes](docs/img/demo.gif)

Você sobe o vídeo bruto e a IA propõe a edição, etapa por etapa: **Pré-processamento → Direção visual → Inserts → Transições → Áudio → Legenda**. Cada etapa tem controles manuais para corrigir o que a IA decidiu, e o render final só acontece depois que os cortes são aprovados.

> **Estado atual:** os **Cortes** (no Pré-processamento), a **Direção visual**, os **Inserts** (mídias, presets, motions, sons) e a **exportação** são reais. A direção aprende com os seus vídeos editados na **Calibragem**. Look e Enquadramento (no Pré-processamento), Transições, Áudio e Legenda também são reais (cada um com o seu doc em `docs/`). O agente de chat ainda não foi feito.

## O que a etapa de Cortes faz

1. Gera um proxy 720p do vídeo, detecta silêncios e desenha a forma de onda.
2. Transcreve o áudio com timestamps por palavra. O motor padrão é o **ElevenLabs Scribe v2**, e dá para trocar em Configurações. Os outros motores (Whisper + stable-ts, Qwen3-ASR, Parakeet, entre outros) rodam em segundo plano e dá para comparar dois lado a lado.
3. Um LLM (via OpenRouter) decide **quais palavras ficam**, tirando retomadas, erros e falsos começos. O código calcula os tempos exatos e cola o corte dentro de uma pausa real do áudio.
4. Você revisa numa **linha do tempo vertical**, com a onda e cada palavra no seu milissegundo:
   - arrastar a borda de um corte, com ímã nas palavras e pausas;
   - **✂ Cortar trecho** para criar um corte à mão e **✕** para excluir um corte;
   - Resultado ou Bruto, velocidade de play de 0,25× a 2×, e Expandir ou Compactar tudo;
   - **Refazer** (pede nova seleção à IA) e **Recalcular** (refaz os trechos com as margens atuais, sem chamar a IA).
5. **Configurações → Cortes** (salvas na hora como padrão): motor de transcrição, margens antes e depois do corte, e a partir de quantos segundos uma pausa dentro de um trecho mantido é encurtada.

| Projetos | Configurações |
|---|---|
| ![Tela de projetos](docs/img/projetos.png) | ![Configurações](docs/img/configuracoes.png) |

## Calibragem e Referências (a Direção visual aprende com os seus vídeos)

Na aba **Calibragem** você sobe Reels já editados (vários de uma vez). Cada um é analisado em segundo plano: o detector de cena acha os cortes, a fala é transcrita e um modelo multimodal (Gemini via OpenRouter) assiste a cada trecho e diz qual **plano-base** está na tela (Full ator, Full ator com lettering, Insert tela cheia, Motion tela cheia, Tela dividida, Comentário + insert + ator), quais **elementos** aparecem por cima, o que aparece, o texto exato e **como gerar** cada insert. Cada bloco também recebe a **função da fala** (gancho, cita ferramenta, explica conceito, CTA…). Você revisa numa timeline vertical; os **indicadores** (que fala pede que plano, o que vem depois, durações, abertura e fechamento) viram uma **heurística** editável que guia a direção dos projetos.

Na aba **Referências** ficam todos os planos identificados, por categoria, para assistir um a um e favoritar.

Dentro do projeto, a etapa **Direção visual** propõe o que mostrar em cada momento do vídeo cortado, seguindo as suas regras, a heurística e os exemplos.

## Como rodar

**Requisitos:** macOS com Apple Silicon (o proxy usa VideoToolbox e os modelos locais usam MLX), [uv](https://docs.astral.sh/uv/), Node 20+ e `ffmpeg` (com `ffprobe`) no PATH.

```bash
git clone https://github.com/rtadewald/harness-video-editor.git
cd harness-video-editor
```

Crie `backend/.env` com as chaves (o arquivo é ignorado pelo git):

```env
OPENROUTER_API_KEY=...        # obrigatória: o LLM que escolhe o que fica
OPENROUTER_MODEL=google/gemini-3.8-flash
ELEVENLABS_API_KEY=...        # opcional: motor de transcrição padrão
```

Sem `ELEVENLABS_API_KEY` o app usa Whisper + stable-ts localmente e avisa o motivo. O ElevenLabs envia o áudio da sua voz a um serviço externo.

Suba tudo com um comando:

```bash
./dev.sh
```

- Interface: http://localhost:5173
- API: http://localhost:8000 (FastAPI)

Na primeira vez os modelos locais baixam sozinhos, o que demora um pouco. Os projetos ficam em `projetos/` (ignorada pelo git).

### Testes

```bash
cd backend && uv run pytest -q     # não usa chaves nem rede
cd frontend && npm run build       # checa os tipos e gera o bundle
```

## Estrutura

```
backend/    FastAPI + pipeline (proxy, silêncios, transcrição, cortes por LLM)
frontend/   React + Vite + Tailwind (linha do tempo vertical, player, configurações)
SPEC.md     especificação completa e aprendizados medidos de cada motor
AGENTS.md   regras de trabalho do projeto
docs/img/   prints e GIF deste README
```

A especificação detalhada, incluindo as regras editoriais de corte (§14) e a comparação medida entre motores de transcrição (§16), está em [SPEC.md](SPEC.md).
