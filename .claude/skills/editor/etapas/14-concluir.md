# 14 · Concluir um vídeo: aprendizados e faxina do banco

Depois do vídeo aprovado e exportado (`12-final.md`), feche o ciclo. É aqui que a skill aprende: o que Rodrigo corrigiu
num vídeo não pode se repetir no próximo. Os aprendizados são **sobre usar o app** (Q22): (1) **mudanças concretas no
app** — uma regra na Heurística, as favoritas de presets ou transições, um padrão das Configurações, a identidade dos
motions, um preset ou motion recusado com o motivo — e (2) **notas de uso** por etapa, em `aprendizados/<área>.md`. Na
dúvida, (1).

## 1. Aprendizados (com Rodrigo)

1. **Junte o que aconteceu:** `A revisao-ler <id> --versao N` para cada versão revisada (os comentários, as suas
   respostas e os anexos), as respostas dele às suas dúvidas, o que você mesmo corrigiu na checagem, e o que ele mudou
   à mão nas etapas (`A versoes <id>` lista as marcas de mão: são gostos dele).
2. **Extraia.** Para cada coisa, pergunte: vale para os próximos vídeos ou só para este?
   - Correção pontual ("aqui prefiro o outro site") **não** é aprendizado.
   - Um gosto que pode se repetir ("lettering demais", "esse motion fica poluído", "trilha alta") é.
   - Um **defeito** do app (palavra cortada na emenda, captura com tela branca, som estourado) é aprendizado **e** pede
     correção no código do app: corrija e anote "corrigido em <arquivo>".
   - Antes, leia o `aprendizados/<área>.md`: se já existe, reforce (some a origem) em vez de repetir.
3. **Mostre a Rodrigo antes de gravar**, numa lista curta por área:
   ```text
   Aprendizados do PRJ-07 (v3 aprovada):
   app · Heurística › Regras do criador: "no máximo 1 lettering a cada ~10 s"  (v1 c4)
   app · Presets: tirar o Mergulho das favoritas de tela cheia  (v2 c1, c3)
   inserts · [gosto] prefira gravação de tela rolando a print parado quando a fala cita um site  (v1 c2)
   cortes · [defeito] o "m" de "mas" vazou na emenda → corrigido em backend/app/cortes.py  (checagem)
   Confirma? Pode cortar, mudar o texto ou acrescentar.
   ```
   Grave **só o que ele confirmar**, com o texto que ele aprovar.
4. **Grave:**
   - **Regras de direção** (que plano, quando, abertura, ritmo, lettering como decisão de roteiro): nas **Regras do
     criador** em `exemplos/regras.md` (é o mesmo arquivo da página Heurística do app; a diretora lê).
   - **Favoritas, padrões, identidade**: pelas páginas do app (Presets, Transições, Configurações) ou pela CLI.
   - **Preset ou motion que ele não quer mais**: recusado com o motivo (página Presets/Motions).
   - **Notas de uso**: no `aprendizados/<área>.md` (a página **Aprendizados** do app mostra e edita os mesmos), no formato:
     ```markdown
     - **[gosto]** Prefira gravação de tela rolando a print parado quando a fala cita um site.
       _PRJ-07·v1 c2 · 2026-10-14_ · ![exemplo](imagens/prj07-c2.png)
     ```
     Um print ajuda quando o texto é ambíguo: copie o anexo do comentário (`dados/projetos/<id>/revisoes/anexos/…`) ou
     um quadro (`A quadros`) para `aprendizados/imagens/<prj>-<cN>.png`.

| Área | Arquivo | Lido em |
|---|---|---|
| Cortes | `aprendizados/cortes.md` | `02-cortes.md` |
| Direção | `exemplos/regras.md` (Regras do criador; página Heurística) | `03-direcao.md` e a diretora do app |
| Inserts | `aprendizados/inserts.md` | `04-inserts.md` e o prompt dos subagentes |
| Enriquecimento | `aprendizados/enriquecimento.md` | `05-enriquecimento.md` |
| Motions | `aprendizados/motions.md` (+ a identidade nas Configurações) | `06-…` e o subagente de motion |
| Elementos | `aprendizados/elementos.md` | `06-…` e `03-direcao.md` |
| Transições | `aprendizados/transicoes.md` | `07-transicoes.md` |
| Áudio | `aprendizados/audio.md` | `08-audio.md` |
| Legenda | `aprendizados/legenda.md` | `09-legenda.md` |
| Checagem e entrega | `aprendizados/render.md` | `10-checagem.md` |

## 2. Faxina do banco

1. `A banco-do-projeto <id>`: o que você trouxe para este vídeo, com o selo.
2. **Não apague.** Com a versão aprovada, os selos se resolvem sozinhos: o que entrou no vídeo vira **★ Usado**, o que
   você trouxe e ficou de fora vira **✗ Recusado**. As recusadas só saem quando Rodrigo clica em "Limpar recusados" no
   Banco do app (vão para `dados/banco/_lixeira/`, recuperável); antes disso ele pode promover qualquer uma a ✓ Aprovado.
3. **Melhore a descrição** das que ficaram, para servirem de novo: `A banco-editar <BAN-…> --nome … --descricao "o que
   aparece e o que ilustrou neste vídeo" --palavras a,b,c`. Só um pedaço presta: `A banco-trecho`.

## 3. Consolidar (a cada 5 vídeos aprovados)

Os `aprendizados/` são lidos em toda edição: precisam ficar curtos. A cada 5 referências `prj-*` na Calibragem, releia
cada arquivo: junte bullets iguais (somando as origens), tire os defeitos que já viraram correção no código e os gostos
que Rodrigo desmentiu depois. Mostre o antes e o depois em poucas linhas e grave com o "ok" dele.

## No fim

Diga a Rodrigo, em 3 linhas: quantos aprendizados entraram e onde, quantas mídias ficaram recusadas no banco (ele limpa
quando quiser) e quantas ganharam descrição melhor, e que a referência está na Calibragem esperando a revisão dele.
