/* =====================================
   SAREEDESK - CORE APPLICATION
===================================== */

import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    setPersistence,
    browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import {
    doc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { auth, db, storage } from '../firebase.js';


/* =====================================
   SHARED HELPERS
===================================== */

const $ = id => document.getElementById(id);

const PAGE_TITLES = {
    home: 'Dashboard',
    add: 'Add Item',
    inventory: 'Inventory',
    sales: 'Sales',
    reports: 'Reports',
    viewsales: 'View Sales',
    opex: 'OPEX',
    staff: 'Staff Management'
};


/* =====================================
   PAGE MODULES
===================================== */

const PAGE_MODULES = {

    home: {
        html: 'pages/dashboard.html',
        css: 'assets/css/pages/dashboard.css',
        module: () => import('../pages/dashboard.js'),
        initializer: 'initDashboard'
    },

    add: {
        html: 'pages/add-item.html',
        css: 'assets/css/pages/add-item.css',
        module: () => import('../pages/add-item.js'),
        initializer: 'initAddItem'
    },

    inventory: {
        html: 'pages/inventory.html',
        css: 'assets/css/pages/inventory.css',
        module: () => import('../pages/inventory.js'),
        initializer: 'initInventory'
    },

    sales: {
        html: 'pages/sales.html',
        css: 'assets/css/pages/sales.css',
        module: () => import('../pages/sales.js'),
        initializer: 'initSales'
    },

    reports: {
        html: 'pages/reports.html',
        css: 'assets/css/pages/reports.css',
        module: () => import('../pages/reports.js'),
        initializer: 'initReports'
    },

    viewsales: {
        html: 'pages/view-sales.html',
        css: 'assets/css/pages/view-sales.css',
        module: () => import('../pages/view-sales.js'),
        initializer: 'initViewSales'
    },

    opex: {
        html: 'pages/opex.html',
        css: 'assets/css/pages/opex.css',
        module: () => import('../pages/opex.js'),
        initializer: 'initOpex'
    },

    staff: {
        html: 'pages/staff.html',
        css: 'assets/css/pages/staff.css',
        module: () => import('../pages/staff.js'),
        initializer: 'initStaff'
    }

};


/* =====================================
   APPLICATION STATE
===================================== */

let currentUser = null;
let currentProfile = null;
let currentPage = null;

let editingProductId = null;

let activePageCSS = null;
let navigationLocked = false;


/* =====================================
   TOAST
===================================== */

function toast(message, type = '') {

    const element = $('toast');

    if (!element) return;

    element.textContent = message;

    element.className = type;

    element.classList.add('show');

    setTimeout(() => {
        element.classList.remove('show');
    }, 3000);

}


/* =====================================
   AUTHENTICATION
===================================== */

async function login(event) {

    event.preventDefault();

    const email = $('email').value.trim();
    const password = $('password').value;

    $('loginMsg').textContent = '';

    try {

        // Keep the login session in the browser.
        await setPersistence(auth, browserLocalPersistence);

        // Sign in.
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

    } catch (error) {

        console.error('Login error:', error);

        $('loginMsg').textContent =
            'Invalid email or password. Please try again.';

    }
}

async function logout() {

    try {

        await signOut(auth);

        editingProductId = null;
        currentPage = null;

    } catch (error) {

        console.error('Logout error:', error);

        toast('Unable to sign out.', 'error');

    }

}


/* =====================================
   LOAD USER PROFILE
===================================== */

async function loadUserProfile(user) {

    const userRef = doc(db, 'users', user.uid);

    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {

        throw new Error(
            'Your account is not activated in SareeDesk.'
        );

    }

    const data = snapshot.data();

    if (data.active !== true) {

        throw new Error(
            'Your account is inactive. Please contact Admin.'
        );

    }

    if (!['admin', 'staff'].includes(data.role)) {

        throw new Error(
            'Your account does not have a valid role.'
        );

    }

    return data;

}


/* =====================================
   ADMIN NAVIGATION VISIBILITY
===================================== */

function updateNavigationPermissions() {

    const isAdmin = currentProfile?.role === 'admin';

    document.querySelectorAll('[data-admin-only]').forEach(button => {

        button.classList.toggle('hidden', !isAdmin);

    });

}


/* =====================================
   LOAD PAGE CSS
===================================== */

function loadPageCSS(cssPath) {

    if (activePageCSS) {

        activePageCSS.remove();

        activePageCSS = null;

    }

    return new Promise((resolve, reject) => {

        const link = document.createElement('link');

        link.rel = 'stylesheet';
        link.href = cssPath;

        link.onload = () => {

            activePageCSS = link;

            resolve();

        };

        link.onerror = () => {

            reject(new Error(`Unable to load stylesheet: ${cssPath}`));

        };

        document.head.appendChild(link);

    });

}


/* =====================================
   PAGE NAVIGATION
===================================== */

async function go(page) {

    if (navigationLocked) return;

    const config = PAGE_MODULES[page];

    if (!config) return;

    if (!currentUser || !currentProfile) return;

    const isAdmin = currentProfile.role === 'admin';

    if (
        ['reports', 'opex', 'staff'].includes(page) &&
        !isAdmin
    ) {

        toast('Admin access required.', 'error');

        return;

    }

    navigationLocked = true;

    try {

        const response = await fetch(config.html);

        if (!response.ok) {

            throw new Error(
                `Unable to load ${config.html}. HTTP ${response.status}`
            );

        }

        const html = await response.text();

        // Load the page-specific CSS.
        await loadPageCSS(config.css);

        // Insert the page fragment.
        $('screen').innerHTML = html;

        // Update page heading.
        $('heading').textContent = PAGE_TITLES[page];

        // Update active navigation button.
        document.querySelectorAll('#nav [data-page]').forEach(button => {

            button.classList.toggle(
                'active',
                button.dataset.page === page
            );

        });

        currentPage = page;

        // Import page JavaScript.
        const pageModule = await config.module();

        const initialize = pageModule[config.initializer];

        if (typeof initialize !== 'function') {

            throw new Error(
                `Initializer ${config.initializer} was not found.`
            );

        }

        // Shared dependencies passed to each page.
        await initialize({

            db,
            auth,
            storage,

            user: currentUser,
            profile: currentProfile,

            go,

            editingProductId,

            setEditingProductId: value => {
                editingProductId = value;
            }

        });

    } catch (error) {

        console.error('Page navigation error:', error);

        $('screen').innerHTML = `
            <div class="intro">
                <h3>Unable to open this page</h3>
                <p>${error.message}</p>
            </div>
        `;

        toast('Page loading failed.', 'error');

    } finally {

        navigationLocked = false;

    }

}


/* =====================================
   NAVIGATION EVENTS
===================================== */

$('nav').addEventListener('click', event => {

    const button = event.target.closest('[data-page]');

    if (!button) return;

    go(button.dataset.page);

});


/* =====================================
   DASHBOARD / HOME BUTTONS
===================================== */

$('screen').addEventListener('click', event => {

    const button = event.target.closest('[data-page]');

    if (!button) return;

    go(button.dataset.page);

});


$('homeBottom').addEventListener('click', () => {

    go('home');

});


/* =====================================
   LOGIN AND LOGOUT EVENTS
===================================== */

$('loginForm').addEventListener('submit', login);

$('logout').addEventListener('click', logout);


/* =====================================
   AUTH STATE LISTENER
===================================== */

async function initializeAuthentication() {
    try {
        await setPersistence(auth, browserLocalPersistence);
        console.log('LOCAL AUTH PERSISTENCE ENABLED');

        let isInitialCheck = true;

        onAuthStateChanged(auth, async user => {

            if (!user) {
                // If it's the very first load, don't instantly throw them to login 
                // while Firebase is still fetching the auth token from storage!
                if (isInitialCheck) {
                    // Wait a brief moment on initial load to let Firebase hydrate
                    return;
                }

                currentUser = null;
                currentProfile = null;
                currentPage = null;
                editingProductId = null;

                $('login').classList.remove('hidden');
                $('app').classList.add('hidden');
                $('loginMsg').textContent = '';
                return;
            }

            // Once user is confirmed, mark initial check as done
            isInitialCheck = false;
            console.log('AUTHENTICATED UID:', user.uid);

            try {
                currentUser = user;

                const userRef = doc(db, 'users', user.uid);
                const snapshot = await getDoc(userRef);

                if (!snapshot.exists()) {
                    throw new Error('Admin profile document not found.');
                }

                const data = snapshot.data();

                if (data.active !== true) {
                    throw new Error('Your account is inactive.');
                }

                if (!['admin', 'staff'].includes(data.role)) {
                    throw new Error('Invalid account role.');
                }

                currentProfile = data;

                $('login').classList.add('hidden');
                $('app').classList.remove('hidden');

                $('userEmail').textContent =
                    data.email || user.email || '';

                $('role').textContent =
                    data.role.toUpperCase();

                updateNavigationPermissions();

                if (!currentPage) {
                    await go('home');
                }

            } catch (error) {
                console.error('ACCOUNT PROFILE ERROR:', error);

                $('login').classList.add('hidden');
                $('app').classList.add('hidden');

                $('screen').innerHTML = `
                    <div class="intro">
                        <h3>Account verification failed</h3>
                        <p>${error.message}</p>
                    </div>
                `;
            }
        });

        // Fallback safety net: If Firebase takes longer than 1.5 seconds 
        // to respond on initial load, show login screen if no user exists.
        setTimeout(() => {
            if (isInitialCheck && !auth.currentUser) {
                isInitialCheck = false;
                $('login').classList.remove('hidden');
                $('app').classList.add('hidden');
            }
        }, 1500);

    } catch (error) {
        console.error('AUTH INITIALIZATION ERROR:', error);
        $('login').classList.remove('hidden');
        $('app').classList.add('hidden');
    }
}

// Initialize authentication on load
initializeAuthentication();