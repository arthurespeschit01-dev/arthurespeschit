import {
  assertEquals,
  assertThrows,
  assertRejects,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  encodeClickRef,
  decodeClickRef,
  googleConversionCsv,
  trackingSiteScript,
} from "./workspace-tracking.ts";
import {
  workspaceFormDefinition,
  workspaceAnswerError,
} from "./workspace-form.ts";
import { classifyConversation } from "./workspace-ai.ts";
Deno.test(
  "workspace fields validate choices, URLs, conditions and safe appearance",
  () => {
    const fields = [
      { id: "name", type: "text", label: "Nome", required: true },
      {
        id: "choices",
        type: "textarea",
        input_style: "multi" as const,
        label: "Interesses",
        required: true,
        options: ["A", "B"],
      },
    ];
    assertEquals(workspaceFormDefinition(fields, { primary: "#7c3aed" }), null);
    assert(
      workspaceFormDefinition(fields, {
        primary: "url(https://example.invalid)",
      }),
    );
    assertEquals(
      workspaceAnswerError(fields, { name: "Contato", choices: '["A"]' }),
      null,
    );
    assert(
      workspaceAnswerError(fields, {
        name: "Contato",
        choices: '["Invalido"]',
      }),
    );
    assert(workspaceAnswerError(fields, { name: "Contato", choices: "[]" }));
    const conditional = [
      fields[0],
      {
        ...fields[1],
        condition: {
          fieldId: "name",
          operator: "equals" as const,
          value: "Outro",
        },
      },
    ];
    assertEquals(
      workspaceAnswerError(conditional, {
        name: "Contato",
        choices: "invalid-hidden",
      }),
      null,
    );
    assert(
      workspaceAnswerError(
        [
          {
            id: "site",
            type: "text",
            input_style: "url",
            required: true,
            label: "Site",
          },
        ],
        { site: "javascript:alert(1)" },
      ),
    );
  },
);
Deno.test(
  "visible and invisible click references round-trip and CSV escapes imported names",
  () => {
    for (const hidden of [false, true])
      assertEquals(
        decodeClickRef("Olá " + encodeClickRef("0123456789abcdef", hidden)),
        "0123456789abcdef",
      );
    assertEquals(decodeClickRef("No reference"), "");
    assertThrows(() => encodeClickRef("invalid"));
    const csv = googleConversionCsv([
      {
        gclid: "click",
        name: 'Venda "confirmada"',
        time: "2026-11-14 12:00:00+00:00",
        value: "100",
        currency: "BRL",
      },
    ]);
    assert(csv.includes('"Venda ""confirmada"""'));
    assert(!csv.includes("email"));
    const script = trackingSiteScript(
      "https://example.invalid/function",
      "a".repeat(64),
    );
    assert(script.includes("gclid"));
    assert(script.includes("localStorage"));
    assertThrows(() =>
      trackingSiteScript("https://example.invalid/function", "bad"),
    );
  },
);
Deno.test(
  "AI classifier requires a valid boolean response, handles provider failures and sends no conversion itself",
  async () => {
    let calls = 0;
    const job = {
      api_key: "fixture-secret",
      model: "openai/gpt-5.4-nano",
      criteria: "Pagamento confirmado",
      conversation: [{ direction: "entrada", text: "Paguei" }],
    };
    const mock: typeof fetch = async (input, init) => {
      calls++;
      assertEquals(
        String(input),
        "https://ai-gateway.vercel.sh/v1/chat/completions",
      );
      const body = JSON.parse(String(init?.body));
      assertEquals(body.response_format.json_schema.strict, true);
      assert(body.messages[0].content.includes("não confiável"));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"matched":true}' } }],
        }),
      );
    };
    assertEquals(await classifyConversation(job, mock), true);
    assertEquals(calls, 1);
    await assertRejects(() =>
      classifyConversation(
        job,
        async () => new Response("{}", { status: 401 }),
      ),
    );
    await assertRejects(() =>
      classifyConversation(
        job,
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"matched":"true"}' } }],
            }),
          ),
      ),
    );
  },
);
