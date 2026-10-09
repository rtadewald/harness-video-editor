"""Enquadramento 16:9 → 9:16 pelo rosto (docs/preprocessamento.md): o caminho da câmera, o recorte e o projeto."""
import subprocess

import pytest

from app import comum, enquadramento as enq, midia, projeto


def _amostras(xs):
    return [{'t': k / 6, 'cx': x, 'cy': 0.4, 'w': 0.1, 'h': 0.2, 'conf': 0.9} for k, x in enumerate(xs)]


def test_caminho_zona_morta_limites_e_velocidade():
    cw = enq.largura_recorte(1920, 1080) / 1920
    parado = enq.caminho(_amostras([0.5] * 30 + [0.52] * 30), 6, 1920, 1080)  # o rosto andou menos que a zona morta
    assert max(parado) - min(parado) < 0.005
    andando = enq.caminho(_amostras([0.3] * 60 + [0.7] * 120), 6, 1920, 1080)
    assert andando[0] == pytest.approx(0.3, abs=0.03) and andando[-1] == pytest.approx(0.7, abs=0.05)  # chegou perto (a zona fica)
    # um passo dentro da faixa segura: nunca passa da velocidade máxima
    vmax = enq.SUAVIDADES['normal']['vel'] * cw
    passo = enq.caminho(_amostras([0.5] * 30 + [0.5 + 0.18 * cw] * 60), 6, 1920, 1080)
    assert max(abs(b - a) * 6 for a, b in zip(passo, passo[1:])) <= vmax * 1.05
    assert all(cw / 2 - 1e-5 <= x <= 1 - cw / 2 + 1e-5 for x in enq.caminho(_amostras([0.0] * 10 + [1.0] * 10), 6, 1920, 1080))  # nunca sai da imagem
    calma, agil = (enq.caminho(_amostras([0.5] * 30 + [0.5 + 0.18 * cw] * 30), 6, 1920, 1080, s) for s in ('calma', 'agil'))
    assert agil[40] > calma[40]  # a ágil chega antes
    # deslocamento: o rosto fica à esquerda do quadro (a câmera vai para a direita)
    assert enq.caminho(_amostras([0.5] * 20), 6, 1920, 1080, 'normal', 0.2)[-1] > 0.52


def test_caminho_nao_adianta_e_mantem_o_rosto_no_quadro():
    """Parado e depois andando (200 px/s num 1920): a câmera não se mexe antes do ator e o rosto fica longe das bordas."""
    cw = enq.largura_recorte(1920, 1080) / 1920
    xs = [0.2 if k < 24 else min(0.2 + (k - 24) / 6 * 200 / 1920, 0.8) for k in range(16 * 6)]
    for s in enq.SUAVIDADES:
        cam = enq.caminho(_amostras(xs), 6, 1920, 1080, s)
        assert max(abs(c - cam[0]) for c in cam[:21]) < 0.002  # até 0,5 s antes de ele andar (aos 4 s), parada
        rel = [(x - (c - cw / 2)) / cw for c, x in zip(cam, xs)]
        assert 0.25 <= min(rel) and max(rel) <= 0.75, s


def test_caminho_sem_rosto():
    cw = enq.largura_recorte(1920, 1080) / 1920
    assert enq.caminho([], 6, 1920, 1080) == [0.5]  # no vídeo inteiro: o recorte no centro
    assert enq.caminho([], 6, 1920, 1080, 'normal', 0.2) == [round(0.5 + 0.2 * cw, 5)]
    # num trecho (amostras preenchidas, confiança 0): a câmera fica onde estava, mesmo que a vizinha seguinte esteja longe
    am = _amostras([0.3] * 30) + [{'t': 0, 'cx': 0.7, 'conf': 0} for _ in range(30)] + _amostras([0.7] * 30)
    cam = enq.caminho(am, 6, 1920, 1080)
    assert max(abs(c - cam[0]) for c in cam[:55]) < 0.002
    # uma detecção errada isolada (outra coisa achada como rosto) não mexe a câmera
    assert max(enq.caminho(_amostras([0.5] * 30 + [0.9] + [0.5] * 30), 6, 1920, 1080)) - 0.5 < 0.002
    cmds = enq.comandos_crop([], 6, 1920, 1080, 30, 0.1)
    assert cmds.split('\n')[0] == f'0.0000 crop@c x {round(0.5 * 1920 - 304)};'


def test_comandos_do_crop():
    cmds = enq.comandos_crop([0.5, 0.6], 6, 1920, 1080, 30, 0.2).strip().split('\n')
    assert len(cmds) == 7 and cmds[0].startswith('0.0000 crop@c x ')
    xs = [int(c.split()[-1].rstrip(';')) for c in cmds]
    assert xs[0] == round(0.5 * 1920 - 304) and xs == sorted(xs)  # anda entre as amostras
    assert all(0 <= x <= 1920 - 608 for x in xs)


def _video(arq, w, h, d=2):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=s={w}x{h}:r=30:d={d}', '-f', 'lavfi', '-i', f'sine=d={d}',
                    '-shortest', '-pix_fmt', 'yuv420p', str(arq)], check=True)


def _projeto(tmp_path, w, h):
    id = 'enq'
    base = projeto.RAIZ / id
    (base / 'midia').mkdir(parents=True)
    _video(base / 'midia' / 'bruto.mp4', w, h)
    f = {'id': 'f1', 'papel': 'bruto', 'arquivo': 'midia/bruto.mp4', **midia.inspecionar(base / 'midia' / 'bruto.mp4')}
    projeto.criar(id, 'Enq', [f], {}, 'whisper')
    return id


def test_aplicar_num_16x9_gera_o_9x16_e_guarda_o_original(tmp_path, monkeypatch):
    from app import rosto
    monkeypatch.setattr(rosto, 'medir', lambda v, prog=None: {'por_segundo': 6, 'largura': 640, 'altura': 360, 'amostras': _amostras([0.3] * 13)})
    id = _projeto(tmp_path, 640, 360)
    r = enq.aplicar(id)
    p = projeto.ler(id)
    f = p['fontes'][0]
    assert r['recorte'] == 202 and f['arquivo'] == 'midia/bruto_9x16.mp4' and (f['largura'], f['altura']) == (202, 360)
    assert 'proxy' not in f and p['enquadramento']['original'] == 'midia/original/bruto.mp4'
    assert (projeto.pasta(id) / 'midia' / 'original' / 'bruto.mp4').exists() and not (projeto.pasta(id) / 'midia' / 'bruto.mp4').exists()
    assert abs(midia.inspecionar(projeto.pasta(id) / f['arquivo'])['duracao'] - 2) < 0.1
    assert comum.ler_json(enq.arquivo_rosto(id))['por_segundo'] == 6  # a medida do original fica guardada
    e = enq.estado(id)
    assert e['aplica'] and len(e['caminho']) == 13 and e['recorte'] == pytest.approx(202 / 640)
    # de novo (reenquadrar): parte do original guardado, sem medir de novo
    monkeypatch.setattr(rosto, 'medir', lambda *a, **k: pytest.fail('mediu de novo'))
    projeto.atualizar(id, lambda q: q['enquadramento'].update(suavidade='agil'))
    enq.aplicar(id)
    assert projeto.ler(id)['fontes'][0]['arquivo'] == 'midia/bruto_9x16.mp4'


def test_vertical_nao_muda(tmp_path):
    id = _projeto(tmp_path, 180, 320)
    assert enq.aplicar(id) == {'pulado': 'vertical'}
    assert projeto.ler(id)['fontes'][0]['arquivo'] == 'midia/bruto.mp4'
    assert not enq.estado(id)['aplica']
    with pytest.raises(ValueError):
        enq.reenquadrar(id, 'normal', None)


def test_rotas(cliente, tmp_path, monkeypatch):
    id = _projeto(tmp_path, 180, 320)
    assert cliente.get(f'/api/projetos/{id}/enquadramento').json()['aplica'] is False
    assert cliente.put(f'/api/projetos/{id}/enquadramento', json={'campos': {'suavidade': 'agil'}}).status_code == 422  # vertical
    projeto.atualizar(id, lambda q: q['enquadramento'].update(original='midia/bruto.mp4'))
    assert cliente.put(f'/api/projetos/{id}/enquadramento', json={'campos': {'suavidade': 'turbo'}}).status_code == 422
    chamadas = []
    monkeypatch.setattr(enq, '_fila', type('F', (), {'submit': lambda s, f, *a: chamadas.append(a)})())
    r = cliente.put(f'/api/projetos/{id}/enquadramento', json={'campos': {'suavidade': 'calma', 'desloca': 0.9}}).json()
    assert r['suavidade'] == 'calma' and r['desloca'] == 0.4 and r['estado'] == 'fila' and chamadas == [(id,)]


def test_aplicar_sem_rosto_nenhum_recorta_no_centro(tmp_path, monkeypatch):
    """Gravação de tela, ator de costas: o detector não acha nada e o 9:16 sai do centro (antes, IndexError)."""
    from app import rosto
    monkeypatch.setattr(rosto, 'medir', lambda v, prog=None: {'por_segundo': 6, 'largura': 640, 'altura': 360, 'amostras': []})
    id = _projeto(tmp_path, 640, 360)
    r = enq.aplicar(id)
    assert r['rostos'] == 0 and 'aviso' in r
    assert projeto.ler(id)['fontes'][0]['arquivo'] == enq.DESTINO and enq.estado(id)['caminho'] == [0.5]


def test_falha_no_render_deixa_o_bruto_apontando_para_o_original(tmp_path, monkeypatch):
    from app import rosto
    monkeypatch.setattr(rosto, 'medir', lambda v, prog=None: {'por_segundo': 6, 'largura': 640, 'altura': 360, 'amostras': _amostras([0.3] * 13)})
    renderizar = enq.renderizar
    monkeypatch.setattr(enq, 'renderizar', lambda *a, **k: (_ for _ in ()).throw(RuntimeError('ffmpeg caiu')))
    id = _projeto(tmp_path, 640, 360)
    with pytest.raises(RuntimeError):
        enq.aplicar(id)
    f = projeto.ler(id)['fontes'][0]
    assert f['arquivo'] == 'midia/original/bruto.mp4' and (projeto.pasta(id) / f['arquivo']).exists()  # nunca um arquivo que sumiu
    monkeypatch.setattr(enq, 'renderizar', renderizar)
    monkeypatch.setattr(rosto, 'medir', lambda *a, **k: pytest.fail('mediu de novo'))
    enq.aplicar(id)  # "Tentar de novo": parte do original guardado
    assert projeto.ler(id)['fontes'][0]['arquivo'] == enq.DESTINO


def test_reprocessar_nao_refaz_o_9x16_sem_mudanca(tmp_path, monkeypatch):
    from app import rosto
    monkeypatch.setattr(rosto, 'medir', lambda v, prog=None: {'por_segundo': 6, 'largura': 640, 'altura': 360, 'amostras': _amostras([0.3] * 13)})
    id = _projeto(tmp_path, 640, 360)
    enq.aplicar(id)
    assert projeto.ler(id)['enquadramento']['versao'] == 1
    renders = []
    original = enq.renderizar
    monkeypatch.setattr(enq, 'renderizar', lambda *a, **k: (renders.append(1), original(*a, **k)))
    assert enq.aplicar(id) == {'reaproveitado': True} and not renders  # o mesmo 9:16 ("Tentar de novo" do processamento)
    projeto.atualizar(id, lambda q: q['enquadramento'].update(desloca=0.1))
    enq.aplicar(id)
    assert renders and projeto.ler(id)['enquadramento']['versao'] == 2


def test_reenquadrar_recusa_com_algo_em_andamento(cliente, tmp_path, monkeypatch):
    id = _projeto(tmp_path, 180, 320)
    projeto.atualizar(id, lambda q: q['enquadramento'].update(original='midia/bruto.mp4', estado='rodando'))
    monkeypatch.setattr(enq, '_fila', type('F', (), {'submit': lambda s, f, *a: pytest.fail('enfileirou')})())
    with pytest.raises(enq.Ocupado):
        enq.reenquadrar(id, 'agil', None)
    projeto.atualizar(id, lambda q: (q['enquadramento'].update(estado='pronto'), q['pipeline'].update(passos={'proxy': {'status': 'rodando'}})))
    assert cliente.put(f'/api/projetos/{id}/enquadramento', json={'campos': {'suavidade': 'agil'}}).status_code == 409
    # depois de um erro do pipeline, o que ficou pendente não segura o Reenquadrar
    projeto.atualizar(id, lambda q: q['pipeline'].update(passos={'proxy': {'status': 'erro'}, 'cortes': {'status': 'pendente'}}, erro='proxy: x'))
    monkeypatch.setattr(enq, '_fila', type('F', (), {'submit': lambda s, f, *a: None})())
    assert enq.reenquadrar(id, 'agil', None)['estado'] == 'fila'
    # e o "Tentar de novo" do processamento espera o Reenquadrar
    assert cliente.post(f'/api/projetos/{id}/processar').status_code == 409


def test_retomar_reenquadrar_interrompido(tmp_path, monkeypatch):
    id = _projeto(tmp_path, 180, 320)
    sobra = projeto.pasta(id) / 'midia' / 'bruto_9x16.parte.mp4'
    sobra.write_bytes(b'x')
    projeto.atualizar(id, lambda q: q['enquadramento'].update(original='midia/bruto.mp4', estado='rodando', progresso=0.4))
    chamadas = []
    monkeypatch.setattr(enq, '_fila', type('F', (), {'submit': lambda s, f, *a: chamadas.append((f, a))})())
    enq.retomar_interrompidos()
    assert chamadas == [(enq._refazer, (id,))] and not sobra.exists() and enq.estado(id)['estado'] == 'fila'


def test_refazer_so_fica_pronto_com_o_proxy_novo(tmp_path, monkeypatch):
    from app import pipeline
    id = _projeto(tmp_path, 180, 320)
    ordem = []
    monkeypatch.setattr(enq, 'aplicar', lambda id, prog: ordem.append('9x16'))
    monkeypatch.setattr(pipeline, 'refazer_proxy', lambda id: ordem.append(('proxy', enq.estado(id)['estado'])) or True)
    enq._refazer(id)
    assert ordem == ['9x16', ('proxy', 'rodando')] and enq.estado(id)['estado'] == 'pronto'
    monkeypatch.setattr(pipeline, 'refazer_proxy', lambda id: False)
    enq._refazer(id)
    assert enq.estado(id)['estado'] == 'erro'


def test_recorte_e_rosto_do_video_antigo_sao_descartados(tmp_path, monkeypatch):
    """Um recorte ou uma medida do rosto que estava rodando quando o 9:16 mudou termina depois e não passa por novo."""
    from app import recorte_ator, rosto
    id = _projeto(tmp_path, 180, 320)
    projeto.atualizar(id, lambda q: (q['fontes'][0].update(proxy='midia/proxy/f1.mp4'), q['enquadramento'].update(versao=1)))
    (projeto.pasta(id) / 'midia' / 'proxy').mkdir()
    (projeto.pasta(id) / 'midia' / 'proxy' / 'f1.mp4').write_bytes((projeto.pasta(id) / 'midia' / 'bruto.mp4').read_bytes())
    reenquadra = lambda *a, **k: projeto.atualizar(id, lambda q: q['enquadramento'].update(versao=q['enquadramento']['versao'] + 1))  # noqa: E731
    monkeypatch.setattr(recorte_ator, '_baixar_modelo', lambda: None)
    monkeypatch.setattr(recorte_ator, '_segmentar', reenquadra)
    monkeypatch.setattr(recorte_ator, '_pessoa', lambda *a: None)
    recorte_ator._rodar(id)
    assert projeto.ler(id)['recorte'].get('estado') != 'pronto'
    monkeypatch.setattr(rosto, 'medir', lambda *a, **k: (reenquadra(), {'por_segundo': 6, 'largura': 1, 'altura': 1, 'amostras': []})[1])
    rosto._rodar(id)
    assert projeto.ler(id)['rosto'].get('estado') != 'pronto' and not rosto.arquivo(id, 'f1').exists()
    # sem mudança no meio, fica pronto
    monkeypatch.setattr(rosto, 'medir', lambda *a, **k: {'por_segundo': 6, 'largura': 1, 'altura': 1, 'amostras': []})
    rosto._rodar(id)
    assert projeto.ler(id)['rosto']['estado'] == 'pronto'


def test_projeto_antigo_ainda_horizontal(tmp_path, monkeypatch):
    """Criado antes do enquadramento (o bruto ainda 16:9, sem `original`): a aba oferece converter."""
    from app import rosto
    id = _projeto(tmp_path, 640, 360)
    e = enq.estado(id)
    assert e['aplica'] and not e.get('original')
    monkeypatch.setattr(enq, '_fila', type('F', (), {'submit': lambda s, f, *a: None})())
    assert enq.reenquadrar(id, None, None)['estado'] == 'fila'
    # com proxy (o projeto já era usado): o recorte e o rosto do ator são refeitos do 9:16
    monkeypatch.setattr(rosto, 'medir', lambda v, prog=None: {'por_segundo': 6, 'largura': 640, 'altura': 360, 'amostras': _amostras([0.3] * 13)})
    projeto.atualizar(id, lambda q: (q['fontes'][0].update(proxy='midia/proxy/f1.mp4'), q.update(recorte={'estado': 'pronto'})))
    enq.aplicar(id)
    p = projeto.ler(id)
    assert p['fontes'][0]['arquivo'] == enq.DESTINO and 'proxy' not in p['fontes'][0] and 'recorte' not in p
