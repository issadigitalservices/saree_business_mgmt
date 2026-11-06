/* =====================================
   SAREEDESK - OPEX
===================================== */

import {
    collection,
    getDocs,
    addDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = id => document.getElementById(id);

const money = value => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
}).format(Number(value) || 0);

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
})[char]);

function formatDate(value) {
    if (!value) return '-';

    const date = value.toDate
        ? value.toDate()
        : new Date(value);

    return Number.isNaN(date.getTime())
        ? '-'
        : date.toLocaleDateString('en-IN');
}

export async function initOpex({ db, user, profile }) {

    if (!$('opexForm')) return;

    if (profile?.role !== 'admin') {
        $('opexTableBody').innerHTML = `
            <tr><td colspan="4" class="empty-state">
                Admin access required.
            </td></tr>
        `;
        return;
    }

    const form = $('opexForm');

    const today = new Date();
    const localDate = new Date(
        today.getTime() - today.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);

    $('opexDate').value = localDate;

    function showMessage(text, type = '') {
        $('opexMessage').textContent = text;
        $('opexMessage').className = `form-message ${type}`;
    }

    async function loadExpenses() {

        $('opexTableBody').innerHTML = `
            <tr><td colspan="4" class="empty-state">
                Loading expenses...
            </td></tr>
        `;

        try {

            const snapshot = await getDocs(collection(db, 'expenses'));

            const expenses = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));

            expenses.sort((a, b) =>
                String(b.date || '').localeCompare(String(a.date || ''))
            );

            const total = expenses.reduce(
                (sum, item) => sum + (Number(item.amount) || 0),
                0
            );

            $('opexTotal').textContent = money(total);
            $('opexCount').textContent = expenses.length;
            $('opexHistoryCount').textContent =
                `${expenses.length} records`;

            if (!expenses.length) {
                $('opexTableBody').innerHTML = `
                    <tr><td colspan="4" class="empty-state">
                        No expenses recorded yet.
                    </td></tr>
                `;
                return;
            }

            $('opexTableBody').innerHTML = expenses.map(item => `
                <tr>
                    <td>${escapeHTML(formatDate(item.date))}</td>
                    <td>${escapeHTML(item.category || '-')}</td>
                    <td>${escapeHTML(item.description || '-')}</td>
                    <td><strong>${money(item.amount)}</strong></td>
                </tr>
            `).join('');

        } catch (error) {

            console.error('OPEX loading error:', error);

            $('opexTableBody').innerHTML = `
                <tr><td colspan="4" class="empty-state">
                    Unable to load expenses.
                </td></tr>
            `;

            showMessage(error.message || 'Unable to load expenses.', 'error');
        }
    }

    form.addEventListener('submit', async event => {

        event.preventDefault();

        if (!form.reportValidity()) return;

        if (!user?.uid) {
            showMessage('Please sign in again.', 'error');
            return;
        }

        const amount = Number($('opexAmount').value);

        if (!Number.isFinite(amount) || amount <= 0) {
            showMessage('Enter a valid expense amount.', 'error');
            return;
        }

        const button = $('saveOpexBtn');

        button.disabled = true;
        button.textContent = 'Saving...';

        try {

            await addDoc(collection(db, 'expenses'), {
                category: $('opexCategory').value,
                description: $('opexDescription').value.trim(),
                amount,
                date: $('opexDate').value,
                createdAt: serverTimestamp(),
                createdBy: user.uid
            });

            showMessage('Expense saved successfully.', 'success');

            form.reset();
            $('opexDate').value = localDate;

            await loadExpenses();

        } catch (error) {

            console.error('OPEX saving error:', error);

            showMessage(error.message || 'Unable to save expense.', 'error');

        } finally {

            button.disabled = false;
            button.textContent = 'Save Expense';

        }

    });

    await loadExpenses();
}