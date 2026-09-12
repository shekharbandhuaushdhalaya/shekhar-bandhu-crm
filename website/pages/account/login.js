import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { usePortal } from '../../context/PortalContext';

export default function CustomerLoginPage() {
  const router = useRouter();
  const { login, isLoggedIn, ready } = usePortal();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (ready && isLoggedIn) router.replace('/account'); }, [ready, isLoggedIn, router]);

  async function handleSubmit(e) {
    e.preventDefault(); setLoading(true); setError('');
    try { await login(email, password); router.replace(router.query.next || '/account'); }
    catch (e) { setError(e.message || 'Unable to sign in.'); }
    finally { setLoading(false); }
  }

  return <>
    <Head><title>Customer Login | Shekhar Bandhu Aushadhalaya</title></Head>
    <Header activeNav="account" />
    <section className="inner-page-hero" style={{ backgroundImage: "url('/aloe_leaves.png')" }}>
      <h1 className="inner-page-title">Customer Self Service</h1>
      <p className="inner-page-subtitle">Sign in to see your trade pricing, place repeat orders and manage your account.</p>
    </section>
    <main style={{background:'#FDFBF7', minHeight:560, padding:'4rem 1.25rem'}}>
      <form onSubmit={handleSubmit} style={{maxWidth:480, margin:'0 auto', background:'#fff', padding:'2.5rem', borderRadius:18, border:'1px solid var(--border-organic)', boxShadow:'var(--shadow-md)'}}>
        <h2 style={{marginTop:0, color:'var(--brand-primary)'}}>Sign in to your account</h2>
        <p style={{color:'var(--text-muted)'}}>Portal access must be enabled for your customer account by Shekhar Bandhu.</p>
        <label style={{display:'block',fontWeight:700,marginTop:20}}>Email</label>
        <input className="search-input" style={{paddingLeft:'1rem',marginTop:6}} type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" />
        <label style={{display:'block',fontWeight:700,marginTop:16}}>Password</label>
        <input className="search-input" style={{paddingLeft:'1rem',marginTop:6}} type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <div style={{marginTop:16,padding:12,borderRadius:8,background:'#fff2f2',color:'#9f1d1d'}}>{error}</div>}
        <button className="btn btn-primary" style={{width:'100%',marginTop:22}} disabled={loading}>{loading?'Signing in...':'Sign In'}</button>
        <p style={{fontSize:'.86rem',color:'var(--text-muted)',marginTop:18}}>Need portal access? Contact your sales representative or use the Enquiry page.</p>
      </form>
    </main>
    <Footer />
  </>;
}
