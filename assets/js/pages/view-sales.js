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

let editItems = [];
let editProducts = [];


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

    
async function openEdit(sale) {
    editingSale = sale;
    editItems = getItems(sale).map(item => ({ ...item }));

    editMessage('');

    $('editInvoiceNumber').textContent = sale.invoice || '';
    $('editSaleId').value = sale.id;
    $('editSaleDate').value = sale.saleDate ||
        new Date().toLocaleDateString('en-CA');
    $('editCustomer').value = sale.customer || '';
    $('editPhone').value = sale.phone || '';
    $('editPaid').value = number(sale.paid);
    $('editCourier').value = number(sale.courier);
    $('editDiscount').value = number(sale.discount);
    $('editOrderMode').value = sale.orderMode || 'Online';
    $('editPaymentMode').value = sale.paymentMode || 'Cash';
    $('editDeliveryStatus').value =
        sale.deliveryStatus || 'Pending';

    $('editSaleModal').classList.remove('hidden');

    renderEditItems();
    calculateEditTotals();

    try {
        const snapshot = await getDocs(collection(db, 'products'));

        if (editingSale?.id !== sale.id) return;

        editProducts = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        const select = $('editAddProduct');
        select.innerHTML = '<option value="">Select a product</option>';

        editProducts.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent =
                `${product.code || ''} - ${product.name || 'Product'} ` +
                `(Available: ${number(product.stock)})`;
            select.appendChild(option);
        });

        $('editAddQuantity').value = 1;
        $('editAddPrice').value = '';
    } catch (error) {
        console.error(error);
        editMessage('Unable to load available products.', 'error');
    }
}

function renderEditItems() {
    const container = $('editReceiptProducts');

    if (!editItems.length) {
        container.innerHTML = '<p>No products selected.</p>';
        calculateEditTotals();
        return;
    }

    container.innerHTML = editItems.map((item, index) => `
        <div class="edit-product-row"
             style="padding:12px 0;border-bottom:1px solid #e5e7eb;">

            <strong>${esc(item.name || 'Product')}</strong>
            <small>${esc(item.code || '')}</small>

            <div class="edit-sale-grid" style="margin-top:10px;">
                <label>
                    Quantity
                    <input type="number"
                           min="1"
                           step="1"
                           value="${number(item.qty)}"
                           data-edit-qty="${index}">
                </label>

                <label>
                    Selling Price / Unit (₹)
                    <input type="number"
                           min="0"
                           step="0.01"
                           value="${number(item.price)}"
                           data-edit-price="${index}">
                </label>
            </div>

            <button type="button"
                    class="secondary"
                    data-remove-edit-item="${index}">
                Remove Product
            </button>
        </div>
    `).join('');

    calculateEditTotals();
}

function calculateEditTotals() {
    if (!editingSale) return;

    const subtotal = editItems.reduce(
        (sum, item) =>
            sum + number(item.qty) * number(item.price),
        0
    );

    const discount = number($('editDiscount').value);
    const courier = number($('editCourier').value);
    const paid = number($('editPaid').value);

    const salesRevenue = subtotal - discount;
    const total = salesRevenue + courier;
    const due = Math.max(0, total - paid);

    $('editSubtotal').textContent = money(subtotal);
    $('editDiscountTotal').textContent = money(discount);
    $('editSalesRevenue').textContent = money(salesRevenue);
    $('editCourierTotal').textContent = money(courier);
    $('editTotal').textContent = money(total);
    $('editReceivedTotal').textContent = money(paid);
    $('editDue').textContent = money(due);
}

$('editReceiptProducts').addEventListener('input', event => {
    const qtyIndex = event.target.dataset.editQty;
    const priceIndex = event.target.dataset.editPrice;

    if (qtyIndex !== undefined) {
        editItems[Number(qtyIndex)].qty = number(event.target.value);
    }

    if (priceIndex !== undefined) {
        editItems[Number(priceIndex)].price =
            number(event.target.value);
    }

    calculateEditTotals();
});

$('editReceiptProducts').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-edit-item]');
    if (!button) return;

    editItems.splice(Number(button.dataset.removeEditItem), 1);
    renderEditItems();
});

$('editAddProduct').addEventListener('change', () => {
    const product = editProducts.find(
        item => item.id === $('editAddProduct').value
    );

    $('editAddPrice').value = product
        ? number(product.sellingPrice ?? product.price)
        : '';
});

$('editAddProductBtn').addEventListener('click', () => {
    const product = editProducts.find(
        item => item.id === $('editAddProduct').value
    );

    const qty = number($('editAddQuantity').value);
    const price = number($('editAddPrice').value);

    if (!product || !Number.isInteger(qty) ||
        qty <= 0 || price < 0) {
        editMessage('Select a valid product, quantity and price.', 'error');
        return;
    }

    if (editItems.some(item => item.productId === product.id)) {
        editMessage(
            'Product already exists. Change its quantity instead.',
            'error'
        );
        return;
    }

    editItems.push({
        productId: product.id,
        name: product.name || 'Product',
        code: product.code || '',
        qty,
        price,
        unitCost: number(product.unitCost)
    });

    $('editAddProduct').value = '';
    $('editAddQuantity').value = 1;
    $('editAddPrice').value = '';

    editMessage('');
    renderEditItems();
});

['editPaid', 'editCourier', 'editDiscount'].forEach(id => {
    $(id).addEventListener('input', calculateEditTotals);
});


    function closeModal() {
        $('editSaleModal').classList.add('hidden');
        editingSale = null;

editItems = [];
editProducts = [];

    }

    $('closeSaleModal').addEventListener('click', closeModal);
    $('cancelSaleEdit').addEventListener('click', closeModal);

    $('editSaleModal').addEventListener('click', event => {
        if (event.target === $('editSaleModal')) closeModal();
    });

    
$('editSaleForm').addEventListener('submit', async event => {
    event.preventDefault();

    if (!editingSale) return;

    const saleId = editingSale.id;
    const items = editItems.map(item => ({ ...item }));

    const customer = $('editCustomer').value.trim();
    const phone = $('editPhone').value.trim();
    const saleDate = $('editSaleDate').value;
    const discount = number($('editDiscount').value);
    const courier = number($('editCourier').value);
    const paid = number($('editPaid').value);

    const subtotal = items.reduce(
        (sum, item) => sum + item.qty * item.price, 0
    );

    const salesRevenue = subtotal - discount;
    const total = salesRevenue + courier;
    const due = Math.max(0, total - paid);

    if (!customer || !saleDate || !items.length) {
        editMessage('Enter customer, date and at least one product.', 'error');
        return;
    }

    if (items.some(item =>
        !item.productId ||
        !Number.isInteger(item.qty) ||
        item.qty <= 0 ||
        !Number.isFinite(item.price) ||
        item.price < 0
    )) {
        editMessage('Check product quantities and prices.', 'error');
        return;
    }

    if (
        !Number.isFinite(discount) ||
        !Number.isFinite(courier) ||
        !Number.isFinite(paid) ||
        discount < 0 ||
        courier < 0 ||
        paid < 0 ||
        discount > subtotal ||
        paid > total
    ) {
        editMessage('Check discount, courier and payment amounts.', 'error');
        return;
    }

    const paymentStatus = due === 0
        ? 'Paid'
        : paid > 0 ? 'Partial' : 'Due';

    const button = $('updateSaleBtn');
    button.disabled = true;
    button.textContent = 'Updating...';

    try {
        const saleRef = doc(db, 'sales', saleId);

        await runTransaction(db, async transaction => {
            const saleSnap = await transaction.get(saleRef);

            if (!saleSnap.exists()) {
                throw new Error('Receipt no longer exists.');
            }

            const originalSale = saleSnap.data();
            const originalItems = getItems(originalSale);

            // Group quantities by product to calculate stock differences.
            const oldQty = new Map();
            const newQty = new Map();

            for (const item of originalItems) {
                if (!item.productId) {
                    throw new Error(
                        'An original product has no inventory link. ' +
                        'Cannot safely adjust its stock.'
                    );
                }

                oldQty.set(
                    item.productId,
                    (oldQty.get(item.productId) || 0) + number(item.qty)
                );
            }

            for (const item of items) {
                newQty.set(
                    item.productId,
                    (newQty.get(item.productId) || 0) + number(item.qty)
                );
            }

            const productIds = [
                ...new Set([...oldQty.keys(), ...newQty.keys()])
            ];

            // All Firestore reads must happen before any writes.
            const productData = new Map();

            for (const productId of productIds) {
                const ref = doc(db, 'products', productId);
                const snap = await transaction.get(ref);

                if (!snap.exists()) {
                    throw new Error(
                        `Inventory product ${productId} no longer exists.`
                    );
                }

                productData.set(productId, {
                    ref,
                    data: snap.data()
                });
            }

            // Validate every stock adjustment before writing.
            const stockUpdates = [];

            for (const productId of productIds) {
                const { ref, data } = productData.get(productId);

                const currentStock = number(data.stock);
                const previousSold = oldQty.get(productId) || 0;
                const revisedSold = newQty.get(productId) || 0;

                const newStock =
                    currentStock + previousSold - revisedSold;

                if (
                    !Number.isInteger(currentStock) ||
                    currentStock < 0 ||
                    newStock < 0
                ) {
                    throw new Error(
                        `Insufficient or invalid stock for ` +
                        `${data.name || productId}.`
                    );
                }

                stockUpdates.push({ ref, newStock });
            }

            // Preserve historical unit cost for existing receipt items.
            const revisedItems = items.map(item => {
                const oldItem = originalItems.find(
                    old => old.productId === item.productId
                );

                const product = productData.get(item.productId).data;

                return {
                    productId: item.productId,
                    name: item.name,
                    code: item.code,
                    qty: item.qty,
                    price: item.price,
                    unitCost: oldItem
                        ? number(oldItem.unitCost)
                        : number(product.unitCost)
                };
            });

            const costTotal = revisedItems.reduce(
                (sum, item) =>
                    sum + item.qty * item.unitCost,
                0
            );

            // Apply inventory changes.
            for (const update of stockUpdates) {
                transaction.update(update.ref, {
                    stock: update.newStock,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid
                });
            }

            // Save the complete revised receipt.
            transaction.update(saleRef, {
                customer,
                phone,
                saleDate,
                items: revisedItems,
                subtotal,
                discount,
                courier,
                salesRevenue,
                total,
                paid,
                paymentDue: due,
                paymentStatus,
                costTotal,
                orderMode: $('editOrderMode').value,
                paymentMode: $('editPaymentMode').value,
                deliveryStatus: $('editDeliveryStatus').value,
                updatedAt: serverTimestamp(),
                updatedBy: user.uid
            });
        });

        message('Receipt and inventory updated successfully.', 'success');
        closeModal();
        await loadSales();

    } catch (error) {
        console.error(error);
        editMessage(
            error.message || 'Unable to update receipt.',
            'error'
        );
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