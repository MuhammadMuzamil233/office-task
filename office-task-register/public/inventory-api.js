// Shared Inventory API client & Navigation for Office Task Inventory
(function initInventoryDarkTheme() {
  if (typeof window !== 'undefined' && !window.AdminTheme) {
    const themeScript = document.createElement('script');
    themeScript.src = '/admin-theme.js';
    if (document.head) document.head.appendChild(themeScript);
    else window.addEventListener('DOMContentLoaded', () => document.head.appendChild(themeScript));
  }
  if (localStorage.getItem('user_role') === 'admin' || (localStorage.getItem('admin_theme') && localStorage.getItem('admin_theme') !== 'light')) {
    const t = localStorage.getItem('admin_theme') || 'cyber';
    const themeClass = t === 'dark' ? 'theme-cyber' : 'theme-' + t;
    if (document.body) {
      document.body.classList.add('dark-theme', themeClass);
    } else if (document.documentElement) {
      document.documentElement.classList.add('dark-theme', themeClass);
    }
    window.addEventListener('DOMContentLoaded', () => {
      if (document.body) document.body.classList.add('dark-theme', themeClass);
      if (window.AdminTheme) window.AdminTheme.apply();
    });
  }
})();

const InventoryAPI = {
  async request(path, opts = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const selectedBranch = localStorage.getItem("admin_selected_branch") || "";
      const headers = {
        "Content-Type": "application/json",
        ...(opts.headers || {})
      };
      if (selectedBranch && selectedBranch !== "all") {
        headers["x-branch"] = selectedBranch;
      }
      const res = await fetch(path, {
        ...opts,
        signal: controller.signal,
        headers,
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
      this.currentUser = me;
      localStorage.setItem("user_role", "admin");
      if (me.isSuperAdmin) localStorage.setItem("is_super_admin", "true");
      else localStorage.removeItem("is_super_admin");
      localStorage.setItem("user_branch", me.branch || "akbarelectronics");
      localStorage.setItem("user_branch_name", me.branchName || me.branch || "Akbar Electronics");
      if (!localStorage.getItem("admin_theme")) localStorage.setItem("admin_theme", "cyber");
      if (window.AdminTheme) window.AdminTheme.apply();
      else document.body.classList.add("dark-theme");
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

  exportToExcel(filename, rows, sheetName = 'Inventory') {
    if (!Array.isArray(rows) || !rows.length) {
      alert("No data to export.");
      return;
    }
    const cleanName = filename.toLowerCase().endsWith('.xlsx') ? filename : filename.replace(/\.csv$/, '') + '.xlsx';

    if (window.XLSX && typeof window.XLSX.utils?.aoa_to_sheet === 'function') {
      const ws = window.XLSX.utils.aoa_to_sheet(rows);

      // Auto-fit column widths
      if (rows[0]) {
        ws['!cols'] = rows[0].map((header, colIdx) => {
          let maxLen = String(header || '').length;
          for (let r = 1; r < rows.length; r++) {
            const val = rows[r][colIdx];
            const strLen = val == null ? 0 : String(val).length;
            if (strLen > maxLen) maxLen = strLen;
          }
          return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
        });
      }

      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, String(sheetName || 'Sheet1').slice(0, 31));
      window.XLSX.writeFile(wb, cleanName);
      return true;
    }

    // Fallback: Excel XML Spreadsheet (.xls) which Microsoft Excel natively opens as a workbook
    return this.exportToExcelXML(cleanName.replace(/\.xlsx$/, '.xls'), rows, sheetName);
  },

  exportToExcelXML(filename, rows, sheetName = 'Inventory') {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0F2D4A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Number">
   <NumberFormat ss:Format="0"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${esc(sheetName)}">
  <Table>`;

    rows.forEach((row, rIdx) => {
      xml += '\n   <Row>';
      row.forEach(val => {
        const isHeader = rIdx === 0;
        const isNum = typeof val === 'number' || (!isNaN(val) && val !== '' && !isHeader);
        const style = isHeader ? ' ss:StyleID="Header"' : (isNum ? ' ss:StyleID="Number"' : '');
        const type = isNum ? 'Number' : 'String';
        xml += `<Cell${style}><Data ss:Type="${type}">${esc(val)}</Data></Cell>`;
      });
      xml += '</Row>';
    });

    xml += `\n  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
    return true;
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
          <a href="/virtual.html" class="nav-item ${activeTab === 'virtual' ? 'active' : ''}">Virtual WH</a>
          <a href="/compare.html" class="nav-item ${activeTab === 'compare' ? 'active' : ''}">Compare</a>
          <span id="navBranchContainer" style="margin-left:6px;display:inline-flex;align-items:center;"></span>
          <span id="navAdminThemeSlot" style="margin-left:6px;display:inline-flex;align-items:center;"></span>
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
    this.mountBranchSwitcher('#navBranchContainer');
    if (window.AdminTheme) {
      window.AdminTheme.mountSwitcher('#navAdminThemeSlot');
    } else {
      window.addEventListener('load', () => {
        if (window.AdminTheme) window.AdminTheme.mountSwitcher('#navAdminThemeSlot');
      });
    }
  },

  async mountBranchSwitcher(containerSelector) {
    const el = document.querySelector(containerSelector);
    if (!el) return;
    try {
      const me = this.currentUser || await this.request("/api/me");
      if (!me) return;
      if (me.isSuperAdmin) {
        const branches = await this.request("/api/branches");
        const currentSelected = localStorage.getItem("admin_selected_branch") || "all";
        el.innerHTML = `
          <label style="font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:4px;color:#f1ece0;margin:0 4px;">
            🏢 <select id="navGlobalBranchSelect" style="padding:3px 7px;border-radius:4px;background:#06101e;color:#fff;border:1px solid #b08d3e;font-size:11px;font-weight:600;">
              <option value="all" ${currentSelected === 'all' ? 'selected' : ''}>🌐 All Branches</option>
              ${(branches || []).map(b => `<option value="${b.code}" ${currentSelected === b.code ? 'selected' : ''}>${b.name}</option>`).join('')}
            </select>
          </label>
        `;
        const sel = el.querySelector("#navGlobalBranchSelect");
        if (sel) {
          sel.addEventListener("change", () => {
            localStorage.setItem("admin_selected_branch", sel.value);
            location.reload();
          });
        }
      } else {
        const bName = me.branchName || me.branch || "Akbar Electronics";
        el.innerHTML = `<span style="background:rgba(255,255,255,0.12);padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#f1ece0;">🏢 ${bName}</span>`;
      }
    } catch (e) {
      console.warn("Could not mount branch switcher", e);
    }
  }
};
