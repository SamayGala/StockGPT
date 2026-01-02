import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, Area } from 'recharts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

const API_BASE_URL = 'http://localhost:8000'

function App() {
  const navigate = useNavigate()
  const [indexes, setIndexes] = useState([])
  const [tickerStocks, setTickerStocks] = useState([])
  const [watchlist, setWatchlist] = useState([])
  const [zerodhaHoldings, setZerodhaHoldings] = useState([])
  const [zerodhaWatchlist, setZerodhaWatchlist] = useState([])
  const [portfolioSummary, setPortfolioSummary] = useState(null)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I'm Mr. Warren, your investment advisor specializing in Indian stock markets. I'm here to help you understand Indian stocks from a value investing perspective, just like Warren Buffett would. Ask me about any Indian stock listed on NSE or BSE, and I'll provide a thorough analysis focusing on the business fundamentals, management quality, intrinsic value, and valuation metrics specific to the Indian market context."
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const messagesEndRef = useRef(null)
  const tickerRef = useRef(null)

  useEffect(() => {
    fetchIndexes()
    fetchZerodhaHoldings() // This will update ticker with Zerodha holdings only
    fetchZerodhaWatchlist()
    fetchPortfolioSummary()
    
    const interval1 = setInterval(fetchIndexes, 10000)
    const interval2 = setInterval(fetchZerodhaHoldings, 30000) // Update ticker every 30 seconds
    const interval3 = setInterval(fetchZerodhaWatchlist, 30000) // Update watchlist every 30 seconds
    
    return () => {
      clearInterval(interval1)
      clearInterval(interval2)
      clearInterval(interval3)
    }
  }, [])

  // Load watchlist from localStorage
  useEffect(() => {
    const savedWatchlist = localStorage.getItem('watchlist')
    if (savedWatchlist) {
      setWatchlist(JSON.parse(savedWatchlist))
    }
  }, [])

  // Save watchlist to localStorage
  useEffect(() => {
    if (watchlist.length > 0) {
      localStorage.setItem('watchlist', JSON.stringify(watchlist))
    }
  }, [watchlist])

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
      if (response.data && response.data.indexes) {
        setIndexes(response.data.indexes)
      }
    } catch (error) {
      console.error('Error fetching indexes:', error)
    }
  }

  const fetchTickerStocks = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/stocks/ticker`)
      if (response.data && response.data.stocks) {
        setTickerStocks(response.data.stocks)
      }
    } catch (error) {
      console.error('Error fetching ticker stocks:', error)
    }
  }

  const fetchZerodhaHoldings = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/zerodha/holdings`)
      if (response.data && response.data.success) {
        const holdings = response.data.holdings || []
        setZerodhaHoldings(holdings)
        
        // Update portfolio summary from response
        if (response.data.totalValue !== undefined) {
          setPortfolioSummary({
            totalValue: response.data.totalValue,
            totalInvested: response.data.totalInvested,
            totalPnl: response.data.totalPnl
          })
        }
        
        // Update ticker stocks with holdings ONLY (no fallback)
        const tickerData = holdings.map(holding => ({
          symbol: `${holding.symbol}.NS`,
          name: holding.name,
          price: holding.currentPrice,
          change: holding.change,
          changePercent: holding.changePercent
        }))
        setTickerStocks(tickerData)
      } else {
        // If no holdings, set empty ticker
        setTickerStocks([])
      }
    } catch (error) {
      console.error('Error fetching Zerodha holdings:', error)
      // Set empty ticker on error - no fallback
      setTickerStocks([])
      setZerodhaHoldings([])
      setPortfolioSummary(null)
    }
  }

  const fetchZerodhaWatchlist = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/zerodha/watchlist`)
      if (response.data && response.data.success) {
        setZerodhaWatchlist(response.data.watchlist || [])
      }
    } catch (error) {
      console.error('Error fetching Zerodha watchlist:', error)
      if (error.response?.status !== 400) {
        console.error('Zerodha watchlist error:', error.message)
      }
    }
  }

  const fetchPortfolioSummary = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/zerodha/portfolio`)
      if (response.data && response.data.success) {
        setPortfolioSummary(response.data)
      }
    } catch (error) {
      console.error('Error fetching portfolio summary:', error)
      if (error.response?.status !== 400) {
        console.error('Portfolio summary error:', error.message)
      }
    }
  }

  const handleStockClick = (stock, e) => {
    // Always open in new tab
    e?.preventDefault()
    window.open(`/stock/${encodeURIComponent(stock.symbol)}`, '_blank')
  }

  const handleAddToWatchlist = (stock) => {
    if (!watchlist.find(s => s.symbol === stock.symbol)) {
      setWatchlist([...watchlist, stock])
    }
  }

  const handleRemoveFromWatchlist = (symbol) => {
    setWatchlist(watchlist.filter(s => s.symbol !== symbol))
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!inputMessage.trim() || isLoading) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setIsLoading(true)

    const newMessages = [...messages, { role: 'user', content: userMessage }]
    setMessages(newMessages)

    const assistantMessageId = newMessages.length
    setMessages([...newMessages, { role: 'assistant', content: '' }])

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          conversation_history: newMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      if (!response.body) {
        throw new Error('Response body is null')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedContent = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) {
            if (buffer.trim()) {
              const lines = buffer.split('\n')
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6))
                    if (data.content) {
                      accumulatedContent += data.content
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
              }
            }
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                
                if (data.error) {
                  throw new Error(data.error)
                }
                
                if (data.done) {
                  setIsLoading(false)
                  return
                }
                
                if (data.content) {
                  accumulatedContent += data.content
                  setMessages(prev => {
                    const updated = [...prev]
                    if (updated[assistantMessageId]) {
                      updated[assistantMessageId] = { 
                        role: 'assistant', 
                        content: accumulatedContent 
                      }
                    }
                    return updated
                  })
                }
              } catch (parseError) {
                if (parseError.message !== 'Unexpected end of JSON input') {
                  console.error('Error parsing SSE data:', parseError)
                }
              }
            }
          }
        }
      } finally {
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      setMessages(prev => {
        const updated = [...prev]
        if (updated[assistantMessageId]) {
          updated[assistantMessageId] = { 
            role: 'assistant', 
            content: `I apologize, but I'm having trouble processing your request right now. Error: ${error.message}. Please try again in a moment.` 
          }
        }
        return updated
      })
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

  const formatLargeNumber = (num) => {
    if (!num || num === 0) return '0'
    if (num >= 10000000) return (num / 10000000).toFixed(2) + ' Cr'
    if (num >= 100000) return (num / 100000).toFixed(2) + ' L'
    if (num >= 1000) return (num / 1000).toFixed(2) + ' K'
    return num.toFixed(2)
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
      {/* Ticker Tape with Stocks */}
      <div className="ticker-tape" ref={tickerRef}>
        <div className="ticker-content">
          {/* Indexes */}
          {indexes.map((index) => (
            <div key={index.symbol} className="ticker-item">
              <span className="ticker-symbol">{index.name}</span>
              <span className="ticker-price">{formatPrice(index.price)}</span>
              <span 
                className="ticker-change"
                style={{ color: getChangeColor(index.change) }}
              >
                {index.change >= 0 ? '+' : ''}{formatPrice(index.change)} ({index.change >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%)
              </span>
            </div>
          ))}
          {/* Stocks - Only Zerodha Holdings */}
          {tickerStocks && tickerStocks.length > 0 ? (
            tickerStocks.map((stock) => (
              <div 
                key={stock.symbol} 
                className="ticker-item ticker-stock"
                onClick={(e) => handleStockClick(stock, e)}
                style={{ cursor: 'pointer' }}
              >
                <span className="ticker-symbol">{stock.name}</span>
                <span className="ticker-price">₹{formatPrice(stock.price)}</span>
                <span 
                  className="ticker-change"
                  style={{ color: getChangeColor(stock.change) }}
                >
                  {stock.change >= 0 ? '+' : ''}₹{formatPrice(stock.change)} ({stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                </span>
              </div>
            ))
          ) : (
            <div className="ticker-item">
              <span className="ticker-symbol">Loading holdings...</span>
            </div>
          )}
          {/* Duplicate for seamless loop */}
          {indexes.map((index) => (
            <div key={`dup-${index.symbol}`} className="ticker-item">
              <span className="ticker-symbol">{index.name}</span>
              <span className="ticker-price">{formatPrice(index.price)}</span>
              <span 
                className="ticker-change"
                style={{ color: getChangeColor(index.change) }}
              >
                {index.change >= 0 ? '+' : ''}{formatPrice(index.change)} ({index.change >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%)
              </span>
            </div>
          ))}
          {tickerStocks && tickerStocks.length > 0 && tickerStocks.map((stock) => (
            <div 
              key={`dup-${stock.symbol}`} 
              className="ticker-item ticker-stock"
              onClick={(e) => handleStockClick(stock, e)}
              style={{ cursor: 'pointer' }}
            >
              <span className="ticker-symbol">{stock.name}</span>
              <span className="ticker-price">₹{formatPrice(stock.price)}</span>
              <span 
                className="ticker-change"
                style={{ color: getChangeColor(stock.change) }}
              >
                {stock.change >= 0 ? '+' : ''}₹{formatPrice(stock.change)} ({stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="app-container">
        <header className="app-header">
          <div className="header-left">
            <h1 className="app-logo">📈 StockGPT</h1>
            <span className="app-subtitle">Mr. Warren's Investment Advisor</span>
          </div>
          <div className="header-right">
            <nav className="main-nav">
              <button 
                className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                Dashboard
              </button>
              <button 
                className={`nav-tab ${activeTab === 'watchlist' ? 'active' : ''}`}
                onClick={() => setActiveTab('watchlist')}
              >
                Watchlist ({watchlist.length})
              </button>
              <button 
                className={`nav-tab ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                Chat with Mr. Warren
              </button>
            </nav>
            <button 
              className="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle dark mode"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <div className="main-content">
          {activeTab === 'watchlist' ? (
            <div className="watchlist-view">
              <h2 className="section-title-large">My Watchlist</h2>
              {watchlist.length === 0 ? (
                <div className="empty-watchlist">
                  <p>Your watchlist is empty. Click on any stock in the ticker to view details and add to watchlist.</p>
                </div>
              ) : (
                <div className="watchlist-grid">
                  {watchlist.map((stock) => (
                    <div 
                      key={stock.symbol} 
                      className="watchlist-card"
                      onClick={(e) => handleStockClick(stock, e)}
                    >
                      <div className="watchlist-card-header">
                        <h3>{stock.name || stock.symbol}</h3>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveFromWatchlist(stock.symbol)
                          }}
                          className="remove-watchlist-btn"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="watchlist-card-price">{formatPrice(stock.price)}</div>
                      <div 
                        className="watchlist-card-change"
                        style={{ color: getChangeColor(stock.change) }}
                      >
                        {stock.change >= 0 ? '+' : ''}{formatPrice(stock.change)} ({stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'dashboard' ? (
            <div className="dashboard-view">
              {/* Portfolio Summary - Always Visible */}
              {(portfolioSummary || zerodhaHoldings.length > 0) && (
                <div className="portfolio-summary-section">
                  <h2 className="section-title-large">Portfolio Summary</h2>
                  <div className="portfolio-summary">
                    {(() => {
                      // Calculate from holdings if portfolioSummary is not available
                      const totalValue = portfolioSummary?.totalValue || 
                        zerodhaHoldings.reduce((sum, h) => sum + (h.totalValue || 0), 0)
                      const totalInvested = portfolioSummary?.totalInvested || 
                        zerodhaHoldings.reduce((sum, h) => sum + (h.investedValue || 0), 0)
                      const totalPnl = portfolioSummary?.totalPnl || 
                        zerodhaHoldings.reduce((sum, h) => sum + (h.pnl || 0), 0)
                      const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
                      
                      return (
                        <>
                          <div className="summary-card">
                            <div className="summary-label">Total Value</div>
                            <div className="summary-value-large">₹{formatLargeNumber(totalValue)}</div>
                          </div>
                          <div className="summary-card">
                            <div className="summary-label">Total Invested</div>
                            <div className="summary-value-large">₹{formatLargeNumber(totalInvested)}</div>
                          </div>
                          <div className="summary-card">
                            <div className="summary-label">Total P&L</div>
                            <div 
                              className="summary-value-large"
                              style={{ color: totalPnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}
                            >
                              ₹{formatLargeNumber(totalPnl)}
                            </div>
                            <div 
                              className="summary-subvalue"
                              style={{ color: totalPnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}
                            >
                              {totalPnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}

              <div className="indexes-grid-detailed">
                {indexes.map((index) => (
                  <div key={index.symbol} className="index-card-detailed">
                    <div className="index-card-header">
                      <h3 className="index-name-large">{index.name}</h3>
                      <span 
                        className="index-change-badge-large"
                        style={{ 
                          backgroundColor: getChangeColor(index.change) + '20',
                          color: getChangeColor(index.change)
                        }}
                      >
                        {index.change >= 0 ? '↑' : '↓'} {Math.abs(index.changePercent).toFixed(2)}%
                      </span>
                    </div>
                    <div className="index-price-large">{formatPrice(index.price)}</div>
                    <div 
                      className="index-change-large"
                      style={{ color: getChangeColor(index.change) }}
                    >
                      {index.change >= 0 ? '+' : ''}{formatPrice(index.change)}
                    </div>
                    
                    {index.chartData && index.chartData.length > 0 ? (
                      <div className="index-chart-large">
                        <ResponsiveContainer width="100%" height={120}>
                          <AreaChart data={index.chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            <defs>
                              <linearGradient id={`gradient-${index.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={getChangeColor(index.change)} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={getChangeColor(index.change)} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area 
                              type="monotone" 
                              dataKey="value" 
                              stroke={getChangeColor(index.change)}
                              fill={`url(#gradient-${index.symbol})`}
                              strokeWidth={2}
                            />
                            <Tooltip content={<CustomTooltip />} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : index.price > 0 ? (
                      <div className="index-chart-placeholder">
                        <p>Chart data loading...</p>
                      </div>
                    ) : null}

                    <div className="index-metrics">
                      <div className="metric-item">
                        <span className="metric-label">52W High</span>
                        <span className="metric-value">-</span>
                      </div>
                      <div className="metric-item">
                        <span className="metric-label">52W Low</span>
                        <span className="metric-value">-</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Zerodha Holdings Section */}
              {zerodhaHoldings.length > 0 && (
                <div className="holdings-section">
                  <h2 className="section-title-large">My Holdings ({zerodhaHoldings.length})</h2>
                  <div className="holdings-grid">
                    {zerodhaHoldings.map((holding) => (
                      <div 
                        key={holding.symbol} 
                        className="holding-card"
                        onClick={(e) => handleStockClick({ symbol: `${holding.symbol}.NS`, name: holding.name }, e)}
                      >
                        <div className="holding-header">
                          <h3>{holding.name}</h3>
                          <span className="holding-quantity">{holding.quantity} shares</span>
                        </div>
                        <div className="holding-price">₹{formatPrice(holding.currentPrice)}</div>
                        <div className="holding-details">
                          <div className="holding-detail-item">
                            <span>Avg Price:</span>
                            <span>₹{formatPrice(holding.averagePrice)}</span>
                          </div>
                          <div className="holding-detail-item">
                            <span>Invested:</span>
                            <span>₹{formatLargeNumber(holding.investedValue)}</span>
                          </div>
                          <div className="holding-detail-item">
                            <span>Current Value:</span>
                            <span>₹{formatLargeNumber(holding.totalValue)}</span>
                          </div>
                          <div 
                            className="holding-detail-item holding-pnl"
                            style={{ color: holding.pnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}
                          >
                            <span>P&L:</span>
                            <span>₹{formatPrice(holding.pnl)} ({holding.pnlPercent >= 0 ? '+' : ''}{holding.pnlPercent.toFixed(2)}%)</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Zerodha Watchlist Section */}
              {zerodhaWatchlist.length > 0 && (
                <div className="zerodha-watchlist-section">
                  <h2 className="section-title-large">Zerodha Watchlist ({zerodhaWatchlist.length})</h2>
                  <div className="watchlist-grid">
                    {zerodhaWatchlist.map((stock) => (
                      <div 
                        key={stock.symbol} 
                        className="watchlist-card"
                        onClick={(e) => handleStockClick({ symbol: `${stock.symbol}.NS`, name: stock.name }, e)}
                      >
                        <div className="watchlist-card-header">
                          <h3>{stock.name || stock.symbol}</h3>
                        </div>
                        <div className="watchlist-card-price">₹{formatPrice(stock.price)}</div>
                        <div 
                          className="watchlist-card-change"
                          style={{ color: getChangeColor(stock.change) }}
                        >
                          {stock.change >= 0 ? '+' : ''}₹{formatPrice(stock.change)} ({stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="market-overview">
                <h2 className="section-title-large">Market Overview</h2>
                <div className="overview-stats">
                  <div className="stat-card">
                    <div className="stat-label">Total Market Cap</div>
                    <div className="stat-value">-</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Active Stocks</div>
                    <div className="stat-value">-</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Market Status</div>
                    <div className="stat-value">Live</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="chat-view">
              <div className="chat-panel-full">
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
          )}
        </div>
      </div>

    </div>
  )
}

export default App
