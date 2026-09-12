import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ProductCard from '../components/ProductCard';
import EnquiryForm from '../components/EnquiryForm';
import { fetchProducts, mapProduct, API_BASE } from '../lib/products';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import { usePortal } from '../context/PortalContext';
import { portalApi } from '../lib/portal';

export async function getServerSideProps() {
  try {
    const products = await fetchProducts();
    return { props: { products } };
  } catch {
    return { props: { products: [] } };
  }
}

export default function ShopPage({ products: initialProducts }) {
  const { showToast } = useToast();
  const router = useRouter();
  const { customer, isLoggedIn, ready: portalReady } = usePortal();
  const initialCategory = router.query.category || 'All';

  const [products, setProducts] = useState(initialProducts || []);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [search, setSearch] = useState('');

  // Cart operations from global CartContext
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

  const [orderName, setOrderName] = useState('');
  const [orderEmail, setOrderEmail] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  useEffect(() => {
    if (isLoggedIn && customer?.shippingAddress?.street && !orderAddress) setOrderAddress(customer.shippingAddress.street);
  }, [isLoggedIn, customer, orderAddress]);

  useEffect(() => {
    if (!portalReady) return;
    async function refreshProducts() {
      try {
        if (isLoggedIn) {
          const result = await portalApi.catalog({ limit: 100 });
          setProducts((result.data || []).map(mapProduct));
        } else {
          const res = await fetch(`${API_BASE}/api/public/products`);
          if (res.ok) {
            const data = await res.json();
            setProducts(data.map(mapProduct));
          }
        }
      } catch (err) {
        console.error('Failed to refresh real-time products', err);
      }
    }
    refreshProducts();
  }, [portalReady, isLoggedIn]);

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setSubmittingOrder(true);
    try {
      if (isLoggedIn) {
        if (!orderAddress && !customer?.shippingAddress?.street) {
          showToast('Please enter a shipping address', 'warning');
          setSubmittingOrder(false);
          return;
        }
        const payload = {
          clientOrderRef: `web-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          shippingAddress: orderAddress || customer?.shippingAddress?.street || '',
          items: cart.map(item => ({ productId: item._id, qty: item.qty }))
        };
        const data = await portalApi.placeOrder(payload);
        setOrderSuccess(data.order);
      } else {
        if (!orderName || !orderEmail || !orderPhone || !orderAddress) {
          showToast('Please fill in all checkout fields', 'warning');
          setSubmittingOrder(false);
          return;
        }
        const cleanPhone = orderPhone.replace(/\D/g, '');
        if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
          showToast('Please enter a valid 10-digit Indian mobile number', 'warning');
          setSubmittingOrder(false);
          return;
        }
        const formattedItems = cart.map(item => ({ productId: item._id, name: item.name, qty: item.qty, price: item.price }));
        const res = await fetch(`${API_BASE}/api/orders/public/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: orderName, email: orderEmail, phone: orderPhone, shippingAddress: orderAddress, items: formattedItems })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create order. Please try again.');
        setOrderSuccess(data.order);
      }
      clearCart();
      setOrderName(''); setOrderEmail(''); setOrderPhone(''); setOrderAddress('');
      showToast('Order placed successfully!', 'success');
    } catch (err) {
      if (err.status === 401) {
        showToast('Please sign in again to place your customer order.', 'warning');
        router.push('/account/login?next=/shop');
      } else showToast(err.message, 'error');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const uniqueCategories = ['All', ...new Set(products.map(p => p.category))];

  // In-memory product variant size grouping
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

  const groupedList = groupProducts(products);

  const processedProducts = groupedList.filter(p => {
    const term = search.toLowerCase();
    const matchesSearch = p.name.toLowerCase().includes(term) ||
      p.description.toLowerCase().includes(term) ||
      (p.disease && p.disease.toLowerCase().includes(term)) ||
      (p.benefits && p.benefits.toLowerCase().includes(term)) ||
      p.materials.some(m => m.toLowerCase().includes(term));
    const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <Head>
        <title>Shop Ayurvedic Products | Shekhar Bandhu Aushadhalaya</title>
        <meta name="description" content="Browse our full range of classical Ayurvedic medicines — Asava, Arishta, Medicated Oils, Syrups, Vati & Guggulu. B2B wholesale pricing available." />
        <link rel="icon" type="image/png" href="/logo.png" />
      </Head>

      <Header activeNav="shop" />

      <section id="shop" className="shop-section">
        <div className="section-header">
          <span className="section-subtitle">Shekhar Bandhu Formulations</span>
          <h1 className="section-title">Ayurvedic Remedies &amp; Classical Tonics</h1>
        </div>

        {isLoggedIn && (
          <div style={{ margin:'0 auto 1.25rem', maxWidth:'1100px', background:'#eef7f1', color:'var(--brand-primary)', border:'1px solid #cfe5d5', padding:'12px 16px', borderRadius:'10px', fontWeight:600 }}>
            Signed in as {customer?.company || customer?.name}. Prices and schemes shown below are your customer-specific rates.
          </div>
        )}
        {!isLoggedIn && portalReady && (
          <div style={{ margin:'0 auto 1.25rem', maxWidth:'1100px', background:'#fff8e8', color:'#7a5a16', border:'1px solid #ead7a6', padding:'12px 16px', borderRadius:'10px' }}>
            Existing trade customer? <a href="/account/login?next=/shop" style={{fontWeight:800,color:'inherit'}}>Sign in</a> to see your pricing and schemes.
          </div>
        )}

        <div className="shop-toolbar" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-organic)', paddingBottom: '0.75rem' }}>
          <span>Showing {processedProducts.length} of {groupedList.length} distinct remedies</span>
        </div>

        <div className="shop-layout">
          {/* Filter Sidebar */}
          <aside className="shop-sidebar">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search ingredients, benefits, SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <h4 className="filter-group-title">Formulation Category</h4>
              <div className="filter-options">
                {uniqueCategories.map(cat => (
                  <button
                    key={cat}
                    className={`filter-btn ${activeCategory === cat ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    <span>{cat}</span>
                    <span className="filter-count">
                      {cat === 'All' ? groupedList.length : groupedList.filter(p => p.category === cat).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {(search !== '' || activeCategory !== 'All') && (
              <button className="clear-filters-btn" onClick={() => { setSearch(''); setActiveCategory('All'); }}>
                Clear Filters
              </button>
            )}
          </aside>

          {/* Products Grid */}
          <main className="products-display">
            {processedProducts.length > 0 ? (
              <div className="grid-container">
                {processedProducts.map(prod => (
                  <ProductCard
                    key={prod._id}
                    product={prod}
                    onAddToCart={addToCart}
                    apiBaseUrl={API_BASE}
                  />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <h2>No formulations found</h2>
                <p style={{ color: 'var(--text-muted)' }}>Try adjusting your search criteria or categories.</p>
              </div>
            )}
          </main>
        </div>
      </section>

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
                <h3 className="modal-title" style={{ marginBottom: '0.25rem' }}>{isLoggedIn ? 'Submit Customer Order' : 'Checkout Details'}</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isLoggedIn ? 'Your CRM customer pricing will be recalculated securely when the order is submitted.' : 'Confirm your details to submit your B2B order'}</span>
                <form onSubmit={handleCheckoutSubmit} style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {!isLoggedIn && [{
                    label: 'Customer / Clinic Name', type: 'text', val: orderName, set: setOrderName },
                    { label: 'Email Address', type: 'email', val: orderEmail, set: setOrderEmail },
                    { label: 'Phone / WhatsApp No.', type: 'tel', val: orderPhone, set: (v) => setOrderPhone(v.replace(/\D/g, '').slice(0, 10)), maxLen: 10, pattern: '[6-9][0-9]{9}', placeholder: '10-digit mobile number' },
                  ].map(({ label, type, val, set, maxLen, pattern, placeholder }) => (
                    <div key={label}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>{label}</label>
                      <input type={type} className="search-input" style={{ paddingLeft: '1rem' }} value={val} onChange={(e) => set(e.target.value)} required maxLength={maxLen} pattern={pattern} placeholder={placeholder || ''} />
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

      <Footer setActiveCategory={setActiveCategory} />
    </>
  );
}
