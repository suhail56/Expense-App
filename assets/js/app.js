// State
let appData = {
    categories: [],
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
        appContent.style.display = 'flex'; // Changed to flex for SPA layout
        $('#displayRepo').val(ghRepo);
        initRouter(); // Start Router
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

    // Add Category
    $('#addCategoryBtn').click(function() {
        const newCat = $('#newCategoryName').val().trim();
        if (newCat && !appData.categories.includes(newCat)) {
            appData.categories.push(newCat);
            $('#newCategoryName').val('');
            renderCategories();
            updateCategoryDropdowns();
            saveData();
        }
    });

    // Save Transaction
    $('#transactionForm').submit(function(e) {
        e.preventDefault();
        const txId = $('#txId').val();
        const newTx = {
            id: txId || Date.now().toString(),
            date: $('#txDate').val(),
            merchant: $('#txMerchant').val(),
            category: $('#txCategory').val(),
            amount: parseFloat($('#txAmount').val()).toFixed(2)
        };

        if (txId) {
            // Update
            const idx = appData.transactions.findIndex(t => t.id === txId);
            if(idx > -1) appData.transactions[idx] = newTx;
        } else {
            // Add
            appData.transactions.push(newTx);
        }

        $('#addTransactionModal').modal('hide');
        $('#transactionForm')[0].reset();
        $('#txId').val('');
        
        refreshUI();
        saveData();
    });

    // Event Listeners for Transactions Page Search & Filter
    $('#searchTx').on('input', renderTransactionsPage);
    $('#filterCategory').on('change', renderTransactionsPage);
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
            appData = JSON.parse(content);
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
        message: "Update expense data",
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
    updateCategoryDropdowns();
    renderRecentTransactions();
    renderTransactionsPage();
    calculateTotals();
    updateCharts(appData.transactions);
}

function renderCategories() {
    const list = $('#categoriesList');
    list.empty();
    appData.categories.forEach(cat => {
        list.append(`
            <div class="category-tag">
                ${cat} 
                <i class="fa-solid fa-xmark ms-1" onclick="deleteCategory('${cat}')"></i>
            </div>
        `);
    });
}

function updateCategoryDropdowns() {
    // Modal Select
    const txSelect = $('#txCategory');
    txSelect.empty();
    
    // Filter Select on Transactions Page
    const filterSelect = $('#filterCategory');
    filterSelect.empty();
    filterSelect.append('<option value="All">All Categories</option>');

    appData.categories.forEach(cat => {
        txSelect.append(`<option value="${cat}">${cat}</option>`);
        filterSelect.append(`<option value="${cat}">${cat}</option>`);
    });
}

window.deleteCategory = function(cat) {
    if(confirm(`Delete category "${cat}"?`)) {
        appData.categories = appData.categories.filter(c => c !== cat);
        renderCategories();
        updateCategoryDropdowns();
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
        
        tbody.append(`
            <tr>
                <td>${formattedDate}</td>
                <td class="fw-bold">${tx.merchant} <br><span class="category-badge mt-1 d-inline-block">${tx.category}</span></td>
                <td class="fw-bold">AED ${tx.amount}</td>
            </tr>
        `);
    });
}

// Transactions Page: Full List with Search & Filter
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
        
        tbody.append(`
            <tr>
                <td>${formattedDate}</td>
                <td class="fw-bold">${tx.merchant}</td>
                <td><span class="category-badge">${tx.category}</span></td>
                <td class="fw-bold">AED ${tx.amount}</td>
                <td>
                    <button class="btn-action" onclick="editTransaction('${tx.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-action delete" onclick="deleteTransaction('${tx.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `);
    });
}

function calculateTotals() {
    let allTime = 0;
    let monthly = 0;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    appData.transactions.forEach(tx => {
        const amt = parseFloat(tx.amount);
        allTime += amt;
        
        const txDate = new Date(tx.date);
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
            monthly += amt;
        }
    });

    $('#allTimeTotal').text(`AED ${allTime.toFixed(2)}`);
    $('#monthlyTotal').text(`AED ${monthly.toFixed(2)}`);
}

window.editTransaction = function(id) {
    const tx = appData.transactions.find(t => t.id === id);
    if(tx) {
        $('#txId').val(tx.id);
        $('#txDate').val(tx.date);
        $('#txMerchant').val(tx.merchant);
        $('#txCategory').val(tx.category);
        $('#txAmount').val(tx.amount);
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
    $('#transactionModalTitle').text('Add Transaction');
});
