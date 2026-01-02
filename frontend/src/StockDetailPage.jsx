import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, Area, BarChart, Bar } from 'recharts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './StockDetailPage.css'

const API_BASE_URL = 'http://localhost:8000'

function StockDetailPage() {
  const { symbol } = useParams()
  const navigate = useNavigate()
  const [stockData, setStockData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chartPeriod, setChartPeriod] = useState('1Y')
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchStockDetails()
  }, [symbol])

  const fetchStockDetails = async () => {
    setLoading(true)
    setError(null)
    try {
      // Clean symbol - remove .NS if present for API call, decode URL encoding
      const decodedSymbol = decodeURIComponent(symbol)
      const cleanSymbol = decodedSymbol.replace('.NS', '').replace('.BO', '')
      const response = await axios.get(`${API_BASE_URL}/api/stocks/${cleanSymbol}`)
      setStockData(response.data)
    } catch (err) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to load stock data'
      setError(errorMessage)
      console.error('Error fetching stock details:', err)
      console.error('Response:', err.response?.data)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price) => {
    if (!price || price === 0) return '0.00'
    return new Intl.NumberFormat('en-IN', {
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
      <div className="stock-detail-page">
        <div className="loading-container">
          <div className="loading-spinner">Loading stock details...</div>
        </div>
      </div>
    )
  }

  if (error || !stockData) {
    return (
      <div className="stock-detail-page">
        <div className="error-container">
          <h2>Error loading stock data</h2>
          <p>{error || 'Stock not found'}</p>
          <button onClick={() => navigate('/')} className="back-button">Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="stock-detail-page">
      {/* Header */}
      <header className="stock-page-header">
        <button onClick={() => navigate('/')} className="back-button">← Back</button>
        <div className="header-content">
          <div>
            <h1 className="stock-name-large">{stockData.name || stockData.symbol}</h1>
            <p className="stock-symbol-large">{stockData.symbol}</p>
            {stockData.sector && <p className="stock-sector-large">{stockData.sector} • {stockData.industry}</p>}
          </div>
          <div className="header-price-section">
            <div className="stock-price-extra-large">₹{formatPrice(stockData.price)}</div>
            <div 
              className="stock-change-extra-large"
              style={{ color: getChangeColor(stockData.change) }}
            >
              {stockData.change >= 0 ? '+' : ''}₹{formatPrice(stockData.change)} ({stockData.change >= 0 ? '+' : ''}{stockData.changePercent.toFixed(2)}%)
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="stock-detail-tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'financials' ? 'active' : ''}
          onClick={() => setActiveTab('financials')}
        >
          Financials
        </button>
        <button 
          className={activeTab === 'analysis' ? 'active' : ''}
          onClick={() => setActiveTab('analysis')}
        >
          Analysis
        </button>
        <button 
          className={activeTab === 'peers' ? 'active' : ''}
          onClick={() => setActiveTab('peers')}
        >
          Peer Comparison
        </button>
      </nav>

      <div className="stock-detail-content-wrapper">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="stock-detail-content">
            {/* Key Metrics Grid */}
            <section className="metrics-section">
              <h2 className="section-title">Key Metrics</h2>
              <div className="metrics-grid-large">
                <div className="metric-card-large">
                  <div className="metric-label">Market Cap</div>
                  <div className="metric-value-large">₹{formatLargeNumber(stockData.marketCap)}</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">P/E Ratio</div>
                  <div className="metric-value-large">{stockData.pe || 'N/A'}</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">P/B Ratio</div>
                  <div className="metric-value-large">{stockData.pb || 'N/A'}</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">Dividend Yield</div>
                  <div className="metric-value-large">{stockData.dividendYield.toFixed(2)}%</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">ROCE</div>
                  <div className="metric-value-large">{stockData.roce.toFixed(2)}%</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">ROE</div>
                  <div className="metric-value-large">{stockData.roe.toFixed(2)}%</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">Book Value</div>
                  <div className="metric-value-large">₹{formatPrice(stockData.bookValue)}</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">52W High</div>
                  <div className="metric-value-large">₹{formatPrice(stockData.high52w)}</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">52W Low</div>
                  <div className="metric-value-large">₹{formatPrice(stockData.low52w)}</div>
                </div>
                <div className="metric-card-large">
                  <div className="metric-label">Volume</div>
                  <div className="metric-value-large">{formatLargeNumber(stockData.volume)}</div>
                </div>
              </div>
            </section>

            {/* Price Chart */}
            {stockData.chartData && stockData.chartData.length > 0 && (
              <section className="chart-section-large">
                <div className="chart-header-large">
                  <h2 className="section-title">Price Chart</h2>
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
                <div className="chart-container-large">
                  <ResponsiveContainer width="100%" height={500}>
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
              </section>
            )}

            {/* Company Description */}
            {stockData.description && (
              <section className="description-section-large">
                <h2 className="section-title">About</h2>
                <div className="description-content">
                  <p>{stockData.description}</p>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Financials Tab */}
        {activeTab === 'financials' && (
          <div className="stock-detail-content">
            {stockData.quarterlyData && stockData.quarterlyData.length > 0 ? (
              <section className="financials-section">
                <h2 className="section-title">Quarterly Financials</h2>
                <div className="financials-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Quarter</th>
                        <th>Revenue</th>
                        <th>Net Income</th>
                        <th>EPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockData.quarterlyData.map((quarter, idx) => (
                        <tr key={idx}>
                          <td>{quarter.quarter}</td>
                          <td>₹{formatLargeNumber(quarter.revenue)}</td>
                          <td>₹{formatLargeNumber(quarter.netIncome)}</td>
                          <td>₹{formatPrice(quarter.eps)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <div className="no-data">Financial data not available</div>
            )}
          </div>
        )}

        {/* Analysis Tab */}
        {activeTab === 'analysis' && (
          <div className="stock-detail-content">
            <section className="pros-cons-section-large">
              <div className="pros-section-large">
                <h3>Pros</h3>
                <ul>
                  {stockData.pros && stockData.pros.length > 0 ? (
                    stockData.pros.map((pro, idx) => <li key={idx}>{pro}</li>)
                  ) : (
                    <li>Analysis pending... Ask Mr. Warren for detailed analysis.</li>
                  )}
                </ul>
              </div>
              <div className="cons-section-large">
                <h3>Cons</h3>
                <ul>
                  {stockData.cons && stockData.cons.length > 0 ? (
                    stockData.cons.map((con, idx) => <li key={idx}>{con}</li>)
                  ) : (
                    <li>Analysis pending... Ask Mr. Warren for detailed analysis.</li>
                  )}
                </ul>
              </div>
            </section>
          </div>
        )}

        {/* Peer Comparison Tab */}
        {activeTab === 'peers' && (
          <div className="stock-detail-content">
            <section className="peers-section">
              <h2 className="section-title">Peer Comparison</h2>
              <div className="no-data">Peer comparison data coming soon...</div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default StockDetailPage

