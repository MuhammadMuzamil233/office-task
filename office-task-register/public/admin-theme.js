/**
 * Admin Multi-Theme Management System
 * Exclusively for Admin accounts.
 * Themes:
 *  1. cyber    - Cyber Dark (Obsidian & Cyan / Amber accents) [Default]
 *  2. midnight - Midnight Navy (Oceanic Sapphire & Electric Ice Blue accents)
 *  3. emerald  - Emerald Forest (Botanical Dark & Mint / Jade accents)
 *  4. purple   - Royal Amethyst (Cosmic Obsidian & Neon Violet accents)
 *  5. light    - Standard Light Mode
 */
(function(window) {
  'use strict';

  const THEMES = [
    { id: 'cyber', name: 'Dark (Slate)', desc: 'Slate' },
    { id: 'midnight', name: 'Dark (Navy)', desc: 'Navy' },
    { id: 'emerald', name: 'Dark (Forest)', desc: 'Forest' },
    { id: 'purple', name: 'Dark (Charcoal)', desc: 'Charcoal' },
    { id: 'light', name: 'Light Mode', desc: 'Light' }
  ];

  const THEME_IDS = ['cyber', 'midnight', 'emerald', 'purple', 'light'];

  const AdminTheme = {
    THEMES,
    
    isAdmin() {
      const role = localStorage.getItem('user_role');
      if (role === 'admin') return true;
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('demands-admin') || path.includes('admin.html')) {
        return true;
      }
      return false;
    },

    getTheme() {
      if (!this.isAdmin()) return 'light';
      let t = localStorage.getItem('admin_theme');
      if (!t || t === 'dark') {
        t = 'cyber';
        localStorage.setItem('admin_theme', 'cyber');
      }
      return THEME_IDS.includes(t) ? t : 'cyber';
    },

    setTheme(themeId) {
      if (!THEME_IDS.includes(themeId)) themeId = 'cyber';
      
      if (!this.isAdmin()) {
        this.apply();
        return;
      }

      localStorage.setItem('admin_theme', themeId);
      this.apply();
      this.syncSwitchers(themeId);
      
      window.dispatchEvent(new CustomEvent('admin-theme-changed', { detail: { theme: themeId } }));
    },

    apply() {
      const isAdminUser = this.isAdmin();
      const themeId = this.getTheme();

      const allThemeClasses = ['dark-theme', 'theme-cyber', 'theme-midnight', 'theme-emerald', 'theme-purple'];
      
      const targets = [document.body, document.documentElement].filter(Boolean);
      targets.forEach(el => {
        allThemeClasses.forEach(cls => el.classList.remove(cls));
      });

      if (!isAdminUser) {
        localStorage.removeItem('admin_theme');
        return;
      }

      if (themeId !== 'light') {
        targets.forEach(el => {
          el.classList.add('dark-theme');
          el.classList.add('theme-' + themeId);
        });
      }
    },

    syncSwitchers(currentTheme) {
      document.querySelectorAll('.admin-theme-select').forEach(sel => {
        if (sel.value !== currentTheme) {
          sel.value = currentTheme;
        }
      });
    },

    createSwitcher() {
      if (!this.isAdmin()) return null;

      const currentTheme = this.getTheme();
      const container = document.createElement('div');
      container.className = 'admin-theme-select-wrap';
      container.title = 'Admin Theme';

      const select = document.createElement('select');
      select.className = 'admin-theme-select';
      select.setAttribute('aria-label', 'Select Admin Theme');

      THEMES.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        if (t.id === currentTheme) opt.selected = true;
        select.appendChild(opt);
      });

      select.addEventListener('change', (e) => {
        this.setTheme(e.target.value);
      });

      container.appendChild(select);
      return container;
    },

    mountSwitcher(target) {
      if (!this.isAdmin()) return;
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return;

      const switcher = this.createSwitcher();
      if (!switcher) return;

      if (el.tagName === 'BUTTON' || el.classList.contains('button')) {
        if (el.id) switcher.id = el.id;
        if (el.className) switcher.className = el.className + ' admin-theme-select-wrap';
        if (el.parentNode) el.parentNode.replaceChild(switcher, el);
      } else {
        el.innerHTML = '';
        el.appendChild(switcher);
      }
    },

    injectStyles() {
      if (document.getElementById('admin-multi-theme-styles')) return;

      const style = document.createElement('style');
      style.id = 'admin-multi-theme-styles';
      style.textContent = `
        /* ===== ADMIN MULTI-THEME CSS VARIABLES ===== */
        
        /* 1. Dark Slate (Default) */
        body.dark-theme,
        body.dark-theme.theme-cyber {
          --adm-bg: #0b0f19;
          --adm-bg-grad: #0b0f19;
          --adm-card-bg: #111827;
          --adm-card-border: #1f2937;
          --adm-card-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          --adm-header-bg: #111827;
          --adm-header-border: #0ea5e9;
          --adm-nav-bg: #0f172a;
          --adm-nav-border: #0ea5e9;
          --adm-accent: #0ea5e9;
          --adm-accent-rgb: 14, 165, 233;
          --adm-accent-hover: #38bdf8;
          --adm-table-th: #0f172a;
          --adm-table-border: #1f2937;
          --adm-input-bg: #0f172a;
          --adm-input-border: #334155;
          --adm-text: #f1f5f9;
          --adm-text-muted: #94a3b8;
          --adm-text-bright: #ffffff;
          --adm-badge-bg: rgba(14, 165, 233, 0.12);
          --adm-badge-border: rgba(14, 165, 233, 0.35);
        }

        /* 2. Dark Navy */
        body.dark-theme.theme-midnight {
          --adm-bg: #070d18;
          --adm-bg-grad: #070d18;
          --adm-card-bg: #0c1526;
          --adm-card-border: #1e293b;
          --adm-card-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          --adm-header-bg: #0c1526;
          --adm-header-border: #38bdf8;
          --adm-nav-bg: #070d18;
          --adm-nav-border: #38bdf8;
          --adm-accent: #38bdf8;
          --adm-accent-rgb: 56, 189, 248;
          --adm-accent-hover: #7dd3fc;
          --adm-table-th: #070d18;
          --adm-table-border: #1e293b;
          --adm-input-bg: #070d18;
          --adm-input-border: #1e293b;
          --adm-text: #f0f9ff;
          --adm-text-muted: #93c5fd;
          --adm-text-bright: #ffffff;
          --adm-badge-bg: rgba(56, 189, 248, 0.12);
          --adm-badge-border: rgba(56, 189, 248, 0.35);
        }

        /* 3. Dark Forest */
        body.dark-theme.theme-emerald {
          --adm-bg: #05130e;
          --adm-bg-grad: #05130e;
          --adm-card-bg: #0a1f18;
          --adm-card-border: #133327;
          --adm-card-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          --adm-header-bg: #0a1f18;
          --adm-header-border: #10b981;
          --adm-nav-bg: #05130e;
          --adm-nav-border: #10b981;
          --adm-accent: #10b981;
          --adm-accent-rgb: 16, 185, 129;
          --adm-accent-hover: #34d399;
          --adm-table-th: #05130e;
          --adm-table-border: #133327;
          --adm-input-bg: #05130e;
          --adm-input-border: #133327;
          --adm-text: #ecfdf5;
          --adm-text-muted: #86efac;
          --adm-text-bright: #ffffff;
          --adm-badge-bg: rgba(16, 185, 129, 0.12);
          --adm-badge-border: rgba(16, 185, 129, 0.35);
        }

        /* 4. Dark Charcoal (Replaces Purple/Amethyst) */
        body.dark-theme.theme-purple {
          --adm-bg: #111418;
          --adm-bg-grad: #111418;
          --adm-card-bg: #181c22;
          --adm-card-border: #28303a;
          --adm-card-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          --adm-header-bg: #181c22;
          --adm-header-border: #64748b;
          --adm-nav-bg: #111418;
          --adm-nav-border: #64748b;
          --adm-accent: #94a3b8;
          --adm-accent-rgb: 148, 163, 184;
          --adm-accent-hover: #cbd5e1;
          --adm-table-th: #111418;
          --adm-table-border: #28303a;
          --adm-input-bg: #111418;
          --adm-input-border: #28303a;
          --adm-text: #f8fafc;
          --adm-text-muted: #94a3b8;
          --adm-text-bright: #ffffff;
          --adm-badge-bg: rgba(148, 163, 184, 0.12);
          --adm-badge-border: rgba(148, 163, 184, 0.35);
        }

        /* ===== UNIFIED APPLIED STYLES WHEN DARK THEME IS ACTIVE ===== */
        body.dark-theme {
          background: var(--adm-bg) !important;
          color: var(--adm-text) !important;
          transition: background 0.2s ease, color 0.2s ease;
        }

        body.dark-theme header,
        body.dark-theme header.book {
          background: var(--adm-header-bg) !important;
          border-bottom: 2px solid var(--adm-header-border) !important;
        }

        body.dark-theme header h1,
        body.dark-theme header.book h1 {
          color: var(--adm-text-bright) !important;
        }

        body.dark-theme .card,
        body.dark-theme .wrap,
        body.dark-theme .toolbar,
        body.dark-theme .tablebox,
        body.dark-theme .dialog,
        body.dark-theme .ocr-preview-wrap,
        body.dark-theme .ocr-progress-box,
        body.dark-theme .ocr-options,
        body.dark-theme .item-card,
        body.dark-theme .filters-bar,
        body.dark-theme .demand-row,
        body.dark-theme .task-item,
        body.dark-theme .admin-request,
        body.dark-theme section.card {
          background: var(--adm-card-bg) !important;
          border: 1px solid var(--adm-card-border) !important;
          color: var(--adm-text) !important;
          box-shadow: var(--adm-card-shadow) !important;
        }

        body.dark-theme input,
        body.dark-theme select,
        body.dark-theme textarea,
        body.dark-theme .paste {
          background: var(--adm-input-bg) !important;
          color: var(--adm-text-bright) !important;
          border: 1px solid var(--adm-input-border) !important;
        }

        body.dark-theme input:focus,
        body.dark-theme select:focus,
        body.dark-theme textarea:focus,
        body.dark-theme td input:focus {
          border-color: var(--adm-accent) !important;
          box-shadow: 0 0 0 3px rgba(var(--adm-accent-rgb), 0.3) !important;
          outline: none !important;
        }

        body.dark-theme table th,
        body.dark-theme .preview-table-container th {
          background: var(--adm-table-th) !important;
          color: var(--adm-text-muted) !important;
          border-bottom: 1px solid var(--adm-table-border) !important;
        }

        body.dark-theme table td {
          border-bottom: 1px solid var(--adm-table-border) !important;
          color: var(--adm-text) !important;
        }

        body.dark-theme table tr:hover td {
          background: rgba(255, 255, 255, 0.035) !important;
        }

        body.dark-theme td input {
          color: var(--adm-text-bright) !important;
          background: var(--adm-input-bg) !important;
        }

        body.dark-theme button.button,
        body.dark-theme button.secondary,
        body.dark-theme button.action:not(.approve):not(.complete):not(.reject):not(.cancel) {
          background: rgba(255, 255, 255, 0.06) !important;
          color: var(--adm-text) !important;
          border: 1px solid var(--adm-input-border) !important;
        }

        body.dark-theme button.button:hover,
        body.dark-theme button.secondary:hover {
          background: rgba(255, 255, 255, 0.14) !important;
          border-color: var(--adm-accent) !important;
        }

        body.dark-theme .nav-item.active {
          background: var(--adm-accent) !important;
          color: #fff !important;
        }

        body.dark-theme nav.office-global-nav {
          background: var(--adm-nav-bg) !important;
          border-bottom-color: var(--adm-nav-border) !important;
        }

        body.dark-theme .label,
        body.dark-theme .hint,
        body.dark-theme .section-title span,
        body.dark-theme .empty {
          color: var(--adm-text-muted) !important;
        }

        body.dark-theme .num,
        body.dark-theme .section-title h2,
        body.dark-theme h2 {
          color: var(--adm-text-bright) !important;
        }

        body.dark-theme .tab-btn.active {
          color: var(--adm-accent) !important;
          border-bottom-color: var(--adm-accent) !important;
        }

        body.dark-theme ::-webkit-scrollbar { width: 8px; height: 8px; }
        body.dark-theme ::-webkit-scrollbar-track { background: var(--adm-bg); }
        body.dark-theme ::-webkit-scrollbar-thumb {
          background: rgba(var(--adm-accent-rgb), 0.28) !important;
          border-radius: 4px;
        }
        body.dark-theme ::-webkit-scrollbar-thumb:hover {
          background: rgba(var(--adm-accent-rgb), 0.55) !important;
        }

        /* ===== THEME SWITCHER SELECT COMPONENT ===== */
        .admin-theme-select-wrap {
          display: inline-flex;
          align-items: center;
          position: relative;
          vertical-align: middle;
        }

        .admin-theme-select {
          appearance: none;
          -webkit-appearance: none;
          background: var(--adm-badge-bg, rgba(14, 165, 233, 0.12));
          border: 1px solid var(--adm-badge-border, rgba(14, 165, 233, 0.35));
          color: var(--adm-accent, #0ea5e9);
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 26px 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          outline: none;
          transition: all 0.15s ease;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230ea5e9' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
        }

        body.dark-theme.theme-midnight .admin-theme-select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2338bdf8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        }
        body.dark-theme.theme-emerald .admin-theme-select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        }
        body.dark-theme.theme-purple .admin-theme-select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        }

        .admin-theme-select:hover {
          filter: brightness(1.2);
          transform: translateY(-1px);
        }

        .admin-theme-select option {
          background: #0b1324;
          color: #f1f5f9;
          font-size: 13px;
          padding: 8px 12px;
        }

        body:not(.dark-theme) .admin-theme-select {
          background: rgba(15, 61, 62, 0.08);
          border: 1.5px solid rgba(15, 61, 62, 0.25);
          color: #0f3d3e;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230f3d3e' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
        }

        body:not(.dark-theme) .admin-theme-select option {
          background: #ffffff;
          color: #1c2b27;
        }
      `;
      document.head ? document.head.appendChild(style) : window.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    },

    init() {
      this.injectStyles();
      this.apply();

      const mountExistingButtons = () => {
        if (!this.isAdmin()) return;
        
        const targetIds = ['adminThemeBtn', 'themeToggleBtn', 'adminThemeContainer', 'navAdminThemeSlot'];
        targetIds.forEach(id => {
          const btn = document.getElementById(id);
          if (btn && !btn.dataset.themeReplaced) {
            btn.dataset.themeReplaced = 'true';
            this.mountSwitcher(btn);
          }
        });
      };

      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', mountExistingButtons);
      } else {
        mountExistingButtons();
      }

      window.addEventListener('storage', (e) => {
        if (e.key === 'admin_theme' || e.key === 'user_role') {
          this.apply();
          this.syncSwitchers(this.getTheme());
        }
      });
    }
  };

  // Immediate early execution to prevent flickering
  AdminTheme.apply();
  AdminTheme.init();

  window.AdminTheme = AdminTheme;
})(window);
