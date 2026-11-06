/* =====================================
   SAREEDESK - SALES
===================================== */

import {
    collection,
    doc,
    getDocs,
    runTransaction,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const money = (value) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
};

const escapeHTML = (value) => {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[character]);
};

let products = [];
let selectedProduct = null;
let lastReceiptData = null;

export async function initSales({ db, user, go }) {

    const form = $('salesForm');

    if (!form) return;

    const productSelect = $('saleProduct');

    /* ---------------------------------
       MESSAGE
    --------------------------------- */

    function message(text, type = '') {
        $('saleMessage').textContent = text;
        $('saleMessage').className = `form-message ${type}`;
    }

    /* ---------------------------------
       LOAD PRODUCTS
    --------------------------------- */

    async function loadProducts() {

        productSelect.innerHTML = `
            <option value="">Loading products...</option>
        `;

        try {

            const snapshot = await getDocs(collection(db, 'products'));

            products = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));

            products.sort((a, b) =>
                String(a.name || '').localeCompare(String(b.name || ''))
            );

            const availableProducts = products.filter(product =>
                Number(product.stock) > 0
            );

            productSelect.innerHTML = `
                <option value="">Select a product</option>
                ${availableProducts.map(product => `
                    <option value="${escapeHTML(product.id)}">
                        ${escapeHTML(product.code || '')} -
                        ${escapeHTML(product.name || 'Unnamed Product')}
                        (Stock: ${Number(product.stock) || 0})
                    </option>
                `).join('')}
            `;

            if (!availableProducts.length) {
                productSelect.innerHTML = `
                    <option value="">No products available in stock</option>
                `;
            }

        } catch (error) {

            console.error('Product loading error:', error);

            productSelect.innerHTML = `
                <option value="">Unable to load products</option>
            `;

            message('Unable to load inventory products.', 'error');

        }

    }

    /* ---------------------------------
       SELECT PRODUCT
    --------------------------------- */

    function selectProduct() {

        const productId = productSelect.value;

        selectedProduct = products.find(product =>
            product.id === productId
        ) || null;

        if (!selectedProduct) {

            $('saleProductInfo').classList.add('hidden');
            $('salePrice').value = '';

            calculateTotals();
            return;
        }

        $('saleProductInfo').classList.remove('hidden');

        $('saleProductCode').textContent =
            selectedProduct.code || '-';

        $('saleAvailableStock').textContent =
            Number(selectedProduct.stock) || 0;

        $('saleUnitCost').textContent =
            money(selectedProduct.unitCost);

        $('salePrice').value =
            Number(selectedProduct.price) || 0;

        calculateTotals();

    }

    productSelect.addEventListener('change', selectProduct);

    /* ---------------------------------
       CALCULATE SALE TOTALS
    --------------------------------- */

    function getSaleValues() {

        const qty = Number($('saleQty').value) || 0;
        const price = Number($('salePrice').value) || 0;
        const courier = Number($('saleCourier').value) || 0;
        const paid = Number($('salePaid').value) || 0;

        const subtotal = qty * price;
        const total = subtotal + courier;
        const due = Math.max(0, total - paid);

        return {
            qty,
            price,
            courier,
            paid,
            subtotal,
            total,
            due
        };

    }

    function calculateTotals() {

        const values = getSaleValues();

        $('saleSubtotal').textContent = money(values.subtotal);
        $('saleCourierTotal').textContent = money(values.courier);
        $('saleGrandTotal').textContent = money(values.total);
        $('saleReceivedTotal').textContent = money(values.paid);
        $('saleDueTotal').textContent = money(values.due);

    }

    [
        'saleQty',
        'salePrice',
        'saleCourier',
        'salePaid'
    ].forEach(id => {
        $(id).addEventListener('input', calculateTotals);
    });

    /* ---------------------------------
       AUTOMATIC PAYMENT STATUS
    --------------------------------- */

    $('salePaid').addEventListener('input', () => {

        const values = getSaleValues();

        let status = 'Due';

        if (values.paid >= values.total && values.total > 0) {
            status = 'Paid';
        } else if (values.paid > 0) {
            status = 'Partial';
        }

        $('salePaymentStatus').value = status;

    });

    /* ---------------------------------
       PREPARE RECEIPT DATA
    --------------------------------- */

    function prepareReceipt() {

        const values = getSaleValues();

        if (!selectedProduct) {
            throw new Error('Please select a product first.');
        }

        if (!Number.isInteger(values.qty) || values.qty < 1) {
            throw new Error('Enter a valid quantity.');
        }

        if (values.qty > Number(selectedProduct.stock)) {
            throw new Error('Requested quantity exceeds available stock.');
        }

        if (values.price <= 0) {
            throw new Error('Enter a valid selling price.');
        }

        if (values.paid < 0 || values.paid > values.total) {
            throw new Error('Amount received cannot exceed the total amount.');
        }

        if (values.courier < 0) {
            throw new Error('Courier cost cannot be negative.');
        }

        return {
            customer: $('saleCustomer').value.trim(),
            phone: $('salePhone').value.trim(),
            productName: selectedProduct.name || '',
            productCode: selectedProduct.code || '',
            qty: values.qty,
            price: values.price,
            unitCost: Number(selectedProduct.unitCost) || 0,
            total: values.total,
            subtotal: values.subtotal,
            courier: values.courier,
            costTotal: values.qty * (Number(selectedProduct.unitCost) || 0),
            paid: values.paid,
            paymentDue: values.due,
            orderMode: $('saleOrderMode').value,
            paymentMode: $('salePaymentMode').value,
            paymentStatus: $('salePaymentStatus').value,
            deliveryStatus: $('saleDeliveryStatus').value
        };

    }

    /* ---------------------------------
       PRINT RECEIPT
    --------------------------------- */

    function printReceipt(data) {

        const receiptWindow = window.open('', '_blank', 'width=750,height=850');

        if (!receiptWindow) {
            throw new Error('Please allow pop-ups to print the receipt.');
        }

        const invoice = data.invoice || 'Preview';

        receiptWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>SareeDesk Receipt</title>
                <meta charset="UTF-8">

                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 30px;
                        color: #222;
                    }

                    .receipt {
                        max-width: 600px;
                        margin: auto;
                    }

                    h1 {
                        text-align: center;
                        margin-bottom: 5px;
                    }

                    .subtitle {
                        text-align: center;
                        color: #666;
                        margin-bottom: 25px;
                    }

                    .line {
                        display: flex;
                        justify-content: space-between;
                        gap: 20px;
                        padding: 9px 0;
                        border-bottom: 1px solid #ddd;
                    }

                    .total {
                        font-size: 19px;
                        font-weight: bold;
                    }

                    .footer {
                        text-align: center;
                        margin-top: 30px;
                        color: #666;
                        font-size: 12px;
                    }

                    @media print {
                        button {
                            display: none;
                        }
                    }
                </style>
            </head>

            <body>
                <div class="receipt">

                    <h1>SareeDesk</h1>
                    <div class="subtitle">Sales Receipt</div>

                    <div class="line">
                        <span>Invoice</span>
                        <b>${escapeHTML(invoice)}</b>
                    </div>

                    <div class="line">
                        <span>Customer</span>
                        <b>${escapeHTML(data.customer)}</b>
                    </div>

                    <div class="line">
                        <span>Phone</span>
                        <b>${escapeHTML(data.phone || '-')}</b>
                    </div>

                    <div class="line">
                        <span>Order Mode</span>
                        <b>${escapeHTML(data.orderMode)}</b>
                    </div>

                    <div class="line">
                        <span>Payment Mode</span>
                        <b>${escapeHTML(data.paymentMode)}</b>
                    </div>

                    <div class="line">
                        <span>Payment Status</span>
                        <b>${escapeHTML(data.paymentStatus)}</b>
                    </div>

                    <div class="line">
                        <span>Delivery Status</span>
                        <b>${escapeHTML(data.deliveryStatus)}</b>
                    </div>

                    <h3>Product Details</h3>

                    <div class="line">
                        <span>Product</span>
                        <b>${escapeHTML(data.productName)}</b>
                    </div>

                    <div class="line">
                        <span>Product Code</span>
                        <b>${escapeHTML(data.productCode)}</b>
                    </div>

                    <div class="line">
                        <span>Quantity</span>
                        <b>${data.qty}</b>
                    </div>

                    <div class="line">
                        <span>Unit Price</span>
                        <b>${money(data.price)}</b>
                    </div>

                    <div class="line">
                        <span>Subtotal</span>
                        <b>${money(data.subtotal)}</b>
                    </div>

                    <div class="line">
                        <span>Courier</span>
                        <b>${money(data.courier)}</b>
                    </div>

                    <div class="line total">
                        <span>Total</span>
                        <b>${money(data.total)}</b>
                    </div>

                    <div class="line">
                        <span>Received</span>
                        <b>${money(data.paid)}</b>
                    </div>

                    <div class="line">
                        <span>Balance Due</span>
                        <b>${money(data.paymentDue)}</b>
                    </div>

                    <div class="footer">
                        Thank you for shopping with us!
                    </div>

                    <br>
                    <button onclick="window.print()">Print Receipt</button>

                </div>
            </body>
            </html>
        `);

        receiptWindow.document.close();

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

    /* ---------------------------------
       SAVE SALE AND DEDUCT STOCK
    --------------------------------- */

    form.addEventListener('submit', async (event) => {

        event.preventDefault();

        const saveButton = $('saveSaleBtn');

        if (!form.reportValidity()) return;

        if (!user?.uid) {
            message('Please sign in again.', 'error');
            return;
        }

        try {

            if (!selectedProduct) {
                throw new Error('Please select a product.');
            }

            const data = prepareReceipt();

            if (!data.customer) {
                throw new Error('Please enter customer name.');
            }

            saveButton.disabled = true;
            saveButton.textContent = 'Saving...';

            message('Saving sale and updating stock...');

            const productRef = doc(db, 'products', selectedProduct.id);

            const invoice = `SD-${Date.now()}`;

            await runTransaction(db, async (transaction) => {

                const productSnap = await transaction.get(productRef);

                if (!productSnap.exists()) {
                    throw new Error('Selected product no longer exists.');
                }

                const latestProduct = productSnap.data();

                const availableStock = Number(latestProduct.stock) || 0;

                if (availableStock < data.qty) {
                    throw new Error(
                        `Insufficient stock. Available quantity: ${availableStock}`
                    );
                }

                const saleRef = doc(collection(db, 'sales'));

                transaction.update(productRef, {
                    stock: availableStock - data.qty,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid
                });

                transaction.set(saleRef, {
                    invoice,
                    customer: data.customer,
                    phone: data.phone,
                    productId: selectedProduct.id,
                    productName: latestProduct.name || '',
                    productCode: latestProduct.code || '',
                    qty: data.qty,
                    price: data.price,
                    total: data.total,
                    costTotal: data.costTotal,
                    unitCost: data.unitCost,
                    courier: data.courier,
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
            lastReceiptData = data;

            message(`Sale saved successfully. Invoice: ${invoice}`, 'success');

            // Refresh available stock after successful transaction.
            await loadProducts();

            form.reset();

            selectedProduct = null;
            $('saleProductInfo').classList.add('hidden');

            $('saleQty').value = 1;
            $('saleCourier').value = 0;
            $('salePaid').value = 0;
            $('salePaymentStatus').value = 'Paid';

            calculateTotals();

            if (typeof go === 'function') {
                setTimeout(() => go('viewsales'), 900);
            }

        } catch (error) {

            console.error('Sale saving error:', error);

            message(error.message || 'Unable to save sale.', 'error');

        } finally {

            saveButton.disabled = false;
            saveButton.textContent = 'Save Sale';

        }

    });

    /* ---------------------------------
       INITIALIZE
    --------------------------------- */

    calculateTotals();

    await loadProducts();

}