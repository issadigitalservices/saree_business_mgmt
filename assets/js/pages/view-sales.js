/* =====================================
   SAREEDESK - VIEW SALES
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
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
};

const number = (value) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
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

const formatDate = (timestamp) => {
    if (!timestamp) return '-';

    const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return '-';

    return date.toLocaleDateString('en-IN');
};

let salesRecords = [];
let productsMap = new Map();
let activeFilter = 'all';
let editingSale = null;

export async function initViewSales({ db, user }) {

    const tableBody = $('salesTableBody');

    if (!tableBody) return;

    /* ---------------------------------
       MESSAGE
    --------------------------------- */

    function setMessage(text, type = '') {
        $('viewSalesMessage').textContent = text;
        $('viewSalesMessage').className = `view-sales-message ${type}`;
    }

    function setEditMessage(text, type = '') {
        $('editSaleMessage').textContent = text;
        $('editSaleMessage').className = `form-message ${type}`;
    }

    /* ---------------------------------
       LOAD INVENTORY FOR EDITS
    --------------------------------- */

    async function loadProductsMap() {

        const snapshot = await getDocs(collection(db, 'products'));

        productsMap = new Map();

        snapshot.docs.forEach(item => {
            productsMap.set(item.id, {
                id: item.id,
                ...item.data()
            });
        });

    }

    /* ---------------------------------
       UPDATE SUMMARY
    --------------------------------- */

    function updateSummary() {

        const totalInvoices = salesRecords.length;

        const totalSales = salesRecords.reduce(
            (sum, sale) => sum + number(sale.total),
            0
        );

        const totalDue = salesRecords.reduce(
            (sum, sale) => sum + Math.max(0, number(sale.paymentDue)),
            0
        );

        $('totalInvoices').textContent = totalInvoices;
        $('totalSalesAmount').textContent = money(totalSales);
        $('totalSalesDue').textContent = money(totalDue);

    }

    /* ---------------------------------
       FILTER AND SEARCH
    --------------------------------- */

    function getFilteredSales() {

        const searchTerm = $('salesSearch').value
            .trim()
            .toLowerCase();

        return salesRecords.filter(sale => {

            const invoice = String(sale.invoice || '').toLowerCase();
            const customer = String(sale.customer || '').toLowerCase();
            const product = String(sale.productName || '').toLowerCase();

            const matchesSearch =
                invoice.includes(searchTerm) ||
                customer.includes(searchTerm) ||
                product.includes(searchTerm);

            let matchesFilter = true;

            if (activeFilter === 'due') {
                matchesFilter = number(sale.paymentDue) > 0;
            }

            if (activeFilter === 'undelivered') {
                matchesFilter = sale.deliveryStatus !== 'Delivered';
            }

            return matchesSearch && matchesFilter;

        });

    }

    /* ---------------------------------
       RENDER SALES
    --------------------------------- */

    function renderSales() {

        const filteredSales = getFilteredSales();

        $('salesCount').textContent =
            `${filteredSales.length} invoice${filteredSales.length === 1 ? '' : 's'}`;

        if (!filteredSales.length) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="11" class="empty-state">
                        No invoices found.
                    </td>
                </tr>
            `;

            return;
        }

        tableBody.innerHTML = filteredSales.map(sale => {

            const paymentDue = number(sale.paymentDue);

            const paymentClass = paymentDue <= 0
                ? 'status-paid'
                : 'status-due';

            const deliveryClass = sale.deliveryStatus === 'Delivered'
                ? 'status-paid'
                : 'status-pending';

            return `
                <tr>

                    <td>${escapeHTML(sale.invoice || '-')}</td>

                    <td>${formatDate(sale.createdAt)}</td>

                    <td>${escapeHTML(sale.customer || '-')}</td>

                    <td>${escapeHTML(sale.productName || '-')}</td>

                    <td>${number(sale.qty)}</td>

                    <td>${money(sale.total)}</td>

                    <td>${money(sale.paid)}</td>

                    <td class="${paymentClass}">
                        ${money(paymentDue)}
                    </td>

                    <td class="${paymentClass}">
                        ${escapeHTML(sale.paymentStatus || '-')}
                    </td>

                    <td class="${deliveryClass}">
                        ${escapeHTML(sale.deliveryStatus || '-')}
                    </td>

                    <td>
                        <button
                            type="button"
                            class="edit-invoice-btn"
                            data-edit-sale="${escapeHTML(sale.id)}"
                        >
                            Edit
                        </button>
                    </td>

                </tr>
            `;

        }).join('');

    }

    /* ---------------------------------
       LOAD SALES
    --------------------------------- */

    async function loadSales() {

        const refreshButton = $('refreshSales');

        refreshButton.disabled = true;
        refreshButton.textContent = 'Loading...';

        tableBody.innerHTML = `
            <tr>
                <td colspan="11" class="empty-state">
                    Loading invoices...
                </td>
            </tr>
        `;

        setMessage('');

        try {

            const [salesSnapshot] = await Promise.all([
                getDocs(collection(db, 'sales')),
                loadProductsMap()
            ]);

            salesRecords = salesSnapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));

            salesRecords.sort((a, b) => {

                const dateA = a.createdAt?.toMillis
                    ? a.createdAt.toMillis()
                    : new Date(a.createdAt || 0).getTime();

                const dateB = b.createdAt?.toMillis
                    ? b.createdAt.toMillis()
                    : new Date(b.createdAt || 0).getTime();

                return dateB - dateA;

            });

            updateSummary();
            renderSales();

        } catch (error) {

            console.error('Sales loading error:', error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="11" class="empty-state">
                        Unable to load sales records.
                    </td>
                </tr>
            `;

            setMessage(error.message || 'Unable to load invoices.', 'error');

        } finally {

            refreshButton.disabled = false;
            refreshButton.textContent = '↻ Refresh';

        }

    }

    /* ---------------------------------
       FILTER BUTTONS
    --------------------------------- */

    $('salesFilters').addEventListener('click', event => {

        const button = event.target.closest('[data-filter]');

        if (!button) return;

        activeFilter = button.dataset.filter;

        $('salesFilters')
            .querySelectorAll('[data-filter]')
            .forEach(item => item.classList.remove('active'));

        button.classList.add('active');

        renderSales();

    });

    $('salesSearch').addEventListener('input', renderSales);

    $('refreshSales').addEventListener('click', loadSales);

    /* ---------------------------------
       OPEN EDIT MODAL
    --------------------------------- */

    function openEditModal(sale) {

        editingSale = sale;

        $('editSaleId').value = sale.id;
        $('editInvoiceNumber').textContent = sale.invoice || '';

        $('editCustomer').value = sale.customer || '';
        $('editPhone').value = sale.phone || '';
        $('editProductName').value = sale.productName || '';

        $('editQty').value = number(sale.qty) || 1;
        $('editPrice').value = number(sale.price);
        $('editPaid').value = number(sale.paid);
        $('editCourier').value = number(sale.courier);

        $('editOrderMode').value = sale.orderMode || 'Online';
        $('editPaymentMode').value = sale.paymentMode || 'Cash';
        $('editDeliveryStatus').value = sale.deliveryStatus || 'Pending';

        calculateEditTotals();

        setEditMessage('');

        $('editSaleModal').classList.remove('hidden');

    }

    tableBody.addEventListener('click', event => {

        const button = event.target.closest('[data-edit-sale]');

        if (!button) return;

        const sale = salesRecords.find(item =>
            item.id === button.dataset.editSale
        );

        if (sale) openEditModal(sale);

    });

    /* ---------------------------------
       CLOSE MODAL
    --------------------------------- */

    function closeModal() {

        $('editSaleModal').classList.add('hidden');

        editingSale = null;

    }

    $('closeSaleModal').addEventListener('click', closeModal);

    $('cancelSaleEdit').addEventListener('click', closeModal);

    $('editSaleModal').addEventListener('click', event => {

        if (event.target === $('editSaleModal')) {
            closeModal();
        }

    });

    /* ---------------------------------
       CALCULATE EDIT TOTALS
    --------------------------------- */

    function getEditValues() {

        const qty = number($('editQty').value);
        const price = number($('editPrice').value);
        const paid = number($('editPaid').value);
        const courier = number($('editCourier').value);

        const subtotal = qty * price;
        const total = subtotal + courier;
        const due = Math.max(0, total - paid);

        return {
            qty,
            price,
            paid,
            courier,
            subtotal,
            total,
            due
        };

    }

    function calculateEditTotals() {

        const values = getEditValues();

        $('editTotal').textContent = money(values.total);
        $('editDue').textContent = money(values.due);

    }

    [
        'editQty',
        'editPrice',
        'editPaid',
        'editCourier'
    ].forEach(id => {
        $(id).addEventListener('input', calculateEditTotals);
    });

    /* ---------------------------------
       UPDATE INVOICE
    --------------------------------- */

    $('editSaleForm').addEventListener('submit', async event => {

        event.preventDefault();

        if (!editingSale || !user?.uid) {
            setEditMessage('Please sign in again.', 'error');
            return;
        }

        if (!event.currentTarget.reportValidity()) return;

        const updateButton = $('updateSaleBtn');

        const values = getEditValues();

        if (!Number.isInteger(values.qty) || values.qty < 1) {
            setEditMessage('Enter a valid quantity.', 'error');
            return;
        }

        if (values.price <= 0) {
            setEditMessage('Selling price must be greater than zero.', 'error');
            return;
        }

        if (values.courier < 0 || values.paid < 0) {
            setEditMessage('Payment and courier values cannot be negative.', 'error');
            return;
        }

        if (values.paid > values.total) {
            setEditMessage('Amount received cannot exceed invoice total.', 'error');
            return;
        }

        const sale = editingSale;

        const isStockSale = Boolean(sale.productId);

        const productRef = isStockSale
            ? doc(db, 'products', sale.productId)
            : null;

        const saleRef = doc(db, 'sales', sale.id);

        const oldQty = number(sale.qty);

        const unitCost = number(sale.unitCost) ||
            (isStockSale
                ? number(productsMap.get(sale.productId)?.unitCost)
                : 0);

        const costTotal = unitCost * values.qty;

        const paymentStatus = values.due <= 0
            ? 'Paid'
            : values.paid > 0
                ? 'Partial'
                : 'Due';

        updateButton.disabled = true;
        updateButton.textContent = 'Updating...';

        try {

            await runTransaction(db, async transaction => {

                const saleSnap = await transaction.get(saleRef);

                if (!saleSnap.exists()) {
                    throw new Error('This invoice no longer exists.');
                }

                let newStock = null;

                if (isStockSale) {

                    const productSnap = await transaction.get(productRef);

                    if (!productSnap.exists()) {
                        throw new Error('Linked inventory product was not found.');
                    }

                    const currentStock = number(productSnap.data().stock);

                    // Restore the old quantity, then deduct the edited quantity.
                    newStock = currentStock + oldQty - values.qty;

                    if (newStock < 0) {
                        throw new Error(
                            `Insufficient stock for this update. Available stock: ${currentStock + oldQty}`
                        );
                    }

                    transaction.update(productRef, {
                        stock: newStock,
                        updatedAt: serverTimestamp(),
                        updatedBy: user.uid
                    });

                }

                transaction.update(saleRef, {

                    customer: $('editCustomer').value.trim(),
                    phone: $('editPhone').value.trim(),

                    qty: values.qty,
                    price: values.price,

                    total: values.total,
                    costTotal,
                    unitCost,

                    courier: values.courier,

                    paid: values.paid,
                    paymentDue: values.due,
                    paymentStatus,

                    orderMode: $('editOrderMode').value,
                    paymentMode: $('editPaymentMode').value,
                    deliveryStatus: $('editDeliveryStatus').value,

                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid

                });

            });

            setEditMessage('Invoice updated successfully.', 'success');

            await loadSales();

            setTimeout(closeModal, 500);

        } catch (error) {

            console.error('Invoice update error:', error);

            setEditMessage(
                error.message || 'Unable to update invoice.',
                'error'
            );

        } finally {

            updateButton.disabled = false;
            updateButton.textContent = 'Update Invoice';

        }

    });

    /* ---------------------------------
       INITIALIZE
    --------------------------------- */

    await loadSales();

}