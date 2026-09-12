import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';
import EnquiryForm from '../components/EnquiryForm';
import { API_BASE } from '../lib/products';

export default function EnquiryPage() {
  return (
    <>
      <Head>
        <title>Product Enquiry | Shekhar Bandhu Aushadhalaya</title>
        <meta name="description" content="Submit your B2B enquiry for Ayurvedic medicines, bulk orders, contract manufacturing, or custom labelling to Shekhar Bandhu Aushadhalaya." />
        <link rel="icon" type="image/png" href="/logo.png" />
      </Head>

      <Header activeNav="enquiry" />

      {/* Hero */}
      <section className="inner-page-hero" style={{ backgroundImage: "url('/brahmi_leaves.png')" }}>
        <h1 className="inner-page-title">Product Enquiry</h1>
        <p className="inner-page-subtitle">Reach out with your bulk requirements, contract manufacturing queries, or custom labelling needs. We respond within 24 hours.</p>
      </section>

      <EnquiryForm initialProductName="" apiBaseUrl={API_BASE} hideHeader={true} />

      <Footer />
    </>
  );
}
