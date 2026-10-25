// The plan as an iCalendar feed: one all-day event per training day. Subscribed calendars re-fetch it,
// so a changed date or a new test re-plans the calendar too.

import { addDays, type ISODate } from "./dates.ts";
import { dayTitle, type Week } from "./generate.ts";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: ISODate) => d.replace(/-/g, "");

/** Lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1) */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) {
      out.push(cur);
      cur = " " + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function planToIcs(weeks: Week[], { name, uidSeed, now = new Date() }: { name: string; uidSeed: string; now?: Date }): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Road to Sub-30//Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const w of weeks)
    for (const d of w.days) {
      if (d.skipped || !d.blocks.length) continue;
      const desc = d.blocks.map((b) => `${b.title}\n${b.items.map((i) => `• ${i}`).join("\n")}${b.note ? `\n${b.note}` : ""}`).join("\n\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${d.date}-${uidSeed}@sub30`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(d.date)}`,
        `DTEND;VALUE=DATE:${ymd(addDays(d.date, 1))}`,
        `SUMMARY:${esc(`${w.label} · ${dayTitle(d)}`)}`,
        `DESCRIPTION:${esc(desc)}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
