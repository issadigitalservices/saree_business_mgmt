
/* ==========================================
   AARABHI ONLINE THREADS
   HISTORICAL DATA IMPORT
   Firebase Firestore 10.12.5
========================================== */
import {
    collection,
    doc,
    getDocs,
    getDoc,
    query,
    where,
    writeBatch,
    runTransaction,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = id => document.getElementById(id);

const INVENTORY_HEADERS = [
    'Product Code',
    'Product Name',
    'Product Date',
    'Unit Cost',
    'Selling Price',
    'Profit Per Unit',
    'Stock Quantity',
    'Stock Value',
    'Potential Sales Value',
    'Stock Status',
    'Qty Added'
];

const SALES_HEADERS = [
    'Receipt Number',
    'Sale Date',
    'Customer Name',
    'Phone Number',
    'Product Names',
    'Product Codes',
    'Total Quantity',
    'Product Subtotal',
    'Discount',
    'Sales Revenue',
    'Cost of Goods Sold',
    'Gross Profit',
    'Courier Pass Through',
    'Customer Payable',
    'Amount Received',
    'Balance Due',
    'Payment Status',
    'Order Mode',
    'Payment Mode',
    'Delivery Status'
];

const money = value => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
}).format(value ?? 0);

const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[c]);

function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    text = text.replace(/^\uFEFF/, '');

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            if (quoted && text[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (char === ',' && !quoted) {
            row.push(field);
            field = '';
        } else if (
            (char === '\n' || char === '\r') &&
            !quoted
        ) {
            if (char === '\r' && text[i + 1] === '\n') {
                i++;
            }

            row.push(field);

            if (row.some(value => value.trim() !== '')) {
                rows.push(row);
            }

            row = [];
            field = '';
        } else {
            field += char;
        }
    }

    if (quoted) {
        throw new Error('CSV contains an unclosed quoted field.');
    }

    row.push(field);

    if (row.some(value => value.trim() !== '')) {
        rows.push(row);
    }

    if (rows.length < 2) {
        throw new Error('CSV must contain headers and data.');
    }

    const headers = rows.shift().map(h => h.trim());

    if (new Set(headers).size !== headers.length) {
        throw new Error('CSV contains duplicate column headers.');
    }

    return rows.map((values, index) => {
        if (values.length !== headers.length) {
            throw new Error(
                `CSV row ${index + 2} has ${values.length} columns; ` +
                `expected ${headers.length}.`
            );
        }

        const record = {};

        headers.forEach((header, i) => {
            record[header] = values[i].trim();
        });

        return record;
    });
}

function checkHeaders(records, required) {
    const headers = Object.keys(records[0] || {});
    const missing = required.filter(h => !headers.includes(h));

    if (missing.length) {
        throw new Error(
            'Missing CSV columns: ' + missing.join(', ')
        );
    }
}

function optionalNumber(value, label, rowNumber) {
    const raw = String(value ?? '').trim();

    if (raw === '') return null;

    const cleaned = raw
        .replace(/[₹,\s]/g, '')
        .replace(/^\((.*)\)$/, '-$1');

    const result = Number(cleaned);

    if (!Number.isFinite(result)) {
        throw new Error(
            `Row ${rowNumber}: invalid ${label}: ${raw}`
        );
    }

    return result;
}

function requiredNumber(value, label, rowNumber) {
    const result = optionalNumber(value, label, rowNumber);

    if (result === null) {
        throw new Error(
            `Row ${rowNumber}: ${label} is required.`
        );
    }

    return result;
}

function parseDate(value, rowNumber) {
    const text = String(value || '').trim();

    if (!text) return '';

    let year, month, day;

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        [year, month, day] = text.split('-').map(Number);
    } else if (/^\d{2}-\d{2}-\d{4}$/.test(text)) {
        [day, month, year] = text.split('-').map(Number);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
        [day, month, year] = text.split('/').map(Number);
    } else {
        throw new Error(
            `Row ${rowNumber}: unsupported date ${text}`
        );
    }

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) {
        throw new Error(
            `Row ${rowNumber}: invalid date ${text}`
        );
    }

    return [
        String(year).padStart(4, '0'),
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0')
    ].join('-');
}

function showMessage(id, text, type = '') {
    const element = $(id);
    element.textContent = text;
    element.className = `import-message ${type}`;
}

function setPreview(id, visible) {
    $(id).classList.toggle('hidden', !visible);
}

function productDocumentId(code) {
    return `legacy-product-${code}`;
}

function saleDocumentId(invoice) {
    return `legacy-sale-${invoice}`;
}

function validateInventory(rows) {
    checkHeaders(rows, INVENTORY_HEADERS);

    const seen = new Set();

    return rows.map((r, index) => {
        const line = index + 2;
        const code = r['Product Code'].trim();
        const name = r['Product Name'].trim();

        if (!/^PR-\d{5,}$/.test(code)) {
            throw new Error(
                `Row ${line}: invalid product code ${code}`
            );
        }

        if (seen.has(code)) {
            throw new Error(
                `Duplicate product code in CSV: ${code}`
            );
        }

        if (!name) {
            throw new Error(
                `Row ${line}: product name is missing.`
            );
        }

        seen.add(code);

        const stock = requiredNumber(
            r['Stock Quantity'], 'Stock Quantity', line
        );

        const qtyAdded = optionalNumber(
            r['Qty Added'], 'Qty Added', line
        );

        if (!Number.isInteger(stock) || stock < 0) {
            throw new Error(
                `Row ${line}: invalid stock quantity.`
            );
        }

        if (
            qtyAdded !== null &&
            (!Number.isInteger(qtyAdded) || qtyAdded < 0)
        ) {
            throw new Error(
                `Row ${line}: invalid Qty Added.`
            );
        }

        const cost = optionalNumber(
            r['Unit Cost'], 'Unit Cost', line
        );

        const price = optionalNumber(
            r['Selling Price'], 'Selling Price', line
        );

        const stockValue = optionalNumber(
            r['Stock Value'], 'Stock Value', line
        );

        const potentialSalesValue = optionalNumber(
            r['Potential Sales Value'],
            'Potential Sales Value',
            line
        );

        const originalProfit = optionalNumber(
            r['Profit Per Unit'],
            'Profit Per Unit',
            line
        );

        // Some historical records contain aggregate
        // purchase/sales amounts, not per-unit amounts.
        // Do not divide or multiply these values silently.
        const bulkAggregate = qtyAdded !== null &&
            qtyAdded > 1 &&
            (
                code === 'PR-00001' ||
                code === 'PR-00002' ||
                code === 'PR-00109'
            );

        const warnings = [];

        if (bulkAggregate) {
            warnings.push(
                'Bulk historical totals; per-unit cost ' +
                'and selling price are unverified.'
            );
        }

        if (cost === null || price === null) {
            warnings.push('Cost or selling price is missing.');
        }

        if (stock > 0 && bulkAggregate) {
            warnings.push(
                'Remaining stock has no verified unit valuation.'
            );
        }

        const productDate = parseDate(
            r['Product Date'], line
        );

        return {
            code,
            name,
            productDate,
            stock,
            qtyAdded,
            bulkAggregate,
            warnings,
            original: {
                unitCost: cost,
                sellingPrice: price,
                profitPerUnit: originalProfit,
                stockValue,
                potentialSalesValue,
                stockStatus: r['Stock Status']
            }
        };
    });
}

function validateSales(rows) {
    checkHeaders(rows, SALES_HEADERS);

    const seen = new Set();

    return rows.map((r, index) => {
        const line = index + 2;
        const invoice = r['Receipt Number'].trim();

        if (!invoice) {
            throw new Error(
                `Row ${line}: receipt number is missing.`
            );
        }

        if (invoice.includes('/')) {
            throw new Error(
                `Row ${line}: receipt number contains "/".`
            );
        }

        if (seen.has(invoice)) {
            throw new Error(
                `Duplicate receipt in CSV: ${invoice}`
            );
        }

        seen.add(invoice);

        const saleDate = parseDate(r['Sale Date'], line);

        if (!saleDate) {
            throw new Error(
                `Row ${line}: sale date is missing.`
            );
        }

        const n = (header) =>
            optionalNumber(r[header], header, line);

        const grossProfit = n('Gross Profit');
        const payable = n('Customer Payable');
        const paid = n('Amount Received');
        const due = n('Balance Due');
        const quantity = n('Total Quantity');
        const subtotal = n('Product Subtotal');
        const discount = n('Discount');
        const revenue = n('Sales Revenue');
        const cogs = n('Cost of Goods Sold');
        const courier = n('Courier Pass Through');

        if (
            [payable, paid, due].some(
                value => value === null || value < 0
            )
        ) {
            throw new Error(
                `Row ${line}: payable, received and ` +
                `balance due must be valid nonnegative amounts.`
            );
        }

        if (
            quantity !== null &&
            (!Number.isInteger(quantity) || quantity < 0)
        ) {
            throw new Error(
                `Row ${line}: invalid total quantity.`
            );
        }

        const warnings = [];

        if (Math.abs(payable - paid - due) > 0.01) {
            warnings.push(
                'Payment discrepancy: payable - received ' +
                'does not equal recorded balance.'
            );
        }

        if (revenue === null || cogs === null) {
            warnings.push(
                'Revenue or COGS missing; no amount inferred.'
            );
        }

        if (quantity === null) {
            warnings.push('Sale quantity unknown.');
        }

        if (!r['Product Codes']) {
            warnings.push('Product codes unavailable.');
        }

        if (grossProfit === null) {
            warnings.push('Gross profit unavailable.');
        }

        const productNames = r['Product Names'].trim();

        // Keep an unlinked descriptive item only.
        // Never associate historical sales with inventory
        // by guessing from product names.
        const items = productNames ? [{
            productId: '',
            name: productNames,
            code: r['Product Codes'].trim(),
            qty: quantity ?? 0,
            price: 0,
            unitCost: 0,
            historicalUnlinked: true
        }] : [];

        return {
            invoice,
            saleDate,
            customer: r['Customer Name'],
            phone: r['Phone Number'],
            items,
            grossProfit,
            payable,
            paid,
            due,
            quantity,
            subtotal,
            discount,
            revenue,
            cogs,
            courier,
            orderMode: r['Order Mode'],
            paymentMode: r['Payment Mode'],
            paymentStatus: r['Payment Status'],
            deliveryStatus: r['Delivery Status'],
            warnings,
            original: { ...r }
        };
    });
}

function makeProduct(record, user) {
    const verifiedUnitValues = !record.bulkAggregate;

    return {
        code: record.code,
        name: record.name,
        productDate: record.productDate,

        stock: record.stock,

        // Unknown aggregate unit values are not used
        // as current per-unit prices.
        unitCost: verifiedUnitValues
            ? record.original.unitCost ?? 0
            : 0,

        price: verifiedUnitValues
            ? record.original.sellingPrice ?? 0
            : 0,

        purchaseCost: verifiedUnitValues
            ? record.original.unitCost ?? 0
            : 0,

        shippingPackagingCost: 0,
        additionalInfo: '',
        imageUrl: '',
        imageKey: '',

        legacy: {
            imported: true,
            source: 'historical-inventory-csv',
            stockAlreadyAdjusted: true,
            qtyAdded: record.qtyAdded,
            bulkAggregate: record.bulkAggregate,
            originalValues: record.original,
            warnings: record.warnings
        },

        createdAt: serverTimestamp(),
        createdBy: user.uid
    };
}

function makeSale(record, user) {
    const data = {
        invoice: record.invoice,
        saleDate: record.saleDate,
        customer: record.customer,
        phone: record.phone,
        items: record.items,

        paid: record.paid,
        paymentDue: record.due,

        orderMode: record.orderMode,
        paymentMode: record.paymentMode,
        paymentStatus: record.paymentStatus,
        deliveryStatus: record.deliveryStatus,

        // Existing receipt display uses total.
        // This is the recorded customer payable,
        // NOT verified business revenue.
        total: record.payable,

        legacy: {
            imported: true,
            source: 'historical-sales-csv',
            stockAlreadyAdjusted: true,
            originalGrossProfit: record.grossProfit,
            originalPayable: record.payable,
            originalQuantity: record.quantity,
            originalValues: record.original,
            warnings: record.warnings
        },

        createdAt: serverTimestamp(),
        createdBy: user.uid
    };

    // Preserve missing fields as missing.
    // Do not invent subtotal, revenue, COGS or courier.
    if (record.subtotal !== null) {
        data.subtotal = record.subtotal;
    }

    if (record.discount !== null) {
        data.discount = record.discount;
    }

    if (record.revenue !== null) {
        data.salesRevenue = record.revenue;
    }

    if (record.cogs !== null) {
        data.costTotal = record.cogs;
    }

    if (record.courier !== null) {
        data.courier = record.courier;
    }

    return data;
}

export async function initImportData({ db, user, profile }) {
    if (profile?.role !== 'admin') {
        throw new Error('Administrator access required.');
    }

    let inventoryRecords = [];
    let salesRecords = [];
    let completed = 0;
    let busy = false;

    const state = {
        inventoryValidated: false,
        salesValidated: false,
        inventoryFile: null,
        salesFile: null
    };

    function updateCounts() {
        $('importInventoryCount').textContent =
            inventoryRecords.length;

        $('importSalesCount').textContent =
            salesRecords.length;

        $('importCompletedCount').textContent =
            completed;
    }

    function invalidate(type) {
        if (type === 'inventory') {
            inventoryRecords = [];
            state.inventoryValidated = false;
            $('importInventoryBtn').disabled = true;
            setPreview('inventoryImportPreview', false);
        } else {
            salesRecords = [];
            state.salesValidated = false;
            $('importSalesBtn').disabled = true;
            setPreview('salesImportPreview', false);
        }

        updateCounts();
    }

    $('inventoryImportFile').addEventListener(
        'change', () => {
            invalidate('inventory');
            state.inventoryFile =
                $('inventoryImportFile').files?.[0] || null;
            showMessage('inventoryImportMessage', '');
        }
    );

    $('salesImportFile').addEventListener(
        'change', () => {
            invalidate('sales');
            state.salesFile =
                $('salesImportFile').files?.[0] || null;
            showMessage('salesImportMessage', '');
        }
    );

    function previewInventory(records) {
        const body = $('inventoryImportTableBody');

        body.innerHTML = records.slice(0, 100).map(r => `
            <tr>
                <td>${escapeHTML(r.code)}</td>
                <td>${escapeHTML(r.name)}</td>
                <td>${escapeHTML(r.productDate)}</td>
                <td>${r.original.unitCost === null
                    ? 'Unknown'
                    : money(r.original.unitCost)}</td>
                <td>${r.original.sellingPrice === null
                    ? 'Unknown'
                    : money(r.original.sellingPrice)}</td>
                <td>${r.stock}</td>
                <td>${r.warnings.length
                    ? escapeHTML(r.warnings.join(' | '))
                    : 'Valid'}</td>
            </tr>
        `).join('');

        $('inventoryImportPreviewNote').textContent =
            `Showing ${Math.min(100, records.length)} of ` +
            `${records.length} records. ` +
            `${records.filter(r => r.warnings.length).length} ` +
            `records have review warnings.`;

        setPreview('inventoryImportPreview', true);
    }

    function previewSales(records) {
        const body = $('salesImportTableBody');

        body.innerHTML = records.slice(0, 100).map(r => `
            <tr>
                <td>${escapeHTML(r.invoice)}</td>
                <td>${escapeHTML(r.saleDate)}</td>
                <td>${escapeHTML(r.customer)}</td>
                <td>${escapeHTML(
                    r.original['Product Names']
                )}</td>
                <td>${r.grossProfit === null
                    ? 'Unknown'
                    : money(r.grossProfit)}</td>
                <td>${money(r.payable)}</td>
                <td>${money(r.paid)}</td>
                <td>${money(r.due)}</td>
                <td>${r.warnings.length
                    ? escapeHTML(r.warnings.join(' | '))
                    : 'Valid'}</td>
            </tr>
        `).join('');

        $('salesImportPreviewNote').textContent =
            `Showing ${Math.min(100, records.length)} of ` +
            `${records.length} receipts. ` +
            `${records.filter(r =>
                r.warnings.some(w =>
                    w.startsWith('Payment discrepancy')
                )
            ).length} payment discrepancies detected. ` +
            `All original values will be preserved.`;

        setPreview('salesImportPreview', true);
    }

    async function readSelectedFile(file) {
        if (!file) {
            throw new Error('Please select a CSV file.');
        }

        if (!file.name.toLowerCase().endsWith('.csv')) {
            throw new Error('Only CSV files are supported.');
        }

        if (file.size > 10 * 1024 * 1024) {
            throw new Error('CSV file exceeds 10 MB.');
        }

        return parseCSV(await file.text());
    }

    $('validateInventoryBtn').onclick = async () => {
        invalidate('inventory');

        try {
            const rows = await readSelectedFile(
                state.inventoryFile
            );

            inventoryRecords = validateInventory(rows);

            previewInventory(inventoryRecords);

            state.inventoryValidated = true;
            $('importInventoryBtn').disabled = false;

            showMessage(
                'inventoryImportMessage',
                `${inventoryRecords.length} products validated. ` +
                'Review warnings before confirming.',
                'success'
            );

        } catch (error) {
            showMessage(
                'inventoryImportMessage',
                error.message,
                'error'
            );
        }

        updateCounts();
    };

    $('validateSalesBtn').onclick = async () => {
        invalidate('sales');

        try {
            const rows = await readSelectedFile(
                state.salesFile
            );

            salesRecords = validateSales(rows);

            previewSales(salesRecords);

            state.salesValidated = true;
            $('importSalesBtn').disabled = false;

            showMessage(
                'salesImportMessage',
                `${salesRecords.length} receipts validated. ` +
                'Review payment discrepancies and missing ' +
                'financial fields before confirming.',
                'warning'
            );

        } catch (error) {
            showMessage(
                'salesImportMessage',
                error.message,
                'error'
            );
        }

        updateCounts();
    };

    async function existingIdentifiers(type) {
        const collectionName =
            type === 'inventory' ? 'products' : 'sales';

        const field =
            type === 'inventory' ? 'code' : 'invoice';

        const snapshot = await getDocs(
            collection(db, collectionName)
        );

        return {
            ids: new Set(snapshot.docs.map(d => d.id)),
            values: new Set(
                snapshot.docs
                    .map(d => String(d.data()[field] || '').trim())
                    .filter(Boolean)
            )
        };
    }

    async function writeRecords(
        collectionName,
        records,
        getId,
        transform
    ) {
        let written = 0;

        // Firestore batches are deliberately kept below
        // the maximum write count.
        for (let i = 0; i < records.length; i += 200) {
            const chunk = records.slice(i, i + 200);
            const batch = writeBatch(db);

            chunk.forEach(record => {
                batch.set(
                    doc(db, collectionName, getId(record)),
                    transform(record, user)
                );
            });

            await batch.commit();
            written += chunk.length;
        }

        return written;
    }

    async function updateProductCounter(records) {
        if (!records.length) return;

        const highest = Math.max(
            ...records.map(r =>
                Number(r.code.replace(/^PR-/, ''))
            )
        );

        const counterRef = doc(
            db, 'counters', 'productCode'
        );

        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(counterRef);

            const current = snapshot.exists()
                ? Number(snapshot.data().value || 0)
                : 0;

            if (highest > current) {
                transaction.set(
                    counterRef,
                    {
                        value: highest,
                        updatedAt: serverTimestamp()
                    },
                    { merge: true }
                );
            }
        });
    }

    $('importInventoryBtn').onclick = async () => {
        if (busy || !state.inventoryValidated) return;

        const records = inventoryRecords;

        if (!records.length) return;

        busy = true;
        $('importInventoryBtn').disabled = true;

        try {
            const existing = await existingIdentifiers(
                'inventory'
            );

            const pending = records.filter(r =>
                !existing.ids.has(productDocumentId(r.code)) &&
                !existing.values.has(r.code)
            );

            const skipped = records.length - pending.length;

            if (!confirm(
                `Historical Inventory Import\n\n` +
                `Selected: ${records.length}\n` +
                `New: ${pending.length}\n` +
                `Duplicates skipped: ${skipped}\n\n` +
                `Current stock quantities will be preserved.\n` +
                `OPEX will not be modified.\n\n` +
                `Continue?`
            )) return;

            const imported = await writeRecords(
                'products',
                pending,
                r => productDocumentId(r.code),
                makeProduct
            );

            // Update even if records were already imported.
            await updateProductCounter(records);

            completed += imported;
            updateCounts();

            state.inventoryValidated = false;

            showMessage(
                'inventoryImportMessage',
                `Inventory import completed: ` +
                `${imported} imported, ${skipped} skipped. ` +
                `Product counter synchronized.`,
                'success'
            );

        } catch (error) {
            console.error('Inventory import:', error);

            showMessage(
                'inventoryImportMessage',
                `Import interrupted: ${error.message}. ` +
                `Some batches may already have been saved. ` +
                `Check Firestore before retrying.`,
                'error'
            );
        } finally {
            busy = false;
            $('importInventoryBtn').disabled = true;
        }
    };

    $('importSalesBtn').onclick = async () => {
        if (busy || !state.salesValidated) return;

        const records = salesRecords;

        if (!records.length) return;

        busy = true;
        $('importSalesBtn').disabled = true;

        try {
            const existing = await existingIdentifiers(
                'sales'
            );

            const pending = records.filter(r =>
                !existing.ids.has(saleDocumentId(r.invoice)) &&
                !existing.values.has(r.invoice)
            );

            const skipped = records.length - pending.length;

            const discrepancies = pending.filter(r =>
                r.warnings.some(w =>
                    w.startsWith('Payment discrepancy')
                )
            ).length;

            if (!confirm(
                `Historical Sales Import\n\n` +
                `Selected: ${records.length}\n` +
                `New: ${pending.length}\n` +
                `Duplicates skipped: ${skipped}\n` +
                `Payment discrepancies: ${discrepancies}\n\n` +
                `Stock will NOT be deducted.\n` +
                `Missing COGS/revenue will NOT be invented.\n` +
                `Original amounts will be retained.\n\n` +
                `Continue?`
            )) return;

            const imported = await writeRecords(
                'sales',
                pending,
                r => saleDocumentId(r.invoice),
                makeSale
            );

            completed += imported;
            updateCounts();

            state.salesValidated = false;

            showMessage(
                'salesImportMessage',
                `Sales import completed: ${imported} imported, ` +
                `${skipped} duplicates skipped. ` +
                `Historical stock was not deducted.`,
                'success'
            );

        } catch (error) {
            console.error('Sales import:', error);

            showMessage(
                'salesImportMessage',
                `Import interrupted: ${error.message}. ` +
                `Some batches may already have been saved. ` +
                `Check Firestore before retrying.`,
                'error'
            );
        } finally {
            busy = false;
            $('importSalesBtn').disabled = true;
        }
    };


/* ==========================================
   DELETE HISTORICAL IMPORTS
========================================== */

async function deleteHistoricalRecords(type) {

    if (busy) {
        alert('Another import operation is running.');
        return;
    }

    if (profile?.role !== 'admin' || !user?.uid) {
        alert('Administrator access required.');
        return;
    }

    const isInventory = type === 'inventory';

    const collectionName = isInventory
        ? 'products'
        : 'sales';

    const expectedSource = isInventory
        ? 'historical-inventory-csv'
        : 'historical-sales-csv';

    const messageId = isInventory
        ? 'deleteInventoryMessage'
        : 'deleteSalesMessage';

    const buttonId = isInventory
        ? 'deleteHistoricalInventoryBtn'
        : 'deleteHistoricalSalesBtn';

    const button = $(buttonId);

    busy = true;
    button.disabled = true;

    try {

        showMessage(
            messageId,
            'Checking previously imported records...'
        );

        // Select historical imports only.
        const importedQuery = query(
            collection(db, collectionName),
            where('legacy.imported', '==', true),
            where('legacy.source', '==', expectedSource)
        );

        const snapshot = await getDocs(importedQuery);

        // Recheck metadata before deleting.
        const records = snapshot.docs.filter(record => {
            const legacy = record.data().legacy;

            return (
                legacy?.imported === true &&
                legacy?.source === expectedSource &&
                legacy?.stockAlreadyAdjusted === true
            );
        });

        if (records.length === 0) {

            showMessage(
                messageId,
                'No matching historical imported records found.',
                'warning'
            );

            return;
        }

        const label = isInventory
            ? 'Historical Inventory'
            : 'Historical Sales';

        const approved = confirm(
            `DELETE ${label.toUpperCase()}\n\n` +
            `Matching imported records: ${records.length}\n\n` +
            `Normal website records will not be selected.\n` +
            `This operation cannot be undone.\n\n` +
            `Continue to final confirmation?`
        );

        if (!approved) return;

        const typed = prompt(
            `You are about to delete ${records.length} ` +
            `${label} records.\n\n` +
            `Type DELETE to confirm:`
        );

        if (typed !== 'DELETE') {

            showMessage(
                messageId,
                'Deletion cancelled. No records deleted.',
                'warning'
            );

            return;
        }

        let deleted = 0;

        // Delete in small batches to avoid exceeding
        // Firestore write limits.
        for (let i = 0; i < records.length; i += 200) {

            const chunk = records.slice(i, i + 200);

            const batch = writeBatch(db);

            chunk.forEach(record => {
                batch.delete(record.ref);
            });

            await batch.commit();

            deleted += chunk.length;

            showMessage(
                messageId,
                `Deleting records: ${deleted} / ${records.length}`
            );
        }

        showMessage(
            messageId,
            `${deleted} ${label} records deleted successfully. ` +
            `You can now validate and import your new CSV.`,
            'success'
        );

        // Clear the old validation preview so the user
        // must validate the replacement CSV.
        invalidate(type);

        if (isInventory) {

            state.inventoryFile = null;
            $('inventoryImportFile').value = '';

        } else {

            state.salesFile = null;
            $('salesImportFile').value = '';
        }

        // Product counter is deliberately not reset.
        // Resetting could reuse an existing PR code.
        // Historical sales deletion does not restore stock.

    } catch (error) {

        console.error(
            'Historical deletion failed:',
            error
        );

        showMessage(
            messageId,
            `Deletion failed or was interrupted: ` +
            `${error.message}. ` +
            `Some batches may already have been deleted. ` +
            `Check Firestore before retrying.`,
            'error'
        );

    } finally {

        busy = false;
        button.disabled = false;
    }
}

/* ==========================================
   DELETE BUTTON EVENTS
========================================== */

$('deleteHistoricalInventoryBtn').onclick = () => {
    deleteHistoricalRecords('inventory');
};

$('deleteHistoricalSalesBtn').onclick = () => {
    deleteHistoricalRecords('sales');
};


    updateCounts();
}
