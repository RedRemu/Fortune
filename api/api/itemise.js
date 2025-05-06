// api/itemise.js
import formidable from 'formidable';
import fs from 'fs/promises';

export const config = { api: { bodyParser: false } };   // tell Vercel we’ll parse

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 1. Parse multipart form -> get the image file
  const { files } = await new Promise((resolve, reject) =>
    formidable().parse(req, (err, fields, files) =>
      err ? reject(err) : resolve({ fields, files })
    )
  );

  const file = files.file;
  if (!file) return res.status(400).json({ error: 'no file field' });

  // 2. Read file as base64 (data: URL not required)
  const imgData = await fs.readFile(file.filepath, { encoding: 'base64' });

  // 3. Call OpenAI GPT-4o vision
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',        // or full gpt-4o if you have access
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            'You are an expense extractor. ' +
            'Return STRICT JSON — array of objects {item, price} with price as number — from the receipt.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Here is a receipt image. Extract the items and their prices.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imgData}`
              }
            }
          ]
        }
      ]
    })
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    return res.status(500).json({ error: 'OpenAI failed', details: errText });
  }

  const data = await openaiRes.json();

  // 4. Parse GPT’s answer safely
  let items = [];
  try {
    items = JSON.parse(data.choices[0].message.content.trim());
  } catch (e) {
    return res.status(500).json({ error: 'Bad JSON from model', raw: data });
  }

  res.status(200).json({ items });
}
