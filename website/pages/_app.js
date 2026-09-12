import '../styles/globals.css';
import { ToastProvider } from '../context/ToastContext';
import { CartProvider } from '../context/CartContext';
import { PortalProvider } from '../context/PortalContext';

export default function MyApp({ Component, pageProps }) {
  return (
    <ToastProvider>
      <PortalProvider>
        <CartProvider>
          <Component {...pageProps} />
        </CartProvider>
      </PortalProvider>
    </ToastProvider>
  );
}
