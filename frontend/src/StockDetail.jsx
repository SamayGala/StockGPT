import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, Area } from 'recharts'
import './StockDetail.css'

const API_BASE_URL = 'http://localhost:8000'

function StockDetail({ symbol, onClose, onAddToWatchlist }) {
  const [stockData, setStockData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('1Y')

  useEffect(() => {
    fetchStockDetails()
  }, [symbol])

  const fetchStockDetails = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_BASE_URL}/api/stocks/${symbol}`)
      setStockData(response.data)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching stock details:', err)
    } finally {
      setLoading(false)
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

  if (loading) {
    return (
      <div className="stock-detail-overlay">
        <div className="stock-detail-container">
          <div className="loading-spinner">Loading...</div>
        </div>
      </div>
    )
  }

  if (error || !stockData) {
    return (
      <div className="stock-detail-overlay">
        <div className="stock-detail-container">
          <div className="error-message">Error loading stock data: {error}</div>
          <button onClick={onClose} className="close-button">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="stock-detail-overlay" onClick={onClose}>
      <div className="stock-detail-container" onClick={(e) => e.stopPropagation()}>
        <div className="stock-detail-header">
          <div className="stock-header-info">
            <h1 className="stock-name">{stockData.name}</h1>
            <p className="stock-symbol">{stockData.symbol}</p>
            <p className="stock-sector">{stockData.sector} • {stockData.industry}</p>
          </div>
          <div className="stock-header-price">
            <div className="stock-price-large">{formatPrice(stockData.price)}</div>
            <div 
              className="stock-change-large"
              style={{ color: getChangeColor(stockData.change) }}
            >
              {stockData.change >= 0 ? '+' : ''}{formatPrice(stockData.change)} ({stockData.change >= 0 ? '+' : ''}{stockData.changePercent.toFixed(2)}%)
            </div>
          </div>
          <div className="stock-header-actions">
            <button onClick={() => onAddToWatchlist(stockData)} className="watchlist-button">
              ⭐ Add to Watchlist
            </button>
            <button onClick={onClose} className="close-button">✕</button>
          </div>
        </div>

        <div className="stock-detail-content">
          {/* Key Metrics */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Market Cap</div>
              <div className="metric-value">{formatLargeNumber(stockData.marketCap)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">P/E Ratio</div>
              <div className="metric-value">{stockData.pe || 'N/A'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">P/B Ratio</div>
              <div className="metric-value">{stockData.pb || 'N/A'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Dividend Yield</div>
              <div className="metric-value">{stockData.dividendYield.toFixed(2)}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">ROCE</div>
              <div className="metric-value">{stockData.roce.toFixed(2)}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">ROE</div>
              <div className="metric-value">{stockData.roe.toFixed(2)}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Book Value</div>
              <div className="metric-value">{formatPrice(stockData.bookValue)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">52W High</div>
              <div className="metric-value">{formatPrice(stockData.high52w)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">52W Low</div>
              <div className="metric-value">{formatPrice(stockData.low52w)}</div>
            </div>
          </div>

          {/* Chart */}
          {stockData.chartData && stockData.chartData.length > 0 && (
            <div className="chart-section">
              <div className="chart-header">
                <h2>Price Chart</h2>
                <div className="chart-periods">
                  {['1M', '3M', '6M', '1Y', 'All'].map(period => (
                    <button
                      key={period}
                      className={chartPeriod === period ? 'active' : ''}
                      onClick={() => setChartPeriod(period)}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={stockData.chartData}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getChangeColor(stockData.change)} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={getChangeColor(stockData.change)} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke={getChangeColor(stockData.change)}
                      fill="url(#priceGradient)"
                      strokeWidth={2}
                    />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Company Description */}
          {stockData.description && (
            <div className="description-section">
              <h2>About</h2>
              <p>{stockData.description}</p>
            </div>
          )}

          {/* Pros and Cons */}
          <div className="pros-cons-section">
            <div className="pros-section">
              <h3>Pros</h3>
              <ul>
                {stockData.pros && stockData.pros.length > 0 ? (
                  stockData.pros.map((pro, idx) => <li key={idx}>{pro}</li>)
                ) : (
                  <li>Analysis pending...</li>
                )}
              </ul>
            </div>
            <div className="cons-section">
              <h3>Cons</h3>
              <ul>
                {stockData.cons && stockData.cons.length > 0 ? (
                  stockData.cons.map((con, idx) => <li key={idx}>{con}</li>)
                ) : (
                  <li>Analysis pending...</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StockDetail

