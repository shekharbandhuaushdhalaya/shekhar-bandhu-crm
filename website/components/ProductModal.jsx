import React, { useState, useEffect } from 'react';

export default function ProductModal({ product, onClose, onEnquire, onAddToCart, apiBaseUrl }) {
  if (!product) return null;

  const [currentRating, setCurrentRating] = useState(product.rating || 0);
  const [currentCount, setCurrentCount] = useState(product.ratingCount || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [hasRated, setHasRated] = useState(false);

  // Sync state if product changes
  useEffect(() => {
    setCurrentRating(product.rating || 0);
    setCurrentCount(product.ratingCount || 0);
    setHasRated(false);
  }, [product]);

  const handleRate = async (val) => {
    if (hasRated) return; // Prevent multiple submissions in one modal open session
    try {
      const res = await fetch(`${apiBaseUrl}/api/public/products/${product._id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: val })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentRating(data.rating);
        setCurrentCount(data.ratingCount);
        setHasRated(true);
      }
    } catch (err) {
      console.error('Failed to submit rating', err);
    }
  };

  const getImageUrl = () => {
    if (!product.image) return null;
    if (product.image.startsWith('http') || product.image.startsWith('data:')) return product.image;
    const cleanPath = product.image.startsWith('/') ? product.image : `/${product.image}`;
    return `${apiBaseUrl}${cleanPath}`;
  };

  const imageUrl = getImageUrl();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close modal" style={{ zIndex: 20 }}>✕</button>

        <div className="modal-hero">
          {imageUrl ? (
            <img src={imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div className="modal-hero-emoji">{product.emoji}</div>
          )}
        </div>

        <div className="modal-right">
          <div className="modal-header" style={{ padding: 0, marginBottom: '1rem' }}>
            <span className="modal-category" style={{ color: 'var(--brand-primary-light)' }}>{product.category}</span>
            <h3 className="modal-title" style={{ fontSize: '1.6rem', marginTop: '0.25rem', color: 'var(--brand-primary)' }}>{product.name}</h3>
            
            {/* Live Interactive Rating Option */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '0.4rem', marginBottom: '0.4rem' }}>
              <div style={{ display: 'flex', color: '#fbbf24', fontSize: '1.2rem' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    style={{ cursor: hasRated ? 'default' : 'pointer', transition: 'transform 0.1s', padding: '0 1px' }}
                    onClick={() => handleRate(i + 1)}
                    onMouseEnter={() => !hasRated && setHoverRating(i + 1)}
                    onMouseLeave={() => !hasRated && setHoverRating(0)}
                  >
                    {i < (hoverRating || Math.round(currentRating)) ? '★' : '☆'}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {currentCount > 0 ? `${currentRating} (${currentCount} customer ratings)` : 'No ratings yet'}
              </span>
              {hasRated && (
                <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700, marginLeft: '4px' }}>
                  ✓ Rated!
                </span>
              )}
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
              SKU: {product.sku}
            </div>
          </div>


          <div className="modal-body" style={{ padding: 0, maxHeight: 'none', overflowY: 'visible' }}>
            {product.description ? (
              <p className="modal-text" style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--brand-primary-dark)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                {product.description}
              </p>
            ) : null}

            {product.disease ? (
              <div className="modal-section" style={{ marginBottom: '1rem', marginTop: 0 }}>
                <h4 className="modal-section-title" style={{ color: 'var(--accent-peach-hover)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Used For (Indications)</h4>
                <p className="modal-text" style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-dark)' }}>{product.disease}</p>
              </div>
            ) : null}

            {product.ingredients ? (
              <div className="modal-section" style={{ marginBottom: '1.25rem', marginTop: 0 }}>
                <h4 className="modal-section-title" style={{ color: 'var(--accent-peach-hover)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Key Ingredients</h4>
                <p className="modal-text" style={{ fontStyle: 'italic', fontSize: '0.88rem', color: 'var(--text-muted)' }}>{product.ingredients}</p>
              </div>
            ) : null}

            <div className="modal-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1.25rem', borderTop: '1px solid rgba(13,62,53,0.06)', paddingTop: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Net Weight / Volume</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>{product.size || 'N/A'}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Formulation Type</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>{product.productType || 'N/A'}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Stock Status</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: product.stockLevel > 0 ? '#10b981' : '#ef4444' }}>
                  {product.stockLevel > 0 ? '● In Stock' : '● Out of Stock'}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Product Colour</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>{product.colour || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>B2B Price</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.45rem', fontWeight: 800, color: 'var(--brand-primary)' }}>₹{product.price}</span>
            </div>
            <div className="modal-footer-buttons">
              {product.stockLevel > 0 ? (
                <button className="btn btn-primary" style={{ borderRadius: '9999px', padding: '0.6rem 1.25rem', fontSize: '0.88rem', fontWeight: '700' }} onClick={() => { onAddToCart(product); onClose(); }}>
                  🛒 Add to Cart
                </button>
              ) : (
                <button className="btn" disabled style={{ borderRadius: '9999px', padding: '0.6rem 1.25rem', fontSize: '0.88rem', backgroundColor: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed', border: '1px solid #cbd5e1' }}>
                  🚫 Out of Stock
                </button>
              )}
              <button className="btn btn-secondary" style={{ borderRadius: '9999px', padding: '0.6rem 1.25rem', fontSize: '0.88rem', fontWeight: '700' }} onClick={() => onEnquire(product)}>
                📩 Enquire
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
