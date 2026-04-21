

## Notificações por e-mail (resumo diário)

Hoje as notificações (tasks vencendo, contratos a vencer, pagamentos próximos) só aparecem no sino dentro do app. Vamos adicionar **envio automático por e-mail** usando a infraestrutura nativa de e-mails do Lovable Cloud.

### Como vai funcionar

- **1 e-mail por dia, de manhã (ex: 08:00)**, consolidando tudo que precisa de atenção daquele usuário (em vez de 1 e-mail por item — evita spam).
- Conteúdo do e-mail organizado em seções:
  - 🚨 **Vencidos** (tasks atrasadas + contratos vencidos)
  - ⏰ **Vencem hoje** (tasks + pagamentos do dia)
  - 📅 **Próximos 7 dias** (tasks)
  - 📄 **Contratos vencendo em 30 dias**
  - 💰 **Pagamentos nos próximos 3 dias**
- Cada item com link direto pro módulo correspondente no app.
- Só envia se houver pelo menos 1 item — dias "limpos" não geram e-mail.
- Enviado para o e-mail de login do usuário (`auth.users.email`).

### Controle do usuário

- Toggle nas **Configurações / perfil**: "Receber resumo diário por e-mail" (liga/desliga).
- Por padrão: **ligado** para todos os usuários existentes.

### Etapas técnicas

1. **Configurar domínio de e-mail** (pré-requisito do Lovable Emails) — botão de setup vai aparecer pra você configurar o subdomínio (ex: `notify.seudominio.com`). Sem domínio configurado, e-mails não saem.
2. **Setup da infraestrutura de e-mail** (filas, logs, etc — automático).
3. **Criar tabela** `user_email_preferences` (user_id, daily_digest_enabled, last_sent_at) com RLS.
4. **Criar template React Email** `daily-digest` com as seções acima, estilizado no tema do app (escuro/neon).
5. **Criar Edge Function `send-daily-digest`** que:
   - Lê todos os usuários com digest ligado
   - Para cada um, calcula as mesmas notificações que o `NotificationBar` calcula hoje (mesma lógica)
   - Se houver itens, dispara `send-transactional-email` com o template
   - Atualiza `last_sent_at`
6. **Agendar cron diário** (pg_cron) às 08:00 BRT (= 11:00 UTC) chamando a função.
7. **UI**: adicionar o toggle "Receber resumo diário por e-mail" em algum ponto acessível (provavelmente um menu de perfil — preciso confirmar onde, ver pergunta abaixo).

### Detalhes técnicos importantes

- Lógica de cálculo de notificações vai ser **duplicada na Edge Function** (TypeScript no Deno) replicando o que está em `NotificationBar.tsx` (linhas 101–158). Mantemos o sino funcionando igual.
- E-mail é **transacional** (1 destinatário, evento agendado por preferência do próprio usuário) — compatível com Lovable Emails.
- Não vai mexer no comportamento atual do sino/toast — é puramente adicional.

### O que preciso confirmar com você

<lov-actions>
<lov-suggestion message="Quero o resumo diário por e-mail, e o toggle pode ficar num menu de perfil/configurações novo no canto superior direito do app">Sim, criar menu de perfil novo</lov-suggestion>
<lov-suggestion message="Quero o resumo diário, mas o toggle de e-mail pode ficar dentro da página de notificações (no painel do sino mesmo, num botão de configurações)">Toggle dentro do sino</lov-suggestion>
<lov-suggestion message="Avançar com o plano e configurar o domínio de e-mail agora">Avançar e configurar domínio</lov-suggestion>
</lov-actions>

