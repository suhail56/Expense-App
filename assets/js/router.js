// SPA Hash Router Logic

const views = ['dashboard', 'transactions', 'settings'];
const defaultView = 'dashboard';

function initRouter() {
    // Listen for hash changes
    window.addEventListener('hashchange', handleRouteChange);
    
    // Handle initial load
    handleRouteChange();

    // Mobile Sidebar Toggles
    $('#openSidebar').click(function() {
        $('#sidebar').addClass('open');
    });
    
    $('#closeSidebar, .nav-link').click(function() {
        if(window.innerWidth <= 768) {
            $('#sidebar').removeClass('open');
        }
    });
}

function handleRouteChange() {
    let hash = window.location.hash.replace('#/', '').replace('#', '');
    if (!hash || !views.includes(hash)) {
        hash = defaultView;
        window.location.hash = hash;
        return;
    }

    // Hide all views, remove active states
    $('.app-view').removeClass('active');
    $('.nav-link').removeClass('active');

    // Show selected view
    $(`#view-${hash}`).addClass('active');
    
    // Highlight sidebar link
    $(`.nav-link[data-view="${hash}"]`).addClass('active');

    // Update Topbar Title
    let title = hash.charAt(0).toUpperCase() + hash.slice(1);
    $('#pageTitle').text(title);

    // If moving to transactions view, re-render to apply any active filters
    if (hash === 'transactions') {
        if (typeof renderTransactionsPage === 'function') {
            renderTransactionsPage();
        }
    }
}
