/** Os sons dos motions (SPEC §8.6): o preset declara os momentos (rótulo e som padrão) e a página marca quando cada um
 *  acontece (`motion.som(momento, t, dur)`); o plano pode trocar o som e a intensidade de cada momento. */
import { useEffect } from "react";
import { eventoNoTempo, type Catalogo, type EventoSom, type Intensidade } from "@/editor/sons";
import { falaDoPlano, urlPaginaMotionPlano, type Formato, type MotionPlano, type Preset } from "./api";

export type EscolhaSom = { som: string | null; intensidade: Intensidade };
/** Uma marca da página: o momento, quando (s desde o começo do plano) e, opcional, por quanto tempo. */
export type Marca = { momento: string; t: number; dur?: number };
type ComSons = Window & { __sons?: () => Promise<Marca[]> };

/** O som de cada momento do motion de um plano: o do plano, ou o padrão do preset (`presets`: a lista dos presets). */
export function escolhasDeSom(presets: Preset[] | null, m: MotionPlano | undefined): Record<string, EscolhaSom> {
  const preset = m?.tipo === "preset" ? presets?.find((x) => x.id === m.preset) : undefined;
  if (!preset || m?.tipo !== "preset") return {};
  return Object.fromEntries(
    Object.entries(preset.sons ?? {}).map(([k, v]) => {
      const x = m.sons?.[k];
      return [k, { som: x ? x.som : v.som, intensidade: x?.intensidade ?? v.intensidade }];
    }),
  );
}

export const eventosDoMotion = (marcas: Marca[], escolhas: Record<string, EscolhaSom>, cat: Catalogo | null): EventoSom[] =>
  !cat
    ? []
    : marcas.flatMap((mk) => {
        const e = escolhas[mk.momento];
        const ev = e ? eventoNoTempo({ ...e, atraso: 0 }, mk.t, cat, mk.dur) : null;
        return ev ? [ev] : [];
      });

/** As marcas de som de uma página de motion já aberta (espera a cena estar montada). */
export const marcasDe = (w: Window | null | undefined): Promise<Marca[]> =>
  (w as ComSons | null)?.__sons?.().catch(() => []) ?? Promise.resolve([]);

/** As marcas de som de uma página de motion, abrindo-a num iframe escondido (a exportação lê de todos os planos). */
export function marcasDaPagina(src: string, formato: Formato): Promise<Marca[]> {
  return new Promise((ok) => {
    const f = document.createElement("iframe");
    f.style.cssText = `position:fixed;left:-99999px;top:0;width:1080px;height:${formato === "vertical" ? 1920 : 960}px;visibility:hidden`;
    const fim = (m: Marca[]) => {
      clearTimeout(limite);
      f.remove();
      ok(m);
    };
    const limite = window.setTimeout(() => fim([]), 15_000);
    f.onload = () => void marcasDe(f.contentWindow).then(fim);
    f.src = src;
    document.body.appendChild(f);
  });
}

// as marcas já lidas de cada página (pela URL): o motion entra tocando com elas, sem esperar a página carregar
const lidas = new Map<string, Marca[]>();
const pedidas = new Map<string, Promise<Marca[]>>();
export const marcasGuardadas = (src: string) => lidas.get(src);
export const guardarMarcas = (src: string, m: Marca[]) => void lidas.set(src, m);
/** Lê de antemão as marcas de uma página (uma vez por URL). */
export function preCarregarMarcas(src: string, formato: Formato): Promise<Marca[]> {
  if (!pedidas.has(src)) pedidas.set(src, marcasDaPagina(src, formato).then((m) => (lidas.set(src, m), m)));
  return pedidas.get(src)!;
}

/** Lê de antemão as marcas de som dos motions do projeto (uma página por vez), ao abrir uma etapa que mostra o quadro
 *  montado: o som de um motion (a entrada, a digitação) começa junto com ele já na primeira passagem, sem esperar a
 *  página dele carregar. */
export function usePreCarregarMarcas(
  projeto: string,
  planos: { id: string; inicio: number; fim: number }[],
  motions: Record<string, MotionPlano>,
  saida: { texto: string; saida_ini: number; saida_fim: number }[],
) {
  useEffect(() => {
    let fila = Promise.resolve();
    for (const pl of planos) {
      const m = motions[pl.id];
      if (m?.tipo !== "preset") continue;
      const src = urlPaginaMotionPlano(projeto, pl.id, m, pl.fim - pl.inicio, falaDoPlano(saida, pl.inicio, pl.fim));
      fila = fila.then(() => preCarregarMarcas(src, m.formato).then(() => {}));
    }
  }, [planos, motions, saida, projeto]);
}
