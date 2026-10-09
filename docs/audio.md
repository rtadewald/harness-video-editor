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
no fim. Dados: `projeto.audio.fundo = <id> | null`. (Como ficou: em "O fundo", abaixo — o crossfade emenda as voltas no
trecho estável da faixa.)

## A voz do ator

✅ **Limpeza de ruído** (decisão de Rodrigo, out/2026): **DeepFilterNet** (local, grátis, boa para voz) como padrão, com
intensidade **Sem · Leve · Média · Forte**; e **"Isolamento máximo"** com o Voice Isolator do **ElevenLabs** (pago; a chave
já existe, envia o áudio da voz a um terceiro).

✅ **Equalização em uma cadeia fixa e boa:** limpeza → **timbre** (Natural · Quente · Clara: EQ de voz) → compressor leve
→ volume final em **−14 LUFS** (o padrão do Instagram).

💡 Como:
- A limpeza roda uma vez por escolha sobre o áudio inteiro do bruto (o tempo é o mesmo do bruto, então os cortes valem
  igual) e gera `midia/voz/<bruto>_<nivel>.wav`; um proxy com esse áudio (`-c:v copy`, rápido) passa a tocar na prévia.
  ~~Se o DeepFilterNet não instalar no Mac, o plano B é o `arnndn` do ffmpeg (RNNoise).~~ O DeepFilterNet instalou; se
  ele falhar numa exportação, o plano B é a voz do bruto, com um aviso (em "A voz", abaixo).
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
`loudnorm` para −14 LUFS. (Como ficou: o ducking é uma curva calculada das palavras, `volume` com `eval=frame`, a mesma
na prévia; e o −14 é um ganho medido antes mais um limitador de pico — em "O fundo" e "−14 LUFS", abaixo.)

## Como ficou (P3, out/2026)

💡 **A música das referências** (`ferramentas/trilhas_analisar.py` → `trilhas/analise.json`): o Demucs (htdemucs)
separa a voz do resto nos primeiros 90 s de cada referência. Medido nas janelas de 0,4 s com fala, pela mediana (que
deixa de fora os golpes dos efeitos): **as 10 referências têm música**, em média **13 dB abaixo da voz** (de −6 a
−29 dB), de 78 a 152 BPM. O **ducking não dá para medir**: as referências cortadas quase não têm pausas sem fala.
Um modelo que ouve áudio (Gemini 2.5 Flash, pela OpenRouter) descreveu o estilo em comum: eletrônica downtempo / lo-fi /
cinemática, calma a levemente inspiradora, com pads, piano, arpejos e beats discretos, deixando os médios livres para a
voz. A descrição fica no `analise.json`.

💡 **A biblioteca** (`ferramentas/trilhas_gerar.py`): 8 faixas do Lyria 3 Pro (`google/lyria-3-pro-preview`, pelo chat
completions da OpenRouter com `modalities: ['text', 'audio']` e streaming; a resposta vem em base64, um MP3 de ~2 min).
Os prompts saem da análise, um clima por faixa (Piano lo-fi, Arpejo suave, Pads ambiente, Chillhop, Sinos leves,
Cinemático, Grave tech, Piano pulsante), sempre instrumentais, com os médios livres e a energia constante (para fazer
loop). Cada faixa é normalizada para **−16 LUFS** (`trilhas.LUFS`) e gravada em `trilhas/<id>.m4a` com o
`catalogo.json` (nome, clima, BPM medido, duração, o prompt). Custo: US$ 0,08 por faixa.

💡 **A voz** (`audio.py`): o DeepFilterNet 3 roda num ambiente Python à parte (o 0.5.6 pede o torchaudio antigo:
`uv run --no-project --python 3.11` com torch 2.3.1; o app chama `_voz_deepfilter.py` por subprocesso) e limpa 30 s de
voz em ~0,7 s. **Leve · Média · Forte** = o limite do quanto ele pode abaixar o ruído: 6, 12 e 24 dB (medido no vídeo de
teste: o chão de ruído cai de −58,6 para −64,6 / −70,6 dBFS e a fala fica igual; sem limite, as pausas viram silêncio
digital, por isso o Forte para em 24 dB). O **padrão é Leve**, também para os projetos de antes da P3. O "isolamento
máximo" manda a voz ao Voice Isolator do ElevenLabs (`/v1/audio-isolation`) e pede confirmação na tela. A limpeza roda
em segundo plano quando o projeto abre no editor, em qualquer etapa (ou na exportação, se ainda faltar), e gera a voz e
um proxy com ela (o vídeo copiado), que a prévia passa a tocar.

💡 **Quando a limpeza roda** (revisão da P3): só quando falta — nunca feita, ou o proxy com ela é de outra versão do
vídeo — **e o proxy do vídeo de agora existe** (num projeto novo, espera o pipeline fazê-lo; a tela mostra "esperando o
vídeo"). Uma que **falhou fica em erro** até o criador pedir de novo ("Tentar de novo" na etapa, ou escolher a mesma
limpeza): antes, cada leitura do áudio a refazia, num laço sem fim com a tela presa em "limpando…". O **isolamento**
(pago) nunca roda sozinho: só pedido na tela (com a confirmação), ou se a voz dele já existe e falta só o proxy. Num
reinício do servidor, as locais interrompidas voltam à fila; o isolamento interrompido vira erro, para pedir de novo.
Enquanto uma limpeza nova é feita, a prévia continua com a voz que já tocava (o player não recarrega à toa); com erro,
volta à voz do bruto, como o MP4. Quando o src muda (a limpeza nova fica pronta), o player continua do mesmo ponto,
tocando se tocava. Ao ficar pronta, os proxies com a voz das outras limpezas são apagados (~50 MB cada para 2 min; se a
escolha voltar, o proxy é refeito em segundos a partir do wav, que fica). 💡 O mesmo vale ao voltar para uma limpeza que
já estava pronta (sem job novo) ou para "Sem limpeza": os proxies que a escolha não usa saem 10 s depois (a prévia ainda
toca o anterior). Uma limpeza que termina depois de o criador ter escolhido outra (já pronta) apaga o próprio proxy, e a
escolhida nunca é apagada; enquanto a escolhida ainda roda, nada é apagado.

💡 **Reenquadrar**: o Reenquadrar tira o proxy do bruto enquanto o refaz (o arquivo velho fica até o novo o substituir).
A limpeza não monta o proxy com a voz nesse intervalo, e uma que estava rodando confere a versão do vídeo no fim e
descarta o resultado se ela mudou (como o recorte do ator). A prévia só usa o proxy com a voz se ele for da versão de
agora (senão, o do bruto) e relê o áudio quando o vídeo do player muda (o proxy fica pronto, um Reenquadrar termina).
O áudio do bruto não muda num Reenquadrar, então o wav da voz limpa continua valendo.

💡 **Sem a limpeza na exportação** (plano B): se o DeepFilterNet não roda (sem rede para o `uv` montar o ambiente, por
exemplo) ou o ElevenLabs não responde, a exportação sai com a voz do bruto e um aviso no fim ("Não deu para limpar a
voz…"), em vez de falhar. O cancelar é conferido antes e depois da limpeza e da medida do −14.

💡 **A cadeia** é a mesma nos dois lados (os números vêm do backend em `/api/audio`): passa-altas de 80 Hz → timbre
(Quente: +2,5 dB em 180 Hz e −1,5 dB em 3,5 kHz; Clara: −2 dB em 250 Hz e +3 dB em 4,5 kHz) → compressor (−20 dB,
2,5:1, 10 ms / 150 ms, joelho 6 dB) → fader do Ator. Prévia: a voz do player passa pelo Web Audio (`BiquadFilter`,
`DynamicsCompressor`, `GainNode`); os sons dos presets e os das transições têm um barramento cada (os faders). MP4: a voz
vem de uma entrada própria (a limpa), cortada nos clipes da V1 como o `_ator` (a voz do bruto vai para um `anullsink`),
com `highpass`, `equalizer`, `acompressor` e `volume`; os sons de cada grupo multiplicados pelo fader.

💡 **O mesmo resultado, não só os mesmos números** (revisão da P3):
- O `DynamicsCompressorNode` do navegador aplica sozinho um ganho de compensação (makeup: (1 / curva(0 dBFS))^0,6, a
  conta do Chromium) que o `acompressor` não aplica: com estes números, +6,2 dB — a voz tocava na prévia 6 dB acima do
  fundo e dos sons em relação ao MP4. A prévia agora o desfaz com um `GainNode` (`makeupDoCompressor` em `audio.ts`,
  calculado dos números do catálogo). Medido com um seno de 220 Hz (Chrome `OfflineAudioContext` × ffmpeg): −0,07 ×
  −0,08 dB a 0,03 de amplitude, −0,07 × −0,32 dB a 0,1; só bem acima do limiar sobra diferença (−3,8 × −5,3 dB a 0,3,
  13 dB acima dele: o detector e o joelho de cada um), onde a voz quase nunca chega (fala em ~−27 LUFS).
- O passa-altas da prévia usa Q −3,01 dB (no Web Audio, o Q do passa-altas é em dB): Butterworth, como o `highpass`
  do ffmpeg (antes, Q 1 dB, com um pico perto de 80 Hz).
- **A voz em estéreo com ganho 1**: o navegador toca um mono igual nos dois canais; no ffmpeg, o `aformat` estéreo
  baixava 3 dB por canal, e sem nenhum som o `amix` com o fundo saía em mono (a música perdia o estéreo). Agora a voz
  sai da cadeia com `pan=stereo|c0=c0|c1=c0`. E a média dos canais do bruto é explícita (`pan`; o `aformat`/`-ac 1` do
  ffmpeg só faz a média em formatos inteiros — em float soma, +3 dB). O proxy com a voz continua mono (o navegador o
  toca igual nos dois canais).
- **A sonoridade da voz** (`voz_lufs`, a base do fundo) é medida como ela entra na mistura (mono pela média, nos dois
  canais): o mono medido sozinho dava 3 LU a menos que a voz do bruto (−30,3 × −27,2 no vídeo de teste), e o fundo
  ficava 14 dB abaixo da voz limpa em vez de 11. O cache novo é `audio.voz_lufs` (o antigo, `audio.lufs`, é descartado).

💡 **O fundo**: **11 dB abaixo da voz** (a sonoridade da voz da escolha, medida uma vez e guardada no projeto,
menos 11, mais o fader) e **3 dB a menos enquanto o ator fala** (o ducking leve: dá os ~14 dB abaixo da voz na fala,
perto do medido). As falas saem das palavras no tempo da saída, juntas quando a pausa é menor que 0,6 s; a música abaixa
0,15 s antes e volta em 0,35 s (smoothstep). O mesmo ganho na prévia (o elemento de áudio da faixa, sincronizado com o
relógio da saída, num `GainNode`) e no MP4 (`volume` com `eval=frame`); fade de 1,5 s no fim. Num Reels bem cortado
quase não há pausas de 0,6 s: na prática, a música fica no nível da fala o vídeo todo.

💡 **As voltas do fundo** (revisão da P3): as faixas do Lyria começam baixo (−17 a −34 dB no 1º segundo) e terminam
sumindo (−64 a −91 dB no último), então repetir a faixa inteira deixava um buraco. Cada faixa tem um **laço**, o trecho
estável (`trilhas.laco`: onde a energia em janelas de 2 s fica a menos de 5 dB da mediana; nas 8 faixas, começa entre
0 e 18,5 s e termina entre 109 e 120 s), medido uma vez por arquivo. A 1ª volta toca do 0 até o fim do laço; as outras,
dentro dele, cada uma entrando com um **crossfade de 2 s** de potência constante (`audio.voltas_do_fundo` +
`acrossfade` com `qsin` no MP4; na prévia, `pedacosDoFundo` com dois elementos de áudio que se alternam, com os mesmos
ganhos). Um vídeo mais curto que o laço toca a faixa do começo, como antes. O fundo da prévia também acompanha a
velocidade do player (0,25× a 2×) e para enquanto o vídeo para.

~~💡 **−14 LUFS** (pico −1,5 dBTP) em duas passadas: o áudio inteiro sozinho medido pelo `loudnorm`, e a passada final
com o `loudnorm` linear com essas medidas.~~ Na revisão da P3: o `loudnorm` não ficava linear — a voz tem ~19 dB entre o
pico e a sonoridade, e o ganho até −14 levaria o pico acima de −1,5 dBTP; ele voltava sozinho ao modo dinâmico, que
entregou de −14,2 a −15,7 LUFS conforme a mistura.

💡 **−14 LUFS** (pico ≤ −1,5 dBTP), como ficou: um **ganho** e um **limitador de pico** (`alimiter` a −2 dBFS, ataque
5 ms, soltura 50 ms, sem o nível automático, com o atraso compensado). O ganho parte da sonoridade da voz (o grosso da
mistura: −14 − voz_lufs − fader do ator) e é corrigido pelo medido (`ebur128`) na mistura inteira já com o limitador,
só o áudio, até ficar a 0,3 LU do alvo (`audio.medir`; em geral 1 passada, ~2,5 s para 1 min). Medido no vídeo de teste
(1:02, voz Leve): sem fundo −14,3 LUFS, com o Piano lo-fi −14,2 LUFS, pico −1,9 dBTP; o MP4 exportado (720p) deu −14,2
LUFS e −1,9 dBTP, com o fundo em estéreo. O teste usa uma voz sintética com os picos de uma voz real (~20 dB acima da
sonoridade), não um seno. A prévia toca no nível de trabalho (sem a normalização).

💡 **A etapa Áudio** segue o arranjo da de Inserts, tudo à vista: à esquerda a voz (limpeza com o estado, timbre) e as
faixas (▶ para ouvir sozinha, escolher, "Sem fundo"); no meio a prévia com o quadro montado; à direita o mixer (quatro
faders verticais de −12 a +6 dB, duplo clique volta a 0; o fundo com "mudo"); embaixo a linha do tempo com as falas, os
sons das transições e a curva do nível do fundo. A cadeia da voz e os faders valem em todas as etapas; o fundo toca nas
etapas com o vídeo montado (fora do Pré-processamento). 💡 Com erro na limpeza, "Tentar de novo" ao lado da mensagem;
desligar o isolamento volta à limpeza de antes dele (ou à Leve); com "Sem fundo", o fader do Fundo e o mudo ficam
apagados. 💡 Rodada 2 da QA: o ▶ de uma faixa a toca sozinha de verdade — com a prévia tocando, ela pausa (antes
seguiam a voz, o fundo escolhido e a faixa ouvida juntos) — e dar play na prévia para a faixa que se estava ouvindo.

💡 **Dados** (`projeto.audio`): `voz {limpeza, timbre}`, `fundo` (id da faixa ou null), `fundo_mudo`, `niveis {ator,
presets, transicoes, fundo}` (dB) — as escolhas; e o que o app grava: `limpezas.<nível> = {estado: fila | rodando |
pronta | erro, progresso, erro}` (a limpeza de cada nível; sem entrada = falta) e `voz_lufs.<bruto>_<nível>` (a
sonoridade da voz medida, o cache da base do fundo). Arquivos: `midia/voz/<bruto>_<nível>.wav` e
`midia/proxy/<bruto>_voz_<nível>[_v<versão>].mp4`. A exportação grava `exportacao.aviso` quando sai com ressalva.

⏳ A linha do tempo da etapa mostra os sons das transições; os dos presets (que dependem das receitas dos inserts e das
páginas dos motions) ainda não aparecem nela, só tocam.

💡 **Sem voz nas faixas** (conferido em out/2026): o Demucs separa cada faixa gerada e mede o stem de voz. Em 7 das 8
ele fica 26 dB ou mais abaixo da música no pior trecho de 0,5 s (nada). Em **Sinos leves** o "stem de voz" chega a
−17,5 dB, igual em duas gerações — mesmo depois de o prompt proibir vocal chops e samples de voz (o `COMUM` do
`trilhas_gerar.py` agora pede isso para todas). O mais provável é o timbre de sino enganar o separador; ⏳ confirmar de
ouvido. Custo total da biblioteca: US$ 0,72 (9 gerações).
