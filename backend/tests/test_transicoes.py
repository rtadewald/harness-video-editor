"""Transições entre planos (SPEC §8.8; docs/transicoes.md): a biblioteca, a ordem e as favoritas dos pares, as escolhas
do projeto e os filtros da exportação rodando no ffmpeg."""
import subprocess

import numpy as np
import pytest

from apoio import criar_projeto
from app import exportacao, transicoes


def _semear():
    for t in ({'id': 'corte-seco', 'nome': 'Corte seco', 'efeito': {'tipo': 'seco'}},
              {'id': 'zoom-desfoque', 'efeito': {'tipo': 'zoom', 'antes': 0.2, 'depois': 0.3}},
              {'id': 'brilho-branco', 'efeito': {'tipo': 'brilho', 'antes': 0.2, 'depois': 0.1}}):
        transicoes.salvar(t)


def test_validar_limpa_e_recusa():
    t = transicoes.validar({'id': 'x', 'efeito': {'tipo': 'zoom', 'antes': 9, 'depois': -1, 'forca': 3},
                            'som': {'som': 'click-classic-01', 'intensidade': 'alto', 'atraso': 7}, 'fontes': [{'ref': 'r', 't': '1.5'}, {'t': 2}]})
    assert t['efeito'] == {'tipo': 'zoom', 'antes': 2, 'depois': 0, 'forca': 1}
    assert t['som'] == {'som': 'click-classic-01', 'intensidade': 'baixo', 'atraso': 3}  # intensidade desconhecida: a baixa
    assert t['fontes'] == [{'ref': 'r', 't': 1.5}] and t['nome'] == 'x' and t['aprovado'] is False
    assert transicoes.validar({'id': 'x', 'som': {'som': '../fora'}})['som'] is None  # som inválido: nenhum
    assert transicoes.validar({'id': 'x', 'som': {}})['som'] is None
    with pytest.raises(ValueError):
        transicoes.validar({'id': 'x', 'efeito': {'tipo': 'explosao'}})
    with pytest.raises(ValueError):
        transicoes.validar({'id': '../x'})


def test_biblioteca_editar_e_listar():
    _semear()
    transicoes.definir_ordem('full_ator>insert_tela_cheia', ['corte-seco'], 1)
    assert [t['id'] for t in transicoes.listar()] == ['brilho-branco', 'corte-seco', 'zoom-desfoque']  # sem a ordem nem os pares
    t = transicoes.editar('zoom-desfoque', {'aprovado': True, 'nome': '  Zoom  ', 'efeito': {'forca': 0.5}, 'som': None})
    assert t['aprovado'] and t['nome'] == 'Zoom' and t['efeito']['forca'] == 0.5 and t['efeito']['antes'] == 0.2
    assert transicoes.ler('zoom-desfoque') == t


def test_ordem_favoritas_e_padrao_do_par():
    _semear()
    assert transicoes.padrao_do_par('full_ator', 'insert_tela_cheia') == 'corte-seco'  # nada gravado: o corte seco
    o = transicoes.definir_ordem('familia:ator>dividida', ['brilho-branco', 'nao-existe', 'corte-seco', 'brilho-branco'], 5)
    assert o['familia:ator>dividida'] == {'ids': ['brilho-branco', 'corte-seco'], 'favoritas': 2}  # sem as desconhecidas nem repetidas
    # o grupo vale para todos os pares dele (Full ator com lettering → tela dividida com motion também)
    assert transicoes.padrao_do_par('full_ator', 'tela_dividida_insert') == 'brilho-branco'
    assert transicoes.padrao_do_par('full_ator_lettering', 'tela_dividida_motion') == 'brilho-branco'
    # a ordem antiga do par exato só vale sem a do grupo
    transicoes.definir_ordem('full_ator>tela_dividida_insert', ['zoom-desfoque', 'corte-seco'], 1)
    assert transicoes.padrao_do_par('full_ator', 'tela_dividida_insert') == 'brilho-branco'
    transicoes.definir_ordem('familia:ator>dividida', [], 0)
    assert transicoes.padrao_do_par('full_ator', 'tela_dividida_insert') == 'zoom-desfoque'
    # com ordem e nenhuma favorita, o par fica seco (igual a padraoDoPar no front)
    transicoes.definir_ordem('familia:ator>dividida', ['zoom-desfoque'], 0)
    assert transicoes.padrao_do_par('full_ator', 'tela_dividida_insert') == 'corte-seco'
    assert transicoes.ordem_do_par('full_ator', 'tela_dividida_insert')['ids'] == ['zoom-desfoque']
    # lista vazia apaga a ordem
    assert 'familia:ator>dividida' not in transicoes.definir_ordem('familia:ator>dividida', [], 0)
    for par in ('nada', 'a>b>c', 'familia:x', 'familia:ator>insert'):
        with pytest.raises(ValueError):
            transicoes.definir_ordem(par, ['corte-seco'], 1)


def test_familias():
    assert [transicoes.familia(c) for c in ('full_ator', 'full_ator_lettering', 'comentario_insert_ator', 'tela_dividida_insert',
                                            'insert_tela_cheia', 'motion_tela_cheia', 'tela_dividida_motion')] == \
        ['ator', 'ator', 'dividida', 'dividida', 'cheia', 'cheia', 'dividida']


def test_rotas(cliente, video):
    _semear()
    r = cliente.get('/api/transicoes').json()
    assert {t['id'] for t in r['transicoes']} == {'corte-seco', 'zoom-desfoque', 'brilho-branco'} and r['pares'] == {} and r['ordem'] == {}
    o = cliente.put('/api/transicoes/ordem/full_ator%3Einsert_tela_cheia', json={'campos': {'ids': ['zoom-desfoque', 'corte-seco'], 'favoritas': 2}})
    assert o.status_code == 200 and o.json()['full_ator>insert_tela_cheia']['ids'] == ['zoom-desfoque', 'corte-seco']
    assert cliente.put('/api/transicoes/ordem/x', json={'campos': {'ids': ['corte-seco']}}).status_code == 422
    assert cliente.patch('/api/transicoes/nao-existe', json={'campos': {'aprovado': True}}).status_code == 404
    assert cliente.patch('/api/transicoes/corte-seco', json={'campos': {'aprovado': True}}).json()['aprovado'] is True
    assert cliente.get('/api/transicoes/efeitos/luz.webm').headers['content-type'] == 'video/webm'
    assert cliente.get('/api/transicoes/efeitos/nada.webm').status_code == 404
    # as escolhas do projeto: só as trocadas à mão; null volta ao padrão do par; transição desconhecida, 422
    pid = criar_projeto(cliente, video)['id']
    assert cliente.get(f'/api/projetos/{pid}/transicoes').json() == {}
    url = f'/api/projetos/{pid}/transicoes'
    # a escolha guarda o par do corte (os ids dos planos são de posição); as antigas, só o id, continuam valendo
    r = cliente.put(url, json={'campos': {'p2': {'id': 'zoom-desfoque', 'par': 'full_ator>insert_tela_cheia'}, 'p3': 'seco'}}).json()
    assert r == {'p2': {'id': 'zoom-desfoque', 'par': 'full_ator>insert_tela_cheia'}, 'p3': {'id': 'seco'}}
    assert cliente.put(url, json={'campos': {'p2': None}}).json() == {'p3': {'id': 'seco'}}
    assert cliente.put(url, json={'campos': {'p4': 'nao-existe'}}).status_code == 422
    assert cliente.put(url, json={'campos': {'p4': {'id': 'seco', 'par': '../x'}}}).status_code == 422
    assert cliente.get(url).json() == {'p3': {'id': 'seco'}}


def _media(arq, t, w=180, h=320):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t}', '-i', str(arq), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(h, w, 3).astype(float)


@pytest.fixture(scope='module')
def colorido(tmp_path_factory):
    arq = tmp_path_factory.mktemp('tr') / 'cor.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=3', '-f', 'lavfi', '-i', 'sine=d=3',
                    '-shortest', '-pix_fmt', 'yuv420p', str(arq)], check=True)
    return arq


def test_sem_transicoes_o_comando_nao_muda():
    assert transicoes.filtros(None, 'a', 'b', 180, 320, 3) == ([], ['[a]null[b]'])
    assert transicoes.filtros([{'t': 1, 'tipo': 'seco', 'antes': 0, 'depois': 0}], 'a', 'b', 180, 320, 3) == ([], ['[a]null[b]'])


@pytest.mark.parametrize('tipo', ['zoom', 'brilho', 'luz'])
def test_exportacao_com_transicao(tmp_path, colorido, tipo):
    """Cada efeito muda o quadro no corte (o brilho clareia) e deixa o resto do vídeo como estava."""
    clipes = [{'inicio': 0.0, 'fim': 3.0}]
    args = (colorido, clipes, False, 0.5, 180, 320, 30, [], [], 'h264', 3.0)
    sem = tmp_path / 'sem.mp4'
    subprocess.run(exportacao.comando_final(*args, sem), check=True, capture_output=True)
    com = tmp_path / f'{tipo}.mp4'
    tr = [{'t': 1.5, 'tipo': tipo, 'antes': 0.3, 'depois': 0.3, 'forca': 1}]
    r = subprocess.run(exportacao.comando_final(*args, com, transicoes=tr), capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-600:]
    longe = np.abs(_media(com, 0.4) - _media(sem, 0.4)).mean()
    perto = np.abs(_media(com, 1.47) - _media(sem, 1.47)).mean()
    assert longe < 3 and perto > 20, (longe, perto)
    if tipo == 'brilho':
        assert _media(com, 1.47).mean() > _media(sem, 1.47).mean() + 60


def test_envelope_e_janela_sem_antes():
    """A curva em número (os comandos do desfoque) e em expressão (o zoom, o branco): sem `antes`, nada antes do corte
    (igual a `envelope` em transicoes.ts; antes, o zoom ampliava o vídeo inteiro antes do corte)."""
    assert transicoes.envelope(0.2, 0.3, 1.0, 0.5) == 0 and transicoes.envelope(0.2, 0.3, 1.0, 1.0) == 1
    assert transicoes.envelope(0.2, 0.3, 1.0, 0.9) == pytest.approx(0.5) and transicoes.envelope(0.2, 0.3, 1.0, 1.15) == pytest.approx(0.5)
    assert transicoes.envelope(0, 0.3, 1.0, 0.99) == 0 and transicoes.envelope(0.2, 0, 1.0, 1.01) == 0
    assert transicoes._janela(1, 0, 0.3).startswith('(1.000*if(lt(T,1.0000),0,')


def test_filtros_so_nas_janelas():
    """O desfoque do zoom muda quadro a quadro (sendcmd) e só liga na janela; o brilho é uma fonte do tamanho da janela,
    começando num quadro inteiro (nunca antes do começo do vídeo)."""
    tr = [{'t': 1.0, 'tipo': 'zoom', 'antes': 0.2, 'depois': 0.2, 'forca': 1}, {'t': 2.0, 'tipo': 'zoom', 'antes': 0.1, 'depois': 0.1, 'forca': 0.5},
          {'t': 0.1, 'tipo': 'brilho', 'antes': 0.3, 'depois': 0.1, 'forca': 1}]
    _, f = transicoes.filtros(tr, 'a', 'b', 180, 320, 3, 30)
    g = ';'.join(f)
    assert f[0] == '[a]format=pix_fmts=yuv420p:color_spaces=bt709:color_ranges=tv[tf]'  # já no formato de saída: o scale do zoom só repassa fora da janela
    assert "gblur@tz=sigma=0:enable='between(t,0.8000,1.2000)+between(t,1.9000,2.1000)'" in g
    assert g.count('gblur@tz sigma') == 13 + 7  # um comando por quadro das duas janelas (30 fps)
    assert '0.9917 gblur@tz sigma 2.67' in g  # no corte (quadro 30), o σ cheio: 320/120
    assert 'setpts=PTS-STARTPTS+0/(30*TB)' in g and 'd=0.2333' in g  # a janela do brilho começa no quadro 0
    assert 'gbrp' not in g and 'lutrgb' not in g


def test_exportacao_varias_transicoes_sem_mexer_no_resto(tmp_path, colorido):
    clipes = [{'inicio': 0.0, 'fim': 3.0}]
    args = (colorido, clipes, False, 0.5, 180, 320, 30, [], [], 'h264', 3.0)
    sem = tmp_path / 'sem.mp4'
    subprocess.run(exportacao.comando_final(*args, sem), check=True, capture_output=True)
    com = tmp_path / 'varias.mp4'
    tr = [{'t': 0.1, 'tipo': 'brilho', 'antes': 0.3, 'depois': 0.1, 'forca': 1}, {'t': 1.2, 'tipo': 'zoom', 'antes': 0, 'depois': 0.2, 'forca': 1},
          {'t': 2.2, 'tipo': 'zoom', 'antes': 0.2, 'depois': 0.2, 'forca': 1}]
    r = subprocess.run(exportacao.comando_final(*args, com, transicoes=tr), capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-600:]
    assert _media(com, 0.04).mean() > _media(sem, 0.04).mean() + 40  # o brilho já no primeiro quadro
    for t in (0.6, 1.1, 1.7):  # fora das janelas (e antes do zoom sem `antes`): igual
        assert np.abs(_media(com, t) - _media(sem, t)).mean() < 3, t  # só o ruído do codificador
    assert np.abs(_media(com, 2.2) - _media(sem, 2.2)).mean() > 20


def test_luz_com_look_nao_muda_a_cor_fora_da_janela(tmp_path, colorido):
    """Com o look ligado (o padrão), a luz só mexe na janela dela: o webm sem marcação de cor não pode levar o overlay a
    converter o vídeo inteiro por outra matriz."""
    from app import look
    clipes = [{'inicio': 0.0, 'fim': 3.0}]
    args = (colorido, clipes, False, 0.5, 180, 320, 30, [], [], 'h264', 3.0)
    lk = {'lut': 'casa', 'intensidade': 1, 'vinheta': 'normal'}
    mascara = look.mascara_vinheta(180, 320, 0.4, tmp_path / 'm.png')
    sem, com = tmp_path / 'sem.mp4', tmp_path / 'luz.mp4'
    for arq, tr in ((sem, None), (com, [{'t': 1.5, 'tipo': 'luz', 'antes': 0.22, 'depois': 0.23, 'forca': 1}])):
        r = subprocess.run(exportacao.comando_final(*args, arq, transicoes=tr, look=lk, mascara_vinheta=mascara), capture_output=True, text=True)
        assert r.returncode == 0, r.stderr[-600:]
    for t in (0.4, 2.6):  # o desvio de cor de cada canal (a diferença pixel a pixel tem o ruído do encoder)
        assert np.abs((_media(com, t) - _media(sem, t)).mean((0, 1))).max() < 0.5
    assert np.abs(_media(com, 1.5) - _media(sem, 1.5)).mean() > 20
