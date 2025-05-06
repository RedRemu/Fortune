// api/itemise.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // stub: ignore the file and return fake data so the UI works
  return res.status(200).json({
    items: [
      { item: 'Coffee',   price: 4.5 },
      { item: 'Sandwich', price: 8.25 }
    ]
  });
}

/* later:
   1. Parse the incoming file (use formidable / Vercel’s built-in form parsing).
   2. Run OCR (gpt-4o vision or an OCR API) → raw text.
   3. Pass text back to GPT: “return JSON array of {item, price}”.
   4. Return that JSON here instead of the stub.
*/

