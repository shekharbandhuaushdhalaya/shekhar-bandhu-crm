import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCart } from '../context/CartContext';
import { usePortal } from '../context/PortalContext';

export default function Header({ activeNav, startQuiz, cartCount: propCartCount, onOpenCart: propOnOpenCart }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const cartContext = useCart();
  const { customer, isLoggedIn } = usePortal();

  const cartCount = propCartCount !== undefined ? propCartCount : cartContext.cartCount;
  const onOpenCart = propOnOpenCart !== undefined ? propOnOpenCart : () => cartContext.setCartOpen(true);

  return (
    <header>
      {mobileMenuOpen && (
        <div 
          className="mobile-menu-backdrop" 
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'transparent',
            zIndex: 199
          }}
        />
      )}
      <div className="nav-container">
        {/* Logo */}
        <Link href="/" className="logo-link">
          <Image src="/logo.png" alt="Shekhar Bandhu Aushadhalaya" width={48} height={48} style={{ objectFit: 'contain' }} />
          <span className="logo-text-brand">Shekhar Bandhu<br /><span className="logo-text-sub">Aushadhalaya</span></span>
        </Link>

        {/* Nav Links — centre */}
        <ul className={`nav-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <li>
            <Link href="/" className={activeNav === 'home' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
              Home
            </Link>
          </li>
          <li>
            <Link href="/shop" className={activeNav === 'shop' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
              Shop Catalog
            </Link>
          </li>
          <li>
            <Link href="/quiz" className={activeNav === 'quiz' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
              Dosha Consultation
            </Link>
          </li>
          <li>
            <Link href="/about" className={activeNav === 'about' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
              Quality Standards
            </Link>
          </li>
          <li>
            <Link href="/enquiry" className={activeNav === 'enquiry' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
              Enquiry
            </Link>
          </li>
          <li>
            <Link href="/track" className={activeNav === 'track' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
              Track Order
            </Link>
          </li>
          <li>
            <Link href={isLoggedIn ? "/account" : "/account/login"} className={activeNav === 'account' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>
              {isLoggedIn ? 'My Account' : 'Customer Login'}
            </Link>
          </li>
        </ul>

        {/* Right side: cart + hamburger */}
        <div className="nav-right">
          {onOpenCart && (
            <button onClick={onOpenCart} className="cart-trigger-btn" aria-label="Open cart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              {cartCount > 0 && (
                <span className="cart-badge">{cartCount}</span>
              )}
            </button>
          )}
          <button
            className="menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>
    </header>
  );
}
