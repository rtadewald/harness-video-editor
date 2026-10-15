"""Os CTAs (docs/editor-claude.md, E10): subir, marcar o trecho, categoria, produto, o favorito da categoria, apagar."""
from app import comum, ctas


def test_ctas(cliente, video):
    assert cliente.get('/api/ctas').json()['categorias'][0]['id'] == 'manychat-instagram'
    with video.open('rb') as f:
        novos = cliente.post('/api/ctas', files=[('arquivos', ('cta final.mp4', f, 'video/mp4'))], data={'categoria': 'lp'}).json()
    a = novos[0]
    assert (a['nome'], a['categoria'], a['inicio'], a['favorito']) == ('cta final', 'lp', 0.0, False) and a['fim'] == a['duracao'] > 2
    with video.open('rb') as f:
        b = cliente.post('/api/ctas', files=[('arquivos', ('outro.mp4', f, 'video/mp4'))]).json()[0]
    assert b['categoria'] is None
    # o trecho do CTA, a categoria e o produto
    r = cliente.put(f"/api/ctas/{a['id']}", json={'inicio': 1.0, 'fim': 2.5, 'produto': 'fia'}).json()
    assert (r['inicio'], r['fim'], r['produto']) == (1.0, 2.5, 'fia')
    assert cliente.put(f"/api/ctas/{a['id']}", json={'inicio': 2.0, 'fim': 2.2}).status_code == 422
    assert cliente.put(f"/api/ctas/{a['id']}", json={'categoria': 'nao-existe'}).status_code == 422
    # um favorito por categoria
    cliente.put(f"/api/ctas/{b['id']}", json={'categoria': 'lp'})
    cliente.put(f"/api/ctas/{a['id']}", json={'favorito': True})
    cliente.put(f"/api/ctas/{b['id']}", json={'favorito': True})
    fav = {c['id']: c['favorito'] for c in cliente.get('/api/ctas').json()['ctas']}
    assert fav == {a['id']: False, b['id']: True}
    # os arquivos
    assert cliente.get(f"/api/ctas/{a['id']}/tira.jpg").status_code == 200
    assert cliente.get(f"/api/ctas/{a['id']}/original.mp4").status_code == 404
    assert cliente.get('/api/ctas/../segredo').status_code == 404
    # um produto que sai, sai dos CTAs
    p = cliente.put('/api/ctas-produtos', json={'produtos': [{'id': 'claude', 'nome': 'Claude', 'emoji': '✴️'}, {'nome': 'Novo', 'emoji': '🆕'}]}).json()['produtos']
    assert [x['nome'] for x in p] == ['Claude', 'Novo'] and p[1]['id']
    assert ctas.ler(a['id'])['produto'] is None
    # apagar vai para a lixeira
    assert cliente.delete(f"/api/ctas/{a['id']}").json() == {'ok': True}
    assert [c['id'] for c in cliente.get('/api/ctas').json()['ctas']] == [b['id']]
    assert any(x.name.startswith(a['id']) for x in (comum.BIBLIOTECA / 'ctas' / '_lixeira').iterdir())
