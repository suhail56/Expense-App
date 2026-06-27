// State
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

// Global Sort State
let currentSortCol = 'date'; // 'date' or 'amount'
let currentSortDir = 'desc'; // 'desc' or 'asc'

// Dashboard State
let currentDashboardTimeframe = 'this_month';

// Pagination Variables
let fileSha = null;
let currentPage = 1;
const rowsPerPage = 10;

// GitHub API config
let ghRepo = localStorage.getItem('ghRepo') || '';
let ghToken = localStorage.getItem('ghToken') || '';

// DOM Elements
const authOverlay = document.getElementById('authOverlay');
const appContent = document.getElementById('appContent');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize
$(document).ready(function() {
    initCharts();
    
    // Auth Check
    if (ghRepo && ghToken) {
        authOverlay.style.display = 'none';
        appContent.style.display = 'flex';
        $('#displayRepo').val(ghRepo);
        initRouter();
        initDevMode(); // Initialize DEV MODE badge if applicable
        fetchData();
    } else {
        authOverlay.style.display = 'flex';
    }

    // Auth Form Submit
    $('#authForm').submit(function(e) {
        e.preventDefault();
        ghRepo = $('#githubRepo').val().trim();
        ghToken = $('#githubToken').val().trim();
        
        if(ghRepo && ghToken) {
            localStorage.setItem('ghRepo', ghRepo);
            localStorage.setItem('ghToken', ghToken);
            authOverlay.style.display = 'none';
            appContent.style.display = 'flex';
            $('#displayRepo').val(ghRepo);
            initRouter();
            initDevMode();
            fetchData();
        }
    });

    // Logout
    $('#logoutBtn').click(function() {
        localStorage.removeItem('ghRepo');
        localStorage.removeItem('ghToken');
        location.reload();
    });

    // Save Transaction
    $('#transactionForm').submit(function(e) {
        e.preventDefault();
        const txId = $('#txId').val();
        
        let existingTx = {};
        if (txId) {
            existingTx = appData.transactions.find(t => t.id === txId) || {};
        }

        const newTx = {
            ...existingTx, // Preserve existing properties like gmailId
            id: txId || Date.now().toString(),
            date: $('#txDate').val(),
            merchant: $('#txMerchant').val(),
            type: $('input[name="txType"]:checked').val(),
            category: $('#txCategory').val(),
            amount: parseFloat($('#txAmount').val()).toFixed(2)
        };

        if (txId) {
            const idx = appData.transactions.findIndex(t => t.id === txId);
            if(idx > -1) appData.transactions[idx] = newTx;
        } else {
            appData.transactions.push(newTx);
        }

        $('#addTransactionModal').modal('hide');
        $('#transactionForm')[0].reset();
        $('#txId').val('');
        
        refreshUI();
        saveData();
    });

    // Handle Type Change to Update Categories in Modal
    $('input[name="txType"]').change(function() {
        updateTransactionModalCategories();
    });

    // Event Listeners for Transactions Page Search & Filter
    $('#searchTx').on('input', function() { currentPage = 1; renderTransactionsPage(); });
    $('#filterCategory').on('change', function() { currentPage = 1; renderTransactionsPage(); });
    $('#filterType').on('change', function() { currentPage = 1; renderTransactionsPage(); });
    $('#filterStartDate').on('change', function() { currentPage = 1; renderTransactionsPage(); });
    
    $('#dashboardTimeframe').on('change', function() {
        currentDashboardTimeframe = $(this).val();
        renderDashboard();
    });

    $('#dashSyncBtn').click(function() {
        $('#triggerSyncBtn').click(); // Reuse existing sync logic
    });
    
    // Header sorting listeners
    $('#sortDateBtn').click(function() {
        if (currentSortCol === 'date') {
            currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
        } else {
            currentSortCol = 'date';
            currentSortDir = 'desc';
        }
        renderTransactionsPage();
    });

    $('#sortAmountBtn').click(function() {
        if (currentSortCol === 'amount') {
            currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
        } else {
            currentSortCol = 'amount';
            currentSortDir = 'desc';
        }
        renderTransactionsPage();
    });
    
    $('#clearFiltersBtn').click(function() {
        $('#searchTx').val('');
        $('#filterCategory').val('All');
        $('#filterType').val('All');
        $('#filterStartDate').val('');
        $('#filterEndDate').val('');
        currentSortCol = 'date';
        currentSortDir = 'desc';
        currentPage = 1;
        renderTransactionsPage();
    });

    // Auto-Categorization Rules Form
    $('#addRuleForm').submit(function(e) {
        e.preventDefault();
        const category = $('#ruleCategory').val();
        const keywordsInput = $('#ruleKeywords').val().trim();
        
        if (!category || !keywordsInput) return;
        
        const keywords = keywordsInput.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
        if (keywords.length > 0) {
            if (!appData.categoryRules) appData.categoryRules = [];
            appData.categoryRules.push({ category, keywords });
            
            $('#ruleKeywords').val('');
            renderRulesTable();
            saveData();
        }
    });

    // Apply Rules to Past Transactions
    $('#applyRulesToPastBtn').click(function() {
        if (!appData.categoryRules || appData.categoryRules.length === 0) {
            alert('You have no rules to apply!');
            return;
        }
        if (confirm('This will scan all existing transactions and update their categories based on your current rules. Do you want to continue?')) {
            let updatedCount = 0;
            appData.transactions.forEach(tx => {
                const merchantLower = tx.merchant.toLowerCase();
                // Find matching rule
                for (const rule of appData.categoryRules) {
                    if (rule.keywords.some(kw => merchantLower.includes(kw))) {
                        if (tx.category !== rule.category) {
                            tx.category = rule.category;
                            updatedCount++;
                        }
                        break; // Stop checking other rules once a match is found
                    }
                }
            });
            
            if (updatedCount > 0) {
                refreshUI();
                saveData();
                alert(`Successfully updated ${updatedCount} transactions!`);
            } else {
                alert('All transactions already match your rules. No changes were made.');
            }
        }
    });

    // Add Limit Form
    $('#addLimitForm').submit(function(e) {
        e.preventDefault();
        const category = $('#limitCategory').val();
        const limitAmt = parseFloat($('#limitAmount').val());
        
        if (category && limitAmt > 0) {
            if (!appData.categoryLimits) appData.categoryLimits = {};
            appData.categoryLimits[category] = limitAmt;
            $('#limitAmount').val('');
            refreshUI();
            saveData();
        }
    });

    // Sync Settings Form
    $('#syncSettingsForm').submit(function(e) {
        e.preventDefault();
        if (!appData.settings) appData.settings = {};
        appData.settings.gasUrl = $('#gasUrl').val().trim();
        appData.settings.syncStartDate = $('#syncStartDate').val();
        saveData();
        alert('Sync settings saved!');
    });

    // Reset Database
    $('#resetDatabaseBtn').click(function() {
        if(confirm('WARNING: This will permanently delete ALL transactions. Are you absolutely sure?')) {
            appData.transactions = [];
            refreshUI();
            saveData();
            alert('Database has been reset.');
        }
    });

    // Trigger Manual Sync
    $('#triggerSyncBtn').click(function() {
        if (!appData.settings || !appData.settings.gasUrl) {
            alert('Please save your Google Apps Script URL first.');
            return;
        }
        const gasUrl = appData.settings.gasUrl;
        const startDate = appData.settings.syncStartDate || '';

        $('#triggerSyncBtn').prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin me-2"></i>Syncing...');
        
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
            success: function(res) {
                $('#triggerSyncBtn').prop('disabled', false).html('<i class="fa-solid fa-bolt me-2"></i> Sync Now');
                if (res.status === 'success') {
                    alert(res.message);
                    fetchData();
                } else {
                    alert('Sync failed: ' + res.message);
                }
            },
            error: function(err) {
                $('#triggerSyncBtn').prop('disabled', false).html('<i class="fa-solid fa-bolt me-2"></i> Sync Now');
                alert('Error contacting Google Apps Script.');
                console.error(err);
            }
        });
    });
});

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
}

window.fetchData = function() {
    showLoading(true);
    $.ajax({
        url: getApiUrl(),
        method: 'GET',
        headers: getHeaders(),
        success: function(response) {
            fileSha = response.sha;
            // Decode base64 UTF-8
            const content = decodeURIComponent(escape(window.atob(response.content)));
            const parsedData = JSON.parse(content);
            
            // DATA MIGRATION LOGIC
            appData = parsedData;
            if (!appData.settings) appData.settings = { gasUrl: '', syncStartDate: '' };
            if (!appData.categoryRules) appData.categoryRules = [];
            if (!appData.categoryLimits) appData.categoryLimits = {};
            
            // Migrate old categories
            if (appData.categories && !appData.expenseCategories) {
                appData.expenseCategories = appData.categories;
                appData.incomeCategories = ['Salary', 'Refunds', 'Dividends', 'Other'];
                delete appData.categories;
            }

            // Migrate old transactions to be 'expense' by default
            if (appData.transactions) {
                appData.transactions.forEach(tx => {
                    if (!tx.type) tx.type = 'expense';
                });
            }
            
            // Populate settings inputs
            $('#gasUrl').val(appData.settings.gasUrl || '');
            $('#syncStartDate').val(appData.settings.syncStartDate || '');

            refreshUI();
            showLoading(false);
        },
        error: function(err) {
            showLoading(false);
            if(err.status === 404) {
                alert(`${getDatabaseFileName()} not found in repository. Please ensure it exists.`);
            } else {
                alert("Error fetching data. Check your Repo and Token.");
                console.error(err);
            }
        }
    });
}

function saveData() {
    showLoading(true);
    const contentStr = JSON.stringify(appData, null, 2);
    const encodedContent = window.btoa(unescape(encodeURIComponent(contentStr)));

    const data = {
        message: "Update database",
        content: encodedContent,
        sha: fileSha
    };

    $.ajax({
        url: getApiUrl(),
        method: 'PUT',
        headers: getHeaders(),
        data: JSON.stringify(data),
        success: function(response) {
            fileSha = response.content.sha;
            showLoading(false);
        },
        error: function(err) {
            showLoading(false);
            alert("Error saving data!");
            console.error(err);
        }
    });
}

// UI Rendering
function refreshUI() {
    renderCategories();
    updateTransactionModalCategories();
    updateFilterDropdown();
    renderRulesTable();
    renderLimitsTable();
    renderBudgetsPage();
    renderTransactionsPage();
    renderDashboard(); // Replaces calculateTotals() and updates charts/insights
}

// Settings: Categories
window.addCategory = function(type) {
    const inputId = type === 'expense' ? '#newExpenseCat' : '#newIncomeCat';
    const val = $(inputId).val().trim();
    const targetArr = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;
    
    if (val && !targetArr.includes(val)) {
        targetArr.push(val);
        $(inputId).val('');
        renderCategories();
        updateTransactionModalCategories();
        updateFilterDropdown();
        saveData();
    }
}

window.deleteCategory = function(type, cat) {
    if(confirm(`Delete category "${cat}"?`)) {
        if (type === 'expense') {
            appData.expenseCategories = appData.expenseCategories.filter(c => c !== cat);
        } else {
            appData.incomeCategories = appData.incomeCategories.filter(c => c !== cat);
        }
        renderCategories();
        updateTransactionModalCategories();
        updateFilterDropdown();
        saveData();
    }
}

function renderCategories() {
    const expList = $('#expenseCategoriesList');
    expList.empty();
    appData.expenseCategories.forEach(cat => {
        expList.append(`
            <div class="category-tag">
                ${cat} <i class="fa-solid fa-xmark ms-1" onclick="deleteCategory('expense', '${cat}')"></i>
            </div>
        `);
    });

    const incList = $('#incomeCategoriesList');
    incList.empty();
    appData.incomeCategories.forEach(cat => {
        incList.append(`
            <div class="category-tag">
                ${cat} <i class="fa-solid fa-xmark ms-1" onclick="deleteCategory('income', '${cat}')"></i>
            </div>
        `);
    });
}

function updateTransactionModalCategories() {
    const type = $('input[name="txType"]:checked').val();
    const select = $('#txCategory');
    select.empty();
    
    const cats = type === 'expense' ? appData.expenseCategories : appData.incomeCategories;
    cats.forEach(cat => {
        select.append(`<option value="${cat}">${cat}</option>`);
    });
}

function updateFilterDropdown() {
    const filterSelect = $('#filterCategory');
    filterSelect.empty();
    filterSelect.append('<option value="All">All Categories</option>');
    
    filterSelect.append('<optgroup label="Expense Categories">');
    appData.expenseCategories.forEach(cat => {
        filterSelect.append(`<option value="${cat}">${cat}</option>`);
    });
    filterSelect.append('</optgroup>');

    filterSelect.append('<optgroup label="Income Categories">');
    appData.incomeCategories.forEach(cat => {
        filterSelect.append(`<option value="${cat}">${cat}</option>`);
    });
    filterSelect.append('</optgroup>');

    // Also populate the rules category dropdown
    const ruleSelect = $('#ruleCategory');
    ruleSelect.empty();
    ruleSelect.append('<optgroup label="Expense Categories">');
    appData.expenseCategories.forEach(cat => {
        ruleSelect.append(`<option value="${cat}">${cat}</option>`);
    });
    ruleSelect.append('</optgroup>');
    ruleSelect.append('<optgroup label="Income Categories">');
    appData.incomeCategories.forEach(cat => {
        ruleSelect.append(`<option value="${cat}">${cat}</option>`);
    });
    ruleSelect.append('</optgroup>');

    // Populate limit category dropdown (expenses only)
    const limitSelect = $('#limitCategory');
    limitSelect.empty();
    limitSelect.append('<option value="" disabled selected>Select Category</option>');
    appData.expenseCategories.forEach(cat => {
        limitSelect.append(`<option value="${cat}">${cat}</option>`);
    });
}

// Settings: Rules
function renderRulesTable() {
    const tbody = $('#rulesTableBody');
    tbody.empty();
    
    if (!appData.categoryRules || appData.categoryRules.length === 0) {
        tbody.append(`<tr><td colspan="3" class="text-center py-3 text-muted">No rules defined.</td></tr>`);
        return;
    }

    appData.categoryRules.forEach((rule, index) => {
        tbody.append(`
            <tr>
                <td><span class="category-badge">${rule.category}</span></td>
                <td><small>${rule.keywords.join(', ')}</small></td>
                <td class="text-end">
                    <button class="btn-action edit me-2" onclick="editRule(${index})"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-action delete" onclick="deleteRule(${index})"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `);
    });
}

window.editRule = function(index) {
    const rule = appData.categoryRules[index];
    $('#ruleCategory').val(rule.category);
    $('#ruleKeywords').val(rule.keywords.join(', '));
    appData.categoryRules.splice(index, 1);
    renderRulesTable();
    // Intentionally not calling saveData() here so they can cancel the edit by refreshing
}

window.deleteRule = function(index) {
    if(confirm('Delete this rule?')) {
        appData.categoryRules.splice(index, 1);
        renderRulesTable();
        saveData();
    }
}

// Settings: Limits
function renderLimitsTable() {
    const tbody = $('#limitsTableBody');
    tbody.empty();
    
    if (!appData.categoryLimits || Object.keys(appData.categoryLimits).length === 0) {
        tbody.append(`<tr><td colspan="3" class="text-center py-3 text-muted">No limits defined.</td></tr>`);
        return;
    }

    Object.keys(appData.categoryLimits).forEach((cat) => {
        tbody.append(`
            <tr>
                <td><span class="category-badge">${cat}</span></td>
                <td class="fw-bold">AED ${parseFloat(appData.categoryLimits[cat]).toFixed(2)}</td>
                <td class="text-end">
                    <button class="btn-action edit me-2" onclick="editLimit('${cat}')"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-action delete" onclick="deleteLimit('${cat}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `);
    });
}

window.editLimit = function(cat) {
    const limit = appData.categoryLimits[cat];
    delete appData.categoryLimits[cat];
    refreshUI(); // Must refresh FIRST so the dropdown is rebuilt
    
    $('#limitCategory').val(cat);
    $('#limitAmount').val(limit);
    // Intentionally not calling saveData() here so they can cancel the edit by refreshing
}

window.deleteLimit = function(cat) {
    if(confirm(`Remove budget limit for ${cat}?`)) {
        delete appData.categoryLimits[cat];
        refreshUI();
        saveData();
    }
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
        
        tbody.append(`
            <tr>
                <td>${formattedDate}</td>
                <td class="fw-bold">${tx.merchant} <br><span class="category-badge mt-1 d-inline-block">${tx.category}</span></td>
                <td class="fw-bold ${amtColor}">${amtPrefix} AED ${tx.amount}</td>
            </tr>
        `);
    });
}

// Transactions Page: Full List
window.renderTransactionsPage = function() {
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

    let filteredTotal = 0;
    let filtered = appData.transactions.filter(tx => {
        const matchesSearch = tx.merchant.toLowerCase().includes(searchQuery);
        const matchesCat = (filterCat === 'All' || !filterCat) ? true : tx.category === filterCat;
        const matchesType = (filterType === 'All' || !filterType) ? true : tx.type === filterType;
        
        let matchesDate = true;
        if (filterStartDate || filterEndDate) {
            const txDate = new Date(tx.date);
            txDate.setHours(0,0,0,0);
            
            if (filterStartDate) {
                const start = new Date(filterStartDate);
                start.setHours(0,0,0,0);
                if (txDate < start) matchesDate = false;
            }
            if (filterEndDate) {
                const end = new Date(filterEndDate);
                end.setHours(0,0,0,0);
                if (txDate > end) matchesDate = false;
            }
        }
        
        const isMatch = matchesSearch && matchesCat && matchesType && matchesDate;
        
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
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalItems);
    const paginatedItems = filtered.slice(startIndex, endIndex);

    // Update Info Text
    infoEl.text(`Showing ${startIndex + 1} to ${endIndex} of ${totalItems} entries`);

    paginatedItems.forEach(tx => {
        const dateObj = new Date(tx.date);
        const formattedDate = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const amtColor = tx.type === 'income' ? 'text-income' : '';
        const amtPrefix = tx.type === 'income' ? '+' : '-';
        const typeBadgeClass = tx.type === 'income' ? 'bg-success' : 'bg-danger';

        tbody.append(`
            <tr>
                <td>${formattedDate}</td>
                <td class="fw-bold">${tx.merchant}</td>
                <td><span class="badge ${typeBadgeClass} text-uppercase">${tx.type}</span></td>
                <td><span class="category-badge">${tx.category}</span></td>
                <td class="fw-bold ${amtColor}">${amtPrefix} AED ${tx.amount}</td>
                <td>
                    <button class="btn-action" onclick="editTransaction('${tx.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action delete" onclick="deleteTransaction('${tx.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `);
    });

    // Render Pagination Buttons
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    
    pagination.append(`
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
    `);
}

window.changePage = function(page) {
    currentPage = page;
    renderTransactionsPage();
}

function getFilteredDashboardTransactions() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return appData.transactions.filter(tx => {
        const txDate = new Date(tx.date);
        if (currentDashboardTimeframe === 'this_month') {
            return txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;
        } else if (currentDashboardTimeframe === 'last_month') {
            let lastMonth = currentMonth - 1;
            let year = currentYear;
            if (lastMonth < 0) {
                lastMonth = 11;
                year--;
            }
            return txDate.getMonth() === lastMonth && txDate.getFullYear() === year;
        } else if (currentDashboardTimeframe === 'this_year') {
            return txDate.getFullYear() === currentYear;
        }
        return true; // all_time
    });
}

function renderDashboard() {
    const filteredTx = getFilteredDashboardTransactions();
    
    let income = 0;
    let expense = 0;
    let netBalance = 0;

    // Calculate total net balance across ALL time regardless of timeframe filter
    appData.transactions.forEach(tx => {
        const amt = parseFloat(tx.amount);
        if (tx.type === 'income') netBalance += amt;
        else netBalance -= amt;
    });

    // Calculate timeframe specific income and expense
    filteredTx.forEach(tx => {
        const amt = parseFloat(tx.amount);
        if (tx.type === 'income') income += amt;
        else expense += amt;
    });

    const savingsRate = income > 0 ? (((income - expense) / income) * 100).toFixed(1) : 0;

    $('#dashBalance').text(`AED ${netBalance.toFixed(2)}`);
    $('#dashIncome').text(`AED ${income.toFixed(2)}`);
    $('#dashExpense').text(`AED ${expense.toFixed(2)}`);
    $('#dashSavingsRate').text(`${savingsRate}%`);

    // Render Recent Activity (Top 5 from ALL transactions)
    renderRecentTransactions();

    // Generate Smart Insights
    generateSmartInsights(filteredTx, income, expense, savingsRate);

    // Update Charts with timeframe specific data
    updateCharts(filteredTx, currentDashboardTimeframe);
}

function generateSmartInsights(filteredTx, income, expense, savingsRate) {
    const container = $('#smartInsightsContainer');
    container.empty();

    if (filteredTx.length === 0) {
        container.html(`<p class="text-white-50 small mb-0">No transactions found for this period to generate insights.</p>`);
        return;
    }

    // Insight 1: Savings Rate Analysis
    let savingsHtml = '';
    if (savingsRate > 20) {
        savingsHtml = `<div class="d-flex align-items-start gap-3"><i class="fa-solid fa-face-smile-beam text-success mt-1"></i><div><p class="mb-0 text-white small">Great job! You saved <span class="fw-bold text-success">${savingsRate}%</span> of your income this period.</p></div></div>`;
    } else if (savingsRate > 0) {
        savingsHtml = `<div class="d-flex align-items-start gap-3"><i class="fa-solid fa-face-meh text-warning mt-1"></i><div><p class="mb-0 text-white small">You saved <span class="fw-bold text-warning">${savingsRate}%</span> of your income. Aim for at least 20%!</p></div></div>`;
    } else if (income > 0) {
        savingsHtml = `<div class="d-flex align-items-start gap-3"><i class="fa-solid fa-face-frown text-danger mt-1"></i><div><p class="mb-0 text-white small">You spent more than you earned this period. Your savings rate is <span class="fw-bold text-danger">${savingsRate}%</span>.</p></div></div>`;
    } else {
        savingsHtml = `<div class="d-flex align-items-start gap-3"><i class="fa-solid fa-info-circle text-info mt-1"></i><div><p class="mb-0 text-white small">You had expenses but no income recorded for this period.</p></div></div>`;
    }

    // Insight 2: Top Expense Category
    let categoryData = {};
    filteredTx.forEach(tx => {
        if (tx.type === 'expense') {
            categoryData[tx.category] = (categoryData[tx.category] || 0) + parseFloat(tx.amount);
        }
    });

    let topCategory = '';
    let topAmount = 0;
    Object.keys(categoryData).forEach(cat => {
        if (categoryData[cat] > topAmount) {
            topAmount = categoryData[cat];
            topCategory = cat;
        }
    });

    let topCatHtml = '';
    if (topCategory) {
        const pct = expense > 0 ? ((topAmount / expense) * 100).toFixed(0) : 0;
        topCatHtml = `<div class="d-flex align-items-start gap-3"><i class="fa-solid fa-chart-pie text-info mt-1"></i><div><p class="mb-0 text-white small">Your biggest expense was <span class="fw-bold text-info">${topCategory}</span> (AED ${topAmount.toFixed(2)}), making up ${pct}% of your total spending.</p></div></div>`;
    }

    // Insight 3: Budget Warnings (Only for this_month)
    let budgetHtml = '';
    if (currentDashboardTimeframe === 'this_month' && appData.categoryLimits) {
        let warnings = [];
        Object.keys(appData.categoryLimits).forEach(cat => {
            const limit = parseFloat(appData.categoryLimits[cat]);
            const spent = categoryData[cat] || 0;
            const pct = (spent / limit) * 100;
            if (pct >= 90) {
                warnings.push(cat);
            }
        });

        if (warnings.length > 0) {
            budgetHtml = `<div class="d-flex align-items-start gap-3"><i class="fa-solid fa-triangle-exclamation text-danger mt-1"></i><div><p class="mb-0 text-white small">Watch out! You are near or over your budget limit for: <span class="fw-bold text-danger">${warnings.join(', ')}</span>.</p></div></div>`;
        } else if (Object.keys(appData.categoryLimits).length > 0) {
            budgetHtml = `<div class="d-flex align-items-start gap-3"><i class="fa-solid fa-shield-check text-success mt-1"></i><div><p class="mb-0 text-white small">You are well within your budget limits for all tracked categories this month.</p></div></div>`;
        }
    }

    container.append(savingsHtml);
    if (topCatHtml) container.append('<hr class="border-secondary my-1">' + topCatHtml);
    if (budgetHtml) container.append('<hr class="border-secondary my-1">' + budgetHtml);
}

window.editTransaction = function(id) {
    const tx = appData.transactions.find(t => t.id === id);
    if(tx) {
        $('#txId').val(tx.id);
        $('#txDate').val(tx.date);
        $('#txMerchant').val(tx.merchant);
        $('#txAmount').val(tx.amount);
        
        // Select type toggle and trigger change to load correct categories
        if (tx.type === 'income') {
            $('#typeIncome').prop('checked', true);
        } else {
            $('#typeExpense').prop('checked', true);
        }
        updateTransactionModalCategories();
        
        $('#txCategory').val(tx.category);
        $('#transactionModalTitle').text('Edit Transaction');
        $('#addTransactionModal').modal('show');
    }
}

window.deleteTransaction = function(id) {
    if(confirm('Are you sure you want to delete this transaction?')) {
        appData.transactions = appData.transactions.filter(t => t.id !== id);
        refreshUI();
        saveData();
    }
}

// Reset modal on close
$('#addTransactionModal').on('hidden.bs.modal', function () {
    $('#transactionForm')[0].reset();
    $('#txId').val('');
    $('#typeExpense').prop('checked', true);
    updateTransactionModalCategories();
    $('#transactionModalTitle').text('Add Transaction');
});

// Budgets Page Logic
window.renderBudgetsPage = function() {
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
                if (usage[tx.category] !== undefined) {
                    usage[tx.category] += parseFloat(tx.amount);
                }
            }
        }
    });

    // Render Progress Cards
    Object.keys(appData.categoryLimits).forEach(cat => {
        const limit = parseFloat(appData.categoryLimits[cat]);
        const spent = usage[cat];
        
        // Display percentage can go over 100%
        const displayPercentage = ((spent / limit) * 100).toFixed(1);
        // Progress bar width visually caps at 100%
        const barWidth = Math.min((spent / limit) * 100, 100).toFixed(1);
        
        const available = Math.max(limit - spent, 0).toFixed(2);
        
        let progressColor = 'bg-primary';
        if (displayPercentage >= 100) progressColor = 'bg-danger';
        else if (displayPercentage >= 80) progressColor = 'bg-warning';
        else if (displayPercentage >= 50) progressColor = 'bg-info';

        let textColor = displayPercentage >= 100 ? 'text-danger' : 'text-info';

        container.append(`
            <div class="col-md-6 mb-4">
                <div class="card glass-card h-100" style="background: linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%); border: 1px solid rgba(255,255,255,0.1); border-top: 1px solid rgba(255,255,255,0.2); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="fw-bold mb-0 text-white"><i class="fa-solid fa-tag me-2" style="color: var(--accent-blue);"></i>${cat}</h5>
                            <span class="badge ${progressColor} bg-opacity-25 border border-${progressColor.replace('bg-','')} ${textColor} px-3 py-2 rounded-pill shadow-sm" style="font-size: 0.85rem;">
                                ${displayPercentage}% Used
                            </span>
                        </div>
                        
                        <div class="progress mb-4" style="height: 12px; background: rgba(0,0,0,0.3); border-radius: 10px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);">
                            <div class="progress-bar ${progressColor} progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${barWidth}%; border-radius: 10px;"></div>
                        </div>
                        
                        <div class="d-flex justify-content-between align-items-center rounded p-3" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05);">
                            <div class="text-center">
                                <span class="d-block text-white-50 small text-uppercase fw-bold mb-1" style="letter-spacing: 0.5px;">Spent</span>
                                <span class="fw-bold text-white fs-5">AED ${spent.toFixed(2)}</span>
                            </div>
                            <div class="text-center">
                                <span class="d-block text-white-50 small text-uppercase fw-bold mb-1" style="letter-spacing: 0.5px;">Limit</span>
                                <span class="text-white-50 fs-6">AED ${limit.toFixed(2)}</span>
                            </div>
                            <div class="text-center">
                                <span class="d-block text-white-50 small text-uppercase fw-bold mb-1" style="letter-spacing: 0.5px;">Left</span>
                                <span class="fw-bold ${displayPercentage >= 100 ? 'text-danger' : 'text-success'} fs-5">AED ${available}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    });
}
