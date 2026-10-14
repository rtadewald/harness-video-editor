"""Versões do projeto, marcas de mão, trava e atividade (docs/editor-claude.md, E2)."""
from apoio import criar_projeto
from app import projeto, versoes

CLAUDE = {'X-Autor': 'claude'}


def test_alvos_da_rota():
    a = versoes.alvos_da_rota
    assert a('/api/projetos/x/inserts/abc/enriquecimento', b'{}') == ('x', 'inserts', ['abc'])
    assert a('/api/projetos/x/inserts/ator/p3', b'{}') == ('x', 'presets_ator', ['p3'])
    assert a('/api/projetos/x/transicoes', b'{"campos": {"p5": null, "p2": {"id": "corte-seco"}}}') == ('x', 'transicoes', ['p2', 'p5'])
    assert a('/api/projetos/x/legenda', b'{"campos": {"ajustes": {"w00003": {"texto": "Claude"}}}}') == ('x', 'legenda', ['w00003'])
    assert a('/api/projetos/x/look', b'{}') == ('x', 'preprocessamento', ['look'])
    assert a('/api/projetos/x/direcao/corrigir', b'{}') == ('x', 'direcao', ['*'])
    for nao in ('/api/projetos/x/exportacao', '/api/projetos/x/processar', '/api/projetos/x/nome', '/api/banco/y'):
        assert a(nao, b'{}') is None


def test_versao_marcar_e_voltar(cliente, video):
    pid = criar_projeto(cliente, video)['id']
    assert cliente.get(f'/api/projetos/{pid}/versoes').json() == {'versoes': [], 'atual': 0}
    projeto.atualizar(pid, lambda p: p.update(look={'lut': 'casa', 'intensidade': 1, 'vinheta': 'normal'}))
    v1 = cliente.post(f'/api/projetos/{pid}/versoes', json={'resumo': 'primeira'}, headers=CLAUDE).json()
    assert (v1['versao'], v1['autor']) == (1, 'claude')
    cliente.put(f'/api/projetos/{pid}/look', json={'campos': {'lut': 'frio'}})
    assert projeto.ler(pid)['look']['lut'] == 'frio'
    cliente.post(f'/api/projetos/{pid}/versoes', json={}, headers=CLAUDE)
    assert [v['versao'] for v in cliente.get(f'/api/projetos/{pid}/versoes').json()['versoes']] == [1, 2]
    p = cliente.post(f'/api/projetos/{pid}/versoes/1/restaurar').json()
    assert p['look']['lut'] == 'casa' and p['versao'] == 1
    assert cliente.post(f'/api/projetos/{pid}/versoes/9/restaurar').status_code == 404


def test_marca_de_mao_so_da_tela(cliente, video):
    pid = criar_projeto(cliente, video)['id']
    cliente.post(f'/api/projetos/{pid}/versoes', json={}, headers=CLAUDE)
    cliente.put(f'/api/projetos/{pid}/look', json={'campos': {'lut': 'frio'}}, headers=CLAUDE)
    assert cliente.get(f'/api/projetos/{pid}/manuais').json() == []  # o Claude não deixa marca
    cliente.put(f'/api/projetos/{pid}/look', json={'campos': {'lut': 'natural'}})
    m = cliente.get(f'/api/projetos/{pid}/manuais').json()
    assert [(x['etapa'], x['alvo'], x['versao']) for x in m] == [('preprocessamento', 'look', 1)]
    cliente.put(f'/api/projetos/{pid}/look', json={'campos': {'lut': 'casa'}})
    assert len(cliente.get(f'/api/projetos/{pid}/manuais').json()) == 1  # a mesma marca, atualizada
    cliente.put(f'/api/projetos/{pid}/look', json={'campos': {'lut': 'xx'}})  # uma edição recusada não marca nada novo
    assert len(cliente.get(f'/api/projetos/{pid}/manuais').json()) == 1


def test_trava_e_atividade(cliente, video):
    pid = criar_projeto(cliente, video)['id']
    assert cliente.put(f'/api/projetos/{pid}/claude', json={'editando': True, 'etapa': 'inserts'}, headers=CLAUDE).json()['editando']
    r = cliente.put(f'/api/projetos/{pid}/look', json={'campos': {'lut': 'frio'}})
    assert r.status_code == 423 and 'inserts' in r.json()['detail']
    assert cliente.put(f'/api/projetos/{pid}/look', json={'campos': {'lut': 'frio'}}, headers=CLAUDE).status_code == 200
    cliente.post(f'/api/projetos/{pid}/atividade', json={'etapa': 'cortes', 'texto': 'cortes conferidos', 'segundos': 12.34}, headers=CLAUDE)
    a = cliente.get(f'/api/projetos/{pid}/atividade').json()
    assert a['claude']['etapa'] == 'inserts' and a['atividade'][-1]['segundos'] == 12.3 and a['atividade'][-1]['autor'] == 'claude'
    cliente.put(f'/api/projetos/{pid}/claude', json={'editando': False})  # a tela destrava
    assert cliente.put(f'/api/projetos/{pid}/look', json={'campos': {'lut': 'casa'}}).status_code == 200
