
/* =====================================
   SAREEDESK - INVENTORY MANAGEMENT
   Search, Filters, Export, Edit, Delete
===================================== */


import {
    collection,
    getDocs,
    doc,
    deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';


const $ = id => document.getElementById(id);

const IMAGE_API =
    'https://dawn-sun-197asareedesk-image-api.issakuttyalam.workers.dev';

const money = value => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
};


function formatProductDate(product) {
    let dateValue = product.productDate;

    // Fallback for older products without productDate
    if (!dateValue && product.createdAt?.toDate) {
        const date = product.createdAt.toDate();

        dateValue = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    if (!dateValue) return '-';

    const parts = String(dateValue).split('-');

    if (parts.length !== 3) return '-';

    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

const escapeHTML = value => {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[character]);
};

let inventoryProducts = [];


let soldQuantities = new Map();

function getSoldQuantity(product) {
    return soldQuantities.get(product.id) || 0;
}


export async function initInventory({
    db,
    go,
    user,
    profile,
    setEditingProductId = () => {}
}) {
    const tableBody = $('inventoryTableBody');

    if (!tableBody) {
        console.error('Inventory table container not found.');
        return;
    }

    const searchInput = $('inventorySearch');
    const refreshButton = $('refreshInventory');
    const exportButton = $('exportInventory');
    const messageElement = $('inventoryMessage');

    const filterButtons = document.querySelectorAll('[data-filter]');

    const isAdmin = profile?.role === 'admin';

    let activeFilter = 'all';
let currentPage = 1;
let rowsPerPage = 10;
let inventoryPagination = null;


/* =====================================
   INVENTORY PAGINATION CONTROLS
===================================== */

const inventoryTable = tableBody.closest('table');

if (inventoryTable) {
    inventoryPagination = document.createElement('div');
    inventoryPagination.className = 'record-pagination';

    inventoryPagination.innerHTML = `
        <div class="pagination-info">
            <span id="inventoryPageInfo"></span>
        </div>

        <div class="pagination-controls">
            <label>
                Rows:
                <select id="inventoryPageSize">
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                </select>
            </label>

            <button type="button"
                id="inventoryPrevPage">‹ Previous</button>

            <span id="inventoryPageNumber"></span>

            <button type="button"
                id="inventoryNextPage">Next ›</button>
        </div>
    `;

    inventoryTable.insertAdjacentElement(
        'afterend',
        inventoryPagination
    );
}

function updateInventoryPagination(totalRecords) {
    if (!inventoryPagination) return;

    const totalPages = Math.max(
        1,
        Math.ceil(totalRecords / rowsPerPage)
    );

    currentPage = Math.min(
        Math.max(1, currentPage),
        totalPages
    );

    const start = totalRecords
        ? (currentPage - 1) * rowsPerPage + 1
        : 0;

    const end = Math.min(
        currentPage * rowsPerPage,
        totalRecords
    );

    $('inventoryPageInfo').textContent =
        `Showing ${start}–${end} of ${totalRecords} products`;

    $('inventoryPageNumber').textContent =
        `Page ${currentPage} of ${totalPages}`;

    $('inventoryPrevPage').disabled =
        currentPage <= 1;

    $('inventoryNextPage').disabled =
        currentPage >= totalPages;
}

$('inventoryPrevPage')?.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        applyFilters();
    }
});

$('inventoryNextPage')?.addEventListener('click', () => {
    const totalPages = Math.ceil(
        getFilteredProducts().length / rowsPerPage
    );

    if (currentPage < totalPages) {
        currentPage++;
        applyFilters();
    }
});

$('inventoryPageSize')?.addEventListener('change', event => {
    rowsPerPage = Number(event.target.value) || 10;
    currentPage = 1;
    applyFilters();
});


    /* =====================================
       SAFE MESSAGE DISPLAY
    ===================================== */

    function showMessage(message, type = '') {
        if (!messageElement) return;

        messageElement.textContent = message;
        messageElement.className = 'inventory-message';

        if (type) {
            messageElement.classList.add(type);
        }
    }

    /* =====================================
       UPDATE FILTER COUNTS
    ===================================== */

    



function updateFilterCounts() {

    // Total product records, not quantities
    const totalProducts = inventoryProducts.length;

    // Total available units
    const inStockProducts = inventoryProducts.reduce(
        (total, product) =>
            total + Math.max(0, Number(product.stock) || 0),
        0
    );

    // Total sold units from actual sales receipts
    const soldOutProducts = inventoryProducts.reduce(
        (total, product) =>
            total + getSoldQuantity(product),
        0
    );

    const totalCount = $('filterTotalCount');
    const stockCount = $('filterStockCount');
    const soldCount = $('filterSoldCount');

    if (totalCount) totalCount.textContent = totalProducts;
    if (stockCount) stockCount.textContent = inStockProducts;
    if (soldCount) soldCount.textContent = soldOutProducts;
}


    /* =====================================
       FILTER PRODUCTS
    ===================================== */

    function getFilteredProducts() {
        const searchTerm = (searchInput?.value || '')
            .trim()
            .toLowerCase();

        return inventoryProducts.filter(product => {
            const name = String(product.name || '').toLowerCase();
            const code = String(product.code || '').toLowerCase();
            const stock = Number(product.stock) || 0;

            const matchesSearch =
                name.includes(searchTerm) ||
                code.includes(searchTerm);

            let matchesFilter = true;

            if (activeFilter === 'stock') {
                matchesFilter = stock > 0;
            }

            
if (activeFilter === 'sold') {
    matchesFilter = getSoldQuantity(product) > 0;
}


            return matchesSearch && matchesFilter;
        });
    }

    /* =====================================
       RENDER INVENTORY TABLE
    ===================================== */

    function renderInventory(products) {

        const totalRecords = products.length;

updateInventoryPagination(totalRecords);

const startIndex = (currentPage - 1) * rowsPerPage;

products = products.slice(
    startIndex,
    startIndex + rowsPerPage
);

    $('inventoryCount').textContent =
    `${totalRecords} product${totalRecords === 1 ? '' : 's'}`;

    if (!products.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    No products found.
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = products.map(product => {

        const unitCost = Number(product.unitCost) || 0;
        const sellingPrice = Number(product.price) || 0;
        const stock = Number(product.stock) || 0;
        const profit = sellingPrice - unitCost;

        const profitClass = profit >= 0
            ? 'profit-positive'
            : 'profit-negative';

        const stockClass = stock <= 2
            ? 'stock-low'
            : '';

        const imageUrl = product.imageUrl || '';

        const imageHTML = imageUrl
            ? `
                <a
                    href="${escapeHTML(imageUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View full product image"
                >
                    <img
                        src="${escapeHTML(imageUrl)}"
                        alt="${escapeHTML(product.name || 'Product image')}"
                        class="inventory-product-image"
                        loading="lazy"
                    >
                </a>
            `
            : `<span class="no-product-image">No Image</span>`;

        return `
            <tr>

                <td>${escapeHTML(product.code || '-')}</td>

                <td class="product-name">
                    ${escapeHTML(product.name || 'Unnamed Product')}
                </td>

                <td>${money(unitCost)}</td>

                <td>${money(sellingPrice)}</td>

                <td class="${profitClass}">
                    ${money(profit)}
                </td>

                <td class="${stockClass}">
                    ${stock}
                </td>

                <td class="inventory-actions">

                    <button
                        type="button"
                        class="edit-product-btn"
                        data-edit-id="${escapeHTML(product.id)}"
                    >
                        Edit
                    </button>

                    ${isAdmin ? `
                        <button
                            type="button"
                            class="delete-product-btn"
                            data-delete-id="${escapeHTML(product.id)}"
                        >
                            Delete
                        </button>
                    ` : ''}

                </td>

                <td class="inventory-date">
                    ${formatProductDate(product)}
                </td>

                <td class="inventory-image-cell">
                    ${imageHTML}
                </td>

            </tr>
        `;

    }).join('');
}

    /* =====================================
       APPLY SEARCH AND FILTER
    ===================================== */

    function applyFilters() {
        renderInventory(getFilteredProducts());
    }

    /* =====================================
       FILTER BUTTON EVENTS
    ===================================== */

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            activeFilter = button.dataset.filter || 'all';

            filterButtons.forEach(item => {
                item.classList.toggle(
                    'active',
                    item.dataset.filter === activeFilter
                );
            });

            currentPage = 1;
applyFilters();
        });
    });

    /* =====================================
       SEARCH EVENT
    ===================================== */

    searchInput?.addEventListener('input', () => {
    currentPage = 1;
    applyFilters();
});

    /* =====================================
       EXPORT FILTERED PRODUCTS TO CSV
    ===================================== */

    
function exportInventory() {
    const products = getFilteredProducts();

    if (!products.length) {
        alert('No products available to export.');
        return;
    }

    const headers = [
        'Product Code',
        'Product Name',
        'Product Date',
        'Unit Cost',
        'Selling Price',
        'Profit Per Unit',
        'Stock Quantity',
        'Stock Value',
        'Potential Sales Value',
        'Stock Status'
    ];

    const rows = products.map(product => {
        const stock = Number(product.stock) || 0;
        const unitCost = Number(product.unitCost) || 0;
        const sellingPrice = Number(product.price) || 0;

        return [
            product.code || '',
            product.name || '',
            formatProductDate(product),
            unitCost.toFixed(2),
            sellingPrice.toFixed(2),
            (sellingPrice - unitCost).toFixed(2),
            stock,
            (stock * unitCost).toFixed(2),
            (stock * sellingPrice).toFixed(2),
            stock > 0 ? 'In Stock' : 'Sold Out'
        ];
    });

    const csvContent = [headers, ...rows]
        .map(row => row.map(value =>
            `"${String(value ?? '')
                .replace(/^[\s]*([=+\-@\t\r])/,
                    "'$1")
                .replace(/"/g, '""')}"`
        ).join(','))
        .join('\r\n');

    const blob = new Blob(
        ['\uFEFF' + csvContent],
        { type: 'text/csv;charset=utf-8;' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download =
        `Aarabhi_Inventory_${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}


    exportButton?.addEventListener('click', exportInventory);

    /* =====================================
       LOAD PRODUCTS FROM FIRESTORE
    ===================================== */

    
async function loadInventory() {

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = 'Loading...';
    }

    tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="empty-state">
                Loading inventory...
            </td>
        </tr>
    `;

    showMessage('');

    try {

        // Load products and sales receipts
        const [productSnapshot, salesSnapshot] = await Promise.all([
            getDocs(collection(db, 'products')),
            getDocs(collection(db, 'sales'))
        ]);

        inventoryProducts = productSnapshot.docs.map(document => ({
            id: document.id,
            ...document.data()
        }));

        inventoryProducts.sort((a, b) =>
            String(b.code || '').localeCompare(String(a.code || ''))
        );

        // Calculate sold quantity by product ID
        soldQuantities = new Map();

        salesSnapshot.docs.forEach(document => {

            const sale = document.data();

            // Support current multi-product receipts
            // and older single-product receipts
            const items = Array.isArray(sale.items)
                ? sale.items
                : (sale.productId ? [{
                    productId: sale.productId,
                    qty: sale.qty
                }] : []);

            items.forEach(item => {

                if (!item.productId) return;

                const qty = Number(item.qty) || 0;

                if (qty <= 0) return;

                const previousQty =
                    soldQuantities.get(item.productId) || 0;

                soldQuantities.set(
                    item.productId,
                    previousQty + qty
                );

            });

        });

        updateFilterCounts();
        applyFilters();

    } catch (error) {

        console.error('Inventory loading error:', error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    Unable to load inventory. Please try again.
                </td>
            </tr>
        `;

        showMessage(
            error.message || 'Unable to load inventory.',
            'error'
        );

    } finally {

        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = '↻ Refresh';
        }

    }
}


    /* =====================================
       EDIT AND DELETE EVENTS
    ===================================== */

    tableBody.addEventListener('click', async event => {
        const editButton = event.target.closest('[data-edit-id]');
        const deleteButton = event.target.closest('[data-delete-id]');

        /* EDIT PRODUCT */

        if (editButton) {
            const productId = editButton.dataset.editId;

            if (!productId) return;

            setEditingProductId(productId);

            if (typeof go === 'function') {
                await go('add');
            }

            return;
        }

        /* DELETE PRODUCT */

        if (deleteButton) {
            if (!isAdmin) {
                alert('Only Admin can delete products.');
                return;
            }

            const productId = deleteButton.dataset.deleteId;

            const product = inventoryProducts.find(
                item => item.id === productId
            );

            if (!product) return;

            const confirmed = confirm(
                `Are you sure you want to permanently delete this product?\n\n` +
                `Product: ${product.name || 'Unnamed Product'}\n` +
                `Code: ${product.code || '-'}\n\n` +
                `This action cannot be undone.`
            );

            if (!confirmed) return;

            deleteButton.disabled = true;
            deleteButton.textContent = 'Deleting...';

            try {
                await deleteDoc(
                    doc(db, 'products', productId)
                );

                inventoryProducts = inventoryProducts.filter(
                    item => item.id !== productId
                );

                updateFilterCounts();
                applyFilters();

                showMessage(
                    'Product deleted successfully.',
                    'success'
                );

                // Remove the associated image from Cloudflare R2.
                if (product.imageKey && user) {
                    try {
                        const idToken = await user.getIdToken();

                        const response = await fetch(
                            `${IMAGE_API}/delete`,
                            {
                                method: 'DELETE',
                                headers: {
                                    Authorization: `Bearer ${idToken}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    key: product.imageKey
                                })
                            }
                        );

                        const result = await response.json();

                        if (!response.ok || !result.success) {
                            console.warn(
                                'Product deleted, but image cleanup failed:',
                                result.error
                            );
                        }

                    } catch (imageError) {
                        console.warn(
                            'Product deleted, but image cleanup failed:',
                            imageError
                        );
                    }
                }

            } catch (error) {
                console.error('Product deletion error:', error);

                showMessage(
                    error.message || 'Unable to delete product.',
                    'error'
                );

                await loadInventory();
            }
        }
    });

    /* =====================================
       INITIAL LOAD
    ===================================== */

    await loadInventory();
}
