export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { grantType, section, mission, funder, project, amount, orgName } = body

    if (!mission || !project) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const orgCtx  = orgName ? `Organization: ${orgName}.` : ''
    const funderLine = funder ? `Funder: ${funder}.` : ''
    const amountLine = amount ? `Amount requested: ${amount}.` : ''

    const prompt = `You are an expert nonprofit grant writer with 20 years of experience. Write a compelling "${section}" for a ${grantType} proposal.

${orgCtx}
Mission: ${mission}
${funderLine}
Project: ${project}
${amountLine}

Write only the "${section}" — no headings, no preamble. Polished, submission-ready text in 2-4 paragraphs. Be specific. Write in a warm, compelling, human voice that moves funders emotionally while making a strong logical case.`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'model: 'claude-sonnet-4-5',',
        max_tokens: 1200,
        stream: false,
        system: 'You are an expert nonprofit grant writer. Write professionally and compellingly. Avoid AI clichés: never use words like tapestry, delve, unleash, it is important to note, navigate, landscape, foster, unlock. Write like a seasoned human grant writer with real passion for the mission.',
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: err?.error?.message || 'API error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(anthropicRes.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}
