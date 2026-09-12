import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useToast } from './ToastContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { showToast } = useToast();
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sba_cart');
      if (stored) {
        setCart(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load cart from localStorage:', err);
    }
  }, []);

  // Save cart to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('sba_cart', JSON.stringify(cart));
    } catch (err) {
      console.error('Failed to save cart to localStorage:', err);
    }
  }, [cart]);

  const addToCart = useCallback((product, quantity = 1) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item._id === product._id);
      if (existing) {
        const nextQty = existing.qty + quantity;
        if (nextQty > product.stockLevel) {
          showToast(`Only ${product.stockLevel} units of ${product.name} are available.`, 'warning');
          return prevCart;
        }
        showToast(`Added ${quantity} more of ${product.name} to cart.`, 'success');
        return prevCart.map((item) =>
          item._id === product._id ? { ...item, qty: nextQty } : item
        );
      } else {
        if (product.stockLevel < quantity) {
          showToast(`Only ${product.stockLevel} units of ${product.name} are available.`, 'warning');
          return prevCart;
        }
        showToast(`Added ${product.name} to cart!`, 'success');
        return [...prevCart, { ...product, qty: quantity }];
      }
    });
    setCartOpen(true);
  }, [showToast]);

  const updateQty = useCallback((productId, delta) => {
    setCart((prevCart) => {
      let limitExceeded = false;
      const nextCart = prevCart.map((item) => {
        if (item._id === productId) {
          const newQty = item.qty + delta;
          if (newQty > item.stockLevel) {
            limitExceeded = true;
            return item;
          }
          return newQty > 0 ? { ...item, qty: newQty } : null;
        }
        return item;
      }).filter(Boolean);

      if (limitExceeded) {
        const item = prevCart.find(i => i._id === productId);
        showToast(`Only ${item.stockLevel} units of ${item?.name} are available.`, 'warning');
        return prevCart;
      }
      return nextCart;
    });
  }, [showToast]);

  const removeItem = useCallback((productId) => {
    setCart((prevCart) => prevCart.filter((item) => item._id !== productId));
    showToast('Item removed from cart.', 'info');
  }, [showToast]);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);
  const cartTotal = cart.reduce((acc, item) => {
    const hasPromo = item.websitePromoActive && item.discount > 0;
    const effectivePrice = hasPromo ? item.price * (1 - item.discount / 100) : item.price;
    return acc + effectivePrice * item.qty;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        cartCount,
        cartTotal,
        cartOpen,
        setCartOpen,
        checkoutOpen,
        setCheckoutOpen,
        addToCart,
        updateQty,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
