/* =====================================
   AARABHI ONLINE THREADS - SALES
   Multi-product receipt system
===================================== */

import {
    collection,
    doc,
    getDocs,
    runTransaction,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = id => document.getElementById(id);

const money = value => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
}).format(Number(value) || 0);

const number = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
})[c]);

function getTodayDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

let products = [];
let cart = [];

export async function initSales({ db, user, go }) {

    const form = $('salesForm');
    if (!form) return;

    $('saleDate').value = getTodayDate();

    function message(text, type = '') {
        $('saleMessage').textContent = text;
        $('saleMessage').className = `form-message ${type}`;
    }

    function getSelectedProduct() {
        return products.find(p => p.id === $('saleProduct').value) || null;
    }

    async function loadProducts() {

        $('saleProduct').innerHTML = '<option value="">Loading products...</option>';

        const snapshot = await getDocs(collection(db, 'products'));

        products = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));

        products.sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''))
        );

        const available = products.filter(p => number(p.stock) > 0);

        $('saleProduct').innerHTML = `
            <option value="">Select a product</option>
            ${available.map(p => `
                <option value="${escapeHTML(p.id)}">
                    ${escapeHTML(p.code || '')} - ${escapeHTML(p.name || '')}
                    (Stock: ${number(p.stock)})
                </option>
            `).join('')}
        `;

        if (!available.length) {
            $('saleProduct').innerHTML =
                '<option value="">No products available in stock</option>';
        }
    }

    function updateProductInfo() {

        const product = getSelectedProduct();

        if (!product) {
            $('saleProductInfo').classList.add('hidden');
            $('salePrice').value = '';
            return;
        }

        $('saleProductInfo').classList.remove('hidden');
        $('saleProductCode').textContent = product.code || '-';
        $('saleAvailableStock').textContent = number(product.stock);
        $('saleUnitCost').textContent = money(product.unitCost);
        $('salePrice').value = number(product.price);
    }

    $('saleProduct').addEventListener('change', updateProductInfo);

    function getSubtotal() {
        return cart.reduce(
            (sum, item) => sum + item.qty * item.price,
            0
        );
    }

    
function getTotals() {
    const subtotal = getSubtotal();
    const courier = number($('saleCourier').value);
    const discount = number($('saleDiscount').value);

    // Business revenue excludes courier
    const salesRevenue = subtotal - discount;

    // Customer payable includes courier
    const total = salesRevenue + courier;

    const paid = number($('salePaid').value);
    const due = Math.max(0, total - paid);

    return {
        subtotal,
        courier,
        discount,
        salesRevenue,
        total,
        paid,
        due
    };
}


    function updatePaymentStatus() {

        const { total, paid } = getTotals();

        $('salePaymentStatus').value =
            paid <= 0 ? 'Due' :
            paid >= total ? 'Paid' : 'Partial';
    }

    function updateTotals() {

    const values = getTotals();

    $('saleSubtotal').textContent = money(values.subtotal);
    $('saleCourierTotal').textContent = money(values.courier);
    $('saleDiscountTotal').textContent = '-' + money(values.discount);
    $('saleGrandTotal').textContent = money(values.total);
    $('saleReceivedTotal').textContent = money(values.paid);
    $('saleDueTotal').textContent = money(values.due);

    updatePaymentStatus();
}

    function renderCart() {

        const body = $('saleCartBody');

        if (!cart.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        No products added yet.
                    </td>
                </tr>
            `;
            updateTotals();
            return;
        }

        body.innerHTML = cart.map((item, index) => `
            <tr>
                <td>${escapeHTML(item.name)}</td>
                <td>${escapeHTML(item.code || '-')}</td>
                <td>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        value="${item.qty}"
                        data-cart-qty="${index}"
                        style="width:75px"
                    >
                </td>
                <td>${money(item.price)}</td>
                <td>${money(item.qty * item.price)}</td>
                <td>
                    <button
                        type="button"
                        class="delete-invoice-btn"
                        data-remove-cart="${index}"
                    >Remove</button>
                </td>
            </tr>
        `).join('');

        updateTotals();
    }

    $('addSaleProduct').addEventListener('click', () => {

        const product = getSelectedProduct();
        const qty = number($('saleQty').value);
        const price = number($('salePrice').value);

        if (!product) {
            message('Please select a product.', 'error');
            return;
        }

        if (!Number.isInteger(qty) || qty < 1) {
            message('Enter a valid quantity.', 'error');
            return;
        }

        if (price <= 0) {
            message('Enter a valid selling price.', 'error');
            return;
        }

        const existing = cart.find(item => item.productId === product.id);
        const existingQty = existing ? existing.qty : 0;

        if (existingQty + qty > number(product.stock)) {
            message(
                `Only ${number(product.stock)} units are available for ${product.name}.`,
                'error'
            );
            return;
        }

        if (existing) {
            existing.qty += qty;
            existing.price = price;
        } else {
            cart.push({
                productId: product.id,
                name: product.name || '',
                code: product.code || '',
                qty,
                price,
                unitCost: number(product.unitCost)
            });
        }

        $('saleQty').value = 1;
        message('Product added to receipt.', 'success');
        renderCart();
    });

    $('saleCartBody').addEventListener('change', event => {

        const input = event.target.closest('[data-cart-qty]');
        if (!input) return;

        const index = number(input.dataset.cartQty);
        const item = cart[index];
        if (!item) return;

        const qty = number(input.value);
        const product = products.find(p => p.id === item.productId);

        if (!Number.isInteger(qty) || qty < 1) {
            message('Enter a valid quantity.', 'error');
            renderCart();
            return;
        }

        if (qty > number(product?.stock)) {
            message(`Available stock: ${number(product?.stock)}`, 'error');
            renderCart();
            return;
        }

        item.qty = qty;
        renderCart();
    });

    $('saleCartBody').addEventListener('click', event => {

        const button = event.target.closest('[data-remove-cart]');
        if (!button) return;

        cart.splice(number(button.dataset.removeCart), 1);
        renderCart();
        message('Product removed from receipt.');
    });

    $('saleCourier').addEventListener('input', updateTotals);
$('saleDiscount').addEventListener('input', updateTotals);
$('salePaid').addEventListener('input', updateTotals);

    function prepareReceipt() {

        if (!cart.length) {
            throw new Error('Please add at least one product.');
        }

        const customer = $('saleCustomer').value.trim();
        if (!customer) {
            throw new Error('Please enter customer name.');
        }

        const values = getTotals();

        if (values.courier < 0 || values.discount < 0 || values.paid < 0) {
    throw new Error('Courier, discount and received amounts cannot be negative.');
}


if (values.discount > values.subtotal) {
    throw new Error('Discount cannot exceed product subtotal.');
}


if (values.paid > values.total) {
    throw new Error('Amount received cannot exceed receipt total.');
}

        return {
            saleDate: $('saleDate').value,
            customer,
            phone: $('salePhone').value.trim(),
            items: cart.map(item => ({ ...item })),
            
subtotal: values.subtotal,
courier: values.courier,
discount: values.discount,
salesRevenue: values.salesRevenue,
total: values.total,

            paid: values.paid,
            paymentDue: values.due,
            costTotal: cart.reduce(
                (sum, item) => sum + item.qty * item.unitCost,
                0
            ),
            orderMode: $('saleOrderMode').value,
            paymentMode: $('salePaymentMode').value,
            paymentStatus: $('salePaymentStatus').value,
            deliveryStatus: $('saleDeliveryStatus').value
        };
    }

    function printReceipt(data) {

        const win = window.open('', '_blank', 'width=850,height=850');

        if (!win) {
            throw new Error('Please allow pop-ups to print the receipt.');
        }

        const rows = data.items.map(item => `
            <tr>
                <td>${escapeHTML(item.name)}</td>
                <td>${escapeHTML(item.code || '-')}</td>
                <td>${item.qty}</td>
                <td>${money(item.price)}</td>
                <td>${money(item.qty * item.price)}</td>
            </tr>
        `).join('');

        win.document.write(`
            <!doctype html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${escapeHTML(data.invoice || 'Receipt')}</title>
                <style>
                    body{font-family:Arial,sans-serif;padding:25px;color:#222}
                    .receipt{max-width:700px;margin:auto}
                    h1,.center{text-align:center}
                    h1{color:#147f78;margin-bottom:4px}
                    .line{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ddd}
                    table{width:100%;border-collapse:collapse;margin-top:20px}
                    th,td{border:1px solid #ddd;padding:9px;text-align:left}
                    th{background:#f1f5f5}
                    .total{font-size:20px;font-weight:bold}
                    .footer{text-align:center;margin-top:30px}
                    @media print{button{display:none}}
                </style>
            </head>
            <body>
                <div class="receipt">
                    <h1>Aarabhi Online Threads</h1>
                    <p class="center">Receipt</p>

                    <div class="line"><span>Receipt No.</span><b>${escapeHTML(data.invoice || 'Preview')}</b></div>
                    <div class="line"><span>Date</span><b>${escapeHTML(data.saleDate)}</b></div>
                    <div class="line"><span>Customer</span><b>${escapeHTML(data.customer)}</b></div>
                    <div class="line"><span>Phone</span><b>${escapeHTML(data.phone || '-')}</b></div>
                    <div class="line"><span>Order Mode</span><b>${escapeHTML(data.orderMode)}</b></div>
                    <div class="line"><span>Payment Mode</span><b>${escapeHTML(data.paymentMode)}</b></div>

                    <h3>Products</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Product</th><th>Code</th><th>Qty</th>
                                <th>Unit Price</th><th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>

                    <div class="line"><span>Product Subtotal</span><b>${money(data.subtotal)}</b></div>
                    <div class="line"><span>Courier</span><b>${money(data.courier)}</b></div>
<div class="line"><span>Discount</span><b>-${money(data.discount)}</b></div>
<div class="line total"><span>Grand Total</span><b>${money(data.total)}</b></div>
                    <div class="line"><span>Amount Received</span><b>${money(data.paid)}</b></div>
                    <div class="line"><span>Balance Due</span><b>${money(data.paymentDue)}</b></div>
                    <div class="line"><span>Payment Status</span><b>${escapeHTML(data.paymentStatus)}</b></div>
                    <div class="line"><span>Delivery Status</span><b>${escapeHTML(data.deliveryStatus)}</b></div>

                    <div class="footer">Thank you for shopping with us!</div>
                    <p class="center"><button onclick="window.print()">Print Receipt</button></p>
                </div>
            </body>
            </html>
        `);

        win.document.close();
    }

    $('printSaleReceipt').addEventListener('click', () => {
        try {
            const data = prepareReceipt();
            data.invoice = 'Preview';
            printReceipt(data);
        } catch (error) {
            message(error.message, 'error');
        }
    });

    form.addEventListener('submit', async event => {

        event.preventDefault();

        if (!form.reportValidity()) return;

        if (!user?.uid) {
            message('Please sign in again.', 'error');
            return;
        }

        const button = $('saveSaleBtn');

        try {

            const data = prepareReceipt();

            button.disabled = true;
            button.textContent = 'Saving...';
            message('Saving receipt and updating stock...');

            const counterRef = doc(db, 'counters', 'receiptNumber');
            const saleRef = doc(collection(db, 'sales'));

            const productRefs = data.items.map(item =>
                doc(db, 'products', item.productId)
            );

            let invoice = '';

            await runTransaction(db, async transaction => {

                // All reads must happen before writes.
                const counterSnap = await transaction.get(counterRef);

                const productSnaps = [];
                for (const ref of productRefs) {
                    productSnaps.push(await transaction.get(ref));
                }

                const lastNumber = counterSnap.exists()
                    ? number(counterSnap.data().lastNumber)
                    : 0;

                const nextNumber = lastNumber + 1;
                invoice = `Rct-${String(nextNumber).padStart(6, '0')}`;

                const updatedProducts = [];

                for (let i = 0; i < data.items.length; i++) {

                    const item = data.items[i];
                    const snap = productSnaps[i];

                    if (!snap.exists()) {
                        throw new Error(`Product ${item.name} no longer exists.`);
                    }

                    const latest = snap.data();
                    const stock = number(latest.stock);

                    if (stock < item.qty) {
                        throw new Error(
                            `Insufficient stock for ${latest.name}. Available: ${stock}`
                        );
                    }

                    updatedProducts.push({
                        ref: productRefs[i],
                        stock: stock - item.qty
                    });
                }

                transaction.set(counterRef, {
                    lastNumber: nextNumber,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid
                }, { merge: true });

                updatedProducts.forEach(item => {
                    transaction.update(item.ref, {
                        stock: item.stock,
                        updatedAt: serverTimestamp(),
                        updatedBy: user.uid
                    });
                });

                transaction.set(saleRef, {
                    invoice,
                    saleDate: data.saleDate,
                    customer: data.customer,
                    phone: data.phone,
                    items: data.items,
                    
subtotal: data.subtotal,
salesRevenue: data.salesRevenue,
total: data.total,
courier: data.courier,
discount: data.discount,

                    costTotal: data.costTotal,
                    paid: data.paid,
                    paymentDue: data.paymentDue,
                    orderMode: data.orderMode,
                    paymentMode: data.paymentMode,
                    paymentStatus: data.paymentStatus,
                    deliveryStatus: data.deliveryStatus,
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                });
            });

            data.invoice = invoice;

            message(`Receipt ${invoice} saved successfully.`, 'success');

            // Print the saved receipt.
            printReceipt(data);

            cart = [];
            form.reset();
            $('saleDate').value = getTodayDate();
            $('saleQty').value = 1;
            $('saleCourier').value = 0;
$('saleDiscount').value = 0;
$('salePaid').value = 0;
            $('saleProductInfo').classList.add('hidden');

            renderCart();
            await loadProducts();

            if (typeof go === 'function') {
                setTimeout(() => go('viewsales'), 900);
            }

        } catch (error) {

            console.error('Receipt save error:', error);
            message(error.message || 'Unable to save receipt.', 'error');

        } finally {

            button.disabled = false;
            button.textContent = 'Save Receipt';
        }
    });

    await loadProducts();
    renderCart();
}