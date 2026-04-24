import { useState, useEffect, useRef } from 'react'
import { learnQuestion, generateQuiz, gradeAnswer } from './api.js'
import {
  loadNodes, saveNodes, loadApiKey, saveApiKey, loadStats, saveStats,
  createNode, updateNodeAfterReview, getDueNodes,
  getXpTotal, getLevel, getCategoryColor, CATEGORIES
} from './storage.js'

// ─── Tiny UI primitives ───────────────────────────────────────────────────────

function Spinner() {
  return <div style={{width:16,height:16,border:'2px solid #1e2d45',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin .7s linear infinite',flexShrink:0}}/>
}

function Badge({ color, children }) {
  return (
    <span style={{fontSize:11,fontWeight:600,letterSpacing:'.04em',padding:'3px 9px',borderRadius:20,background:color+'22',color,border:`1px solid ${color}44`}}>
      {children}
    </span>
  )
}

function GlowButton({ onClick, disabled, loading, children, variant = 'primary', style = {} }) {
  const colors = {
    primary: { bg: '#6ee7f722', border: 'var(--accent)', color: 'var(--accent)' },
    purple:  { bg: '#a78bfa22', border: 'var(--accent2)', color: 'var(--accent2)' },
    green:   { bg: '#34d39922', border: 'var(--accent3)', color: 'var(--accent3)' },
    ghost:   { bg: 'transparent', border: 'var(--border2)', color: 'var(--muted)' },
  }
  const c = colors[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display:'flex',alignItems:'center',justifyContent:'center',gap:8,
        background: disabled ? '#0c1220' : c.bg,
        border:`1px solid ${disabled ? 'var(--border)' : c.border}`,
        color: disabled ? 'var(--faint)' : c.color,
        padding:'10px 22px',borderRadius:10,fontSize:13,fontWeight:600,
        letterSpacing:'.04em',transition:'all .2s',cursor:disabled?'not-allowed':'pointer',
        ...style
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

// ─── Growth Chart ──────────────────────────────────────────────────────────────

function GrowthChart({ nodes }) {
  if (nodes.length === 0) return (
    <div style={{textAlign:'center',padding:'60px 0',color:'var(--faint)',fontSize:14}}>
      Ask your first question to start tracking growth.
    </div>
  )

  // Build daily XP accumulation
  const sorted = [...nodes].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp))
  const days = {}
  let cumXP = 0
  sorted.forEach(n => {
    const day = n.timestamp.slice(0,10)
    cumXP += (n.growth_score || 5)
    days[day] = cumXP
  })
  const points = Object.entries(days).map(([d,xp]) => ({ d, xp }))
  if (points.length === 1) points.unshift({ d: '', xp: 0 })

  const maxXP = Math.max(...points.map(p => p.xp))
  const W = 600, H = 180, PAD = 20
  const scaleX = i => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const scaleY = xp => H - PAD - ((xp / maxXP) * (H - PAD * 2))

  const pathD = points.map((p,i) => `${i===0?'M':'L'}${scaleX(i)},${scaleY(p.xp)}`).join(' ')
  const areaD = pathD + ` L${scaleX(points.length-1)},${H-PAD} L${scaleX(0)},${H-PAD} Z`

  // Category breakdown donut
  const catCounts = {}
  nodes.forEach(n => { catCounts[n.category] = (catCounts[n.category]||0) + 1 })
  const cats = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])
  const total = nodes.length
  let cumulativeAngle = -Math.PI / 2
  const donutSlices = cats.map(([cat, count]) => {
    const angle = (count / total) * Math.PI * 2
    const x1 = 60 + Math.cos(cumulativeAngle) * 50
    const y1 = 60 + Math.sin(cumulativeAngle) * 50
    cumulativeAngle += angle
    const x2 = 60 + Math.cos(cumulativeAngle) * 50
    const y2 = 60 + Math.sin(cumulativeAngle) * 50
    const large = angle > Math.PI ? 1 : 0
    return { cat, count, x1, y1, x2, y2, large, color: getCategoryColor(cat) }
  })

  return (
    <div style={{display:'flex',flexDirection:'column',gap:32}}>
      {/* XP Growth Line */}
      <div>
        <div style={{fontSize:12,fontWeight:600,letterSpacing:'.1em',color:'var(--muted)',marginBottom:12}}>XP GROWTH OVER TIME</div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:16,overflow:'hidden'}}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:'auto'}}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee7f7" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="#6ee7f7" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={areaD} fill="url(#areaGrad)"/>
            <path d={pathD} fill="none" stroke="#6ee7f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{strokeDasharray:1000,strokeDashoffset:1000,animation:'drawLine 1.5s ease forwards'}}/>
            {points.map((p,i) => (
              <circle key={i} cx={scaleX(i)} cy={scaleY(p.xp)} r="4" fill="#6ee7f7" stroke="var(--bg)" strokeWidth="2"/>
            ))}
            {points.map((p,i) => p.d && (
              <text key={i+'l'} x={scaleX(i)} y={H-4} textAnchor="middle" fontSize="9" fill="var(--faint)">
                {p.d.slice(5)}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Category Donut + Stats */}
      <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:24,alignItems:'center'}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,letterSpacing:'.1em',color:'var(--muted)',marginBottom:12}}>KNOWLEDGE MAP</div>
          <svg viewBox="0 0 120 120" width={140} height={140}>
            {donutSlices.map((s,i) => (
              <path key={i}
                d={`M60,60 L${s.x1},${s.y1} A50,50 0 ${s.large},1 ${s.x2},${s.y2} Z`}
                fill={s.color} opacity={0.85}
              />
            ))}
            <circle cx={60} cy={60} r={28} fill="var(--bg)"/>
            <text x={60} y={56} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--text)">{nodes.length}</text>
            <text x={60} y={70} textAnchor="middle" fontSize="8" fill="var(--muted)">NODES</text>
          </svg>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {cats.map(([cat,count]) => (
            <div key={cat} style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:getCategoryColor(cat),flexShrink:0}}/>
              <div style={{flex:1,height:6,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
                <div style={{width:`${(count/total)*100}%`,height:'100%',background:getCategoryColor(cat),borderRadius:3,transition:'width .6s ease'}}/>
              </div>
              <span style={{fontSize:12,color:'var(--muted)',width:20,textAlign:'right'}}>{count}</span>
              <span style={{fontSize:11,color:'var(--faint)',width:80}}>{cat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap-style streak */}
      <div>
        <div style={{fontSize:12,fontWeight:600,letterSpacing:'.1em',color:'var(--muted)',marginBottom:12}}>ACTIVITY — LAST 30 DAYS</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {Array.from({length:30},(_,i) => {
            const d = new Date(Date.now() - (29-i) * 86400000).toISOString().slice(0,10)
            const count = nodes.filter(n => n.timestamp.slice(0,10) === d).length
            const intensity = count === 0 ? 0 : count === 1 ? 0.3 : count <= 3 ? 0.6 : 1
            return (
              <div key={i} title={`${d}: ${count} nodes`} style={{
                width:16,height:16,borderRadius:3,
                background: intensity === 0 ? 'var(--border)' : `rgba(110,231,247,${intensity})`,
                transition:'background .3s'
              }}/>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Node Card ────────────────────────────────────────────────────────────────

function NodeCard({ node, expanded, onToggle, onReview }) {
  const color = getCategoryColor(node.category)
  const dueDate = new Date(node.nextReview)
  const isDue = dueDate <= new Date()
  const daysUntil = Math.ceil((dueDate - new Date()) / 86400000)

  return (
    <div style={{
      background:'var(--surface)',border:`1px solid ${expanded ? color+'60' : 'var(--border)'}`,
      borderRadius:12,overflow:'hidden',transition:'border-color .2s, box-shadow .2s',
      boxShadow: expanded ? `0 0 24px ${color}18` : 'none',
    }}>
      {/* Header - always visible */}
      <div
        onClick={onToggle}
        style={{padding:'16px 18px',cursor:'pointer',display:'flex',alignItems:'center',gap:12,userSelect:'none'}}
      >
        <div style={{width:10,height:10,borderRadius:'50%',background:color,flexShrink:0,boxShadow:`0 0 8px ${color}80`}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,fontSize:14,marginBottom:3}}>{node.concept}</div>
          <div style={{fontSize:12,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{node.question}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <Badge color={color}>{node.category}</Badge>
          {isDue
            ? <Badge color="var(--warn)">Review due</Badge>
            : <span style={{fontSize:11,color:'var(--faint)'}}>in {daysUntil}d</span>
          }
          <span style={{fontSize:12,color:'var(--faint)',fontFamily:'var(--mono)'}}>+{node.growth_score}</span>
          <div style={{color:'var(--faint)',fontSize:16,transform:expanded?'rotate(180deg)':'rotate(0)',transition:'transform .2s'}}>⌄</div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{padding:'0 18px 18px',animation:'fadeUp .3s ease'}}>
          <div style={{height:1,background:'var(--border)',marginBottom:16}}/>

          {/* Answer */}
          <p style={{fontSize:14,lineHeight:1.75,color:'#c8d3e0',marginBottom:14}}>{node.answer}</p>

          {/* Analogy */}
          {node.analogy && (
            <div style={{background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--accent2)',marginBottom:6}}>💡 ANALOGY</div>
              <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.65}}>{node.analogy}</p>
            </div>
          )}

          {/* Insight */}
          <div style={{borderLeft:`2px solid ${color}`,paddingLeft:14,marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color,marginBottom:4}}>⚡ KEY INSIGHT</div>
            <p style={{fontSize:13,color:'var(--text)',lineHeight:1.6}}>{node.insight}</p>
          </div>

          {/* Connections */}
          {node.connections?.length > 0 && (
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
              {node.connections.map((c,i) => (
                <span key={i} style={{fontSize:11,padding:'4px 10px',background:'var(--surface2)',border:'1px solid var(--border2)',borderRadius:20,color:'var(--muted)'}}>↗ {c}</span>
              ))}
            </div>
          )}

          {/* Review stats */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',gap:16}}>
              <span style={{fontSize:11,color:'var(--faint)'}}>Reviews: <span style={{color:'var(--muted)'}}>{node.reviewCount}</span></span>
              {node.lastScore && <span style={{fontSize:11,color:'var(--faint)'}}>Last score: <span style={{color: node.lastScore >= 70 ? 'var(--accent3)' : 'var(--warn)'}}>{node.lastScore}%</span></span>}
            </div>
            <GlowButton variant={isDue ? 'primary' : 'ghost'} onClick={()=>onReview(node)} style={{padding:'7px 16px',fontSize:12}}>
              {isDue ? '🧠 Review Now' : 'Practice'}
            </GlowButton>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Quiz Modal ───────────────────────────────────────────────────────────────

function QuizModal({ node, apiKey, onClose, onComplete }) {
  const [questions, setQuestions] = useState(null)
  const [qIndex, setQIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState('loading') // loading | quiz | grading | feedback | done

  useEffect(() => {
    generateQuiz(node, apiKey)
      .then(data => { setQuestions(data.questions); setPhase('quiz') })
      .catch(() => setPhase('error'))
  }, [])

  const handleSubmit = async () => {
    if (!answer.trim()) return
    setLoading(true)
    setPhase('grading')
    try {
      const q = questions[qIndex]
      const res = await gradeAnswer(q.q, answer, q.ideal, apiKey)
      setResult(res)
      setScores(prev => [...prev, res.score])
      setPhase('feedback')
    } catch { setPhase('error') }
    setLoading(false)
  }

  const handleNext = () => {
    if (qIndex + 1 >= questions.length) {
      const avg = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length)
      onComplete(avg)
    } else {
      setQIndex(i => i+1)
      setAnswer('')
      setResult(null)
      setPhase('quiz')
    }
  }

  const color = getCategoryColor(node.category)

  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(5,8,15,.9)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:16,padding:28,maxWidth:540,width:'100%',animation:'fadeUp .3s ease'}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color,marginBottom:4}}>🧠 ACTIVE RECALL</div>
            <div style={{fontWeight:700,fontSize:17}}>{node.concept}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--faint)',fontSize:20,lineHeight:1}}>×</button>
        </div>

        {phase === 'loading' && (
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--muted)'}}>
            <Spinner/> <span style={{marginLeft:10}}>Generating questions...</span>
          </div>
        )}

        {phase === 'error' && (
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--danger)'}}>Failed to generate quiz. Try again.</div>
        )}

        {(phase === 'quiz' || phase === 'grading') && questions && (
          <div>
            <div style={{fontSize:12,color:'var(--faint)',marginBottom:12}}>Question {qIndex+1} of {questions.length}</div>
            <div style={{background:'var(--surface2)',borderRadius:10,padding:'14px 16px',marginBottom:16,fontSize:14,lineHeight:1.65,color:'var(--text)'}}>
              {questions[qIndex].q}
            </div>
            <div style={{fontSize:11,color:'var(--faint)',marginBottom:8}}>Hint: {questions[qIndex].hint}</div>
            <textarea
              value={answer}
              onChange={e=>setAnswer(e.target.value)}
              placeholder="Type your answer in your own words..."
              autoFocus
              style={{width:'100%',minHeight:100,background:'var(--bg)',border:'1px solid var(--border2)',borderRadius:10,color:'var(--text)',fontSize:14,padding:'12px 14px',resize:'vertical',lineHeight:1.6,marginBottom:14,fontFamily:'var(--font)'}}
            />
            <GlowButton onClick={handleSubmit} loading={phase==='grading'} disabled={!answer.trim()} style={{width:'100%',padding:12}}>
              Submit Answer
            </GlowButton>
          </div>
        )}

        {phase === 'feedback' && result && (
          <div style={{animation:'fadeUp .3s ease'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
              <div style={{
                width:56,height:56,borderRadius:'50%',
                background: result.score>=70 ? '#34d39922' : '#fb923c22',
                border:`2px solid ${result.score>=70 ? 'var(--accent3)' : 'var(--warn)'}`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontWeight:800,fontSize:18,color:result.score>=70?'var(--accent3)':'var(--warn)'
              }}>{result.score}%</div>
              <div>
                <div style={{fontWeight:600,fontSize:14,marginBottom:3}}>{result.score>=70?'✓ Well done!':'Keep going!'}</div>
                <div style={{fontSize:13,color:'var(--muted)'}}>{result.feedback}</div>
              </div>
            </div>
            <div style={{background:'var(--surface2)',borderLeft:`2px solid ${color}`,padding:'10px 14px',borderRadius:'0 8px 8px 0',fontSize:13,color:'var(--text)',marginBottom:16}}>
              <strong style={{color}}>Remember: </strong>{result.reinforcement}
            </div>
            <GlowButton variant={result.score>=70?'green':'primary'} onClick={handleNext} style={{width:'100%',padding:12}}>
              {qIndex+1>=questions.length ? 'Finish Review' : 'Next Question →'}
            </GlowButton>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── API Key Screen ───────────────────────────────────────────────────────────

function ApiKeyScreen({ onSave }) {
  const [val, setVal] = useState('')
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'var(--bg)'}}>
      <div style={{maxWidth:440,width:'100%',animation:'fadeUp .5s ease'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontWeight:900,fontSize:40,letterSpacing:'-.03em',marginBottom:8}}>
            Synaptic
          </div>
          <div style={{color:'var(--muted)',fontSize:15,lineHeight:1.6}}>
            Your personal AI learning engine.<br/>Learn anything. Remember everything.
          </div>
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:28}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Anthropic API Key</div>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:14,lineHeight:1.6}}>
            Get a free key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}}>console.anthropic.com</a>. Stored only in your browser — never shared.
          </div>
          <input
            type="password"
            value={val}
            onChange={e=>setVal(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&val.trim()&&onSave(val.trim())}
            placeholder="sk-ant-api03-..."
            style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border2)',borderRadius:10,color:'var(--text)',fontFamily:'var(--mono)',fontSize:13,padding:'12px 14px',marginBottom:14}}
          />
          <GlowButton onClick={()=>val.trim()&&onSave(val.trim())} disabled={!val.trim()} style={{width:'100%',padding:13,fontSize:14}}>
            Enter Synaptic →
          </GlowButton>
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [nodes, setNodes] = useState([])
  const [apiKey, setApiKey] = useState('')
  const [view, setView] = useState('learn') // learn | nodes | review | growth
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeNode, setActiveNode] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [quizNode, setQuizNode] = useState(null)
  const [stats, setStats] = useState(loadStats())
  const [justLearned, setJustLearned] = useState(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    setNodes(loadNodes())
    const key = loadApiKey()
    setApiKey(key)
  }, [])

  const handleSaveKey = (key) => { saveApiKey(key); setApiKey(key) }

  const handleLearn = async () => {
    if (!question.trim() || loading) return
    setLoading(true)
    setError(null)
    setJustLearned(null)
    try {
      const result = await learnQuestion(question, nodes, apiKey)
      const node = createNode(question, result)
      const updated = [node, ...nodes]
      setNodes(updated)
      saveNodes(updated)
      setJustLearned(node)
      setExpandedId(node.id) // Keep it open!
      setQuestion('')
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const handleReviewComplete = (node, score) => {
    const updated = nodes.map(n => n.id === node.id ? updateNodeAfterReview(n, score) : n)
    setNodes(updated)
    saveNodes(updated)
    setQuizNode(null)
    // Update stats
    const newStats = { ...stats, totalReviews: stats.totalReviews + 1, lastReview: new Date().toISOString() }
    setStats(newStats)
    saveStats(newStats)
  }

  if (!apiKey) return <ApiKeyScreen onSave={handleSaveKey} />

  const xp = getXpTotal(nodes)
  const level = getLevel(xp)
  const xpInLevel = xp % 50
  const due = getDueNodes(nodes)

  const navItems = [
    { id:'learn', label:'Learn', icon:'⚡' },
    { id:'nodes', label:'Library', icon:'◈' },
    { id:'review', label:`Review${due.length>0?` (${due.length})`:''}`, icon:'🧠' },
    { id:'growth', label:'Growth', icon:'◎' },
  ]

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)'}}>
      {/* Background grain texture */}
      <div style={{position:'fixed',inset:0,backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.03\'/%3E%3C/svg%3E")',pointerEvents:'none',zIndex:0}}/>

      {/* Header */}
      <header style={{position:'sticky',top:0,zIndex:100,background:'rgba(5,8,15,.9)',backdropFilter:'blur(16px)',borderBottom:'1px solid var(--border)'}}>
        <div style={{maxWidth:860,margin:'0 auto',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:56}}>
          {/* Logo */}
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,var(--accent),var(--accent2))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,boxShadow:'0 0 16px #6ee7f740'}}>◈</div>
            <span style={{fontWeight:800,fontSize:16,letterSpacing:'-.02em'}}>Synaptic</span>
          </div>

          {/* XP bar */}
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:12,color:'var(--muted)'}}>Lvl <strong style={{color:'var(--accent)'}}>{level}</strong></span>
            <div style={{width:80,height:5,background:'var(--border)',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${(xpInLevel/50)*100}%`,background:'linear-gradient(90deg,var(--accent),var(--accent2))',borderRadius:3,transition:'width .5s ease'}}/>
            </div>
            <span style={{fontSize:11,color:'var(--faint)'}}>{xp} XP</span>
          </div>

          {/* Nav */}
          <nav style={{display:'flex',gap:2}}>
            {navItems.map(item => (
              <button key={item.id} onClick={()=>setView(item.id)} style={{
                background:'none',border:'none',padding:'6px 12px',borderRadius:8,
                fontSize:12,fontWeight:600,
                color: view===item.id ? 'var(--accent)' : 'var(--muted)',
                background: view===item.id ? 'var(--surface)' : 'transparent',
                transition:'all .2s',
              }}>{item.icon} {item.label}</button>
            ))}
            <button onClick={()=>handleSaveKey('')} style={{background:'none',border:'1px solid var(--border)',borderRadius:8,padding:'5px 10px',fontSize:11,color:'var(--faint)',marginLeft:4}}>⚙</button>
          </nav>
        </div>
      </header>

      <main style={{maxWidth:860,margin:'0 auto',padding:'32px 24px',position:'relative',zIndex:1}}>

        {/* ── LEARN ── */}
        {view==='learn' && (
          <div className="fade-up">
            {/* Hero */}
            <div style={{marginBottom:32,textAlign:'center'}}>
              <h1 style={{fontWeight:900,fontSize:'clamp(32px,5vw,52px)',lineHeight:1.05,letterSpacing:'-.03em',marginBottom:10}}>
                What will you<br/>
                <span style={{
                  background:'linear-gradient(135deg,var(--accent),var(--accent2))',
                  WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'
                }}>master today?</span>
              </h1>
              <p style={{color:'var(--muted)',fontSize:14}}>Ask anything. Synaptic answers, teaches, quizzes, and makes it stick.</p>
            </div>

            {/* Input */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:14,padding:20,marginBottom:24,boxShadow:'0 4px 32px rgba(0,0,0,.3)'}}>
              <textarea
                ref={textareaRef}
                value={question}
                onChange={e=>setQuestion(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))handleLearn()}}
                placeholder="How does compound interest work? What is TCP/IP? What makes a great startup pitch?"
                style={{width:'100%',minHeight:88,background:'transparent',border:'none',color:'var(--text)',fontSize:15,lineHeight:1.65,resize:'none',outline:'none',fontFamily:'var(--font)'}}
              />
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)'}}>
                <span style={{fontSize:11,color:'var(--faint)'}}>⌘/Ctrl + Enter</span>
                <GlowButton onClick={handleLearn} loading={loading} disabled={!question.trim()}>
                  {loading ? 'Thinking...' : 'Learn This →'}
                </GlowButton>
              </div>
            </div>

            {error && (
              <div style={{background:'#1a0808',border:'1px solid #f8717140',borderRadius:10,padding:'12px 16px',marginBottom:20,fontSize:13,color:'var(--danger)',lineHeight:1.6}}>
                ⚠ {error}
              </div>
            )}

            {/* Latest answer — stays open */}
            {justLearned && (
              <div className="fade-in" style={{background:'var(--surface)',border:'1px solid var(--border2)',borderRadius:14,padding:24,marginBottom:24,boxShadow:`0 0 40px ${getCategoryColor(justLearned.category)}18`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
                  <div>
                    <Badge color={getCategoryColor(justLearned.category)}>{justLearned.category}</Badge>
                    <div style={{fontWeight:800,fontSize:22,marginTop:8,letterSpacing:'-.01em'}}>{justLearned.concept}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:800,fontSize:24,color:'var(--accent)'}}>+{justLearned.growth_score}</div>
                    <div style={{fontSize:11,color:'var(--faint)'}}>XP</div>
                  </div>
                </div>

                <p style={{fontSize:14,lineHeight:1.8,color:'#c8d3e0',marginBottom:16}}>{justLearned.answer}</p>

                {justLearned.analogy && (
                  <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--accent2)',marginBottom:6}}>💡 THINK OF IT LIKE THIS</div>
                    <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.65}}>{justLearned.analogy}</p>
                  </div>
                )}

                <div style={{borderLeft:`2px solid ${getCategoryColor(justLearned.category)}`,paddingLeft:14,marginBottom:16}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:getCategoryColor(justLearned.category),marginBottom:4}}>⚡ REMEMBER THIS</div>
                  <p style={{fontSize:13,lineHeight:1.6}}>{justLearned.insight}</p>
                </div>

                {justLearned.connections?.length>0 && (
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
                    {justLearned.connections.map((c,i)=>(
                      <span key={i} style={{fontSize:11,padding:'4px 12px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:20,color:'var(--faint)'}}>↗ {c}</span>
                    ))}
                  </div>
                )}

                <div style={{paddingTop:14,borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:12,color:'var(--faint)'}}>Review scheduled in 1 day to lock it in 🔒</span>
                  <GlowButton variant="purple" onClick={()=>setQuizNode(justLearned)} style={{padding:'8px 18px',fontSize:12}}>
                    🧠 Quiz Me Now
                  </GlowButton>
                </div>
              </div>
            )}

            {/* Recent nodes */}
            {nodes.length > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--faint)',marginBottom:12}}>RECENTLY LEARNED</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {nodes.slice(0, justLearned ? 4 : 5).filter(n=>n.id!==justLearned?.id).slice(0,4).map(node=>(
                    <NodeCard
                      key={node.id}
                      node={node}
                      expanded={expandedId===node.id}
                      onToggle={()=>setExpandedId(expandedId===node.id?null:node.id)}
                      onReview={()=>setQuizNode(node)}
                    />
                  ))}
                </div>
              </div>
            )}

            {nodes.length===0 && !loading && (
              <div style={{textAlign:'center',padding:'48px 0',color:'var(--faint)'}}>
                <div style={{fontSize:40,marginBottom:12,opacity:.2}}>◈</div>
                <div style={{fontSize:14,lineHeight:1.8}}>Your knowledge library is empty.<br/>Ask your first question above.</div>
              </div>
            )}
          </div>
        )}

        {/* ── NODES LIBRARY ── */}
        {view==='nodes' && (
          <div className="fade-up">
            <div style={{marginBottom:24}}>
              <h2 style={{fontWeight:800,fontSize:26,letterSpacing:'-.02em',marginBottom:4}}>Knowledge Library</h2>
              <p style={{color:'var(--muted)',fontSize:13}}>{nodes.length} concepts learned · {xp} XP total</p>
            </div>

            {/* Category pills */}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
              {CATEGORIES.filter(c=>nodes.some(n=>n.category===c)).map(cat=>(
                <div key={cat} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',background:'var(--surface)',border:`1px solid ${getCategoryColor(cat)}40`,borderRadius:20,fontSize:12,fontWeight:600,color:getCategoryColor(cat)}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:getCategoryColor(cat)}}/>
                  {cat} <span style={{color:'var(--faint)',fontWeight:400}}>({nodes.filter(n=>n.category===cat).length})</span>
                </div>
              ))}
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {nodes.map(node=>(
                <NodeCard
                  key={node.id}
                  node={node}
                  expanded={expandedId===node.id}
                  onToggle={()=>setExpandedId(expandedId===node.id?null:node.id)}
                  onReview={()=>setQuizNode(node)}
                />
              ))}
            </div>

            {nodes.length===0 && (
              <div style={{textAlign:'center',padding:'60px 0',color:'var(--faint)',fontSize:14}}>
                No nodes yet. Start learning!
              </div>
            )}
          </div>
        )}

        {/* ── REVIEW ── */}
        {view==='review' && (
          <div className="fade-up">
            <div style={{marginBottom:24}}>
              <h2 style={{fontWeight:800,fontSize:26,letterSpacing:'-.02em',marginBottom:4}}>Spaced Review</h2>
              <p style={{color:'var(--muted)',fontSize:13}}>Science-backed repetition. Review at the right time to lock knowledge in permanently.</p>
            </div>

            {due.length > 0 ? (
              <>
                <div style={{background:'var(--surface)',border:'1px solid var(--warn)30',borderRadius:12,padding:'16px 20px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontWeight:700,color:'var(--warn)',marginBottom:2}}>{due.length} node{due.length>1?'s':''} due for review</div>
                    <div style={{fontSize:12,color:'var(--muted)'}}>Review now to keep them in long-term memory</div>
                  </div>
                  <GlowButton variant="primary" onClick={()=>setQuizNode(due[0])}>Start Review →</GlowButton>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {due.map(node=>(
                    <NodeCard key={node.id} node={node} expanded={expandedId===node.id}
                      onToggle={()=>setExpandedId(expandedId===node.id?null:node.id)}
                      onReview={()=>setQuizNode(node)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div style={{textAlign:'center',padding:'60px 0'}}>
                <div style={{fontSize:40,marginBottom:12}}>✓</div>
                <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>All caught up!</div>
                <div style={{color:'var(--muted)',fontSize:14}}>No reviews due. Come back later or practice any node from your library.</div>
              </div>
            )}

            {/* Upcoming */}
            {nodes.filter(n=>!due.includes(n)).length > 0 && (
              <div style={{marginTop:32}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--faint)',marginBottom:12}}>UPCOMING</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {nodes.filter(n=>!due.includes(n)).slice(0,5).map(node=>(
                    <NodeCard key={node.id} node={node} expanded={expandedId===node.id}
                      onToggle={()=>setExpandedId(expandedId===node.id?null:node.id)}
                      onReview={()=>setQuizNode(node)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── GROWTH ── */}
        {view==='growth' && (
          <div className="fade-up">
            <div style={{marginBottom:24}}>
              <h2 style={{fontWeight:800,fontSize:26,letterSpacing:'-.02em',marginBottom:4}}>Your Growth</h2>
              <p style={{color:'var(--muted)',fontSize:13}}>Every question asked. Every concept absorbed. Visualized.</p>
            </div>

            {/* Stats row */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:28}}>
              {[
                ['NODES','◈',nodes.length,'var(--accent)'],
                ['TOTAL XP','⚡',xp,'var(--accent2)'],
                ['LEVEL','◎',level,'var(--accent3)'],
                ['REVIEWS','🧠',stats.totalReviews,'var(--warn)'],
              ].map(([label,icon,val,color])=>(
                <div key={label} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 14px',textAlign:'center'}}>
                  <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
                  <div style={{fontWeight:800,fontSize:26,color,fontFamily:'var(--mono)'}}>{val}</div>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--faint)',marginTop:3}}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:24}}>
              <GrowthChart nodes={nodes}/>
            </div>
          </div>
        )}
      </main>

      {/* Quiz Modal */}
      {quizNode && (
        <QuizModal
          node={quizNode}
          apiKey={apiKey}
          onClose={()=>setQuizNode(null)}
          onComplete={(score)=>handleReviewComplete(quizNode,score)}
        />
      )}
    </div>
  )
}
