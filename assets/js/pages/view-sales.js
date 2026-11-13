/* =====================================
   AARABHI ONLINE THREADS
   RECEIPT MANAGEMENT
===================================== */

import {
    collection,
    doc,
    getDocs,
    runTransaction,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = id => document.getElementById(id);

const number = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const money = value => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
}).format(number(value));

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#039;'
})[c]);

const formatDate = sale => {
    if (sale.saleDate) {
        const parts = sale.saleDate.split('-');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    const date = sale.createdAt?.toDate
        ? sale.createdAt.toDate()
        : new Date(sale.createdAt || 0);

    return Number.isNaN(date.getTime())
        ? '-'
        : date.toLocaleDateString('en-IN');
};

function getItems(sale) {

    if (Array.isArray(sale.items)) return sale.items;

    // Compatibility with older one-product sale documents.
    if (sale.productId || sale.productName) {
        return [{
            productId: sale.productId || '',
            name: sale.productName || '',
            code: sale.productCode || '',
            qty: number(sale.qty),
            price: number(sale.price),
            unitCost: number(sale.unitCost)
        }];
    }

    return [];
}

function getSubtotal(sale) {
    if (sale.subtotal !== undefined) return number(sale.subtotal);

    return getItems(sale).reduce(
        (sum, item) => sum + number(item.qty) * number(item.price),
        0
    );
}

function getProfit(sale) {

    const cost = sale.costTotal !== undefined
        ? number(sale.costTotal)
        : getItems(sale).reduce(
            (sum, item) => sum + number(item.qty) * number(item.unitCost),
            0
        );

    return getSubtotal(sale)
    - number(sale.discount)
    - cost;
}

let salesRecords = [];
let activeFilter = 'all';
let editingSale = null;

export async function initViewSales({ db, user, profile }) {

    const body = $('salesTableBody');
    if (!body) return;

    const isAdmin = profile?.role === 'admin';

    function message(text, type = '') {
        $('viewSalesMessage').textContent = text;
        $('viewSalesMessage').className = `view-sales-message ${type}`;
    }

    function editMessage(text, type = '') {
        $('editSaleMessage').textContent = text;
        $('editSaleMessage').className = `form-message ${type}`;
    }

    function updateSummary() {

        $('totalInvoices').textContent = salesRecords.length;

        
$('totalSalesAmount').textContent = money(
    salesRecords.reduce((sum, sale) => {
        const salesAmount = sale.subtotal !== undefined
            ? number(sale.subtotal) - number(sale.discount)
            : number(sale.total) - number(sale.courier);

        return sum + salesAmount;
    }, 0)
);


        $('totalSalesProfit').textContent = money(
            salesRecords.reduce((sum, sale) => sum + getProfit(sale), 0)
        );

        $('totalSalesDue').textContent = money(
            salesRecords.reduce((sum, sale) => sum + number(sale.paymentDue), 0)
        );
    }

    function filteredRecords() {

        const term = $('salesSearch').value.trim().toLowerCase();

        return salesRecords.filter(sale => {

            const productText = getItems(sale)
                .map(item => `${item.name} ${item.code}`)
                .join(' ')
                .toLowerCase();

            const matchesSearch =
                String(sale.invoice || '').toLowerCase().includes(term) ||
                String(sale.customer || '').toLowerCase().includes(term) ||
                productText.includes(term);

            const matchesFilter =
                activeFilter === 'all' ||
                (activeFilter === 'due' && number(sale.paymentDue) > 0) ||
                (activeFilter === 'undelivered' && sale.deliveryStatus !== 'Delivered');

            return matchesSearch && matchesFilter;
        });
    }

    function renderSales() {

        const records = filteredRecords();

        $('salesCount').textContent = `${records.length} receipts`;

        if (!records.length) {
            body.innerHTML = `
                <tr><td colspan="15" class="empty-state">No receipts found.</td></tr>
            `;
            return;
        }

        body.innerHTML = records.map(sale => {

            const items = getItems(sale);
            const names = items.map(item => item.name).filter(Boolean).join(', ');
            const codes = items.map(item => item.code || '-').filter(Boolean).join(', ');
            const qty = items.reduce((sum, item) => sum + number(item.qty), 0);
            
            const costTotal = sale.costTotal !== undefined
                ? number(sale.costTotal)
                : items.reduce((sum, item) => sum + number(item.qty) * number(item.unitCost), 0);

            const discount = number(sale.discount);
            const due = number(sale.paymentDue);

            return `
                <tr>
                    <td>${esc(sale.invoice || '-')}</td>
                    <td>${esc(formatDate(sale))}</td>
                    <td>${esc(sale.customer || '-')}</td>
                    <td title="${esc(names)}">${esc(names || '-')}</td>
                    <td>${qty}</td>
                    <td>${esc(codes)}</td>
                    <td>${money(costTotal)}</td>
                    <td>${money(discount)}</td>
                    
<td>${money(
    sale.subtotal !== undefined
        ? number(sale.subtotal) - number(sale.discount)
        : number(sale.total) - number(sale.courier)
)}</td>

                    <td>${money(getProfit(sale))}</td>
                    <td>${money(sale.paid)}</td>
                    <td>${money(due)}</td>
                    <td>${esc(sale.paymentStatus || '-')}</td>
                    <td>${esc(sale.deliveryStatus || '-')}</td>
                    <td>
                        <div class="sales-actions">
                            <button type="button" data-edit="${esc(sale.id)}">Edit</button>
                            <button type="button" data-print="${esc(sale.id)}">Print</button>
                            ${isAdmin ? `<button type="button" data-delete="${esc(sale.id)}">Delete</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function loadSales() {

        const button = $('refreshSales');
        button.disabled = true;
        button.textContent = 'Loading...';

        try {

            const snapshot = await getDocs(collection(db, 'sales'));

            salesRecords = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));

            salesRecords.sort((a, b) => {
                const da = a.createdAt?.toMillis
                    ? a.createdAt.toMillis()
                    : new Date(a.createdAt || 0).getTime();

                const dbb = b.createdAt?.toMillis
                    ? b.createdAt.toMillis()
                    : new Date(b.createdAt || 0).getTime();

                return dbb - da;
            });

            updateSummary();
            renderSales();
            message('');

        } catch (error) {

            console.error(error);
            message(error.message || 'Unable to load receipts.', 'error');

        } finally {
            button.disabled = false;
            button.textContent = '↻ Refresh';
        }
    }

    function printReceipt(sale) {

        const win = window.open('', '_blank', 'width=850,height=850');

        if (!win) {
            message('Please allow pop-ups to print receipts.', 'error');
            return;
        }

        const rows = getItems(sale).map(item => `
            <tr>
                <td>${esc(item.name)}</td>
                <td>${esc(item.code || '-')}</td>
                <td>${number(item.qty)}</td>
                <td>${money(item.price)}</td>
                <td>${money(number(item.qty) * number(item.price))}</td>
            </tr>
        `).join('');

        win.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${esc(sale.invoice || 'Receipt')}</title>
                <style>
                    body{font-family:Arial,sans-serif;padding:25px;color:#222}
                    .receipt{max-width:700px;margin:auto}
                    h1,.center{text-align:center}
                    h1{color:#147f78}
                    .line{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ddd}
                    table{width:100%;border-collapse:collapse;margin-top:20px}
                    th,td{border:1px solid #ddd;padding:9px;text-align:left}
                    th{background:#f1f5f5}
                    .total{font-size:20px;font-weight:bold}
                    .footer{text-align:center;margin-top:30px}
                </style>
            </head>
            <body>
                <div class="receipt">
                    <h1>Aarabhi Online Threads</h1>
                    <p class="center">Receipt</p>

                    <div class="line"><span>Receipt No.</span><b>${esc(sale.invoice || '-')}</b></div>
                    <div class="line"><span>Date</span><b>${esc(formatDate(sale))}</b></div>
                    <div class="line"><span>Customer</span><b>${esc(sale.customer || '-')}</b></div>
                    <div class="line"><span>Phone</span><b>${esc(sale.phone || '-')}</b></div>
                    <div class="line"><span>Order Mode</span><b>${esc(sale.orderMode || '-')}</b></div>
                    <div class="line"><span>Payment Mode</span><b>${esc(sale.paymentMode || '-')}</b></div>

                    <h3>Products</h3>
                    <table>
                        <thead><tr><th>Product</th><th>Code</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>

                    <div class="line"><span>Subtotal</span><b>${money(getSubtotal(sale))}</b></div>
                    <div class="line"><span>Discount</span><b>${money(sale.discount)}</b></div>
                    <div class="line"><span>Courier</span><b>${money(sale.courier)}</b></div>
                    <div class="line total"><span>Grand Total</span><b>${money(sale.total)}</b></div>
                    <div class="line"><span>Received</span><b>${money(sale.paid)}</b></div>
                    <div class="line"><span>Balance Due</span><b>${money(sale.paymentDue)}</b></div>
                    <div class="line"><span>Payment Status</span><b>${esc(sale.paymentStatus || '-')}</b></div>
                    <div class="line"><span>Delivery Status</span><b>${esc(sale.deliveryStatus || '-')}</b></div>

                    <div class="footer">Thank you for shopping with us!</div>
                    <p class="center"><button onclick="window.print()">Print Receipt</button></p>
                </div>
            </body>
            </html>
        `);

        win.document.close();
    }

    async function deleteReceipt(id) {

        if (!isAdmin) {
            message('Only Admin can delete receipts.', 'error');
            return;
        }

        const sale = salesRecords.find(item => item.id === id);
        if (!sale) return;

        if (!confirm(
            `Delete receipt ${sale.invoice} for ${sale.customer}?\n\n` +
            `All linked product quantities will be returned to stock.`
        )) return;

        try {

            const saleRef = doc(db, 'sales', id);

            await runTransaction(db, async transaction => {

                const saleSnap = await transaction.get(saleRef);

                if (!saleSnap.exists()) {
                    throw new Error('Receipt no longer exists.');
                }

                const currentSale = saleSnap.data();
                const items = getItems(currentSale);

                const linkedItems = items.filter(item => item.productId);

                const refs = linkedItems.map(item =>
                    doc(db, 'products', item.productId)
                );

                const snapshots = [];
                for (const ref of refs) {
                    snapshots.push(await transaction.get(ref));
                }

                snapshots.forEach((snap, index) => {
                    if (!snap.exists()) return;

                    const item = linkedItems[index];
                    transaction.update(refs[index], {
                        stock: number(snap.data().stock) + number(item.qty),
                        updatedAt: serverTimestamp(),
                        updatedBy: user.uid
                    });
                });

                transaction.delete(saleRef);
            });

            message('Receipt deleted and available stock restored.', 'success');
            await loadSales();

        } catch (error) {
            console.error(error);
            message(error.message || 'Unable to delete receipt.', 'error');
        }
    }

    function openEdit(sale) {

        editingSale = sale;

        $('editInvoiceNumber').textContent = sale.invoice || '';
        $('editSaleId').value = sale.id;
        $('editCustomer').value = sale.customer || '';
        $('editPhone').value = sale.phone || '';
        $('editPaid').value = number(sale.paid);
        $('editCourier').value = number(sale.courier);
        $('editOrderMode').value = sale.orderMode || 'Online';
        $('editPaymentMode').value = sale.paymentMode || 'Cash';
        $('editDeliveryStatus').value = sale.deliveryStatus || 'Pending';

        $('editReceiptProducts').innerHTML = `
            <h4>Products in this receipt</h4>
            <ul>
                ${getItems(sale).map(item => `
                    <li>${esc(item.name)} — Qty: ${number(item.qty)} × ${money(item.price)}</li>
                `).join('')}
            </ul>
            <small>Product quantities and prices are kept unchanged when editing receipt details.</small>
        `;

        calculateEditTotals();

        editMessage('');
        $('editSaleModal').classList.remove('hidden');
    }

    function calculateEditTotals() {

        if (!editingSale) return;

        const subtotal = getSubtotal(editingSale);
        const discount = number(editingSale.discount);
        const courier = number($('editCourier').value);
        const total = subtotal - discount + courier;
        const paid = number($('editPaid').value);
        const due = Math.max(0, total - paid);

        $('editTotal').textContent = money(total);
        $('editDue').textContent = money(due);
    }

    ['editPaid', 'editCourier'].forEach(id => {
        $(id).addEventListener('input', calculateEditTotals);
    });

    function closeModal() {
        $('editSaleModal').classList.add('hidden');
        editingSale = null;
    }

    $('closeSaleModal').addEventListener('click', closeModal);
    $('cancelSaleEdit').addEventListener('click', closeModal);

    $('editSaleModal').addEventListener('click', event => {
        if (event.target === $('editSaleModal')) closeModal();
    });

    $('editSaleForm').addEventListener('submit', async event => {

        event.preventDefault();

        if (!editingSale) return;

        const paid = number($('editPaid').value);
        const courier = number($('editCourier').value);
        const subtotal = getSubtotal(editingSale);
        const discount = number(editingSale.discount);
        const total = subtotal - discount + courier;
        const due = Math.max(0, total - paid);

        if (paid < 0 || courier < 0 || paid > total) {
            editMessage('Please check the received amount and courier cost.', 'error');
            return;
        }

        const button = $('updateSaleBtn');
        button.disabled = true;
        button.textContent = 'Updating...';

        try {

            const saleRef = doc(db, 'sales', editingSale.id);

            const paymentStatus = due <= 0
                ? 'Paid'
                : paid > 0 ? 'Partial' : 'Due';

            await runTransaction(db, async transaction => {

                const snap = await transaction.get(saleRef);

                if (!snap.exists()) {
                    throw new Error('Receipt no longer exists.');
                }

                transaction.update(saleRef, {
                    customer: $('editCustomer').value.trim(),
                    phone: $('editPhone').value.trim(),
                    paid,
                    courier,
                    total,
                    paymentDue: due,
                    paymentStatus,
                    orderMode: $('editOrderMode').value,
                    paymentMode: $('editPaymentMode').value,
                    deliveryStatus: $('editDeliveryStatus').value,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid
                });
            });

            message('Receipt updated successfully.', 'success');
            closeModal();
            await loadSales();

        } catch (error) {

            console.error(error);
            editMessage(error.message || 'Unable to update receipt.', 'error');

        } finally {
            button.disabled = false;
            button.textContent = 'Update Receipt';
        }
    });

    body.addEventListener('click', event => {

        const edit = event.target.closest('[data-edit]');
        const print = event.target.closest('[data-print]');
        const del = event.target.closest('[data-delete]');

        if (edit) {
            const sale = salesRecords.find(item => item.id === edit.dataset.edit);
            if (sale) openEdit(sale);
        }

        if (print) {
            const sale = salesRecords.find(item => item.id === print.dataset.print);
            if (sale) printReceipt(sale);
        }

        if (del) deleteReceipt(del.dataset.delete);
    });

    $('salesSearch').addEventListener('input', renderSales);

    $('salesFilters').addEventListener('click', event => {

        const button = event.target.closest('[data-filter]');
        if (!button) return;

        activeFilter = button.dataset.filter;

        $('salesFilters').querySelectorAll('[data-filter]').forEach(item => {
            item.classList.toggle('active', item === button);
        });

        renderSales();
    });

    $('refreshSales').addEventListener('click', loadSales);

    await loadSales();
}