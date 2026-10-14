# 01 · Preparar

O projeto criado e a matéria-prima pronta, **pelo pipeline do app** (o mesmo de quando Rodrigo cria pela tela):
enquadramento 16:9 → 9:16 (se precisar), proxy, silêncios, transcrição com IDs `w00000…` (motor padrão das
Configurações), alinhamento e **os cortes pela IA do app**. Também o rosto e a silhueta do ator, em segundo plano.

## Rodar

```bash
A projeto-criar "<caminho do bruto>" --nome "<nome curto do assunto>" [--briefing "<texto>"]   # imprime o id
A travar <id> preparar
A projeto-esperar <id>                    # até a transcrição e os cortes ficarem prontos
A projeto-ver <id>
```

- Se Rodrigo indicou um projeto que já existe ("edita o projeto X", ou um código PRJ-…), pule o `projeto-criar`
  (`A codigo PRJ-…` dá o id) e só trave e espere.
- O nome é curto e do assunto ("Melhor IA design"), não o nome do arquivo.
- O look, a velocidade e a legenda já nascem nos padrões do app (look Casa + vinheta Normal, 1×, palavra a palavra).

## Conferir

- Uma fala de 2 min tem ~300–400 palavras (`A palavras <id> | wc -w`); muito menos indica áudio ruim ou idioma errado.
- Pipeline com erro: leia a mensagem, destrave (`A destravar <id>`) e conte a Rodrigo; não contorne por fora do app.

Tempo esperado: 1–2 min para 2 min de bruto (a transcrição manda).
