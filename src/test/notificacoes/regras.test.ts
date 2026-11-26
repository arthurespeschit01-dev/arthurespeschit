import { describe, it, expect } from 'vitest';
import { montarAlertas, novosAlertas, montarResumo, type Config } from '../../../supabase/functions/_shared/notificacoes';

const hoje = new Date('2026-11-26T11:07:00Z');
const tudo: Config = { contrato_vencimento: true, pagamento_vencimento: true, inadimplencia: true, inadimplencia_dias: 3, task_vencendo: true, meta_verba: true, meta_alerta_pct: 20, saldo_baixo: true, saldo_baixo_limite: 500 };
const base = { clientes: [], mensalidades: [], contratos: [], tarefas: [], campanhas: [], contas: [] };
const cli = (id: string, status = 'Ativo') => ({ id, name: `Cliente ${id}`, status });
const recente = '2026-11-25T10:00:00Z';

describe('inadimplência', () => {
  it('não alerta mensalidade paga', () => {
    const a = montarAlertas(tudo, hoje, { ...base, clientes: [cli('a')], mensalidades: [{ id: 'm1', cliente_id: 'a', valor: 100, vencimento: '2026-11-10', status: 'pago' }] });
    expect(a).toHaveLength(0);
  });
  it('não alerta cliente pausado ou encerrado', () => {
    const a = montarAlertas(tudo, hoje, { ...base, clientes: [cli('a', 'Pausado'), cli('b', 'Encerrado')], mensalidades: [
      { id: 'm1', cliente_id: 'a', valor: 100, vencimento: '2026-11-10', status: 'atrasado' },
      { id: 'm2', cliente_id: 'b', valor: 100, vencimento: '2026-11-10', status: 'pendente' }] });
    expect(a).toHaveLength(0);
  });
  it('ignora mensalidade antiga esquecida quando o cliente já pagou uma posterior (caso dos 108 dias)', () => {
    const a = montarAlertas(tudo, hoje, { ...base, clientes: [cli('a')], mensalidades: [
      { id: 'velha', cliente_id: 'a', valor: 100, vencimento: '2026-08-10', status: 'pendente' },
      { id: 'set', cliente_id: 'a', valor: 100, vencimento: '2026-09-10', status: 'pago' }] });
    expect(a).toHaveLength(0);
  });
  it('alerta atraso real e repete no máximo 1x por semana', () => {
    const a = montarAlertas(tudo, hoje, { ...base, clientes: [cli('a')], mensalidades: [{ id: 'm1', cliente_id: 'a', valor: 1500, vencimento: '2026-11-15', status: 'atrasado' }] });
    expect(a).toHaveLength(1);
    expect(a[0].texto).toContain('11 dias');
    const k = `${a[0].tipo}|${a[0].ref}`;
    expect(novosAlertas(a, new Map([[k, '2026-11-22']]), hoje)).toHaveLength(0);
    expect(novosAlertas(a, new Map([[k, '2026-11-19']]), hoje)).toHaveLength(1);
  });
});

describe('anúncios', () => {
  const camp = (o: object) => ({ id: 'c1', name: 'Leads', client_id: 'a', status: 'Ativa', spend: 900, budget: 1000, last_synced_at: recente, meta_ad_account_id: 'act_123', ...o });
  it('verba: só campanha ativa e sincronizada nos últimos 7 dias', () => {
    expect(montarAlertas(tudo, hoje, { ...base, clientes: [cli('a')], campanhas: [camp({ status: 'Pausada' })] })).toHaveLength(0);
    expect(montarAlertas(tudo, hoje, { ...base, clientes: [cli('a')], campanhas: [camp({ last_synced_at: '2026-11-01T00:00:00Z' })] })).toHaveLength(0);
    expect(montarAlertas(tudo, hoje, { ...base, clientes: [cli('a')], campanhas: [camp({})] })).toHaveLength(1);
  });
  it('verba: 20% configurado = avisa quando restar 20%, não quando gastar 20%', () => {
    expect(montarAlertas(tudo, hoje, { ...base, clientes: [cli('a')], campanhas: [camp({ spend: 300 })] })).toHaveLength(0);
  });
  it('saldo: só conta pré-paga com campanha rodando', () => {
    const conta = { account_id: 'act_123', account_name: 'CA Cliente', is_prepaid: true, available_balance: 0 };
    const semCampanha = montarAlertas({ saldo_baixo: true, saldo_baixo_limite: 500 }, hoje, { ...base, clientes: [cli('a')], contas: [conta] });
    expect(semCampanha).toHaveLength(0);
    const comCampanha = montarAlertas({ saldo_baixo: true, saldo_baixo_limite: 500 }, hoje, { ...base, clientes: [cli('a')], campanhas: [camp({ meta_ad_account_id: '123' })], contas: [conta] });
    expect(comCampanha).toHaveLength(1);
    expect(comCampanha[0].texto).toContain('esgotado');
  });
});

describe('tarefas e contratos', () => {
  it('ignora tarefa concluída e cancelada; avisa véspera e atraso uma vez', () => {
    const a = montarAlertas(tudo, hoje, { ...base, tarefas: [
      { id: 't1', title: 'Relatório', status: 'concluída', end_date: '2026-11-27', client_id: null },
      { id: 't2', title: 'Criativos', status: 'cancelada', end_date: '2026-11-20', client_id: null },
      { id: 't3', title: 'Briefing', status: 'pendente', end_date: '2026-11-27', client_id: null },
      { id: 't4', title: 'Setup', status: 'em andamento', end_date: '2026-11-20', client_id: null }] });
    expect(a.map((x) => x.ref)).toEqual(['t3:2026-11-27:vespera', 't4:2026-11-20:atrasada']);
    expect(novosAlertas(a, new Map(a.map((x) => [`${x.tipo}|${x.ref}`, '2026-11-20'])), hoje)).toHaveLength(0);
  });
  it('contrato encerrado não alerta; ativo alerta 7 dias antes', () => {
    const a = montarAlertas(tudo, hoje, { ...base, contratos: [
      { id: 'k1', client_name: 'X', expiry_date: '2026-12-03', status: 'Encerrado' },
      { id: 'k2', client_name: 'Y', expiry_date: '2026-12-03', status: 'Ativo' }] });
    expect(a).toHaveLength(1);
    expect(a[0].texto).toContain('Y');
  });
});

describe('resumo', () => {
  it('junta tudo em um único e-mail por seção', () => {
    const r = montarResumo([
      { tipo: 'tarefa', ref: '1', repetirDias: 0, grupo: 'Tarefas', texto: 'A' },
      { tipo: 'inadimplente', ref: '2', repetirDias: 7, grupo: 'Recebimentos', texto: 'B' },
      { tipo: 'tarefa', ref: '3', repetirDias: 0, grupo: 'Tarefas', texto: 'C' }]);
    expect(r.assunto).toContain('3 pontos');
    expect(r.mensagem).toBe('Tarefas\n• A\n• C\n\nRecebimentos\n• B');
  });
});
