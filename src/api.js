async function apiCall(messages, system, apiKey) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, apiKey })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  const text = (data.content || []).map(b => b.text || '').join('').trim()
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s === -1 || e === -1) throw new Error(`No JSON found: ${text.slice(0, 200)}`)
  return JSON.parse(text.slice(s, e + 1))
}

export async function learnQuestion(question, existingConcepts, apiKey) {
  const context = existingConcepts.length > 0
    ? `User already knows: ${existingConcepts.slice(-10).map(n => n.concept).join(', ')}.`
    : 'This is the user\'s first question.'

  const system = `You are Synaptic, an expert AI learning coach. ${context}
Return ONLY a JSON object, no markdown, no extra text.`

  const prompt = `Question: "${question}"

Return this exact JSON:
{"answer":"Clear 2-4 sentence answer that teaches the concept","concept":"Core concept in 4-6 words","category":"ONE OF: Strategy|Technology|Business|Science|Philosophy|Skills|Psychology|Finance|Other","insight":"One powerful actionable takeaway","analogy":"A vivid real-world analogy that makes this click","connections":["related concept 1","related concept 2","related concept 3"],"growth_score":8,"difficulty":"beginner"}`

  return apiCall([{ role: 'user', content: prompt }], system, apiKey)
}

export async function generateQuiz(node, apiKey) {
  const system = `You are Synaptic, an AI learning coach using active recall science. Return ONLY JSON, no markdown.`
  const prompt = `Generate a quiz for this concept:
Concept: "${node.concept}"
Answer: "${node.answer}"
Insight: "${node.insight}"

Return this exact JSON:
{"questions":[{"q":"First recall question testing understanding?","hint":"A subtle hint","ideal":"The ideal answer keywords"},{"q":"Second application question?","hint":"Another hint","ideal":"Ideal answer keywords"},{"q":"Third question testing deeper insight?","hint":"Hint","ideal":"Ideal answer"}]}`

  return apiCall([{ role: 'user', content: prompt }], system, apiKey)
}

export async function gradeAnswer(question, userAnswer, idealAnswer, apiKey) {
  const system = `You are Synaptic, grading recall answers. Be encouraging but honest. Return ONLY JSON.`
  const prompt = `Question: "${question}"
User's answer: "${userAnswer}"
Ideal answer keywords: "${idealAnswer}"

Grade this answer. Return:
{"score":75,"feedback":"Encouraging 1-2 sentence feedback","correct":false,"reinforcement":"One key thing to remember"}`

  return apiCall([{ role: 'user', content: prompt }], system, apiKey)
}
