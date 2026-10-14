"""Os selos do banco e a faxina (docs/editor-claude.md §7, E6): quem trouxe cada mídia, usado/aprovado/recusado,
o selo à mão e "Limpar recusados" para a lixeira do banco."""
import subprocess
import types

from app import banco, comum, projeto, versoes
from tests.apoio import criar_projeto


def _png(tmp_path, nome):
    arq = tmp_path / nome
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x48', '-frames:v', '1', str(arq)], check=True)
    return arq


def _subir(cliente, arq, **form):
    claude = form.pop('claude', False)
    with arq.open('rb') as f:
        r = cliente.post('/api/banco', data=form, files=[('arquivos', (arq.name, f, 'image/png'))], headers={'X-Autor': 'claude'} if claude else {})
    assert r.status_code == 200, r.text
    return r.json()[0]


def _selos(cliente):
    return {i['id']: i['estado'] for i in cliente.get('/api/banco').json()}


def test_selos_e_faxina(cliente, video, tmp_path, monkeypatch):
    descritos = []
    monkeypatch.setattr(banco, '_descricoes', types.SimpleNamespace(submit=lambda f, bid: descritos.append(bid)))
    pid = criar_projeto(cliente, video)['id']
    meu = _subir(cliente, _png(tmp_path, 'meu.png'))
    usado = _subir(cliente, _png(tmp_path, 'usado.png'), claude=True, projeto=pid, descricao='Página inicial do site X', palavras='x, site', url='https://x.com')
    sobra = _subir(cliente, _png(tmp_path, 'sobra.png'), claude=True, projeto=pid, descricao='Outra página')
    # o que Rodrigo subiu: do criador, a IA do app descreve; o do Claude vem descrito (a IA não roda de novo)
    assert meu['do_criador'] and descritos == [meu['id']]
    assert usado['trazido_por'] == 'claude' and usado['projeto'] == pid and usado['descricao'] == 'Página inicial do site X'
    assert usado['palavras'] == ['x', 'site'] and usado['origem'] == {'tipo': 'web', 'url': 'https://x.com'}
    # projeto em edição: o do Claude fica sem selo; o de Rodrigo, aprovado
    assert _selos(cliente) == {meu['id']: 'aprovado', usado['id']: None, sobra['id']: None}
    assert cliente.get('/api/banco-recusados').json() == {'ids': []}

    # a versão aprovada usa só uma das mídias do Claude
    projeto.atualizar(pid, lambda p: p.update(inserts={'pedidos': [{'id': 'i1', 'plano': 'p1', 'midias': [{'id': 'm1', 'banco': usado['id']}]}]}))
    v = versoes.marcar(pid)
    arq = projeto.pasta(pid) / 'versoes' / f"v{v['versao']}.json"
    comum.salvar_json(arq, {**comum.ler_json(arq), 'aprovada': True})
    assert _selos(cliente) == {meu['id']: 'aprovado', usado['id']: 'usado', sobra['id']: 'recusado'}

    # o selo à mão vence o automático; "auto" volta
    assert cliente.put(f"/api/banco/{sobra['id']}/estado", json={'estado': 'aprovado'}).json()['estado'] == 'aprovado'
    assert cliente.get('/api/banco-recusados').json() == {'ids': []}
    assert cliente.put(f"/api/banco/{sobra['id']}/estado", json={'estado': None}).json()['estado'] == 'recusado'
    assert cliente.put(f"/api/banco/{sobra['id']}/estado", json={'estado': 'usado'}).status_code == 422

    # limpar: só o recusado vai para a lixeira do banco (com os trechos); o resto fica
    assert cliente.get('/api/banco-recusados').json() == {'ids': [sobra['id']]}
    assert cliente.post('/api/banco-recusados/limpar').json() == {'levados': [sobra['id']]}
    assert set(_selos(cliente)) == {meu['id'], usado['id']}
    assert [p.name.split('-')[0] for p in (banco.RAIZ / banco.LIXEIRA).iterdir()] == [sobra['id']]


def test_recusado_em_uso_nao_vai_para_a_lixeira_e_selo_do_19(cliente, video, tmp_path, monkeypatch):
    monkeypatch.setattr(banco, '_descricoes', types.SimpleNamespace(submit=lambda f, bid: None))
    pid = criar_projeto(cliente, video)['id']
    x = _subir(cliente, _png(tmp_path, 'x.png'), claude=True, projeto=pid, descricao='x')
    banco.marcar_estado(x['id'], 'recusado')
    projeto.atualizar(pid, lambda p: p.update(inserts={'pedidos': [{'id': 'i1', 'plano': 'p1', 'midias': [{'id': 'm1', 'banco': x['id']}]}]}))
    assert banco.recusados() == []
    # as mídias copiadas do 19 guardam o selo que tinham lá
    banco.salvar_item({'id': 'b19', 'nome': 'do 19', 'tipo': 'imagem', 'arquivo': 'original.png', 'projeto': 'mvi-0717', 'estado_19': 'recusado'})
    banco.salvar_item({'id': 'b19u', 'nome': 'do 19', 'tipo': 'imagem', 'arquivo': 'original.png', 'projeto': 'mvi-0717', 'estado_19': 'usado'})
    est = banco.estados()
    assert est['b19']['estado'] == 'recusado' and est['b19u']['estado'] == 'usado'
    assert banco.recusados() == ['b19']
