import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import DoshaConsultationQuiz from '../components/DoshaConsultationQuiz';
import ProductCard from '../components/ProductCard';
import EnquiryForm from '../components/EnquiryForm';
import { fetchProducts, mapProduct, API_BASE } from '../lib/products';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';

export async function getServerSideProps() {
  try {
    const products = await fetchProducts();
    return { props: { products } };
  } catch {
    return { props: { products: [] } };
  }
}

const testimonials = [
  {
    initials: 'RM',
    name: 'Dr. R. K. Mishra',
    role: 'Lead Ayurvedic Consultant, Varanasi Clinic',
    quote: '"We have been sourcing Asava and Arishta formulations from Shekhar Bandhu Aushadhalaya for over two years. The therapeutic efficacy is remarkable, and their packaging standard is impeccable."'
  },
  {
    initials: 'SA',
    name: 'Sharma Ayurvedic Stores',
    role: 'Bulk Distributor, Lucknow',
    quote: '"Their direct-factory B2B pricing and shipping synchronization makes inventory tracking extremely simple. The liver tonics and medicated taila are highly appreciated by our local customers."'
  },
  {
    initials: 'AI',
    name: 'Dr. Ananya Iyer',
    role: 'Chief Physician, AyurHealth Center',
    quote: '"The purity of their classical formulations like Dashmularishta and Saraswatarishta matches the ancient scriptures exactly. A highly reliable source for clean, zero-adulteration medicines."'
  },
  {
    initials: 'PP',
    name: 'Patel Pharma House',
    role: 'Logistics & Procurement Manager',
    quote: '"As a wholesale distributor, consistency in supply is our requirement. Shekhar Bandhu has consistently delivered bulk orders on schedule with detailed batch lab reports."'
  },
  {
    initials: 'AW',
    name: 'Arogya Wellness Hub',
    role: 'Co-founder & Sourcing Head',
    quote: '"The custom labeling and packaging options allowed us to launch our branded classical formulations smoothly. Excellent customer support and professional quality standards."'
  }
];

export default function Home({ products: initialProducts }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState(initialProducts || []);
  const [quizOpen, setQuizOpen] = useState(false);

  const {
    cart,
    cartCount,
    cartTotal,
    cartOpen,
    setCartOpen,
    checkoutOpen,
    setCheckoutOpen,
    addToCart,
    updateQty,
    removeItem,
    clearCart,
  } = useCart();

  useEffect(() => {
    async function refreshProducts() {
      try {
        const res = await fetch(`${API_BASE}/api/public/products`);
        if (res.ok) {
          const data = await res.json();
          setProducts(data.map(mapProduct));
        }
      } catch (err) {
        console.error('Failed to refresh real-time products', err);
      }
    }
    refreshProducts();
  }, []);

  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const limit = isDesktop ? 3 : 1;
  const maxIndex = testimonials.length - limit;

  useEffect(() => {
    if (activeTestimonial > maxIndex) {
      setActiveTestimonial(maxIndex);
    }
  }, [maxIndex, activeTestimonial]);

  const handlePrevTestimonial = () => {
    setActiveTestimonial(prev => (prev === 0 ? maxIndex : prev - 1));
  };
  const handleNextTestimonial = () => {
    setActiveTestimonial(prev => (prev >= maxIndex ? 0 : prev + 1));
  };

  // Checkout Form States
  const [orderName, setOrderName] = useState('');
  const [orderEmail, setOrderEmail] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!orderName || !orderEmail || !orderPhone || !orderAddress) {
      showToast('Please fill in all checkout fields', 'warning');
      return;
    }
    setSubmittingOrder(true);
    try {
      const formattedItems = cart.map(item => {
        const hasPromo = item.websitePromoActive && item.discount > 0;
        const finalPrice = hasPromo
          ? Number((item.price * (1 - item.discount / 100)).toFixed(2))
          : item.price;
        return {
          productId: item._id,
          name: item.name,
          qty: item.qty,
          price: finalPrice
        };
      });

      const res = await fetch(`${API_BASE}/api/orders/public/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orderName,
          email: orderEmail,
          phone: orderPhone,
          shippingAddress: orderAddress,
          items: formattedItems
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create order. Please try again.');
      }
      const data = await res.json();
      setOrderSuccess(data.order);
      clearCart();
      setOrderName('');
      setOrderEmail('');
      setOrderPhone('');
      setOrderAddress('');
      showToast('Order placed successfully!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Variant size grouping logic for Home Page products
  const groupProducts = (productList) => {
    const map = {};
    productList.forEach(p => {
      const nameKey = p.name.toUpperCase().trim();
      if (!map[nameKey]) {
        map[nameKey] = {
          name: p.name,
          category: p.category,
          description: p.description,
          benefits: p.benefits,
          materials: p.materials,
          usageDetails: p.usageDetails,
          emoji: p.emoji,
          rating: p.rating,
          ratingCount: p.ratingCount,
          variants: []
        };
      }
      map[nameKey].variants.push(p);
    });

    return Object.values(map).map(gp => {
      gp.variants.sort((a, b) => a.price - b.price);
      const defaultVariant = gp.variants.find(v => v.stockLevel > 0) || gp.variants[0];
      return {
        ...gp,
        ...defaultVariant,
        variants: gp.variants
      };
    });
  };

  const groupedProducts = groupProducts(products);

  // Filter promo/discounted items
  const promoProducts = groupedProducts.filter(p => p.websitePromoActive && p.discount > 0);
  // Curate popular items
  const popularProducts = groupedProducts.slice(0, 4);

  const categories = [
    { name: 'Asava & Arishta', emoji: '🍶', label: 'Fermented Liquids', desc: 'Self-fermented classical liquid preparations', color: '#EBF5FF' },
    { name: 'Syrups', emoji: '🧪', label: 'Concentrated Syrups', desc: 'Fast assimilating liver & tonics', color: '#ECFDF5' },
    { name: 'Medicated Oils', emoji: '🧴', label: 'Ayurvedic Taila', desc: 'Traditional joint relief oils', color: '#FEF3C7' },
    { name: 'Vati & Guggulu', emoji: '💊', label: 'Herbal Tablets', desc: 'Purified therapeutic pills', color: '#FEE2E2' },
  ];

  return (
    <>
      <Head>
        <title>Shekhar Bandhu Aushadhalaya | Classical Ayurvedic E-Commerce Store</title>
        <meta name="description" content="Authentic Ayurvedic medicines B2B storefront. Shop self-fermented liquids, syrups, medicated oils, and rejuvenating vati at direct factory pricing. Varanasi." />
        <link rel="icon" type="image/png" href="/logo.png" />
      </Head>

      <Header activeNav="home" startQuiz={() => setQuizOpen(true)} />

      {/* Hero Section */}
      <section id="home" className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            🌿 factory wholesales • GMP certified • varanasi
          </div>
          <h1 className="hero-title">
            Premium <span>Ayurvedic Pharmacy</span> &amp; Direct Sourcing
          </h1>
          <p className="hero-subtitle">
            Order classical Asava, Arishta, Medicated Oils, Avaleha, and Tonics formulated from pure organic herbs directly to your clinic or wholesale depot.
          </p>
          <div className="hero-actions">
            <Link href="/shop" className="btn btn-primary" style={{ backgroundColor: '#ffffff', color: 'var(--brand-primary)', borderRadius: '9999px', padding: '0.85rem 2.5rem', fontWeight: '700', fontSize: '0.98rem', textDecoration: 'none' }}>
              Browse Catalog 🛍️
            </Link>
            <button onClick={() => setQuizOpen(true)} className="btn" style={{ backgroundColor: 'transparent', border: '2px solid #ffffff', color: '#ffffff', borderRadius: '9999px', padding: '0.85rem 2.5rem', fontWeight: '700', fontSize: '0.98rem', cursor: 'pointer' }}>
              Dosha Consultation 🌿
            </button>
          </div>
        </div>
      </section>

      {/* Features Ribbon */}
      <section className="features-ribbon">
        <div className="features-grid">
          <div className="feature-item">
            <div className="feature-icon-wrapper">🧪</div>
            <div>
              <h3 className="feature-title">Pure Extracted Decoctions</h3>
              <p className="feature-desc">Processed using traditional heating vessels to capture 100% active plant components.</p>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon-wrapper">🌿</div>
            <div>
              <h3 className="feature-title">GMP Certified Facility</h3>
              <p className="feature-desc">Manufactured in hygienic environment adhering to Ministry of AYUSH standards.</p>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon-wrapper">📦</div>
            <div>
              <h3 className="feature-title">Wholesale B2B Supply</h3>
              <p className="feature-desc">Specialized pricing and fast logistics support for pharmacies and clinics.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Showcase */}
      <section style={{ padding: '5rem 2rem', backgroundColor: 'var(--bg-page)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.0rem' }}>
            <span style={{ color: 'var(--brand-primary-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.8rem' }}>Browse Formulations</span>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--brand-primary)', fontSize: '2.3rem', fontWeight: 800 }}>Product Categories</h2>
          </div>
          
          <div className="categories-container">
            {categories.map((cat) => (
              <Link href={`/shop?category=${encodeURIComponent(cat.name)}`} key={cat.name} style={{ textDecoration: 'none' }}>
                <div className="category-card">
                  <div className="category-circle" style={{ backgroundColor: cat.color }}>
                    {cat.emoji}
                  </div>
                  <h3 className="category-title">{cat.name}</h3>
                  <span className="category-label">{cat.label}</span>
                  <p className="category-desc">{cat.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Dynamic Deals and Offers (CRM synced) */}
      {promoProducts.length > 0 && (
        <section style={{ padding: '5rem 2rem', backgroundColor: '#FDF7EB', borderTop: '1px solid rgba(156,42,14,0.05)', borderBottom: '1px solid rgba(156,42,14,0.05)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
              <span style={{ color: 'var(--brand-primary-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.8rem' }}>🔥Exclusive Deals</span>
              <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--brand-primary)', fontSize: '2.5rem', fontWeight: 800 }}>Special Promotional Offers</h2>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.5rem' }}>
              {promoProducts.map(prod => (
                <ProductCard
                  key={prod._id}
                  product={prod}
                  onAddToCart={addToCart}
                  apiBaseUrl={API_BASE}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured/Best Sellers Catalog */}
      <section style={{ padding: '5rem 2rem', backgroundColor: '#FFFDF9' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <span style={{ color: 'var(--accent-gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.8rem' }}>Highly Recommended</span>
            <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--brand-primary)', fontSize: '2.5rem', fontWeight: 800 }}>Best Seller Formulations</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.5rem' }}>
            {popularProducts.map(prod => (
              <ProductCard
                key={prod._id}
                product={prod}
                onAddToCart={addToCart}
                apiBaseUrl={API_BASE}
              />
            ))}
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <Link href="/shop" className="btn btn-secondary">View Complete Shop Catalog ➔</Link>
          </div>
        </div>
      </section>

      {/* Trust & Testimonial Section */}
      <section style={{ padding: '6rem 2rem', backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-organic)' }}>
        <div style={{ maxWidth: '1136px', margin: '0 auto', textAlign: 'center' }}>
          <span style={{ color: 'var(--brand-primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.8rem', display: 'block', marginBottom: '0.75rem' }}>Client Endorsements</span>
          <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-dark)', fontSize: '2.5rem', fontWeight: 800, marginBottom: '3.5rem' }}>Trusted by Doctors &amp; Pharmacies</h2>
          
          {/* Slider Container */}
          <div style={{ position: 'relative', overflow: 'hidden', padding: '1rem 0' }}>
            <div 
              className="testimonials-track" 
              style={{ 
                transform: `translateX(calc(-1 * ${activeTestimonial} * var(--slide-width-with-gap)))` 
              }}
            >
              {testimonials.map((t, idx) => (
                <div key={idx} className="testimonial-slide">
                  <div className="testimonial-card" style={{ 
                    backgroundColor: 'var(--bg-primary)', 
                    borderRadius: '24px', 
                    padding: '3rem', 
                    boxShadow: 'var(--shadow-md)', 
                    textAlign: 'left', 
                    border: '1px solid var(--border-organic)',
                    position: 'relative',
                    minHeight: '260px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%'
                  }}>
                    <span style={{ position: 'absolute', top: '15px', right: '30px', fontSize: '6rem', color: 'rgba(176, 91, 76, 0.08)', fontFamily: 'serif', lineHeight: 1, pointerEvents: 'none' }}>”</span>
                    
                    <p style={{ fontSize: '1.05rem', color: 'var(--text-dark)', lineHeight: '1.8', fontStyle: 'italic', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
                      {t.quote}
                    </p>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '1px solid rgba(176, 91, 76, 0.06)', paddingTop: '1.25rem', marginTop: 'auto' }}>
                      <div style={{ 
                        width: '46px', 
                        height: '46px', 
                        borderRadius: '50%', 
                        background: 'linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary))',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: '700',
                        fontSize: '0.92rem',
                        boxShadow: '0 4px 10px rgba(176, 91, 76, 0.15)',
                        flexShrink: 0
                      }}>
                        {t.initials}
                      </div>
                      <div>
                        <h4 style={{ fontWeight: 700, fontSize: '1.02rem', color: 'var(--text-dark)' }}>{t.name}</h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>{t.role}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', marginTop: '2rem' }}>
            <button 
              onClick={handlePrevTestimonial}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                border: '1.5px solid var(--brand-primary)',
                background: 'transparent',
                color: 'var(--brand-primary)',
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.25s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--brand-primary)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--brand-primary)';
              }}
            >
              ←
            </button>

            {/* Pagination Dots */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTestimonial(idx)}
                  style={{
                    width: activeTestimonial === idx ? '24px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    border: 'none',
                    background: activeTestimonial === idx ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
                    padding: 0
                  }}
                />
              ))}
            </div>

            <button 
              onClick={handleNextTestimonial}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                border: '1.5px solid var(--brand-primary)',
                background: 'transparent',
                color: 'var(--brand-primary)',
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.25s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--brand-primary)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--brand-primary)';
              }}
            >
              →
            </button>
          </div>
        </div>
      </section>

      {/* Quality Legacy Visual section */}
      <div className="about-section-wrapper">
        <section id="about" className="about-section">
          <div className="about-content">
            <span className="section-subtitle">Our Legacy</span>
            <h2 className="about-title">Purity, Quality &amp; Scientific Ayurveda</h2>
            <p className="about-text">
              Shekhar Bandhu Aushadhalaya is a premier Ayurvedic pharmaceutical manufacturing company located in Varanasi. We are dedicated to providing classical formulations of the absolute highest standards of quality.
            </p>
            <p className="about-text">
              Our processes blend traditional Vedic methods (Snehapaka, Sandhana Kalpana) with state-of-the-art laboratory testing. Every batch undergoes stringent heavy-metal, microbial, and purity clearance before leaving our plant.
            </p>
            <div className="stats-grid">
              <div className="stat-item"><div className="stat-number">GMP</div><div className="stat-label">AYUSH Certified</div></div>
              <div className="stat-item"><div className="stat-number">100%</div><div className="stat-label">Organic Botanicals</div></div>
              <div className="stat-item"><div className="stat-number">B2B</div><div className="stat-label">Direct Bulk Rates</div></div>
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
      </div>

      {/* Dosha Consultation Quiz Modal */}
      <DoshaConsultationQuiz
        products={products}
        onSelectProduct={(rec) => router.push(`/product/${rec._id}`)}
        onCloseQuiz={() => setQuizOpen(false)}
      />

      {/* Cart Drawer */}
      {cartOpen && (
        <div className="cart-drawer-overlay" onClick={() => setCartOpen(false)}>
          <div className="cart-drawer open" onClick={(e) => e.stopPropagation()}>
            <div className="cart-header">
              <h3 className="cart-title">Shopping Cart ({cartCount})</h3>
              <button className="cart-close-btn" onClick={() => setCartOpen(false)}>✕</button>
            </div>
            <div className="cart-items-container">
              {cart.length > 0 ? cart.map(item => {
                const hasPromo = item.websitePromoActive && item.discount > 0;
                const activePrice = hasPromo
                  ? item.price * (1 - item.discount / 100)
                  : item.price;

                return (
                  <div key={item._id} className="cart-item">
                    <span style={{ fontSize: '1.8rem' }}>{item.emoji}</span>
                    <div className="cart-item-details">
                      <h4 className="cart-item-name">{item.name}</h4>
                      <div className="cart-item-price">
                        {hasPromo ? (
                          <>
                            <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.8rem', marginRight: '5px' }}>₹{item.price}</span>
                            <span style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>₹{activePrice.toFixed(2)}</span>
                          </>
                        ) : (
                          `₹${item.price}`
                        )}
                        {` • ${item.size}`}
                      </div>
                    </div>
                    <div className="cart-item-quantity-controls">
                      <button className="quantity-btn" onClick={() => updateQty(item._id, -1)}>-</button>
                      <span className="quantity-val">{item.qty}</span>
                      <button className="quantity-btn" onClick={() => updateQty(item._id, 1)}>+</button>
                    </div>
                    <button className="cart-item-remove" onClick={() => removeItem(item._id)}>🗑️</button>
                  </div>
                );
              }) : (
                <div className="cart-empty-state">
                  <div className="cart-empty-icon">🛒</div>
                  <p>Your cart is empty.</p>
                  <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setCartOpen(false)}>Continue Browsing</button>
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div className="cart-footer">
                <div className="cart-summary-row total">
                  <span>Subtotal Amount:</span><span>₹{cartTotal.toFixed(2)}</span>
                </div>
                <button className="btn-checkout" onClick={() => setCheckoutOpen(true)}>Proceed to Checkout</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutOpen && (
        <div className="modal-overlay" onClick={() => setCheckoutOpen(false)} style={{ zIndex: 1100 }}>
          <div className="modal-content checkout-modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem', maxWidth: '500px' }}>
            <button className="modal-close-btn" onClick={() => setCheckoutOpen(false)}>✕</button>
            {orderSuccess ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <span style={{ fontSize: '3.5rem' }}>🎉</span>
                <h3 className="modal-title" style={{ marginTop: '1rem', color: 'var(--color-primary)' }}>Order Placed Successfully!</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: '1rem 0', lineHeight: '1.5' }}>
                  Thank you! Your Order ID is:
                  <strong style={{ display: 'block', fontFamily: 'monospace', fontSize: '1.1rem', padding: '8px', backgroundColor: '#F5EFE2', borderRadius: '4px', margin: '0.5rem 0', color: 'var(--text-dark)' }}>
                    {orderSuccess._id}
                  </strong>
                  You can use this ID or your phone number in the **Track Order** tab to monitor shipment status live!
                </p>
                <button className="btn btn-primary" onClick={() => { setCheckoutOpen(false); setOrderSuccess(null); setCartOpen(false); }}>Return to Store</button>
              </div>
            ) : (
              <div>
                <h3 className="modal-title" style={{ marginBottom: '0.25rem' }}>Checkout Details</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Confirm your details to submit your B2B order</span>
                <form onSubmit={handleCheckoutSubmit} style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[
                    { label: 'Customer / Clinic Name', type: 'text', val: orderName, set: setOrderName },
                    { label: 'Email Address', type: 'email', val: orderEmail, set: setOrderEmail },
                    { label: 'Phone / WhatsApp No.', type: 'tel', val: orderPhone, set: setOrderPhone },
                  ].map(({ label, type, val, set }) => (
                    <div key={label}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>{label}</label>
                      <input type={type} className="search-input" style={{ paddingLeft: '1rem' }} value={val} onChange={(e) => set(e.target.value)} required />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Shipping Address</label>
                    <textarea rows="3" className="search-input" style={{ paddingLeft: '1rem', height: 'auto', resize: 'vertical' }} value={orderAddress} onChange={(e) => setOrderAddress(e.target.value)} required />
                  </div>
                  <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontWeight: 600 }}>
                      <span>Total Amount:</span><span>₹{cartTotal.toFixed(2)}</span>
                    </div>
                    <button type="submit" className="btn-checkout" disabled={submittingOrder} style={{ margin: 0, width: '100%' }}>
                      {submittingOrder ? 'Submitting order...' : 'Submit B2B Order'}
                    </button>
                    <a
                      href={`https://wa.me/917304720168?text=Hello%20Shekhar%20Bandhu,%20I%20am%20interested%20in%20placing%20a%20B2B%20order%20for:%20${encodeURIComponent(cart.map(item => `${item.name} (${item.size}) x${item.qty}`).join(', '))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        backgroundColor: '#25D366',
                        color: '#fff',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        boxShadow: '0 4px 12px rgba(37,211,102,0.2)',
                        textAlign: 'center'
                      }}
                    >
                      💬 Discuss &amp; Order on WhatsApp
                    </a>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      <EnquiryForm initialProductName="" apiBaseUrl={API_BASE} />

      <Footer startQuiz={() => setQuizOpen(true)} />
    </>
  );
}
