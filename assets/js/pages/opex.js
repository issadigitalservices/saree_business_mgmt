import {
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const CATEGORIES = [
    'Courier',
    'Packaging',
    'Pickup',
    'Shipping',
    'Marketing',
    'Salary',
    'Other'
];

const SALARY_STAFF = [
    'Jaya',
    'Balu',
    'Contribution',
    'Other'
];

const money = value =>
    '₹' + Number(value || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);

function todayLocal() {
    const now = new Date();
    const offset = now.getTimezoneOffset();

    return new Date(now.getTime() - offset * 60000)
        .toISOString()
        .slice(0, 10);
}

export async function initOpex({ db, user, profile }) {

    const root = document.getElementById('opexPage');

    if (!root) {
        console.error('OPEX page container not found.');
        return;
    }

    if (profile?.role !== 'admin') {
        root.innerHTML = '<div class="panel">Admin access required.</div>';
        return;
    }

    let editingExpenseId = null;
    let expenses = [];
    let selectedStaffFilter = 'all';

    root.innerHTML = `
        <div class="page-intro">
            <h3>Operating Expenses</h3>
            <p>Record and manage your business expenses.</p>
        </div>

        <!-- EXPENSE SUMMARY -->
        <div class="opex-summary">

            <div class="stat">
                <small>Total Expenses</small>
                <strong id="totalExpenseAmount">₹0.00</strong>
            </div>

            <div class="stat">
                <small>Total Salary</small>
                <strong id="totalSalaryAmount">₹0.00</strong>
            </div>

            <div class="stat">
                <small>Expense Records</small>
                <strong id="expenseCount">0</strong>
            </div>

        </div>

        <!-- ADD / EDIT EXPENSE -->
        <form id="expenseForm" class="panel">

            <h3 id="expenseFormTitle">Add Expense</h3>

            <div class="formgrid">

                <div class="field">
                    <label for="expenseCategory">Category</label>

                    <select id="expenseCategory" name="category" required>
                        ${CATEGORIES.map(category => `
                            <option value="${category}">${category}</option>
                        `).join('')}
                    </select>
                </div>

                <div class="field hidden" id="salaryStaffField">
                    <label for="salaryStaff">Staff Name</label>

                    <select id="salaryStaff">
                        <option value="">Select Staff</option>
                        ${SALARY_STAFF.map(name => `
                            <option value="${name}">${name}</option>
                        `).join('')}
                    </select>
                </div>

                <div class="field">
                    <label for="expenseAmount">Amount (₹)</label>

                    <input
                        id="expenseAmount"
                        name="amount"
                        type="number"
                        inputmode="decimal"
                        min="0.01"
                        step="0.01"
                        placeholder="Enter amount"
                        required
                    >
                </div>

                <div class="field full">
                    <label for="expenseDescription">Description</label>

                    <input
                        id="expenseDescription"
                        name="description"
                        type="text"
                        placeholder="Enter expense details"
                        required
                    >
                </div>

                <div class="field">
                    <label for="expenseDate">Expense Date</label>

                    <input
                        id="expenseDate"
                        name="date"
                        type="date"
                        value="${todayLocal()}"
                        required
                    >
                </div>

            </div>

            <div class="actions expense-actions">

                <button
                    type="submit"
                    class="primary"
                    id="saveExpense"
                >
                    Save Expense
                </button>

                <button
                    type="button"
                    class="secondary hidden"
                    id="cancelExpenseEdit"
                >
                    Cancel Edit
                </button>

            </div>

            <p id="expenseMessage" class="expense-message"></p>

        </form>

        <!-- EXPENSE HISTORY -->
        <div class="panel expense-history">

            <div class="expense-history-heading">
                <h3>Expense History</h3>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <select id="historyStaffFilter" style="padding: 6px 10px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 13px; background: #fff; color: #334155; outline: none;">
                        <option value="all">All Staff & Expenses</option>
                        ${SALARY_STAFF.map(name => `
                            <option value="${name}">${name}</option>
                        `).join('')}
                    </select>
                    <span id="expenseHistoryCount">0 records</span>
                </div>
            </div>

            <div class="tablewrap">

                <table>
                    <thead>
                        <tr>
                            <th>DATE</th>
                            <th>CATEGORY</th>
                            <th>DESCRIPTION</th>
                            <th>AMOUNT</th>
                            <th>ACTION</th>
                        </tr>
                    </thead>

                    <tbody id="expenseTableBody">
                        <tr>
                            <td colspan="5">Loading expenses...</td>
                        </tr>
                    </tbody>
                </table>

            </div>
        </div>
    `;

    const $ = id => document.getElementById(id);

    const form = $('expenseForm');
    const saveButton = $('saveExpense');
    const cancelButton = $('cancelExpenseEdit');
    const message = $('expenseMessage');
    const tableBody = $('expenseTableBody');

    // SHOW STAFF DROPDOWN ONLY FOR SALARY & RESET DESCRIPTION IF NOT SALARY
    function updateSalaryFields() {
        const isSalary = $('expenseCategory').value === 'Salary';

        $('salaryStaffField').classList.toggle('hidden', !isSalary);
        $('salaryStaff').required = isSalary;

        if (isSalary) {
            updateSalaryDescription();
        } else {
            $('salaryStaff').value = '';
            // Clear out auto-generated salary text if switching categories
            if ($('expenseDescription').value.startsWith('Salary of ')) {
                $('expenseDescription').value = '';
            }
            $('expenseDescription').readOnly = false;
            $('expenseDescription').placeholder = 'Enter expense details';
        }
    }

    // AUTOMATIC SALARY DESCRIPTION
    function updateSalaryDescription() {
        const staff = $('salaryStaff').value;

        $('expenseDescription').value =
            staff ? `Salary of ${staff}` : '';

        $('expenseDescription').readOnly = true;
    }

    $('expenseCategory').addEventListener('change', () => {
        updateSalaryFields();
    });

    $('salaryStaff').addEventListener('change', () => {
        updateSalaryDescription();
    });

    function showMessage(text, type = 'success') {
        message.textContent = text;
        message.className = `expense-message ${type}`;
    }

    // UPDATE TOTAL EXPENSE & TOTAL SALARY SUMMARY
    
function updateExpenseSummary() {

    // Overall expenses across all staff and categories
    const total = expenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
    );

    // Salary records for the selected employee
    const filteredSalaryExpenses = expenses.filter(expense => {

        if (expense.category !== 'Salary') {
            return false;
        }

        if (selectedStaffFilter === 'all') {
            return true;
        }

        return expense.staffName === selectedStaffFilter ||
            expense.description === `Salary of ${selectedStaffFilter}`;
    });

    const totalSalary = filteredSalaryExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount || 0),
        0
    );

    // Update summary cards
    $('totalExpenseAmount').textContent = money(total);

    if ($('totalSalaryAmount')) {
        $('totalSalaryAmount').textContent = money(totalSalary);
    }

    $('expenseCount').textContent = expenses.length;

    const displayedExpenses = selectedStaffFilter === 'all'
        ? expenses
        : expenses.filter(expense =>
            expense.staffName === selectedStaffFilter ||
            expense.description === `Salary of ${selectedStaffFilter}`
        );

    $('expenseHistoryCount').textContent =
        `${displayedExpenses.length} records`;
}


    function renderTable() {
    const displayedExpenses = selectedStaffFilter === 'all'
        ? expenses
        : expenses.filter(item => item.staffName === selectedStaffFilter || item.description === `Salary of ${selectedStaffFilter}`);

    $('expenseHistoryCount').textContent = `${displayedExpenses.length} records`;

    if (displayedExpenses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5">No expense records found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = displayedExpenses.map(expense => `
        <tr>
            <td>${escapeHTML(expense.date)}</td>
            <td>${escapeHTML(expense.category)}</td>
            <td>${escapeHTML(expense.description)}</td>
            <td><strong>${money(expense.amount)}</strong></td>
            <td>
                <div class="expense-row-actions">
                    <button type="button" class="edit-btn" data-action="edit" data-id="${escapeHTML(expense.id)}">Edit</button>
                    <button type="button" class="delete-btn" data-action="delete" data-id="${escapeHTML(expense.id)}">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

    // RESET FORM
    function resetForm() {

        editingExpenseId = null;

        form.reset();

        $('expenseDate').value = todayLocal();
        updateSalaryFields();

        $('expenseFormTitle').textContent = 'Add Expense';

        saveButton.textContent = 'Save Expense';

        cancelButton.classList.add('hidden');

        message.textContent = '';
    }

    // EDIT FORM
    function startEditing(expense) {

        editingExpenseId = expense.id;

        $('expenseCategory').value = expense.category || 'Other';
        updateSalaryFields();

        if (expense.category === 'Salary' && expense.description) {
            const staffName = expense.description.replace('Salary of ', '');
            $('salaryStaff').value = staffName;
            updateSalaryDescription();
        }

        $('expenseAmount').value = Number(expense.amount || 0);

        $('expenseDescription').value = expense.description || '';

        $('expenseDate').value = expense.date || todayLocal();

        $('expenseFormTitle').textContent = 'Edit Expense';

        saveButton.textContent = 'Update Expense';

        cancelButton.classList.remove('hidden');

        message.textContent = '';

        form.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }

    // LOAD EXPENSES
    async function loadExpenses() {

        tableBody.innerHTML = `
            <tr>
                <td colspan="5">Loading expenses...</td>
            </tr>
        `;

        try {

            const snapshot = await getDocs(
                collection(db, 'expenses')
            );

            expenses = snapshot.docs.map(item => ({
                id: item.id,
                ...item.data()
            }));

            expenses.sort((a, b) =>
                String(b.date || '').localeCompare(String(a.date || ''))
            );

            // Update total and record count
            updateExpenseSummary();
            renderTable(); // <--- This handles rendering based on the selected staff dropdown automatically

        } catch (error) {

            console.error('Expense loading error:', error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        Unable to load expense history.
                    </td>
                </tr>
            `;
        }
    }

    // SAVE OR UPDATE EXPENSE
    form.addEventListener('submit', async event => {

        event.preventDefault();

        const data = new FormData(form);

        const category = String(data.get('category') || '');

        const staffName = category === 'Salary'
            ? $('salaryStaff').value
            : '';

        const description = category === 'Salary'
            ? (staffName ? `Salary of ${staffName}` : '')
            : String(data.get('description') || '').trim();

        const amount = Number(data.get('amount'));

        const date = String(data.get('date') || '');

        if (!category || !description || !date || !Number.isFinite(amount) || amount <= 0) {

            showMessage(
                'Please enter valid expense details.',
                'error'
            );

            return;
        }

        const expenseData = {
            category,
            staffName,
            description,
            amount,
            date,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid
        };

        saveButton.disabled = true;

        try {

            if (editingExpenseId) {

                const expenseRef = doc(
                    db,
                    'expenses',
                    editingExpenseId
                );

                await updateDoc(expenseRef, expenseData);

                showMessage('Expense updated successfully.');

            } else {

                await addDoc(collection(db, 'expenses'), {
                    ...expenseData,
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                });

                showMessage('Expense saved successfully.');

            }

            resetForm();

            await loadExpenses();

        } catch (error) {

            console.error('Expense save error:', error);

            showMessage(
                error.message || 'Unable to save expense.',
                'error'
            );

        } finally {

            saveButton.disabled = false;

        }
    });
// CANCEL EDIT
    cancelButton.addEventListener('click', resetForm);

    // STAFF FILTER DROPDOWN LISTENER
    
$('historyStaffFilter').addEventListener('change', (e) => {
    selectedStaffFilter = e.target.value;

    // Update salary summary for selected employee
    updateExpenseSummary();

    // Update expense history table
    renderTable();
});


    // EDIT AND DELETE
    tableBody.addEventListener('click', async event => {

        const button = event.target.closest('button[data-action]');

        if (!button) return;

        const expenseId = button.dataset.id;

        const action = button.dataset.action;

        const expense = expenses.find(
            item => item.id === expenseId
        );

        if (!expense) {

            showMessage('Expense record not found.', 'error');

            return;
        }


        // EDIT
        if (action === 'edit') {

            startEditing(expense);

            return;
        }

        // DELETE
        if (action === 'delete') {

            const confirmed = window.confirm(
                `Are you sure you want to delete this expense?\n\n` +
                `${expense.category} - ${money(expense.amount)}\n` +
                `${expense.description}\n\n` +
                `This action cannot be undone.`
            );

            if (!confirmed) return;

            button.disabled = true;

            button.textContent = 'Deleting...';

            try {

                await deleteDoc(
                    doc(db, 'expenses', expenseId)
                );

                if (editingExpenseId === expenseId) {
                    resetForm();
                }

                showMessage('Expense deleted successfully.');

                await loadExpenses();

            } catch (error) {

                console.error('Expense delete error:', error);

                showMessage(
                    error.message || 'Unable to delete expense.',
                    'error'
                );

                button.disabled = false;

                button.textContent = 'Delete';

            }
        }

    });

    // INITIAL LOAD
    await loadExpenses();
}