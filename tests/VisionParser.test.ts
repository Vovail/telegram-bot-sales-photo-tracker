import { describe, it, expect, vi } from "vitest";
import { VisionParser } from "../src/components/VisionParser.js";

function createMockModel(content: string | null, shouldThrow = false) {
  const generateContent = shouldThrow
    ? vi.fn().mockRejectedValue(new Error("API connection failed"))
    : vi.fn().mockResolvedValue({
        response: {
          text: content !== null ? () => content : () => "",
        },
      });

  return { generateContent } as any;
}

describe("VisionParser", () => {
  const validResponse = JSON.stringify({
    elements: [
      { type: "date_marker", date: "2026-03-20", position: 1 },
      {
        type: "sales_record",
        name: "Футболка",
        model: "TS-100",
        size: "L",
        color: "Синій",
        price: 25.0,
        isCashless: false,
        position: 2,
      },
      {
        type: "sales_record",
        name: "Джинси",
        size: "32",
        price: 45.0,
        isCashless: true,
        position: 3,
      },
    ],
  });

  it("parses a valid photo response with date markers and sales records", async () => {
    const model = createMockModel(validResponse);
    const parser = new VisionParser(model);
    const result = await parser.parsePhoto(Buffer.from("fake-image"));

    expect(result.elements).toHaveLength(3);
    expect(result.elements[0]).toEqual({
      type: "date_marker",
      date: "2026-03-20",
      position: 1,
    });
    expect(result.elements[1]).toMatchObject({
      type: "sales_record",
      name: "Футболка",
      model: "TS-100",
      price: 25.0,
      isCashless: false,
    });
    expect(result.elements[2]).toMatchObject({
      type: "sales_record",
      name: "Джинси",
      isCashless: true,
    });
  });

  it("returns elements sorted by position", async () => {
    const unordered = JSON.stringify({
      elements: [
        { type: "sales_record", name: "Item B", price: 10, position: 3 },
        { type: "date_marker", date: "2026-01-01", position: 1 },
        { type: "sales_record", name: "Item A", price: 20, position: 2 },
      ],
    });
    const model = createMockModel(unordered);
    const parser = new VisionParser(model);
    const result = await parser.parsePhoto(Buffer.from("fake"));

    expect(result.elements[0].position).toBe(1);
    expect(result.elements[1].position).toBe(2);
    expect(result.elements[2].position).toBe(3);
  });

  it("ensures name is always populated for sales records", async () => {
    const response = JSON.stringify({
      elements: [
        {
          type: "sales_record",
          name: "Кросівки SN-200 Білі",
          price: 80,
          position: 1,
        },
      ],
    });
    const model = createMockModel(response);
    const parser = new VisionParser(model);
    const result = await parser.parsePhoto(Buffer.from("fake"));

    expect(result.elements[0].type).toBe("sales_record");
    if (result.elements[0].type === "sales_record") {
      expect(result.elements[0].name).toBe("Кросівки SN-200 Білі");
      expect(result.elements[0].name.length).toBeGreaterThan(0);
    }
  });

  it("puts fallback text in name when name is empty but other fields exist", async () => {
    const response = JSON.stringify({
      elements: [
        { type: "sales_record", name: "", model: "X1", size: "M", position: 1 },
      ],
    });
    const model = createMockModel(response);
    const parser = new VisionParser(model);
    const result = await parser.parsePhoto(Buffer.from("fake"));

    if (result.elements[0].type === "sales_record") {
      expect(result.elements[0].name.length).toBeGreaterThan(0);
    }
  });

  it("handles optional fields being absent", async () => {
    const response = JSON.stringify({
      elements: [
        { type: "sales_record", name: "Шкарпетки", price: 5, position: 1 },
      ],
    });
    const model = createMockModel(response);
    const parser = new VisionParser(model);
    const result = await parser.parsePhoto(Buffer.from("fake"));

    if (result.elements[0].type === "sales_record") {
      expect(result.elements[0].model).toBeUndefined();
      expect(result.elements[0].size).toBeUndefined();
      expect(result.elements[0].color).toBeUndefined();
      expect(result.elements[0].isCashless).toBeUndefined();
    }
  });

  it("throws on API error", async () => {
    const model = createMockModel(null, true);
    const parser = new VisionParser(model);

    await expect(parser.parsePhoto(Buffer.from("fake"))).rejects.toThrow(
      "Failed to call Gemini Vision API: API connection failed",
    );
  });

  it("throws when API returns empty content", async () => {
    const model = createMockModel("");
    const parser = new VisionParser(model);

    await expect(parser.parsePhoto(Buffer.from("fake"))).rejects.toThrow(
      "Photo is unreadable: Gemini returned no content",
    );
  });

  it("throws when response is not valid JSON", async () => {
    const model = createMockModel("This is not JSON at all");
    const parser = new VisionParser(model);

    await expect(parser.parsePhoto(Buffer.from("fake"))).rejects.toThrow(
      "Photo is unreadable: could not parse structured data",
    );
  });

  it("throws when response has no elements array", async () => {
    const model = createMockModel(JSON.stringify({ data: [] }));
    const parser = new VisionParser(model);

    await expect(parser.parsePhoto(Buffer.from("fake"))).rejects.toThrow(
      "Photo is unreadable: no elements found",
    );
  });

  it("handles markdown-wrapped JSON response", async () => {
    const wrapped = "```json\n" + validResponse + "\n```";
    const model = createMockModel(wrapped);
    const parser = new VisionParser(model);
    const result = await parser.parsePhoto(Buffer.from("fake"));

    expect(result.elements).toHaveLength(3);
  });

  it("includes rawText in the result", async () => {
    const model = createMockModel(validResponse);
    const parser = new VisionParser(model);
    const result = await parser.parsePhoto(Buffer.from("fake"));

    expect(result.rawText).toBe(validResponse);
  });

  it("sends base64-encoded image to the API", async () => {
    const model = createMockModel(validResponse);
    const parser = new VisionParser(model);
    const imageBuffer = Buffer.from("test-image-data");
    await parser.parsePhoto(imageBuffer);

    const call = model.generateContent.mock.calls[0][0];
    const imageContent = call[1];
    expect(imageContent.inlineData.data).toBe(imageBuffer.toString("base64"));
    expect(imageContent.inlineData.mimeType).toBe("image/jpeg");
  });
});
