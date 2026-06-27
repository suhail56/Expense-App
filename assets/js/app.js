// State
let appData = {
    settings: {
        gasUrl: '',
        syncStartDate: ''
    },
    expenseCategories: [],
    incomeCategories: [],
    transactions: []
};
let fileSha = null;

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
        const newTx = {
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
    $('#searchTx').on('input', renderTransactionsPage);
    $('#filterCategory').on('change', renderTransactionsPage);

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
                startDate: startDate
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
function getApiUrl() {
    return `https://api.github.com/repos/${ghRepo}/contents/data.json`;
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
                alert("data.json not found in repository. Please ensure it exists.");
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
    renderRecentTransactions();
    renderTransactionsPage();
    calculateTotals();
    updateCharts(appData.transactions);
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
    
    filterSelect.append('<optgroup label="Income Categories">');
    appData.incomeCategories.forEach(cat => {
        filterSelect.append(`<option value="${cat}">${cat}</option>`);
    });
    filterSelect.append('</optgroup>');

    filterSelect.append('<optgroup label="Expense Categories">');
    appData.expenseCategories.forEach(cat => {
        filterSelect.append(`<option value="${cat}">${cat}</option>`);
    });
    filterSelect.append('</optgroup>');
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
    tbody.empty();
    
    const searchQuery = $('#searchTx').val().toLowerCase();
    const filterCat = $('#filterCategory').val();

    let filtered = appData.transactions.filter(tx => {
        const matchesSearch = tx.merchant.toLowerCase().includes(searchQuery);
        const matchesCat = (filterCat === 'All' || !filterCat) ? true : tx.category === filterCat;
        return matchesSearch && matchesCat;
    });

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        tbody.append(`<tr><td colspan="5" class="text-center py-4 text-muted">No transactions found.</td></tr>`);
        return;
    }

    filtered.forEach(tx => {
        const dateObj = new Date(tx.date);
        const formattedDate = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const amtColor = tx.type === 'income' ? 'text-income' : '';
        const amtPrefix = tx.type === 'income' ? '+' : '-';

        tbody.append(`
            <tr>
                <td>${formattedDate}</td>
                <td class="fw-bold">${tx.merchant}</td>
                <td><span class="category-badge">${tx.category}</span></td>
                <td class="fw-bold ${amtColor}">${amtPrefix} AED ${tx.amount}</td>
                <td>
                    <button class="btn-action" onclick="editTransaction('${tx.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action delete" onclick="deleteTransaction('${tx.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `);
    });
}

function calculateTotals() {
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    let totalBalance = 0;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    appData.transactions.forEach(tx => {
        const amt = parseFloat(tx.amount);
        
        if (tx.type === 'income') {
            totalBalance += amt;
        } else {
            totalBalance -= amt;
        }
        
        const txDate = new Date(tx.date);
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
            if (tx.type === 'income') monthlyIncome += amt;
            else monthlyExpense += amt;
        }
    });

    $('#totalBalance').text(`AED ${totalBalance.toFixed(2)}`);
    $('#monthlyIncome').text(`AED ${monthlyIncome.toFixed(2)}`);
    $('#monthlyExpense').text(`AED ${monthlyExpense.toFixed(2)}`);
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
