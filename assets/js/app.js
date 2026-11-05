
import {onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import {
  collection, doc, getDoc, getDocs, addDoc, setDoc,
  serverTimestamp, runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import {
  ref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';

import { auth, db, storage } from './firebase.js';

const $=id=>document.getElementById(id), money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(n||0)), esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let user, profile, page = 'home';
let editingProductId = null;

const labels={home:'Dashboard',add:'Add Item',inventory:'Inventory',sales:'Sales',reports:'Reports',viewsales:'View Sales',opex:'OPEX',staff:'Staff Management'};
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2500)}
async function rows(c){let s=await getDocs(collection(db,c));return s.docs.map(d=>({id:d.id,...d.data()}))}
async function checkUser(u){let s=await getDoc(doc(db,'users',u.uid));if(!s.exists()||s.data().active!==true)throw Error('Account inactive. Contact administrator.');return s.data()}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginMsg').textContent='Signing in…';try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(x){$('loginMsg').textContent=x.message}});
$('logout').onclick=()=>signOut(auth);
onAuthStateChanged(auth,async u=>{user=u;if(!u){$('login').classList.remove('hidden');$('app').classList.add('hidden');return}try{profile=await checkUser(u);$('login').classList.add('hidden');$('app').classList.remove('hidden');$('userEmail').textContent=u.email;$('role').textContent=profile.role.toUpperCase();$('staffNav').classList.toggle('hidden',profile.role!=='admin');go('home')}catch(x){$('loginMsg').textContent=x.message;await signOut(auth)}});
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));
function go(p){page=p;$('heading').textContent=labels[p];document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));render()}
$('homeBottom').onclick = () => go('home');
const intro=(h,p)=>`<div class="intro"><h3>${h}</h3><p>${p}</p></div>`;
const fld=(label,name,type='text',attrs='')=>`<div class="field"><label>${label}</label><input name="${name}" type="${type}" ${attrs}></div>`;
const sel=(label,name,opts)=>`<div class="field"><label>${label}</label><select name="${name}">${opts.map(v=>`<option>${v}</option>`).join('')}</select></div>`;
async function render(){let s=$('screen');s.innerHTML='<div class="panel muted">Loading…</div>';try{
if (page === 'home') {
    s.innerHTML =
        intro('Welcome to SareeDesk', 'Manage your saree business from one place.') +
        `<div class="cards">
            ${[
                ['add', '＋', 'Add Item'],
                ['inventory', '▦', 'Inventory'],
                ['sales', '↗', 'Sales'],
                ['reports', '▤', 'Reports'],
                ['viewsales', '▣', 'View Sales'],
                ['opex', '₹', 'OPEX']
            ].map(v => `
                <button class="card" data-go="${v[0]}">
                    <span class="icon">${v[1]}</span>
                    <b>${v[2]}</b>
                    <small>Open ${v[2]}</small>
                </button>
            `).join('')}
        </div>`;

    s.querySelectorAll('[data-go]').forEach(b => {
        b.onclick = () => go(b.dataset.go);
    });
}

if (page === 'add') {
    const counterSnap = await getDoc(doc(db, 'counters', 'productCode'));
    const nextNumber = (counterSnap.exists() ? counterSnap.data().lastNumber || 0 : 0) + 1;
    const previewCode = 'SR-' + String(nextNumber).padStart(6, '0');

    s.innerHTML = intro(
        'Add New Product',
        'Choose whether this product enters stock or is sold directly to a customer.'
    ) + `
    <form id="product" class="panel">

      <div class="formgrid">

        <div class="field">
          <label>Product Code</label>
          <input name="codePreview" value="${previewCode}" readonly>
        </div>

        <div class="field">
          <label>Product Destination</label>
          <select name="destination" id="destination">
            <option value="stock">To Stock</option>
            <option value="sale">To Sale</option>
          </select>
        </div>

        <div class="field">
          <label>Product Name</label>
          <input name="name" required placeholder="Enter product name">
        </div>

    
      </div>

      <div class="field" style="margin-top:18px">
        <label>Product Image</label>
        <input type="file" name="image" id="productImage" accept="image/*">
        <img id="imagePreview" style="display:none;width:140px;height:140px;object-fit:cover;margin-top:12px;border-radius:10px">
      </div>

      <div class="formgrid" style="margin-top:18px">

        <div class="field">
          <label>Shipping + Packaging Cost (₹)</label>
          <input name="shipping" id="shipping" type="number" min="0" step=".01" value="0" required>
        </div>

        <div class="field">
          <label>Product Cost (₹)</label>
          <input name="purchase" id="purchase" type="number" min="0" step=".01" required>
        </div>

        <div class="field">
          <label>Total Cost (₹)</label>
          <input name="totalCost" id="totalCost" readonly>
        </div>

        <div class="field">
          <label>Selling Price (₹)</label>
          <input name="price" id="sellingPrice" type="number" min="0" step=".01" required>
        </div>

        <div class="field">
          <label>Total Profit (₹)</label>
          <input name="profit" id="profit" readonly>
        </div>

        <div class="field" id="stockField">
          <label>Stock Quantity</label>
          <input name="stock" type="number" min="1" step="1" value="1">
        </div>

      </div>

      <div id="directSaleFields" class="panel" style="margin-top:18px;display:none">
        <h3>Direct Sale Details</h3>

        <div class="formgrid">
          <div class="field">
            <label>Customer Name</label>
            <input name="customer" placeholder="Customer name">
          </div>

          <div class="field">
            <label>Customer Phone</label>
            <input name="phone" type="tel" placeholder="Phone number">
          </div>

          <div class="field">
            <label>Quantity</label>
            <input name="saleQty" type="number" min="1" step="1" value="1">
          </div>

          <div class="field">
            <label>Amount Received (₹)</label>
            <input name="paid" type="number" min="0" step=".01" value="0">
          </div>

          <div class="field">
            <label>Payment Mode</label>
            <select name="method">
              <option>UPI</option>
              <option>Bank transfer</option>
              <option>Cash</option>
              <option>Card</option>
              <option>COD</option>
              <option>Other</option>
            </select>
          </div>

          <div class="field">
            <label>Delivery Status</label>
            <select name="delivery">
              <option>Not shipped</option>
              <option>Packed</option>
              <option>Shipped</option>
              <option>Delivered</option>
            </select>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="primary" id="saveProduct">Add to Inventory</button>
      </div>

    </form>`;

    const form = $('product');
    if (editingProductId) {
    const snap = await getDoc(doc(db, 'products', editingProductId));

    if (!snap.exists()) {
        editingProductId = null;
        throw Error('Product not found.');
    }

    const v = snap.data();

    form.elements.codePreview.value = v.code;
    form.elements.name.value = v.name || '';
    form.elements.shipping.value = v.shippingPackagingCost ?? 0;
    form.elements.purchase.value = v.purchaseCost ?? 0;
    form.elements.price.value = v.price ?? 0;
    form.elements.stock.value = v.stock ?? 0;

    form.dataset.imageUrl = v.imageUrl || '';

    if (v.imageUrl) {
        $('imagePreview').src = v.imageUrl;
        $('imagePreview').style.display = 'block';
    }

    $('saveProduct').textContent = 'Update Item';
}
    const destination = $('destination');
    const saleFields = $('directSaleFields');
    const stockField = $('stockField');
    const saveButton = $('saveProduct');

    const updateDestination = () => {
      const directSale = destination.value === 'sale';
      saleFields.style.display = directSale ? 'block' : 'none';
      stockField.style.display = directSale ? 'none' : 'block';
      saveButton.textContent = editingProductId
    ? 'Update Item'
    : directSale ? 'Save Direct Sale' : 'Add to Inventory';
      form.elements.customer.required = directSale;
      form.elements.saleQty.required = directSale;
    };

    destination.addEventListener('change', updateDestination);
    updateDestination();

    const calculate = () => {
      const shipping = Number(form.elements.shipping.value || 0);
      const purchase = Number(form.elements.purchase.value || 0);
      const selling = Number(form.elements.price.value || 0);
      const total = shipping + purchase;

      $('totalCost').value = total.toFixed(2);
      $('profit').value = (selling - total).toFixed(2);
    };

    ['shipping', 'purchase', 'sellingPrice'].forEach(id => {
      $(id).addEventListener('input', calculate);
    });

    $('productImage').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      const preview = $('imagePreview');
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
    });
}


if (page === 'inventory') {
    let p = await rows('products');

    s.innerHTML = intro('Inventory', 'Current available stock and product pricing.') +
    `<div class="panel">
      <input id="find" placeholder="Search product or code">
      <div class="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Product</th>
              <th>Unit Cost</th>
              <th>Selling</th>
              <th>Profit/Unit</th>
              <th>Stock</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${p.map(v => `
              <tr data-key="${esc(v.code + ' ' + v.name)}">
                <td>${esc(v.code)}</td>
                <td>${esc(v.name)}</td>
                <td>${money(v.unitCost)}</td>
                <td>${money(v.price)}</td>
                <td>${money(v.price - v.unitCost)}</td>
                <td>${v.stock}</td>
                <td>
                  <button class="primary" data-edit="${v.id}" type="button">
                    Edit
                  </button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="7">No products yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

    $('find').oninput = e => {
        document.querySelectorAll('tbody tr[data-key]').forEach(r => {
            r.hidden = !r.dataset.key.toLowerCase()
                .includes(e.target.value.toLowerCase());
        });
    };

    s.querySelectorAll('[data-edit]').forEach(button => {
        button.onclick = () => {
            editingProductId = button.dataset.edit;
            go('add');
        };
    });
}

if(page==='sales'){let p=await rows('products');s.innerHTML=intro('Record a sale','Stock is checked and reduced within a Firestore transaction.')+`<form id="sale" class="panel"><div class="formgrid">${fld('Customer name','customer','text','required')}${fld('Phone','phone','tel')}<div class="field"><label>Product</label><select name="pid" required><option value="">Select product</option>${p.map(v=>`<option value="${v.id}" data-price="${v.price}">${esc(v.code)} — ${esc(v.name)} (stock ${v.stock})</option>`).join('')}</select></div>${fld('Quantity','qty','number','min="1" value="1" required')}${fld('Selling price per unit (₹)','price','number','min="0" step=".01" required')}${sel('Order mode','order',['WhatsApp','Instagram','Phone','Walk-in','Other'])}${sel('Payment mode','method',['UPI','Bank transfer','Cash','Card','COD','Other'])}${sel('Payment status','payment',['Pending','Partially Paid','Paid'])}${sel('Delivery status','delivery',['Not shipped','Packed','Shipped','Delivered','Returned'])}${fld('Amount received (₹)','paid','number','min="0" step=".01" value="0"')}${fld('Courier cost (₹)','courier','number','min="0" step=".01" value="0"')}</div><div class="actions">
    <button type="submit" class="primary">Save Sale</button>
    <button type="button" class="primary" id="printReceipt">
        Print Receipt
    </button>
</div>
</form>`;let f=$('sale');

$('printReceipt').onclick = () => {
    const d = new FormData(f);

    const customer = d.get('customer') || '';
    const phone = d.get('phone') || '';
    const product = f.pid.selectedOptions[0]?.text || '';
    const qty = Number(d.get('qty') || 0);
    const price = Number(d.get('price') || 0);
    const total = qty * price;
    const paid = Number(d.get('paid') || 0);
    const due = total - paid;
    const courier = Number(d.get('courier') || 0);

    const receiptWindow = window.open('', '_blank', 'width=800,height=700');

    if (!receiptWindow) {
        toast('Please allow pop-ups to print the receipt.');
        return;
    }

    const safe = value => esc(value);

    receiptWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SareeDesk - Sales Receipt</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 30px;
            color: #222;
          }
          .receipt {
            max-width: 650px;
            margin: auto;
            border: 1px solid #ddd;
            padding: 30px;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #167f78;
            padding-bottom: 15px;
          }
          .header h1 {
            margin-bottom: 5px;
            color: #167f78;
          }
          .details {
            margin: 25px 0;
            line-height: 1.8;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            padding: 12px;
            border-bottom: 1px solid #ddd;
            text-align: left;
          }
          .totals {
            margin-top: 25px;
            text-align: right;
            line-height: 2;
          }
          .grand {
            font-size: 20px;
            font-weight: bold;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            color: #777;
          }
          @media print {
            body { padding: 0; }
            .receipt { border: none; }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>SareeDesk</h1>
            <p>Sales Receipt</p>
            <p>${new Date().toLocaleString('en-IN')}</p>
          </div>

          <div class="details">
            <strong>Customer:</strong> ${safe(customer)}<br>
            <strong>Phone:</strong> ${safe(phone)}<br>
            <strong>Order Mode:</strong> ${safe(d.get('order'))}<br>
            <strong>Payment Mode:</strong> ${safe(d.get('method'))}<br>
            <strong>Payment Status:</strong> ${safe(d.get('payment'))}<br>
            <strong>Delivery Status:</strong> ${safe(d.get('delivery'))}
          </div>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${safe(product)}</td>
                <td>${qty}</td>
                <td>${money(price)}</td>
                <td>${money(total)}</td>
              </tr>
            </tbody>
          </table>

          <div class="totals">
            <div>Sale Total: ${money(total)}</div>
            <div>Courier Cost: ${money(courier)}</div>
            <div>Amount Received: ${money(paid)}</div>
            <div class="grand">Balance Due: ${money(due)}</div>
          </div>

          <div class="footer">
            <p>Thank you for shopping with us!</p>
            <strong>SareeDesk</strong>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        <\/script>
      </body>
      </html>
    `);

    receiptWindow.document.close();
};


f.pid.onchange=()=>f.price.value=f.pid.selectedOptions[0]?.dataset.price||'';f.onsubmit=async e=>{e.preventDefault();let d=new FormData(f),pid=d.get('pid'),qty=+d.get('qty'),price=+d.get('price'),paid=+d.get('paid'),courier=+d.get('courier');try{let pr=doc(db,'products',pid),sr=doc(collection(db,'sales'));await runTransaction(db,async tx=>{let snap=await tx.get(pr);if(!snap.exists())throw Error('Product not found');let v=snap.data();if(v.stock<qty)throw Error('Not enough stock');let total=qty*price;tx.update(pr,{stock:v.stock-qty});tx.set(sr,{invoice:'SD-'+Date.now(),customer:d.get('customer'),phone:d.get('phone'),productId:pid,productName:v.name,productCode:v.code,qty,price,total,costTotal:qty*v.unitCost,courier,paid,paymentDue:Math.max(0,total-paid),orderMode:d.get('order'),paymentMode:d.get('method'),paymentStatus:paid>=total?'Paid':paid>0?'Partially Paid':'Pending',deliveryStatus:d.get('delivery'),createdAt:serverTimestamp(),createdBy:user.uid})});toast('Sale saved; stock updated');go('viewsales')}catch(x){toast(x.message)}}}
if (page === 'viewsales') {
    const sales = await rows('sales');

    s.innerHTML = intro('View sales', 'Filter invoices, check outstanding payments and update customer orders.') + `
      <div class="panel">
        <div class="sales-toolbar">
          <div class="sales-filters">
            <button type="button" class="filter-btn active" data-filter="all">All Sales (${sales.length})</button>
            <button type="button" class="filter-btn" data-filter="due">Due Invoices (${sales.filter(v => Number(v.paymentDue || 0) > 0).length})</button>
            <button type="button" class="filter-btn" data-filter="undelivered">Not Delivered (${sales.filter(v => String(v.deliveryStatus || '').toLowerCase() !== 'delivered').length})</button>
          </div>
          <input id="salesFind" class="sales-search" placeholder="Search invoice or customer">
        </div>

        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th><th>Customer</th><th>Product</th>
                <th>Total</th><th>Received</th><th>Due</th>
                <th>Payment</th><th>Delivery</th><th>Action</th>
              </tr>
            </thead>
            <tbody id="salesRows">
              ${sales.map(v => `
                <tr
                  data-key="${esc((v.invoice || '') + ' ' + (v.customer || '') + ' ' + (v.productName || ''))}"
                  data-due="${Number(v.paymentDue || 0) > 0}"
                  data-undelivered="${String(v.deliveryStatus || '').toLowerCase() !== 'delivered'}"
                >
                  <td>${esc(v.invoice || '—')}</td>
                  <td>${esc(v.customer || '—')}</td>
                  <td>${esc(v.productName || '—')}</td>
                  <td>${money(v.total)}</td>
                  <td>${money(v.paid)}</td>
                  <td>${money(v.paymentDue)}</td>
                  <td>${esc(v.paymentStatus || 'Pending')}</td>
                  <td>${esc(v.deliveryStatus || 'Not shipped')}</td>
                  <td><button type="button" class="edit-btn" data-sale-edit="${v.id}">Edit</button></td>
                </tr>
              `).join('') || '<tr><td colspan="9">No sales yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div id="saleEditModal" class="sale-modal hidden">
        <form id="saleEditForm" class="sale-modal-card">
          <div class="modal-heading">
            <div>
              <h3>Edit Invoice</h3>
              <small id="editInvoiceLabel"></small>
            </div>
            <button type="button" id="closeSaleEdit" class="modal-close">×</button>
          </div>

          <div class="formgrid">
            ${fld('Customer name', 'customer', 'text', 'required')}
            ${fld('Phone', 'phone', 'tel')}
            ${fld('Product', 'productName', 'text', 'readonly')}
            ${fld('Quantity', 'qty', 'number', 'min="1" step="1" required')}
            ${fld('Selling price per unit (₹)', 'price', 'number', 'min="0" step=".01" required')}
            ${fld('Amount received (₹)', 'paid', 'number', 'min="0" step=".01" required')}
            ${sel('Order mode', 'order', ['WhatsApp','Instagram','Phone','Walk-in','Direct Sale','Other'])}
            ${sel('Payment mode', 'method', ['UPI','Bank transfer','Cash','Card','COD','Other'])}
            ${sel('Delivery status', 'delivery', ['Not shipped','Packed','Shipped','Delivered','Returned'])}
            ${fld('Courier cost (₹)', 'courier', 'number', 'min="0" step=".01"')}
          </div>

          <div class="edit-totals" id="editSaleTotals"></div>

          <div class="actions modal-actions">
            <button type="button" class="secondary-btn" id="cancelSaleEdit">Cancel</button>
            <button type="submit" class="primary" id="saveSaleEdit">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    let activeFilter = 'all';
    const tableRows = () => [...$('salesRows').querySelectorAll('tr[data-key]')];

    function applySalesFilters() {
        const search = $('salesFind').value.toLowerCase().trim();

        tableRows().forEach(row => {
            const matchesSearch = row.dataset.key.toLowerCase().includes(search);
            const matchesFilter =
                activeFilter === 'all' ||
                (activeFilter === 'due' && row.dataset.due === 'true') ||
                (activeFilter === 'undelivered' && row.dataset.undelivered === 'true');

            row.hidden = !(matchesSearch && matchesFilter);
        });
    }

    s.querySelectorAll('[data-filter]').forEach(button => {
        button.onclick = () => {
            activeFilter = button.dataset.filter;
            s.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === button));
            applySalesFilters();
        };
    });

    $('salesFind').oninput = applySalesFilters;

    const modal = $('saleEditModal');
    const editForm = $('saleEditForm');
    let editingSaleId = null;

    function closeEditModal() {
        modal.classList.add('hidden');
        editingSaleId = null;
    }

    $('closeSaleEdit').onclick = closeEditModal;
    $('cancelSaleEdit').onclick = closeEditModal;

    function updateEditTotals() {
        const qty = Number(editForm.elements.qty.value || 0);
        const price = Number(editForm.elements.price.value || 0);
        const paid = Number(editForm.elements.paid.value || 0);
        const total = qty * price;
        const due = Math.max(0, total - paid);

        $('editSaleTotals').textContent =
            `Invoice Total: ${money(total)} | Amount Due: ${money(due)}`;
    }

    ['qty', 'price', 'paid'].forEach(name => {
        editForm.elements[name].addEventListener('input', updateEditTotals);
    });

    s.querySelectorAll('[data-sale-edit]').forEach(button => {
        button.onclick = () => {
            const sale = sales.find(v => v.id === button.dataset.saleEdit);
            if (!sale) return;

            editingSaleId = sale.id;
            $('editInvoiceLabel').textContent = sale.invoice || '';

            editForm.elements.customer.value = sale.customer || '';
            editForm.elements.phone.value = sale.phone || '';
            editForm.elements.productName.value = sale.productName || '';
            editForm.elements.qty.value = sale.qty || 1;
            editForm.elements.price.value = sale.price || 0;
            editForm.elements.paid.value = sale.paid || 0;
            editForm.elements.order.value = sale.orderMode || 'Other';
            editForm.elements.method.value = sale.paymentMode || 'Other';
            editForm.elements.delivery.value = sale.deliveryStatus || 'Not shipped';
            editForm.elements.courier.value = sale.courier || 0;

            updateEditTotals();
            modal.classList.remove('hidden');
        };
    });

    editForm.onsubmit = async e => {
        e.preventDefault();
        if (!editingSaleId) return;

        const saveButton = $('saveSaleEdit');
        const d = new FormData(editForm);

        const qty = Number(d.get('qty'));
        const price = Number(d.get('price'));
        const paid = Number(d.get('paid'));
        const courier = Number(d.get('courier') || 0);
        const customer = String(d.get('customer') || '').trim();

        if (!customer || !Number.isInteger(qty) || qty < 1 || price < 0 || paid < 0 || courier < 0) {
            toast('Please check the entered details.');
            return;
        }

        const total = qty * price;

        if (paid > total) {
            toast('Received amount cannot exceed the invoice total.');
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        try {
            const saleRef = doc(db, 'sales', editingSaleId);

            await runTransaction(db, async tx => {
                const saleSnap = await tx.get(saleRef);
                if (!saleSnap.exists()) throw Error('Invoice not found.');

                const oldSale = saleSnap.data();
                let productRef = null;
                let productSnap = null;

                // Only stock-based sales adjust inventory.
                // Direct sales have productId = null.
                if (oldSale.productId) {
                    productRef = doc(db, 'products', oldSale.productId);
                    productSnap = await tx.get(productRef);

                    if (!productSnap.exists()) {
                        throw Error('Linked inventory product not found.');
                    }

                    const product = productSnap.data();
                    const oldQty = Number(oldSale.qty || 0);
                    const newStock = Number(product.stock || 0) + oldQty - qty;

                    if (newStock < 0) {
                        throw Error('Not enough stock for this updated quantity.');
                    }

                    tx.update(productRef, { stock: newStock });
                }

                const oldQty = Number(oldSale.qty || 1);
                const unitCost = Number(
                    oldSale.unitCost ||
                    (Number(oldSale.costTotal || 0) / oldQty)
                );

                tx.update(saleRef, {
                    customer,
                    phone: String(d.get('phone') || '').trim(),
                    qty,
                    price,
                    total,
                    costTotal: qty * unitCost,
                    courier,
                    paid,
                    paymentDue: Math.max(0, total - paid),
                    orderMode: d.get('order'),
                    paymentMode: d.get('method'),
                    paymentStatus: paid >= total ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Pending',
                    deliveryStatus: d.get('delivery'),
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid
                });
            });

            toast('Invoice updated successfully.');
            closeEditModal();
            go('viewsales');

        } catch (error) {
            toast(error.message || 'Unable to update invoice.');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Changes';
        }
    };
}
if(page==='opex'){s.innerHTML=intro('Operating expenses','Record courier, packaging, pickup, shipping and other expenses.')+`<form id="expense" class="panel"><div class="formgrid">${sel('Category','category',['Courier','Packaging','Pickup','Shipping','Marketing','Salary','Other'])}${fld('Description','description')}${fld('Amount (₹)','amount','number','min=".01" step=".01" required')}${fld('Expense date','date','date','required')}</div><div class="actions"><button class="primary">Save expense</button></div></form>`;if(profile.role==='admin'){let x=await rows('expenses');s.innerHTML+=`<div class="panel"><h3>Expense history</h3>${x.map(v=>`<p>${esc(v.date)} · ${esc(v.category)} · ${esc(v.description)} · ${money(v.amount)}</p>`).join('')||'No expenses yet.'}</div>`}}
if (page === 'reports') {
    if (profile.role !== 'admin') {
        s.innerHTML = 'Admin access required.';
    } else {
        const [a, x, p] = await Promise.all([
            rows('sales'),
            rows('expenses'),
            rows('products')
        ]);

        const soldQty = a.reduce((n, v) => n + Number(v.qty || 0), 0);
        const rev = a.reduce((n, v) => n + Number(v.total || 0), 0);
        const cost = a.reduce((n, v) => n + Number(v.costTotal || 0), 0);
        const op = x.reduce((n, v) => n + Number(v.amount || 0), 0);
        const due = a.reduce((n, v) => n + Number(v.paymentDue || 0), 0);
        const courier = a.reduce((n, v) => n + Number(v.courier || 0), 0);
        const netProfit = rev - cost - op - courier;
        const available = p.reduce((n, v) => n + Number(v.stock || 0), 0);

        const chartMax = Math.max(rev, cost, op, courier, Math.abs(netProfit), 1);

        const bars = [
            ['Revenue', rev],
            ['Product Cost', cost],
            ['Operating Expenses', op],
            ['Courier', courier],
            ['Net Profit', netProfit]
        ];

        const parts = [
            ['Product Cost', cost],
            ['Operating Expenses', op],
            ['Courier', courier],
            ['Net Profit', Math.max(0, netProfit)]
        ];

        const donutTotal = parts.reduce((n, v) => n + v[1], 0) || 1;
        let currentPercent = 0;

        const donutStops = parts.map((part, i) => {
            const start = currentPercent;
            currentPercent += (part[1] / donutTotal) * 100;
            return `${['#2563eb','#e59a32','#8b5cf6','#159b78'][i]} ${start}% ${currentPercent}%`;
        }).join(', ');

        s.innerHTML = intro('Business reports', 'INR financial summary and business performance.') +
        `<div class="stats">
            ${stat('Products Sold (Qty)', soldQty)}
            ${stat('Revenue', money(rev))}
            ${stat('Cost of Goods Sold', money(cost))}
            ${stat('Operating Expenses', money(op))}
            ${stat('Estimated Net Profit', money(netProfit))}
            ${stat('Outstanding', money(due))}
            ${stat('Available Units', available)}
        </div>

        <div class="report-charts">
            <div class="chart-panel">
                <h3>Financial Summary</h3>
                <div class="bar-chart">
                    ${bars.map(([label, value]) => `
                        <div class="bar-item">
                            <div class="bar-label">
                                <span>${label}</span>
                                <strong>${money(value)}</strong>
                            </div>
                            <div class="bar-track">
                                <div class="bar-fill" style="width:${Math.min(100, Math.abs(value) / chartMax * 100)}%"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="chart-panel">
                <h3>Cost & Profit Share</h3>
                <div class="donut-layout">
                    <div class="donut-chart" style="background:conic-gradient(${donutStops})">
                        <div class="donut-hole">
                            <strong>${money(donutTotal)}</strong>
                            <small>Breakdown</small>
                        </div>
                    </div>

                    <div class="chart-legend">
                        ${parts.map((part, i) => `
                            <div>
                                <i style="background:${['#2563eb','#e59a32','#8b5cf6','#159b78'][i]}"></i>
                                <span>${part[0]}</span>
                                <strong>${money(part[1])}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>`;
    }
}
if(page==='staff'){if(profile.role!=='admin')s.innerHTML='Admin access required.';else{let u=await rows('users');s.innerHTML=intro('Staff management','Create staff login in Firebase Authentication first, then activate the UID here.')+`<div class="panel"><form id="staff" class="formgrid">${fld('Firebase Auth UID','uid')}${fld('Staff email','email','email')}<div class="actions"><button class="primary">Activate staff</button></div></form></div><div class="panel">${u.map(v=>`<p>${esc(v.email)} — ${esc(v.role)} — ${v.active?'Active':'Disabled'}</p>`).join('')}</div>`}}
bindForms()
}catch(x){s.innerHTML=`<div class="panel">Could not load: ${esc(x.message)}</div>`}}
function stat(k,v){return `<div class="stat"><small>${k}</small><strong>${v}</strong></div>`}

function bindForms() {
    
const productForm = $('product');

if (productForm) {
    productForm.onsubmit = async e => {
        e.preventDefault();

        const form = e.currentTarget;
        const saveProduct = $('saveProduct');
        const d = new FormData(form);
        const destination = d.get('destination');

        const name = String(d.get('name') || '').trim();
        const shipping = Number(d.get('shipping') || 0);
        const purchase = Number(d.get('purchase') || 0);
        const totalCost = shipping + purchase;
        const price = Number(d.get('price') || 0);

        const quantity = destination === 'sale'
            ? Number(d.get('saleQty'))
            : Number(d.get('stock'));

        const paid = Number(d.get('paid') || 0);

        if (!name || quantity < 1 || totalCost < 0 || price < 0) {
            toast('Please check the entered details.');
            return;
        }

        if (destination === 'sale' && !d.get('customer')) {
            toast('Customer name is required.');
            return;
        }

        if (destination === 'sale' && paid > quantity * price) {
            toast('Received amount cannot exceed the sale total.');
            return;
        }

        const imageFile = d.get('image');
        let imageUrl = '';

        try {
            saveProduct.disabled = true;
            saveProduct.textContent = 'Saving...';

            if (imageFile && imageFile.size > 0) {
                if (!imageFile.type.startsWith('image/')) {
                    throw Error('Please select a valid image.');
                }

                if (imageFile.size > 5 * 1024 * 1024) {
                    throw Error('Image must be smaller than 5 MB.');
                }

                const imageRef = ref(
                    storage,
                    'product-images/' + user.uid + '/' + Date.now() + '-' + imageFile.name
                );

                await uploadBytes(imageRef, imageFile);
                imageUrl = await getDownloadURL(imageRef);
            }

            // UPDATE EXISTING PRODUCT
if (editingProductId) {
    const productRef = doc(db, 'products', editingProductId);

    const finalImageUrl = imageUrl || form.dataset.imageUrl || '';

    await runTransaction(db, async tx => {
        const snap = await tx.get(productRef);

        if (!snap.exists()) {
            throw Error('Product not found.');
        }

        tx.update(productRef, {
            name,
            shippingPackagingCost: shipping,
            purchaseCost: purchase,
            unitCost: totalCost,
            price,
            stock: quantity,
            imageUrl: finalImageUrl,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid
        });
    });

    editingProductId = null;
    toast('Product updated successfully!');
    go('inventory');
    return;
}

            const counterRef = doc(db, 'counters', 'productCode');
            const recordRef = doc(collection(
                db,
                destination === 'sale' ? 'sales' : 'products'
            ));

            const invoice = 'SD-' + Date.now();

            await runTransaction(db, async tx => {
                const counterSnap = await tx.get(counterRef);
                const lastNumber = counterSnap.exists()
                    ? Number(counterSnap.data().lastNumber || 0)
                    : 0;

                const serial = lastNumber + 1;
                const code = 'SR-' + String(serial).padStart(6, '0');

                tx.set(counterRef, {
                    lastNumber: serial,
                    updatedAt: serverTimestamp()
                });

                if (destination === 'stock') {
                    tx.set(recordRef, {
                        code,
                        name,
                        imageUrl,
                        shippingPackagingCost: shipping,
                        purchaseCost: purchase,
                        unitCost: totalCost,
                        price,
                        stock: quantity,
                        createdAt: serverTimestamp(),
                        createdBy: user.uid
                    });
                } else {
                    const total = quantity * price;
                    const costTotal = quantity * totalCost;

                    tx.set(recordRef, {
                        invoice,
                        code,
                        customer: String(d.get('customer')).trim(),
                        phone: String(d.get('phone') || '').trim(),
                        productId: null,
                        productName: name,
                        productCode: code,
                        productImage: imageUrl,
                        qty: quantity,
                        price,
                        unitCost: totalCost,
                        total,
                        costTotal,
                        shippingPackagingCost: quantity * shipping,
                        courier: 0,
                        paid,
                        paymentDue: total - paid,
                        orderMode: 'Direct Sale',
                        paymentMode: d.get('method'),
                        paymentStatus: paid >= total ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Pending',
                        deliveryStatus: d.get('delivery'),
                        createdAt: serverTimestamp(),
                        createdBy: user.uid
                    });
                }
            });

            toast(destination === 'sale'
                ? 'Direct sale saved successfully!'
                : 'Product added to inventory!');

            go(destination === 'sale' ? 'viewsales' : 'inventory');

        } catch (error) {
            console.error(error);
            toast(error.message || 'Unable to save product.');
        } finally {
            saveProduct.disabled = false;
            saveProduct.textContent = editingProductId
    ? 'Update Item'
    : destination === 'sale'
        ? 'Save Direct Sale'
        : 'Add to Inventory';
        }
    };
}


    // OPEX FORM
    const expenseForm = $('expense');

    if (expenseForm) {
        expenseForm.onsubmit = async (e) => {
            e.preventDefault();

            const d = new FormData(e.currentTarget);

            try {
                await addDoc(collection(db, 'expenses'), {
                    category: d.get('category'),
                    description: d.get('description'),
                    amount: Number(d.get('amount')),
                    date: d.get('date'),
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                });

                toast('Expense saved successfully');
                go('opex');

            } catch (error) {
                toast(error.message);
            }
        };
    }

    // STAFF FORM
    const staffForm = $('staff');

    if (staffForm) {
        staffForm.onsubmit = async (e) => {
            e.preventDefault();

            const d = new FormData(e.currentTarget);

            try {
                await setDoc(doc(db, 'users', d.get('uid').trim()), {
                    email: d.get('email').trim(),
                    role: 'staff',
                    active: true,
                    createdAt: serverTimestamp()
                });

                toast('Staff activated successfully');
                go('staff');

            } catch (error) {
                toast(error.message);
            }
        };
    }
}

