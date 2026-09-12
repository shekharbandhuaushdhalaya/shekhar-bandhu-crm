import { useState } from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import Footer from '../components/Footer';
import DoshaConsultationQuiz from '../components/DoshaConsultationQuiz';
import ProductModal from '../components/ProductModal';
import { fetchProducts, API_BASE } from '../lib/products';

export async function getStaticProps() {
  try {
    const products = await fetchProducts();
    return { props: { products }, revalidate: 60 };
  } catch {
    return { props: { products: [] }, revalidate: 30 };
  }
}

export default function QuizPage({ products }) {
  const [selectedProduct, setSelectedProduct] = useState(null);

  return (
    <>
      <Head>
        <title>Dosha Consultation Quiz | Shekhar Bandhu Aushadhalaya</title>
        <meta name="description" content="Discover your Ayurvedic Dosha (Vata, Pitta, Kapha) and get personalised product recommendations from Shekhar Bandhu Aushadhalaya." />
        <link rel="icon" type="image/png" href="/logo.png" />
      </Head>

      <Header activeNav="quiz" />

      {/* Hero Header with Tulsi background */}
      <section className="inner-page-hero" style={{ backgroundImage: "url('/tulsi_leaves.png')" }}>
        <h1 className="inner-page-title">
          Dosha Consultation
        </h1>
        <p className="inner-page-subtitle">
          Discover your unique Ayurvedic mind-body constitution (Prakriti) and receive personalized recommendations.
        </p>
      </section>

      <DoshaConsultationQuiz
        products={products}
        onSelectProduct={(rec) => setSelectedProduct(rec)}
        onCloseQuiz={() => setSelectedProduct(null)}
      />

      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onEnquire={() => setSelectedProduct(null)}
        onAddToCart={() => {}}
        apiBaseUrl={API_BASE}
      />

      <Footer />
    </>
  );
}
