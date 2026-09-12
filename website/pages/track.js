import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { API_BASE } from '../lib/products';
import { usePortal } from '../context/PortalContext';
import { portalApi } from '../lib/portal';

export default function TrackOrderPage() {
  const { customer: portalCustomer, isLoggedIn: portalLoggedIn, ready: portalReady, logout: portalLogout } = usePortal();
  const [query, setQuery] = useState(''); // phone number input
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [orders, setOrders] = useState([]);
  
  // OTP Flow States
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devOtp, setDevOtp] = useState('');

  // User Session State
  const [userSession, setUserSession] = useState(null);

  // Fetch orders associated with a phone number
  const fetchOrdersForPhone = async (phone) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/orders/public/track/${encodeURIComponent(phone.trim())}?t=${Date.now()}`, {
        cache: 'no-store'
      });
      if (!res.ok) {
        throw new Error('Failed to retrieve order history.');
      }
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      setError(err.message || 'An error occurred while fetching your order history.');
    } finally {
      setLoading(false);
    }
  };

  // Load session from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sba-user-session');
      if (saved) {
        const parsed = JSON.parse(saved);
        setUserSession(parsed);
        fetchOrdersForPhone(parsed.query);
      }
    } catch (e) {
      console.error('Failed to load user session', e);
    }
  }, []);

  useEffect(() => {
    if (!portalReady || !portalLoggedIn) return;
    setUserSession({ query: '', customerName: portalCustomer?.name || portalCustomer?.company || 'Customer', emailOrPhone: portalCustomer?.email || '', portal: true });
    setLoading(true);
    portalApi.orders().then(setOrders).catch((e) => setError(e.message || 'Unable to load orders.')).finally(() => setLoading(false));
  }, [portalReady, portalLoggedIn, portalCustomer]);

  const refreshOrders = async () => {
    if (portalLoggedIn) {
      setLoading(true);
      try { setOrders(await portalApi.orders()); } catch (e) { setError(e.message || 'Unable to load orders.'); } finally { setLoading(false); }
    } else if (userSession?.query) {
      await fetchOrdersForPhone(userSession.query);
    }
  };

  // Request code via WhatsApp
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) {
      setError('Please enter your Phone Number.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/whatsapp/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: query })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send verification code.');
      }
      setOtpSent(true);
      if (data.devOtp) {
        setDevOtp(data.devOtp);
      }
      setSuccessMsg('Verification code sent successfully to WhatsApp!');
    } catch (err) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP Code
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/whatsapp/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: query, code: otpCode })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid verification code.');
      }

      // Success - save session
      const sessionInfo = {
        query: data.phone,
        customerName: data.customerName,
        emailOrPhone: data.phone
      };
      setUserSession(sessionInfo);
      localStorage.setItem('sba-user-session', JSON.stringify(sessionInfo));
      
      // Load orders
      await fetchOrdersForPhone(data.phone);

      // Reset OTP states
      setOtpSent(false);
      setOtpCode('');
      setDevOtp('');
      setSuccessMsg('');
    } catch (err) {
      setError(err.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    if (portalLoggedIn) portalLogout();
    localStorage.removeItem('sba-user-session');
    setUserSession(null);
    setOrders([]);
    setQuery('');
    setOtpSent(false);
    setOtpCode('');
    setDevOtp('');
    setError('');
    setSuccessMsg('');
  };

  const getStatusStep = (status) => {
    switch (status) {
      case 'pending': return 1;
      case 'processing': return 2;
      case 'shipped': return 3;
      case 'delivered': return 4;
      default: return 1;
    }
  };

  return (
    <>
      <Head>
        <title>Order History &amp; Live Tracking | Shekhar Bandhu Aushadhalaya</title>
        <meta name="description" content="Log in to view your complete order history, shipping statuses, and track live courier shipments." />
        <link rel="icon" type="image/png" href="/logo.png" />
      </Head>

      <Header activeNav="track" />

      {/* Hero Header */}
<section className="inner-page-hero" style={{ backgroundImage: "url('/aloe_leaves.png')" }}>
  <h1 className="inner-page-title">Customer Order Center</h1>
  <p className="inner-page-subtitle">Log in with your checkout details to view your complete order history and real-time shipment tracking.</p>
</section>

      {/* Main Section */}
      <section style={{ padding: '4rem 2rem', backgroundColor: '#FDFBF7', minHeight: '500px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>

          {/* Not Logged In - Show Login Card */}
          {!userSession ? (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '3rem 2.5rem',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border-organic)',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>🔐</span>
              <h2 style={{ fontFamily: 'var(--font-ui)', color: 'var(--brand-primary)', fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                Access Your Order History
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem' }}>
                {otpSent 
                  ? `Enter the 6-digit verification code sent to ${query} on WhatsApp.` 
                  : "Enter the Phone Number you used during your checkout to receive a WhatsApp verification code."
                }
              </p>

              {!otpSent ? (
                /* Step 1: Send OTP Form */
                <form onSubmit={handleSendOtp} style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <input
                    type="tel"
                    placeholder="Enter Phone Number (e.g. 9876543210)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.9rem 1.2rem',
                      borderRadius: '8px',
                      border: '1px solid var(--bg-tertiary)',
                      fontSize: '1rem',
                      outline: 'none',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-dark)'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      backgroundColor: 'var(--brand-primary)',
                      color: '#fff',
                      padding: '0.9rem',
                      borderRadius: '8px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '1.05rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px var(--brand-glow)',
                      transition: 'var(--transition-fast)'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = 'var(--brand-primary-dark)'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'var(--brand-primary)'}
                  >
                    {loading ? 'Sending Code...' : 'Send Verification Code ➔'}
                  </button>
                </form>
              ) : (
                /* Step 2: Verify OTP Form */
                <form onSubmit={handleVerifyOtp} style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-Digit Code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.9rem 1.2rem',
                      borderRadius: '8px',
                      border: '1px solid var(--bg-tertiary)',
                      fontSize: '1.2rem',
                      textAlign: 'center',
                      letterSpacing: '4px',
                      fontWeight: 'bold',
                      outline: 'none',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-dark)'
                    }}
                  />

                  {devOtp && (
                    <div style={{
                      backgroundColor: '#e6f4ea',
                      color: '#137333',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      border: '1px solid #ceead6'
                    }}>
                      💬 [Dev Mode] WhatsApp OTP Code: <strong style={{ fontSize: '1rem', letterSpacing: '1px' }}>{devOtp}</strong>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={verifying}
                    style={{
                      backgroundColor: 'var(--brand-primary)',
                      color: '#fff',
                      padding: '0.9rem',
                      borderRadius: '8px',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '1.05rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px var(--brand-glow)',
                      transition: 'var(--transition-fast)'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = 'var(--brand-primary-dark)'}
                    onMouseOut={(e) => e.target.style.backgroundColor = 'var(--brand-primary)'}
                  >
                    {verifying ? 'Verifying...' : 'Verify & View History ➔'}
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                    <button 
                      type="button" 
                      onClick={() => setOtpSent(false)} 
                      style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ✏️ Edit Phone Number
                    </button>
                    <button 
                      type="button" 
                      onClick={handleSendOtp} 
                      style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontWeight: 600 }}
                    >
                      🔄 Resend Code
                    </button>
                  </div>
                </form>
              )}

              {successMsg && (
                <div style={{
                  marginTop: '1.5rem',
                  backgroundColor: '#e6f4ea',
                  borderLeft: '4px solid #137333',
                  color: '#137333',
                  padding: '1rem',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  maxWidth: '480px',
                  margin: '1.5rem auto 0',
                  textAlign: 'left'
                }}>
                  ✅ {successMsg}
                </div>
              )}

              {error && (
                <div style={{
                  marginTop: '1.5rem',
                  backgroundColor: 'rgba(169, 62, 43, 0.05)',
                  borderLeft: '4px solid var(--brand-primary)',
                  color: 'var(--brand-primary-dark)',
                  padding: '1rem',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  maxWidth: '480px',
                  margin: '1.5rem auto 0',
                  textAlign: 'left'
                }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          ) : (
            /* Logged In - Show Dashboard and Orders */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* User Bar */}
              <div style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                padding: '1.25rem 2rem',
                border: '1px solid var(--border-organic)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>👤</span>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-dark)', fontSize: '1.15rem', fontWeight: 800 }}>
                      {userSession.customerName}
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Registered details: {userSession.emailOrPhone}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1.5px solid var(--brand-primary)',
                    color: 'var(--brand-primary)',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(169,62,43,0.05)'}
                  onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  Log Out 🔓
                </button>
              </div>

              {/* Order List Title */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingBottom: '0.5rem', borderBottom: '1.5px solid var(--bg-tertiary)' }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--brand-primary-dark)', fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
                  Your Order History
                </h2>
                <button
                  onClick={refreshOrders}
                  disabled={loading}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1.5px solid var(--brand-primary)',
                    color: 'var(--brand-primary)',
                    padding: '0.4rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  <span style={{ display: 'inline-block', transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform 0.5s' }}>🔄</span>
                  {loading ? 'Refreshing...' : 'Refresh Status'}
                </button>
              </div>

              {orders.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {orders.map((o) => {
                    const activeStep = getStatusStep(o.status);

                    return (
                      <div key={o._id} style={{
                        backgroundColor: '#fff',
                        borderRadius: '16px',
                        boxShadow: 'var(--shadow-sm)',
                        border: '1px solid var(--border-organic)',
                        overflow: 'hidden'
                      }}>
                        {/* Header bar */}
                        <div style={{
                          backgroundColor: 'var(--bg-secondary)',
                          borderBottom: '1px solid var(--bg-tertiary)',
                          padding: '1.25rem 2rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.75rem'
                        }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>ORDER ID:</span>
                            <div style={{ fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-dark)' }}>{o._id}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>ORDER DATE:</span>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-dark)' }}>
                              {new Date(o.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                            </div>
                          </div>
                        </div>

                        {/* Content Body */}
                        <div style={{ padding: '2rem' }}>
                          
                          {/* Visual Status Timeline Progress Bar */}
                          <div style={{ marginBottom: '2.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: '0.5rem' }}>
                              {/* Connector Line background */}
                              <div style={{
                                position: 'absolute',
                                top: '12px',
                                left: '5%',
                                right: '5%',
                                height: '4px',
                                backgroundColor: 'var(--bg-secondary)',
                                zIndex: 1
                              }} />
                              
                              {/* Active connector line */}
                              <div style={{
                                position: 'absolute',
                                top: '12px',
                                left: '5%',
                                width: `${(activeStep - 1) * 30}%`,
                                height: '4px',
                                backgroundColor: 'var(--brand-primary)',
                                zIndex: 2,
                                transition: 'width 0.3s'
                              }} />

                              {/* Steps */}
                              {[
                                { step: 1, label: 'Pending', icon: '📝' },
                                { step: 2, label: 'Processing', icon: '⚙️' },
                                { step: 3, label: 'Shipped', icon: '🚚' },
                                { step: 4, label: 'Delivered', icon: '✅' }
                              ].map((s) => {
                                const isPast = activeStep >= s.step;
                                return (
                                  <div key={s.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, width: '20%' }}>
                                    <div style={{
                                      width: '28px',
                                      height: '28px',
                                      borderRadius: '50%',
                                      backgroundColor: isPast ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                                      color: isPast ? '#fff' : 'var(--text-muted)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.85rem',
                                      fontWeight: 800,
                                      boxShadow: isPast ? '0 0 0 4px rgba(169, 62, 43, 0.15)' : 'none'
                                    }}>
                                      {isPast ? '✓' : s.step}
                                    </div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '0.5rem', color: isPast ? 'var(--brand-primary-dark)' : 'var(--text-muted)' }}>
                                      {s.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                                               {(o.courierName || o.trackingId || o.transporter || o.lrNo || o.vehicleNo) && (
                            <div style={{
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--bg-tertiary)',
                              borderRadius: '8px',
                              padding: '1.25rem 1.5rem',
                              marginBottom: '1.5rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '1rem'
                            }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--brand-primary)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Shipping &amp; Logistics Details:</div>
                                {o.courierName && <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)' }}>Courier Partner: <span style={{ color: 'var(--brand-primary)' }}>{o.courierName}</span></div>}
                                {o.trackingId && <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Tracking No / AWB: <span style={{ fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'monospace' }}>{o.trackingId}</span></div>}
                                
                                {o.transporter && <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)' }}>Transporter: <span style={{ color: 'var(--brand-primary)' }}>{o.transporter}</span></div>}
                                {o.lrNo && <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>LR / Bilty No: <span style={{ fontWeight: 700, color: 'var(--text-dark)', fontFamily: 'monospace' }}>{o.lrNo}</span></div>}
                                {o.vehicleNo && <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Vehicle No: <span style={{ fontWeight: 700, color: 'var(--text-dark)' }}>{o.vehicleNo}</span></div>}
                              </div>
                              {o.courierLink && (
                                <a
                                  href={o.courierLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    backgroundColor: 'var(--brand-primary)',
                                    color: '#fff',
                                    padding: '0.65rem 1.25rem',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    boxShadow: '0 4px 12px var(--brand-glow)',
                                    transition: 'var(--transition-fast)'
                                  }}
                                  onMouseOver={(e) => e.target.style.backgroundColor = 'var(--brand-primary-dark)'}
                                  onMouseOut={(e) => e.target.style.backgroundColor = 'var(--brand-primary)'}
                                >
                                  Track Shipment 📦
                                </a>
                              )}
                            </div>
                          )}

                          {/* Items Info */}
                          <div style={{ borderTop: '1px solid var(--bg-tertiary)', paddingTop: '1.25rem' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Ordered Formulations:</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {o.items.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: 'var(--text-dark)' }}>
                                  <span>• {item.name} ({item.size}) <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>x{item.qty}</span></span>
                                  <span style={{ fontWeight: 700 }}>₹{(item.price * item.qty).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dotted var(--bg-tertiary)', marginTop: '1rem', paddingTop: '1rem', fontSize: '1.1rem' }}>
                              <span style={{ fontWeight: 800, color: 'var(--text-dark)' }}>Total Paid Amount:</span>
                              <span style={{ fontWeight: 800, color: 'var(--brand-primary)' }}>₹{o.totalAmount.toFixed(2)}</span>
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '4rem 1rem', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid var(--border-organic)' }}>
                  <span style={{ fontSize: '2.5rem' }}>🛒</span>
                  <h3 style={{ color: 'var(--text-dark)', marginTop: '1rem' }}>No orders found</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>You haven't placed any B2B orders yet under this account.</p>
                </div>
              )}
            </div>
          )}

        </div>
      </section>

      <Footer />
    </>
  );
}
