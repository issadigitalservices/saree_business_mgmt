
/* =====================================
   SAREEDESK - DASHBOARD
===================================== */

export function initDashboard({ go }) {

    const dashboard = document.querySelector('.dashboard-page');

    if (!dashboard) return;

    dashboard.addEventListener('click', (event) => {

        const card = event.target.closest('[data-page]');

        if (!card) return;

        const page = card.dataset.page;

        if (typeof go === 'function') {
            go(page);
        }

    });

}
