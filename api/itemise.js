// api/itemise.js
import { Buffer } from 'buffer';
import formidable from 'formidable';
import fs from 'fs/promises';
import sharp from 'sharp';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  /* ── 1. Parse multipart and grab the uploaded file ──────────── */
  const { files } = await new Promise((resolve, reject) =>
    formidable().parse(req, (err, _, files) =>
      err ? reject(err) : resolve({ files })
    )
  );
  const file = files.file;
  if (!file) return res.status(400).json({ error: 'no file field' });

  /* ── 2. Validate / convert to PNG ───────────────────────────── */
  const SUPPORTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  let imgBuffer;
  try {
    imgBuffer = await fs.readFile(file.filepath);

    // Convert unsupported types to PNG
    if (!SUPPORTED.includes(file.mimetype)) {
      imgBuffer = await sharp(imgBuffer).png().toBuffer();
    }
  } catch {
    return res.status(415).json({ error: 'unsupported image type' });
  }

  // Resize for cheaper token cost
  imgBuffer = await sharp(imgBuffer)
                .resize({ width: 1024 })
                .png()
                .toBuffer();
  const imgBase64 = imgBuffer.toString('base64');

  /* ── 3. Call GPT-4o vision ─────────────────────────────────── */
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            'You are an expense extractor. ' +
            'Return STRICT JSON WITHOUT MARKDOWN FENCING — ' +
            'array of objects {item, price} (price as number).'
        },
        {
          role: 'user',
          content: [
            { type: 'text',
              text: 'Extract the items and their prices from this receipt.' },
            { type: 'image_url',
              image_url: { url: `data:image/png;base64,${imgBase64}` } }
          ]
        }
      ]
    })
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    return res.status(500).json({
      error: 'OpenAI vision call failed',
      details: errText
    });
  }

  const data = await openaiRes.json();

  /* ── 4. Parse JSON (strip ``` fences if model slips) ────────── */
  let raw = data.choices?.[0]?.message?.content || '';
  raw = raw.replace(/```json|```/gi, '').trim();

  let items;
  try {
    items = JSON.parse(raw);
  } catch {
    return res.status(500).json({ error: 'bad JSON from model', raw });
  }

  /* ── 5. Success ─────────────────────────────────────────────── */
  return res.status(200).json({ items });
}
