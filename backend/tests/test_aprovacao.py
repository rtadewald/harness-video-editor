"""A aprovação (docs/editor-claude.md §7, E9): o estado de agora × a versão aprovada, o projeto que vira referência
(a revisar: só ensina depois de revisada), a Heurística e os aprendizados na skill."""
import shutil

from app import aprendizados, aprovacao, calibragem, direcao_projeto, exportacao, projeto, referencias, versoes
from tests.apoio import criar_projeto

CLAUDE = {'X-Autor': 'claude'}


def test_projeto_aprovado_vira_referencia(cliente, video, monkeypatch):
    pid = criar_projeto(cliente, video)['id']
    saida = [{'id': 'w00000', 'texto': 'oi', 'saida_ini': 0.1, 'saida_fim': 0.5}, {'id': 'w00001', 'texto': 'gente', 'saida_ini': 0.6, 'saida_fim': 1.2},
             {'id': 'w00002', 'texto': 'olha', 'saida_ini': 1.4, 'saida_fim': 2.0}]
    monkeypatch.setattr(direcao_projeto, '_palavras_mantidas', lambda i, p: saida)
    itens = [{'id': 'p1', 'camada': 'plano', 'tipo': 'tela_dividida_insert', 'conteudo': None, 'palavra_ini': 'w00000', 'palavra_fim': 'w00001',
              'off_ini': -0.1, 'off_fim': 0.0, 'texto': None, 'descricao': 'o site'},
             {'id': 'p2', 'camada': 'plano', 'tipo': 'full_ator', 'conteudo': None, 'palavra_ini': 'w00002', 'palavra_fim': 'w00002',
              'off_ini': 0.0, 'off_fim': 0.0, 'texto': None, 'descricao': ''}]
    projeto.atualizar(pid, lambda p: p.update(direcao={'status': 'pronto', 'itens': itens}))
    assert cliente.get(f'/api/projetos/{pid}/aprovacao').json() == {'versao': None, 'difere': [], 'referencia': None}
    cliente.post(f'/api/projetos/{pid}/versoes', json={'resumo': 'v1'}, headers=CLAUDE)
    assert cliente.post(f'/api/projetos/{pid}/referencia', json={}).status_code == 409  # sem versão aprovada
    cliente.put(f'/api/projetos/{pid}/revisao/1', json={'comentarios': [{'id': 'c1', 't': 0.5, 'texto': 'troca o site'}]})
    cliente.post(f'/api/projetos/{pid}/revisao/1/aprovar')
    assert cliente.post(f'/api/projetos/{pid}/referencia', json={}).json()['detail'].startswith('Exporte o vídeo antes')
    # um MP4 "exportado" (o vídeo de teste) e o estado da exportação pronta
    exportacao.pasta_exports(pid).mkdir(parents=True, exist_ok=True)
    shutil.copy(video, exportacao.pasta_exports(pid) / 'final.mp4')
    projeto.atualizar(pid, lambda p: p.update(exportacao={'status': 'pronta', 'arquivo': 'final.mp4'}))
    assert cliente.get(f'/api/projetos/{pid}/aprovacao').json()['difere'] == []  # o estado de agora é o da v1
    rid = cliente.post(f'/api/projetos/{pid}/referencia', json={}).json()['id']
    assert rid == f'prj-{pid}-v1'
    ref = referencias.ler(rid)
    assert ref['status'] == 'a_revisar' and ref['origem']['projeto'] == pid and ref['origem']['versao'] == 1
    assert [(r['versao'], r['texto']) for r in ref['revisoes']] == [(1, 'troca o site')]
    d = (referencias.RAIZ / rid / 'direcao.json').read_text()
    assert '"p1"' in d and '"o site"' in d and (referencias.RAIZ / rid / 'proxy.mp4').exists()
    # a referência de um projeto não ensina enquanto está a revisar
    assert rid not in [r['id'] for r, _ in calibragem.videos_da_calibragem()]
    referencias.atualizar(rid, lambda r: r.update(status='revisado'))
    assert rid in [r['id'] for r, _ in calibragem.videos_da_calibragem()]
    assert cliente.get(f'/api/projetos/{pid}/aprovacao').json()['referencia'] == rid


def test_difere_da_versao(cliente, video):
    pid = criar_projeto(cliente, video)['id']
    versoes.marcar(pid)
    assert aprovacao.difere(pid, 1) == []
    projeto.atualizar(pid, lambda p: p.update(velocidade=1.2))
    assert aprovacao.difere(pid, 1) == ['velocidade']


def test_heuristica_e_aprendizados_na_skill(cliente):
    h = cliente.put('/api/referencias/heuristica', json={'regras': '## Regras do criador\n- abrir com tela dividida\n'}).json()
    assert calibragem.REGRAS_MD.read_text() == '## Regras do criador\n- abrir com tela dividida\n' and 'abrir' in h['regras']
    assert 'regras' not in (referencias.RAIZ / '_heuristica.json').read_text()
    aprendizados.PASTA.mkdir()
    (aprendizados.PASTA / 'inserts.md').write_text('# Inserts\n- um\n')
    (aprendizados.PASTA / 'cortes.md').write_text('# Cortes\n')
    lista = cliente.get('/api/aprendizados').json()
    assert [(x['area'], x['nome']) for x in lista] == [('cortes', 'Cortes'), ('inserts', 'Inserts')]
    x = cliente.put('/api/aprendizados/inserts', json={'texto': '# Inserts\n- um\n- dois'}).json()
    assert x['texto'] == '# Inserts\n- um\n- dois\n'
    assert cliente.put('/api/aprendizados/nao-existe', json={'texto': 'x'}).status_code == 404
    assert cliente.put('/api/aprendizados/..%2Fsegredo', json={'texto': 'x'}).status_code == 404
