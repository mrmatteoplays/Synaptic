const NODES_KEY = 'synaptic_nodes'
const KEY_KEY = 'synaptic_api_key'
const STATS_KEY = 'synaptic_stats'

// Spaced repetition intervals in days
const SR_INTERVALS = [1, 3, 7, 14, 30, 90]

export function loadNodes() {
  try { return JSON.parse(localStorage.getItem(NODES_KEY) || '[]') } catch { return [] }
}
export function saveNodes(nodes) {
  try { localStorage.setItem(NODES_KEY, JSON.stringify(nodes)) } catch {}
}
export function loadApiKey() {
  return localStorage.getItem(KEY_KEY) || ''
}
export function saveApiKey(key) {
  localStorage.setItem(KEY_KEY, key)
}
export function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) || '{"totalReviews":0,"streak":0,"lastReview":null,"xpHistory":[]}')
  } catch { return { totalReviews: 0, streak: 0, lastReview: null, xpHistory: [] } }
}
export function saveStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)) } catch {}
}

export function createNode(question, result) {
  return {
    id: Date.now(),
    question,
    ...result,
    timestamp: new Date().toISOString(),
    // Spaced repetition
    srLevel: 0,
    nextReview: new Date(Date.now() + SR_INTERVALS[0] * 86400000).toISOString(),
    reviewCount: 0,
    lastScore: null,
  }
}

export function updateNodeAfterReview(node, score) {
  const passed = score >= 70
  const newLevel = passed ? Math.min(node.srLevel + 1, SR_INTERVALS.length - 1) : Math.max(node.srLevel - 1, 0)
  const daysUntilNext = SR_INTERVALS[newLevel]
  return {
    ...node,
    srLevel: newLevel,
    nextReview: new Date(Date.now() + daysUntilNext * 86400000).toISOString(),
    reviewCount: node.reviewCount + 1,
    lastScore: score,
  }
}

export function getDueNodes(nodes) {
  const now = new Date()
  return nodes.filter(n => new Date(n.nextReview) <= now)
}

export function getXpTotal(nodes) {
  return nodes.reduce((a, n) => a + (n.growth_score || 5), 0)
}

export function getLevel(xp) {
  return Math.floor(xp / 50) + 1
}

export function getCategoryColor(category) {
  const map = {
    Strategy:   '#6ee7f7',
    Technology: '#a78bfa',
    Business:   '#fbbf24',
    Science:    '#34d399',
    Philosophy: '#f472b6',
    Skills:     '#60a5fa',
    Psychology: '#fb923c',
    Finance:    '#4ade80',
    Other:      '#94a3b8',
  }
  return map[category] || '#94a3b8'
}

export const CATEGORIES = [
  'Strategy','Technology','Business','Science',
  'Philosophy','Skills','Psychology','Finance','Other'
]
