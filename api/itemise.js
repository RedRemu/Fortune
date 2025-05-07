// api/itemise.js
import { Buffer } from 'buffer';
import formidable from 'formidable';
import fs from 'fs/promises';
import sharp from 'sharp';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  /* 1 ─ parse multipart form */
  const { files } = await new Promise((ok, bad) =>
    formidable().parse(req, (err, _, files) => err ? bad(err) : ok({ files }))
  );
  const file = files.file;
  if (!file) return res.status(400).json({ error: 'no file field' });

  /* 2 ─ validate / auto-convert */
  const SUPPORTED = ['image/png','image/jpeg','image/gif','image/webp'];
  let img = await fs.readFile(file.filepath);
  try {
    if (!SUPPORTED.includes(file.mimetype)) img = await sharp(img).png().toBuffer();
    img = await sharp(img).resize({ width: 1024 }).png().toBuffer();
  } catch {
    return res.status(415).json({ error: 'unsupported image type' });
  }
  const imgBase64 = img.toString('base64');

  /* 3 ─ GPT-4o vision */
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization:`Bearer ${process.env.OPENAI_API_KEY}`
    },
    body:JSON.stringify({
      model:'gpt-4o-mini',
      max_tokens:200,
      messages:[
        { role:'system',
          content:'You are an expense extractor. Return STRICT JSON WITHOUT MARKDOWN FENCING — array of {item, price}.'},
        { role:'user',
          content:[
            { type:'text', text:'Extract items and prices from this receipt.'},
            { type:'image_url', image_url:{ url:`data:image/png;base64,${imgBase64}`}}
          ]}
      ]
    })
  });

  if (!openaiRes.ok){
    const details = await openaiRes.text();
    return res.status(500).json({ error:'OpenAI vision call failed', details });
  }

  const data = await openaiRes.json();
  let raw = (data.choices?.[0]?.message?.content || '')
            .replace(/```json|```/gi,'').trim();

  let items;
  try { items = JSON.parse(raw); }
  catch { return res.status(500).json({ error:'bad JSON from model', raw }); }

  res.status(200).json({ items });
}
