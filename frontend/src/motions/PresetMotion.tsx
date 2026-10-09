import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { urlBancoMiniatura } from "@/api";
import SeletorBanco from "@/inserts/SeletorBanco";
import { FUNDOS } from "@/inserts/Fundo";
import { cn } from "@/lib/utils";
import MotionNoLugar from "./MotionNoLugar";
import EscolhaSons from "@/editor/EscolhaSons";
import { escolhasDeSom } from "./sons";
import { ajustarMotion, listarPresets, urlPaginaPreset, type Formato, type MotionPlano, type Preset } from "./api";

let cache: Promise<Preset[]> | null = null;
/** Os presets (escritos à mão, no código): carregados uma vez por página. */
export function usePresets() {
  const [lista, setLista] = useState<Preset[] | null>(null);
  useEffect(() => {
    void (cache ??= listarPresets()).then(setLista).catch(() => (cache = null));
  }, []);
  return lista;
}

/** A miniatura de um preset: parada perto do fim; com o mouse em cima, toca em loop. */
export function MiniaturaPreset(p: { preset: Preset; formato: Formato; valores?: Record<string, string>; fundo?: string }) {
  const [t, setT] = useState(p.preset.duracao * p.preset.miniatura);
  const quadro = useRef(0);
  const tocar = () => {
    const ini = performance.now();
    const passo = (agora: number) => {
      setT((((agora - ini) / 1000) % (p.preset.duracao + 0.6)));
      quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
  };
  const parar = () => {
    cancelAnimationFrame(quadro.current);
    setT(p.preset.duracao * p.preset.miniatura);
  };
  useEffect(() => () => cancelAnimationFrame(quadro.current), []);
  return (
    <div onMouseEnter={tocar} onMouseLeave={parar} className={cn("relative overflow-hidden rounded-[6px] bg-black", p.formato === "vertical" ? "aspect-[9/16]" : "aspect-[9/8]")}>
      <MotionNoLugar src={urlPaginaPreset(p.preset, p.formato, p.valores)} formato={p.formato} rel={t} fundo={p.fundo ?? p.preset.fundo} noLugar={false} className="absolute inset-0" />
    </div>
  );
}

/** A grade dos presets: clicar põe o preset no plano (o que está em uso fica marcado). */
export function GradePresets(p: { formato: Formato; atual?: string; escolher: (pr: Preset) => void }) {
  const presets = usePresets();
  if (!presets) return <p className="text-[12px] text-fog">Carregando os presets…</p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {presets.map((pr) => (
        <button
          key={pr.id}
          onClick={() => p.atual !== pr.id && p.escolher(pr)}
          title={pr.descricao}
          className="group/m grid gap-1.5 text-left"
        >
          <div className={cn("rounded-[6px] ring-1 transition-shadow", p.atual === pr.id ? "ring-2 ring-coral" : "ring-line-dark group-hover/m:ring-cream/40")}>
            <MiniaturaPreset preset={pr} formato={p.formato} />
          </div>
          <span className={cn("text-[11.5px] font-semibold leading-tight", p.atual === pr.id ? "text-cream" : "text-fog group-hover/m:text-cream")}>{pr.nome}</span>
        </button>
      ))}
    </div>
  );
}

/** O card de edição do preset de um plano (na coluna ao lado do vídeo, como o do comentário). */
export function EdicaoPreset(p: { projetoId: string; plano: string; motion: MotionPlano; mudou: () => void; bancoMudou: () => void }) {
  const presets = usePresets();
  const m = p.motion;
  if (m.tipo !== "preset") return null;
  const preset = presets?.find((x) => x.id === m.preset);
  if (!preset) return <p className="text-[12px] text-fog">{presets ? "Este preset não existe mais: escolha outro." : "Carregando…"}</p>;
  return <AjustesPreset key={p.plano} {...p} motion={m} preset={preset} />;
}

const CAMPO = "w-full rounded-[4px] border border-line-dark bg-deeper px-2.5 py-1.5 text-[12.5px] text-cream outline-none focus:border-cream/50";

/** O preset de um plano: os campos (a prévia muda na hora; grava 0,35 s depois) e o fundo. */
function AjustesPreset(p: {
  projetoId: string;
  plano: string;
  motion: Extract<MotionPlano, { tipo: "preset" }>;
  preset: Preset;
  mudou: () => void;
  bancoMudou: () => void;
}) {
  const [valores, setValores] = useState(p.motion.valores);
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  const espera = useRef(0);
  useEffect(() => setValores(p.motion.valores), [p.plano]); // eslint-disable-line react-hooks/exhaustive-deps
  const falhar = (e: unknown) => window.alert((e as Error).message);
  const mudar = (k: string, v: string) => {
    const novo = { ...valores, [k]: v };
    setValores(novo);
    clearTimeout(espera.current);
    espera.current = window.setTimeout(() => void ajustarMotion(p.projetoId, p.plano, { valores: novo }).then(p.mudou).catch(falhar), 350);
  };
  const valor = (k: string) => valores[k] ?? p.preset.campos[k].padrao;
  return (
    <div className="grid gap-4 text-[12px]">
      {Object.entries(p.preset.campos).map(([k, c]) => (
        <label key={k} className="grid gap-1.5">
          <span className="eyebrow text-sage">{c.rotulo}</span>
          {c.tipo === "texto" && <input value={valor(k)} onChange={(e) => mudar(k, e.target.value)} className={CAMPO} />}
          {c.tipo === "cor" && <input type="color" value={valor(k)} onChange={(e) => mudar(k, e.target.value)} className="h-8 w-16 rounded-[4px] bg-transparent" />}
          {c.tipo === "imagem" && (
            <button onClick={() => setEscolhendo(k)} className="flex items-center gap-3 rounded-[6px] p-1.5 text-left text-fog ring-1 ring-line-dark hover:text-cream">
              {valor(k) ? <img src={urlBancoMiniatura(valor(k))} alt="" className="h-14 w-10 rounded-[3px] object-cover object-top" /> : <ImagePlus className="m-2 size-5" />}
              {valor(k) ? "Trocar a imagem" : "Escolher do banco"}
            </button>
          )}
        </label>
      ))}
      {Object.keys(p.preset.sons ?? {}).length > 0 && (
        <div className="grid gap-1.5">
          <span className="eyebrow text-sage">Sons</span>
          <EscolhaSons
            linhas={Object.entries(escolhasDeSom([p.preset], p.motion)).map(([k, e]) => ({ chave: k, nome: p.preset.sons![k].rotulo, ...e }))}
            mudar={(k, m) => {
              const atual = escolhasDeSom([p.preset], p.motion);
              const sons = { ...(p.motion.sons ?? {}), [k]: { som: m.som !== undefined ? m.som : atual[k].som, intensidade: m.intensidade ?? atual[k].intensidade } };
              void ajustarMotion(p.projetoId, p.plano, { sons }).then(p.mudou).catch(falhar);
            }}
          />
        </div>
      )}
      <div className="grid gap-1.5">
        <span className="eyebrow text-sage">Fundo</span>
        <div className="grid grid-cols-5 gap-1.5">
          {FUNDOS.map((f) => (
            <button
              key={f.id}
              title={f.nome}
              onClick={() => void ajustarMotion(p.projetoId, p.plano, { fundo: f.id }).then(p.mudou).catch(falhar)}
              className={cn("h-10 rounded-[5px] ring-1", p.motion.fundo === f.id ? "ring-2 ring-coral" : "ring-white/10 hover:ring-cream/50")}
              style={{ background: f.amostra }}
            />
          ))}
        </div>
      </div>
      {escolhendo && (
        <SeletorBanco
          tipo="imagem"
          fechar={() => setEscolhendo(null)}
          escolher={(i) => {
            mudar(escolhendo, i.id);
            setEscolhendo(null);
          }}
          mudou={p.bancoMudou}
        />
      )}
    </div>
  );
}
