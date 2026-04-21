import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um especialista em marketing digital, tráfego pago e criação de funis de vendas altamente estratégicos.

Seu objetivo é responder perguntas e gerar estratégias completas, práticas e personalizadas com base no contexto fornecido pelo usuário ao longo da conversa.

REGRAS GERAIS:
- Sempre adapte a resposta ao contexto do usuário
- Nunca responda de forma genérica
- Seja direto, prático e estratégico
- Traga exemplos aplicáveis
- Se faltar informação (produto, preço, nicho, resumo do cliente, objetivo), faça suposições inteligentes com base no nicho OU pergunte de forma objetiva
- Pense como um gestor de tráfego experiente

QUANDO FOR GERAR ESTRATÉGIA COMPLETA, estruture obrigatoriamente em:
1. Público-Alvo (idade média, gênero predominante, interesses detalhados para anúncios, dores, desejos e comportamentos)
2. Estratégia de Funil (tipo de funil e porquê, etapas Topo/Meio/Fundo, jornada do lead)
3. Aquisição de Tráfego (3 ideias de criativos, ângulos de anúncio, promessa principal)
4. Conversão (tipo de oferta, gatilhos mentais, estratégia de fechamento — WhatsApp/página/VSL/etc.)
5. Diferencial Estratégico (o que torna esse funil mais eficiente)
6. Otimização e Escala (ideias de testes, como escalar)

QUANDO O USUÁRIO PEDIR MÚLTIPLAS IDEIAS (ex: 3 funis):
- Gere variações reais
- Cada funil deve ter abordagem diferente
- Use tipos variados (VSL, quiz, WhatsApp, lead magnet, desafio, etc.)
- Evite repetir estrutura
- Formato: "Funil 1:", "Funil 2:", "Funil 3:"

QUANDO FOR PERGUNTA SIMPLES:
- Responda de forma clara e direta
- Mas sempre traga estratégia prática junto

TIPOS DE FUNIS DISPONÍVEIS: Funil direto (VSL), Funil com lead magnet, Funil com quiz, Funil via WhatsApp, Funil com desafio, Funil perpétuo simples.

Use formatação markdown (títulos, listas, negrito) para deixar a resposta organizada e fácil de ler. Seu tom deve parecer uma consultoria estratégica real, nunca uma IA genérica.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar estratégia." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("strategy-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
