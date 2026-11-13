import { validateAnswers } from "./agency-validation.ts";
import { visibleFormFields, type ConditionalField } from "./form-conditions.ts";
export function formAnswers(fields: ConditionalField[], values: unknown) {
  const error = validateAnswers(fields, values);
  if (error) throw new Error(error);
  return Object.fromEntries(
    visibleFormFields(fields, values as Record<string, unknown>).map((f) => [
      f.id,
      {
        label: f.label,
        value: String((values as Record<string, unknown>)[f.id] || "").trim(),
      },
    ]),
  );
}
export const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
export function publicContact(value: unknown) {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Contato inválido.");
  const result = {
    name: String(v.name || "").trim(),
    phone: String(v.phone || "").trim(),
    email: String(v.email || "").trim(),
  };
  if (
    !result.name ||
    result.name.length > 160 ||
    result.phone.length > 40 ||
    result.email.length > 254 ||
    (!result.phone && !result.email) ||
    (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
  )
    throw Error("Informe nome e um telefone ou e-mail válidos.");
  return result;
}
export function bookingSlots(
  calendar: {
    duration_minutes: number;
    timezone: string;
    availability: {
      days: number[];
      start: string;
      end: string;
      buffer: number;
    };
  },
  appointments: { starts_at: string; ends_at: string }[],
  date: string,
  now = Date.now(),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const day = Date.parse(date + "T12:00:00Z");
  if (
    !Number.isFinite(day) ||
    day < now - 86400000 ||
    day > now + 90 * 86400000
  )
    return [];
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: calendar.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = (n: number) =>
    Object.fromEntries(
      formatter.formatToParts(n).map((p) => [p.type, p.value]),
    );
  const weekday = new Date(day).getUTCDay() || 7;
  if (!calendar.availability.days.includes(weekday)) return [];
  const start = calendar.availability.start,
    end = calendar.availability.end;
  const slots: string[] = [];
  // Search UTC instants, then apply the actual local date/time. This also handles DST gaps and repeated hours.
  for (let n = day - 30 * 3600000; n <= day + 30 * 3600000; n += 60000) {
    if (n < now + 5 * 60000) continue;
    const p = parts(n),
      local = `${p.year}-${p.month}-${p.day}`,
      time = `${p.hour}:${p.minute}`;
    if (local !== date || time < start || time >= end) continue;
    const elapsed =
      Number(p.hour) * 60 +
      Number(p.minute) -
      (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)));
    if (
      elapsed % (calendar.duration_minutes + calendar.availability.buffer) !==
      0
    )
      continue;
    const finish = n + calendar.duration_minutes * 60000,
      q = parts(finish);
    if (
      `${q.year}-${q.month}-${q.day}` !== date ||
      `${q.hour}:${q.minute}` > end
    )
      continue;
    if (
      appointments.some(
        (a) =>
          n < Date.parse(a.ends_at) + calendar.availability.buffer * 60000 &&
          finish + calendar.availability.buffer * 60000 >
            Date.parse(a.starts_at),
      )
    )
      continue;
    slots.push(new Date(n).toISOString());
  }
  return slots;
}
