import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

const API_BASE_URL = 'http://localhost:8000'

function App() {
  const [indexes, setIndexes] = useState([])
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm Mr. Warren, your investment advisor. I'm here to help you understand stocks from a value investing perspective, just like Warren Buffett would. Ask me about any US or Indian stock, and I'll provide a thorough analysis focusing on the business fundamentals, management quality, intrinsic value, and valuation metrics."
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    fetchIndexes()
    const interval = setInterval(fetchIndexes, 10000) // Update every 10 seconds for real-time feel
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchIndexes = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/indexes`)
      setIndexes(response.data.indexes)
    } catch (error) {
      console.error('Error fetching indexes:', error)
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!inputMessage.trim() || isLoading) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setIsLoading(true)

    // Add user message to chat
    const newMessages = [...messages, { role: 'user', content: userMessage }]
    setMessages(newMessages)

    try {
      const response = await axios.post(`${API_BASE_URL}/api/chat`, {
        message: userMessage,
        conversation_history: newMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      })

      setMessages([...newMessages, { role: 'assistant', content: response.data.response }])
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: "I apologize, but I'm having trouble processing your request right now. Please try again in a moment." 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const formatPrice = (price) => {
    if (!price || price === 0) return '0.00'
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(price)
  }

  const getChangeColor = (change) => {
    if (change > 0) return 'var(--color-positive)'
    if (change < 0) return 'var(--color-negative)'
    return 'var(--color-neutral)'
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip">
          <p>{`${formatPrice(payload[0].value)}`}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      <div className="app-container">
        <header className="app-header">
          <div className="header-left">
            <h1 className="app-logo">StockGPT</h1>
            <span className="app-subtitle">Mr. Warren's Investment Advisor</span>
          </div>
          <button 
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </header>

        <div className="main-content">
          <div className="indexes-panel">
            <h2 className="panel-title">Market Indexes</h2>
            <div className="indexes-grid">
              {indexes.map((index) => (
                <div key={index.symbol} className="index-card">
                  <div className="index-header">
                    <h3 className="index-name">{index.name}</h3>
                    <span 
                      className="index-change-badge"
                      style={{ 
                        backgroundColor: getChangeColor(index.change) + '20',
                        color: getChangeColor(index.change)
                      }}
                    >
                      {index.change >= 0 ? '↑' : '↓'} {Math.abs(index.changePercent).toFixed(2)}%
                    </span>
                  </div>
                  <div className="index-price">{formatPrice(index.price)}</div>
                  <div 
                    className="index-change"
                    style={{ color: getChangeColor(index.change) }}
                  >
                    {index.change >= 0 ? '+' : ''}{formatPrice(index.change)}
                  </div>
                  
                  {index.chartData && index.chartData.length > 0 && (
                    <div className="index-chart">
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={index.chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke={getChangeColor(index.change)}
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                          />
                          <Tooltip content={<CustomTooltip />} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="chat-panel">
            <div className="chat-header">
              <div className="chat-title">
                <div className="avatar">👔</div>
                <div>
                  <h2>Mr. Warren</h2>
                  <p>Value Investing Advisor</p>
                </div>
              </div>
            </div>

            <div className="chat-messages">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="message-avatar">👔</div>
                  )}
                  <div className="message-content">
                    {message.role === 'assistant' ? (
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        className="markdown-content"
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="message-avatar">👔</div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-container" onSubmit={sendMessage}>
              <div className="chat-input-wrapper">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Ask Mr. Warren about any stock..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(e)
                    }
                  }}
                />
                <button
                  type="submit"
                  className="send-button"
                  disabled={isLoading || !inputMessage.trim()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
