// api/statement.js  – temporary stub so uploads stop 404-ing
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // TODO: parse PDF/CSV later – for now just echo success
  res.status(200).json({
    summary: { message: 'Statement received – parser coming soon.' }
  });
}
