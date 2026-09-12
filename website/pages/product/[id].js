import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import EnquiryForm from '../../components/EnquiryForm';
import { mapProduct, API_BASE } from '../../lib/products';
import { useToast } from '../../context/ToastContext';
import { useCart } from '../../context/CartContext';
import { usePortal } from '../../context/PortalContext';
import { portalApi } from '../../lib/portal';

export async function getServerSideProps(context) {
  const { id } = context.params;
  try {
    const res = await fetch(`${API_BASE}/api/public/products/${id}`);
    if (!res.ok) {
      return { notFound: true };
    }
    const data = await res.json();
    return {
      props: {
        initialProduct: mapProduct(data),
        initialVariants: data.variants ? data.variants.map(mapProduct) : []
      }
    };
  } catch (err) {
    console.error('Failed to load product detail server-side:', err);
    return { notFound: true };
  }
}

export default function ProductDetailPage({ initialProduct, initialVariants }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { customer, isLoggedIn, ready: portalReady } = usePortal();
  const { addToCart, cart, cartCount, cartTotal, cartOpen, setCartOpen, checkoutOpen, setCheckoutOpen, updateQty, removeItem, clearCart } = useCart();

  const [product, setProduct] = useState(initialProduct);
  const [variants, setVariants] = useState(initialVariants || [initialProduct]);
  const [selectedVariant, setSelectedVariant] = useState(initialProduct);
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Form checkout details
  const [orderName, setOrderName] = useState('');
  const [orderEmail, setOrderEmail] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  useEffect(() => {
    if (isLoggedIn && customer?.shippingAddress?.street && !orderAddress) setOrderAddress(customer.shippingAddress.street);
  }, [isLoggedIn, customer, orderAddress]);

  // Sync state if initialProduct prop updates
  useEffect(() => {
    setProduct(initialProduct);
    setVariants(initialVariants || [initialProduct]);
    setSelectedVariant(initialProduct);
    setQuantity(1);
    setCurrentImageIndex(0);
  }, [initialProduct, initialVariants]);

  useEffect(() => {
    if (!portalReady || !isLoggedIn || !selectedVariant?._id) return;
    portalApi.product(selectedVariant._id, quantity).then((data) => {
      const mapped = mapProduct({
        ...data,
        price: data.customerPrice?.rate ?? data.price,
        discountPercent: data.scheme?.discountPercent ?? data.customerPrice?.discountPercent ?? 0,
        availableQty: data.availableQty,
        pricingSource: data.customerPrice?.pricingSource,
        scheme: data.scheme
      });
      setSelectedVariant((current) => current?._id === mapped._id ? { ...current, ...mapped } : current);
    }).catch(() => {});
  }, [portalReady, isLoggedIn, selectedVariant?._id, quantity]);

  // Update selected variant when switching size
  const handleVariantSelect = (v) => {
    setSelectedVariant(v);
    setQuantity(1);
    setCurrentImageIndex(0);
    // Push new ID to URL route without fully reloading server-side (shallow push)
    router.push(`/product/${v._id}`, undefined, { shallow: true });
  };

  const inStock = selectedVariant.stockLevel > 0;
  const hasPromo = selectedVariant.websitePromoActive && selectedVariant.discount > 0;
  const discountedPrice = hasPromo
    ? (selectedVariant.price * (1 - selectedVariant.discount / 100)).toFixed(2)
    : null;

  // Resolve gallery images
  const getCarouselImages = () => {
    const list = [];
    if (selectedVariant.image) {
      const parts = selectedVariant.image.split(',').map(img => {
        if (!img) return null;
        if (img.startsWith('http') || img.startsWith('data:')) return img;
        const clean = img.startsWith('/') ? img : `/${img}`;
        return `${API_BASE}${clean}`;
      }).filter(Boolean);
      list.push(...parts);
    }
    
    // Fallback only if no images are set in CRM
    if (list.length === 0) {
      list.push('https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80');
    }
    return list;
  };

  const images = getCarouselImages();

  const handleAddToCartClick = () => {
    if (!inStock) {
      showToast(`${selectedVariant.name} is currently out of stock.`, 'warning');
      return;
    }
    if (quantity > selectedVariant.stockLevel) {
      showToast(`Only ${selectedVariant.stockLevel} units are available.`, 'warning');
      return;
    }
    addToCart(selectedVariant, quantity);
  };

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
        const data = await portalApi.placeOrder({
          clientOrderRef: `web-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          shippingAddress: orderAddress || customer?.shippingAddress?.street || '',
          items: cart.map(item => ({ productId: item._id, qty: item.qty }))
        });
        setOrderSuccess(data.order);
      } else {
        if (!orderName || !orderEmail || !orderPhone || !orderAddress) {
          showToast('Please fill in all checkout fields', 'warning');
          setSubmittingOrder(false);
          return;
        }
        const formattedItems = cart.map(item => ({ productId: item._id, name: item.name, qty: item.qty, price: item.price }));
        const res = await fetch(`${API_BASE}/api/orders/public/create`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      if (err.status === 401) router.push('/account/login?next=' + encodeURIComponent(router.asPath));
      showToast(err.message || 'Unable to place order', 'error');
    } finally { setSubmittingOrder(false); }
  };

  return (
    <>
      <Head>
        <title>{`${selectedVariant.name} (${selectedVariant.size}) | Shekhar Bandhu Aushadhalaya`}</title>
        <meta name="description" content={selectedVariant.description || 'Ayurvedic classical formulation.'} />
        <link rel="icon" type="image/png" href="/logo.png" />
      </Head>

      <Header activeNav="shop" />
      {isLoggedIn && <div style={{position:'fixed',top:78,left:0,right:0,zIndex:90,textAlign:'center',background:'#eef7f1',borderBottom:'1px solid #cfe5d5',padding:'7px 12px',fontSize:'.82rem',color:'var(--brand-primary)'}}>Customer pricing active for {customer?.company || customer?.name}</div>}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '120px 24px 60px 24px', minHeight: '80vh' }}>
        
        {/* Breadcrumb navigation */}
        <div style={{ marginBottom: '24px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Home</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <Link href="/shop" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Shop Catalog</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>{selectedVariant.name}</span>
        </div>

        {/* Dynamic Detail Columns */}
        <div className="product-detail-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '48px', marginBottom: '60px' }}>
          
          {/* Gallery Column */}
          <div className="product-detail-gallery" style={{ flex: '1 1 450px', maxWidth: '600px' }}>
            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', height: '420px', border: '1px solid var(--border-organic)', backgroundColor: '#f8fafc', marginBottom: '16px' }}>
              <img
                src={images[currentImageIndex]}
                alt={selectedVariant.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {hasPromo && (
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  left: '0',
                  backgroundColor: 'var(--brand-primary)',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  padding: '4px 12px',
                  borderRadius: '0 20px 20px 0',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
                }}>
                  🔖 {selectedVariant.discount}% OFF · {selectedVariant.discountLabel || 'PROMO'}
                </div>
              )}
            </div>

            {/* Gallery Thumbnails */}
            {images.length > 1 && (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                {images.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    style={{
                      width: '70px',
                      height: '70px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: `2px solid ${currentImageIndex === idx ? 'var(--brand-primary)' : 'transparent'}`,
                      padding: 0,
                      cursor: 'pointer',
                      backgroundColor: '#fff'
                    }}
                  >
                    <img src={imgUrl} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Description details Column */}
          <div className="product-detail-info" style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <span className="product-category-tag" style={{ alignSelf: 'flex-start', fontSize: '0.8rem', padding: '4px 12px' }}>
              {selectedVariant.category}
            </span>
            <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-dark)', fontSize: '2.5rem', fontWeight: 800, margin: 0 }}>
              {selectedVariant.name}
            </h1>
            
            {/* SKU and Stock level tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>SKU: <strong style={{ color: 'var(--text-dark)' }}>{selectedVariant.sku}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span style={{
                color: inStock ? 'var(--brand-primary)' : 'var(--accent-gold)',
                fontWeight: 700,
                backgroundColor: inStock ? 'rgba(13,62,53,0.06)' : 'rgba(176,91,76,0.06)',
                padding: '2px 10px',
                borderRadius: '4px'
              }}>
                {inStock ? `In Stock (Available: ${selectedVariant.stockLevel} units)` : 'Out of Stock'}
              </span>
            </div>

            {/* Ratings */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ color: '#fbbf24', fontSize: '1.2rem' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i}>{i < Math.round(selectedVariant.rating || 0) ? '★' : '☆'}</span>
                ))}
              </div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {selectedVariant.ratingCount > 0 ? `${selectedVariant.rating} (${selectedVariant.ratingCount} reviews)` : 'No ratings yet'}
              </span>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-organic)', margin: '8px 0' }} />

            {/* Price section */}
            <div>
              {hasPromo ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand-primary)' }}>₹{discountedPrice}</span>
                  <span style={{ fontSize: '1.1rem', color: '#94a3b8', textDecoration: 'line-through' }}>₹{selectedVariant.price}</span>
                </div>
              ) : (
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand-primary)' }}>₹{selectedVariant.price}</span>
              )}
              <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>* B2B Direct-Factory Pricing (incl. GST)</span>
            </div>

            {/* Variant selector */}
            {variants.length > 1 && (
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-dark)' }}>Available Packing Sizes:</h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {variants.map(v => {
                    const isSelected = selectedVariant._id === v._id;
                    return (
                      <button
                        key={v._id}
                        onClick={() => handleVariantSelect(v)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: `2px solid ${isSelected ? 'var(--brand-primary)' : '#e2e8f0'}`,
                          backgroundColor: isSelected ? 'rgba(13,62,53,0.06)' : '#fff',
                          color: isSelected ? 'var(--brand-primary)' : 'var(--text-muted)',
                          fontWeight: '700',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {v.size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Buy controls */}
            {inStock ? (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--border-organic)', borderRadius: '8px', height: '42px', overflow: 'hidden' }}>
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    style={{ width: '40px', height: '100%', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}
                  >
                    -
                  </button>
                  <span style={{ width: '40px', textAlign: 'center', fontWeight: '700', fontSize: '0.95rem' }}>{quantity}</span>
                  <button
                    onClick={() => setQuantity(q => Math.min(selectedVariant.stockLevel, q + 1))}
                    style={{ width: '40px', height: '100%', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' }}
                  >
                    +
                  </button>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleAddToCartClick}
                  style={{
                    height: '42px',
                    borderRadius: '8px',
                    padding: '0 32px',
                    fontWeight: '700',
                    fontSize: '0.92rem',
                    flexGrow: 1
                  }}
                >
                  Add to Cart 🛒
                </button>
              </div>
            ) : (
              <button
                disabled
                style={{
                  height: '42px',
                  borderRadius: '8px',
                  backgroundColor: '#f1f5f9',
                  color: '#94a3b8',
                  border: '1.5px solid #cbd5e1',
                  cursor: 'not-allowed',
                  fontWeight: '700',
                  marginTop: '12px'
                }}
              >
                Out of Stock
              </button>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-organic)', margin: '16px 0' }} />

            {/* Brief Description */}
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-dark)' }}>Indication & Therapeutic Action:</h4>
              <p style={{ fontSize: '0.92rem', color: 'var(--text-dark)', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>
                {selectedVariant.description}
              </p>
            </div>
          </div>
        </div>

        {/* Tabbed Info details */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '60px' }}>
          
          <div style={{ backgroundColor: '#FFFDF9', border: '1px solid var(--border-organic)', padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--brand-primary)', fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>
              🌿 Classical Ingredients
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>
              {selectedVariant.ingredients || 'Dashmula roots, Haritaki fruit pulp, Jaggery base, fermenting flowers (Dhataki), ginger, and systemic herbs.'}
            </p>
          </div>

          <div style={{ backgroundColor: '#F9FAF9', border: '1px solid var(--border-organic)', padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--brand-primary)', fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>
              💪 Health Benefits
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>
              {selectedVariant.benefits || 'Improves assimilation, regulates digestive fires (Mandagni), relieves flatulence, and stimulates intestinal motility.'}
            </p>
          </div>

          <div style={{ backgroundColor: '#FFFDF9', border: '1px solid var(--border-organic)', padding: '24px', borderRadius: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--brand-primary)', fontSize: '1.25rem', fontWeight: 800, marginBottom: '12px' }}>
              🥄 Suggested Dosage
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>
              {selectedVariant.usageDetails || 'Adults: Take 15 - 30 ml twice daily with equal quantity of lukewarm water after meals or as directed by physician.'}
            </p>
          </div>
        </div>

        {/* Direct B2B Wholesale Enquiry */}
        <EnquiryForm initialProductName={selectedVariant.name} apiBaseUrl={API_BASE} />

      </div>

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
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Confirm your details to submit your B2B order</span>
                <form onSubmit={handleCheckoutSubmit} style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {!isLoggedIn && [{
                    label: 'Customer / Clinic Name', type: 'text', val: orderName, set: setOrderName },
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

      <Footer />
    </>
  );
}
