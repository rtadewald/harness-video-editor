"""A lógica que a tela e o Claude usam igual (docs/editor-claude.md, E3): presets recomendados e variar transições."""
import json
import random

from apoio import criar_projeto
from app import banco, presets, projeto, transicoes, versoes
from test_projetos import _receita


def _midia(bid, w, h):
    d = banco.RAIZ / bid
    d.mkdir(parents=True)
    (d / 'item.json').write_text(json.dumps({'id': bid, 'nome': bid, 'largura': w, 'altura': h, 'tipo': 'video'}))


def _preset(pid, nome):
    presets.salvar({'id': pid, 'nome': nome, 'formato': 'vertical', 'receita': presets.validar_receita(_receita()), 'fontes': [], 'aprovado': True})


def _pedido(pid, plano, inicio, midias):
    return {'id': pid, 'plano': plano, 'tipo': 'insert_tela_cheia', 'formato': 'vertical', 'inicio': inicio, 'duracao': 2,
            'midias': [{'id': f'm{k}', 'banco': b} for k, b in enumerate(midias)], 'enriquecimento': {}}


def test_recomendados_com_rodizio_e_marcas(cliente, video, monkeypatch, tmp_path):
    monkeypatch.setattr(presets, 'RAIZ', tmp_path / 'presets')
    _preset('aaaaaaaaaa', 'Primeiro')
    _preset('bbbbbbbbbb', 'Segundo')
    presets.definir_ordem('vertical:1:deitada', ['aaaaaaaaaa', 'bbbbbbbbbb'], 2)
    _midia('1111111111', 1920, 1080)
    id = criar_projeto(cliente, video)['id']
    pedidos = [_pedido('i1', 'p1', 0, ['1111111111']), _pedido('i2', 'p2', 3, ['1111111111']), _pedido('i3', 'p3', 6, []),
               _pedido('i4', 'p4', 9, ['1111111111'])]
    projeto.atualizar(id, lambda p: p.update(inserts={'versao': 1, 'pedidos': pedidos}))
    versoes.marcar_manual(id, 'inserts', ['i4'], 'teste')  # Rodrigo mexeu neste
    r = {x['plano']: x for x in cliente.post(f'/api/projetos/{id}/inserts/presets/recomendados', json={}, headers={'X-Autor': 'claude'}).json()['inserts']}
    assert r['p1']['preset'] == 'aaaaaaaaaa' and r['p2']['preset'] == 'bbbbbbbbbb'  # o vizinho ganha o próximo favorito
    assert r['p3']['pulado'] == 'sem mídia' and r['p4']['pulado'] == 'mudado à mão por Rodrigo'
    feitos = {x['id']: x['enriquecimento'].get('preset') for x in projeto.ler(id)['inserts']['pedidos']}
    assert feitos == {'i1': 'aaaaaaaaaa', 'i2': 'bbbbbbbbbb', 'i3': None, 'i4': None}
    # de novo: quem já tem preset fica
    r2 = cliente.post(f'/api/projetos/{id}/inserts/presets/recomendados', json={}, headers={'X-Autor': 'claude'}).json()['inserts']
    assert [x.get('pulado') for x in r2][:2] == ['já tem preset', 'já tem preset']


def test_variar_transicoes(cliente, video):
    for t in ({'id': 'corte-seco', 'efeito': {'tipo': 'seco'}, 'aprovado': True},
              {'id': 'zoom-desfoque', 'efeito': {'tipo': 'zoom', 'antes': 0.2, 'depois': 0.3}, 'aprovado': True},
              {'id': 'brilho-branco', 'efeito': {'tipo': 'brilho', 'antes': 0.2, 'depois': 0.1}, 'aprovado': True}):
        transicoes.salvar(t)
    transicoes.definir_ordem('familia:ator>cheia', ['zoom-desfoque', 'brilho-branco'], 2)
    transicoes.definir_ordem('familia:cheia>ator', ['brilho-branco', 'corte-seco'], 2)
    id = criar_projeto(cliente, video)['id']
    tipos = ['full_ator', 'insert_tela_cheia', 'full_ator', 'insert_tela_cheia', 'full_ator']
    itens = [{'camada': 'plano', 'id': f'p{k + 1}', 'tipo': t, 'palavra_ini': f'w{k:05d}'} for k, t in enumerate(tipos)]
    projeto.atualizar(id, lambda p: p.update(direcao={'status': 'pronto', 'itens': itens}))
    versoes.marcar_manual(id, 'transicoes', ['p5'], 'teste')
    projeto.atualizar(id, lambda p: p.update(transicoes={'p5': {'id': 'corte-seco', 'par': 'insert_tela_cheia>full_ator'}}))
    r = transicoes.variar(id, 'favoritas', random.Random(1))
    assert [x['plano'] for x in r] == ['p2', 'p3', 'p4', 'p5'] and r[-1]['pulado'] == 'mudado à mão por Rodrigo'
    ids = [x['id'] for x in r]
    assert all(i in ('zoom-desfoque', 'brilho-branco', 'corte-seco') for i in ids)
    # nunca três efeitos seguidos (ator>cheia e cheia>ator só têm efeito… menos o corte seco do 2º par)
    for k in range(len(ids) - 2):
        assert not all(i != 'corte-seco' for i in ids[k:k + 3])
    assert projeto.ler(id)['transicoes']['p5']['id'] == 'corte-seco'  # a marcada ficou
    assert cliente.post(f'/api/projetos/{id}/transicoes/variar', json={'modo': 'x'}).status_code == 422
    assert cliente.post(f'/api/projetos/{id}/transicoes/variar', json={'modo': 'todas'}, headers={'X-Autor': 'claude'}).status_code == 200
