import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>Quality Standards | Shekhar Bandhu Aushadhalaya</title>
        <meta name="description" content="Learn about our GMP certified Ayurvedic manufacturing process, AYUSH standards compliance, and commitment to pure organic botanicals." />
        <link rel="icon" type="image/png" href="/logo.png" />
      </Head>

      <Header activeNav="about" />

      {/* Hero */}
      <section className="inner-page-hero" style={{ backgroundImage: "url('/neem_leaves.png')" }}>
        <h1 className="inner-page-title">Purity, Quality &amp; Scientific Ayurveda</h1>
        <p className="inner-page-subtitle">A premier Ayurvedic pharmaceutical manufacturer rooted in Varanasi's ancient healing tradition.</p>
      </section>

      {/* About content */}
      <section className="about-section">
        <div className="about-content">
          <span className="section-subtitle">Our Legacy</span>
          <h2 className="about-title">Crafted with Vedic Wisdom</h2>
          <p className="about-text">
            Shekhar Bandhu Aushadhalaya is a premier Ayurvedic pharmaceutical manufacturing company located in Varanasi. We are dedicated to providing classical formulations of the absolute highest standards of quality.
          </p>
          <p className="about-text">
            Our processes blend traditional Vedic methods (Snehapaka, Sandhana Kalpana) with state-of-the-art laboratory testing. Every batch undergoes stringent heavy-metal, microbial, and purity clearance before leaving our plant.
          </p>
          <p className="about-text">
            Our facility adheres to the Good Manufacturing Practices (GMP) as prescribed by the Ministry of AYUSH, Government of India. We source only organically cultivated herbs and botanicals, ensuring every formulation is pure, potent, and free from harmful adulterants.
          </p>

          <div className="stats-grid" style={{ marginTop: '2.5rem' }}>
            <div className="stat-item"><div className="stat-number">GMP</div><div className="stat-label">AYUSH Certified</div></div>
            <div className="stat-item"><div className="stat-number">100%</div><div className="stat-label">Organic Botanicals</div></div>
            <div className="stat-item"><div className="stat-number">B2B</div><div className="stat-label">Direct Bulk Rates</div></div>
            <div className="stat-item"><div className="stat-number">19+</div><div className="stat-label">Formulations</div></div>
          </div>
        </div>

        <div className="organic-visual-box" style={{ alignSelf: 'stretch', display: 'flex' }}>
          <img
            src="/our_legacy.png"
            alt="Traditional Ayurvedic herb preparation — mortar, pestle, and medicinal botanicals"
            style={{
              width: '100%',
              height: '100%',
              minHeight: '340px',
              objectFit: 'cover',
              borderRadius: '24px',
              boxShadow: '0 20px 50px rgba(176, 91, 76, 0.18)',
              display: 'block'
            }}
          />
        </div>
      </section>

      {/* Process Steps */}
      <section style={{ background: 'var(--bg-secondary)', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="section-header">
            <span className="section-subtitle">Our Process</span>
            <h2 className="section-title">From Root to Remedy</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
            {[
              { icon: '🌱', title: 'Herb Sourcing', desc: 'Only certified organic botanicals selected from GMP-approved suppliers across India.' },
              { icon: '🧪', title: 'Classical Processing', desc: 'Snehapaka, Sandhana Kalpana, and Taila-Paka methods preserve all active phyto-constituents.' },
              { icon: '🔬', title: 'Quality Testing', desc: 'Heavy-metal, microbial, TLC and potency tests on every batch before packaging.' },
              { icon: '📦', title: 'GMP Packaging', desc: 'Sealed, tamper-evident packaging in AYUSH-compliant sterile environment.' },
            ].map(step => (
              <div key={step.title} style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '2rem', textAlign: 'center', border: '1px solid var(--border-organic)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{step.icon}</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-primary)', fontWeight: 700, marginBottom: '0.5rem' }}>{step.title}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
