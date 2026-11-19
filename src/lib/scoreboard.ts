// Server only: imported by the API route and the test script, never by client code.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod";

const PlayerRow = z.object({
  side: z
    .enum(["ally", "enemy"])
    .describe(
      "ally = green/teal rows or the top team; enemy = red rows or the bottom team",
    ),
  name: z.string().describe("In-game name exactly as shown, without the #tag if hidden"),
  agent: z.string().nullable().describe("Agent name identified from the portrait, e.g. Jett"),
  acs: z.number().int().nullable(),
  kills: z.number().int(),
  deaths: z.number().int(),
  assists: z.number().int(),
  econ: z.number().int().nullable(),
  first_bloods: z.number().int().nullable(),
  plants: z.number().int().nullable(),
  defuses: z.number().int().nullable(),
});

export const ScoreboardSchema = z.object({
  is_scoreboard: z
    .boolean()
    .describe("false if the image is not a Valorant end-of-match or Tab scoreboard"),
  map: z.string().nullable().describe("Map name if visible, e.g. Ascent"),
  date: z
    .string()
    .nullable()
    .describe("Match date if shown (e.g. 'NOV 14, 2026'), as YYYY-MM-DD; null if not visible"),
  ally_rounds: z.number().int().nullable(),
  enemy_rounds: z.number().int().nullable(),
  players: z.array(PlayerRow),
  notes: z
    .string()
    .nullable()
    .describe("Anything unreadable or uncertain the reviewer should double-check"),
});

export type ParsedScoreboard = z.infer<typeof ScoreboardSchema>;

const SYSTEM = `You read Valorant scoreboard screenshots (often phone photos of a monitor) and transcribe them exactly.

Layouts you will see:
- Match Details (client match history): a "13 VICTORY 4" or "4 DEFEAT 13" header and one list of 10 players sorted by performance, with columns KDA ("27 / 12 / 9" = kills / deaths / assists), First Bloods, Plants, Defuses. This layout has no ACS or econ, so return null for those.
- End-of-game or Tab scoreboard: columns such as Agent, Name, Rank, ACS, K, D, A, +/-, Econ rating, First bloods, Plants, Defuses. Never put the +/- column into any field.

Rules:
- Output one row per player, normally 10. Skip empty rows.
- Copy names character for character, including spaces, numbers and symbols. If a name is cut off, give the visible part.
- A dim prefix before a bar, as in "CAL | CAL GST", is a title or tag, not part of the name. Return only the part after the bar ("CAL GST").
- Identify the agent from its portrait. Use null if you are not confident.
- Side: rows tinted green/teal are "ally" and rows tinted red are "enemy". One row may be highlighted gold or yellow: that is the screenshot owner, who is always "ally". On a Tab scoreboard without colors, the top block is "ally" and the bottom block is "enemy".
- ally_rounds is the number on the LEFT of the header (the teal/green rows' team) and enemy_rounds is the number on the RIGHT. This holds for both VICTORY and DEFEAT, even though on a DEFEAT screen the left number is drawn in red. Null if not visible.
- map: read it from text such as "MAP - SUNSET". Return just the map name in title case ("Sunset").
- Use null for any number you cannot read. Never guess a number; mention it in notes instead.`;

let client: Anthropic | null = null;

/** Extract stats from a scoreboard image with Claude. */
export async function parseScoreboard(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<ParsedScoreboard> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // If a safety classifier ever declines, the API retries on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "Transcribe this scoreboard." },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(ScoreboardSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The image couldn't be processed. Try a clearer screenshot.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("Couldn't read the scoreboard. Try a clearer or tighter-cropped photo.");
  }
  return response.parsed_output;
}
