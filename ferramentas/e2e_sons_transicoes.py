"""Ferramenta: teste de ponta a ponta dos sons das transições no player do editor (etapa Transições), no navegador.

Põe uma transição com som em todos os cortes de um projeto (as escolhas dele voltam no fim) e confere, pelo registro
`window.__sonsLog` do front (`editor/sons.ts`): (A) o vídeo inteiro a 1× e a 2×: cada som uma vez, na hora; (B) o R em
cada corte: os sons do trecho uma vez, sem duplicar; (C) clicar num corte com o vídeo tocando: o som que estaria
soando no ponto do pulo (um riser já começado) entra. Precisa do app no ar (./dev.sh) e do Chrome.

    uv run --with playwright python ferramentas/e2e_sons_transicoes.py [projeto]
"""
import asyncio, json, sys, tempfile, urllib.request
from playwright.async_api import async_playwright
PID = sys.argv[1] if len(sys.argv) > 1 else 'melhor-ia-design'
BACKUP = f'{tempfile.gettempdir()}/escolhas_{PID}.json'
COM_SOM = ['corte-clique', 'subida-ao-corte', 'brilho-branco', 'zoom-desfoque', 'corte-camera', 'luz-colorida']

def put(campos):
    r = urllib.request.Request(f'http://localhost:8000/api/projetos/{PID}/transicoes', data=json.dumps({'campos': campos}).encode(), method='PUT', headers={'content-type': 'application/json'})
    return json.load(urllib.request.urlopen(r))

def seg(txt):  # "0:12.6" → 12.6
    m, s = txt.split(':'); return int(m) * 60 + float(s)

async def main():
    falhas = []
    durs = {x['id']: x['duracao'] for x in json.load(urllib.request.urlopen('http://localhost:8000/api/sons'))['sons']}
    soa = lambda e: e['dur'] if e['dur'] is not None else durs.get(e['som'], 0.25) - 0.15  # até onde o som ainda soa (o fim de um arquivo é quase silêncio)
    # todos os cortes com uma transição com som, em rodízio
    json.dump(json.load(urllib.request.urlopen(f'http://localhost:8000/api/projetos/{PID}/transicoes')), open(BACKUP, 'w'))
    put({f'p{k}': {'id': COM_SOM[k % len(COM_SOM)]} for k in range(2, 60)})
    async with async_playwright() as pw:
        br = await pw.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
        pg = await br.new_page(viewport={'width': 1900, 'height': 1050})
        erros = []; pg.on('pageerror', lambda e: erros.append(str(e)))
        await pg.add_init_script('window.__sonsLog = []')
        await pg.goto(f'http://localhost:5173/p/{PID}'); await pg.wait_for_timeout(3000)
        await pg.get_by_role('button', name='Transições').last.click(); await pg.wait_for_timeout(3000)
        await pg.mouse.click(450, 75)  # um gesto (no cabeçalho da coluna): o áudio acorda
        esperados = await pg.evaluate('window.__sonsEsperados')
        print('eventos esperados', len(esperados))
        log = lambda: pg.evaluate("window.__sonsLog.filter(x => x.grupo === 'transicoes')")
        limpar = lambda: pg.evaluate('window.__sonsLog.length = 0')
        dur = await pg.evaluate("document.body.innerText.match(/\\/ ?(\\d+:\\d+[.,]\\d)/)[1]")
        dur = seg(dur.replace(',', '.'))

        # A: o vídeo inteiro, a 1× e a 2×
        for vel in ('1×', '2×'):
            await pg.get_by_role('button', name=vel, exact=True).first.click()
            if await pg.get_by_role('button', name='Pausar', exact=True).count(): await pg.get_by_role('button', name='Pausar', exact=True).click()
            await pg.get_by_role('button', name='Voltar ao início').click(); await pg.wait_for_timeout(500)
            await limpar()
            await pg.get_by_role('button', name='Tocar', exact=True).click()
            await pg.wait_for_timeout(int(dur / (1 if vel == '1×' else 2) * 1000) + 1500)
            l = await log()
            for e in esperados:
                n = [x for x in l if x['som'] == e['som'] and abs(x['t'] - e['t']) < 0.01]
                if len(n) != 1:
                    falhas.append(f"A {vel}: {e['som']} @ {e['t']:.2f} tocou {len(n)}×")
                elif abs(n[0]['atrasado']) > 0.12:
                    falhas.append(f"A {vel}: {e['som']} @ {e['t']:.2f} fora de hora ({n[0]['atrasado']:+.3f} s)")
            print(f'A {vel}: {len(l)} sons para {len(esperados)} esperados')
        await pg.get_by_role('button', name='1×', exact=True).first.click()

        # os cortes na trilha Transições (o título começa pelo tempo do corte)
        cortes = await pg.evaluate("""[...document.querySelectorAll('button[title]')].map(b => b.title).filter(t => /^\\d+:\\d+[.,]\\d+ · .+ → .+ · /.test(t))""")
        tempos = sorted({seg(t.split(' · ')[0].replace(',', '.')) for t in cortes})
        print('cortes na trilha', len(tempos))

        async def clicar_corte(t):
            await pg.evaluate("""(t) => { const b = [...document.querySelectorAll('button[title]')].find(b => /^\\d+:\\d+[.,]\\d+ · .+ → .+ · /.test(b.title) && Math.abs((+b.title.split(' · ')[0].split(':')[0]) * 60 + parseFloat(b.title.split(' · ')[0].split(':')[1].replace(',', '.')) - t) < 0.06); b.scrollIntoView({block: 'nearest', inline: 'center'}); b.click() }""", t)

        # B: R em cada corte
        for t in tempos:
            await pg.get_by_role('button', name='Pausar', exact=True).click() if await pg.get_by_role('button', name='Pausar', exact=True).count() else None
            await clicar_corte(t); await pg.wait_for_timeout(400)
            await limpar()
            await pg.keyboard.press('r'); await pg.wait_for_timeout(3600)
            l = await log()
            janela = [e for e in esperados if t - 1.5 - 0.05 <= e['t'] <= t + 1.5 and e['t'] + soa(e) > t - 1.5]
            for e in janela:
                n = [x for x in l if x['som'] == e['som'] and abs(x['t'] - e['t']) < 0.01]
                if len(n) != 1:
                    falhas.append(f"B R no corte {t:.2f}: {e['som']} @ {e['t']:.2f} tocou {len(n)}×")
            # fora da janela só vale a cauda de um som que ainda soava no ponto do play (até 2,5 s antes); e nada duplicado
            extras = [x for x in l if not any(abs(x['t'] - e['t']) < 0.01 for e in janela) and not (t - 1.5 - 2.5 <= x['t'] < t - 1.5)]
            dup = [x for x in l if sum(abs(y['t'] - x['t']) < 0.01 and y['som'] == x['som'] for y in l) > 1]
            if dup: falhas.append(f'B R no corte {t:.2f}: duplicados {dup}')
            if extras:
                falhas.append(f"B R no corte {t:.2f}: sons fora da janela {[(x['som'], round(x['t'], 2)) for x in extras]}")

        # C: com o vídeo tocando, clicar em cada corte (o player pula para 0,4 s antes dele)
        await pg.get_by_role('button', name='Voltar ao início').click()
        for t in tempos:
            if not await pg.get_by_role('button', name='Pausar', exact=True).count():
                await pg.get_by_role('button', name='Tocar', exact=True).click(); await pg.wait_for_timeout(300)
            await limpar()
            await clicar_corte(t); await pg.wait_for_timeout(1200)
            l = await log()
            # o som deste corte (o que estaria soando 0,4 s antes do corte ou começa até 1,2 s depois)
            for e in esperados:
                if e['t'] <= t - 0.4 < e['t'] + soa(e) or t - 0.4 < e['t'] <= t + 0.75:
                    n = [x for x in l if x['som'] == e['som'] and abs(x['t'] - e['t']) < 0.01]
                    if len(n) != 1:
                        falhas.append(f"C pulo para o corte {t:.2f}: {e['som']} @ {e['t']:.2f} tocou {len(n)}×")
        if await pg.get_by_role('button', name='Pausar', exact=True).count():
            await pg.get_by_role('button', name='Pausar', exact=True).click()
        print('erros da página', erros)
        await br.close()
    print('\nFALHAS' if falhas else '\nTUDO CERTO', len(falhas))
    for f in falhas: print(' -', f)

try:
    asyncio.run(main())
finally:
    antes = json.load(open(BACKUP))
    put({f'p{k}': None for k in range(1, 60)})
    print('restaurado', put(antes) == antes)
