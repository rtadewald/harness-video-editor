import { useEffect, useMemo, useRef, useState } from "react";
import {
  Library,
  Loader2,
  Pause,
  Play,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { s1, urlBancoMiniatura, type ItemBanco } from "@/api";
import {
  apagarMotion,
  criarMotion,
  editarMotion,
  listarMotions,
  novaVersaoMotion,
  urlMiniaturaMotion,
  urlMiniaturaMotionPlano,
  urlPaginaMotion,
  urlPaginaMotionPlano,
  usarMotion,
  valoresMotionPlano,
  type CampoMotion,
  type Motion,
  type MotionPlano,
  type ReferenciaMotion,
} from "./api";
import Modal from "@/components/Modal";
import { cn } from "@/lib/utils";
import BuscarReferencias from "@/editor/BuscarReferencias";
import MotionNoLugar from "./MotionNoLugar";

type Plano = {
  id: string;
  tipo: string;
  inicio: number;
  fim: number;
  descricao?: string | null;
  fala: string;
};
type Sel =
  { tipo: "novo" } | { tipo: "plano" } | { tipo: "motion"; id: string };

const ETAPA: Record<string, string> = {
  escrevendo: "a IA está escrevendo",
  conferindo: "conferindo os quadros",
  finalizando: "finalizando",
};

/** A criação e a escolha de motions de um plano (SPEC §8.5): a biblioteca à esquerda, a prévia em loop no centro e, à
 *  direita, o pedido (motion novo) ou os campos, as versões e o comentário (motion existente). "Usar neste plano" copia a
 *  versão e os valores para o plano. */
export default function ModalMotions(p: {
  projetoId: string;
  plano: Plano;
  atual: MotionPlano | null;
  banco: Map<string, ItemBanco>;
  escolherDoBanco: (escolher: (i: ItemBanco) => void) => void;
  fechar: () => void;
  mudou: () => void;
}) {
  const formato: "vertical" | "dividida" =
    p.plano.tipo === "tela_dividida_motion" ? "dividida" : "vertical";
  const duracao = Math.max(p.plano.fim - p.plano.inicio, 0.5);
  const [lista, setLista] = useState<Motion[] | null>(null);
  const [sel, setSel] = useState<Sel>(
    p.atual ? { tipo: "plano" } : { tipo: "novo" },
  );
  const [erro, setErro] = useState<string | null>(null);
  const falhar = (e: unknown) => setErro((e as Error).message);

  const recarregar = () => listarMotions().then(setLista).catch(falhar);
  useEffect(() => void recarregar(), []); // eslint-disable-line react-hooks/exhaustive-deps
  // enquanto algum motion gera, acompanha
  const gerando = lista?.some(
    (m) => m.status.estado === "fila" || m.status.estado === "gerando",
  );
  useEffect(() => {
    if (!gerando) return;
    const t = setInterval(() => void recarregar(), 2500);
    return () => clearInterval(t);
  }, [gerando]); // eslint-disable-line react-hooks/exhaustive-deps

  const doFormato = (lista ?? []).filter((m) => m.formato === formato);
  const motion =
    sel.tipo === "motion"
      ? (lista?.find((m) => m.id === sel.id) ?? null)
      : null;

  return (
    <Modal
      titulo={`Motion · ${p.plano.tipo === "tela_dividida_motion" ? "tela dividida" : "tela cheia"} · ${s1(duracao)} s`}
      fechar={p.fechar}
      tamanho="tela"
    >
      {erro && (
        <p className="flex items-center gap-2 text-[12px] text-coral">
          {erro}
          <button onClick={() => setErro(null)} aria-label="Fechar o aviso">
            <X className="size-3.5" />
          </button>
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_380px] gap-5">
        {/* a biblioteca */}
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
          <button
            onClick={() => setSel({ tipo: "novo" })}
            className={cn(
              "flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-[12.5px] font-semibold ring-1",
              sel.tipo === "novo"
                ? "bg-coral text-cream ring-coral"
                : "text-cream ring-line-dark hover:ring-cream/40",
            )}
          >
            <Plus className="size-4" /> Novo motion
          </button>
          {p.atual && (
            <Item
              titulo="Neste plano"
              nome={p.atual.nome}
              miniatura={urlMiniaturaMotionPlano(
                p.projetoId,
                p.plano.id,
                p.atual,
              )}
              ativo={sel.tipo === "plano"}
              onClick={() => setSel({ tipo: "plano" })}
            />
          )}
          <p className="eyebrow mt-2 flex items-center gap-1.5 text-sage">
            <Library className="size-3" /> Biblioteca (
            {formato === "vertical" ? "tela cheia" : "tela dividida"})
          </p>
          {!lista && <p className="text-[12px] text-fog">Carregando…</p>}
          {lista && !doFormato.length && (
            <p className="text-[12px] leading-[1.6] text-fog">
              Nenhum motion deste formato ainda.
            </p>
          )}
          {doFormato.map((m) => (
            <Item
              key={m.id}
              nome={m.nome}
              miniatura={m.ativa ? urlMiniaturaMotion(m) : null}
              favorito={m.favorito}
              status={
                m.status.estado === "pronto"
                  ? null
                  : m.status.estado === "erro"
                    ? "erro"
                    : (ETAPA[m.status.etapa ?? ""] ?? "na fila")
              }
              ativo={sel.tipo === "motion" && sel.id === m.id}
              onClick={() => setSel({ tipo: "motion", id: m.id })}
            />
          ))}
        </aside>

        {/* a prévia */}
        <section className="grid min-h-0 place-items-center">
          {sel.tipo === "plano" && p.atual ? (
            <Previa
              src={urlPaginaMotionPlano(
                p.projetoId,
                p.plano.id,
                p.atual,
                duracao,
              )}
              formato={formato}
              duracao={duracao}
            />
          ) : motion?.ativa ? (
            <Previa
              src={urlPaginaMotion(motion)}
              formato={formato}
              duracao={motion.duracao}
            />
          ) : (
            <div
              className={cn(
                "grid w-full max-w-[340px] place-items-center rounded-[8px] border border-dashed border-line-dark text-center text-[12.5px] text-fog",
                formato === "vertical" ? "aspect-[9/16]" : "aspect-[9/8]",
              )}
            >
              {motion && motion.status.estado !== "erro" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />{" "}
                  {ETAPA[motion.status.etapa ?? ""] ?? "na fila"}…
                </span>
              ) : (
                <span className="px-6">
                  Descreva o motion à direita e gere a primeira versão.
                </span>
              )}
            </div>
          )}
        </section>

        {/* o pedido ou o motion */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          {sel.tipo === "novo" && (
            <NovoMotion
              plano={p.plano}
              formato={formato}
              duracao={duracao}
              banco={p.banco}
              escolherDoBanco={p.escolherDoBanco}
              criou={(m) => {
                setLista((l) => [m, ...(l ?? [])]);
                setSel({ tipo: "motion", id: m.id });
              }}
              falhar={falhar}
            />
          )}
          {sel.tipo === "plano" && p.atual && (
            <NoPlano
              projetoId={p.projetoId}
              plano={p.plano.id}
              atual={p.atual}
              abrirOriginal={() =>
                setSel({ tipo: "motion", id: p.atual!.origem })
              }
              mudou={p.mudou}
              falhar={falhar}
            />
          )}
          {motion && (
            <DetalheMotion
              key={motion.id}
              m={motion}
              mudou={(m) =>
                setLista((l) => (l ?? []).map((x) => (x.id === m.id ? m : x)))
              }
              apagou={() => {
                setLista((l) => (l ?? []).filter((x) => x.id !== motion.id));
                setSel({ tipo: "novo" });
              }}
              usar={(n) =>
                usarMotion(
                  p.projetoId,
                  p.plano.id,
                  motion.id,
                  n,
                  motion.valores,
                )
                  .then(() => {
                    p.mudou();
                    p.fechar();
                  })
                  .catch(falhar)
              }
              falhar={falhar}
            />
          )}
        </aside>
      </div>
    </Modal>
  );
}

function Item(p: {
  titulo?: string;
  nome: string;
  miniatura: string | null;
  favorito?: boolean;
  status?: string | null;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={p.onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-[8px] p-1.5 text-left ring-1 transition-colors",
        p.ativo
          ? "bg-cream/10 ring-2 ring-coral"
          : "ring-line-dark hover:ring-cream/40",
      )}
    >
      <span className="grid h-14 w-8 shrink-0 place-items-center overflow-hidden rounded-[4px] bg-deeper">
        {p.miniatura ? (
          <img src={p.miniatura} alt="" className="size-full object-cover" />
        ) : (
          <Sparkles className="size-3.5 text-fog" />
        )}
      </span>
      <span className="min-w-0">
        {p.titulo && (
          <span className="eyebrow block text-yellow">{p.titulo}</span>
        )}
        <span className="block truncate text-[12.5px] font-semibold">
          {p.favorito && (
            <Star className="mr-1 inline size-3 fill-yellow text-yellow" />
          )}
          {p.nome}
        </span>
        {p.status && (
          <span
            className={cn(
              "block text-[11px]",
              p.status === "erro" ? "text-coral" : "text-fog",
            )}
          >
            {p.status}
          </span>
        )}
      </span>
    </button>
  );
}

/** A prévia do motion em loop, com play/pausa e o cursor (o relógio é daqui: a cena só anda quando o app manda). */
function Previa(p: {
  src: string;
  formato: "vertical" | "dividida";
  duracao: number;
}) {
  const [t, setT] = useState(0);
  const [tocando, setTocando] = useState(true);
  const inicio = useRef<number | null>(null);
  useEffect(() => {
    if (!tocando) return;
    let id = 0;
    const base = performance.now() - t * 1000;
    inicio.current = base;
    const passo = (agora: number) => {
      setT(((agora - base) / 1000) % (p.duracao + 0.6));
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [tocando, p.duracao, p.src]); // eslint-disable-line react-hooks/exhaustive-deps
  const rel = Math.min(t, p.duracao);
  return (
    <div className="grid w-full justify-items-center gap-3">
      <div
        className={cn(
          "relative w-full max-w-[340px] overflow-hidden rounded-[6px] bg-black ring-1 ring-line-dark",
          p.formato === "vertical" ? "aspect-[9/16]" : "aspect-[9/8]",
        )}
      >
        <MotionNoLugar
          src={p.src}
          formato={p.formato}
          rel={rel}
          noLugar={false}
          className="absolute inset-0"
        />
      </div>
      <div className="flex w-full max-w-[340px] items-center gap-2.5 text-[11px] text-fog">
        <button
          onClick={() => setTocando((v) => !v)}
          className="grid size-8 place-items-center rounded-full bg-cream text-ink"
          aria-label={tocando ? "Pausar" : "Tocar"}
        >
          {tocando ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5 translate-x-px" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={p.duracao}
          step={0.01}
          value={rel}
          onChange={(e) => {
            setTocando(false);
            setT(Number(e.target.value));
          }}
          className="flex-1 accent-coral"
        />
        <span className="w-14 text-right tabular-nums">
          {s1(rel)} / {s1(p.duracao)} s
        </span>
      </div>
    </div>
  );
}

/** O pedido de um motion novo: o que se quer (já com o que a direção pediu), referências da galeria e mídias do banco. */
function NovoMotion(p: {
  plano: Plano;
  formato: string;
  duracao: number;
  banco: Map<string, ItemBanco>;
  escolherDoBanco: (escolher: (i: ItemBanco) => void) => void;
  criou: (m: Motion) => void;
  falhar: (e: unknown) => void;
}) {
  const [nome, setNome] = useState(() =>
    (p.plano.descricao ?? "Motion").split(/[.,:;]/)[0].slice(0, 60),
  );
  const [prompt, setPrompt] = useState(() =>
    [p.plano.descricao, p.plano.fala && `Fala neste trecho: “${p.plano.fala}”`]
      .filter(Boolean)
      .join("\n\n"),
  );
  const [refs, setRefs] = useState<ReferenciaMotion[]>([]);
  const [midias, setMidias] = useState<string[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const campo =
    "w-full rounded-[4px] border border-line-dark bg-deeper px-2.5 py-1.5 text-[12.5px] text-cream outline-none focus:border-cream/50";
  return (
    <div className="grid gap-4 text-[12px]">
      <label className="grid gap-1.5">
        <span className="eyebrow text-sage">Nome</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={campo}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="eyebrow text-sage">O que você quer</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          className={cn(campo, "resize-y leading-[1.55]")}
        />
      </label>
      <div className="grid gap-1.5">
        <span className="eyebrow flex items-center text-sage">
          Referências ({refs.length})
          <button
            onClick={() => setBuscando(true)}
            className="ml-auto flex items-center gap-1 rounded-full border border-line-dark px-2 py-0.5 tracking-normal normal-case text-fog hover:text-cream"
          >
            <Plus className="size-3" /> Escolher
          </button>
        </span>
        {refs.map((r, k) => (
          <div
            key={k}
            className="flex items-start gap-2 rounded-[6px] bg-cream/[0.04] p-2 ring-1 ring-line-dark"
          >
            <p className="line-clamp-2 flex-1 text-[11.5px] leading-[1.5] text-cream/85">
              {r.descricao}
            </p>
            <button
              onClick={() => setRefs((l) => l.filter((_, j) => j !== k))}
              className="text-fog hover:text-coral"
              aria-label="Tirar"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid gap-1.5">
        <span className="eyebrow flex items-center text-sage">
          Mídias do banco ({midias.length})
          <button
            onClick={() =>
              p.escolherDoBanco((i) =>
                setMidias((l) => (l.includes(i.id) ? l : [...l, i.id])),
              )
            }
            className="ml-auto flex items-center gap-1 rounded-full border border-line-dark px-2 py-0.5 tracking-normal normal-case text-fog hover:text-cream"
          >
            <Plus className="size-3" /> Escolher
          </button>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {midias.map((id) => (
            <span key={id} className="relative">
              <img
                src={urlBancoMiniatura(id)}
                alt=""
                title={p.banco.get(id)?.nome}
                className="h-12 w-20 rounded-[4px] object-cover ring-1 ring-line-dark"
              />
              <button
                onClick={() => setMidias((l) => l.filter((x) => x !== id))}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-fog hover:text-coral"
                aria-label="Tirar"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
      <button
        disabled={enviando || !prompt.trim()}
        onClick={() => {
          setEnviando(true);
          criarMotion({
            nome,
            formato: p.formato,
            duracao: p.duracao,
            prompt,
            referencias: refs,
            midias,
          })
            .then(p.criou)
            .catch(p.falhar)
            .finally(() => setEnviando(false));
        }}
        className="flex items-center justify-center gap-2 rounded-full bg-coral px-4 py-2 text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
      >
        <Sparkles className="size-4" /> Gerar o motion
      </button>
      <p className="text-[11px] leading-[1.6] text-fog">
        A IA escreve a animação (30 a 90 s), confere 4 quadros do resultado e
        corrige antes de entregar. Segue a identidade das Configurações.
      </p>
      {buscando && (
        <BuscarReferencias
          tipo={
            p.formato === "dividida"
              ? "tela_dividida_motion"
              : "motion_tela_cheia"
          }
          fechar={() => setBuscando(false)}
          usar={(c) =>
            setRefs((l) =>
              l.some((r) => r.ref === c.ref && r.inicio === c.inicio)
                ? l
                : [
                    ...l,
                    {
                      ref: c.ref,
                      inicio: c.inicio,
                      fim: c.fim,
                      tipo: c.tipo,
                      descricao: c.descricao,
                      texto: c.texto,
                    },
                  ],
            )
          }
        />
      )}
    </div>
  );
}

/** Os campos de um motion (textos e cores): mudar aparece na prévia na hora (e salva um pouco depois). */
function Campos(p: {
  campos: Record<string, CampoMotion>;
  valores: Record<string, string>;
  mudar: (v: Record<string, string>) => void;
}) {
  const [v, setV] = useState(p.valores);
  useEffect(() => setV(p.valores), [p.valores]);
  const t = useRef<number | undefined>(undefined);
  const mudar = (k: string, valor: string) => {
    const novo = { ...v, [k]: valor };
    setV(novo);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => p.mudar(novo), 500);
  };
  const nomes = Object.keys(p.campos);
  if (!nomes.length)
    return (
      <p className="text-[11.5px] text-fog">
        Este motion não tem campos editáveis.
      </p>
    );
  return (
    <div className="grid gap-2.5">
      {nomes.map((k) => {
        const c = p.campos[k];
        const valor = v[k] ?? c.padrao;
        return (
          <label key={k} className="grid gap-1">
            <span className="text-[11.5px] text-fog">{c.rotulo}</span>
            {c.tipo === "cor" ? (
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : "#14b8a6"}
                  onChange={(e) => mudar(k, e.target.value)}
                  className="h-7 w-10 rounded bg-transparent"
                />
                <span className="font-mono text-[11.5px] text-fog">
                  {valor}
                </span>
              </span>
            ) : (
              <textarea
                value={valor}
                rows={valor.length > 40 ? 3 : 1}
                onChange={(e) => mudar(k, e.target.value)}
                className="w-full resize-y rounded-[4px] border border-line-dark bg-deeper px-2.5 py-1.5 text-[12.5px] text-cream outline-none focus:border-cream/50"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Um motion da biblioteca: nome, favorito, versões, campos, o comentário para a próxima versão e "usar neste plano". */
function DetalheMotion(p: {
  m: Motion;
  mudou: (m: Motion) => void;
  apagou: () => void;
  usar: (n: number) => void;
  falhar: (e: unknown) => void;
}) {
  const { m } = p;
  const [comentario, setComentario] = useState("");
  const versao = m.versoes.find((v) => v.n === m.ativa);
  const gerando = m.status.estado === "fila" || m.status.estado === "gerando";
  const editar = (c: Parameters<typeof editarMotion>[1]) =>
    editarMotion(m.id, c).then(p.mudou).catch(p.falhar);
  const filhos = useMemo(
    () => new Map(m.versoes.map((v) => [v.n, v])),
    [m.versoes],
  );
  return (
    <div className="grid gap-4 text-[12px]">
      <div className="flex items-center gap-2">
        <input
          key={m.nome}
          defaultValue={m.nome}
          onBlur={(e) =>
            e.target.value.trim() &&
            e.target.value !== m.nome &&
            void editar({ nome: e.target.value })
          }
          className="min-w-0 flex-1 rounded-[4px] border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-semibold text-cream outline-none hover:border-line-dark focus:border-cream/50"
        />
        <button
          onClick={() => void editar({ favorito: !m.favorito })}
          title={
            m.favorito
              ? "Tirar dos favoritos"
              : "Favoritar (vira exemplo de estilo para os próximos)"
          }
          className="text-fog hover:text-yellow"
        >
          <Star
            className={cn("size-4", m.favorito && "fill-yellow text-yellow")}
          />
        </button>
      </div>
      {m.status.estado === "erro" && (
        <p className="rounded-[6px] border border-coral/40 px-3 py-2 text-[11.5px] text-coral">
          {m.status.erro}
        </p>
      )}
      {m.versoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.versoes.map((v) => (
            <button
              key={v.n}
              onClick={() => void editar({ ativa: v.n })}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                m.ativa === v.n
                  ? "bg-cream text-ink ring-cream"
                  : "text-fog ring-line-dark hover:text-cream",
              )}
              title={v.comentario ?? "A primeira versão"}
            >
              v{v.n}
              {v.de && filhos.has(v.de) ? ` ← v${v.de}` : ""}
            </button>
          ))}
          {gerando && (
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-fog ring-1 ring-line-dark">
              <Loader2 className="size-3 animate-spin" />{" "}
              {ETAPA[m.status.etapa ?? ""] ?? "na fila"}
            </span>
          )}
        </div>
      )}
      {versao && (
        <div className="grid gap-1.5">
          <span className="eyebrow text-sage">Campos</span>
          <Campos
            campos={versao.campos}
            valores={m.valores}
            mudar={(valores) => void editar({ valores })}
          />
        </div>
      )}
      {m.ativa && (
        <div className="grid gap-1.5">
          <span className="eyebrow text-sage">
            Pedir a v{Math.max(...m.versoes.map((v) => v.n)) + 1} (a partir da v
            {m.ativa})
          </span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            placeholder="Ex.: deixe o título maior e a caixa entrando mais cedo"
            className="w-full resize-y rounded-[4px] border border-line-dark bg-deeper px-2.5 py-1.5 text-[12.5px] text-cream outline-none focus:border-cream/50"
          />
          <button
            disabled={gerando || !comentario.trim()}
            onClick={() =>
              novaVersaoMotion(m.id, m.ativa!, comentario)
                .then((x) => {
                  setComentario("");
                  p.mudou(x);
                })
                .catch(p.falhar)
            }
            className="w-fit rounded-full border border-line-dark px-3 py-1.5 text-[12px] font-semibold text-cream hover:border-cream/50 disabled:opacity-40"
          >
            Gerar a próxima versão
          </button>
        </div>
      )}
      <details className="text-[11.5px] text-fog">
        <summary className="cursor-pointer">O pedido</summary>
        <p className="mt-1.5 whitespace-pre-wrap leading-[1.6]">
          {m.pedido.prompt}
        </p>
      </details>
      <div className="mt-auto flex items-center gap-2 border-t border-line-dark pt-3">
        <button
          onClick={() =>
            window.confirm(
              `Apagar o motion “${m.nome}” da biblioteca? (os planos que já o usam continuam com a cópia deles)`,
            ) && void apagarMotion(m.id).then(p.apagou).catch(p.falhar)
          }
          className="flex items-center gap-1 text-[11.5px] text-fog hover:text-coral"
        >
          <Trash2 className="size-3.5" /> Apagar
        </button>
        <button
          disabled={!m.ativa}
          onClick={() => m.ativa && p.usar(m.ativa)}
          className="ml-auto rounded-full bg-coral px-4 py-2 text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-40"
        >
          Usar neste plano
        </button>
      </div>
    </div>
  );
}

/** O motion que está no plano (a cópia): os campos valem só aqui. */
function NoPlano(p: {
  projetoId: string;
  plano: string;
  atual: MotionPlano;
  abrirOriginal: () => void;
  mudou: () => void;
  falhar: (e: unknown) => void;
}) {
  return (
    <div className="grid gap-4 text-[12px]">
      <div>
        <p className="text-[14px] font-semibold">{p.atual.nome}</p>
        <p className="text-[11.5px] text-fog">
          Cópia da v{p.atual.versao}. Mudar aqui não muda o original.{" "}
          <button
            onClick={p.abrirOriginal}
            className="text-yellow hover:underline"
          >
            Abrir o original
          </button>
        </p>
      </div>
      <div className="grid gap-1.5">
        <span className="eyebrow text-sage">Campos</span>
        <Campos
          campos={p.atual.campos}
          valores={p.atual.valores}
          mudar={(v) =>
            void valoresMotionPlano(p.projetoId, p.plano, v)
              .then(p.mudou)
              .catch(p.falhar)
          }
        />
      </div>
    </div>
  );
}
