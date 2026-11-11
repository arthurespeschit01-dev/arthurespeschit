import { describe, expect, it } from "vitest";
import {
  normalizeWhatsappEvent,
  whatsappPhone,
  whatsappPhoneKey,
} from "../../supabase/functions/_shared/agency-whatsapp";

describe("WhatsApp contacts and inbound events", () => {
  it("matches Brazilian numbers with and without DDI and ninth digit", () => {
    expect(whatsappPhone("(11) 99999-0000")).toBe("5511999990000");
    expect(whatsappPhoneKey("5511999990000")).toBe(
      whatsappPhoneKey("1199990000"),
    );
  });
  it("accepts inbound and outgoing phone messages and ignores groups and receipts", () => {
    const data = {
      messageId: "fixture-1",
      sender: { id: "5511999990000@s.whatsapp.net" },
      msgContent: { conversation: "Olá" },
    };
    expect(
      normalizeWhatsappEvent({ event: "webhookReceived", data })?.body,
    ).toBe("Olá");
    expect(normalizeWhatsappEvent({data:{...data,fromMe:true,chat:{id:'5511888880000'}}})).toMatchObject({direction:'saida',phone:'5511888880000'});
    expect(
      normalizeWhatsappEvent({ data: { ...data, chat: { id: "group@g.us" } } }),
    ).toBeNull();
    expect(normalizeWhatsappEvent({ event: "messageRead", data })).toBeNull();
  });
});
