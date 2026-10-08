"""Motions (SPEC §8.5; docs/motions.md): o documento do motion, a biblioteca e o uso nos planos."""
import json
import re
import types

from apoio import criar_projeto as _criar


FRAG = '''<script type="application/json" id="campos">{"titulo": {"tipo": "texto", "rotulo": "Título", "padrao": "Image to Code"}, "cor": {"tipo": "cor", "rotulo": "Cor", "padrao": "#14b8a6"}, "ruim": "x"}</script>
<div id="t"></div><script>const tl = gsap.timeline({paused: true}); motion.pronto(tl)</script>'''


def test_motion_campos_e_documento():
    from app import motions
    campos = motions.campos_de(FRAG)
    assert campos == {'titulo': {'tipo': 'texto', 'rotulo': 'Título', 'padrao': 'Image to Code'}, 'cor': {'tipo': 'cor', 'rotulo': 'Cor', 'padrao': '#14b8a6'}}
    doc = motions.documento(FRAG, 'dividida', 2.0, {'titulo': 'Outro </script> texto'}, [])
    assert 'width:1080px;height:960px' in doc and '/motion/gsap.min.js' in doc and '/motion/runtime.js' in doc
    dados = json.loads(re.search(r'window.MOTION=(.*?)</script>', doc).group(1).replace('<\\/', '</'))
    assert dados['campos'] == {'titulo': 'Outro </script> texto', 'cor': '#14b8a6'} and dados['duracao'] == 2.0
    assert doc.index('/motion/runtime.js') < doc.index('motion.pronto')  # o runtime existe antes do motion rodar
    assert motions._fragmento('blá\n```html\n<p>x</p>\n```') == '<p>x</p>'


def test_motion_biblioteca_e_uso_no_plano(cliente, video, monkeypatch, tmp_path):
    from app import motions
    monkeypatch.setattr(motions, 'RAIZ', tmp_path / 'motions')
    rodou = []
    monkeypatch.setattr(motions, '_fila', types.SimpleNamespace(submit=lambda f, *a: rodou.append(a)))
    r = cliente.post('/api/motions', json={'nome': 'Lettering', 'formato': 'vertical', 'duracao': 2.5, 'prompt': 'Image to Code'})
    assert r.status_code == 200 and r.json()['status']['estado'] == 'fila' and rodou
    mid = r.json()['id']
    assert cliente.post('/api/motions', json={'formato': 'quadrado', 'prompt': 'x'}).status_code == 422
    # uma versão pronta (como a IA gravaria)
    (motions.pasta(mid) / 'v1.html').write_text(FRAG, encoding='utf-8')
    (motions.pasta(mid) / 'v1.jpg').write_bytes(b'jpg')
    motions.atualizar(mid, lambda m: m.update(versoes=[{'n': 1, 'de': None, 'comentario': None, 'campos': motions.campos_de(FRAG)}], ativa=1,
                                              status={'estado': 'pronto', 'erro': None, 'etapa': None}))
    assert cliente.patch(f'/api/motions/{mid}', json={'campos': {'valores': {'titulo': 'Novo'}, 'favorito': True}}).json()['favorito'] is True
    assert '"Novo"' in cliente.get(f'/api/motions/{mid}/pagina').text
    # usar num plano copia; mudar o original depois não muda o plano
    id = _criar(cliente, video)['id']
    u = cliente.put(f'/api/projetos/{id}/motions/p4', json={'motion': mid}).json()
    assert (u['origem'], u['versao'], u['valores']) == (mid, 1, {'titulo': 'Novo'})
    cliente.patch(f'/api/motions/{mid}', json={'campos': {'valores': {'titulo': 'Mudou no original'}}})
    pagina = cliente.get(f'/api/projetos/{id}/motions/p4/pagina?duracao=3').text
    assert '"Novo"' in pagina and '"duracao": 3.0' in pagina
    assert cliente.patch(f'/api/projetos/{id}/motions/p4', json={'valores': {'titulo': 'Só aqui'}}).json()['valores'] == {'titulo': 'Só aqui'}
    assert cliente.post(f'/api/motions/{mid}/versoes', json={'de': 9, 'comentario': 'x'}).status_code == 409
    cliente.delete(f'/api/projetos/{id}/motions/p4')
    assert cliente.get(f'/api/projetos/{id}/motions').json() == {}
