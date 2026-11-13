import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formAnswers,
  bookingSlots,
  publicContact,
  uuid,
} from "./workspace-public.ts";
Deno.test(
  "public forms hide conditional answers and reject unknown/invalid answers",
  () => {
    const fields = [
      { id: "name", label: "Nome", type: "text", required: true },
      {
        id: "kind",
        label: "Tipo",
        type: "select",
        options: ["Empresa", "Pessoa"],
        required: true,
      },
      {
        id: "company",
        label: "Empresa",
        type: "text",
        required: true,
        condition: {
          fieldId: "kind",
          operator: "equals" as const,
          value: "Empresa",
        },
      },
    ];
    assertEquals(
      formAnswers(fields, { name: "Ana", kind: "Pessoa", company: "hidden" }),
      {
        name: { label: "Nome", value: "Ana" },
        kind: { label: "Tipo", value: "Pessoa" },
      },
    );
    assertThrows(() => formAnswers(fields, { name: "Ana", kind: "Empresa" }));
    assertThrows(() =>
      formAnswers(fields, { name: "Ana", kind: "Pessoa", admin: true }),
    );
    assertThrows(() => publicContact({ name: "x", email: "invalid" }));
    assertEquals(uuid("not-uuid"), false);
  },
);
Deno.test(
  "booking slots respect local timezone, buffers, weekdays and occupied times",
  () => {
    const c = {
      duration_minutes: 30,
      timezone: "America/Sao_Paulo",
      availability: {
        days: [1, 2, 3, 4, 5],
        start: "09:00",
        end: "11:00",
        buffer: 10,
      },
    };
    const slots = bookingSlots(
      c,
      [],
      "2026-11-16",
      Date.parse("2026-11-13T00:00:00Z"),
    );
    assertEquals(slots, [
      "2026-11-16T12:00:00.000Z",
      "2026-11-16T12:40:00.000Z",
      "2026-11-16T13:20:00.000Z",
    ]);
    const busy = bookingSlots(
      c,
      [{ starts_at: "2026-11-16T12:00:00Z", ends_at: "2026-11-16T12:30:00Z" }],
      "2026-11-16",
      Date.parse("2026-11-13T00:00:00Z"),
    );
    assertEquals(busy, slots.slice(1));
    assertEquals(
      bookingSlots(c, [], "2026-11-15", Date.parse("2026-11-13T00:00:00Z")),
      [],
    );
  },
);
