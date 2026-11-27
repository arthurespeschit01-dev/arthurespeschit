// Regras de notificação (puras, testadas no Vitest). A função verificar-notificacoes só busca os dados e chama estas regras.

export type Cliente = { id: string; name: string; status?: string | null };
export type Mensalidade = { id: string; cliente_id: string; valor: number | string; vencimento: string; status: string | null; data_pagamento?: string | null };
export type Contrato = { id: string; client_name: string; expiry_date: string | null; status: string | null };
export type Tarefa = { id: string; title: string; status: string | null; end_date: string | null; client_id: string | null; priority?: string | null };
export type Campanha = { id: string; name: string; client_id: string | null; status: string | null; spend: number | string | null; budget: number | string | null; last_synced_at: string | null; meta_ad_account_id: string | null };
export type Conta = { account_id?: string; id?: string; account_name?: string; name?: string; is_prepaid?: boolean; available_balance?: number | string; error?: unknown };

export type Alerta = {
  tipo: string;        // categoria (vai para notificacoes_enviadas.tipo)
  ref: string;         // identifica o item + estado (muda quando o estado muda)
  repetirDias: number; // 0 = só uma vez; N = no máximo a cada N dias enquanto continuar valendo
  grupo: string;       // seção no e-mail
  texto: string;
};

export const ativo = (c?: Cliente | null) => !c?.status || c.status === "Ativo";
const pago = (m: Mensalidade) => m.status === "pago" || !!m.data_pagamento;
const fechada = (m: Mensalidade) => pago(m) || m.status === "cancelado" || m.status === "estornado";
const encerrada = (s?: string | null) => /^(conclu|cancel)/i.test(s || "");
const contratoEncerrado = (s?: string | null) => /^(cancel|encerr)/i.test(s || "");
const campanhaAtiva = (c: Campanha, hoje: Date) =>
  /^ativ/i.test(c.status || "") && !!c.last_synced_at && hoje.getTime() - new Date(c.last_synced_at).getTime() <= 7 * 86400000;
const normConta = (id?: string | null) => String(id || "").replace(/^act_/, "");
const dia = (d: Date, n = 0) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diasEntre = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const br = (d: string) => d.split("-").reverse().join("/");

export type Config = {
  contrato_vencimento?: boolean; pagamento_vencimento?: boolean; inadimplencia?: boolean; inadimplencia_dias?: number | string;
  task_vencendo?: boolean; meta_verba?: boolean; meta_alerta_pct?: number | string; saldo_baixo?: boolean; saldo_baixo_limite?: number | string;
};

export function montarAlertas(
  cfg: Config,
  hoje: Date,
  d: { clientes: Cliente[]; mensalidades: Mensalidade[]; contratos: Contrato[]; tarefas: Tarefa[]; campanhas: Campanha[]; contas: Conta[] },
): Alerta[] {
  const hojeStr = dia(hoje);
  const cli = new Map(d.clientes.map((c) => [c.id, c]));
  const nome = (id?: string | null) => (id && cli.get(id)?.name) || "Cliente";
  const out: Alerta[] = [];

  // Contratos: só ativos, avisa 7 dias antes e 1 dia antes (uma vez cada)
  if (cfg.contrato_vencimento) {
    for (const c of d.contratos) {
      if (!c.expiry_date || contratoEncerrado(c.status)) continue;
      const falta = diasEntre(hojeStr, c.expiry_date);
      if (falta !== 7 && falta !== 1) continue;
      out.push({ tipo: "contrato", ref: `${c.id}:${c.expiry_date}:${falta}`, repetirDias: 0, grupo: "Contratos",
        texto: `${c.client_name}: contrato vence ${falta === 1 ? "amanhã" : "em 7 dias"} (${br(c.expiry_date)}).` });
    }
  }

  // Mensalidades: só de clientes ativos e ainda não pagas
  const abertas = d.mensalidades.filter((m) => !fechada(m) && ativo(cli.get(m.cliente_id)));
  // Se o cliente já tem uma mensalidade POSTERIOR paga, a antiga ficou esquecida no sistema: não alerta
  const pagaDepois = (m: Mensalidade) => d.mensalidades.some((o) => o.cliente_id === m.cliente_id && pago(o) && o.vencimento > m.vencimento);

  if (cfg.pagamento_vencimento) {
    for (const m of abertas) {
      const falta = diasEntre(hojeStr, m.vencimento);
      if (falta !== 3 && falta !== 0) continue;
      out.push({ tipo: "pagamento", ref: `${m.id}:${m.vencimento}:${falta}`, repetirDias: 0, grupo: "Recebimentos",
        texto: `${nome(m.cliente_id)}: ${brl(Number(m.valor))} vence ${falta === 0 ? "hoje" : "em 3 dias"} (${br(m.vencimento)}).` });
    }
  }

  if (cfg.inadimplencia) {
    const limite = Math.max(1, parseInt(String(cfg.inadimplencia_dias ?? 3)) || 3);
    for (const m of abertas) {
      const atraso = diasEntre(m.vencimento, hojeStr);
      if (atraso < limite || pagaDepois(m)) continue;
      out.push({ tipo: "inadimplente", ref: `${m.id}:${m.vencimento}`, repetirDias: 7, grupo: "Recebimentos",
        texto: `${nome(m.cliente_id)}: ${brl(Number(m.valor))} em aberto há ${atraso} dias (venceu em ${br(m.vencimento)}).` });
    }
  }

  // Tarefas: só as não concluídas/canceladas. Avisa na véspera e uma vez quando atrasa.
  if (cfg.task_vencendo) {
    for (const t of d.tarefas) {
      if (!t.end_date || encerrada(t.status)) continue;
      const falta = diasEntre(hojeStr, t.end_date);
      const quem = t.client_id ? ` (${nome(t.client_id)})` : "";
      if (falta === 1) out.push({ tipo: "tarefa", ref: `${t.id}:${t.end_date}:vespera`, repetirDias: 0, grupo: "Tarefas", texto: `"${t.title}"${quem} vence amanhã.` });
      else if (falta < 0 && falta >= -30) out.push({ tipo: "tarefa", ref: `${t.id}:${t.end_date}:atrasada`, repetirDias: 0, grupo: "Tarefas", texto: `"${t.title}"${quem} está atrasada desde ${br(t.end_date)}.` });
    }
  }

  // Campanhas ativas de verdade: status Ativa, sincronizada nos últimos 7 dias, de cliente ativo
  const vivas = d.campanhas.filter((c) => campanhaAtiva(c, hoje) && ativo(c.client_id ? cli.get(c.client_id) : null));

  if (cfg.meta_verba) {
    // meta_alerta_pct = quanto do orçamento ainda resta quando o alerta dispara (padrão 20%)
    const resta = Math.min(100, Math.max(0, parseFloat(String(cfg.meta_alerta_pct ?? 20)) || 20)) / 100;
    for (const c of vivas) {
      const total = Number(c.budget || 0), gasto = Number(c.spend || 0);
      if (total <= 0 || 1 - gasto / total > resta) continue;
      out.push({ tipo: "meta_verba", ref: c.id, repetirDias: 7, grupo: "Anúncios",
        texto: `${nome(c.client_id)} — ${c.name}: ${Math.round((gasto / total) * 100)}% do orçamento usado (${brl(gasto)} de ${brl(total)}).` });
    }
  }

  // Saldo: só contas pré-pagas que têm campanha rodando agora
  if (cfg.saldo_baixo) {
    const limite = Number(cfg.saldo_baixo_limite);
    const contasRodando = new Set(vivas.map((c) => normConta(c.meta_ad_account_id)).filter(Boolean));
    if (Number.isFinite(limite) && limite > 0) {
      for (const a of d.contas) {
        if (a?.error || a?.is_prepaid !== true) continue;
        const id = normConta(a.account_id || a.id);
        if (!id || !contasRodando.has(id)) continue;
        const saldo = Number(a.available_balance);
        if (!Number.isFinite(saldo) || saldo >= limite) continue;
        out.push({ tipo: "saldo_baixo", ref: id, repetirDias: 2, grupo: "Anúncios",
          texto: `${a.account_name || a.name || "Conta"}: saldo ${saldo <= 0 ? "esgotado" : `de ${brl(saldo)}`} com campanha ativa (limite ${brl(limite)}).` });
      }
    }
  }

  return out;
}

// Filtra o que já foi avisado: "enviados" traz a última data de envio por tipo|ref
export function novosAlertas(alertas: Alerta[], enviados: Map<string, string>, hoje: Date): Alerta[] {
  const hojeStr = dia(hoje);
  return alertas.filter((a) => {
    const ultimo = enviados.get(`${a.tipo}|${a.ref}`);
    if (!ultimo) return true;
    if (a.repetirDias <= 0) return false;
    return diasEntre(ultimo, hojeStr) >= a.repetirDias;
  });
}

// Um único e-mail por dia, agrupado por assunto
export function montarResumo(alertas: Alerta[]): { assunto: string; titulo: string; mensagem: string } {
  const grupos = new Map<string, string[]>();
  for (const a of alertas) grupos.set(a.grupo, [...(grupos.get(a.grupo) || []), a.texto]);
  const mensagem = [...grupos.entries()].map(([g, itens]) => `${g}\n${itens.map((i) => `• ${i}`).join("\n")}`).join("\n\n");
  const n = alertas.length;
  return { assunto: `Central do Gestor — ${n} ${n === 1 ? "ponto de atenção" : "pontos de atenção"} hoje`, titulo: "Resumo do dia", mensagem };
}
