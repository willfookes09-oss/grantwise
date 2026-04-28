export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }

  try {
    const { rfp, mission, programs } = await req.json()

    if (!rfp) return new Response(JSON.stringify({ error: 'RFP is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const missionLine  = mission  ? `Organization mission: ${mission}`  : ''
    const programsLine = programs ? `Programs and track record: ${programs}` : ''

    const prompt = `You are an expert grant strategist with 20 years of experience evaluating whether nonprofits should apply for specific grants.

Analyze this grant RFP and determine if the organization should apply.

GRANT RFP / REQUIREMENTS:
${rfp}

${missionLine}
${programsLine}

Return ONLY a valid JSON object with this exact structure — no preamble, no explanation, just the JSON:
{
  "verdict": "APPLY" or "SKIP" or "UNCERTAIN",
  "win_chance": 0-100,
  "recommendation": "One specific sentence explaining your verdict",
  "dealbreakers": ["dealbreaker 1", "dealbreaker 2", "dealbreaker 3"],
  "requirements": ["key requirement 1", "key requirement 2", "key requirement 3"]
}

Rules:
- verdict must be exactly "APPLY", "SKIP", or "UNCERTAIN"
- win_chance must be a number 0-100
- dealbreakers are reasons they might lose or be ineligible
- requirements are the most important things the funder wants to see
- be specific and direct — no fluff
- if no mission/programs provided, base analysis on the RFP alone`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 800,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: err?.error?.message || 'API error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const data = await anthropicRes.json()
    return new Response(JSON.stringify({ content: [{ text: data.content?.[0]?.text || '{}' }] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}
