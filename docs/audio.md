# Áudio

A etapa **Áudio** (SPEC §8.9), separada das Transições: a voz do ator (limpeza e timbre), a **faixa de fundo** e o
**mixer** das quatro trilhas — ator, sons dos presets, sons das transições e fundo.

Legenda de status: ✅ aprovado por Rodrigo · 💡 proposta técnica · ⏳ em aberto.

## Faixas de fundo

✅ **Geradas por IA, parecidas com as das nossas referências** (decisão de Rodrigo, out/2026): o Claude analisa a trilha
das referências e gera uma biblioteca de ~8 faixas com o **Lyria 3 Pro** (Google, pela OpenRouter, ~US$ 0,08 por
faixa). Na etapa, escolhe-se uma faixa por projeto (ou nenhuma), com ▶ para ouvir.

💡 A análise (`ferramentas/trilhas_analisar.py`): nos trechos das referências sem voz (pausas e planos sem fala), a música
de fundo aparece sozinha; mede-se o andamento (BPM), o nível em relação à voz (dB abaixo da fala) e se ela abaixa
quando a voz entra (ducking); um modelo multimodal ouve alguns trechos e descreve estilo, instrumentos e clima. Disso
saem os textos (prompts) para o Lyria, um por faixa, com variações de clima (mais calmo, mais energético, mais
"tech"…), sempre instrumental.

💡 A geração (`ferramentas/trilhas_gerar.py`): Lyria 3 Pro pela OpenRouter (`OPENROUTER_API_KEY`), faixas completas de
~2–3 min, salvas em `trilhas/` (dados, fora do git, com um `catalogo.json`: nome, clima, BPM, duração, o prompt usado).
Cada faixa é normalizada para o mesmo volume percebido.

💡 No vídeo, a faixa começa no início, se repete com crossfade se o vídeo for mais longo, e termina com um fade de ~1,5 s
no fim. Dados: `projeto.audio.fundo = <id> | null`.

## A voz do ator

✅ **Limpeza de ruído** (decisão de Rodrigo, out/2026): **DeepFilterNet** (local, grátis, boa para voz) como padrão, com
intensidade **Sem · Leve · Média · Forte**; e **"Isolamento máximo"** com o Voice Isolator do **ElevenLabs** (pago; a chave
já existe, envia o áudio da voz a um terceiro).

✅ **Equalização em uma cadeia fixa e boa:** limpeza → **timbre** (Natural · Quente · Clara: EQ de voz) → compressor leve
→ volume final em **−14 LUFS** (o padrão do Instagram).

💡 Como:
- A limpeza roda uma vez por escolha sobre o áudio inteiro do bruto (o tempo é o mesmo do bruto, então os cortes valem
  igual) e gera `midia/voz/<bruto>_<nivel>.wav`; um proxy com esse áudio (`-c:v copy`, rápido) passa a tocar na prévia.
  Se o DeepFilterNet não instalar no Mac, o plano B é o `arnndn` do ffmpeg (RNNoise).
- Timbre e compressor: na prévia, uma cadeia do Web Audio sobre o vídeo (filtros biquad + compressor); na exportação,
  `equalizer` + `acompressor` do ffmpeg, com os mesmos números.
- Dados: `projeto.audio.voz = { limpeza: 'sem'|'leve'|'media'|'forte'|'isolamento', timbre: 'natural'|'quente'|'clara' }`.

## O mixer

✅ **Quatro faders, em dB:** **Ator**, **Sons dos presets**, **Transições** e **Fundo** (de −12 a +6 dB; o fundo também
em "mudo"). O nível certo de cada trilha já vem do que foi medido nas referências; os faders são o ajuste por vídeo.

✅ **Ducking leve** (se as referências fizerem isso): a música abaixa um pouco enquanto o ator fala.

💡 Dados: `projeto.audio.niveis = { ator, presets, transicoes, fundo }` (dB). Na prévia, cada trilha tem um ganho no Web
Audio (o tocador dos sons ganha uma saída por trilha). Na exportação (SPEC §13), a mistura vira um grafo do ffmpeg:
voz (limpa) → timbre → compressor → ganho do ator; os sons dos presets e os das transições, cada grupo no seu ganho; a
faixa de fundo em loop, com fade, ganho e `sidechaincompress` pela voz (ducking); tudo somado e normalizado com
`loudnorm` para −14 LUFS.
