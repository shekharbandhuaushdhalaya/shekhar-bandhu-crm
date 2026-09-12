import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useToast } from '../context/ToastContext';

export default function ProductCard({ product, onAddToCart, apiBaseUrl }) {
  const { showToast } = useToast();
  const router = useRouter();

  // Support variants grouping; default to product if none present
  const variants = product.variants || [product];
  const [selectedVariant, setSelectedVariant] = useState(variants[0]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Sync selected variant if product changes
  useEffect(() => {
    setSelectedVariant(variants[0]);
    setCurrentImageIndex(0);
  }, [product]);

  // Determine stock availability
  const inStock = selectedVariant.stockLevel > 0;

  // Resolve carousel image list
  const getCarouselImages = () => {
    const list = [];
    if (selectedVariant.image) {
      const parts = selectedVariant.image.split(',').map(img => {
        if (!img) return null;
        if (img.startsWith('http') || img.startsWith('data:')) return img;
        const clean = img.startsWith('/') ? img : `/${img}`;
        return `${apiBaseUrl}${clean}`;
      }).filter(Boolean);
      list.push(...parts);
    }
    
    // Fallback only if no images are set in CRM
    if (list.length === 0) {
      list.push('https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80');
    }
    return list;
  };

  const images = getCarouselImages();

  const hasPromo = selectedVariant.websitePromoActive && selectedVariant.discount > 0;
  const discountedPrice = hasPromo
    ? (selectedVariant.price * (1 - selectedVariant.discount / 100)).toFixed(2)
    : null;

  const handleCardClick = () => {
    router.push(`/product/${selectedVariant._id}`);
  };

  return (
    <article 
      className="product-card" 
      style={{ cursor: 'pointer', position: 'relative', display: 'flex', flexDirection: 'column' }} 
      onClick={handleCardClick}
    >
      {/* Wishlist Heart Icon overlay */}
      <button 
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 10,
          background: '#ffffff',
          border: '1px solid var(--border-organic)',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
          color: 'var(--brand-primary-light)'
        }}
        onClick={(e) => {
          e.stopPropagation();
          showToast(`${selectedVariant.name} (${selectedVariant.size}) added to wishlist!`, 'success');
        }}
      >
        ❤️
      </button>

      {/* Promo Banner */}
      {hasPromo && (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '-2px',
          zIndex: 10,
          backgroundColor: 'var(--brand-primary)',
          color: '#fff',
          fontSize: '0.72rem',
          fontWeight: 800,
          padding: '3px 10px 3px 8px',
          borderRadius: '0 20px 20px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          boxShadow: '2px 2px 8px rgba(13,62,53,0.25)',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}>
          🔖 {selectedVariant.discount}% OFF
          {selectedVariant.discountLabel && (
            <span style={{ fontWeight: 600, opacity: 0.9 }}>· {selectedVariant.discountLabel}</span>
          )}
        </div>
      )}

      {/* Image Carousel */}
      <div 
        className="product-image-container" 
        style={{ 
          position: 'relative', 
          overflow: 'hidden', 
          height: '200px', 
          backgroundColor: '#f8fafc',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <div 
          style={{ 
            display: 'flex', 
            width: '100%', 
            height: '100%', 
            transform: `translateX(-${currentImageIndex * 100}%)`, 
            transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
          }}
        >
          {images.map((imgUrl, idx) => (
            <img
              key={idx}
              src={imgUrl}
              alt={`${selectedVariant.name} - view ${idx + 1}`}
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover', 
                flexShrink: 0,
                filter: inStock ? 'none' : 'grayscale(60%) opacity(0.8)'
              }}
            />
          ))}
        </div>

        {/* Carousel Arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
              }}
              style={{
                position: 'absolute',
                top: '50%',
                left: '8px',
                transform: 'translateY(-50%)',
                background: 'rgba(255, 255, 255, 0.85)',
                border: 'none',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                zIndex: 5
              }}
            >
              ⟨
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
              }}
              style={{
                position: 'absolute',
                top: '50%',
                right: '8px',
                transform: 'translateY(-50%)',
                background: 'rgba(255, 255, 255, 0.85)',
                border: 'none',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                zIndex: 5
              }}
            >
              ⟩
            </button>
          </>
        )}

        {/* Carousel dots indicators */}
        {images.length > 1 && (
          <div 
            style={{ 
              position: 'absolute', 
              bottom: '10px', 
              left: '0', 
              right: '0', 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '5px',
              zIndex: 5
            }}
          >
            {images.map((_, idx) => (
              <span
                key={idx}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: currentImageIndex === idx ? 'var(--brand-primary)' : 'rgba(255,255,255,0.6)',
                  transition: 'background-color 0.2s'
                }}
              />
            ))}
          </div>
        )}

        {!inStock && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(30,20,20,0.78)',
            color: '#fff',
            fontSize: '0.72rem',
            fontWeight: 800,
            padding: '4px 14px',
            borderRadius: '9999px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            zIndex: 6
          }}>
            Out of Stock
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="product-card-body" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        <span className="product-category-tag">{selectedVariant.category}</span>
        <h3 className="product-name">{selectedVariant.name}</h3>
        
        {/* Star Rating display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.4rem', marginTop: '0.2rem' }}>
          <div style={{ display: 'flex', color: '#fbbf24', fontSize: '0.9rem' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i}>{i < Math.round(selectedVariant.rating || 0) ? '★' : '☆'}</span>
            ))}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {selectedVariant.ratingCount > 0 ? `${selectedVariant.rating} (${selectedVariant.ratingCount})` : 'No reviews'}
          </span>
        </div>

        {/* Size selection Pills */}
        {variants.length > 1 && (
          <div 
            style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '0.4rem 0 0.6rem 0' }} 
            onClick={(e) => e.stopPropagation()}
          >
            {variants.map((v) => {
              const isSelected = selectedVariant._id === v._id;
              return (
                <button
                  key={v._id}
                  onClick={() => {
                    setSelectedVariant(v);
                    setCurrentImageIndex(0);
                  }}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.68rem',
                    borderRadius: '4px',
                    border: `1.5px solid ${isSelected ? 'var(--brand-primary)' : '#e2e8f0'}`,
                    background: isSelected ? 'rgba(13,62,53,0.08)' : '#ffffff',
                    color: isSelected ? 'var(--brand-primary)' : 'var(--text-muted)',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {v.size}
                </button>
              );
            })}
          </div>
        )}

        <p className="product-desc-short" style={{ minHeight: '40px' }}>
          {selectedVariant.description?.substring(0, 85)}...
        </p>

        {/* Price & Buy Button container */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {hasPromo ? (
              <>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                  ₹{selectedVariant.price}
                </span>
                <span style={{ fontWeight: 800, color: 'var(--brand-primary)', fontSize: '1rem' }}>
                  ₹{discountedPrice}
                </span>
              </>
            ) : (
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                ₹{selectedVariant.price}
              </span>
            )}
          </div>

          {inStock ? (
            <button
              className="btn"
              style={{ 
                padding: '0.45rem 1.25rem', 
                fontSize: '0.8rem', 
                borderRadius: '9999px',
                border: '1.5px solid var(--brand-primary)',
                background: 'transparent',
                color: 'var(--brand-primary)',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'var(--transition-fast)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(selectedVariant);
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--brand-primary)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--brand-primary)';
              }}
            >
              Buy Now
            </button>
          ) : (
            <button
              className="btn"
              disabled
              style={{ 
                padding: '0.45rem 1.0rem', 
                fontSize: '0.75rem', 
                borderRadius: '9999px', 
                backgroundColor: '#f1f5f9', 
                color: '#94a3b8', 
                cursor: 'not-allowed', 
                border: '1.5px solid #cbd5e1' 
              }}
              onClick={(e) => e.stopPropagation()}
            >
              Out of Stock
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
