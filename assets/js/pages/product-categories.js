
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    writeBatch,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = id => document.getElementById(id);

const DEFAULT_NAMES = [
    'Premium Silk Sarees',
    'Silk Sarees',
    'Tissue Silk Sarees',
    'Tussar Silk Sarees',
    'Kanchi Cotton Sarees',
    'Linen/Khadhi/Cotton Sarees',
    'Sungudi Cotton Sarees',
    'Cotton Setmund',
    'Tissue Setmund',
    'Cotton Setmund W/B',
    'Tissue Setmund W/B',
    'Cotton Setsaree',
    'Tissue Setaree',
    'Cotton Setsaree A/B',
    'Tissue Setaree A/B',
    'Others'
];

const normalized = value =>
    String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const message = (text, type = '') => {
    const element = $('productCategoryMessage');
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${type}`;
};

export async function initProductCategories({ db, user }) {
    const select = $('productName');
    const modal = $('productNamesModal');
    const list = $('productCategoryList');
    const input = $('newProductCategoryName');
    const addButton = $('addProductCategoryBtn');

    if (!select) return;

    
const adminSnap = user?.uid
    ? await getDoc(doc(db, 'users', user.uid))
    : null;

const isAdmin =
    adminSnap?.exists() === true &&
    adminSnap.data().active === true &&
    adminSnap.data().role === 'admin';


    let categories = [];
    let busy = false;

    function categoryId() {
        return doc(collection(db, 'productCategories')).id;
    }

    async function seedCategories() {
        const snapshot = await getDocs(
            collection(db, 'productCategories')
        );

        if (!snapshot.empty || !isAdmin) return;

        const batch = writeBatch(db);

        DEFAULT_NAMES.forEach(name => {
            const id = `initial_${normalized(name)
                .replace(/[^a-z0-9]+/g, '_')}`;

            batch.set(doc(db, 'productCategories', id), {
                name,
                active: true,
                createdAt: serverTimestamp(),
                createdBy: user.uid
            });
        });

        await batch.commit();
    }

    async function loadCategories() {
        const snapshot = await getDocs(
            collection(db, 'productCategories')
        );

        categories = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        categories.sort((a, b) =>
            String(a.name).localeCompare(String(b.name))
        );

        const previousValue = select.value;
        select.replaceChildren(new Option(
            'Select Product Category', ''
        ));

        categories.filter(c => c.active !== false)
            .forEach(category => {
                select.add(new Option(
                    category.name,
                    category.name
                ));
            });

        if (previousValue) {
            if (![...select.options].some(
                option => option.value === previousValue
            )) {
                select.add(new Option(
                    previousValue, previousValue
                ));
            }
            select.value = previousValue;
        }

        renderCategories();
    }

    function renderCategories() {
        if (!list) return;
        list.replaceChildren();

        categories.forEach(category => {
            const row = document.createElement('div');
            row.style.cssText =
                'display:flex;justify-content:space-between;' +
                'align-items:center;gap:10px;padding:12px 0;' +
                'border-bottom:1px solid #eee;';

            const name = document.createElement('span');
            name.textContent = category.name +
                (category.active === false ? ' (Inactive)' : '');

            row.appendChild(name);

            if (isAdmin) {
                const actions = document.createElement('div');
                actions.style.cssText = 'display:flex;gap:8px;';

                const edit = document.createElement('button');
                edit.type = 'button';
                edit.textContent = 'Edit';
                edit.onclick = () => renameCategory(category);

                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.textContent =
                    category.active === false ? 'Activate' : 'Delete';

                toggle.onclick = () => toggleCategory(category);

                actions.append(edit, toggle);
                row.appendChild(actions);
            }

            list.appendChild(row);
        });
    }

    async function addCategory() {
        if (!isAdmin || busy) return;

        const name = input.value.trim().replace(/\s+/g, ' ');

        if (!name) {
            message('Enter a product name.', 'error');
            return;
        }

        if (categories.some(c =>
            normalized(c.name) === normalized(name)
        )) {
            message('Product name already exists.', 'error');
            return;
        }

        busy = true;
        addButton.disabled = true;

        try {
            await setDoc(
                doc(db, 'productCategories', categoryId()),
                {
                    name,
                    active: true,
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                }
            );

            input.value = '';
            await loadCategories();
            message('Product name added successfully.', 'success');
        } catch (error) {
            message(error.message, 'error');
        } finally {
            busy = false;
            addButton.disabled = false;
        }
    }

    async function renameCategory(category) {
        if (!isAdmin || busy) return;

        const proposed = prompt(
            'Enter new product name:',
            category.name
        );

        if (proposed === null) return;

        const newName = proposed.trim().replace(/\s+/g, ' ');
        const oldName = category.name;

        if (!newName || newName === oldName) return;

        if (categories.some(c =>
            c.id !== category.id &&
            normalized(c.name) === normalized(newName)
        )) {
            message('This product name already exists.', 'error');
            return;
        }

        if (!confirm(
            `Rename "${oldName}" to "${newName}"?\n\n` +
            'Matching old inventory and sales records will also be updated.'
        )) return;

        busy = true;

        try {
            message('Updating historical records. Please wait...');

            const [productsSnap, salesSnap] = await Promise.all([
                getDocs(collection(db, 'products')),
                getDocs(collection(db, 'sales'))
            ]);

            const changes = [];

            productsSnap.forEach(item => {
                const data = item.data();

                if (normalized(data.name) === normalized(oldName)) {
                    changes.push({
                        ref: item.ref,
                        data: { name: newName }
                    });
                }
            });

            salesSnap.forEach(item => {
                const sale = item.data();
                const updates = {};

                if (
                    normalized(sale.productName) ===
                    normalized(oldName)
                ) {
                    updates.productName = newName;
                }

                if (Array.isArray(sale.items)) {
                    const updatedItems = sale.items.map(product => {
                        if (
                            normalized(product.name) ===
                            normalized(oldName)
                        ) {
                            return { ...product, name: newName };
                        }
                        return product;
                    });

                    if (sale.items.some(product =>
                        normalized(product.name) ===
                        normalized(oldName)
                    )) {
                        updates.items = updatedItems;
                    }
                }

                if (Object.keys(updates).length) {
                    changes.push({
                        ref: item.ref,
                        data: updates
                    });
                }
            });

            // Firestore write batches kept below 500 operations.
            // Category is updated last, after historical records.
            for (let i = 0; i < changes.length; i += 400) {
                const batch = writeBatch(db);

                changes.slice(i, i + 400).forEach(change => {
                    batch.update(change.ref, change.data);
                });

                await batch.commit();
            }

            await updateDoc(
                doc(db, 'productCategories', category.id),
                {
                    name: newName,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid
                }
            );

            if (select.value === oldName) {
                select.value = '';
            }

            await loadCategories();

            message(
                `Renamed successfully. Updated ${changes.length} records.`,
                'success'
            );
        } catch (error) {
            console.error('Category rename failed:', error);
            message(
                'Rename incomplete: ' + error.message +
                '. Do not repeat until records are checked.',
                'error'
            );
        } finally {
            busy = false;
        }
    }

    async function toggleCategory(category) {
        if (!isAdmin || busy) return;

        const activate = category.active === false;

        if (!confirm(
            activate
                ? `Activate "${category.name}"?`
                : `Deactivate "${category.name}"? Historical records will remain.`
        )) return;

        busy = true;

        try {
            await updateDoc(
                doc(db, 'productCategories', category.id),
                {
                    active: activate,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid
                }
            );

            await loadCategories();
            message(
                activate ? 'Category activated.' : 'Category deactivated.',
                'success'
            );
        } catch (error) {
            message(error.message, 'error');
        } finally {
            busy = false;
        }
    }

    if (isAdmin) {
        await seedCategories();
    }

    await loadCategories();

    if (addButton) {
        addButton.onclick = addCategory;
    }

    if (modal) {
        modal.addEventListener('click', event => {
            if (event.target === modal && !busy) {
                modal.style.display = 'none';
            }
        });
    }
}
