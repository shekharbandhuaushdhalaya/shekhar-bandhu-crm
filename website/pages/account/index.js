import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { usePortal } from '../../context/PortalContext';
import { portalApi } from '../../lib/portal';

const money=n=>`₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
export default function AccountDashboard(){
 const {customer,isLoggedIn,ready,logout}=usePortal(); const router=useRouter(); const [data,setData]=useState(null); const [error,setError]=useState('');
 useEffect(()=>{ if(!ready)return; if(!isLoggedIn){router.replace('/account/login?next=/account');return;} portalApi.dashboard().then(setData).catch(e=>setError(e.message)); },[ready,isLoggedIn,router]);
 if(!ready||!isLoggedIn)return null;
 const s=data?.summary||{};
 return <><Head><title>My Account | Shekhar Bandhu Aushadhalaya</title></Head><Header activeNav="account" />
 <section className="inner-page-hero" style={{backgroundImage:"url('/aloe_leaves.png')"}}><h1 className="inner-page-title">Welcome, {customer?.name||'Customer'}</h1><p className="inner-page-subtitle">Orders, invoices, account balance and your customer-specific catalog in one place.</p></section>
 <main style={{padding:'3rem 1.5rem',background:'#FDFBF7',minHeight:600}}><div style={{maxWidth:1100,margin:'0 auto'}}>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',marginBottom:24}}><div><strong>{customer?.company||customer?.name}</strong><div style={{color:'var(--text-muted)',fontSize:'.9rem'}}>{customer?.email}</div></div><button className="btn" onClick={()=>{logout();router.push('/');}}>Sign out</button></div>
 {error&&<div style={{padding:12,background:'#fff2f2',color:'#9f1d1d',borderRadius:8}}>{error}</div>}
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16}}>
 {[['Open Orders',s.openOrders||0,'/account/orders'],['Outstanding',money(s.outstanding),'/account/invoices'],['Credit Limit',money(s.creditLimit),'/account'],['Available Credit',s.availableCredit==null?'Not limited':money(s.availableCredit),'/account']].map(([a,b,h])=><Link key={a} href={h} style={{textDecoration:'none',color:'inherit'}}><div style={{background:'#fff',border:'1px solid var(--border-organic)',borderRadius:14,padding:20}}><div style={{color:'var(--text-muted)',fontSize:'.84rem'}}>{a}</div><div style={{fontSize:'1.7rem',fontWeight:800,color:'var(--brand-primary)',marginTop:6}}>{b}</div></div></Link>)}
 </div>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:16,marginTop:24}}>
 {[['Shop with My Pricing','See customer-specific prices, schemes and live availability.','/shop'],['My Orders','Track open orders or repeat a previous order.','/account/orders'],['Invoices & Outstanding','See invoices and ageing in one place.','/account/invoices'],['Track Dispatch','View dispatch and courier details for your order.','/track']].map(([t,d,h])=><Link key={t} href={h} style={{textDecoration:'none',color:'inherit'}}><div style={{height:'100%',background:'#fff',border:'1px solid var(--border-organic)',borderRadius:14,padding:22}}><h3 style={{marginTop:0,color:'var(--brand-primary)'}}>{t}</h3><p style={{color:'var(--text-muted)',lineHeight:1.5}}>{d}</p><strong>Open →</strong></div></Link>)}
 </div>
 </div></main><Footer/></>;
}
