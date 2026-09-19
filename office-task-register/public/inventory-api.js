// Shared Inventory API client & Navigation for Office Task Inventory
(function initInventoryDarkTheme() {
  if (localStorage.getItem('user_role') === 'admin' || localStorage.getItem('admin_theme') === 'dark') {
    if (document.body) document.body.classList.add('dark-theme');
    else if (document.documentElement) document.documentElement.classList.add('dark-theme');
    window.addEventListener('DOMContentLoaded', () => {
      if (document.body) document.body.classList.add('dark-theme');
    });
  }
  const darkStyle = document.createElement('style');
  darkStyle.id = 'inventory-shared-dark-theme';
  darkStyle.textContent = `
    body.dark-theme {
      background: radial-gradient(ellipse 80% 50% at 20% -10%, rgba(99, 102, 241, 0.15), transparent),
                  radial-gradient(ellipse 60% 40% at 85% 15%, rgba(6, 182, 212, 0.12), transparent),
                  #060911 !important;
      color: #f1f5f9 !important;
    }
    body.dark-theme header {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(17, 28, 48, 0.9) 100%) !important;
      border-bottom: 2px solid transparent !important;
      border-image: linear-gradient(90deg, #f59e0b 0%, #ec4899 40%, #06b6d4 75%, #10b981 100%) 1 !important;
    }
    body.dark-theme header h1 {
      color: #f8fafc !important;
    }
    body.dark-theme .card,
    body.dark-theme .toolbar,
    body.dark-theme .tablebox,
    body.dark-theme .dialog,
    body.dark-theme .ocr-preview-wrap,
    body.dark-theme .ocr-progress-box,
    body.dark-theme .ocr-options,
    body.dark-theme .item-card {
      background: rgba(14, 22, 38, 0.88) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      color: #f1f5f9 !important;
      box-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.55) !important;
    }
    body.dark-theme input,
    body.dark-theme select,
    body.dark-theme textarea,
    body.dark-theme .paste {
      background: rgba(6, 10, 18, 0.9) !important;
      color: #f8fafc !important;
      border: 1px solid rgba(255, 255, 255, 0.14) !important;
    }
    body.dark-theme input:focus,
    body.dark-theme select:focus,
    body.dark-theme textarea:focus {
      border-color: #06b6d4 !important;
      outline: none !important;
    }
    body.dark-theme table th {
      background: rgba(10, 16, 28, 0.98) !important;
      color: #94a3b8 !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
    }
    body.dark-theme table td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
      color: #f1f5f9 !important;
    }
    body.dark-theme table tr:hover td {
      background: rgba(255, 255, 255, 0.035) !important;
    }
    body.dark-theme td input {
      color: #f8fafc !important;
    }
    body.dark-theme td input:focus {
      background: rgba(6, 10, 18, 0.95) !important;
      border-color: #06b6d4 !important;
    }
    body.dark-theme tr.lowrow {
      background: rgba(245, 158, 11, 0.08) !important;
    }
    body.dark-theme tr.outrow,
    body.dark-theme tr.shortrow {
      background: rgba(244, 63, 94, 0.1) !important;
    }
    body.dark-theme tr.extrarow {
      background: rgba(245, 158, 11, 0.12) !important;
    }
    body.dark-theme .label,
    body.dark-theme .hint,
    body.dark-theme .section-title span {
      color: #94a3b8 !important;
    }
    body.dark-theme .num,
    body.dark-theme .section-title h2 {
      color: #f8fafc !important;
    }
    body.dark-theme button.secondary {
      background: rgba(255, 255, 255, 0.06) !important;
      color: #f1f5f9 !important;
      border-color: rgba(255, 255, 255, 0.18) !important;
    }
    body.dark-theme button.secondary:hover {
      background: rgba(255, 255, 255, 0.14) !important;
    }
    body.dark-theme .ocr-dropzone {
      background: rgba(2, 132, 199, 0.08) !important;
      border-color: rgba(2, 132, 199, 0.4) !important;
      color: #e0f2fe !important;
    }
    body.dark-theme .ocr-dropzone.dragover {
      background: rgba(2, 132, 199, 0.18) !important;
    }
    body.dark-theme .ocr-dropzone .sub {
      color: #94a3b8 !important;
    }
    body.dark-theme .preview-table-container {
      border-color: rgba(255, 255, 255, 0.1) !important;
    }
    body.dark-theme .preview-table-container th {
      background: rgba(15, 23, 42, 0.9) !important;
      color: #94a3b8 !important;
    }
    body.dark-theme .tab-header {
      border-bottom-color: rgba(255, 255, 255, 0.1) !important;
    }
    body.dark-theme .tab-btn {
      color: #94a3b8 !important;
    }
    body.dark-theme .tab-btn.active {
      color: #38bdf8 !important;
      border-bottom-color: #38bdf8 !important;
    }
    body.dark-theme .formgrid label {
      color: #cbd5e1 !important;
    }
    body.dark-theme .legend {
      color: #cbd5e1 !important;
    }
    body.dark-theme .warehouse-badge {
      background: rgba(255, 255, 255, 0.08) !important;
      color: #e2e8f0 !important;
    }
    body.dark-theme ::-webkit-scrollbar { width: 8px; height: 8px; }
    body.dark-theme ::-webkit-scrollbar-track { background: rgba(6, 10, 18, 0.8); }
    body.dark-theme ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
    body.dark-theme ::-webkit-scrollbar-thumb:hover { background: #334155; }
  `;
  document.head ? document.head.appendChild(darkStyle) : window.addEventListener('DOMContentLoaded', () => document.head.appendChild(darkStyle));
})();

const InventoryAPI = {
  async request(path, opts = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(path, {
        ...opts,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers || {})
        },
        credentials: "include"
      });
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) {
        throw new Error((data && data.error) || "Request failed with status " + res.status);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  },

  async checkAdmin() {
    try {
      const me = await this.request("/api/me");
      if (me.role !== "admin") {
        alert("Admin access is required to view and manage inventory.");
        location.href = "/";
        return null;
      }
      localStorage.setItem("user_role", "admin");
      localStorage.setItem("admin_theme", "dark");
      document.body.classList.add("dark-theme");
      return me;
    } catch (e) {
      alert("Please log in with admin account.");
      location.href = "/";
      return null;
    }
  },

  async loadInventory() {
    try {
      const res = await this.request("/api/inventory");
      let rows = Array.isArray(res.rows) ? res.rows : [];
      let extraFields = Array.isArray(res.extraFields) ? res.extraFields : [];

      // If MongoDB has rows, update cache; if empty and no local rows exist, then set empty
      if (rows.length === 0 && (!localStorage.getItem('office_inventory_v1') || localStorage.getItem('office_inventory_v1') === '[]')) {
        localStorage.setItem('office_inventory_v1', '[]');
      }

      // Check extra fields migration
      if (extraFields.length <= 3) {
        try {
          const localExtra = localStorage.getItem('office_inventory_extra_fields_v1');
          if (localExtra) {
            const parsedExtra = JSON.parse(localExtra);
            if (Array.isArray(parsedExtra) && parsedExtra.length > extraFields.length) {
              await this.saveConfig("extra_fields", parsedExtra);
              extraFields = parsedExtra;
            }
          }
        } catch (e) {}
      }

      return { rows, extraFields };
    } catch (err) {
      console.error("Failed to load inventory from server, checking local cache:", err);
      const cached = localStorage.getItem('office_inventory_v1');
      return {
        rows: cached ? JSON.parse(cached) : [],
        extraFields: [
          { key: 'warehouseName', label: 'Warehouse Name' },
          { key: 'invoiceNumber', label: 'Invoice Number' },
          { key: 'entryTime', label: 'Entry Time' }
        ]
      };
    }
  },

  async saveInventory(rows) {
    try {
      localStorage.setItem('office_inventory_v1', JSON.stringify(rows));
      return await this.request("/api/inventory/save-all", {
        method: "POST",
        body: JSON.stringify({ rows })
      });
    } catch (e) {
      console.error("Save inventory to server error:", e);
      throw e;
    }
  },

  async getConfig(key) {
    try {
      const res = await this.request("/api/inventory/config/" + encodeURIComponent(key));
      return res.value;
    } catch (e) {
      console.warn("Get config error for", key, e);
      const local = localStorage.getItem(key);
      return local ? JSON.parse(local) : null;
    }
  },

  async saveConfig(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return await this.request("/api/inventory/config/" + encodeURIComponent(key), {
        method: "POST",
        body: JSON.stringify({ value })
      });
    } catch (e) {
      console.error("Save config error for", key, e);
      throw e;
    }
  },

  async getTransactions(type) {
    try {
      const path = "/api/inventory/transactions" + (type ? "?type=" + type : "");
      const txs = await this.request(path);
      return Array.isArray(txs) ? txs : [];
    } catch (e) {
      console.error("Load transactions error:", e);
      return [];
    }
  },

  async addTransaction(tx) {
    return await this.request("/api/inventory/transactions", {
      method: "POST",
      body: JSON.stringify(tx)
    });
  },

  async deleteTransaction(txId, itemIndex) {
    const q = itemIndex !== undefined ? '?itemIndex=' + encodeURIComponent(itemIndex) : '';
    return await this.request('/api/inventory/transactions/' + encodeURIComponent(txId) + q, {
      method: 'DELETE'
    });
  },

  async clearTransactions(type) {
    const q = type ? '?type=' + encodeURIComponent(type) : '';
    return await this.request('/api/inventory/transactions' + q, {
      method: 'DELETE'
    });
  },

  async createDemandFromInventory(demandData) {
    return await this.request("/api/demands", {
      method: "POST",
      body: JSON.stringify(demandData)
    });
  },

  exportToCSV(filename, rows) {
    if (!Array.isArray(rows) || !rows.length) {
      alert("No data to export.");
      return;
    }
    // UTF-8 BOM for Microsoft Excel compatibility
    const BOM = "\uFEFF";
    const csvContent = rows.map(row => 
      row.map(val => {
        const str = val === null || val === undefined ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',')
    ).join('\r\n');

    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.setAttribute('download', filename.toLowerCase().endsWith('.csv') ? filename : filename + '.csv');
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  },

  injectNavbar(activeTab) {
    const existing = document.querySelectorAll(".office-global-nav");
    if (existing.length > 0) {
      for (let i = 1; i < existing.length; i++) existing[i].remove();
      return;
    }
    const nav = document.createElement("nav");
    nav.className = "office-global-nav";
    nav.innerHTML = `
      <div class="nav-inner">
        <div class="nav-brand">
          <span class="nav-logo">📦</span>
          <span class="nav-title">Office Task &amp; Inventory</span>
        </div>
        <div class="nav-links">
          <a href="/" class="nav-item">🏠 Tasks</a>
          <a href="/demands-admin.html" class="nav-item">📋 Admin Demands</a>
          <a href="/demands.html" class="nav-item">⚡ Employee Demands</a>
          <span class="nav-sep">|</span>
          <a href="/inventory.html" class="nav-item \${activeTab === 'inventory' ? 'active' : ''}">📦 Stock</a>
          <a href="/stock-in.html" class="nav-item \${activeTab === 'stock-in' ? 'active' : ''}">📥 In</a>
          <a href="/stock-out.html" class="nav-item \${activeTab === 'stock-out' ? 'active' : ''}">📤 Out</a>
          <a href="/transactions.html" class="nav-item \${activeTab === 'transactions' ? 'active' : ''}">📊 Log</a>
          <a href="/virtual.html" class="nav-item \${activeTab === 'virtual' ? 'active' : ''}">Virtual WH</a>
          <a href="/compare.html" class="nav-item \${activeTab === 'compare' ? 'active' : ''}">Compare</a>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .office-global-nav {
        background: #0f2d4a;
        color: #fff;
        padding: 10px 18px;
        font-family: Inter, Segoe UI, sans-serif;
        font-size: 13px;
        border-bottom: 2px solid #b08d3e;
      }
      .nav-inner {
        max-width: 1440px;
        margin: auto;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .nav-brand {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 15px;
        color: #f1ece0;
      }
      .nav-links {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .nav-item {
        color: #d1d5db;
        text-decoration: none;
        padding: 6px 11px;
        border-radius: 5px;
        font-weight: 500;
        transition: all .15s ease;
      }
      .nav-item:hover {
        background: rgba(255,255,255,0.12);
        color: #fff;
      }
      .nav-item.active {
        background: #b08d3e;
        color: #fff;
        font-weight: 700;
      }
      .nav-sep {
        color: #64748b;
        margin: 0 4px;
      }
      @media (max-width: 768px) {
        .nav-inner { flex-direction: column; align-items: flex-start; }
      }
    `;
    document.head.appendChild(style);
    document.body.insertBefore(nav, document.body.firstChild);
  }
};
