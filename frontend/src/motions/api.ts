/** A API dos motions (SPEC §8.5; docs/motions.md): os presets e o motion de cada plano de um projeto. */
import { enviar, json } from "@/api";

export type Formato = "vertical" | "dividida";
export type CampoMotion = {
  tipo: "texto" | "cor" | "imagem";
  rotulo: string;
  padrao: string;
};
export type Preset = {
  id: string;
  nome: string;
  descricao: string;
  fundo: string;
  duracao: number;
  /** o instante da miniatura parada, em fração da duração */
  miniatura: number;
  campos: Record<string, CampoMotion>;
};
/** O motion de um plano: um preset (com os valores e o fundo) ou um vídeo do banco. */
export type MotionPlano = { nome: string; formato: Formato; usado_em: string } & (
  | { tipo: "preset"; preset: string; valores: Record<string, string>; fundo: string }
  | { tipo: "video"; banco: string }
);
/** As palavras ditas no plano, em segundos desde o começo dele (a digitação dos presets acompanha a fala). */
export type Fala = { texto: string; ini: number; fim: number }[];

export const listarPresets = () =>
  fetch("/api/motions/presets").then(json<Preset[]>);
export const motionsDoProjeto = (id: string) =>
  fetch(`/api/projetos/${id}/motions`).then(json<Record<string, MotionPlano>>);
export const usarPreset = (
  id: string,
  plano: string,
  formato: Formato,
  preset: string,
  valores: Record<string, string> = {},
  fundo?: string,
) =>
  enviar<MotionPlano>("PUT", `/api/projetos/${id}/motions/${plano}`, {
    tipo: "preset",
    formato,
    preset,
    valores,
    fundo,
  });
export const usarVideo = (id: string, plano: string, formato: Formato, banco: string) =>
  enviar<MotionPlano>("PUT", `/api/projetos/${id}/motions/${plano}`, {
    tipo: "video",
    formato,
    banco,
  });
export const ajustarMotion = (
  id: string,
  plano: string,
  a: { valores?: Record<string, string>; fundo?: string },
) => enviar<MotionPlano>("PATCH", `/api/projetos/${id}/motions/${plano}`, a);
export const tirarMotionDoPlano = (id: string, plano: string) =>
  enviar<{ ok: boolean }>("DELETE", `/api/projetos/${id}/motions/${plano}`);

/** O fundo atrás do motion: o do preset; um vídeo cobre o palco todo, sem fundo. */
export const fundoDoMotion = (m: MotionPlano) => (m.tipo === "preset" ? m.fundo : undefined);

/** As palavras de saída que caem no plano, com o tempo relativo ao começo dele. */
export const falaDoPlano = (
  palavras: { texto: string; saida_ini: number; saida_fim: number }[],
  ini: number,
  fim: number,
): Fala =>
  palavras
    .filter((w) => w.saida_ini >= ini - 0.01 && w.saida_ini < fim)
    .map((w) => ({ texto: w.texto, ini: +(w.saida_ini - ini).toFixed(3), fim: +(w.saida_fim - ini).toFixed(3) }));

/** A página do motion de um plano: `duracao` = a do plano agora; `fala` = as palavras dele. */
export const urlPaginaMotionPlano = (
  id: string,
  plano: string,
  m: MotionPlano,
  duracao: number,
  fala: Fala,
  exportacao = false,
) =>
  `/api/projetos/${id}/motions/${plano}/pagina?duracao=${duracao.toFixed(3)}&fala=${encodeURIComponent(JSON.stringify(fala))}${exportacao ? "&exportacao=true" : ""}&v=${encodeURIComponent(m.usado_em + JSON.stringify(m.tipo === "preset" ? m.valores : m.banco))}`;
/** Um preset com estes valores, fora de um plano (as miniaturas da grade). */
export const urlPaginaPreset = (p: Preset, formato: Formato, valores: Record<string, string> = {}) =>
  `/api/motions/presets/${p.id}/pagina?formato=${formato}&valores=${encodeURIComponent(JSON.stringify(valores))}`;
