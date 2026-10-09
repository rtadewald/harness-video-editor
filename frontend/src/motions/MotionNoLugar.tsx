import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCatalogoSons, useSonsNoTempo } from "@/editor/sons";
import { eventosDoMotion, guardarMarcas, marcasDe, marcasGuardadas, type EscolhaSom, type Marca } from "./sons";
import Fundo from "@/inserts/Fundo";
import { cn } from "@/lib/utils";

type Janela = Window & { __ir?: (t: number) => Promise<void> };

const NENHUMA: Marca[] = [];
const PALCO = { vertical: { w: 1080, h: 1920 }, dividida: { w: 1080, h: 960 } };

/** Um motion tocando (SPEC §8.5): a página dele num iframe do tamanho do palco, escalada para caber na área do plano (a
 *  tela toda ou a metade de cima), com o fundo escolhido atrás (os presets; o vídeo cobre tudo). Quem manda no tempo é
 *  quem usa: a cada instante, `__ir(rel)` leva a cena até lá. */
export default function MotionNoLugar(p: {
  src: string;
  formato: "vertical" | "dividida";
  rel: number;
  fundo?: string;
  className?: string;
  noLugar?: boolean;
  /** Os sons (SPEC §8.6): o som de cada momento e se a prévia está tocando de verdade. */
  sons?: { ativo: boolean; escolhas: Record<string, EscolhaSom> };
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const quadro = useRef<HTMLIFrameElement>(null);
  const [escala, setEscala] = useState(0);
  const [pronto, setPronto] = useState(false);
  const palco = PALCO[p.formato];

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / palco.w);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [palco.w]);
  useEffect(() => setPronto(false), [p.src]);
  // as marcas de som da página (lidas quando ela carrega) e os eventos com o som escolhido de cada momento
  // (guardadas com a página de onde vieram: trocar de motion não toca as marcas do anterior)
  const [lidas, setLidas] = useState<{ src: string; marcas: Marca[] } | null>(null);
  const comSons = !!p.sons;
  useEffect(() => {
    if (!pronto || !comSons) return;
    let vivo = true;
    const src = p.src;
    void marcasDe(quadro.current?.contentWindow).then((marcas) => {
      guardarMarcas(src, marcas);
      if (vivo) setLidas({ src, marcas });
    });
    return () => void (vivo = false);
  }, [pronto, comSons, p.src]);
  // (as já lidas antes, pré-carregadas pela etapa, valem desde o primeiro quadro)
  const marcas = !comSons ? NENHUMA : lidas?.src === p.src ? lidas.marcas : (marcasGuardadas(p.src) ?? NENHUMA);
  const catalogo = useCatalogoSons();
  const escolhas = JSON.stringify(p.sons?.escolhas ?? {});
  const eventos = useMemo(() => eventosDoMotion(marcas, JSON.parse(escolhas), catalogo), [marcas, escolhas, catalogo]);
  useSonsNoTempo(eventos, p.rel, !!p.sons?.ativo, true);

  useEffect(() => {
    if (!pronto) return;
    const ir = (quadro.current?.contentWindow as Janela | null)?.__ir;
    if (!ir) return;
    // enquanto a cena pinta o instante, o iframe fica marcado (a página de render espera antes da foto)
    const f = quadro.current!;
    f.dataset.pintando = "1";
    void ir(p.rel).finally(() => delete f.dataset.pintando);
  }, [p.rel, pronto]);

  return (
    <div
      ref={caixa}
      className={cn(
        "pointer-events-none overflow-hidden",
        p.noLugar !== false && "absolute",
        p.noLugar !== false &&
          (p.formato === "vertical" ? "inset-0" : "inset-x-0 top-0 h-1/2"),
        p.className,
      )}
    >
      {p.fundo && <Fundo id={p.fundo} />}
      {escala > 0 && (
        <iframe
          ref={quadro}
          src={p.src}
          title="motion"
          onLoad={() => setPronto(true)}
          data-pronto={pronto ? "1" : "0"}
          className="absolute top-0 left-0 origin-top-left border-0"
          style={{
            width: palco.w,
            height: palco.h,
            transform: `scale(${escala})`,
          }}
        />
      )}
    </div>
  );
}
