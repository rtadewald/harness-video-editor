"""Motions (SPEC §8.5; docs/motions.md): os presets, a página do motion e o motion de cada plano (preset ou vídeo)."""
import json
import re

from apoio import criar_projeto as _criar


def _dados(pagina: str) -> dict:
    return json.loads(re.search(r'window.MOTION=(.*?)</script>', pagina).group(1).replace('<\\/', '</'))


def _item(tmp_path, bid, tipo, **extra):
    pasta = tmp_path / 'banco' / bid
    pasta.mkdir(parents=True)
    (pasta / 'item.json').write_text(json.dumps({'id': bid, 'nome': f'item {bid}', 'tipo': tipo, **extra}), encoding='utf-8')


def test_presets_declaram_nome_campos_e_fundo(cliente):
    presets = {p['id']: p for p in cliente.get('/api/motions/presets').json()}
    assert {'claude-code', 'lettering', 'prompt', 'site'} <= set(presets)
    assert presets['site']['campos']['url']['tipo'] == 'texto' and presets['lettering']['fundo'] == 'chuva'
    pagina = cliente.get('/api/motions/presets/lettering/pagina?formato=dividida&duracao=2&valores={"destaque":"Code </script>"}').text
    d = _dados(pagina)
    assert (d['largura'], d['altura'], d['duracao']) == (1080, 960, 2.0)
    assert d['campos'] == {'texto': 'Image to', 'destaque': 'Code </script>'}  # o que não veio fica no padrão
    assert pagina.index('/motion/runtime.js') < pagina.index('motion.pronto')  # o runtime existe antes do preset rodar
    assert cliente.get('/api/motions/presets/..%2Fx/pagina').status_code == 404
    assert cliente.get('/api/motions/fonte/rounded').status_code == 200 and cliente.get('/api/motions/fonte/x').status_code == 404


# um preset de teste com campo de imagem (nenhum dos de verdade tem, mas o tipo existe)
TESTE = '''<script type="application/json" id="preset">{"nome": "Busca → página do site", "fundo": "nevoa", "duracao": 3}</script>
<script type="application/json" id="campos">{"url": {"tipo": "texto", "rotulo": "URL", "padrao": "x.com"}, "pagina": {"tipo": "imagem", "rotulo": "Página"}}</script>
<script>motion.pronto(gsap.timeline({paused: true}))</script>'''


def test_preset_e_video_no_plano(cliente, video, tmp_path, monkeypatch):
    from app import motions
    monkeypatch.setattr(motions, 'PRESETS', tmp_path / 'presets_motion')
    motions.PRESETS.mkdir()
    (motions.PRESETS / 'site.html').write_text(TESTE, encoding='utf-8')
    id = _criar(cliente, video)['id']
    _item(tmp_path, 'aaaaaaaaaa', 'imagem')
    _item(tmp_path, 'cccccccccc', 'video')
    _item(tmp_path, 'bbbbbbbbbb', 'video', pai='cccccccccc', inicio=4.5, fim=7.0)  # um trecho do vídeo acima
    u = cliente.put(f'/api/projetos/{id}/motions/p4', json={'tipo': 'preset', 'formato': 'vertical', 'preset': 'site', 'valores': {'url': 'a.com', 'nada': 'x'}}).json()
    assert (u['nome'], u['fundo'], u['valores']) == ('Busca → página do site', 'nevoa', {'url': 'a.com'})
    # os campos e o fundo mudam sem trocar o preset; a imagem do banco vira a URL dela (na exportação, a de qualidade)
    a = cliente.patch(f'/api/projetos/{id}/motions/p4', json={'valores': {'url': 'b.com', 'pagina': 'aaaaaaaaaa'}, 'fundo': 'chuva'}).json()
    assert a['fundo'] == 'chuva' and a['valores']['url'] == 'b.com'
    fala = json.dumps([{'texto': 'b.com', 'ini': 0.2, 'fim': 0.6}, {'texto': 'ruim'}])
    d = _dados(cliente.get(f'/api/projetos/{id}/motions/p4/pagina', params={'duracao': 3, 'fala': fala, 'exportacao': True}).text)
    assert d['campos'] == {'url': 'b.com', 'pagina': '/api/banco/aaaaaaaaaa/arquivo?qualidade=exportacao'} and d['duracao'] == 3.0
    assert d['fala'] == []  # uma palavra malformada descarta a lista (a digitação fica em ritmo constante)
    cliente.patch(f'/api/projetos/{id}/motions/p4', json={'valores': {'pagina': '../../projetos'}})
    assert _dados(cliente.get(f'/api/projetos/{id}/motions/p4/pagina').text)['campos']['pagina'] == ''
    # um vídeo do banco (um trecho começa no ponto dele); imagem não vale
    assert cliente.put(f'/api/projetos/{id}/motions/p4', json={'tipo': 'video', 'formato': 'dividida', 'banco': 'aaaaaaaaaa'}).status_code == 422
    assert cliente.put(f'/api/projetos/{id}/motions/p4', json={'tipo': 'video', 'formato': 'dividida', 'banco': 'zz'}).status_code == 404
    v = cliente.put(f'/api/projetos/{id}/motions/p4', json={'tipo': 'video', 'formato': 'dividida', 'banco': 'bbbbbbbbbb'}).json()
    assert (v['tipo'], v['nome'], v['formato']) == ('video', 'item bbbbbbbbbb', 'dividida')
    pagina = cliente.get(f'/api/projetos/{id}/motions/p4/pagina?duracao=2').text
    assert 'data-desde="4.5"' in pagina and 'src="/api/banco/bbbbbbbbbb/arquivo"' in pagina and 'height:960px' in pagina
    assert cliente.patch(f'/api/projetos/{id}/motions/p4', json={'fundo': 'chuva'}).status_code == 404  # vídeo não tem fundo
    assert cliente.put(f'/api/projetos/{id}/motions/p5', json={'tipo': 'preset', 'formato': 'vertical', 'preset': 'nao-existe'}).status_code == 404
    cliente.delete(f'/api/projetos/{id}/motions/p4')
    assert cliente.get(f'/api/projetos/{id}/motions').json() == {}
    assert cliente.get(f'/api/projetos/{id}/motions/p4/pagina').status_code == 404


def test_preset_a_revisar_aprovar_e_recusar(cliente, video, tmp_path, monkeypatch):
    """Os motions que o Claude escreve entram "a revisar"; Rodrigo aprova ou recusa com o motivo (docs/editor-claude.md, E7)."""
    from app import motions
    monkeypatch.setattr(motions, 'PRESETS', tmp_path / 'presets_motion')
    monkeypatch.setattr(motions, 'RECUSADOS', motions.PRESETS / '_recusados')
    motions.PRESETS.mkdir()
    novo = TESTE.replace('"fundo": "nevoa"', '"fundo": "nevoa", "a_revisar": true')
    for pid in ('novo', 'outro'):
        (motions.PRESETS / f'{pid}.html').write_text(novo, encoding='utf-8')
    assert {p['id']: p['a_revisar'] for p in cliente.get('/api/motions/presets').json()} == {'novo': True, 'outro': True}
    a = cliente.post('/api/motions/presets/novo/aprovar').json()
    assert a['a_revisar'] is False and a['nome'] == 'Busca → página do site'
    assert '"a_revisar"' not in (motions.PRESETS / 'novo.html').read_text(encoding='utf-8')
    # recusar: precisa de motivo; em uso, não sai (troque o motion do plano antes)
    assert cliente.post('/api/motions/presets/outro/recusar', json={'motivo': ''}).status_code == 422
    id = _criar(cliente, video)['id']
    cliente.put(f'/api/projetos/{id}/motions/p4', json={'tipo': 'preset', 'formato': 'vertical', 'preset': 'outro'})
    r = cliente.post('/api/motions/presets/outro/recusar', json={'motivo': 'texto demais'})
    assert r.status_code == 409 and 'p4' in r.json()['detail']
    cliente.delete(f'/api/projetos/{id}/motions/p4')
    assert cliente.post('/api/motions/presets/outro/recusar', json={'motivo': 'Texto demais; card sólido chapado'}).json()['arquivo'] == '_recusados/outro.html'
    assert [p['id'] for p in cliente.get('/api/motions/presets').json()] == ['novo']
    rec = cliente.get('/api/motions/recusados').json()
    assert [(x['arquivo'], x['motivo']) for x in rec] == [('outro.html', 'Texto demais; card sólido chapado')]
    assert cliente.post('/api/motions/presets/sumiu/aprovar').status_code == 404


def test_identidade_dos_motions_nas_configuracoes(cliente):
    from app import projeto
    assert projeto.ler_config()['identidade_motion'] == projeto.IDENTIDADE_MOTION
    c = cliente.put('/api/config', json={'identidade_motion': 'Cards de vidro; acento coral.'}).json()
    assert c['identidade_motion'] == 'Cards de vidro; acento coral.' and 'modelo_motion' not in c
