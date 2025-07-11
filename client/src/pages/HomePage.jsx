import React from 'react';
import { Link } from 'react-router-dom';
import './homepage.css'; // Make sure this path is correct relative to HomePage.jsx
// Import Lucide React Icons for a modern look
import {
  ShieldCheck, Cpu, Layers, Users, TrendingUp, DollarSign,
  ArrowUp, ArrowDown, Star, Quote, CheckCircle, Lightbulb, TrendingDown
} from 'lucide-react';

// Investment plans data
const investmentPlans = [
  {
    name: 'Basic',
    description: 'Begin your crypto journey with minimal risk and expert guidance.',
    minimumInvestment: '$500',
    expectedReturns: '10% p.a.',
    duration: '15 Days',
    features: ['Diversified Portfolio', 'Weekly Market Insights', 'Email Support'],
    recommended: false,
    color: '#3498db' // Blue
  },
  {
    name: 'Gold',
    description: 'A balanced approach for steady long-term growth with smart automation.',
    minimumInvestment: '$5,000',
    expectedReturns: '15% p.a.',
    duration: '20 Days',
    features: ['AI-Powered Rebalancing', 'Priority Support', 'Tax Optimization Tools', 'Monthly Performance Reports'],
    recommended: true,
    color: '#2ecc71' // Green
  },
  {
    name: 'Platinum',
    description: 'Advanced strategies for experienced investors seeking higher yields.',
    minimumInvestment: '$25,000',
    expectedReturns: '30% p.a.',
    duration: '30 Days',
    features: ['Dedicated Wealth Advisor', 'Custom Portfolio Construction', 'Exclusive Market Access', 'Quarterly Strategy Sessions', 'VIP Support'],
    recommended: false,
    color: '#9b59b6' // Purple
  }
];

// Testimonials data
const testimonials = [
  {
    name: 'Sarah Johnson',
    role: 'Small Business Owner',
    image: 'https://placehold.co/64x64/A855F7/FFFFFF/png?text=SJ', // Dynamic placeholder
    quote: `I was hesitant about crypto investments, but CryptoWealth made it accessible and understandable. My portfolio has grown steadily for the past 8 months.`
  },
  {
    name: 'Michael Chen',
    role: 'Tech Professional',
    image: 'https://placehold.co/64x64/2ECC71/FFFFFF/png?text=MC', // Dynamic placeholder
    quote: "The Growth plan's AI rebalancing has consistently outperformed my previous self-managed investments. The tax optimization alone was worth the switch."
  },
  {
    name: 'Elena Rodriguez',
    role: 'Financial Analyst',
    image: 'https://placehold.co/64x64/3498DB/FFFFFF/png?text=ER', // Dynamic placeholder
    quote: "CryptoWealth's platform is the most sophisticated I've used. The tools are comprehensive and the returns have exceeded expectations."
  },
  {
    name: 'David Lee',
    role: 'Retired Engineer',
    image: 'https://placehold.co/64x64/E74C3C/FFFFFF/png?text=DL', // Dynamic placeholder
    quote: "As a retiree, capital preservation is key. CryptoWealth provided a secure and profitable way to diversify my retirement funds. Highly recommend!"
  }
];

const HomePage = () => {
  return (
    <div className="homepage">

      {/* Hero Section */}
      <section id="hero" className="hero-section">
        <div className="container hero-container">
          <div className="hero-content">
            <h1 className="hero-content-h1">
              CryptoWealth
            </h1>
            <p className="hero-description">
              Join thousands of satisfied 
              investors leveraging 
              our advanced platform for superior crypto returns
            </p>
            <div className="hero-cta">
              <Link to="/signup" className="btn btn-primary btn-large">
                Start Investing
              </Link>
            </div>
            <div className="hero-metrics">
              <div className="metric">
                <span className="metric-value">$2.1M+</span>
                <span className="metric-label">Assets Under Management</span>
              </div>
              <div className="metric">
                <span className="metric-value">5,000+</span>
                <span className="metric-label">Active Investors</span>
              </div>
              <div className="metric">
                <span className="metric-value">9.4%</span>
                <span className="metric-label">Avg. Annual Return</span>
              </div>
            </div>
          </div>
          {/* The hero-image div has been removed as the image is now a background in CSS */}
        </div>
      </section>

      {/* Market Section */}
      <section id="market" className="market-section">
        <div className="container">
          <h2 className="market-section-h2">Live Market Performance</h2>
          <p className="section-description">Real-time cryptocurrency prices from global exchanges</p>
          <div className="crypto-ticker">
            {cryptoData.map((crypto) => (
              <div className="crypto-card" key={crypto.symbol}>
                <div className="crypto-info">
                  <DollarSign className="lucide" />
                  <h3>{crypto.name}</h3>
                </div>
                <span className="crypto-symbol">{crypto.symbol}</span>
                <div className="crypto-price">
                  <span className="price-value">${crypto.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className={`price-change ${crypto.change >= 0 ? 'positive' : 'negative'}`}>
                    {crypto.change >= 0 ? <ArrowUp className="lucide" /> : <ArrowDown className="lucide" />}
                    {crypto.change >= 0 ? '+' : ''}{crypto.change}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="container">
          <h2 className="features-section-h2">Why Choose CryptoWealth</h2>
          <p className="section-description">
            Our platform combines innovative technology with financial expertise to deliver superior investment outcomes.
          </p>
          <div className="features-grid">
            {[
              {
                title: 'Enterprise-Grade Security',
                desc: 'Multi-signature cold storage, biometric authentication, and 256-bit encryption ensure your assets are always safe.',
                icon: <ShieldCheck className="lucide" />
              },
              {
                title: 'AI-Powered Portfolio Management',
                desc: 'Proprietary algorithms continuously analyze market conditions and rebalance your portfolio for optimal performance.',
                icon: <Cpu className="lucide" />
              },
              {
                title: 'Institutional Diversification',
                desc: 'Gain access to curated investment opportunities across a wide range of cryptocurrencies and DeFi protocols.',
                icon: <Layers className="lucide" />
              },
              {
                title: 'Expert Advisory Team',
                desc: 'Receive personalized guidance from certified financial advisors dedicated to helping you achieve your wealth goals.',
                icon: <Users className="lucide" />
              }
            ].map((feature, index) => (
              <div className="feature-card" key={index}>
                <div className="feature-icon">
                  {feature.icon}
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Investment Plans Section */}
      <section id="plans" className="plans-section">
        <div className="container">
          <h2 className="plans-section-h2">Professional Investment Plans</h2>
          <p className="section-description">
            Tailored strategies designed to meet your financial goals and risk tolerance.
          </p>
          <div className="plans-grid">
            {investmentPlans.map(plan => (
              <div
                className={`plan-card ${plan.recommended ? 'recommended' : ''}`}
                key={plan.name}
                style={{ borderTopColor: plan.color }}
              >
                {plan.recommended && (
                  <div className="recommended-badge">
                    Most Popular
                  </div>
                )}
                <h3 style={{ color: plan.color }}>{plan.name}</h3>
                <p className="plan-description">{plan.description}</p>
                <div className="plan-details">
                  <div className="plan-detail">
                    <span className="detail-label">Minimum Investment:</span>
                    <span className="detail-value">{plan.minimumInvestment}</span>
                  </div>
                  <div className="plan-detail">
                    <span className="detail-label">Expected Returns:</span>
                    <span className="detail-value" style={{ color: plan.color }}>{plan.expectedReturns}</span>
                  </div>
                  <div className="plan-detail">
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">{plan.duration}</span>
                  </div>
                </div>
                <ul className="plan-features">
                  {plan.features.map((feature, index) => (
                    <li key={index}>
                      <CheckCircle className="lucide" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/signup" className="btn btn-primary btn-block">
                  Get Started
                </Link>
              </div>
            ))}
          </div>
          <div className="plans-disclaimer">
            <p>
              Historical performance is not indicative of future results. Investment involves risk.
              Please read our risk disclosure documents before investing.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="testimonials-section">
        <div className="container">
          <h2 className="testimonials-section-h2">Client Success Stories</h2>
          <p className="section-description">
            Hear from investors who have transformed their financial future with CryptoWealth.
          </p>
          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <div className="testimonial-card" key={index}>
                <div className="testimonial-image">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/64x64/CCCCCC/333333/png?text=User"; }} // Fallback image
                  />
                </div>
                <Quote className="lucide" />
                <blockquote>"{testimonial.quote}"</blockquote>
                <div className="testimonial-author">
                  <strong>{testimonial.name}</strong>
                  <span>{testimonial.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="cta-section">
        <div className="container">
          <h2 className="cta-section-h2">Ready to Grow Your Wealth?</h2>
          <p className="cta-section-p">
            Join thousands of satisfied investors leveraging our advanced platform for superior crypto returns.
          </p>
          <Link to="/signup" className="btn btn-primary btn-large">
            Get Started Today
          </Link>
        </div>
      </section>

    </div>
  );
};

export default HomePage;
