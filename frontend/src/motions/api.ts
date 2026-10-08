/** A API dos motions (SPEC §8.5; docs/motions.md): a biblioteca e o motion de cada plano de um projeto. */
import { enviar, json } from "@/api";

export type CampoMotion = {
  tipo: "texto" | "cor";
  rotulo: string;
  padrao: string;
};
export type ReferenciaMotion = {
  ref: string;
  inicio: number;
  fim: number;
  tipo: string;
  descricao: string;
  texto?: string | null;
};
export type VersaoMotion = {
  n: number;
  de: number | null;
  comentario: string | null;
  campos: Record<string, CampoMotion>;
  criado_em: string;
  modelo: string;
  segundos: number;
};
export type Motion = {
  id: string;
  nome: string;
  formato: "vertical" | "dividida";
  duracao: number;
  criado_em: string;
  favorito: boolean;
  pedido: {
    nome: string;
    formato: string;
    duracao: number;
    prompt: string;
    referencias: ReferenciaMotion[];
    midias: string[];
  };
  versoes: VersaoMotion[];
  ativa: number | null;
  valores: Record<string, string>;
  status: {
    estado: "fila" | "gerando" | "pronto" | "erro";
    erro: string | null;
    etapa: "escrevendo" | "conferindo" | "finalizando" | null;
  };
};
/** O motion de um plano: a cópia guardada no projeto. */
export type MotionPlano = {
  origem: string;
  versao: number;
  nome: string;
  formato: "vertical" | "dividida";
  duracao: number;
  campos: Record<string, CampoMotion>;
  valores: Record<string, string>;
  midias: string[];
  usado_em: string;
};
export const listarMotions = () => fetch("/api/motions").then(json<Motion[]>);
export const criarMotion = (p: {
  nome: string;
  formato: string;
  duracao: number;
  prompt: string;
  referencias: ReferenciaMotion[];
  midias: string[];
}) => enviar<Motion>("POST", "/api/motions", p);
export const editarMotion = (
  mid: string,
  campos: Partial<{
    nome: string;
    favorito: boolean;
    ativa: number;
    valores: Record<string, string>;
  }>,
) => enviar<Motion>("PATCH", `/api/motions/${mid}`, { campos });
export const novaVersaoMotion = (mid: string, de: number, comentario: string) =>
  enviar<Motion>("POST", `/api/motions/${mid}/versoes`, { de, comentario });
export const apagarMotion = (mid: string) =>
  enviar<{ ok: boolean }>("DELETE", `/api/motions/${mid}`);
export const urlPaginaMotion = (m: Motion, n?: number | null) =>
  `/api/motions/${m.id}/pagina?n=${n ?? m.ativa ?? ""}&v=${encodeURIComponent(JSON.stringify(m.valores))}`;
export const urlMiniaturaMotion = (m: Motion, n?: number | null) =>
  `/api/motions/${m.id}/miniatura?n=${n ?? m.ativa ?? ""}`;
export const motionsDoProjeto = (id: string) =>
  fetch(`/api/projetos/${id}/motions`).then(json<Record<string, MotionPlano>>);
export const usarMotion = (
  id: string,
  plano: string,
  motion: string,
  versao?: number | null,
  valores?: Record<string, string>,
) =>
  enviar<MotionPlano>("PUT", `/api/projetos/${id}/motions/${plano}`, {
    motion,
    versao,
    valores,
  });
export const valoresMotionPlano = (
  id: string,
  plano: string,
  valores: Record<string, string>,
) =>
  enviar<MotionPlano>("PATCH", `/api/projetos/${id}/motions/${plano}`, {
    valores,
  });
export const tirarMotionDoPlano = (id: string, plano: string) =>
  enviar<{ ok: boolean }>("DELETE", `/api/projetos/${id}/motions/${plano}`);
/** A página do motion de um plano: `duracao` = a do plano agora (a animação estica ou encolhe se mudou). */
export const urlPaginaMotionPlano = (
  id: string,
  plano: string,
  m: MotionPlano,
  duracao: number,
  exportacao = false,
) =>
  `/api/projetos/${id}/motions/${plano}/pagina?duracao=${duracao.toFixed(3)}${exportacao ? "&exportacao=true" : ""}&v=${encodeURIComponent(m.usado_em + JSON.stringify(m.valores))}`;
export const urlMiniaturaMotionPlano = (
  id: string,
  plano: string,
  m: MotionPlano,
) =>
  `/api/projetos/${id}/motions/${plano}/miniatura?v=${encodeURIComponent(m.usado_em)}`;
