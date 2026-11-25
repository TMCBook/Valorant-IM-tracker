// Read a season sign-up sheet (the "[FA26] Val IMs Player Directory" layout).
//
// The sheet is a grid of team blocks. Each block is:
//   Group A               ← optional group label somewhere above
//   Rogue                 ← team name, directly above the header row
//   Player | Riot ID | Discord
//   Ertugrul | TheHPGuy#baja | thehpguy
//   …
// Blocks can sit side by side and stack down the sheet; we find every
// "Player | Riot ID" header and read the rows below it until a blank.

import ExcelJS from "exceljs";

export type SheetPlayer = { realName: string; riotName: string; riotTag: string | null; discord: string | null };
export type SheetTeam = { name: string; group: string | null; players: SheetPlayer[] };

/** "[FA26] Val IMs Player Directory.xlsx" → "FA26". */
export function seasonFromFilename(name: string) {
  return /\[([A-Za-z]{2}\d{2})\]/.exec(name)?.[1]?.toUpperCase() ?? null;
}

export async function parseRosterSheet(bytes: ArrayBuffer): Promise<SheetTeam[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const teams: SheetTeam[] = [];

  for (const ws of wb.worksheets) {
    const cell = (r: number, c: number) => {
      const v = ws.getRow(r).getCell(c).value as unknown;
      const t =
        v && typeof v === "object"
          ? ((v as { text?: string }).text ??
            (v as { result?: unknown }).result ??
            (v as { richText?: { text: string }[] }).richText?.map((x) => x.text).join(""))
          : v;
      return t == null ? "" : String(t).trim();
    };

    for (let r = 2; r <= ws.rowCount; r++) {
      for (let c = 1; c <= ws.columnCount; c++) {
        if (cell(r, c).toLowerCase() !== "player" || cell(r, c + 1).toLowerCase() !== "riot id") continue;
        const name = cell(r - 1, c);
        if (!name) continue;
        // Group label: the nearest "Group …" cell above this block, in the same column.
        let group: string | null = null;
        for (let up = r - 2; up >= 1; up--) {
          const g = cell(up, c);
          if (/^group\b/i.test(g)) { group = g.replace(/\s+/g, " "); break; }
        }
        const players: SheetPlayer[] = [];
        for (let rr = r + 1; rr <= ws.rowCount; rr++) {
          const rid = cell(rr, c + 1);
          if (!rid) break;
          const i = rid.lastIndexOf("#");
          players.push({
            realName: cell(rr, c),
            riotName: (i > 0 ? rid.slice(0, i) : rid).trim(),
            riotTag: i > 0 ? rid.slice(i + 1).trim() || null : null,
            discord: cell(rr, c + 2) || null,
          });
        }
        teams.push({ name, group, players });
      }
    }
  }
  return teams;
}
