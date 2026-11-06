
/* =====================================
   SAREEDESK - INVENTORY
   Images delivered from Cloudflare R2
===================================== */

import {
    collection,
    getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const money = (value) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
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

let inventoryProducts = [];

export async function initInventory({
    db,
    go,
    setEditingProductId = () => {}
}) {
    const tableBody = $('inventoryTableBody');
    if (!tableBody) return;

    const searchInput = $('inventorySearch');
    const refreshButton = $('refreshInventory');

    /* ---------------------------------
       UPDATE SUMMARY
    --------------------------------- */

    function updateSummary(products) {
        const totalProducts = products.length;

        const totalUnits = products.reduce(
            (sum, product) => sum + (Number(product.stock) || 0),
            0
        );

        const inventoryValue = products.reduce(
            (sum, product) =>
                sum +
                ((Number(product.unitCost) || 0) *
                (Number(product.stock) || 0)),
            0
        );

        $('totalProducts').textContent = totalProducts;
        $('totalUnits').textContent = totalUnits;
        $('inventoryValue').textContent = money(inventoryValue);
    }

    /* ---------------------------------
       RENDER INVENTORY TABLE
    --------------------------------- */

    function renderInventory(products) {
        updateSummary(products);

        $('inventoryCount').textContent =
            `${products.length} product${products.length === 1 ? '' : 's'}`;

        if (!products.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
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

            const imageUrl = product.imageUrl
                ? escapeHTML(product.imageUrl)
                : '';

            const productImage = imageUrl
                ? `
                    <img
                        src="${imageUrl}"
                        alt="${escapeHTML(product.name || 'Product')}"
                        loading="lazy"
                        style="
                            width:48px;
                            height:48px;
                            object-fit:cover;
                            border-radius:8px;
                            margin-right:10px;
                            vertical-align:middle;
                        "
                    >
                `
                : `
                    <span style="
                        display:inline-flex;
                        width:48px;
                        height:48px;
                        align-items:center;
                        justify-content:center;
                        background:#f1f5f9;
                        border-radius:8px;
                        margin-right:10px;
                        vertical-align:middle;
                        color:#64748b;
                        font-size:11px;
                    ">No image</span>
                `;

            return `
                <tr>
                    <td>${escapeHTML(product.code || '-')}</td>

                    <td class="product-name">
                        <span style="display:inline-flex;align-items:center;">
                            ${productImage}
                            <span>
                                ${escapeHTML(product.name || 'Unnamed Product')}
                            </span>
                        </span>
                    </td>

                    <td>${money(unitCost)}</td>

                    <td>${money(sellingPrice)}</td>

                    <td class="${profitClass}">
                        ${money(profit)}
                    </td>

                    <td class="${stockClass}">
                        ${stock}
                    </td>

                    <td>
                        <button
                            type="button"
                            class="edit-product-btn"
                            data-edit-id="${escapeHTML(product.id)}"
                        >
                            Edit
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /* ---------------------------------
       SEARCH PRODUCTS
    --------------------------------- */

    function searchInventory() {
        const searchTerm = searchInput.value
            .trim()
            .toLowerCase();

        const filteredProducts = inventoryProducts.filter(product => {
            const name = String(product.name || '').toLowerCase();
            const code = String(product.code || '').toLowerCase();

            return name.includes(searchTerm) ||
                code.includes(searchTerm);
        });

        renderInventory(filteredProducts);
    }

    searchInput.addEventListener('input', searchInventory);

    /* ---------------------------------
       LOAD PRODUCTS FROM FIRESTORE
    --------------------------------- */

    async function loadInventory() {
        refreshButton.disabled = true;
        refreshButton.textContent = 'Loading...';

        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    Loading inventory...
                </td>
            </tr>
        `;

        $('inventoryMessage').textContent = '';
        $('inventoryMessage').className = 'inventory-message';

        try {
            const snapshot = await getDocs(
                collection(db, 'products')
            );

            inventoryProducts = snapshot.docs.map(document => ({
                id: document.id,
                ...document.data()
            }));

            inventoryProducts.sort((a, b) =>
                String(b.code || '').localeCompare(String(a.code || ''))
            );

            searchInventory();

        } catch (error) {
            console.error('Inventory loading error:', error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        Unable to load inventory. Please try again.
                    </td>
                </tr>
            `;

            $('inventoryMessage').textContent =
                error.message || 'An error occurred while loading inventory.';

            $('inventoryMessage').classList.add('error');

        } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = '↻ Refresh';
        }
    }

    /* ---------------------------------
       EDIT PRODUCT
    --------------------------------- */

    tableBody.addEventListener('click', (event) => {
        const editButton = event.target.closest('[data-edit-id]');

        if (!editButton) return;

        const productId = editButton.dataset.editId;
        if (!productId) return;

        setEditingProductId(productId);

        if (typeof go === 'function') {
            go('add');
        }
    });

    /* ---------------------------------
       REFRESH BUTTON
    --------------------------------- */

    refreshButton.addEventListener('click', loadInventory);

    /* ---------------------------------
       INITIAL LOAD
    --------------------------------- */

    await loadInventory();
}
