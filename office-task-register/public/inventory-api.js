// Shared Inventory API client & Navigation for Office Task Inventory
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

      // If MongoDB has rows, update cache; if empty, cache is also empty
      if (rows.length === 0) {
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
      let txs = await this.request(path);

      // Check migration from localStorage if empty
      if (txs.length === 0) {
        try {
          const inRaw = localStorage.getItem('office_inventory_stock_in_v1');
          const outRaw = localStorage.getItem('office_inventory_stock_out_v1');
          const localIn = inRaw ? JSON.parse(inRaw) : [];
          const localOut = outRaw ? JSON.parse(outRaw) : [];

          for (const item of localIn) {
            await this.request("/api/inventory/transactions", {
              method: "POST",
              body: JSON.stringify({
                type: "in",
                date: item.date,
                invoiceNo: item.invoiceNo || item.invoiceNumber || "",
                sourceDestination: item.vendor || item.source || "",
                items: Array.isArray(item.items) ? item.items : [item]
              })
            });
          }

          for (const item of localOut) {
            await this.request("/api/inventory/transactions", {
              method: "POST",
              body: JSON.stringify({
                type: "out",
                date: item.date,
                invoiceNo: item.invoiceNo || item.invoiceNumber || "",
                sourceDestination: item.receiver || item.destination || "",
                items: Array.isArray(item.items) ? item.items : [item]
              })
            });
          }

          if (localIn.length || localOut.length) {
            txs = await this.request(path);
          }
        } catch (mErr) {
          console.warn("Tx migration warn:", mErr);
        }
      }

      return txs;
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

  async createDemandFromInventory(demandData) {
    return await this.request("/api/demands", {
      method: "POST",
      body: JSON.stringify(demandData)
    });
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
