import { describe, expect, it } from 'vitest';
import { validateAnswers } from '../../supabase/functions/_shared/agency-validation';

const fields = [{ id: 'email', label: 'E-mail', type: 'email', required: true }];
describe('public form submissions', () => {
  it('rejects missing mandatory fields and invalid input', () => {
    expect(validateAnswers(fields, {})).toContain('Preencha');
    expect(validateAnswers(fields, { email: 'invalid' })).toContain('E-mail inválido');
    expect(validateAnswers(fields, { email: { injected: true } })).toContain('Resposta inválida');
  });
  it('prevents stale form submissions from storing removed fields', () => {
    expect(validateAnswers(fields, { email: 'test@example.com', deleted: 'stale' })).toContain('formulário mudou');
    expect(validateAnswers(fields, { email: 'test@example.com' })).toBeNull();
  });
});
