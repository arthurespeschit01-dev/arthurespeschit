// Guardas estáticas: falham se uma proteção for removida do código.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const raiz = join(__dirname, '../../..');
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8');

describe('funções do servidor', () => {
  it('enviar-email decide o envio por autorizarEnvioEmail e escapa o HTML', () => {
    const s = ler('supabase/functions/enviar-email/index.ts');
    expect(s).toMatch(/autorizarEnvioEmail\(/);
    expect(s).toMatch(/escapeHtml\(decisao\.titulo\)/);
  });
  it.each(['google-ads-auth', 'google-ads-campaign-insights', 'google-ads-report', 'google-ads-list-customers'])(
    '%s confere o dono do cliente antes de usar a chave de serviço', (f) => {
      const s = ler(`supabase/functions/${f}/index.ts`);
      const i = s.indexOf('exigirClienteDoUsuario(supabase');
      expect(i).toBeGreaterThan(-1);
      const j = s.search(/from\('google_ads_(connections|oauth_states)'\)/);
      expect(i).toBeLessThan(j);
    });
  it.each(['google-ads-auth-callback', 'meta-auth-callback'])('%s valida a origem e escapa a mensagem', (f) => {
    const s = ler(`supabase/functions/${f}/index.ts`);
    expect(s).toMatch(/origemPermitida\(/);
    expect(s).toMatch(/escapeHtml\(message\)/);
  });
  it('strategy-chat exige login e filtra mensagens', () => {
    const s = ler('supabase/functions/strategy-chat/index.ts');
    expect(s).toMatch(/auth\.getUser\(\)/);
    expect(s).toMatch(/sanitizarMensagens\(/);
    expect(ler('supabase/config.toml')).not.toMatch(/\[functions\.strategy-chat\]\s*verify_jwt = false/);
  });
});

describe('anexos e banco', () => {
  it.each(['src/pages/ClientDetail.tsx', 'src/pages/Tasks.tsx', 'src/pages/Contratos.tsx'])('%s valida o arquivo e não expõe link público', (p) => {
    const s = ler(p);
    expect(s).toMatch(/validarAnexo\(file\)/);
    expect(s).not.toMatch(/href=\{att\.file_url\}/);
  });
  it('migração deixa os buckets de anexos privados e com limite', () => {
    const nomes = readdirSync(join(raiz, 'supabase/migrations'));
    const sql = nomes.filter((n) => n.includes('anexos_privados')).map((n) => ler(`supabase/migrations/${n}`)).join('');
    expect(sql).toMatch(/public = false/);
    expect(sql).toMatch(/allowed_mime_types/);
  });
  it('migração exige 2FA (aal2) no banco', () => {
    const nomes = readdirSync(join(raiz, 'supabase/migrations'));
    const sql = nomes.filter((n) => n.includes('exigir_2fa')).map((n) => ler(`supabase/migrations/${n}`)).join('');
    expect(sql).toMatch(/as restrictive/);
    expect(sql).toMatch(/'aal2'/);
  });
});

describe('acesso', () => {
  it('a tela de login não oferece cadastro por padrão', () => {
    expect(ler('src/pages/AuthPage.tsx')).toMatch(/allowSignUp = false/);
  });
  it('o 2FA envolve todas as rotas logadas', () => {
    expect(ler('src/App.tsx')).toMatch(/<MfaGate><Routes>/);
  });
  it('.env não está versionado', () => {
    const arquivos = execSync('git ls-files', { cwd: raiz }).toString().split('\n');
    expect(arquivos).not.toContain('.env');
  });
});
