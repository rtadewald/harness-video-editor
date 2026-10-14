"""A revisão de Rodrigo e as respostas do Claude (docs/editor-claude.md §6, E8)."""
from app import projeto, revisoes, versoes
from tests.apoio import criar_projeto

CLAUDE = {'X-Autor': 'claude'}


def test_revisao_comentar_enviar_responder_e_aprovar(cliente, video):
    pid = criar_projeto(cliente, video)['id']
    # sem versão, não há o que revisar
    assert cliente.get(f'/api/projetos/{pid}/revisao').status_code == 409
    # o Claude deixa uma dúvida; ela vai com a versão marcada
    d = cliente.post(f'/api/projetos/{pid}/duvidas', json={'palavra': 'w00003', 'texto': 'Tirei a retomada; ficou bom?', 'fala': 'a galera'}, headers=CLAUDE).json()
    assert d['id'] == 'd1' and d['palavra_fim'] == 'w00003'
    cliente.post(f'/api/projetos/{pid}/versoes', json={'resumo': 'v1'}, headers=CLAUDE)
    assert 'duvidas' not in projeto.ler(pid)
    r = cliente.get(f'/api/projetos/{pid}/revisao').json()
    assert r['versao'] == 1 and r['revisao']['comentarios'] == [] and [x['id'] for x in r['duvidas']] == ['d1']
    # nada para enviar ainda
    assert cliente.post(f'/api/projetos/{pid}/revisao/1/enviar').status_code == 409

    # um anexo colado (o corpo cru) e os comentários da tela
    a = cliente.post(f'/api/projetos/{pid}/revisao/1/anexo', params={'comentario': 'c1'}, content=b'\x89PNG...', headers={'Content-Type': 'image/png'}).json()
    assert a == {'caminho': 'revisoes/anexos/c1-1.png'}
    assert cliente.post(f'/api/projetos/{pid}/revisao/1/anexo', params={'comentario': 'c1'}, content=b'x', headers={'Content-Type': 'text/plain'}).status_code == 422
    coms = [
        {'id': 'c1', 't': 3.2141, 'fim': None, 'palavra': 'w00005', 'fala': 'é muito', 'plano': 'p2', 'texto': 'Troque este insert\npor um print', 'anexos': [a['caminho'], '../fora.png']},
        {'id': 'c2', 'geral': True, 't': 9, 'texto': 'Legenda um pouco mais baixa', 'status': 'aplicado'},
        {'id': 'c3', 't': 1.0, 'fim': 2.5, 'palavra': 'w00001', 'palavra_fim': 'w00004', 'fala': 'oi gente', 'texto': 'Sim', 'responde': 'd1'},
        {'id': 'c4', 't': 5, 'texto': ''},
    ]
    rev = cliente.put(f'/api/projetos/{pid}/revisao/1', json={'comentarios': coms}).json()
    c1, c2 = rev['comentarios'][:2]
    assert c1['t'] == 3.214 and c1['anexos'] == ['revisoes/anexos/c1-1.png'] and c1['status'] == 'pendente'
    assert c2['geral'] and c2['t'] is None and c2['status'] == 'pendente'  # a tela não muda o status

    # a revisão não é uma edição de etapa: não marca nada à mão (e passa com o projeto travado)
    assert versoes.manuais(pid) == []
    versoes.travar(pid, True, 'cortes')
    assert cliente.put(f'/api/projetos/{pid}/revisao/1', json={'comentarios': coms}).status_code == 200
    versoes.travar(pid, False)
    env = cliente.post(f'/api/projetos/{pid}/revisao/1/enviar').json()
    assert env['revisao']['enviado_em']
    linhas = env['texto'].splitlines()
    assert linhas[0].startswith('Revisão · ') and linhas[0].endswith(' · v1')
    assert linhas[1:] == [
        '[Geral] Legenda um pouco mais baixa',
        '[↳ dúvida do Claude 0:01,0] "oi gente" — Sim',
        '[0:03,2] "é muito" — Troque este insert / por um print',
        f'  ↳ print: dados/projetos/{pid}/revisoes/anexos/c1-1.png',
        f'(dados/projetos/{pid}/revisoes/v1.json)',
    ]

    # o Claude responde; a tela salvar de novo não apaga a resposta
    assert cliente.post(f'/api/projetos/{pid}/revisao/1/responder', json={'comentario': 'c1', 'status': 'aplicado', 'resposta': 'Troquei pelo print do site'}, headers=CLAUDE).json()['status'] == 'aplicado'
    assert cliente.post(f'/api/projetos/{pid}/revisao/1/responder', json={'comentario': 'c9', 'status': 'aplicado'}).status_code == 404
    rev = cliente.put(f'/api/projetos/{pid}/revisao/1', json={'comentarios': coms[:1]}).json()
    assert rev['comentarios'][0]['resposta'] == 'Troquei pelo print do site' and len(rev['comentarios']) == 1

    # apagar o anexo; aprovar marca a versão aprovada
    assert cliente.request('DELETE', f'/api/projetos/{pid}/revisao/1/anexo', params={'caminho': 'revisoes/anexos/c1-1.png'}).json() == {'ok': True}
    assert not (projeto.pasta(pid) / 'revisoes' / 'anexos' / 'c1-1.png').exists()
    assert cliente.request('DELETE', f'/api/projetos/{pid}/revisao/1/anexo', params={'caminho': '../projeto.json'}).status_code == 422
    ap = cliente.post(f'/api/projetos/{pid}/revisao/1/aprovar').json()
    assert ap['texto'].startswith('Aprovado · ') and ap['texto'].endswith(' · v1') and ap['revisao']['aprovado']
    assert versoes.aprovada(pid) == 1 and versoes.listar(pid)[0]['aprovada']


def test_tempo_como_a_tela():
    assert revisoes.tempo(63.84) == '1:03,8' and revisoes.tempo(None) == '0:00,0'
