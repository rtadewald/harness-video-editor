"""O rosto do ator (SPEC §8.7, docs/rosto.md › A medida), com o detector falso: nenhum teste baixa nem roda o modelo."""
import subprocess
from contextlib import contextmanager

from app import projeto, rosto
from apoio import criar_projeto


def _detector_falso(rostos_por_ms):
    """Um detector que devolve, para cada instante (ms), os rostos dados (em pixels), e anota os instantes pedidos."""
    pedidos = []

    @contextmanager
    def abrir():
        def detectar(rgb, ms):
            pedidos.append((ms, rgb.shape))
            return rostos_por_ms(ms)
        yield detectar
    return abrir, pedidos


def test_medir_amostra_6_por_segundo_em_fracao_do_quadro_e_fica_com_o_maior(video):
    # vídeo de 3 s, 360×640: um rosto pequeno e um grande; o grande vale
    abrir, pedidos = _detector_falso(lambda ms: [(10, 10, 20, 20, 0.6), (90, 160, 180, 160, 0.9)])
    m = rosto.medir(video, abrir_detector=abrir())
    assert (m['por_segundo'], m['largura'], m['altura']) == (6, 360, 640)
    assert len(m['amostras']) == len(pedidos) == 18
    assert pedidos[0] == (0, (640, 360, 3)) and pedidos[1][0] == 167  # instantes crescentes, em ms
    a = m['amostras'][0]
    assert a == {'t': 0.0, 'cx': 0.5, 'cy': 0.375, 'w': 0.5, 'h': 0.25, 'conf': 0.9}


def test_buracos_preenchidos_pelo_vizinho_mais_proximo():
    a = lambda t, cx: {'t': t, 'cx': cx, 'cy': 0.3, 'w': 0.2, 'h': 0.1, 'conf': 0.9}  # noqa: E731
    vazio = lambda t: {'t': t, 'conf': None}  # noqa: E731
    out = rosto.preencher([vazio(0), a(1, 0.4), vazio(2), vazio(3), vazio(4), a(5, 0.6), vazio(6)])
    assert [x['cx'] for x in out] == [0.4, 0.4, 0.4, 0.4, 0.6, 0.6, 0.6]  # no meio, empate vai para o anterior
    assert [x['conf'] for x in out] == [0, 0.9, 0, 0, 0, 0.9, 0]  # os preenchidos ficam com confiança 0
    assert [x['t'] for x in out] == list(range(7))
    assert rosto.preencher([vazio(0), vazio(1)]) == []  # sem rosto nenhum


def test_rodar_grava_o_arquivo_e_o_estado(cliente, video, monkeypatch):
    id = criar_projeto(cliente, video)['id']
    # o proxy: o próprio vídeo de teste
    proxy = projeto.pasta(id) / 'midia' / 'proxy' / 'f1.mp4'
    proxy.parent.mkdir(parents=True)
    proxy.write_bytes(video.read_bytes())
    projeto.atualizar(id, lambda p: p['fontes'][0].update(proxy='midia/proxy/f1.mp4'))
    assert cliente.get(f'/api/projetos/{id}/rosto').json() == {'estado': 'nenhum'}
    assert rosto.ler(id) is None  # ainda não medido

    # rosto à esquerda no 1º segundo, sumido no 2º, à direita no 3º
    def rostos(ms):
        return [(36, 64, 72, 128, 0.8)] if ms < 1000 else [] if ms < 2000 else [(252, 128, 72, 128, 0.95)]
    abrir, _ = _detector_falso(rostos)
    monkeypatch.setattr(rosto, 'detector_mediapipe', abrir)
    rodou = []
    monkeypatch.setattr(rosto, '_fila', type('F', (), {'submit': staticmethod(lambda f, *a: rodou.append(a))})())
    assert cliente.post(f'/api/projetos/{id}/rosto').json()['estado'] == 'fila' and rodou == [(id,)]
    assert cliente.post(f'/api/projetos/{id}/rosto').json()['estado'] == 'fila' and len(rodou) == 1  # não pede duas vezes
    rosto._rodar(id)

    e = cliente.get(f'/api/projetos/{id}/rosto').json()
    assert (e['estado'], e['progresso'], e['erro'], e['amostras'], e['achados'], e['bruto']) == ('pronto', 1, None, 18, 12, 'f1')
    m = rosto.ler(id)
    assert (projeto.pasta(id) / 'midia' / 'rosto' / 'f1.json').exists() and len(m['amostras']) == 18
    def caixas(a, b, medidas=True):
        return {(x['cx'], x['cy'], x['w'], x['h']) for x in m['amostras'] if a <= x['t'] <= b and (x['conf'] > 0) == medidas}
    assert caixas(0, 0.9) == {(0.2, 0.2, 0.2, 0.2)} and {c[0] for c in caixas(2.0, 3.0)} == {0.8}
    assert {c[0] for c in caixas(1.2, 1.4, medidas=False)} == {0.2}  # só buracos: o preenchido (o vizinho de antes)

    # pronto: pedir de novo pela rota mede de novo; pelo pipeline (rosto.pedir), não
    assert rosto.pedir(id)['estado'] == 'pronto' and len(rodou) == 1
    assert cliente.post(f'/api/projetos/{id}/rosto').json()['estado'] == 'fila' and len(rodou) == 2


def test_erro_fica_no_estado_e_retomar_recomeca(cliente, video, monkeypatch):
    id = criar_projeto(cliente, video)['id']
    rosto.pedir(id)
    rosto._rodar(id)  # sem proxy
    e = rosto.estado(id)
    assert e['estado'] == 'erro' and 'proxy' in e['erro']
    projeto.atualizar(id, lambda p: p['rosto'].update(estado='rodando'))  # o servidor caiu no meio
    rodou = []
    monkeypatch.setattr(rosto, '_fila', type('F', (), {'submit': staticmethod(lambda f, *a: rodou.append(a))})())
    rosto.retomar_interrompidos()
    assert rosto.estado(id)['estado'] == 'fila' and rodou == [(id,)]
    assert cliente.get('/api/projetos/nao-existe/rosto').status_code == 404


def test_o_pipeline_pede_o_rosto_depois_do_proxy(cliente, video, monkeypatch):
    id = criar_projeto(cliente, video)['id']
    pedidos = []
    monkeypatch.setattr(rosto, 'pedir', lambda i, refazer=False: pedidos.append(i))
    from app import pipeline
    projeto.atualizar(id, lambda p: p.update(pipeline=pipeline.estado_inicial()))
    pipeline._executar(id, ['proxy'])
    assert pedidos == [id]


def test_sem_rosto_no_video_nenhuma_amostra(cliente, video, monkeypatch):
    id = criar_projeto(cliente, video)['id']
    proxy = projeto.pasta(id) / 'midia' / 'proxy' / 'f1.mp4'
    proxy.parent.mkdir(parents=True)
    proxy.write_bytes(video.read_bytes())
    projeto.atualizar(id, lambda p: p['fontes'][0].update(proxy='midia/proxy/f1.mp4'))
    abrir, _ = _detector_falso(lambda ms: [])
    monkeypatch.setattr(rosto, 'detector_mediapipe', abrir)
    rosto.pedir(id)
    rosto._rodar(id)
    assert rosto.estado(id)['achados'] == 0 and not (rosto.ler(id) or {}).get('amostras')


def test_video_truncado_vira_erro_e_nao_video_sem_rosto(cliente, video, tmp_path, monkeypatch):
    """Um proxy truncado ou corrompido não pode passar por "vídeo sem rosto" (que fica `pronto` e nunca é refeito)."""
    inteiro = tmp_path / 'inteiro.mp4'  # com o índice (moov) no começo, o ffprobe ainda lê a duração do truncado
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-c', 'copy', '-movflags', '+faststart', str(inteiro)], check=True)
    truncado = tmp_path / 'truncado.mp4'
    dados = inteiro.read_bytes()
    truncado.write_bytes(dados[:len(dados) // 6])
    abrir, _ = _detector_falso(lambda ms: [(90, 160, 180, 160, 0.9)])
    try:
        rosto.medir(truncado, abrir_detector=abrir())
        assert False, 'devia ter levantado erro'
    except RuntimeError:
        pass
    # pelo estado: vira `erro` e pode ser pedido de novo
    id = criar_projeto(cliente, video)['id']
    proxy = projeto.pasta(id) / 'midia' / 'proxy' / 'f1.mp4'
    proxy.parent.mkdir(parents=True)
    proxy.write_bytes(truncado.read_bytes())
    monkeypatch.setattr(rosto, 'detector_mediapipe', _detector_falso(lambda ms: [])[0])
    rodou = []
    monkeypatch.setattr(rosto, '_fila', type('F', (), {'submit': staticmethod(lambda f, *a: rodou.append(a))})())
    rosto.pedir(id)
    rosto._rodar(id)
    assert rosto.estado(id)['estado'] == 'erro' and not rosto.arquivo(id, 'f1').exists()
    assert rosto.pedir(id)['estado'] == 'fila' and len(rodou) == 2


def test_parar_de_ler_no_meio_nao_e_erro(video):
    """Quem para de ler os quadros de propósito (o detector falhou, ou só queria os primeiros) não leva erro do ffmpeg."""
    quadros = rosto._quadros(video, 6)
    assert next(quadros)[0] == 0
    quadros.close()
