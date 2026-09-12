import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FaFacebook, FaInstagram, FaTwitter, FaYoutube } from 'react-icons/fa';

export default function Footer({ setActiveCategory, startQuiz }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let stars = [];
    const maxStars = 110; 
    const connectionDist = 120;
    const mouse = { x: null, y: null, radius: 160 };

    const parent = canvas.parentElement;

    const resizeCanvas = () => {
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      initStars();
    };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    class Star {
      constructor(x, y) {
        this.x = x || Math.random() * canvas.width;
        this.y = y || Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.75; 
        this.vy = (Math.random() - 0.5) * 0.75;
        this.radius = Math.random() * 2.0 + 0.6; 
        this.alpha = Math.random() * 0.5 + 0.4; 
        this.fadeDir = Math.random() > 0.5 ? 0.007 : -0.007; 
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 194, 168, ${this.alpha * 0.85})`;
        ctx.fill();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > canvas.width) this.vx = -this.vx;
        if (this.y < 0 || this.y > canvas.height) this.vy = -this.vy;

        this.alpha += this.fadeDir;
        if (this.alpha <= 0.35 || this.alpha >= 0.95) {
          this.fadeDir = -this.fadeDir;
        }
      }
    }

    const initStars = () => {
      stars = [];
      for (let i = 0; i < maxStars; i++) {
        stars.push(new Star());
      }
    };

    const drawConstellations = () => {
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDist) {
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            const alpha = (1 - dist / connectionDist) * 0.38; 
            ctx.strokeStyle = `rgba(255, 194, 168, ${alpha})`;
            ctx.lineWidth = 0.55;
            ctx.stroke();
          }
        }
      }

      if (mouse.x !== null && mouse.y !== null) {
        stars.forEach(star => {
          const dx = star.x - mouse.x;
          const dy = star.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            ctx.beginPath();
            ctx.moveTo(star.x, star.y);
            ctx.lineTo(mouse.x, mouse.y);
            const alpha = (1 - dist / mouse.radius) * 0.48; 
            ctx.strokeStyle = `rgba(255, 194, 168, ${alpha})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        });
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(star => {
        star.update();
        star.draw();
      });
      drawConstellations();
      animationFrameId = requestAnimationFrame(animate);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (parent) {
      parent.addEventListener('mousemove', handleMouseMove);
      parent.addEventListener('mouseleave', handleMouseLeave);
    }
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      if (parent) {
        parent.removeEventListener('mousemove', handleMouseMove);
        parent.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, []);

  return (
    <footer id="footer" style={{ background: 'var(--brand-primary)', borderTop: '1px solid rgba(255, 255, 255, 0.08)', position: 'relative', overflow: 'hidden' }}>
      {/* Dynamic Interactive Constellation Background */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          pointerEvents: 'none'
        }}
      />

      <div className="footer-container" style={{ position: 'relative', zIndex: 2 }}>
        <div className="footer-brand">
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', marginBottom: '1.25rem' }}>
            <Image src="/logo.png" alt="Shekhar Bandhu Aushadhalaya" width={48} height={48} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            <span style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: 800, lineHeight: '1.2', fontFamily: 'var(--font-heading)' }}>
              Shekhar Bandhu<br />
              <span style={{ fontSize: '0.85rem', color: 'var(--accent-peach)', fontWeight: 600, letterSpacing: '0.5px' }}>
                Aushadhalaya
              </span>
            </span>
          </Link>
          <p className="footer-desc" style={{ color: 'rgba(255, 255, 255, 0.7)', lineHeight: '1.6' }}>
            GMP certified manufacturer of authentic Ayurvedic formulations, classical self-fermented liquids (Asava &amp; Arishta), syrups, medicated oils, and rejuvenating vati/guggulu for clinics and pharmacies.
          </p>
        </div>

        <div className="footer-links-col">
          <h4 className="footer-col-title" style={{ color: 'var(--accent-peach)' }}>Browse Catalog</h4>
          <ul className="footer-links">
            <li><Link href="/shop?category=Asava+%26+Arishta" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Asava &amp; Arishta</Link></li>
            <li><Link href="/shop?category=Syrups" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Syrups</Link></li>
            <li><Link href="/shop?category=Medicated+Oils" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Medicated Oils</Link></li>
            <li><Link href="/shop?category=Vati+%26+Guggulu" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Vati &amp; Guggulu</Link></li>
          </ul>
        </div>

        <div className="footer-links-col">
          <h4 className="footer-col-title" style={{ color: 'var(--accent-peach)' }}>Ayurvedic Tools</h4>
          <ul className="footer-links">
            <li><a href="#quiz" onClick={(e) => { e.preventDefault(); if (startQuiz) startQuiz(); }} style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Dosha Consultation</a></li>
            <li><Link href="/about" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>GMP Standards</Link></li>
            <li><Link href="/enquiry" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Submit Enquiry</Link></li>
          </ul>
        </div>

        <div className="footer-links-col">
          <h4 className="footer-col-title" style={{ color: 'var(--accent-peach)' }}>Contacts</h4>
          <ul className="footer-links">
            <li><span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Helpline: +91 62905 97810</span></li>
            <li><span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Support: shekharbandhuaushadhalay@gmail.com</span></li>
            <li><span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>Plant: Varanasi, Uttar Pradesh, India</span></li>
          </ul>
          
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <a href="#" style={{ color: 'rgba(255, 255, 255, 0.7)', transition: 'color 0.2s' }} aria-label="Facebook">
              <FaFacebook size={20} />
            </a>
            <a href="#" style={{ color: 'rgba(255, 255, 255, 0.7)', transition: 'color 0.2s' }} aria-label="Instagram">
              <FaInstagram size={20} />
            </a>
            <a href="#" style={{ color: 'rgba(255, 255, 255, 0.7)', transition: 'color 0.2s' }} aria-label="Twitter">
              <FaTwitter size={20} />
            </a>
            <a href="#" style={{ color: 'rgba(255, 255, 255, 0.7)', transition: 'color 0.2s' }} aria-label="YouTube">
              <FaYoutube size={20} />
            </a>
          </div>
        </div>
      </div>

      <div className="footer-bottom" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.5rem', position: 'relative', zIndex: 2 }}>
        <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>© {new Date().getFullYear()} Shekhar Bandhu Aushadhalaya. All rights reserved.</p>
        <p style={{ color: 'rgba(255, 255, 255, 0.5)' }}>AYUSH Ministry Registered • GMP Certified Manufacturing Unit</p>
      </div>
    </footer>
  );
}
