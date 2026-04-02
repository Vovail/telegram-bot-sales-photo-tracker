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
      "name": "Item name in Ukrainian",
      "model": "model identifier if present",
      "size": "size if present",
      "color": "color if present",
      "price": 123.00,
      "isCashless": false,
      "position": 2
    }
  ]
}

Rules:
1. Preserve the top-to-bottom positional order from the photo. Assign ascending position numbers starting from 1.
2. For date_marker elements: extract the date and convert to YYYY-MM-DD format.
3. For sales_record elements:
   - "name" is REQUIRED and must always be a non-empty string. If you cannot split the record into separate fields (model, size, color), put ALL extracted text into the "name" field.
   - "model", "size", "color" are optional — include only if clearly identifiable.
   - "price" is the numeric sale price. Omit if not readable.
   - "isCashless" should be true if there are marks near the price indicating cashless/card payment (e.g.,"чек", "б/г", "безгот", "картка", checkmarks, or other cashless indicators). Default to false if no such marks are present.
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
      const parts = [el.model, el.size, el.color, el.name].filter(Boolean);
      const finalName =
        name.length > 0
          ? name
          : parts.length > 0
            ? parts.map(String).join(" ")
            : "Unknown item";

      return {
        type: "sales_record" as const,
        name: finalName,
        ...(el.model != null ? { model: String(el.model) } : {}),
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

    return { elements, rawText };
  }
}
