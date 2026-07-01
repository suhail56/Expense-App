// State
$.ajaxSetup({ cache: false });
let appData = {
    settings: {
        gasUrl: '',
        syncStartDate: ''
    },
    categoryRules: [],
    categoryLimits: {},
    expenseCategories: [],
    incomeCategories: [],
    transactions: []
};

// Utilities
function generateUUID() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
}

function validateTransaction(tx) {
    if (!tx || !tx.categoryId) return false;
    if (tx.type === 'expense' && !appData.expenseCategories.find(c => c.id === tx.categoryId)) return false;
    if (tx.type === 'income' && !appData.incomeCategories.find(c => c.id === tx.categoryId)) return false;
    return true;
}

// Global Sort State
let currentSortCol = 'date'; // 'date' or 'amount'
let currentSortDir = 'desc'; // 'desc' or 'asc'

// Dashboard State
let currentDashYear = '';
let currentDashMonth = ''; // '' means "All Year"
let yearlyChartInstance = null;
let expensePieChartInstance = null;

// Pagination Variables
let fileSha = null;
let currentPage = 1;
let rowsPerPage = 10;

// GitHub API config
let ghRepo = localStorage.getItem('ghRepo') || '';
let ghToken = localStorage.getItem('ghToken') || '';

// DOM Elements
const authOverlay = document.getElementById('authOverlay');
const appContent = document.getElementById('appContent');
const loadingOverlay = document.getElementById('loadingOverlay');

// SweetAlert2 Configuration
const Toast = Swal.mixin({
    toast: true,
    position: window.innerWidth <= 768 ? 'top' : 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: 'rgba(15, 23, 42, 0.95)',
    color: '#f8fafc',
    iconColor: '#3b82f6'
});

function confirmAction(title, text, confirmButtonText, actionCallback) {
    Swal.fire({
        title: title,
        text: text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: 'transparent',
        confirmButtonText: confirmButtonText,
        background: 'rgba(15, 23, 42, 0.85)',
        color: '#f8fafc'
    }).then((result) => {
        if (result.isConfirmed) {
            actionCallback();
        }
    });
}

// --- Haptic Feedback Engine ---
window.triggerHaptic = function (type = 'light') {
    if (!navigator.vibrate) return;
    try {
        switch (type) {
            case 'light': navigator.vibrate(10); break;
            case 'medium': navigator.vibrate(20); break;
            case 'heavy': navigator.vibrate(40); break;
            case 'success': navigator.vibrate([20, 50, 20]); break;
            case 'error': navigator.vibrate([40, 50, 40, 50, 40]); break;
        }
    } catch (e) { }
};

// Pull to Refresh Engine has been removed per user request

// --- Swipe to Action Engine ---
let swipeStartX = 0;
let swipeCurrentX = 0;
let activeSwipeRow = null;
const SWIPE_THRESHOLD = 50;

document.addEventListener('touchstart', (e) => {
    const swipeContent = e.target.closest('.swipe-content');
    if (!swipeContent) {
        // Reset any open rows if tapping elsewhere
        if (activeSwipeRow && !e.target.closest('.swipe-row-wrapper')) {
            activeSwipeRow.classList.remove('dragging');
            activeSwipeRow.style.transform = 'translateX(0)';
            activeSwipeRow = null;
        }
        return;
    }
    
    // Close previously active row if tapping a different one
    if (activeSwipeRow && activeSwipeRow !== swipeContent) {
        activeSwipeRow.classList.remove('dragging');
        activeSwipeRow.style.transform = 'translateX(0)';
    }
    
    activeSwipeRow = swipeContent;
    
    let initialOffset = 0;
    const currentTransform = activeSwipeRow.style.transform;
    if (currentTransform && currentTransform.includes('translateX')) {
        initialOffset = parseFloat(currentTransform.replace('translateX(', '').replace('px)', ''));
        if (isNaN(initialOffset)) initialOffset = 0;
    }
    
    swipeStartX = e.touches[0].clientX - initialOffset;
    activeSwipeRow.classList.add('dragging');
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!activeSwipeRow || !activeSwipeRow.classList.contains('dragging')) return;
    
    swipeCurrentX = e.touches[0].clientX - swipeStartX;
    
    // Determine bounds based on available actions
    const wrapper = activeSwipeRow.closest('.swipe-row-wrapper');
    const hasLeft = wrapper.querySelector('.swipe-actions-left') !== null;
    const hasRight = wrapper.querySelector('.swipe-actions-right') !== null;
    
    if (!hasLeft && swipeCurrentX > 0) swipeCurrentX = 0;
    if (!hasRight && swipeCurrentX < 0) swipeCurrentX = 0;
    
    // Limit drag distance visually
    let visualX = swipeCurrentX;
    if (visualX > 100) visualX = 100 + (visualX - 100) * 0.2;
    if (visualX < -150) visualX = -150 + (visualX + 150) * 0.2; 
    
    activeSwipeRow.style.transform = `translateX(${visualX}px)`;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    if (!activeSwipeRow) return;
    
    activeSwipeRow.classList.remove('dragging');
    void activeSwipeRow.offsetWidth; // Force reflow for smooth transition
    
    const wrapper = activeSwipeRow.closest('.swipe-row-wrapper');
    const hasLeft = wrapper.querySelector('.swipe-actions-left') !== null;
    const hasRight = wrapper.querySelector('.swipe-actions-right') !== null;
    
    if (hasRight && swipeCurrentX < -SWIPE_THRESHOLD) {
        const buttonsCount = wrapper.querySelectorAll('.swipe-actions-right .swipe-action-btn').length;
        activeSwipeRow.style.transform = `translateX(-${buttonsCount * 75}px)`;
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
    } else if (hasLeft && swipeCurrentX > SWIPE_THRESHOLD) {
        const buttonsCount = wrapper.querySelectorAll('.swipe-actions-left .swipe-action-btn').length;
        activeSwipeRow.style.transform = `translateX(${buttonsCount * 75}px)`;
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
    } else {
        activeSwipeRow.style.transform = `translateX(0)`;
        activeSwipeRow = null;
    }
    
    swipeStartX = 0;
    swipeCurrentX = 0;
});
// ------------------------------

// Initialize
$(document).ready(function () {

    // Initialize Premium DatePicker for Transactions
    flatpickr('#txDate', {
        enableTime: true,
        dateFormat: "Y-m-d\\TH:i",
        altInput: true,
        altFormat: "F j, Y h:i K",
        time_24hr: false
    });

    // Initialize Premium DatePicker for Filters
    flatpickr('#filterStartDate, #filterEndDate', {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "M j, Y",
        onChange: function () {
            if (typeof renderTransactionsPage === 'function') {
                currentPage = 1;
                renderTransactionsPage();
            }
        }
    });

    flatpickr('#syncStartDate', {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "M j, Y"
    });

    // Auth Check
    if (ghRepo && ghToken) {
        authOverlay.style.display = 'none';

        if (typeof isBiometricsEnabled === 'function' && isBiometricsEnabled()) {
            document.body.className = 'theme-login';
            $('#lockScreenOverlay').css('display', 'flex');
        } else {
            appContent.style.display = 'flex';
            $('#displayRepo').val(ghRepo);
            initRouter();
            initDevMode(); // Initialize DEV MODE badge if applicable
            fetchData();
        }
    } else {
        document.body.className = 'theme-login';
        authOverlay.style.display = 'flex';
    }

    window.handleBiometricUnlock = async function () {
        if (typeof authenticateBiometrics === 'function') {
            const success = await authenticateBiometrics();
            if (success) {
                $('#lockScreenOverlay').fadeOut(300, function () {
                    appContent.style.display = 'flex';
                    $('#displayRepo').val(ghRepo);
                    initRouter();
                    initDevMode();
                    fetchData();
                });
            } else {
                Toast.fire({ icon: 'error', title: 'Biometric Authentication Failed' });
            }
        }
    };

    window.fallbackToLogin = function () {
        $('#lockScreenOverlay').fadeOut(300, function () {
            authOverlay.style.display = 'flex';
        });
    };

    // Auth Form Submit
    $('#authForm').submit(function (e) {
        e.preventDefault();
        ghRepo = $('#githubRepo').val().trim();
        ghToken = $('#githubToken').val().trim();

        if (!ghRepo || !ghToken) {
            Toast.fire({ icon: 'warning', title: 'Repository and Token are required' });
            return;
        }

        if (!ghRepo.includes('/')) {
            Toast.fire({ icon: 'warning', title: 'Invalid Repository format (must be username/repo)' });
            return;
        }

        if (!ghToken.startsWith('ghp_') && !ghToken.startsWith('github_pat_')) {
            Toast.fire({ icon: 'warning', title: 'Invalid GitHub Token format' });
            return;
        }

        localStorage.setItem('ghRepo', ghRepo);
        localStorage.setItem('ghToken', ghToken);
        authOverlay.style.display = 'none';
        appContent.style.display = 'flex';
        $('#displayRepo').val(ghRepo);
        initRouter();
        initDevMode();
        fetchData();
    });

    // Logout
    $('#logoutBtn').click(function () {
        localStorage.removeItem('ghRepo');
        localStorage.removeItem('ghToken');
        document.body.className = 'theme-login';
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('authOverlay').style.display = 'flex';
        $('#githubToken').val(''); location.reload();
    });

    // Auto-Logout for Inactivity (15 minutes)
    let inactivityTimer;
    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000;

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        if (localStorage.getItem('ghToken')) {
            inactivityTimer = setTimeout(() => {
                localStorage.removeItem('ghRepo');
                localStorage.removeItem('ghToken');
                location.reload(); // Reloads to the secure login screen
            }, INACTIVITY_LIMIT_MS);
        }
    }

    ['mousemove', 'keypress', 'touchstart', 'scroll', 'click'].forEach(evt => {
        document.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    resetInactivityTimer();

    // Save Transaction
    $('#transactionForm').submit(function (e) {
        e.preventDefault();

        const saveBtn = $('#saveTransactionBtn');
        saveBtn.prop('disabled', true);

        const txId = $('#txId').val();
        const date = $('#txDate').val();
        const merchant = $('#txMerchant').val().trim();
        const categoryId = $('#txCategory').val();
        const amountStr = $('#txAmount').val();
        const type = $('input[name="txType"]:checked').val();

        if (!date || !merchant || !categoryId || !amountStr) {
            Toast.fire({ icon: 'warning', title: 'Please fill in all transaction fields' });
            saveBtn.prop('disabled', false);
            return;
        }

        const parsedAmount = parseFloat(amountStr);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            Toast.fire({ icon: 'warning', title: 'Amount must be greater than zero' });
            saveBtn.prop('disabled', false);
            return;
        }

        let existingTx = {};
        if (txId) {
            existingTx = appData.transactions.find(t => t.id === txId) || {};
        }

        const newTx = {
            ...existingTx,
            id: txId || generateUUID(),
            date: date,
            merchant: merchant,
            type: type,
            categoryId: categoryId,
            amount: parseFloat(amountStr).toFixed(2),
            isReviewed: true
        };

        // Strict Foreign Key Constraint Validation
        if (!validateTransaction(newTx)) {
            Toast.fire({ icon: 'error', title: 'Database Integrity Error: Category does not exist.' });
            saveBtn.prop('disabled', false);
            return;
        }

        if (txId) {
            const idx = appData.transactions.findIndex(t => t.id === txId);
            if (idx > -1) appData.transactions[idx] = newTx;
        } else {
            appData.transactions.push(newTx);
        }

        $('#addTransactionModal').modal('hide');
        $('#transactionForm')[0].reset();
        $('#txId').val('');

        saveBtn.prop('disabled', false);
        refreshUI();
        saveData();

        // Trigger Success Haptic
        if (typeof window.triggerHaptic === 'function') {
            window.triggerHaptic('success');
        }

        Toast.fire({ icon: 'success', title: txId ? 'Transaction updated' : 'Transaction added' });
    });

    // Handle Type Change to Update Categories in Modal
    $('input[name="txType"]').change(function () {
        updateTransactionModalCategories();
    });

    // Event Listeners for Transactions Page Search & Filter
    $('#searchTx').on('input', function () { currentPage = 1; renderTransactionsPage(); });
    $('#filterCategory').on('change', function () { currentPage = 1; renderTransactionsPage(); });
    $('#filterType').on('change', function () { currentPage = 1; renderTransactionsPage(); });
    $('#filterStartDate').on('change', function () { currentPage = 1; renderTransactionsPage(); });
    $('#filterUnreviewedOnly').on('change', function () { currentPage = 1; renderTransactionsPage(); });
    $('#rowsPerPageSelect').on('change', function () {
        const val = $(this).val();
        rowsPerPage = val === 'All' ? 9999999 : parseInt(val, 10);
        currentPage = 1;
        renderTransactionsPage();
    });

    // Dashboard Filters Event Listeners
    $('#dashYearFilter').change(function () {
        currentDashYear = $(this).val();
        currentDashMonth = ''; // Reset to all year when year changes
        updateDashMonthFilter();
        renderDashboard();
    });

    $('#dashMonthFilter').change(function () {
        currentDashMonth = $(this).val();
        renderDashboard();
    });

    $('.dashSyncBtn').click(function () {
        $('#triggerSyncBtn').click(); // Reuse existing sync logic
    });

    // Header sorting listeners
    $('#sortDateBtn').click(function () {
        if (currentSortCol === 'date') {
            currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
        } else {
            currentSortCol = 'date';
            currentSortDir = 'desc';
        }
        renderTransactionsPage();
    });

    $('#sortAmountBtn').click(function () {
        if (currentSortCol === 'amount') {
            currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
        } else {
            currentSortCol = 'amount';
            currentSortDir = 'desc';
        }
        renderTransactionsPage();
    });

    $('#clearFiltersBtn').click(function () {
        $('#searchTx').val('');
        $('#filterCategory').val('All');
        $('#filterType').val('All');
        $('#filterUnreviewedOnly').prop('checked', false);

        const startPicker = document.getElementById('filterStartDate')._flatpickr;
        if (startPicker) startPicker.clear();
        else $('#filterStartDate').val('');

        const endPicker = document.getElementById('filterEndDate')._flatpickr;
        if (endPicker) endPicker.clear();
        else $('#filterEndDate').val('');

        currentSortCol = 'date';
        currentSortDir = 'desc';
        currentPage = 1;
        renderTransactionsPage();
    });

    // Biometrics Toggle Listener
    $('#toggleBiometricsBtn').change(async function () {
        const isChecked = $(this).is(':checked');
        if (isChecked) {
            const success = await window.registerBiometrics();
            if (!success) $(this).prop('checked', false);
        } else {
            window.disableBiometrics();
        }

        const enabled = typeof isBiometricsEnabled === 'function' && isBiometricsEnabled();
        $('#biometricStatusText').text(enabled ? 'Active - FaceID/TouchID Required' : 'Currently Disabled');
        $('#biometricStatusText').toggleClass('text-success', enabled).toggleClass('text-white-50', !enabled);
    });

    // Auto-Categorization Rules Form
    $('#addRuleForm').submit(function (e) {
        e.preventDefault();
        const categoryId = $('#ruleCategory').val();
        const keywordsInput = $('#ruleKeywords').val().trim();

        if (!categoryId || !keywordsInput) {
            Toast.fire({ icon: 'warning', title: 'Category and keywords are required' });
            return;
        }

        const keywords = keywordsInput.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
        if (keywords.length > 0) {

            const existingKeywords = appData.categoryRules[categoryId] || [];
            if (existingKeywords.length > 0) {
                // Merge and remove duplicates
                appData.categoryRules[categoryId] = [...new Set([...existingKeywords, ...keywords])];
                Toast.fire({ icon: 'success', title: 'Rule updated' });
            } else {
                // Remove duplicates from new input
                appData.categoryRules[categoryId] = [...new Set(keywords)];
                Toast.fire({ icon: 'success', title: 'Rule added' });
            }

            $('#ruleKeywords').val('');
            renderRulesTable();
            saveData();
        } else {
            Toast.fire({ icon: 'warning', title: 'Please enter valid keywords' });
        }
    });

    // Apply Rules to Past Transactions
    $('#applyRulesToPastBtn').click(function () {
        if (!appData.categoryRules || Object.keys(appData.categoryRules).length === 0) {
            Toast.fire({ icon: 'warning', title: 'You have no rules to apply!' });
            return;
        }

        confirmAction('Apply Rules?', 'This will scan all UNREVIEWED existing transactions and update their categories based on your current rules. Manually edited transactions will not be modified.', 'Yes, Apply Rules', () => {
            let updatedCount = 0;
            appData.transactions.forEach(tx => {
                if (tx.isReviewed === true) return; // Skip already reviewed/manually edited transactions
                const merchantLower = tx.merchant.toLowerCase();
                for (const catId in appData.categoryRules) {
                    const keywords = appData.categoryRules[catId];
                    if (keywords.some(kw => merchantLower.includes(kw))) {
                        if (tx.categoryId !== catId) {
                            tx.categoryId = catId;
                            updatedCount++;
                        }
                        break;
                    }
                }
            });

            if (updatedCount > 0) {
                refreshUI();
                saveData();
                Swal.fire({ title: 'Success!', text: `Updated ${updatedCount} transactions!`, icon: 'success', background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc' });
            } else {
                Toast.fire({ icon: 'info', title: 'All transactions already match your rules.' });
            }
        });
    });

    // Add Limit Form
    $('#addLimitForm').submit(function (e) {
        e.preventDefault();
        const categoryId = $('#limitCategory').val();
        const limitAmtStr = $('#limitAmount').val();
        const limitAmt = parseFloat(limitAmtStr);

        if (!categoryId || !limitAmtStr || isNaN(limitAmt) || limitAmt <= 0) {
            Toast.fire({ icon: 'warning', title: 'Select a category and valid amount' });
            return;
        }

        if (!appData.categoryLimits) appData.categoryLimits = {};
        appData.categoryLimits[categoryId] = limitAmt;
        $('#limitAmount').val('');
        refreshUI();
        saveData();
        Toast.fire({ icon: 'success', title: 'Limit saved' });
    });

    // Sync Settings Form
    $('#syncSettingsForm').submit(function (e) {
        e.preventDefault();
        const gasUrl = $('#gasUrl').val().trim();

        if (!gasUrl) {
            Toast.fire({ icon: 'warning', title: 'Google Apps Script URL is required' });
            return;
        }

        if (!appData.settings) appData.settings = {};
        appData.settings.gasUrl = gasUrl;
        appData.settings.syncStartDate = $('#syncStartDate').val();

        appData.settings.emailSender = $('#emailSender').val().trim();
        appData.settings.emailSubject = $('#emailSubject').val().trim();
        appData.settings.emailRegex = $('#emailRegex').val().trim();

        saveData();
        Toast.fire({ icon: 'success', title: 'Sync settings saved!' });
    });

    // Reset Database
    $('#resetDatabaseBtn').click(function () {
        confirmAction('DANGER', 'This will permanently delete ALL transactions. Are you absolutely sure?', 'Yes, Delete All', () => {
            appData.transactions = [];
            refreshUI();
            saveData();
            Toast.fire({ icon: 'success', title: 'Database has been reset.' });
        });
    });

    // Trigger Manual Sync
    $('#triggerSyncBtn').click(function () {
        if (!appData.settings || !appData.settings.gasUrl) {
            Swal.fire({ title: 'Configuration Missing', text: 'Please save your Google Apps Script URL first.', icon: 'warning', background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc' });
            return;
        }
        const gasUrl = appData.settings.gasUrl;
        const startDate = appData.settings.syncStartDate || '';

        function setSyncBtnState(isSyncing) {
            if (isSyncing) {
                $('#triggerSyncBtn').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-2"></i>Syncing...');
                $('.dashSyncBtn').each(function() {
                    $(this).prop('disabled', true);
                    if ($(this).closest('.mobile-header').length > 0) {
                        $(this).html('<i class="fa-solid fa-spinner fa-spin"></i>');
                    } else {
                        $(this).html('<i class="fa-solid fa-spinner fa-spin me-2"></i>Syncing...');
                    }
                });
            } else {
                $('#triggerSyncBtn').prop('disabled', false).html('<i class="fa-solid fa-bolt me-2"></i> Sync Now');
                $('.dashSyncBtn').each(function() {
                    $(this).prop('disabled', false);
                    if ($(this).closest('.mobile-header').length > 0) {
                        $(this).html('<i class="fa-solid fa-bolt"></i>');
                    } else {
                        $(this).html('<i class="fa-solid fa-bolt me-1"></i> Sync Now');
                    }
                });
            }
        }

        setSyncBtnState(true);

        $.ajax({
            url: gasUrl,
            method: 'POST',
            dataType: 'json',
            data: {
                ghRepo: ghRepo,
                ghToken: ghToken,
                startDate: startDate,
                dbFileName: getDatabaseFileName()
            },
            success: function (res) {
                setSyncBtnState(false);
                if (res.status === 'success') {
                    Swal.fire({ title: 'Sync Complete', text: res.message, icon: 'success', background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc' });
                    localStorage.setItem('lastSyncNowTime', new Date().toISOString());

                    // To prevent missing transactions, we roll the date back exactly 1 day from right now.
                    // This creates a safe 1-day overlap. The smart-merge engine will ignore any duplicates!
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    window.pendingSyncDateUpdate = d.toISOString().split('T')[0];

                    fetchData();
                } else {
                    Swal.fire({ title: 'Sync Failed', text: res.message, icon: 'error', background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc' });
                }
            },
            error: function (err) {
                setSyncBtnState(false);
                Swal.fire({ title: 'Error', text: 'Error contacting Google Apps Script.', icon: 'error', background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc' });
                console.error(err);
            }
        });
    });
});

window.autoCategorizeNewTransactions = function () {
    if (!appData.categoryRules || Object.keys(appData.categoryRules).length === 0) return false;
    let updatedCount = 0;
    appData.transactions.forEach(tx => {
        // Only apply to newly imported (unreviewed) transactions
        if (tx.isReviewed !== true) {
            const merchantLower = tx.merchant.toLowerCase();
            for (const catId in appData.categoryRules) {
                const keywords = appData.categoryRules[catId];
                if (keywords.some(kw => merchantLower.includes(kw))) {
                    if (tx.categoryId !== catId) {
                        tx.categoryId = catId;
                        updatedCount++;
                    }
                    break;
                }
            }
        }
    });
    return updatedCount > 0;
};

// GitHub API Methods
function getDatabaseFileName() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
        return 'data-dev.json';
    }
    return 'data.json';
}

function initDevMode() {
    if (getDatabaseFileName() === 'data-dev.json') {
        if ($('#devModeBadge').length === 0) {
            $('.sidebar-brand').append('<span id="devModeBadge" class="badge bg-warning text-dark ms-2" style="font-size: 0.6rem;">DEV MODE</span>');
        }
    }
}

function getApiUrl() {
    return `https://api.github.com/repos/${ghRepo}/contents/${getDatabaseFileName()}`;
}

function getHeaders() {
    return {
        'Authorization': `token ${ghToken}`,
        'Accept': 'application/vnd.github.v3+json'
    };
}

function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
    if (show && window.innerWidth <= 768) {
        const skeletonRow = `<div class="skeleton-box mb-2 w-100" style="height: 70px;"></div>`;
        const skeletons = skeletonRow.repeat(6);
        $('#recentTransactionsBody').html(skeletons);
        $('#transactionsTableBody').html(skeletons);
        $('#budgetsList').html(skeletons);
        $('#goalsContainer').html(skeletons);
    }
}

function initializeDatabaseSchema(data) {
    appData = data || {};
    if (!appData.settings) appData.settings = { gasUrl: '', syncStartDate: '' };
    if (!appData.categoryRules) appData.categoryRules = {};
    if (!appData.categoryLimits) appData.categoryLimits = {};
    if (!appData.expenseCategories) appData.expenseCategories = [];
    if (!appData.incomeCategories) appData.incomeCategories = [];
    if (!appData.transactions) appData.transactions = [];
    if (!appData.goals) appData.goals = [];
}

window.fetchData = function (showSuccessAlert = false) {
    showLoading(true);
    $.ajax({
        url: getApiUrl(),
        method: 'GET',
        headers: getHeaders(),
        success: function (response) {
            fileSha = response.sha;
            const content = decodeURIComponent(escape(window.atob(response.content)));
            const parsedData = JSON.parse(content);

            // DATA MIGRATION LOGIC
            initializeDatabaseSchema(parsedData);

            // Migrate old categories
            if (appData.categories && !appData.expenseCategories) {
                appData.expenseCategories = appData.categories;
                appData.incomeCategories = ['Salary', 'Refunds', 'Dividends', 'Other'];
                delete appData.categories;
            }

            // RELATIONAL MIGRATION: Convert string categories to ID objects
            let needsMigrationSave = false;

            // 1. Convert expenseCategories
            if (appData.expenseCategories.length > 0 && typeof appData.expenseCategories[0] === 'string') {
                appData.expenseCategories = appData.expenseCategories.map(name => ({
                    id: 'cat-exp-' + Math.random().toString(36).substr(2, 9),
                    name: name
                }));
                needsMigrationSave = true;
            }

            // 2. Convert incomeCategories
            if (appData.incomeCategories.length > 0 && typeof appData.incomeCategories[0] === 'string') {
                appData.incomeCategories = appData.incomeCategories.map(name => ({
                    id: 'cat-inc-' + Math.random().toString(36).substr(2, 9),
                    name: name
                }));
                needsMigrationSave = true;
            }

            // Helper to find ID by name during migration
            const getMigrationId = (name, type) => {
                const list = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;
                const cat = list.find(c => c.name === name);
                return cat ? cat.id : null;
            };

            // Migrate old transactions to be 'expense' by default and use categoryId
            if (appData.transactions) {
                appData.transactions.forEach(tx => {
                    if (!tx.type) { tx.type = 'expense'; needsMigrationSave = true; }
                    if (tx.category && !tx.categoryId) {
                        const cid = getMigrationId(tx.category, tx.type);
                        if (cid) {
                            tx.categoryId = cid;
                            needsMigrationSave = true;
                        } else {
                            // If it's a legacy category that was deleted from master list, recreate it or map to 'Others'
                            const newId = 'cat-' + tx.type.substr(0, 3) + generateUUID();
                            if (tx.type === 'expense') appData.expenseCategories.push({ id: newId, name: tx.category });
                            else appData.incomeCategories.push({ id: newId, name: tx.category });
                            tx.categoryId = newId;
                            needsMigrationSave = true;
                        }
                    }

                    // Strict Data Cleanup: Remove legacy strings universally
                    if (tx.category !== undefined) {
                        delete tx.category;
                        needsMigrationSave = true;
                    }
                });
            }

            // Migrate Rules
            if (appData.categoryRules) {
                const newRulesMap = {};
                let rulesMigrated = false;

                if (Array.isArray(appData.categoryRules)) {
                    appData.categoryRules.forEach(rule => {
                        let cid = rule.categoryId;
                        if (!cid && rule.category) {
                            cid = getMigrationId(rule.category, 'expense') || getMigrationId(rule.category, 'income');
                        }
                        if (cid) {
                            newRulesMap[cid] = rule.keywords;
                        }
                    });
                    appData.categoryRules = newRulesMap;
                    rulesMigrated = true;
                    needsMigrationSave = true;
                } else {
                    for (const key in appData.categoryRules) {
                        if (!key.startsWith('cat-')) {
                            const cid = getMigrationId(key, 'expense') || getMigrationId(key, 'income');
                            if (cid) {
                                newRulesMap[cid] = appData.categoryRules[key];
                                rulesMigrated = true;
                            }
                        } else {
                            newRulesMap[key] = appData.categoryRules[key];
                        }
                    }
                    if (rulesMigrated) {
                        appData.categoryRules = newRulesMap;
                        needsMigrationSave = true;
                    }
                }
            }

            // Migrate Limits
            if (appData.categoryLimits) {
                const newLimits = {};
                let limitsMigrated = false;
                for (const key in appData.categoryLimits) {
                    // Check if key is not an ID (IDs start with 'cat-')
                    if (!key.startsWith('cat-')) {
                        const cid = getMigrationId(key, 'expense');
                        if (cid) {
                            newLimits[cid] = appData.categoryLimits[key];
                            limitsMigrated = true;
                        }
                    } else {
                        newLimits[key] = appData.categoryLimits[key];
                    }
                }
                if (limitsMigrated) {
                    appData.categoryLimits = newLimits;
                    needsMigrationSave = true;
                }
            }
            // Track last login (will be saved to GitHub on next user action)
            appData.settings.lastLogin = new Date().toISOString();

            // Populate settings inputs
            $('#gasUrl').val(appData.settings.gasUrl || '');
            $('#syncStartDate').val(appData.settings.syncStartDate || '');
            let fpSync = document.querySelector('#syncStartDate')._flatpickr;
            if (fpSync) fpSync.setDate(appData.settings.syncStartDate || '');

            if (typeof isBiometricsSupported === 'function' && isBiometricsSupported()) {
                $('#biometricSecurityCard').show();
                const enabled = isBiometricsEnabled();
                $('#toggleBiometricsBtn').prop('checked', enabled);
                $('#biometricStatusText').text(enabled ? 'Active - FaceID/TouchID Required' : 'Currently Disabled');
                $('#biometricStatusText').toggleClass('text-success', enabled).toggleClass('text-white-50', !enabled);
            }

            // Populate email parser settings (or use defaults)
            $('#emailSender').val(appData.settings.emailSender || 'MashreqAlerts@mashreq.com');
            $('#emailSubject').val(appData.settings.emailSubject || 'Transaction Confirmation on Mashreq Card');
            $('#emailRegex').val(appData.settings.emailRegex || 'purchase of (?:AED|USD)\\s+([\\d,.]+)\\s+at\\s+(.*?)\\s+on\\s+([\\d]{2}-[A-Z]{3}-[\\d]{4}\\s+[\\d]{2}:[\\d]{2}\\s+[A-Z]{2})');

            // Process Automated Sync Date Update (with 1-day overlap)
            if (window.pendingSyncDateUpdate) {
                appData.settings.syncStartDate = window.pendingSyncDateUpdate;
                appData.settings.lastSyncNowDate = new Date().toISOString();
                $('#syncStartDate').val(window.pendingSyncDateUpdate);
                if (fpSync) fpSync.setDate(window.pendingSyncDateUpdate);
                needsMigrationSave = true;
                window.pendingSyncDateUpdate = null;
            }

            if (window.autoCategorizeNewTransactions()) {
                needsMigrationSave = true;
            }

            if (needsMigrationSave) {
                saveData(true); // pass true to indicate silent background save if we update it later
            }
            refreshUI();
            startAutoPoll();
            showLoading(false);
            if (showSuccessAlert) {
                Toast.fire({ icon: 'success', title: 'Database Synced Successfully!' });
            }
        },
        error: function (err) {
            showLoading(false);

            // Force logout and hide app content since connection failed
            localStorage.removeItem('ghRepo');
            localStorage.removeItem('ghToken');
            document.body.className = 'theme-login';
            document.getElementById('authOverlay').style.display = 'flex';
            document.getElementById('appContent').style.display = 'none';

            if (err.status === 404) {
                Swal.fire({ title: 'Database Not Found', text: `${getDatabaseFileName()} not found in repository. Please ensure it exists.`, icon: 'error', background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc' });
            } else {
                Swal.fire({ title: 'Connection Error', text: 'Invalid Repository or Token. Access Denied.', icon: 'error', background: 'rgba(15, 23, 42, 0.85)', color: '#f8fafc' });
                console.error(err);
            }
        }
    });
}

let pollInterval;
function startAutoPoll() {
    if (pollInterval) clearInterval(pollInterval);
    // Poll every 3 minutes
    pollInterval = setInterval(() => {
        if (!ghRepo || !ghToken) return;

        $.ajax({
            url: getApiUrl(),
            method: 'GET',
            headers: getHeaders(),
            success: function (response) {
                if (response.sha && response.sha !== fileSha) {
                    fileSha = response.sha;
                    const decodedContent = window.atob(response.content);
                    appData = JSON.parse(decodeURIComponent(escape(decodedContent)));

                    if (window.autoCategorizeNewTransactions()) {
                        saveData(true);
                    }

                    refreshUI();
                    Toast.fire({ icon: 'info', title: 'New data synced in background!' });
                }
            }
        });
    }, 180000);
}
// Category Relational Helpers
window.getCategoryName = function (id) {
    if (!id) return 'Unknown';
    let cat = appData.expenseCategories.find(c => c.id === id);
    if (cat) return cat.name;
    cat = appData.incomeCategories.find(c => c.id === id);
    if (cat) return cat.name;
    return 'Unknown'; // Fallback if deleted
};

window.getCategoryId = function (name, type) {
    const list = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;
    const cat = list.find(c => c.name === name);
    return cat ? cat.id : null;
};
function mergeState(local, remote) {
    const merged = JSON.parse(JSON.stringify(remote));

    // O(N) Map Merge function for ultra-fast merging of 10,000+ items
    const mapMerge = (localArray, remoteArray) => {
        if (!localArray || !Array.isArray(localArray)) return remoteArray || [];
        const mergedMap = new Map();
        if (remoteArray && Array.isArray(remoteArray)) {
            remoteArray.forEach(item => mergedMap.set(item.id, item));
        }
        localArray.forEach(item => mergedMap.set(item.id, item));
        return Array.from(mergedMap.values());
    };

    // Apply O(N) Map Merge to all data arrays
    merged.transactions = mapMerge(local.transactions, merged.transactions);
    merged.expenseCategories = mapMerge(local.expenseCategories, merged.expenseCategories);
    merged.incomeCategories = mapMerge(local.incomeCategories, merged.incomeCategories);
    merged.goals = mapMerge(local.goals, merged.goals);

    if (local.categoryRules) {
        if (!merged.categoryRules) merged.categoryRules = {};
        for (const catId in local.categoryRules) {
            const localKeywords = local.categoryRules[catId];
            if (!merged.categoryRules[catId]) merged.categoryRules[catId] = localKeywords;
            else merged.categoryRules[catId] = [...new Set([...merged.categoryRules[catId], ...localKeywords])];
        }
    }

    if (local.categoryLimits) {
        if (!merged.categoryLimits) merged.categoryLimits = {};
        for (const catId in local.categoryLimits) {
            merged.categoryLimits[catId] = local.categoryLimits[catId];
        }
    }

    if (local.settings) merged.settings = { ...merged.settings, ...local.settings };

    return merged;
}

function saveData() {
    // Concurrency Engine: Fetch latest state before pushing
    $.ajax({
        url: getApiUrl(),
        method: 'GET',
        headers: getHeaders(),
        success: function (response) {
            const remoteSha = response.sha;

            // If the SHA matches, it means nobody else has edited the file. We can just push!
            // If the SHA differs, a race condition occurred! We must merge our local changes with the new remote changes.
            let finalStateToUpload = appData;

            if (remoteSha !== fileSha) {
                console.warn("CONCURRENCY COLLISION DETECTED! Running Smart Merge...");
                const remoteContent = JSON.parse(decodeURIComponent(escape(window.atob(response.content))));

                // Smart Merge merges the two sets of data
                finalStateToUpload = mergeState(appData, remoteContent);

                // Update our local state to mirror the newly merged truth
                appData = finalStateToUpload;
                refreshUI(); // Re-render to show any remote transactions that just arrived
            }

            const contentStr = JSON.stringify(finalStateToUpload, null, 2);
            const encodedContent = window.btoa(unescape(encodeURIComponent(contentStr)));

            const data = {
                message: "Update database with Concurrency Control",
                content: encodedContent,
                sha: remoteSha
            };

            $.ajax({
                url: getApiUrl(),
                method: 'PUT',
                headers: getHeaders(),
                data: JSON.stringify(data),
                success: function (putResponse) {
                    fileSha = putResponse.content.sha;
                },
                error: function (err) {
                    if (err.status === 422) {
                        // GitHub rejects commits where the file content hasn't changed.
                        // This is perfectly fine, it means we're already perfectly in sync!
                        console.warn('Sync ignored: Cloud database is already perfectly identical to local data.');
                        return;
                    }
                    Toast.fire({ icon: 'error', title: 'Error uploading merged data!' });
                    console.error(err);
                }
            });
        },
        error: function (err) {
            Toast.fire({ icon: 'error', title: 'Error fetching latest data for concurrency check!' });
            console.error(err);
        }
    });
}

// UI Rendering
function refreshUI() {
    renderCategories();
    updateTransactionModalCategories();
    populateDashboardFilters();
    updateFilterDropdown();
    renderRulesTable();
    renderLimitsTable();
    renderBudgetsPage();
    renderTransactionsPage();
    renderDashboard(); // Replaces calculateTotals() and updates charts/insights
    renderGoals();
    renderSyncMetadata();
}

function renderSyncMetadata() {
    const formatDate = (isoString) => {
        if (!isoString) return 'Never';
        const dateObj = new Date(isoString);
        const d = String(dateObj.getDate()).padStart(2, '0');
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const y = dateObj.getFullYear();
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${d}-${m}-${y} ${timeStr}`;
    };

    const lastSyncNow = (appData.settings && appData.settings.lastSyncNowDate) ? appData.settings.lastSyncNowDate : localStorage.getItem('lastSyncNowTime');
    const lastSyncStr = lastSyncNow ? formatDate(lastSyncNow) : 'Never';
    const lastReviewedStr = appData.settings.lastSyncDate ? formatDate(appData.settings.lastSyncDate) : 'Never';
    const lastLogin = appData.settings.lastLogin ? formatDate(appData.settings.lastLogin) : 'Never';

    const unreviewedCount = appData.transactions ? appData.transactions.filter(t => t.isReviewed !== true).length : 0;

    $('#metaLastSyncNow').text(lastSyncStr);
    $('#metaLastReviewed').text(lastReviewedStr);
    $('#metaLastLogin').text(lastLogin);
    $('#metaPendingCount').text(unreviewedCount);

    // Add mark as reviewed button if there are new records
    if (unreviewedCount > 0) {
        if ($('#markReviewedBtn').length === 0) {
            $('#metaPendingCount').parent().after('<button id="markReviewedBtn" class="btn btn-sm btn-success ms-2 py-0 px-2" onclick="markAllAsReviewed()">Mark All Reviewed</button>');
        }
    } else {
        $('#markReviewedBtn').remove();
    }
}

window.markAllAsReviewed = function () {
    if (!appData.settings) appData.settings = {};
    if (appData.transactions) {
        appData.transactions.forEach(tx => tx.isReviewed = true);
    }
    appData.settings.lastSyncDate = new Date().toISOString();
    saveData();
    refreshUI();
}



// Settings: Categories
window.addCategory = function (type) {
    const inputId = type === 'expense' ? '#newExpenseCat' : '#newIncomeCat';
    const val = $(inputId).val().trim();
    const targetArr = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;

    if (!val) {
        Toast.fire({ icon: 'warning', title: 'Category name cannot be empty' });
        return;
    }

    const valLower = val.toLowerCase();
    if (targetArr.some(c => c.name.toLowerCase() === valLower)) {
        Toast.fire({ icon: 'warning', title: 'Category already exists' });
        return;
    }

    const newId = 'cat-' + type.substr(0, 3) + '-' + generateUUID();
    targetArr.push({ id: newId, name: val });
    $(inputId).val('');
    renderCategories();
    updateTransactionModalCategories();
    updateFilterDropdown();
    saveData();
    Toast.fire({ icon: 'success', title: 'Category added' });
}

window.deleteCategory = async function (type, id) {
    const name = getCategoryName(id);

    // Check for linked objects (Foreign Key Constraints)
    const linkedTxs = appData.transactions.filter(tx => tx.type === type && tx.categoryId === id);
    const hasRule = (appData.categoryRules && appData.categoryRules[id] !== undefined);
    const hasLimit = (appData.categoryLimits && appData.categoryLimits[id] !== undefined);

    if (linkedTxs.length > 0 || hasRule || hasLimit) {
        // Build options for reassigning
        const targetArr = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;
        const options = {};
        targetArr.forEach(c => {
            if (c.id !== id) {
                options[c.id] = c.name;
            }
        });

        // If there are no other categories to reassign to
        if (Object.keys(options).length === 0) {
            Toast.fire({ icon: 'warning', title: 'Create another category first to reassign linked data.' });
            return;
        }

        let usageDetails = [];
        if (linkedTxs.length > 0) usageDetails.push(`${linkedTxs.length} transaction(s)`);
        if (hasRule) usageDetails.push(`1 rule`);
        if (hasLimit) usageDetails.push(`1 budget limit`);
        const usageString = usageDetails.join(', ');

        const { value: reassignId } = await Swal.fire({
            title: 'Category in Use',
            html: `You are deleting <b>${name}</b>, which is currently used by:<br><br><span class="text-info">${usageString}</span>.<br><br>Please select a new category to move them to:`,
            input: 'select',
            inputOptions: options,
            inputPlaceholder: 'Select a category',
            showCancelButton: true,
            confirmButtonText: 'Reassign & Delete',
            confirmButtonColor: '#ef4444',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#f8fafc',
            customClass: {
                input: 'text-dark bg-white'
            },
            inputValidator: (value) => {
                return new Promise((resolve) => {
                    if (value) { resolve(); }
                    else { resolve('You need to select a category'); }
                });
            }
        });

        if (reassignId) {
            // Reassign transactions
            appData.transactions.forEach(tx => {
                if (tx.type === type && tx.categoryId === id) {
                    tx.categoryId = reassignId;
                }
            });
            // Reassign rules
            if (appData.categoryRules && appData.categoryRules[id]) {
                const oldKeywords = appData.categoryRules[id];
                const existingTargetKeywords = appData.categoryRules[reassignId] || [];

                if (existingTargetKeywords.length > 0) {
                    // Merge keywords and remove duplicates
                    appData.categoryRules[reassignId] = [...new Set([...existingTargetKeywords, ...oldKeywords])];
                } else {
                    // Just move to the new ID
                    appData.categoryRules[reassignId] = oldKeywords;
                }
                delete appData.categoryRules[id];
            }
            // Reassign limits
            if (appData.categoryLimits && appData.categoryLimits[id]) {
                const limit = appData.categoryLimits[id];
                appData.categoryLimits[reassignId] = (appData.categoryLimits[reassignId] || 0) + limit;
                delete appData.categoryLimits[id];
            }

            // Delete category
            if (type === 'expense') {
                appData.expenseCategories = appData.expenseCategories.filter(c => c.id !== id);
            } else {
                appData.incomeCategories = appData.incomeCategories.filter(c => c.id !== id);
            }

            renderCategories();
            updateTransactionModalCategories();
            updateFilterDropdown();
            refreshUI();
            saveData();
            Swal.fire({ title: 'Deleted!', text: `All linked data was reassigned to ${getCategoryName(reassignId)}.`, icon: 'success', background: 'rgba(15, 23, 42, 0.95)', color: '#f8fafc' });
        }
    } else {
        // No linked transactions, simple delete
        confirmAction('Delete Category?', `Delete category "${name}"?`, 'Yes, Delete', () => {
            if (type === 'expense') {
                appData.expenseCategories = appData.expenseCategories.filter(c => c.id !== id);
            } else {
                appData.incomeCategories = appData.incomeCategories.filter(c => c.id !== id);
            }

            // Delete rules and limits attached to this category (Should be empty due to previous checks, but safe fallback)
            if (appData.categoryRules) {
                delete appData.categoryRules[id];
            }
            if (appData.categoryLimits) {
                delete appData.categoryLimits[id];
            }

            renderCategories();
            updateTransactionModalCategories();
            updateFilterDropdown();
            refreshUI();
            saveData();
            Toast.fire({ icon: 'success', title: 'Category deleted' });
        });
    }
}

function renderCategories() {
    const expList = $('#expenseCategoriesList');
    expList.empty();
    appData.expenseCategories.forEach((cat, index) => {
        expList.append(`
            <!-- Desktop Tag -->
            <div class="category-tag d-none d-md-inline-block">
                <span class="me-2 text-truncate d-inline-block" style="max-width: 150px; vertical-align: bottom;">${escapeHTML(cat.name)}</span> 
                ${index > 0 ? `<i class="fa-solid fa-chevron-left text-secondary me-2 cursor-pointer" onclick="moveCategory('expense', '${cat.id}', -1)" title="Move Left"></i>` : ''}
                ${index < appData.expenseCategories.length - 1 ? `<i class="fa-solid fa-chevron-right text-secondary me-2 cursor-pointer" onclick="moveCategory('expense', '${cat.id}', 1)" title="Move Right"></i>` : ''}
                <i class="fa-solid fa-pen text-info me-2 cursor-pointer" onclick="editCategory('expense', '${cat.id}')" title="Edit"></i>
                <i class="fa-solid fa-xmark text-danger cursor-pointer" onclick="deleteCategory('expense', '${cat.id}')" title="Delete"></i>
            </div>
            
            <!-- Mobile List Item -->
            <div class="d-md-none w-100 d-flex justify-content-between align-items-center p-3 rounded" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);">
                <span class="text-white fw-bold">${escapeHTML(cat.name)}</span>
                <div class="dropdown">
                    <button class="btn btn-link text-white-50 p-0" data-bs-toggle="dropdown" data-bs-display="static" style="text-decoration: none;">
                        <i class="fa-solid fa-ellipsis-vertical fs-5 px-3 py-1"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark shadow-lg">
                        ${index > 0 ? `<li><a class="dropdown-item" href="javascript:void(0);" onclick="moveCategory('expense', '${cat.id}', -1)"><i class="fa-solid fa-arrow-up me-2"></i>Move Up</a></li>` : ''}
                        ${index < appData.expenseCategories.length - 1 ? `<li><a class="dropdown-item" href="javascript:void(0);" onclick="moveCategory('expense', '${cat.id}', 1)"><i class="fa-solid fa-arrow-down me-2"></i>Move Down</a></li>` : ''}
                        ${(index > 0 || index < appData.expenseCategories.length - 1) ? `<li><hr class="dropdown-divider"></li>` : ''}
                        <li><a class="dropdown-item text-info" href="javascript:void(0);" onclick="editCategory('expense', '${cat.id}')"><i class="fa-solid fa-pen me-2"></i>Edit</a></li>
                        <li><a class="dropdown-item text-danger" href="javascript:void(0);" onclick="deleteCategory('expense', '${cat.id}')"><i class="fa-solid fa-trash me-2"></i>Delete</a></li>
                    </ul>
                </div>
            </div>
        `);
    });

    const incList = $('#incomeCategoriesList');
    incList.empty();
    appData.incomeCategories.forEach((cat, index) => {
        incList.append(`
            <!-- Desktop Tag -->
            <div class="category-tag d-none d-md-inline-block">
                <span class="me-2 text-truncate d-inline-block" style="max-width: 150px; vertical-align: bottom;">${escapeHTML(cat.name)}</span> 
                ${index > 0 ? `<i class="fa-solid fa-chevron-left text-secondary me-2 cursor-pointer" onclick="moveCategory('income', '${cat.id}', -1)" title="Move Left"></i>` : ''}
                ${index < appData.incomeCategories.length - 1 ? `<i class="fa-solid fa-chevron-right text-secondary me-2 cursor-pointer" onclick="moveCategory('income', '${cat.id}', 1)" title="Move Right"></i>` : ''}
                <i class="fa-solid fa-pen text-info me-2 cursor-pointer" onclick="editCategory('income', '${cat.id}')" title="Edit"></i>
                <i class="fa-solid fa-xmark text-danger cursor-pointer" onclick="deleteCategory('income', '${cat.id}')" title="Delete"></i>
            </div>
            
            <!-- Mobile List Item -->
            <div class="d-md-none w-100 d-flex justify-content-between align-items-center p-3 rounded" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);">
                <span class="text-white fw-bold">${escapeHTML(cat.name)}</span>
                <div class="dropdown">
                    <button class="btn btn-link text-white-50 p-0" data-bs-toggle="dropdown" data-bs-display="static" style="text-decoration: none;">
                        <i class="fa-solid fa-ellipsis-vertical fs-5 px-3 py-1"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark shadow-lg">
                        ${index > 0 ? `<li><a class="dropdown-item" href="javascript:void(0);" onclick="moveCategory('income', '${cat.id}', -1)"><i class="fa-solid fa-arrow-up me-2"></i>Move Up</a></li>` : ''}
                        ${index < appData.incomeCategories.length - 1 ? `<li><a class="dropdown-item" href="javascript:void(0);" onclick="moveCategory('income', '${cat.id}', 1)"><i class="fa-solid fa-arrow-down me-2"></i>Move Down</a></li>` : ''}
                        ${(index > 0 || index < appData.incomeCategories.length - 1) ? `<li><hr class="dropdown-divider"></li>` : ''}
                        <li><a class="dropdown-item text-info" href="javascript:void(0);" onclick="editCategory('income', '${cat.id}')"><i class="fa-solid fa-pen me-2"></i>Edit</a></li>
                        <li><a class="dropdown-item text-danger" href="javascript:void(0);" onclick="deleteCategory('income', '${cat.id}')"><i class="fa-solid fa-trash me-2"></i>Delete</a></li>
                    </ul>
                </div>
            </div>
        `);
    });
}

window.moveCategory = function (type, id, direction) {
    const list = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;
    const index = list.findIndex(c => c.id === id);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[newIndex];
    list[newIndex] = temp;

    saveData();
    refreshUI();
    Toast.fire({ icon: 'success', title: 'Category order updated!' });
};

window.editCategory = async function (type, id) {
    const oldName = getCategoryName(id);
    const { value: newCat } = await Swal.fire({
        title: 'Rename Category',
        input: 'text',
        inputLabel: 'New Category Name',
        inputValue: oldName,
        showCancelButton: true,
        confirmButtonText: 'Save',
        inputValidator: (value) => {
            if (!value || value.trim() === '') {
                return 'Category name cannot be empty!';
            }
            const trimmed = value.trim();
            const exists = type === 'expense'
                ? appData.expenseCategories.some(c => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== id)
                : appData.incomeCategories.some(c => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== id);
            if (exists) {
                return 'A category with this name already exists!';
            }
        },
        heightAuto: false
    });

    if (newCat && newCat.trim() !== oldName) {
        const trimmed = newCat.trim();

        // 1. Update Category List Name
        if (type === 'expense') {
            const cat = appData.expenseCategories.find(c => c.id === id);
            if (cat) cat.name = trimmed;
        } else {
            const cat = appData.incomeCategories.find(c => c.id === id);
            if (cat) cat.name = trimmed;
        }

        // 4. Save and Refresh (No cascading transactions needed anymore!)
        renderCategories();
        updateTransactionModalCategories();
        updateFilterDropdown();
        refreshUI();
        saveData();

        Toast.fire({ icon: 'success', title: `Renamed to "${trimmed}"` });
    }
}

function updateTransactionModalCategories() {
    const type = $('input[name="txType"]:checked').val();
    const select = $('#txCategory');
    select.empty();

    const cats = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;
    cats.forEach(cat => {
        select.append(`<option value="${cat.id}">${cat.name}</option>`);
    });
}

function updateFilterDropdown() {
    const filterSelect = $('#filterCategory');
    filterSelect.empty();
    filterSelect.append('<option value="All">All Categories</option>');

    filterSelect.append('<optgroup label="Expense Categories">');
    appData.expenseCategories.forEach(cat => {
        filterSelect.append(`<option value="${cat.id}">${cat.name}</option>`);
    });
    filterSelect.append('</optgroup>');

    filterSelect.append('<optgroup label="Income Categories">');
    appData.incomeCategories.forEach(cat => {
        filterSelect.append(`<option value="${cat.id}">${cat.name}</option>`);
    });
    filterSelect.append('</optgroup>');

    // Also populate the rules category dropdown
    const ruleSelect = $('#ruleCategory');
    ruleSelect.empty();
    ruleSelect.append('<optgroup label="Expense Categories">');
    appData.expenseCategories.forEach(cat => {
        ruleSelect.append(`<option value="${cat.id}">${cat.name}</option>`);
    });
    ruleSelect.append('</optgroup>');
    ruleSelect.append('<optgroup label="Income Categories">');
    appData.incomeCategories.forEach(cat => {
        ruleSelect.append(`<option value="${cat.id}">${cat.name}</option>`);
    });
    ruleSelect.append('</optgroup>');

    // Populate limit category dropdown (expenses only)
    const limitSelect = $('#limitCategory');
    limitSelect.empty();
    limitSelect.append('<option value="" disabled selected>Select Category</option>');
    appData.expenseCategories.forEach(cat => {
        limitSelect.append(`<option value="${cat.id}">${cat.name}</option>`);
    });
}

// Settings: Rules
function renderRulesTable() {
    const tbody = $('#rulesTableBody');
    tbody.empty();

    if (!appData.categoryRules || Object.keys(appData.categoryRules).length === 0) {
        tbody.append(`<div class="text-center py-3 text-muted w-100">No rules defined.</div>`);
        return;
    }

    Object.keys(appData.categoryRules).forEach((categoryId) => {
        const keywords = appData.categoryRules[categoryId];
        const catName = getCategoryName(categoryId);
        tbody.append(`
            <div class="d-flex justify-content-between align-items-center p-3 rounded-3 mb-2 shadow-sm" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);">
                <div class="d-flex align-items-center gap-3 overflow-hidden pe-2">
                    <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 40px; height: 40px; background: rgba(255,255,255,0.05);">
                        <i class="fa-solid fa-wand-magic-sparkles text-info"></i>
                    </div>
                    <div class="overflow-hidden w-100" style="min-width: 0;">
                        <h6 class="fw-bold mb-1 text-white text-truncate w-100">${escapeHTML(catName)}</h6>
                        <small class="text-white-50 d-block text-truncate w-100">${escapeHTML(keywords.join(', '))}</small>
                    </div>
                </div>
                <div class="flex-shrink-0 d-flex gap-2">
                    <button class="btn btn-sm btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center p-0" style="width: 32px; height: 32px;" onclick="editRule('${categoryId}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-outline-danger rounded-circle d-flex align-items-center justify-content-center p-0" style="width: 32px; height: 32px;" onclick="deleteRule('${categoryId}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `);
    });
}

window.editRule = async function (categoryId) {
    const keywords = appData.categoryRules[categoryId];
    const catName = getCategoryName(categoryId);
    
    const { value: newKeywords } = await Swal.fire({
        title: `Edit Rule: ${catName}`,
        input: 'text',
        inputValue: keywords.join(', '),
        inputPlaceholder: 'Keywords separated by comma',
        showCancelButton: true,
        confirmButtonText: 'Save',
        confirmButtonColor: '#10b981',
        background: '#1e293b',
        color: '#f8fafc',
        heightAuto: false
    });

    if (newKeywords !== undefined) {
        const processed = newKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
        if (processed.length > 0) {
            appData.categoryRules[categoryId] = [...new Set(processed)];
            renderRulesTable();
            saveData();
            Toast.fire({ icon: 'success', title: 'Rule updated' });
        } else {
            Toast.fire({ icon: 'warning', title: 'Keywords cannot be empty' });
        }
    }
}

window.deleteRule = function (categoryId) {
    confirmAction('Delete Rule?', 'Are you sure you want to delete this auto-categorization rule?', 'Yes, Delete', () => {
        delete appData.categoryRules[categoryId];
        renderRulesTable();
        saveData();
        Toast.fire({ icon: 'success', title: 'Rule deleted' });
    });
}

// Settings: Limits
function renderLimitsTable() {
    const tbody = $('#limitsTableBody');
    tbody.empty();

    if (!appData.categoryLimits || Object.keys(appData.categoryLimits).length === 0) {
        tbody.append(`<div class="text-center py-3 text-muted w-100">No limits defined.</div>`);
        return;
    }

    Object.keys(appData.categoryLimits).forEach(catId => {
        const catName = getCategoryName(catId);
        tbody.append(`
            <div class="d-flex justify-content-between align-items-center p-3 rounded-3 mb-2 shadow-sm" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);">
                <div class="d-flex align-items-center gap-3 overflow-hidden pe-2">
                    <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 40px; height: 40px; background: rgba(255,255,255,0.05);">
                        <i class="fa-solid fa-tags text-warning"></i>
                    </div>
                    <div class="overflow-hidden w-100" style="min-width: 0;">
                        <h6 class="fw-bold mb-1 text-white text-truncate w-100">${escapeHTML(catName)}</h6>
                        <span class="text-warning fw-bold small">AED ${parseFloat(appData.categoryLimits[catId]).toFixed(2)}</span>
                    </div>
                </div>
                <div class="flex-shrink-0 d-flex gap-2">
                    <button class="btn btn-sm btn-outline-secondary rounded-circle d-flex align-items-center justify-content-center p-0" style="width: 32px; height: 32px;" onclick="editLimit('${catId}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-sm btn-outline-danger rounded-circle d-flex align-items-center justify-content-center p-0" style="width: 32px; height: 32px;" onclick="deleteLimit('${catId}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        `);
    });
}

window.editLimit = async function (catId) {
    const limit = appData.categoryLimits[catId];
    const catName = getCategoryName(catId);
    
    const { value: newLimit } = await Swal.fire({
        title: `Edit Limit: ${catName}`,
        input: 'number',
        inputValue: limit,
        inputAttributes: { min: 1, step: 1 },
        showCancelButton: true,
        confirmButtonText: 'Save',
        confirmButtonColor: '#10b981',
        background: '#1e293b',
        color: '#f8fafc',
        heightAuto: false
    });

    if (newLimit !== undefined) {
        if (!isNaN(newLimit) && newLimit > 0) {
            appData.categoryLimits[catId] = parseFloat(newLimit);
            renderLimitsTable();
            saveData();
            Toast.fire({ icon: 'success', title: 'Limit updated' });
        } else {
            Toast.fire({ icon: 'warning', title: 'Invalid amount' });
        }
    }
}

window.deleteLimit = function (catId) {
    const name = getCategoryName(catId);
    confirmAction('Delete Limit?', `Are you sure you want to delete the limit for ${name}?`, 'Yes, Delete', () => {
        delete appData.categoryLimits[catId];
        renderLimitsTable();
        saveData();
        Toast.fire({ icon: 'success', title: 'Limit deleted' });
    });
}

// Dashboard: Top 5 Recent
function renderRecentTransactions() {
    const tbody = $('#recentTransactionsBody');
    tbody.empty();

    const sorted = [...appData.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const top5 = sorted.slice(0, 5);

    if (top5.length === 0) {
        tbody.append(`<tr><td colspan="3" class="text-center py-4 text-muted">No transactions yet.</td></tr>`);
        return;
    }

    top5.forEach(tx => {
        const dateObj = new Date(tx.date);
        const formattedDate = dateObj.toLocaleDateString();
        const amtColor = tx.type === 'income' ? 'text-income' : '';
        const amtPrefix = tx.type === 'income' ? '+' : '-';
        const catName = getCategoryName(tx.categoryId);

        tbody.append(`
            <tr>
                <td class="text-nowrap">${formattedDate}</td>
                <td class="fw-bold text-truncate" style="max-width: 150px;">
                    ${escapeHTML(tx.merchant)} <br>
                    <span class="category-badge mt-1 d-inline-block text-truncate" style="max-width: 130px;">${escapeHTML(catName)}</span>
                </td>
                <td class="fw-bold text-nowrap ${amtColor}">${amtPrefix} AED ${tx.amount}</td>
            </tr>
        `);
    });
}

window.exportTransactionsToCSV = function () {
    const txs = window.currentFilteredTransactions || appData.transactions;
    if (txs.length === 0) {
        Toast.fire({ icon: 'info', title: 'No transactions to export' });
        return;
    }

    let csvContent = "Date,Merchant,Type,Category,Amount\n";

    txs.forEach(tx => {
        const date = tx.date;
        const merchant = `"${(tx.merchant || '').replace(/"/g, '""')}"`;
        const type = tx.type;
        const catName = getCategoryName(tx.categoryId);
        const category = `"${(catName || '').replace(/"/g, '""')}"`;
        const amount = tx.amount;

        csvContent += `${date},${merchant},${type},${category},${amount}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Toast.fire({ icon: 'success', title: 'Exported to CSV successfully' });
};

// Transactions Page: Full List
window.renderTransactionsPage = function () {
    const tbody = $('#transactionsTableBody');
    const pagination = $('#transactionsPagination');
    const totalEl = $('#transactionsTableTotal');
    const infoEl = $('#paginationInfo');
    tbody.empty();
    pagination.empty();

    const searchQuery = $('#searchTx').val().toLowerCase();
    const filterCat = $('#filterCategory').val();
    const filterType = $('#filterType').val();
    const filterStartDate = $('#filterStartDate').val();
    const filterEndDate = $('#filterEndDate').val();
    const filterUnreviewedOnly = $('#filterUnreviewedOnly').is(':checked');

    let filteredTotal = 0;
    let filtered = appData.transactions.filter(tx => {
        const matchesSearch = tx.merchant.toLowerCase().includes(searchQuery);
        const matchesCat = (filterCat === 'All' || !filterCat) ? true : tx.categoryId === filterCat;
        const matchesType = (filterType === 'All' || !filterType) ? true : tx.type === filterType;
        const matchesReview = filterUnreviewedOnly ? tx.isReviewed !== true : true;

        let matchesDate = true;
        if (filterStartDate || filterEndDate) {
            const txDate = new Date(tx.date);
            if (!isNaN(txDate.getTime())) {
                const localDateStr = txDate.getFullYear() + '-' +
                    String(txDate.getMonth() + 1).padStart(2, '0') + '-' +
                    String(txDate.getDate()).padStart(2, '0');

                if (filterStartDate && localDateStr < filterStartDate) matchesDate = false;
                if (filterEndDate && localDateStr > filterEndDate) matchesDate = false;
            } else {
                matchesDate = false; // Invalid dates don't match date filters
            }
        }

        const isMatch = matchesSearch && matchesCat && matchesType && matchesDate && matchesReview;

        // Calculate dynamic total
        if (isMatch) {
            const amt = parseFloat(tx.amount);
            if (tx.type === 'income') filteredTotal += amt;
            else filteredTotal -= amt;
        }

        return isMatch;
    });

    filtered.sort((a, b) => {
        if (currentSortCol === 'date') {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            return currentSortDir === 'desc' ? timeB - timeA : timeA - timeB;
        } else if (currentSortCol === 'amount') {
            const amtA = parseFloat(a.amount);
            const amtB = parseFloat(b.amount);
            return currentSortDir === 'desc' ? amtB - amtA : amtA - amtB;
        }
        return 0;
    });

    window.currentFilteredTransactions = filtered;

    // Update Header Icons
    $('#sortDateBtn').html(`Date <i class="fa-solid fa-sort${currentSortCol === 'date' ? (currentSortDir === 'desc' ? '-down' : '-up') : ''} ms-1 ${currentSortCol !== 'date' ? 'text-muted' : ''}"></i>`);
    $('#sortAmountBtn').html(`Amount (AED) <i class="fa-solid fa-sort${currentSortCol === 'amount' ? (currentSortDir === 'desc' ? '-down' : '-up') : ''} ms-1 ${currentSortCol !== 'amount' ? 'text-muted' : ''}"></i>`);

    // Update Footer Total
    const totalColor = filteredTotal >= 0 ? 'text-income' : 'text-expense';
    const totalPrefix = filteredTotal >= 0 ? '+' : '-';
    totalEl.html(`<span class="${totalColor}">${totalPrefix} AED ${Math.abs(filteredTotal).toFixed(2)}</span>`);

    if (filtered.length === 0) {
        tbody.append(`<tr><td colspan="6" class="text-center py-4 text-muted">No transactions found.</td></tr>`);
        infoEl.text('Showing 0 to 0 of 0 entries');
        return;
    }

    // Pagination Logic
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / rowsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalItems);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    // Update Info Text
    infoEl.text(`Showing ${startIndex + 1} to ${endIndex} of ${totalItems} entries`);

    paginatedItems.forEach(tx => {
        const dateObj = new Date(tx.date);
        const d = dateObj.getDate().toString().padStart(2, '0');
        const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const y = dateObj.getFullYear();
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const formattedDate = `${d}-${m}-${y} ${timeStr}`;
        const amtColor = tx.type === 'income' ? 'text-income' : '';
        const amtPrefix = tx.type === 'income' ? '+' : '-';
        const typeBadgeClass = tx.type === 'income' ? 'bg-success' : 'bg-danger';
        const catName = getCategoryName(tx.categoryId);

        const isNew = tx.isReviewed !== true;
        const newBadge = isNew ? `<span class="badge bg-info text-dark ms-2" style="font-size: 0.65em; vertical-align: middle;">NEW</span>` : '';

        tbody.append(`
            <tr ${isNew ? 'style="background: rgba(13, 202, 240, 0.05);"' : ''}>
                <!-- Desktop View (Hidden on Mobile) -->
                <td class="d-none d-md-table-cell text-nowrap">${formattedDate}${newBadge}</td>
                <td class="d-none d-md-table-cell fw-bold text-truncate" style="max-width: 180px;" title="${escapeHTML(tx.merchant)}">${escapeHTML(tx.merchant)}</td>
                <td class="d-none d-md-table-cell"><span class="badge ${typeBadgeClass} text-uppercase">${tx.type}</span></td>
                <td class="d-none d-md-table-cell"><span class="category-badge text-truncate d-inline-block" style="max-width: 120px;" title="${escapeHTML(catName)}">${escapeHTML(catName)}</span></td>
                <td class="d-none d-md-table-cell fw-bold text-nowrap ${amtColor}">${amtPrefix} AED ${tx.amount}</td>
                <td class="d-none d-md-table-cell text-nowrap">
                    ${isNew ? `<button class="btn-action text-success" style="font-size: 1.25rem; padding: 8px 12px;" onclick="markTransactionAsReviewed('${tx.id}')" title="Mark as Reviewed"><i class="fa-solid fa-check-double"></i></button>` : ''}
                    <button class="btn-action" onclick="editTransaction('${tx.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action delete" onclick="deleteTransaction('${tx.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </td>

                <!-- Mobile View (Hidden on Desktop) -->
                <td class="d-md-none p-0 w-100 border-0">
                    <div class="swipe-row-wrapper">
                        ${isNew ? `
                        <div class="swipe-actions-left">
                            <button class="swipe-action-btn swipe-action-review" onclick="markTransactionAsReviewed('${tx.id}')"><i class="fa-solid fa-check-double"></i></button>
                        </div>
                        ` : ''}
                        <div class="swipe-actions-right">
                            <button class="swipe-action-btn swipe-action-edit" onclick="editTransaction('${tx.id}')"><i class="fa-solid fa-pen"></i></button>
                            <button class="swipe-action-btn swipe-action-delete" onclick="deleteTransaction('${tx.id}')"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <div class="swipe-content p-3 d-flex align-items-center justify-content-between w-100" style="min-width: 0;">
                            <div class="d-flex align-items-center overflow-hidden flex-grow-1" style="min-width: 0;">
                                <div class="overflow-hidden pe-2 w-100" style="min-width: 0;">
                                    <h6 class="mb-0 fw-bold text-truncate w-100">${escapeHTML(tx.merchant)}</h6>
                                    <small class="text-white-50 d-block text-truncate w-100">${escapeHTML(catName)} • ${formattedDate.split(' ')[0]}</small>
                                </div>
                            </div>
                            <div class="text-end flex-shrink-0 d-flex align-items-center gap-2">
                                <div class="d-flex flex-column align-items-end">
                                    <h6 class="mb-0 fw-bold ${amtColor}">${amtPrefix} AED ${Math.abs(tx.amount).toFixed(2)}</h6>
                                    ${isNew ? `<span class="badge bg-info text-dark mt-1" style="font-size: 0.55rem; padding: 0.25em 0.5em;">NEW</span>` : ''}
                                </div>
                                ${isNew ? `<button class="btn btn-sm text-success p-0 flex-shrink-0 d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; background: rgba(25, 135, 84, 0.1); border-radius: 50%;" onclick="markTransactionAsReviewed('${tx.id}')"><i class="fa-solid fa-check"></i></button>` : ''}
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `);
    });

    // Render Pagination Buttons
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';

    pagination.append(`
        <li class="page-item ${prevDisabled}">
            <a class="page-link" href="javascript:void(0)" onclick="changePage(1)" title="First Page"><i class="fa-solid fa-angles-left"></i></a>
        </li>
        <li class="page-item ${prevDisabled}">
            <a class="page-link" href="javascript:void(0)" onclick="changePage(${currentPage - 1})">Previous</a>
        </li>
    `);

    // Dynamic page numbers (simplified to show all for small arrays, or ellipsis logic for large arrays. Keeping simple here)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        pagination.append(`
            <li class="page-item ${activeClass}">
                <a class="page-link" href="javascript:void(0)" onclick="changePage(${i})">${i}</a>
            </li>
        `);
    }

    pagination.append(`
        <li class="page-item ${nextDisabled}">
            <a class="page-link" href="javascript:void(0)" onclick="changePage(${currentPage + 1})">Next</a>
        </li>
        <li class="page-item ${nextDisabled}">
            <a class="page-link" href="javascript:void(0)" onclick="changePage(${totalPages})" title="Last Page"><i class="fa-solid fa-angles-right"></i></a>
        </li>
    `);
}

window.changePage = function (page) {
    currentPage = page;
    renderTransactionsPage();
}

function populateDashboardFilters() {
    const yearSelector = $('#dashYearFilter');
    const monthSelector = $('#dashMonthFilter');

    // Extract unique years and months from transactions
    const years = new Set();
    const monthsData = {}; // Format: { "2026": new Set(["01", "05"]) }

    if (appData.transactions && appData.transactions.length > 0) {
        appData.transactions.forEach(tx => {
            const d = new Date(tx.date);
            const y = d.getFullYear().toString();
            const m = String(d.getMonth() + 1).padStart(2, '0');

            years.add(y);
            if (!monthsData[y]) monthsData[y] = new Set();
            monthsData[y].add(m);
        });
    } else {
        const currentY = new Date().getFullYear().toString();
        years.add(currentY);
        monthsData[currentY] = new Set();
    }

    // Populate Year Selector
    const sortedYears = Array.from(years).sort().reverse();
    yearSelector.empty();
    sortedYears.forEach(y => {
        yearSelector.append(`<option value="${y}">${y}</option>`);
    });

    // Set Year State
    if (!currentDashYear) {
        const currentY = new Date().getFullYear().toString();
        if (sortedYears.includes(currentY)) {
            currentDashYear = currentY;
        } else {
            currentDashYear = sortedYears[0] || '';
        }
    } else if (!sortedYears.includes(currentDashYear)) {
        currentDashYear = sortedYears[0] || '';
    }
    yearSelector.val(currentDashYear);

    // Attach monthsData to global scope for easy access by month updater
    window.dashboardMonthsData = monthsData;

    updateDashMonthFilter();
}

function updateDashMonthFilter() {
    const monthSelector = $('#dashMonthFilter');
    monthSelector.empty();
    monthSelector.append('<option value="">All Year</option>');

    if (window.dashboardMonthsData && window.dashboardMonthsData[currentDashYear]) {
        const sortedMonths = Array.from(window.dashboardMonthsData[currentDashYear]).sort();
        sortedMonths.forEach(m => {
            const dateObj = new Date(currentDashYear, parseInt(m) - 1, 1);
            const display = dateObj.toLocaleString('default', { month: 'long' });
            monthSelector.append(`<option value="${m}">${display}</option>`);
        });
    }

    if (!currentDashMonth) {
        const currentM = String(new Date().getMonth() + 1).padStart(2, '0');
        if (monthSelector.find(`option[value="${currentM}"]`).length > 0) {
            currentDashMonth = currentM;
        } else {
            currentDashMonth = '';
        }
    } else if (monthSelector.find(`option[value="${currentDashMonth}"]`).length === 0) {
        currentDashMonth = '';
    }
    monthSelector.val(currentDashMonth);
}

function getFilteredDashboardTransactions() {
    if (!currentDashYear) return [];

    return appData.transactions.filter(tx => {
        const d = new Date(tx.date);
        const y = d.getFullYear().toString();
        const m = String(d.getMonth() + 1).padStart(2, '0');

        if (y !== currentDashYear) return false;
        if (currentDashMonth && m !== currentDashMonth) return false;

        return true;
    });
}

function updateDashboardGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Good Evening';
    if (hour < 12) greeting = 'Good Morning';
    else if (hour < 18) greeting = 'Good Afternoon';

    let username = '';
    if (ghRepo) {
        username = ghRepo.split('/')[0];
        // Capitalize first letter safely
        if (username.length > 0) {
            username = username.charAt(0).toUpperCase() + username.slice(1);
        }
    }

    if (username) {
        $('#dashboardGreeting').text(`${greeting}, ${username}!`);
    } else {
        $('#dashboardGreeting').text(`${greeting}!`);
    }
}

function renderDashboard() {
    updateDashboardGreeting();
    const filteredTx = getFilteredDashboardTransactions();

    let income = 0;
    let expense = 0;
    // Calculate timeframe specific income and expense
    filteredTx.forEach(tx => {
        const amt = parseFloat(tx.amount);
        if (tx.type === 'income') income += amt;
        else expense += amt;
    });

    const timeframeBalance = income - expense;
    const savingsRate = income > 0 ? (((income - expense) / income) * 100).toFixed(1) : 0;

    renderDashboardAnalytics(filteredTx, expense);

    $('.dashBalanceVal').text(`AED ${timeframeBalance.toFixed(2)}`);
    $('.dashIncomeVal').text(`AED ${income.toFixed(2)}`);
    $('.dashExpenseVal').text(`AED ${expense.toFixed(2)}`);
    $('.dashSavingsRateVal').text(`${savingsRate}%`);

    // Render Category Summary Table
    let catUsage = {};
    let catMerchantUsage = {};

    if (appData.expenseCategories) {
        appData.expenseCategories.forEach(cat => {
            catUsage[cat.id] = 0;
            catMerchantUsage[cat.id] = {};
        });
    }

    filteredTx.forEach(tx => {
        if (tx.type === 'expense') {
            if (catUsage[tx.categoryId] !== undefined) {
                catUsage[tx.categoryId] += parseFloat(tx.amount);
            } else {
                catUsage[tx.categoryId] = parseFloat(tx.amount);
            }

            if (!catMerchantUsage[tx.categoryId]) catMerchantUsage[tx.categoryId] = {};
            let mName = tx.merchant.trim() || 'Unknown';
            if (catMerchantUsage[tx.categoryId][mName]) {
                catMerchantUsage[tx.categoryId][mName] += parseFloat(tx.amount);
            } else {
                catMerchantUsage[tx.categoryId][mName] = parseFloat(tx.amount);
            }
        }
    });

    const tbody = $('#dashboardCategoryTableBody');
    tbody.empty();

    if (Object.keys(catUsage).length === 0) {
        tbody.html('<tr><td colspan="5" class="text-center py-5" style="background: transparent !important; position: static !important; border-bottom: none;"><div class="text-white-50"><i class="fa-solid fa-folder-open fa-3x mb-3 opacity-25"></i><h6 class="fw-bold">No Categories Active</h6><p class="small mb-0">You have no expenses recorded for this month.</p></div></td></tr>');
        return;
    }

    let totalLimit = 0;
    let totalSpent = 0;

    Object.keys(catUsage).forEach(catId => {
        const spent = catUsage[catId];
        const catName = getCategoryName(catId);
        let limit = 0;
        if (appData.categoryLimits && appData.categoryLimits[catId]) {
            limit = parseFloat(appData.categoryLimits[catId]);
        }

        totalLimit += limit;
        totalSpent += spent;

        let limitDisplay = limit > 0 ? `AED ${limit.toFixed(2)}` : `<span class="text-white-50 small">No Limit</span>`;
        let remainingDisplay = '-';
        let statusDisplay = '';

        if (limit > 0) {
            const remaining = limit - spent;
            const pct = (spent / limit) * 100;

            if (remaining < 0) {
                remainingDisplay = `<span class="text-danger fw-bold">- AED ${Math.abs(remaining).toFixed(2)}</span>`;
            } else {
                remainingDisplay = `<span class="text-success fw-bold">AED ${remaining.toFixed(2)}</span>`;
            }

            if (pct >= 100) statusDisplay = `<span class="badge bg-danger bg-opacity-25 border border-danger text-danger">Over Budget</span>`;
            else if (pct >= 80) statusDisplay = `<span class="badge bg-warning bg-opacity-25 border border-warning text-warning">Near Limit</span>`;
            else statusDisplay = `<span class="badge bg-success bg-opacity-25 border border-success text-success">Good</span>`;
        } else {
            statusDisplay = `<span class="text-white-50">-</span>`;
        }

        let topMerchantDisplay = '';
        if (catMerchantUsage[catId] && Object.keys(catMerchantUsage[catId]).length > 0) {
            let topMerchant = Object.keys(catMerchantUsage[catId]).reduce((a, b) => catMerchantUsage[catId][a] > catMerchantUsage[catId][b] ? a : b);
            let topAmt = catMerchantUsage[catId][topMerchant];
            topMerchantDisplay = `<div class="mt-1 fw-bold" style="color: #c084fc; font-size: 0.85rem;"><i class="fa-solid fa-crown text-warning me-1"></i>Top: ${escapeHTML(topMerchant)} (AED ${topAmt.toFixed(2)})</div>`;
        }

        tbody.append(`
            <tr>
                <td>
                    <span class="fw-bold"><i class="fa-solid fa-tag me-2 text-primary opacity-75"></i>${catName}</span>
                    ${topMerchantDisplay}
                </td>
                <td class="text-end text-white-50">${limitDisplay}</td>
                <td class="text-end fw-bold text-white">AED ${spent.toFixed(2)}</td>
                <td class="text-end">${remainingDisplay}</td>
                <td class="text-end">${statusDisplay}</td>
            </tr>
        `);
    });

    let totalRemaining = totalLimit - totalSpent;
    let totalRemainingDisplay = '-';

    if (totalLimit > 0) {
        if (totalRemaining < 0) {
            totalRemainingDisplay = `<span class="text-danger fw-bold">- AED ${Math.abs(totalRemaining).toFixed(2)}</span>`;
        } else {
            totalRemainingDisplay = `<span class="text-success fw-bold">AED ${totalRemaining.toFixed(2)}</span>`;
        }
    }

    let mathString = `${income.toFixed(2)} - ${expense.toFixed(2)} =`;
    let exactBalanceDisplay = timeframeBalance < 0
        ? `<span class="text-white-50">${mathString}</span> <br><span class="text-danger fw-bold">-AED ${Math.abs(timeframeBalance).toFixed(2)}</span>`
        : `<span class="text-white-50">${mathString}</span> <br><span class="text-success fw-bold">AED ${timeframeBalance.toFixed(2)}</span>`;

    tbody.append(`
        <tr style="background: rgba(255,255,255,0.05);">
            <td><span class="fw-bold text-white">TOTAL</span></td>
            <td class="text-end fw-bold text-info">AED ${totalLimit.toFixed(2)}</td>
            <td class="text-end fw-bold text-white">AED ${totalSpent.toFixed(2)}</td>
            <td class="text-end">${totalRemainingDisplay}</td>
            <td class="text-end">
                <div class="small text-white-50 mb-1">Exact Balance</div>
                ${exactBalanceDisplay}
            </td>
        </tr>
    `);

    renderYearlyChart();
    renderExpensePieChart();
}

function renderExpensePieChart() {
    if (!currentDashMonth || !currentDashYear) return;

    const ctx = document.getElementById('expensePieChart');
    if (!ctx) return;

    // Calculate category totals for the current month
    let catTotals = {};
    appData.transactions.forEach(tx => {
        if (tx.type === 'expense') {
            const dateObj = new Date(tx.date);
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const y = dateObj.getFullYear().toString();

            if (m === currentDashMonth && y === currentDashYear) {
                catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + parseFloat(tx.amount);
            }
        }
    });
    // Sort keys by custom category order
    const sortedKeys = Object.keys(catTotals).sort((a, b) => {
        let idxA = appData.expenseCategories.findIndex(c => c.id === a);
        let idxB = appData.expenseCategories.findIndex(c => c.id === b);
        if (idxA === -1) idxA = 9999;
        if (idxB === -1) idxB = 9999;
        return idxA - idxB;
    });

    const labels = sortedKeys.map(id => getCategoryName(id));
    const data = sortedKeys.map(id => catTotals[id]);

    if (expensePieChartInstance) {
        expensePieChartInstance.destroy();
    }

    // Default colors for pie slices
    const colors = [
        'rgba(59, 130, 246, 0.8)', // blue
        'rgba(16, 185, 129, 0.8)', // emerald
        'rgba(239, 68, 68, 0.8)',  // red
        'rgba(245, 158, 11, 0.8)', // amber
        'rgba(139, 92, 246, 0.8)', // violet
        'rgba(236, 72, 153, 0.8)', // pink
        'rgba(14, 165, 233, 0.8)', // sky
        'rgba(20, 184, 166, 0.8)'  // teal
    ];

    expensePieChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.length > 0 ? labels : ['No Expenses Yet'],
            datasets: [{
                data: data.length > 0 ? data : [1],
                backgroundColor: data.length > 0 ? colors.slice(0, data.length) : ['rgba(128,128,128,0.2)'],
                borderWidth: data.length > 0 ? 1 : 0,
                borderColor: 'var(--glass-border)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#ffffff',
                        font: { size: window.innerWidth <= 768 ? 11 : 12, family: "'Inter', sans-serif" },
                        padding: window.innerWidth <= 768 ? 10 : 15,
                        boxWidth: 15,
                        generateLabels: (chart) => {
                            const datasets = chart.data.datasets;
                            return chart.data.labels.map((label, i) => {
                                const ds = datasets[0];
                                const value = ds.data[i];

                                let sum = 0;
                                ds.data.forEach(d => sum += d);
                                const pctNum = sum > 0 ? (value * 100 / sum) : 0;
                                const pct = pctNum.toFixed(0) + '%';

                                // Truncate very long category names on mobile
                                let shortLabel = label;
                                if (window.innerWidth <= 768 && shortLabel.length > 15) {
                                    shortLabel = shortLabel.substring(0, 15) + '...';
                                }

                                const text = (ds.data.length === 1 && label === 'No Expenses Yet')
                                    ? 'No Expenses Recorded'
                                    : `${shortLabel}: AED ${value.toFixed(0)} (${pct})`;

                                return {
                                    text: text,
                                    fillStyle: ds.backgroundColor[i],
                                    fontColor: '#ffffff',
                                    hidden: false,
                                    index: i
                                };
                            });
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            if (data.length === 0) return 'No expenses this month';
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) {
                                label += 'AED ' + context.parsed.toFixed(2);
                            }
                            return label;
                        }
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 11 },
                    formatter: (value, ctx) => {
                        if (data.length === 0) return '';
                        let sum = 0;
                        let dataArr = ctx.chart.data.datasets[0].data;
                        dataArr.map(data => { sum += data; });
                        let pctNum = (value * 100 / sum);
                        // Hide label if less than 5% to prevent messy overlapping on small screens
                        if (pctNum < 5) return "";
                        return pctNum.toFixed(0) + "%";
                    }
                }
            },
            cutout: '55%'
        },
        plugins: [ChartDataLabels]
    });
}

function renderYearlyChart() {
    if (!currentDashYear) return;

    const ctx = document.getElementById('yearlyChart');
    if (!ctx) return;

    // Arrays for 12 months (Jan-Dec)
    const monthlyIncome = new Array(12).fill(0);
    const monthlyExpense = new Array(12).fill(0);
    const monthlyBalance = new Array(12).fill(0);

    // Process transactions for the selected year
    if (appData.transactions) {
        appData.transactions.forEach(tx => {
            const d = new Date(tx.date);
            if (d.getFullYear().toString() === currentDashYear) {
                const monthIndex = d.getMonth(); // 0 to 11
                const amt = parseFloat(tx.amount);

                if (tx.type === 'income') {
                    monthlyIncome[monthIndex] += amt;
                } else if (tx.type === 'expense') {
                    monthlyExpense[monthIndex] += amt;
                }
            }
        });
    }

    // Calculate net balance for each month
    for (let i = 0; i < 12; i++) {
        monthlyBalance[i] = monthlyIncome[i] - monthlyExpense[i];
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const labels = [];

    for (let i = 0; i < 12; i++) {
        let bal = monthlyBalance[i];
        let balStr = '';
        if (bal !== 0) {
            if (Math.abs(bal) >= 1000) {
                balStr = (bal / 1000).toFixed(1) + 'k';
            } else {
                balStr = bal.toFixed(0);
            }
            balStr = (bal > 0 ? '+' : '') + balStr;
        } else {
            balStr = '-';
        }
        labels.push([monthNames[i], balStr]);
    }
    if (yearlyChartInstance) {
        yearlyChartInstance.destroy();
    }

    yearlyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Net Balance',
                    data: monthlyBalance,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    order: 0,
                    datalabels: {
                        display: false
                    }
                },
                {
                    type: 'bar',
                    label: 'Income',
                    data: monthlyIncome,
                    backgroundColor: 'rgba(34, 197, 94, 0.7)',
                    borderRadius: 4,
                    order: 1
                },
                {
                    type: 'bar',
                    label: 'Expense',
                    data: monthlyExpense,
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderRadius: 4,
                    order: 2
                }
            ]
        },
        plugins: [ChartDataLabels],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    color: 'rgba(255, 255, 255, 0.9)',
                    font: {
                        weight: 'bold',
                        size: 10
                    },
                    formatter: function (value) {
                        if (value === 0) return '';
                        if (Math.abs(value) >= 1000) {
                            return (value / 1000).toFixed(1) + 'k';
                        }
                        return value.toFixed(0);
                    }
                },
                legend: {
                    labels: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += 'AED ' + context.parsed.y.toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    },
                    suggestedMax: 100,
                    suggestedMin: 0
                }
            }
        }
    });
}

window.editTransaction = function (id) {
    const tx = appData.transactions.find(t => t.id === id);
    if (tx) {
        $('#txId').val(tx.id);

        const fp = document.querySelector('#txDate')._flatpickr;
        if (fp) {
            fp.setDate(new Date(tx.date));
        } else {
            $('#txDate').val(tx.date);
        }

        $('#txMerchant').val(tx.merchant);
        $('#txAmount').val(tx.amount);

        // Select type toggle and trigger change to load correct categories
        if (tx.type === 'income') {
            $('#typeIncome').prop('checked', true);
        } else {
            $('#typeExpense').prop('checked', true);
        }
        updateTransactionModalCategories();

        $('#txCategory').val(tx.categoryId);
        $('#transactionModalTitle').text('Edit Transaction');
        
        // Show and wire up delete button
        const deleteBtn = $('#deleteModalBtn');
        deleteBtn.removeClass('d-none');
        deleteBtn.off('click').on('click', function() {
            $('#addTransactionModal').modal('hide');
            deleteTransaction(id);
        });

        $('#addTransactionModal').modal('show');
    }
}

window.markTransactionAsReviewed = function (id) {
    const tx = appData.transactions.find(t => t.id === id);
    if (tx) {
        tx.isReviewed = true;
        refreshUI();
        saveData();
        Toast.fire({ icon: 'success', title: 'Marked as reviewed' });
    }
};

window.deleteTransaction = function (id) {
    confirmAction('Delete Transaction?', 'Are you sure you want to delete this record?', 'Yes, Delete', () => {
        appData.transactions = appData.transactions.filter(t => t.id !== id);
        saveData();
        renderTransactionsPage();
        renderRecentTransactions();
        refreshUI();
        
        if (typeof window.triggerHaptic === 'function') {
            window.triggerHaptic('heavy');
        }
        
        Toast.fire({ icon: 'success', title: 'Transaction deleted' });
    });
};

// Initialize modal state on open
$('#addTransactionModal').on('show.bs.modal', function () {
    if (!$('#txId').val()) { // Only set to current time if creating a new record
        const fp = document.querySelector('#txDate')._flatpickr;
        if (fp) fp.setDate(new Date());
    }
});

// Reset modal on close
$('#addTransactionModal').on('hidden.bs.modal', function () {
    $('#transactionForm')[0].reset();
    $('#txId').val('');
    $('#typeExpense').prop('checked', true);
    updateTransactionModalCategories();
    $('#transactionModalTitle').text('Add Transaction');
    $('#deleteModalBtn').addClass('d-none').off('click');
});

// Budgets Page Logic
window.renderBudgetsPage = function () {
    const container = $('#budgetsListContainer');
    container.empty();

    if (!appData.categoryLimits || Object.keys(appData.categoryLimits).length === 0) {
        container.html(`<div class="col-12"><div class="alert alert-info bg-transparent border-info text-info"><i class="fa-solid fa-circle-info me-2"></i>You haven't set any category limits yet. Go to Settings to create your first budget!</div></div>`);
        return;
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate usage
    let usage = {};
    Object.keys(appData.categoryLimits).forEach(cat => usage[cat] = 0);

    appData.transactions.forEach(tx => {
        if (tx.type === 'expense') {
            const dateObj = new Date(tx.date);
            if (dateObj.getMonth() === currentMonth && dateObj.getFullYear() === currentYear) {
                if (usage[tx.categoryId] !== undefined) {
                    usage[tx.categoryId] += parseFloat(tx.amount);
                }
            }
        }
    });

    let totalLimit = 0;
    let totalSpent = 0;
    Object.keys(appData.categoryLimits).forEach(cat => {
        totalLimit += parseFloat(appData.categoryLimits[cat] || 0);
        totalSpent += usage[cat] || 0;
    });

    const overallContainer = $('#overallBudgetContainer');
    overallContainer.empty();

    if (totalLimit > 0) {
        const oDisplayPct = ((totalSpent / totalLimit) * 100).toFixed(1);
        const cappedPct = Math.min(oDisplayPct, 100);
        const oAvailable = Math.max(totalLimit - totalSpent, 0).toFixed(2);

        // Colors for circular progress
        let ringColor = 'rgba(59, 130, 246, 1)'; // Blue
        let ringShadow = 'rgba(59, 130, 246, 0.5)';
        if (oDisplayPct >= 100) { ringColor = 'rgba(239, 68, 68, 1)'; ringShadow = 'rgba(239, 68, 68, 0.6)'; }
        else if (oDisplayPct >= 80) { ringColor = 'rgba(245, 158, 11, 1)'; ringShadow = 'rgba(245, 158, 11, 0.5)'; }

        // SVG Math
        const radius = 90;
        const circumference = 2 * Math.PI * radius;
        const dashOffset = circumference - (cappedPct / 100) * circumference;

        // Find Most At Risk Category
        let mostAtRisk = { catId: 'None', pct: 0 };
        Object.keys(appData.categoryLimits).forEach(c => {
            const l = parseFloat(appData.categoryLimits[c] || 0);
            const s = usage[c] || 0;
            if (l > 0) {
                const p = (s / l) * 100;
                if (p > mostAtRisk.pct) { mostAtRisk = { catId: c, pct: p }; }
            }
        });

        let insightHtml = '';
        if (mostAtRisk.pct > 0) {
            const catName = getCategoryName(mostAtRisk.catId);
            let msg = `You are spending fastest in <strong>${catName}</strong>.`;
            if (mostAtRisk.pct >= 100) msg = `Warning: You have exceeded your <strong>${catName}</strong> budget!`;
            insightHtml = `
            <div class="insight-banner mt-4 d-flex align-items-center">
                <i class="fa-solid fa-lightbulb text-warning me-3 fs-4"></i>
                <div class="text-white-50 small">
                    <span class="d-block fw-bold text-white mb-1">Smart Insight</span>
                    ${msg}
                </div>
            </div>`;
        }

        overallContainer.html(`
            <div class="budget-hero-card p-3 p-md-5">
                <div class="row align-items-center">
                    <div class="col-md-5 text-center mb-4 mb-md-0">
                        <div class="circular-progress-container" style="transform: scale(0.9); transform-origin: center;">
                            <svg class="circular-progress-svg" style="filter: drop-shadow(0 0 10px ${ringShadow});">
                                <circle class="circular-progress-bg" cx="110" cy="110" r="${radius}"></circle>
                                <circle class="circular-progress-fill" cx="110" cy="110" r="${radius}" 
                                        stroke="${ringColor}" stroke-dasharray="${circumference}" 
                                        stroke-dashoffset="${circumference}">
                                </circle>
                            </svg>
                            <div class="circular-progress-text">
                                <span class="d-block fs-2 fw-bold text-white mb-0 lh-1">${oDisplayPct}%</span>
                                <span class="d-block small text-white-50 text-uppercase tracking-wider mt-1">Used</span>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-7 ps-md-4 text-center text-md-start">
                        <h3 class="fw-bold text-white mb-1 fs-4 fs-md-3">Command Center</h3>
                        <p class="text-white-50 mb-4 small md-md-base">Your overall monthly spending pace.</p>
                        
                        <div class="row g-2 g-md-3">
                            <div class="col-6">
                                <div class="p-2 p-md-3 rounded" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);">
                                    <span class="d-block text-white-50 text-uppercase fw-bold mb-1" style="font-size: 0.65rem;">Total Limit</span>
                                    <span class="fw-bold text-white fs-6 fs-md-5">AED ${totalLimit.toFixed(2)}</span>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="p-2 p-md-3 rounded" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);">
                                    <span class="d-block text-white-50 text-uppercase fw-bold mb-1" style="font-size: 0.65rem;">Total Spent</span>
                                    <span class="fw-bold text-white fs-6 fs-md-5">AED ${totalSpent.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                        
                        ${insightHtml}
                    </div>
                </div>
            </div>
        `);

        // Animate the SVG ring after a tiny delay
        setTimeout(() => {
            const circle = overallContainer.find('.circular-progress-fill');
            if (circle.length) circle.css('stroke-dashoffset', dashOffset);
        }, 100);
    }

    // Sort categories by custom order defined in settings
    let catArray = Object.keys(appData.categoryLimits).map(cat => {
        const limit = parseFloat(appData.categoryLimits[cat]);
        const spent = usage[cat];
        const orderIndex = appData.expenseCategories.findIndex(c => c.id === cat);
        return { cat, limit, spent, pct: limit > 0 ? (spent / limit) * 100 : 0, orderIndex: orderIndex === -1 ? 9999 : orderIndex };
    });
    catArray.sort((a, b) => a.orderIndex - b.orderIndex);

    // Render Premium Cards
    catArray.forEach(item => {
        const catName = getCategoryName(item.cat);
        const limit = item.limit;
        const spent = item.spent;

        const displayPercentage = item.pct.toFixed(1);
        const barWidth = Math.min(item.pct, 100).toFixed(1);
        const available = Math.max(limit - spent, 0).toFixed(2);

        // Dynamic gradient colors based on status
        let gradStart = 'rgba(59, 130, 246, 1)';
        let gradEnd = 'rgba(14, 165, 233, 1)';
        let badgeColor = 'bg-primary';

        if (item.pct >= 100) {
            gradStart = 'rgba(239, 68, 68, 1)'; gradEnd = 'rgba(220, 38, 38, 1)'; badgeColor = 'bg-danger text-white';
        } else if (item.pct >= 80) {
            gradStart = 'rgba(245, 158, 11, 1)'; gradEnd = 'rgba(217, 119, 6, 1)'; badgeColor = 'bg-warning text-dark';
        } else if (item.pct >= 50) {
            gradStart = 'rgba(16, 185, 129, 1)'; gradEnd = 'rgba(5, 150, 105, 1)'; badgeColor = 'bg-success text-white';
        }

        container.append(`
            <div class="col-12 col-md-6 col-xl-4 mb-3 mb-md-4">
                <!-- Desktop Premium Card (Hidden on Mobile) -->
                <div class="premium-cat-card p-4 h-100 d-none d-md-flex flex-column">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <div class="d-flex align-items-center">
                            <div class="rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 40px; height: 40px; background: rgba(255,255,255,0.1);">
                                <i class="fa-solid fa-tags text-white"></i>
                            </div>
                            <h5 class="fw-bold mb-0 text-white">${catName}</h5>
                        </div>
                        <span class="badge ${badgeColor} rounded-pill shadow-sm px-3 py-2 fw-bold" style="font-size: 0.8rem;">
                            ${displayPercentage}%
                        </span>
                    </div>
                    
                    <div class="gradient-track mb-4">
                        <div class="gradient-fill" style="width: 0%; background: linear-gradient(90deg, ${gradStart}, ${gradEnd});"></div>
                    </div>
                    
                    <div class="mt-auto row text-center">
                        <div class="col-4">
                            <span class="d-block text-white-50 small text-uppercase mb-1" style="font-size: 0.65rem;">Spent</span>
                            <span class="fw-bold text-white small">AED ${spent.toFixed(0)}</span>
                        </div>
                        <div class="col-4 border-start border-end border-secondary">
                            <span class="d-block text-white-50 small text-uppercase mb-1" style="font-size: 0.65rem;">Limit</span>
                            <span class="fw-bold text-white-50 small">AED ${limit.toFixed(0)}</span>
                        </div>
                        <div class="col-4">
                            <span class="d-block text-white-50 small text-uppercase mb-1" style="font-size: 0.65rem;">Left</span>
                            <span class="fw-bold ${item.pct >= 100 ? 'text-danger' : 'text-success'} small">AED ${available}</span>
                        </div>
                    </div>
                </div>

                <!-- Mobile Native List Row (Hidden on Desktop) -->
                <div class="d-md-none border-0 border-bottom py-4 mb-2" style="border-color: rgba(255,255,255,0.05) !important;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="d-flex align-items-center gap-3">
                            <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 38px; height: 38px; background: rgba(255,255,255,0.05);">
                                <i class="fa-solid fa-tags text-white" style="font-size: 0.85rem;"></i>
                            </div>
                            <h6 class="fw-bold mb-0 text-white">${catName}</h6>
                        </div>
                        <span class="text-white fw-bold" style="font-size: 0.85rem;">${displayPercentage}%</span>
                    </div>
                    <div class="gradient-track my-2" style="height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px;">
                        <div class="gradient-fill" style="width: 0%; height: 100%; border-radius: 3px; background: linear-gradient(90deg, ${gradStart}, ${gradEnd});"></div>
                    </div>
                    <div class="d-flex justify-content-between text-white-50 mt-2" style="font-size: 0.9rem;">
                        <span>AED ${spent.toFixed(0)} / ${limit.toFixed(0)}</span>
                        <span class="${item.pct >= 100 ? 'text-danger fw-bold' : 'text-success'}">AED ${available} Left</span>
                    </div>
                </div>
            </div>
        `);
    });

    // Trigger gradient fill animation
    setTimeout(() => {
        container.children('.col-12').each(function (index) {
            const col = $(this);
            const fills = col.find('.gradient-fill');
            const targetWidth = Math.min(catArray[index].pct, 100) + '%';
            fills.css('width', targetWidth);
        });
    }, 100);
}

// ==========================================
// GOALS & GAMIFICATION MODULE
// ==========================================

window.showAddGoalModal = function () {
    $('#goalForm')[0].reset();
    $('#goalId').val('');
    $('#goalModalTitle').text('Create Goal');
    $('#addGoalModal').modal('show');
};

$('#goalForm').submit(function (e) {
    e.preventDefault();
    const id = $('#goalId').val();
    const name = $('#goalName').val().trim();
    const target = parseFloat($('#goalTarget').val());

    if (!name || isNaN(target) || target <= 0) {
        Toast.fire({ icon: 'warning', title: 'Invalid Goal Data' });
        return;
    }

    if (!appData.goals) appData.goals = [];

    if (id) {
        const goal = appData.goals.find(g => g.id === id);
        if (goal) {
            goal.name = name;
            goal.targetAmount = target;
            Toast.fire({ icon: 'success', title: 'Goal updated!' });
        }
    } else {
        appData.goals.push({
            id: generateUUID(),
            name: name,
            targetAmount: target,
            savedAmount: 0,
            createdAt: new Date().toISOString()
        });
        Toast.fire({ icon: 'success', title: 'Goal created!' });
    }

    $('#addGoalModal').modal('hide');
    renderGoals();
    saveData();
});

window.editGoal = function (id) {
    const goal = appData.goals.find(g => g.id === id);
    if (!goal) return;
    $('#goalId').val(goal.id);
    $('#goalName').val(goal.name);
    $('#goalTarget').val(goal.targetAmount);
    $('#goalModalTitle').text('Edit Goal');
    $('#addGoalModal').modal('show');
};

window.deleteGoal = function (id) {
    confirmAction('Delete Goal?', 'Are you sure you want to delete this goal? Saved funds will not be lost, just uncategorized.', 'Yes, Delete', () => {
        appData.goals = appData.goals.filter(g => g.id !== id);
        renderGoals();
        saveData();
        Toast.fire({ icon: 'success', title: 'Goal deleted!' });
    });
};

window.showDepositModal = function (id) {
    $('#depositGoalForm')[0].reset();
    $('#depositGoalId').val(id);
    $('#depositGoalModal').modal('show');
};

$('#depositGoalForm').submit(function (e) {
    e.preventDefault();
    const id = $('#depositGoalId').val();
    const amt = parseFloat($('#depositAmount').val());

    if (isNaN(amt) || amt <= 0) {
        Toast.fire({ icon: 'warning', title: 'Invalid Amount' });
        return;
    }

    const goal = appData.goals.find(g => g.id === id);
    if (goal) {
        goal.savedAmount += amt;
        Toast.fire({ icon: 'success', title: 'Funds Deposited! 🎉' });
        $('#depositGoalModal').modal('hide');
        renderGoals();
        saveData();
    }
});

function renderGoals() {
    const container = $('#goalsContainer');
    container.empty();

    // Mobile "New Goal" Button
    container.append(`
        <div class="col-12 d-md-none mb-4 mt-2">
            <button class="btn w-100 fw-bold d-flex align-items-center justify-content-center gap-2 py-3 rounded-4 shadow-sm" onclick="showAddGoalModal()" style="background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple)); color: white; border: none;">
                <i class="fa-solid fa-plus fs-5"></i> Create New Goal
            </button>
        </div>
    `);

    if (!appData.goals || appData.goals.length === 0) {
        container.append(`<div class="col-12 text-center py-5 text-muted"><i class="fa-solid fa-bullseye fa-3x mb-3 opacity-50"></i><h5>No Goals Yet</h5><p>Set a savings target to track your progress.</p></div>`);
        return;
    }

    appData.goals.forEach(goal => {
        let pct = (goal.savedAmount / goal.targetAmount) * 100;
        let isComplete = pct >= 100;
        if (pct > 100) pct = 100;

        container.append(`
            <div class="col-12 col-md-6 col-lg-4 mb-3 mb-md-4">
                <!-- Desktop Card (Hidden on Mobile) -->
                <div class="card glass-card h-100 border-0 shadow-lg d-none d-md-flex flex-column" style="background: rgba(15, 23, 42, 0.6); position: relative; overflow: hidden;">
                    ${isComplete ? '<div style="position: absolute; top: -15px; right: -15px; width: 60px; height: 60px; background: #10b981; transform: rotate(45deg); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 5px;"><i class="fa-solid fa-check text-white" style="transform: rotate(-45deg);"></i></div>' : ''}
                    <div class="card-body p-4 d-flex flex-column h-100">
                        <div class="d-flex justify-content-between mb-3">
                            <h5 class="fw-bold text-white mb-0 text-truncate" title="${escapeHTML(goal.name)}">${escapeHTML(goal.name)}</h5>
                            <div class="dropdown">
                                <i class="fa-solid fa-ellipsis-vertical text-muted" data-bs-toggle="dropdown" style="cursor: pointer;"></i>
                                <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark">
                                    <li><a class="dropdown-item" href="javascript:void(0);" onclick="editGoal('${goal.id}')">Edit Goal</a></li>
                                    <li><a class="dropdown-item text-danger" href="javascript:void(0);" onclick="deleteGoal('${goal.id}')">Delete</a></li>
                                </ul>
                            </div>
                        </div>
                        <div class="mt-auto">
                            <div class="d-flex justify-content-between text-white-50 small mb-2">
                                <span>AED ${goal.savedAmount.toFixed(2)} saved</span>
                                <span>AED ${goal.targetAmount.toFixed(2)}</span>
                            </div>
                            <div class="progress" style="height: 10px; background: rgba(255,255,255,0.1); border-radius: 10px;">
                                <div class="progress-bar ${isComplete ? 'bg-success' : 'bg-primary'} progress-bar-striped ${isComplete ? '' : 'progress-bar-animated'}" role="progressbar" style="width: ${pct}%"></div>
                            </div>
                            <div class="mt-3 text-center">
                                ${isComplete
                ? '<span class="badge bg-success w-100 py-2"><i class="fa-solid fa-trophy me-2"></i>Goal Reached!</span>'
                : `<button class="btn btn-outline-success btn-sm w-100 fw-bold" onclick="showDepositModal('${goal.id}')"><i class="fa-solid fa-coins me-2"></i>Deposit Funds</button>`
            }
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Mobile Native List Row (Hidden on Desktop) -->
                <div class="d-md-none border-0 w-100">
                    <div class="swipe-row-wrapper">
                        <div class="swipe-actions-right">
                            <button class="swipe-action-btn swipe-action-edit" onclick="editGoal('${goal.id}')"><i class="fa-solid fa-pen"></i></button>
                            <button class="swipe-action-btn swipe-action-delete" onclick="deleteGoal('${goal.id}')"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <div class="swipe-content py-3 px-2">
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <div class="d-flex align-items-center gap-3">
                                    <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width: 44px; height: 44px; background: ${isComplete ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)'};">
                                        <i class="fa-solid ${isComplete ? 'fa-check text-success' : 'fa-bullseye text-white-50'}" style="font-size: 1.1rem;"></i>
                                    </div>
                                    <div>
                                        <h6 class="fw-bold mb-0 text-white text-truncate" style="max-width: 170px;">${escapeHTML(goal.name)}</h6>
                                        <small class="text-white-50 d-block mt-1" style="font-size: 0.9rem;">AED ${goal.savedAmount.toFixed(0)} / ${goal.targetAmount.toFixed(0)}</small>
                                    </div>
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    ${isComplete 
                                        ? `<span class="badge bg-success rounded-pill px-2 py-1"><i class="fa-solid fa-trophy"></i></span>` 
                                        : `<button class="btn btn-sm btn-success rounded-circle d-flex align-items-center justify-content-center p-0" style="width: 32px; height: 32px;" onclick="showDepositModal('${goal.id}')" title="Deposit"><i class="fa-solid fa-plus"></i></button>`
                                    }
                                </div>
                            </div>
                            <div class="progress mt-3" style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 4px;">
                                <div class="progress-bar ${isComplete ? 'bg-success' : 'bg-primary'}" role="progressbar" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    });
}

function renderDashboardAnalytics(filteredTx, totalExpense) {
    const now = new Date();
    const currentDashYear = $('#dashYearFilter').val();
    const currentDashMonth = $('#dashMonthFilter').val();

    // Hide Daily sections when viewing All Year
    if (!currentDashMonth) {
        $('#advancedAnalyticsRow').hide();
        $('#calendarRow').hide();
        return;
    } else {
        $('#advancedAnalyticsRow').fadeIn();
        $('#calendarRow').fadeIn();
    }

    const isCurrentMonth = (!currentDashYear || currentDashYear == now.getFullYear()) && (!currentDashMonth || currentDashMonth == (now.getMonth() + 1));

    let daysPassed = 1;
    let daysInMonth = 30;

    if (isCurrentMonth) {
        daysPassed = now.getDate() || 1;
        daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    } else if (currentDashYear && currentDashMonth) {
        daysPassed = new Date(currentDashYear, currentDashMonth, 0).getDate();
        daysInMonth = daysPassed;
    }

    const dailyAvg = totalExpense / daysPassed;
    const projectedEOM = dailyAvg * daysInMonth;

    // Premium AI Financial Insights Generation
    let aiText = '';
    
    let topCatId = null;
    let maxCatSpent = 0;
    
    let localCatUsage = {};
    let totalIncome = 0;
    filteredTx.forEach(tx => {
        if (tx.type === 'expense') {
            localCatUsage[tx.categoryId] = (localCatUsage[tx.categoryId] || 0) + parseFloat(tx.amount);
        } else if (tx.type === 'income') {
            totalIncome += parseFloat(tx.amount);
        }
    });

    Object.keys(localCatUsage).forEach(id => {
        if (localCatUsage[id] > maxCatSpent) {
            maxCatSpent = localCatUsage[id];
            topCatId = id;
        }
    });
    
    let totalBudget = 0;
    if (appData.categoryLimits) {
        Object.keys(appData.categoryLimits).forEach(id => {
            totalBudget += parseFloat(appData.categoryLimits[id] || 0);
        });
    }

    // --- FINANCIAL HEALTH SCORE ---
    let healthScore = 100;
    let healthDesc = "Great job managing your finances!";

    // 1. Savings Rate penalty/bonus
    let savingsRate = 0;
    if (totalIncome > 0) {
        savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
        if (savingsRate < 0) {
            healthScore -= 40; // Deficit
            healthDesc = "You are spending more than you earn. Focus on cutting wants.";
        } else if (savingsRate < 10) {
            healthScore -= 20; // Low savings
            healthDesc = "Your savings rate is low. Try to reach the 20% savings goal.";
        } else if (savingsRate >= 20) {
            healthScore += 5; // Excellent savings
            healthDesc = "Excellent! You are hitting the 20% savings rule perfectly.";
        }
    } else if (totalExpense > 0) {
        healthScore -= 30; // Spending with no income recorded
        healthDesc = "High spending with no income recorded this month.";
    } else if (totalExpense === 0 && totalIncome === 0) {
        healthScore = 0;
        healthDesc = "Add transactions to calculate your score.";
    }

    // 2. Budget utilization penalty
    if (totalBudget > 0) {
        let budgetUtil = (totalExpense / totalBudget) * 100;
        if (budgetUtil > 100) {
            healthScore -= 25;
            healthDesc = "You have exceeded your total budget limits.";
        } else if (budgetUtil > 90) {
            healthScore -= 10;
        }
    }

    // 3. Category specific overspends
    let overBudgetCount = 0;
    Object.keys(localCatUsage).forEach(id => {
        if (appData.categoryLimits && appData.categoryLimits[id]) {
            if (localCatUsage[id] > parseFloat(appData.categoryLimits[id])) {
                overBudgetCount++;
            }
        }
    });

    healthScore -= (overBudgetCount * 5); // -5 for each category over limit
    
    // Clamp score
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Determine Grade
    let grade = "Excellent";
    let circleColor = "#22c55e"; // green
    if (healthScore === 0 && totalExpense === 0 && totalIncome === 0) {
        grade = "No Data";
        circleColor = "rgba(255,255,255,0.2)";
    } else if (healthScore < 50) {
        grade = "Needs Work";
        circleColor = "#ef4444"; // red
    } else if (healthScore < 80) {
        grade = "Fair";
        circleColor = "#f59e0b"; // warning orange
    }

    // Animate score
    const circle = document.getElementById('healthScoreCircle');
    if (circle) {
        const radius = circle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        const offset = circumference - (healthScore / 100) * circumference;
        
        setTimeout(() => {
            circle.style.strokeDashoffset = offset;
            circle.style.stroke = circleColor;
        }, 100);
    }
    
    $('#healthScoreValue').text(Math.round(healthScore));
    $('#healthScoreGrade').text(grade).css('color', circleColor);
    if (overBudgetCount > 0 && healthScore >= 50 && totalExpense > 0) {
        healthDesc += ` (${overBudgetCount} categor${overBudgetCount > 1 ? 'ies' : 'y'} over limit)`;
    }
    $('#healthScoreDesc').text(healthDesc);
    // --- END FINANCIAL HEALTH SCORE ---

    if (totalExpense === 0) {
        aiText = "You haven't recorded any expenses for this period yet. Add transactions to receive AI insights on your spending patterns.";
    } else {
        let budgetText = "";
        let topCatText = "";

        if (totalBudget > 0) {
            let projectedSavings = totalBudget - projectedEOM;
            if (projectedSavings > 0) {
                budgetText = `on track to <span class="text-success fw-bold">save AED ${projectedSavings.toFixed(0)}</span> against your total budget`;
            } else {
                budgetText = `<span class="text-danger fw-bold">projected to overspend by AED ${Math.abs(projectedSavings).toFixed(0)}</span> against your budget`;
            }
        } else {
            budgetText = `pacing towards a total monthly spend of <span class="text-white fw-bold">AED ${projectedEOM.toFixed(0)}</span>`;
        }
        
        if (topCatId) {
            let catName = getCategoryName(topCatId);
            let catPct = ((maxCatSpent / totalExpense) * 100).toFixed(0);
            topCatText = ` Your highest expenditure is <span class="text-white fw-bold">${catName}</span>, which currently accounts for ${catPct}% of all spending.`;
        }

        aiText = `Based on your average daily spend of AED ${dailyAvg.toFixed(0)}, you are ${budgetText}.${topCatText}`;
    }

    $('#aiInsightsText').html(aiText);

    const dailyExpenses = {};
    const dailyIncomes = {};
    let maxDaily = 0;

    filteredTx.forEach(tx => {
        const d = new Date(tx.date);
        const day = d.getDate();
        if (tx.type === 'expense') {
            dailyExpenses[day] = (dailyExpenses[day] || 0) + parseFloat(tx.amount);
            if (dailyExpenses[day] > maxDaily) maxDaily = dailyExpenses[day];
        } else if (tx.type === 'income') {
            dailyIncomes[day] = (dailyIncomes[day] || 0) + parseFloat(tx.amount);
        }
    });

    $('[data-bs-toggle="tooltip"]').tooltip();

    // Render the new Expense Calendar
    renderExpenseCalendar(filteredTx, currentDashYear, currentDashMonth, dailyExpenses, dailyIncomes, daysInMonth);
}

function renderExpenseCalendar(filteredTx, currentYear, currentMonth, dailyExpenses, dailyIncomes, daysInMonth) {
    const calendarGrid = $('#expenseCalendarGrid');
    calendarGrid.empty();

    const now = new Date();

    let year = currentYear ? parseInt(currentYear) : now.getFullYear();
    let month = currentMonth ? parseInt(currentMonth) - 1 : now.getMonth();

    // First day of the month (0 = Sun, 1 = Mon, etc.)
    const firstDay = new Date(year, month, 1).getDay();

    // Add empty cells for days before the 1st
    for (let i = 0; i < firstDay; i++) {
        calendarGrid.append('<div class="calendar-day empty"></div>');
    }

    // Calculate max daily expense for heatmap scaling
    let maxDaily = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        if (dailyExpenses[day] > maxDaily) maxDaily = dailyExpenses[day];
    }

    // Add cells for each day
    for (let day = 1; day <= daysInMonth; day++) {
        const spent = dailyExpenses[day] || 0;
        const earned = dailyIncomes[day] || 0;

        let isToday = false;
        if (year === now.getFullYear() && month === now.getMonth() && day === now.getDate()) {
            isToday = true;
        }

        let amountsHtml = '';
        if (earned > 0) {
            amountsHtml += `<div class="calendar-amount text-success">+ AED ${earned.toFixed(0)}</div>`;
        }
        if (spent > 0) {
            amountsHtml += `<div class="calendar-amount text-white fw-bold">- AED ${spent.toFixed(0)}</div>`;
        }
        if (spent === 0 && earned === 0) {
            amountsHtml = `<div class="calendar-amount text-white-50 opacity-25">-</div>`;
        }

        const todayClass = isToday ? 'today' : '';

        // Apply Heatmap Background
        let heatmapStyle = '';
        if (spent > 0 && maxDaily > 0) {
            let opacity = 0.05 + (0.35 * (spent / maxDaily)); // Subtle red tint
            heatmapStyle = `style="background: rgba(239, 68, 68, ${opacity}); border-color: rgba(239, 68, 68, ${opacity + 0.1});"`;
        }

        calendarGrid.append(`
            <div class="calendar-day ${todayClass}" ${heatmapStyle}>
                <div class="calendar-date">${day}</div>
                <div class="mt-auto d-flex flex-column justify-content-end">${amountsHtml}</div>
            </div>
        `);
    }
}

