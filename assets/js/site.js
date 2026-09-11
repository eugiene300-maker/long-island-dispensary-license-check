/* Shared site behavior: age gate, mobile menu, newsletter/contact forms. */
window.SITE_CONFIG = {
  // Paste a Formspree / Getform / Basin endpoint here (e.g. "https://formspree.io/f/abcd1234")
  // to collect newsletter + contact submissions. Left blank, forms fall back to opening an email.
  FORM_ENDPOINT: "",
  CONTACT_EMAIL: "hello@longislanddispensarycheck.com",
};

(function () {
  // ---- 21+ age gate (remembered for 30 days) ----
  const KEY = 'lidc_age_ok';
  const gate = document.getElementById('agegate');
  let ok = false;
  try { ok = Number(localStorage.getItem(KEY) || 0) > Date.now(); } catch (e) {}
  if (gate && !ok) {
    gate.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    gate.querySelector('[data-age-yes]').addEventListener('click', () => {
      try { localStorage.setItem(KEY, String(Date.now() + 30 * 864e5)); } catch (e) {}
      gate.hidden = true; document.documentElement.style.overflow = '';
    });
    gate.querySelector('[data-age-no]').addEventListener('click', () => {
      gate.querySelector('.agebox').innerHTML = '<h2>Sorry — you must be 21+</h2><p>This site is intended only for adults 21 and older.</p>';
    });
  }

  // ---- mobile menu ----
  const btn = document.querySelector('.menu-btn');
  const links = document.querySelector('.nav-links');
  if (btn && links) btn.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
  });

  // ---- forms (newsletter + contact) ----
  document.querySelectorAll('form[data-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const kind = form.dataset.form;
      const msg = form.parentElement.querySelector('.form-msg') || form.querySelector('.form-msg');
      const data = new FormData(form);
      data.append('form', kind);
      data.append('page', location.pathname);
      const cfg = window.SITE_CONFIG;
      if (!cfg.FORM_ENDPOINT) {
        const body = [...data.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
        const subj = kind === 'newsletter' ? 'Newsletter signup' : 'Contact form';
        location.href = `mailto:${cfg.CONTACT_EMAIL}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
        return;
      }
      try {
        const res = await fetch(cfg.FORM_ENDPOINT, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        if (msg) { msg.textContent = kind === 'newsletter' ? "You're in! Watch your inbox for this week's vote." : "Thanks — we'll get back to you within 2 business days."; msg.style.color = ''; }
      } catch (err) {
        if (msg) { msg.textContent = 'Something went wrong. Please email ' + cfg.CONTACT_EMAIL; msg.style.color = '#ffb4a8'; }
      }
    });
  });

  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
})();
