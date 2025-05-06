// api/itemise.js – GPT‑4o vision handler with fencing fix + resize
import sharp from 'sharp';
import { Buffer } from 'buffer';

export const config = { api: { bodyParser: false } }; // Vercel: we’ll handle multipart

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ——— 1. Collect raw multipart body
  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) return res.status(400).json({ error: 'No multipart boundary' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('binary');

  const part = raw.split(boundary).find(p => p.includes('filename='));
  if (!part) return res.status(400).json({ error: 'No file field' });

  const binary = part.split('\r\n\r\n')[1].split('\r\n--')[0];
  let imgBuf = Buffer.from(binary, 'binary');

  // ——— 2. Auto‑resize & convert to PNG (saves tokens)
  try {
    imgBuf = await sharp(imgBuf).resize({ width: 1024 }).png().toBuffer();
  } catch (e) {
    return res.status(400).json({ error: 'Image conversion failed' });
  }
  const imgBase64 = imgBuf.toString('base64');

  // ——— 3. Call GPT‑4o‑mini vision endpoint
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
            'You are an expense extractor. Return STRICT JSON WITHOUT MARKDOWN FENCING — array of objects {item, price} with price as number — from the receipt.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the items and their prices from this receipt image.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imgBase64}` } }
          ]
        }
      ]
    })
  });

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return res.status(500).json({ error: 'OpenAI vision call failed', details: err });
  }

  const data = await openaiRes.json();

  // ——— 4. Strip any accidental ``` fences then JSON.parse
  let rawText = data.choices?.[0]?.message?.content?.trim() || '';
  rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

  let items = [];
  try {
    items = JSON.parse(rawText);
  } catch (e) {
    return res.status(500).json({ error: 'Could not parse JSON', raw: rawText });
  }

  return res.status(200).json({ items });
}
