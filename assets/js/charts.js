// Chart instances
let monthlyChart = null;
let categoryChart = null;

// Chart configuration colors to match the premium theme
const chartColors = {
    expense: 'rgba(239, 68, 68, 0.8)', // red
    expenseBorder: '#ef4444',
    income: 'rgba(16, 185, 129, 0.8)', // green
    incomeBorder: '#10b981',
    text: '#94a3b8',
    grid: 'rgba(255, 255, 255, 0.05)'
};

const pieColors = [
    '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'
];

Chart.defaults.color = chartColors.text;
Chart.defaults.font.family = "'Outfit', sans-serif";

function initCharts() {
    const ctxMonthly = document.getElementById('monthlyChart').getContext('2d');
    const ctxCategory = document.getElementById('categoryChart').getContext('2d');

    monthlyChart = new Chart(ctxMonthly, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Income (AED)',
                    data: [],
                    backgroundColor: chartColors.income,
                    borderColor: chartColors.incomeBorder,
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Expense (AED)',
                    data: [],
                    backgroundColor: chartColors.expense,
                    borderColor: chartColors.expenseBorder,
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: chartColors.grid },
                    border: { display: false }
                },
                x: {
                    grid: { display: false },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { 
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            }
        }
    });

    categoryChart = new Chart(ctxCategory, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: pieColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                }
            },
            cutout: '70%'
        }
    });
}

function updateCharts(filteredTx, timeframe) {
    if (!monthlyChart || !categoryChart) return;

    const dataMapIncome = {};
    const dataMapExpense = {};
    const categoryData = {}; // Only for expenses

    // Grouping Strategy
    const isDaily = (timeframe === 'this_month' || timeframe === 'last_month');

    filteredTx.forEach(tx => {
        const date = new Date(tx.date);
        let key = '';
        
        if (isDaily) {
            key = date.getDate().toString(); // e.g. "1", "15"
        } else {
            key = date.toLocaleString('default', { month: 'short', year: 'numeric' }); // e.g. "Jan 2026"
        }

        const amount = parseFloat(tx.amount);

        if (!dataMapIncome[key]) dataMapIncome[key] = 0;
        if (!dataMapExpense[key]) dataMapExpense[key] = 0;

        if (tx.type === 'income') {
            dataMapIncome[key] += amount;
        } else {
            dataMapExpense[key] += amount;
            categoryData[tx.category] = (categoryData[tx.category] || 0) + amount;
        }
    });

    // 1. Update Bar Chart
    let labels = [];
    if (isDaily) {
        // Find max days in the month to show 1 to max
        // To be safe, just use 1 to 31 or max day found
        let maxDay = 31;
        if (filteredTx.length > 0) {
            const firstDate = new Date(filteredTx[0].date);
            maxDay = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0).getDate();
        }
        for (let i = 1; i <= maxDay; i++) labels.push(i.toString());
    } else {
        const allKeysSet = new Set([...Object.keys(dataMapIncome), ...Object.keys(dataMapExpense)]);
        labels = Array.from(allKeysSet).sort((a, b) => new Date(a) - new Date(b));
    }

    monthlyChart.data.labels = labels;
    monthlyChart.data.datasets[0].data = labels.map(l => dataMapIncome[l] || 0);
    monthlyChart.data.datasets[1].data = labels.map(l => dataMapExpense[l] || 0);
    monthlyChart.update();

    // 2. Update Expense Category Pie Chart
    const categories = Object.keys(categoryData);
    categoryChart.data.labels = categories;
    categoryChart.data.datasets[0].data = categories.map(c => categoryData[c]);
    categoryChart.update();
}
