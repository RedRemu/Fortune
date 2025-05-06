// api/itemise.js
import { Readable } from 'stream';
import { Buffer } from 'buffer';

export const config = { api: { bodyParser: false } };   // Vercel: don't pre-parse

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ---- 1. grab the file from the multipart body ----
  const boundary = req.headers['content-type']?.split('boundary=')[1];
  if (!boundary) return res.status(400).json({ error: 'no multipart boundary' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);

  // crude split — good enough for one <input type="file" name="file">
  const parts = raw.toString('binary').split(boundary);
  const filePart = parts.find(p => p.includes('Content-Disposition') && p.includes('filename='));
  if (!filePart) return res.status(400).json({ error: 'no file field' });

  const binary = filePart.split('\r\n\r\n')[1].split('\r\n--')[0];
  const imgBase64 = Buffer.from(binary, 'binary').toString('base64');

  // ---- 2. call OpenAI vision ----
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
            'Return STRICT JSON — array of objects {item, price} (price as number) — from the receipt.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the items and their prices from this receipt image.'
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imgBase64}` }
            }
          ]
        }
      ]
    })
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    return res.status(500).json({ error: 'OpenAI vision call failed', details: errText });
  }

  const data = await openaiRes.json();
  let items = [];
  try {
    items = JSON.parse(data.choices[0].message.content.trim());
  } catch (e) {
    return res.status(500).json({ error: 'Could not parse JSON', raw: data });
  }

  return res.status(200).json({ items });
}

