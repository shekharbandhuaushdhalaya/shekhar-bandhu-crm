/**
 * Centralized web print helper for Shekhar Bandhu CRM.
 * Renders HTML inside a hidden background iframe to trigger the browser's native print/PDF dialog.
 * Prevents intermediate popup windows or tabs from opening.
 */
export function printHtmlInWeb(html: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = () => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    };

    const images = Array.from(doc.images);
    if (images.length > 0) {
      Promise.all(
        images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      ).then(() => {
        setTimeout(triggerPrint, 200);
      });
    } else {
      setTimeout(triggerPrint, 200);
    }
  }
}
