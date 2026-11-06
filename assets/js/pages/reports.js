/* =====================================
   SAREEDESK - REPORTS
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

const safeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
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

export async function initReports({ db, profile }) {

    const content = $('reportsContent');

    if (!content) return;

    /* ---------------------------------
       ADMIN ACCESS
    --------------------------------- */

    if (profile?.role !== 'admin') {
        $('reportsLoading').textContent =
            'You do not have permission to view business reports.';
        return;
    }

    $('reportsLoading').textContent = 'Loading business reports...';

    try {

        /* ---------------------------------
           LOAD DATA
        --------------------------------- */

        const [salesSnapshot, expensesSnapshot, productsSnapshot] =
            await Promise.all([
                getDocs(collection(db, 'sales')),
                getDocs(collection(db, 'expenses')),
                getDocs(collection(db, 'products'))
            ]);

        const sales = salesSnapshot.docs.map(item => item.data());
        const expenses = expensesSnapshot.docs.map(item => item.data());
        const products = productsSnapshot.docs.map(item => item.data());

        /* ---------------------------------
           CALCULATE SALES METRICS
        --------------------------------- */

        const productsSold = sales.reduce(
            (sum, sale) => sum + safeNumber(sale.qty),
            0
        );

        const revenue = sales.reduce(
            (sum, sale) => sum + safeNumber(sale.total),
            0
        );

        const costOfGoodsSold = sales.reduce(
            (sum, sale) => sum + safeNumber(sale.costTotal),
            0
        );

        const courierCosts = sales.reduce(
            (sum, sale) => sum + safeNumber(sale.courier),
            0
        );

        const outstanding = sales.reduce(
            (sum, sale) => sum + Math.max(0, safeNumber(sale.paymentDue)),
            0
        );

        /* ---------------------------------
           OPERATING EXPENSES
        --------------------------------- */

        const operatingExpenses = expenses.reduce(
            (sum, expense) => sum + safeNumber(expense.amount),
            0
        );

        /* ---------------------------------
           INVENTORY
        --------------------------------- */

        const availableUnits = products.reduce(
            (sum, product) => sum + safeNumber(product.stock),
            0
        );

        /* ---------------------------------
           ESTIMATED NET PROFIT
        --------------------------------- */

        const netProfit =
            revenue -
            costOfGoodsSold -
            operatingExpenses -
            courierCosts;

        /* ---------------------------------
           UPDATE REPORT CARDS
        --------------------------------- */

        $('reportProductsSold').textContent = productsSold;

        $('reportRevenue').textContent = money(revenue);

        $('reportCOGS').textContent = money(costOfGoodsSold);

        $('reportOPEX').textContent = money(operatingExpenses);

        $('reportCourier').textContent = money(courierCosts);

        $('reportNetProfit').textContent = money(netProfit);

        $('reportOutstanding').textContent = money(outstanding);

        $('reportAvailableUnits').textContent = availableUnits;

        $('reportNetProfit').style.color =
            netProfit >= 0 ? '#15803d' : '#dc2626';

        /* ---------------------------------
           FINANCIAL SUMMARY BARS
        --------------------------------- */

        const financialItems = [
            {
                label: 'Revenue',
                value: revenue,
                className: 'bar-revenue'
            },
            {
                label: 'Cost of Goods Sold',
                value: costOfGoodsSold,
                className: 'bar-cost'
            },
            {
                label: 'Operating Expenses',
                value: operatingExpenses,
                className: 'bar-expenses'
            },
            {
                label: 'Courier Costs',
                value: courierCosts,
                className: 'bar-courier'
            },
            {
                label: 'Estimated Net Profit',
                value: netProfit,
                className: 'bar-profit'
            }
        ];

        const maxValue = Math.max(
            1,
            ...financialItems.map(item => Math.abs(item.value))
        );

        $('financialBars').innerHTML = financialItems.map(item => {

            const width = Math.min(
                100,
                Math.abs(item.value) / maxValue * 100
            );

            return `
                <div class="financial-bar-item">

                    <div class="financial-bar-label">
                        <span>${escapeHTML(item.label)}</span>
                        <strong>${money(item.value)}</strong>
                    </div>

                    <div class="financial-bar-track">
                        <div
                            class="financial-bar-fill ${item.className}"
                            style="width:${width}%"
                        ></div>
                    </div>

                </div>
            `;

        }).join('');

        /* ---------------------------------
           COST AND PROFIT DONUT
        --------------------------------- */

        const donutItems = [
            {
                label: 'Product Cost',
                value: Math.max(0, costOfGoodsSold),
                className: 'legend-cost',
                color: '#64748b'
            },
            {
                label: 'Operating Expenses',
                value: Math.max(0, operatingExpenses),
                className: 'legend-expenses',
                color: '#e5a23b'
            },
            {
                label: 'Courier Costs',
                value: Math.max(0, courierCosts),
                className: 'legend-courier',
                color: '#4b8ac8'
            },
            {
                label: 'Net Profit',
                value: Math.max(0, netProfit),
                className: 'legend-profit',
                color: '#239b61'
            }
        ];

        const donutTotal = donutItems.reduce(
            (sum, item) => sum + item.value,
            0
        );

        $('donutTotal').textContent = money(revenue);

        let currentAngle = 0;

        const segments = donutItems.map(item => {

            const percentage = donutTotal > 0
                ? item.value / donutTotal * 100
                : 0;

            const start = currentAngle;
            currentAngle += percentage * 3.6;

            return `${item.color} ${start}deg ${currentAngle}deg`;

        });

        $('costProfitDonut').style.background = donutTotal > 0
            ? `conic-gradient(${segments.join(', ')})`
            : '#e9eef0';

        $('donutLegend').innerHTML = donutItems.map(item => `
            <div class="donut-legend-item">

                <span class="legend-dot ${item.className}"></span>

                <div>
                    <strong>${escapeHTML(item.label)}</strong>
                    <span>${money(item.value)}</span>
                </div>

            </div>
        `).join('');

        /* ---------------------------------
           REPORT TIMESTAMP
        --------------------------------- */

        $('reportGeneratedAt').textContent =
            `Generated: ${new Date().toLocaleString('en-IN')}`;

        $('reportsLoading').classList.add('hidden');
        content.classList.remove('hidden');

    } catch (error) {

        console.error('Reports loading error:', error);

        $('reportsLoading').textContent =
            'Unable to load reports. Please check your connection and try again.';

        $('reportsMessage').textContent =
            error.message || 'An error occurred while loading reports.';

    }

}