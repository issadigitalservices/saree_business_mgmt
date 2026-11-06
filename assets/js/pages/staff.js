/* =====================================
   SAREEDESK - STAFF MANAGEMENT
===================================== */

import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const $ = id => document.getElementById(id);

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

export async function initStaff({ db, user, profile }) {

    if (!$('staffForm')) return;

    /* ---------------------------------
       ADMIN ACCESS
    --------------------------------- */

    if (profile?.role !== 'admin') {

        $('staffTableBody').innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    Admin access required.
                </td>
            </tr>
        `;

        return;
    }

    const form = $('staffForm');

    function showMessage(text, type = '') {
        $('staffMessage').textContent = text;
        $('staffMessage').className = `form-message ${type}`;
    }

    /* ---------------------------------
       LOAD STAFF
    --------------------------------- */

    async function loadStaff() {

        $('staffTableBody').innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    Loading staff...
                </td>
            </tr>
        `;

        try {

            const snapshot = await getDocs(collection(db, 'users'));

            const staff = snapshot.docs
                .map(item => ({
                    id: item.id,
                    ...item.data()
                }))
                .filter(item => item.role === 'staff');

            staff.sort((a, b) =>
                String(a.email || '').localeCompare(String(b.email || ''))
            );

            $('staffCount').textContent =
                `${staff.length} staff`;

            if (!staff.length) {

                $('staffTableBody').innerHTML = `
                    <tr>
                        <td colspan="4" class="empty-state">
                            No staff accounts found.
                        </td>
                    </tr>
                `;

                return;

            }

            $('staffTableBody').innerHTML = staff.map(item => {

                const active = item.active === true;

                return `
                    <tr>

                        <td>${escapeHTML(item.email || '-')}</td>

                        <td>${escapeHTML(item.role || '-')}</td>

                        <td class="${active ? 'active-status' : 'inactive-status'}">
                            ${active ? 'Active' : 'Inactive'}
                        </td>

                        <td>${formatDate(item.createdAt)}</td>

                    </tr>
                `;

            }).join('');

        } catch (error) {

            console.error('Staff loading error:', error);

            $('staffTableBody').innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state">
                        Unable to load staff accounts.
                    </td>
                </tr>
            `;

            showMessage(error.message || 'Unable to load staff.', 'error');

        }

    }

    /* ---------------------------------
       ACTIVATE STAFF
    --------------------------------- */

    form.addEventListener('submit', async event => {

        event.preventDefault();

        if (!form.reportValidity()) return;

        if (!user?.uid) {
            showMessage('Please sign in again.', 'error');
            return;
        }

        const email = $('staffEmail').value.trim().toLowerCase();
        const uid = $('staffUid').value.trim();

        if (!email || !uid) {
            showMessage('Enter both email and Firebase UID.', 'error');
            return;
        }

        if (uid === user.uid) {
            showMessage('You cannot add your own account as staff.', 'error');
            return;
        }

        const button = $('activateStaffBtn');

        button.disabled = true;
        button.textContent = 'Activating...';

        try {

            // Confirm that this UID already exists in the Firebase users collection.
            const staffRef = doc(db, 'users', uid);
            const existingSnap = await getDoc(staffRef);

            if (existingSnap.exists()) {

                const existing = existingSnap.data();

                if (existing.role === 'admin') {
                    throw new Error('This account already has Admin access.');
                }

                if (
                    existing.email &&
                    existing.email.toLowerCase() !== email
                ) {
                    throw new Error(
                        'The entered email does not match the existing account.'
                    );
                }

            }

            await setDoc(staffRef, {

                email,
                role: 'staff',
                active: true,

                createdAt: existingSnap.exists()
                    ? existingSnap.data().createdAt || serverTimestamp()
                    : serverTimestamp(),

                updatedAt: serverTimestamp(),
                updatedBy: user.uid

            }, { merge: true });

            showMessage('Staff account activated successfully.', 'success');

            form.reset();

            await loadStaff();

        } catch (error) {

            console.error('Staff activation error:', error);

            showMessage(
                error.message || 'Unable to activate staff account.',
                'error'
            );

        } finally {

            button.disabled = false;
            button.textContent = 'Activate Staff';

        }

    });

    await loadStaff();

}