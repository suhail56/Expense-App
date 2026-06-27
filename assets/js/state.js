// state.js
// Core Database State & Validation Logic

export let appData = {
    settings: {
        gasUrl: '',
        syncStartDate: ''
    },
    categoryRules: {},
    categoryLimits: {},
    expenseCategories: [],
    incomeCategories: [],
    transactions: []
};

export let fileSha = null;

export function setFileSha(sha) {
    fileSha = sha;
}

export function setAppData(data) {
    appData = data;
}

export function generateUUID() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
}

export function validateTransaction(tx) {
    if (!tx || !tx.categoryId) return false;
    if (tx.type === 'expense' && !appData.expenseCategories.find(c => c.id === tx.categoryId)) return false;
    if (tx.type === 'income' && !appData.incomeCategories.find(c => c.id === tx.categoryId)) return false;
    return true;
}

export function getCategoryName(id) {
    const exp = appData.expenseCategories.find(c => c.id === id);
    if (exp) return exp.name;
    const inc = appData.incomeCategories.find(c => c.id === id);
    if (inc) return inc.name;
    return 'Unknown';
}

export function mergeState(local, remote) {
    const merged = JSON.parse(JSON.stringify(remote));

    if (local.transactions && Array.isArray(local.transactions)) {
        local.transactions.forEach(localTx => {
            const remoteIdx = merged.transactions.findIndex(rTx => rTx.id === localTx.id);
            if (remoteIdx === -1) {
                merged.transactions.push(localTx);
            } else {
                merged.transactions[remoteIdx] = localTx;
            }
        });
    }

    const mergeCategories = (type) => {
        const localList = type === 'expense' ? local.expenseCategories : local.incomeCategories;
        const mergedList = type === 'expense' ? merged.expenseCategories : merged.incomeCategories;
        
        if (localList) {
            localList.forEach(localCat => {
                const exists = mergedList.find(rCat => rCat.id === localCat.id);
                if (!exists) mergedList.push(localCat);
            });
        }
    };
    mergeCategories('expense');
    mergeCategories('income');

    if (local.categoryRules) {
        if(!merged.categoryRules) merged.categoryRules = {};
        for (const catId in local.categoryRules) {
            const localKeywords = local.categoryRules[catId];
            if (!merged.categoryRules[catId]) {
                merged.categoryRules[catId] = localKeywords;
            } else {
                merged.categoryRules[catId] = [...new Set([...merged.categoryRules[catId], ...localKeywords])];
            }
        }
    }
    
    if (local.categoryLimits) {
        if(!merged.categoryLimits) merged.categoryLimits = {};
        for (const catId in local.categoryLimits) {
            merged.categoryLimits[catId] = local.categoryLimits[catId]; // Local limit overrides
        }
    }

    if (local.settings) {
        merged.settings = { ...merged.settings, ...local.settings };
    }

    return merged;
}
