import React, { useState, useEffect } from 'react';

export default function EnquiryForm({ initialProductName, apiBaseUrl, hideHeader, isModal, onClose }) {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', productName: '', query: ''
  });
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialProductName) {
      setForm(prev => ({ ...prev, productName: initialProductName }));
    }
  }, [initialProductName]);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('email', form.email);
      formData.append('phone', form.phone);
      formData.append('productName', form.productName);
      formData.append('query', form.query);
      if (image) formData.append('image', image);

      const res = await fetch(`${apiBaseUrl}/api/public/queries/submit`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit enquiry');
      }
      setSuccess(true);
      setForm({ name: '', email: '', phone: '', productName: '', query: '' });
      removeImage();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (isModal) {
    return (
      <div className="modal-content checkout-modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '2.5rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        <h3 className="modal-title" style={{ fontSize: '1.5rem', marginBottom: '0.25rem', color: 'var(--brand-primary)' }}>Product Inquiry</h3>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Describe your requirements for our classical formulations.</span>
        
        {success ? (
          <div className="enquiry-success" style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div className="enquiry-success-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--brand-primary)' }}>Enquiry Submitted!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Our sales team will review your requirements and get back to you within 24 hours.</p>
            <button className="btn btn-primary" onClick={() => { setSuccess(false); onClose(); }}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase' }}>Full Name *</label>
              <input type="text" name="name" required style={{ padding: '0.65rem 1rem', border: '1px solid var(--border-organic)', borderRadius: '8px', fontSize: '0.9rem' }} value={form.name} onChange={handleChange} placeholder="e.g. Rahul Sharma" />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase' }}>Email Address *</label>
                <input type="email" name="email" required style={{ padding: '0.65rem 1rem', border: '1px solid var(--border-organic)', borderRadius: '8px', fontSize: '0.9rem', width: '100%' }} value={form.email} onChange={handleChange} placeholder="rahul@company.com" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase' }}>Phone / WhatsApp *</label>
                <input type="tel" name="phone" required style={{ padding: '0.65rem 1rem', border: '1px solid var(--border-organic)', borderRadius: '8px', fontSize: '0.9rem', width: '100%' }} value={form.phone} onChange={handleChange} placeholder="9876543210" />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase' }}>Selected Product *</label>
              <input type="text" name="productName" required style={{ padding: '0.65rem 1rem', border: '1px solid var(--border-organic)', borderRadius: '8px', fontSize: '0.9rem', backgroundColor: '#FAF3EF' }} value={form.productName} onChange={handleChange} placeholder="e.g. Dashmularishta" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase' }}>Requirements Description *</label>
              <textarea name="query" required rows="3" style={{ padding: '0.65rem 1rem', border: '1px solid var(--border-organic)', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical' }} value={form.query} onChange={handleChange} placeholder="Describe quantities, customization, or shipping requirements..." />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase' }}>Upload Prescription / Formula List (Optional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                <label 
                  htmlFor="modal-file-upload" 
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1.25rem',
                    backgroundColor: 'rgba(156, 42, 14, 0.05)',
                    border: '1px dashed var(--brand-primary)',
                    borderRadius: '8px',
                    color: 'var(--brand-primary)',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.25s ease'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(156, 42, 14, 0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(156, 42, 14, 0.05)';
                  }}
                >
                  📁 Choose File
                </label>
                <input 
                  id="modal-file-upload"
                  type="file" 
                  accept="image/*,application/pdf" 
                  style={{ display: 'none' }} 
                  onChange={handleImageChange} 
                />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                  {image ? image.name : 'No file selected'}
                </span>
              </div>
              {imagePreview && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <img src={imagePreview} style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} alt="Preview" />
                  <button type="button" onClick={removeImage} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}>✕ Remove</button>
                </div>
              )}
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ marginTop: '0.5rem', width: '100%', justifyContent: 'center' }}>
              {submitting ? 'Submitting...' : 'Submit Product Enquiry ➔'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <section id="enquiry" className="enquiry-section">
      {!hideHeader && (
        <div className="section-header">
          <span className="section-subtitle">Get in Touch</span>
          <h2 className="section-title">Product Enquiry</h2>
        </div>
      )}

      <div className="enquiry-container">
        <div className="enquiry-info">
          <div className="enquiry-info-card">
            <div className="enquiry-info-icon">📩</div>
            <h3>Send us your requirements</h3>
            <p>Describe the medicine formulation or bulk contract manufacturing requirements you need — Asava, Arishta, Syrups, Medicated Oils, packing quantities, or custom labeling. Upload a prescription or formula list if you have one.</p>
            <div className="enquiry-contact-details">
              <div className="enquiry-contact-item">
                <span className="enquiry-contact-icon">📞</span>
                <span>+91 62905 97810</span>
              </div>
              <div className="enquiry-contact-item">
                <span className="enquiry-contact-icon">✉️</span>
                <span>shekharbandhuaushadhalaya@gmail.com</span>
              </div>
              <div className="enquiry-contact-item">
                <span className="enquiry-contact-icon">📍</span>
                <span>Rohaniya Jagatpur, Varanasi (U.P.)</span>
              </div>
            </div>

            {/* Embedded Google Map */}
            <div style={{ marginTop: '1.75rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', flex: 1, minHeight: '200px', width: '100%', position: 'relative' }}>
              <iframe
                title="Shekhar Bandhu Aushadhalaya Location Map"
                src="https://maps.google.com/maps?q=Shekhar%20Bandhu%20Aushadhalaya&t=&z=16&ie=UTF8&iwloc=&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>
          </div>
        </div>

        <div className="enquiry-form-wrapper">
          {success ? (
            <div className="enquiry-success">
              <div className="enquiry-success-icon">✅</div>
              <h3>Enquiry Submitted Successfully!</h3>
              <p>Our sales team will review your requirements and get back to you within 24 hours.</p>
              <button className="btn btn-primary" onClick={() => setSuccess(false)}>Submit Another Enquiry</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="enquiry-form">
              <div className="enquiry-form-row">
                <div className="enquiry-field">
                  <label className="enquiry-label">Full Name *</label>
                  <input 
                    type="text" name="name" required
                    className="enquiry-input" 
                    placeholder="e.g. Rahul Sharma"
                    value={form.name}
                    onChange={handleChange}
                  />
                </div>
                <div className="enquiry-field">
                  <label className="enquiry-label">Phone / WhatsApp *</label>
                  <input 
                    type="tel" name="phone" required
                    className="enquiry-input" 
                    placeholder="e.g. 9876543210"
                    value={form.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="enquiry-form-row">
                <div className="enquiry-field">
                  <label className="enquiry-label">Email Address *</label>
                  <input 
                    type="email" name="email" required
                    className="enquiry-input" 
                    placeholder="e.g. rahul@company.com"
                    value={form.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="enquiry-field">
                  <label className="enquiry-label">Product Interest *</label>
                  <input 
                    type="text" name="productName" required
                    className="enquiry-input" 
                    placeholder="e.g. Abhayarishta 450ml, S.B Liv Syrup 200ml"
                    value={form.productName}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="enquiry-field">
                <label className="enquiry-label">Your Requirements / Message *</label>
                <textarea 
                  name="query" required
                  className="enquiry-textarea" 
                  placeholder="Describe your medicine requirements — quantities, sizes, custom packaging, labeling, or clinical batch details."
                  value={form.query}
                  onChange={handleChange}
                  rows={4}
                ></textarea>
              </div>

              <div className="enquiry-field">
                <label className="enquiry-label">Reference Photo (Optional)</label>
                <div className="enquiry-upload-area">
                  {imagePreview ? (
                    <div className="enquiry-image-preview">
                      <img src={imagePreview} alt="Preview" />
                      <button type="button" className="enquiry-remove-img" onClick={removeImage}>✕ Remove</button>
                    </div>
                  ) : (
                    <label className="enquiry-upload-label">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageChange}
                        style={{ display: 'none' }}
                      />
                      <div className="enquiry-upload-content">
                        <span className="enquiry-upload-icon">📷</span>
                        <span>Click to upload a reference photo</span>
                        <span className="enquiry-upload-hint">JPG, PNG up to 5MB</span>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {error && (
                <div className="enquiry-error">{error}</div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary enquiry-submit-btn"
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : '📩 Submit Enquiry'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
