// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { messages = [], model = 'gpt-4o-mini' } = req.body || {};

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages }),
    });

    const data = await upstream.json();
    return res.status(upstream.ok ? 200 : 500).json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Upstream call failed' });
  }
}
