
/* =====================================
   SAREEDESK - VIEW SALES
   Edit and Delete Invoices
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

export async function initViewSales({ db, user, profile }) {

    const tableBody = $('salesTableBody');

    if (!tableBody) return;

    const isAdmin = profile?.role === 'admin';

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
    
    function getSaleProfit(sale) {
    const qty = number(sale.qty);

    const unitCost = number(sale.unitCost) ||
        number(productsMap.get(sale.productId)?.unitCost);

    const costTotal =
        sale.costTotal !== undefined && sale.costTotal !== null
            ? number(sale.costTotal)
            : unitCost * qty;

    // Invoice total includes courier charged to the customer.
    // Subtract courier cost to calculate product profit.
    return number(sale.total) - costTotal - number(sale.courier);
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

    const totalProfit = salesRecords.reduce(
        (sum, sale) => sum + (
            number(sale.total) - number(sale.costTotal)
        ),
        0
    );

    const totalDue = salesRecords.reduce(
        (sum, sale) => sum + Math.max(0, number(sale.paymentDue)),
        0
    );

    $('totalInvoices').textContent = totalInvoices;
    $('totalSalesAmount').textContent = money(totalSales);
    $('totalSalesProfit').textContent = money(totalProfit);
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
   PRINT INVOICE
--------------------------------- */

function printInvoice(sale) {
    const printWindow = window.open('', '_blank', 'width=850,height=750');

    if (!printWindow) {
        setMessage('Please allow pop-ups to print the invoice.', 'error');
        return;
    }

    const due = Math.max(0, number(sale.paymentDue));
    const invoiceDate = formatDate(sale.createdAt);

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHTML(sale.invoice || 'Sales Invoice')}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 30px;
                    color: #222;
                }

                .receipt {
                    max-width: 700px;
                    margin: auto;
                    padding: 30px;
                    border: 1px solid #ddd;
                }

                .header {
                    text-align: center;
                    border-bottom: 2px solid #167f78;
                    padding-bottom: 15px;
                }

                .header h1 {
                    color: #167f78;
                    margin-bottom: 5px;
                }

                .details {
                    margin: 25px 0;
                    line-height: 1.9;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }

                th, td {
                    padding: 12px;
                    border: 1px solid #ddd;
                    text-align: left;
                }

                th {
                    background: #f3f6f8;
                }

                .totals {
                    margin-top: 25px;
                    text-align: right;
                    line-height: 2;
                }

                .balance {
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
                    <p>Sales Invoice</p>
                    <strong>${escapeHTML(sale.invoice || '-')}</strong>
                </div>

                <div class="details">
                    <strong>Date:</strong> ${escapeHTML(invoiceDate)}<br>
                    <strong>Customer:</strong> ${escapeHTML(sale.customer || '-')}<br>
                    <strong>Phone:</strong> ${escapeHTML(sale.phone || '-')}<br>
                    <strong>Order Mode:</strong> ${escapeHTML(sale.orderMode || '-')}<br>
                    <strong>Payment Mode:</strong> ${escapeHTML(sale.paymentMode || '-')}<br>
                    <strong>Payment Status:</strong> ${escapeHTML(sale.paymentStatus || '-')}<br>
                    <strong>Delivery Status:</strong> ${escapeHTML(sale.deliveryStatus || '-')}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Quantity</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${escapeHTML(sale.productName || '-')}</td>
                            <td>${number(sale.qty)}</td>
                            <td>${money(sale.price)}</td>
                            <td>${money(sale.total)}</td>

<td class="${getSaleProfit(sale) >= 0 ? 'status-paid' : 'status-due'}">
    ${money(getSaleProfit(sale))}
</td>

<td>${money(sale.paid)}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="totals">
                    <div>Invoice Total: ${money(sale.total)}</div>
                    <div>Courier Cost: ${money(sale.courier)}</div>
                    <div>Amount Received: ${money(sale.paid)}</div>
                    <div class="balance">Balance Due: ${money(due)}</div>
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

    printWindow.document.close();
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

<td class="profit-cell">
    ${money(number(sale.total) - number(sale.costTotal))}
</td>

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
                        <div class="sales-actions">
                            <button
                                type="button"
                                class="edit-invoice-btn"
                                data-edit-sale="${escapeHTML(sale.id)}"
                            >
                                Edit
                            </button>

                            ${isAdmin ? `
                                <button
                                    type="button"
                                    class="delete-invoice-btn"
                                    data-delete-sale="${escapeHTML(sale.id)}"
                                >
                                    Delete
                                </button>
<button
    type="button"
    class="print-invoice-btn"
    data-print-sale="${escapeHTML(sale.id)}"
>
    Print
</button>


                            ` : ''}
                        </div>
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
                <td colspan="12" class="empty-state">
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
       DELETE INVOICE
       RESTORE STOCK AUTOMATICALLY
    --------------------------------- */

    async function deleteInvoice(saleId, button) {

    if (!isAdmin) {
        alert('Only Admin can delete invoices.');
        return;
    }

    const sale = salesRecords.find(item => item.id === saleId);

    if (!sale) return;

    const confirmed = confirm(
        `Are you sure you want to permanently delete this invoice?\n\n` +
        `Invoice: ${sale.invoice || '-'}\n` +
        `Customer: ${sale.customer || '-'}\n` +
        `Product: ${sale.productName || '-'}\n` +
        `Quantity: ${number(sale.qty)}\n` +
        `Total: ${money(sale.total)}\n\n` +
        `If the linked inventory product exists, the quantity will be returned to stock.\n` +
        `If the product is missing, the invoice will still be deleted, but stock cannot be restored.\n\n` +
        `This action cannot be undone.`
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = 'Deleting...';

    try {

        const saleRef = doc(db, 'sales', saleId);

        let stockRestored = false;
        let linkedProductMissing = false;

        await runTransaction(db, async transaction => {

            // Reset values in case Firestore retries the transaction.
            stockRestored = false;
            linkedProductMissing = false;

            // Read the latest invoice.
            const saleSnap = await transaction.get(saleRef);

            if (!saleSnap.exists()) {
                throw new Error('This invoice no longer exists.');
            }

            const currentSale = saleSnap.data();

            // Restore stock only for inventory-based sales.
            if (currentSale.productId) {

                const productRef = doc(
                    db,
                    'products',
                    currentSale.productId
                );

                const productSnap = await transaction.get(productRef);

                if (productSnap.exists()) {

                    const oldQty = number(currentSale.qty);

                    if (oldQty < 0) {
                        throw new Error('Invalid invoice quantity.');
                    }

                    const currentStock = number(
                        productSnap.data().stock
                    );

                    transaction.update(productRef, {
                        stock: currentStock + oldQty,
                        updatedAt: serverTimestamp(),
                        updatedBy: user.uid
                    });

                    stockRestored = true;

                } else {

                    // Product was deleted earlier.
                    // Continue with invoice deletion.
                    linkedProductMissing = true;
                }
            }

            // Delete invoice even if the linked product is missing.
            transaction.delete(saleRef);

        });

        if (linkedProductMissing) {

            setMessage(
                'Invoice deleted successfully. Warning: Linked product was missing, so stock could not be restored.',
                'error'
            );

        } else if (stockRestored) {

            setMessage(
                'Invoice deleted successfully. Stock quantity restored.',
                'success'
            );

        } else {

            setMessage(
                'Direct sale invoice deleted successfully.',
                'success'
            );
        }

        // Refresh invoice list and summary.
        await loadSales();

    } catch (error) {

        console.error('Invoice deletion error:', error);

        setMessage(
            error.message || 'Unable to delete invoice.',
            'error'
        );

        button.disabled = false;
        button.textContent = 'Delete';
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

    /* ---------------------------------
       TABLE ACTIONS
    --------------------------------- */

    tableBody.addEventListener('click', async event => {

        const editButton = event.target.closest('[data-edit-sale]');
        const deleteButton = event.target.closest('[data-delete-sale]');
        const printButton = event.target.closest('[data-print-sale]');

        if (editButton) {

            const sale = salesRecords.find(item =>
                item.id === editButton.dataset.editSale
            );

            if (sale) openEditModal(sale);

            return;
        }

        if (printButton) {
    const sale = salesRecords.find(item =>
        item.id === printButton.dataset.printSale
    );

    if (sale) {
        printInvoice(sale);
    }

    return;
}

        if (deleteButton) {

            await deleteInvoice(
                deleteButton.dataset.deleteSale,
                deleteButton
            );
        }
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

                    // Restore old quantity, then deduct edited quantity.
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
