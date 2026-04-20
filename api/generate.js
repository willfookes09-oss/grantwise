export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

    const orgCtx   = orgName  ? `Organization name: ${orgName}.`      : ''
    const funderLine = funder ? `Funder and their stated priorities: ${funder}.` : ''
    const amountLine = amount ? `Dollar amount being requested: ${amount}.`      : ''

    const systemPrompt = `You are a veteran nonprofit grant writer who has won over $40 million in grants across 15 years. Your writing style is known for three things: (1) blunt, specific sentences with real numbers — never vague claims, (2) a quiet urgency that comes from facts, not adjectives, and (3) writing that sounds like a real human being wrote it at 11pm because they believe in the cause.

STRICT RULES — violate any of these and the proposal fails:
- NEVER use these words: transformative, empower, impactful, holistic, innovative, leverage, underserved, ecosystem, synergy, navigate, foster, unlock, tapestry, delve, vibrant, thriving, comprehensive, robust, dynamic
- - NEVER use em-dashes (—) under any circumstances. Use a period or rewrite the sentence instead. NO phrases like "it is important to note", "in light of this", "one must consider"
- NO opening with "We are pleased to", "Our organization is committed to", or any variation
- Every paragraph must contain at least one specific number, date, location, or named program
- Short sentences. Average sentence length under 18 words
- Write like you are talking to a smart person who has read 200 proposals today and is tired of fluff
- The writing should feel like it came from someone inside the organization, not a consultant

TONE EXAMPLE — this is the voice to use:
Bad: "Our transformative program empowers underserved youth to unlock their potential through holistic approaches."
Good: "Last year, 94 of our 102 graduates passed their GED on the first attempt. The state average is 61%."

That is the difference. Facts over adjectives. Always.`

    const userPrompt = `Write the "${section}" section for a ${grantType} grant proposal.

${orgCtx}
Mission: ${mission}
${funderLine}
Project description: ${project}
${amountLine}

Instructions:
- Write ONLY the "${section}" section — no heading, no preamble, no "here is your section"
- 2 to 3 paragraphs, each one punchy and specific
- Mirror the funder's language and priorities back to them if they were provided
- End with a sentence that makes the reader want to fund this — not a generic closer, something real
- Do not invent statistics. If the user gave you numbers, use them. If not, write around it without making things up.`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1200,
        stream: false,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: err?.error?.message || 'API error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await anthropicRes.json()
    const text = data.content?.[0]?.text || ''

    return new Response(JSON.stringify({ content: [{ text }] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}
