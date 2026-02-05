const openai = require("../lib/openai");

function safeJsonParse(text) {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  return JSON.parse(cleaned);
}

const analyzePrescriptionImage = async (imageBuffer, mimeType) => {
  const base64Image = imageBuffer.toString("base64");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
You are a licensed pharmacy assistant.
Return ONLY valid JSON.
No markdown.
No explanations.
        `,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
Extract the prescription as JSON with:
{
  "medicines": [
    { "name": null, "strength": null, "frequency": null, "duration": null }
  ],
  "doctor": null,
  "date": null,
  "clinic": null,
  "warnings": []
}
            `,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
  });

  return safeJsonParse(response.choices[0].message.content);
};

module.exports = analyzePrescriptionImage;
