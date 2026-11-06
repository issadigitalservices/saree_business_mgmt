
/* =====================================
   SAREEDESK - INVENTORY
   Edit and Delete Products
===================================== */

import {
    collection,
    getDocs,
    doc,
    deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const IMAGE_API =
    'https://dawn-sun-197asareedesk-image-api.issakuttyalam.workers.dev';

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
    user,
    profile,
    setEditingProductId = () => {}
}) {

    const tableBody = $('inventoryTableBody');

    if (!tableBody) return;

    const searchInput = $('inventorySearch');
    const refreshButton = $('refreshInventory');

    const isAdmin = profile?.role === 'admin';

    /* ---------------------------------
       UPDATE SUMMARY
    --------------------------------- */

    function updateSummary(products) {

        $('totalProducts').textContent = products.length;

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
       EDIT AND DELETE BUTTONS
    --------------------------------- */

    tableBody.addEventListener('click', async (event) => {

        const editButton = event.target.closest('[data-edit-id]');
        const deleteButton = event.target.closest('[data-delete-id]');

        /* EDIT PRODUCT */

        if (editButton) {

            const productId = editButton.dataset.editId;

            if (!productId) return;

            setEditingProductId(productId);

            if (typeof go === 'function') {
                go('add');
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

                // Delete product document from Firestore.
                await deleteDoc(
                    doc(db, 'products', productId)
                );

                // Remove it from the displayed list.
                inventoryProducts = inventoryProducts.filter(
                    item => item.id !== productId
                );

                searchInventory();

                $('inventoryMessage').textContent =
                    'Product deleted successfully.';

                $('inventoryMessage').classList.add('success');

                // Attempt to remove the associated image from R2.
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
                                'Product was deleted, but R2 image cleanup failed:',
                                result.error
                            );
                        }

                    } catch (imageError) {

                        console.warn(
                            'Product was deleted, but image cleanup failed:',
                            imageError
                        );
                    }
                }

            } catch (error) {

                console.error('Product deletion error:', error);

                $('inventoryMessage').textContent =
                    error.message || 'Unable to delete product.';

                $('inventoryMessage').classList.add('error');

                await loadInventory();
            }
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
