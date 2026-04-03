import type { GenerativeModel } from "@google/generative-ai";
import type { PhotoParseResult, ParsedElement } from "../types/index.js";

const VISION_PROMPT = `You are an expert at reading Ukrainian handwritten sales notes (торгові записки). Analyze the provided photo and extract all information into a structured JSON format.

The photo contains handwritten sales records, possibly with date markers separating records from different days. Text is written in Ukrainian.

Return a JSON object with the following structure:
{
  "elements": [
    {
      "type": "date_marker",
      "date": "YYYY-MM-DD",
      "position": 1
    },
    {
      "type": "sales_record",
      "clothingType": "куртка",
      "name": "PALMA-6083",
      "size": "XL-XXL",
      "color": "світлий беж",
      "price": 1350,
      "isCashless": false,
      "position": 2
    }
  ]
}

Field definitions for sales_record:

1. "clothingType" — the general category/type of clothing. Common values include (but are not limited to):
   "куртка", "вітровка", "кофта", "худі", "сукня", "шорти", "штани", "футболка", "плаття", "блузка", "жилетка", "пальто", "спідниця", "костюм", "комбінезон", "светр", "піджак", "туніка", "лосіни", "бриджі"
   Extract the clothing type word from the line. If not clearly identifiable, omit this field.

2. "name" — brand, model number, and any other identifying text EXCEPT clothing type, color, size, and price.
   Examples: "PALMA-6083", "GLSA 24054", "Nike Air Max", "Zara Basic", "ТМ Bershka 1120"
   This is REQUIRED and must always be a non-empty string. If you cannot identify a brand/model, put all remaining descriptive text here.

3. "size" — size as written. Keep the original notation.
   Examples: "32р", "50р", "S", "L/XL", "XL-XXL", "54/56", "M", "42-44", "One size"

4. "color" — color as written in Ukrainian. Keep the original notation.
   Examples: "беж", "світлий беж", "шоколад", "темно/зелена", "рожеве", "чорний", "білий", "синій", "сірий"

5. "price" — numeric sale price only. Omit if not readable.

6. "isCashless" — determining cashless payment:
   a) Individual cashless marks: if there are marks near an individual item's price indicating cashless/card payment (e.g., "б/г", "безгот", "картка", checkmarks), set to true.
   b) Bracket-grouped lines: sometimes 2+ consecutive lines are connected by a curly bracket "}" on the right side, with a single total price next to the bracket. If "чек" (or "Чек") appears next to this bracket total, ALL lines in that group are cashless — set isCashless to true for every item in the group. Each line is still a separate sales_record. Use individual prices where available; omit price if a line has none (do NOT divide the bracket total).
   c) A standalone "чек" line with a total sum at the end of a day's block is a day summary (see ignore rules below), NOT a cashless marker.
   d) Default to false if no cashless indicators are present.

Rules:
1. Preserve the top-to-bottom positional order from the photo. Assign ascending position numbers starting from 1.
2. IMPORTANT — IGNORE the following non-sales data that often appears at the end of each day's records:
   - Salary lines: "з/п", "З/П", "ЗП", "зп" followed by a number.
   - Cashless total lines: "чек", "Чек" followed by a number (day total, not individual sale).
   - Daily total sum: a standalone number with a line drawn above/below it.
   - Remainder lines: "залишок", "Залишок" followed by a number.
   - Any arithmetic near summary numbers (e.g., "+н.890", "+1100к курт.").
3. For date_marker elements: extract the date and convert to YYYY-MM-DD format.
4. All text values should be in Ukrainian as written in the original notes.
5. Return ONLY the JSON object, no additional text or markdown formatting.`;

export class VisionParser {
  private model: GenerativeModel;

  constructor(model: GenerativeModel) {
    this.model = model;
  }

  async parsePhoto(photoBuffer: Buffer): Promise<PhotoParseResult> {
    const base64Image = photoBuffer.toString("base64");

    let response;
    try {
      response = await this.model.generateContent([
        VISION_PROMPT,
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown API error";
      throw new Error(`Failed to call Gemini Vision API: ${message}`);
    }

    const content = response.response.text?.();
    if (!content) {
      throw new Error(
        "Photo is unreadable: Gemini returned no content. Please resend a clearer photo.",
      );
    }

    const rawText = content;

    let parsed: { elements?: unknown[] };
    try {
      const jsonStr = content.replace(/```json\s*|```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error(
        "Photo is unreadable: could not parse structured data from the image. Please resend a clearer photo.",
      );
    }

    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      throw new Error(
        "Photo is unreadable: no elements found in the parsed response. Please resend a clearer photo.",
      );
    }

    const elements: ParsedElement[] = (
      parsed.elements as Record<string, unknown>[]
    ).map((el) => {
      if (el.type === "date_marker") {
        return {
          type: "date_marker" as const,
          date: String(el.date),
          position: Number(el.position),
        };
      }

      // sales_record — ensure name is always populated
      const name = el.name ? String(el.name) : "";
      const parts = [el.clothingType, el.name, el.size, el.color].filter(
        Boolean,
      );
      const finalName =
        name.length > 0
          ? name
          : parts.length > 0
            ? parts.map(String).join(" ")
            : "Unknown item";

      return {
        type: "sales_record" as const,
        ...(el.clothingType != null
          ? { clothingType: String(el.clothingType) }
          : {}),
        name: finalName,
        ...(el.size != null ? { size: String(el.size) } : {}),
        ...(el.color != null ? { color: String(el.color) } : {}),
        ...(el.price != null ? { price: Number(el.price) } : {}),
        ...(el.isCashless != null
          ? { isCashless: Boolean(el.isCashless) }
          : {}),
        position: Number(el.position),
      };
    });

    // Sort by position ascending
    elements.sort((a, b) => a.position - b.position);

    // Fix date markers with implausible years (e.g. 2020 instead of 2026).
    // Handwritten dates often omit or garble the year; if the parsed year is
    // more than 1 year away from the current year, replace it with the
    // current year (adjusting for month/day proximity to year boundary).
    const currentYear = new Date().getFullYear();
    for (const el of elements) {
      if (el.type === "date_marker" && el.date) {
        const parts = el.date.split("-");
        if (parts.length === 3) {
          const parsedYear = parseInt(parts[0], 10);
          if (!isNaN(parsedYear) && Math.abs(parsedYear - currentYear) > 1) {
            parts[0] = String(currentYear);
            el.date = parts.join("-");
          }
        }
      }
    }

    return { elements, rawText };
  }
}
