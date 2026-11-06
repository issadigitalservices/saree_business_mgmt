
/* =====================================
   SAREEDESK - ADD ITEM
   Image storage: Cloudflare R2
===================================== */

import {
    collection,
    doc,
    getDoc,
    addDoc,
    setDoc,
    serverTimestamp,
    runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = (id) => document.getElementById(id);

const IMAGE_API =
    'https://dawn-sun-197asareedesk-image-api.issakuttyalam.workers.dev';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp'
];

const moneyValue = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const setMessage = (message, type = '') => {
    const element = $('addItemMsg');
    if (!element) return;

    element.textContent = message;
    element.className = `form-message ${type}`;
};

const formatCode = (number) => {
    return `SR-${String(number).padStart(6, '0')}`;
};

let currentImageUrl = '';
let currentImageKey = '';
let selectedImageFile = null;
let currentEditingId = null;
let currentUser = null;

export async function initAddItem({
    db,
    storage, // Kept for compatibility with the existing app router.
    user,
    go,
    editingProductId = null,
    setEditingProductId = () => {}
}) {
    const form = $('addItemForm');
    if (!form) return;

    currentUser = user;
    currentEditingId = editingProductId;

    currentImageUrl = '';
    currentImageKey = '';
    selectedImageFile = null;

    const destination = $('destination');
    const imageInput = $('productImage');

    /* ---------------------------------
       PRODUCT CODE PREVIEW
    --------------------------------- */

    async function loadProductCode() {
        try {
            const counterRef = doc(db, 'counters', 'productCode');
            const counterSnap = await getDoc(counterRef);

            const currentNumber = counterSnap.exists()
                ? Number(counterSnap.data().value || 0)
                : 0;

            $('productCode').value = formatCode(currentNumber + 1);
        } catch (error) {
            console.error('Product code preview error:', error);
            $('productCode').value = 'Generated on save';
        }
    }

    /* ---------------------------------
       COST AND PROFIT CALCULATION
    --------------------------------- */

    function calculateTotals() {
        const shipping = moneyValue($('shippingPackagingCost').value);
        const purchase = moneyValue($('purchaseCost').value);
        const selling = moneyValue($('sellingPrice').value);

        const unitCost = shipping + purchase;
        const profit = selling - unitCost;

        $('unitCost').value = unitCost.toFixed(2);
        $('totalProfit').value = profit.toFixed(2);
    }

    [
        'shippingPackagingCost',
        'purchaseCost',
        'sellingPrice'
    ].forEach(id => {
        $(id).addEventListener('input', calculateTotals);
    });

    /* ---------------------------------
       STOCK / DIRECT SALE SWITCH
    --------------------------------- */

    function toggleDestination() {
        const directSale = destination.value === 'sale';

        $('directSaleSection').classList.toggle('hidden', !directSale);
        $('stockField').classList.toggle('hidden', directSale);

        $('directCustomer').required = directSale;
        $('directQuantity').required = directSale;
        $('stockQuantity').required = !directSale;
    }

    destination.addEventListener('change', toggleDestination);

    /* ---------------------------------
       IMAGE PREVIEW
    --------------------------------- */

    imageInput.addEventListener('change', () => {
        const file = imageInput.files?.[0];

        selectedImageFile = null;

        if (!file) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setMessage('Please select a JPG, PNG or WebP image.', 'error');
            imageInput.value = '';
            return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
            setMessage('Image size must not exceed 5 MB.', 'error');
            imageInput.value = '';
            return;
        }

        selectedImageFile = file;

        const reader = new FileReader();

        reader.onload = () => {
            $('imagePreview').src = reader.result;
            $('imagePreview').classList.remove('hidden');
        };

        reader.readAsDataURL(file);
    });

    /* ---------------------------------
       UPLOAD IMAGE TO CLOUDFLARE R2
    --------------------------------- */

    async function uploadProductImage() {
        if (!selectedImageFile) {
            return {
                imageUrl: currentImageUrl,
                imageKey: currentImageKey
            };
        }

        if (!currentUser) {
            throw new Error('Please sign in again.');
        }

        const idToken = await currentUser.getIdToken();

        const uploadResponse = await fetch(`${IMAGE_API}/upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${idToken}`,
                'Content-Type': selectedImageFile.type
            },
            body: selectedImageFile
        });

        const result = await uploadResponse.json();

        if (!uploadResponse.ok || !result.success) {
            throw new Error(result.error || 'Image upload failed.');
        }

        return {
            imageUrl: result.url,
            imageKey: result.key
        };
    }

    /* ---------------------------------
       GENERATE PRODUCT CODE SAFELY
    --------------------------------- */

    async function generateProductCode() {
        const counterRef = doc(db, 'counters', 'productCode');

        return await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);

            const currentNumber = counterSnap.exists()
                ? Number(counterSnap.data().value || 0)
                : 0;

            const nextNumber = currentNumber + 1;

            transaction.set(counterRef, {
                value: nextNumber,
                updatedAt: serverTimestamp()
            });

            return formatCode(nextNumber);
        });
    }

    /* ---------------------------------
       LOAD EXISTING PRODUCT FOR EDIT
    --------------------------------- */

    async function loadProductForEdit(productId) {
        try {
            setMessage('Loading product details...');

            const productRef = doc(db, 'products', productId);
            const productSnap = await getDoc(productRef);

            if (!productSnap.exists()) {
                throw new Error('Product not found.');
            }

            const product = productSnap.data();

            $('addItemTitle').textContent = 'Edit Item';
            $('saveItemBtn').textContent = 'Update Item';
            $('cancelEditBtn').classList.remove('hidden');

            $('productCode').value = product.code || '';
            $('productName').value = product.name || '';
            $('shippingPackagingCost').value =
                product.shippingPackagingCost ?? 0;
            $('purchaseCost').value = product.purchaseCost ?? 0;
            $('sellingPrice').value = product.price ?? 0;
            $('stockQuantity').value = product.stock ?? 0;

            currentImageUrl = product.imageUrl || '';
            currentImageKey = product.imageKey || '';

            if (currentImageUrl) {
                $('imagePreview').src = currentImageUrl;
                $('imagePreview').classList.remove('hidden');
            }

            destination.value = 'stock';
            destination.disabled = true;

            toggleDestination();
            calculateTotals();

            setMessage('Edit the details and save your changes.');
        } catch (error) {
            console.error('Product loading error:', error);
            setMessage(error.message || 'Unable to load product.', 'error');
        }
    }

    /* ---------------------------------
       RESET FORM
    --------------------------------- */

    function resetForm() {
        form.reset();

        currentImageUrl = '';
        currentImageKey = '';
        selectedImageFile = null;
        currentEditingId = null;

        $('imagePreview').src = '';
        $('imagePreview').classList.add('hidden');

        destination.disabled = false;
        destination.value = 'stock';

        $('addItemTitle').textContent = 'Add New Item';
        $('saveItemBtn').textContent = 'Save Item';
        $('cancelEditBtn').classList.add('hidden');

        calculateTotals();
        toggleDestination();
        loadProductCode();
        setMessage('');
    }

    $('cancelEditBtn').addEventListener('click', () => {
        setEditingProductId(null);

        if (typeof go === 'function') {
            go('inventory');
        }
    });

    /* ---------------------------------
       SAVE DIRECT SALE
    --------------------------------- */

    async function saveDirectSale(image) {
        const customer = $('directCustomer').value.trim();
        const phone = $('directPhone').value.trim();
        const qty = Number($('directQuantity').value);
        const price = moneyValue($('sellingPrice').value);
        const paid = moneyValue($('directPaid').value);

        if (!customer) {
            throw new Error('Please enter customer name.');
        }

        if (!Number.isInteger(qty) || qty < 1) {
            throw new Error('Enter a valid sale quantity.');
        }

        if (price <= 0) {
            throw new Error('Selling price must be greater than zero.');
        }

        const shippingPackagingCost =
            moneyValue($('shippingPackagingCost').value);
        const purchaseCost = moneyValue($('purchaseCost').value);
        const unitCost = shippingPackagingCost + purchaseCost;

        const total = qty * price;
        const costTotal = qty * unitCost;
        const paymentDue = Math.max(0, total - paid);

        const productCode = await generateProductCode();

        await addDoc(collection(db, 'sales'), {
            invoice: `SD-${Date.now()}`,
            productId: null,
            productName: $('productName').value.trim(),
            productCode,
            productImage: image.imageUrl,
            productImageKey: image.imageKey,
            qty,
            price,
            unitCost,
            total,
            costTotal,
            shippingPackagingCost,
            courier: 0,
            customer,
            phone,
            paid,
            paymentDue,
            orderMode: 'Direct Sale',
            paymentMode: $('directPaymentMode').value,
            paymentStatus: paymentDue <= 0 ? 'Paid' : 'Due',
            deliveryStatus: $('directDeliveryStatus').value,
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid
        });
    }

    /* ---------------------------------
       SAVE STOCK PRODUCT
    --------------------------------- */

    async function saveStockProduct(image) {
        const code = await generateProductCode();

        await addDoc(collection(db, 'products'), {
            code,
            name: $('productName').value.trim(),
            imageUrl: image.imageUrl,
            imageKey: image.imageKey,
            shippingPackagingCost:
                moneyValue($('shippingPackagingCost').value),
            purchaseCost: moneyValue($('purchaseCost').value),
            unitCost: moneyValue($('unitCost').value),
            price: moneyValue($('sellingPrice').value),
            stock: Number($('stockQuantity').value),
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid
        });
    }

    /* ---------------------------------
       UPDATE EXISTING PRODUCT
    --------------------------------- */

    async function updateStockProduct(image) {
        const productRef = doc(db, 'products', currentEditingId);

        await setDoc(productRef, {
            name: $('productName').value.trim(),
            imageUrl: image.imageUrl,
            imageKey: image.imageKey,
            shippingPackagingCost:
                moneyValue($('shippingPackagingCost').value),
            purchaseCost: moneyValue($('purchaseCost').value),
            unitCost: moneyValue($('unitCost').value),
            price: moneyValue($('sellingPrice').value),
            stock: Number($('stockQuantity').value),
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid
        }, { merge: true });
    }

    /* ---------------------------------
       FORM SUBMISSION
    --------------------------------- */

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const saveButton = $('saveItemBtn');

        if (!form.reportValidity()) return;

        const productName = $('productName').value.trim();
        const sellingPrice = moneyValue($('sellingPrice').value);

        if (!productName) {
            setMessage('Please enter product name.', 'error');
            return;
        }

        if (sellingPrice <= 0) {
            setMessage('Selling price must be greater than zero.', 'error');
            return;
        }

        if (destination.value === 'stock') {
            const stock = Number($('stockQuantity').value);

            if (!Number.isInteger(stock) || stock < 0) {
                setMessage('Enter a valid stock quantity.', 'error');
                return;
            }
        }

        if (destination.value === 'sale') {
            const qty = Number($('directQuantity').value);
            const paid = moneyValue($('directPaid').value);

            if (!Number.isInteger(qty) || qty < 1) {
                setMessage('Enter a valid sale quantity.', 'error');
                return;
            }

            if (paid < 0) {
                setMessage('Amount received cannot be negative.', 'error');
                return;
            }
        }

        try {
            saveButton.disabled = true;
            saveButton.textContent = 'Saving...';
            setMessage('Uploading image and saving item...');

            const image = await uploadProductImage();

            if (currentEditingId) {
                await updateStockProduct(image);
                setMessage('Product updated successfully.', 'success');
            } else if (destination.value === 'sale') {
                await saveDirectSale(image);
                setMessage('Direct sale saved successfully.', 'success');
            } else {
                await saveStockProduct(image);
                setMessage('Product added to inventory successfully.', 'success');
            }

            setEditingProductId(null);

            if (typeof go === 'function') {
                setTimeout(() => go(
                    destination.value === 'sale' ? 'viewsales' : 'inventory'
                ), 700);
            }

        } catch (error) {
            console.error('Save item error:', error);
            setMessage(error.message || 'Unable to save item.', 'error');

        } finally {
            saveButton.disabled = false;
            saveButton.textContent = currentEditingId
                ? 'Update Item'
                : 'Save Item';
        }
    });

    /* ---------------------------------
       INITIALIZE
    --------------------------------- */

    calculateTotals();
    toggleDestination();

    if (currentEditingId) {
        await loadProductForEdit(currentEditingId);
    } else {
        await loadProductCode();
    }
}
