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

function updateCharts(transactions) {
    if (!monthlyChart || !categoryChart) return;

    const monthIncome = {};
    const monthExpense = {};
    const categoryData = {}; // Only for expenses

    transactions.forEach(tx => {
        const date = new Date(tx.date);
        const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        const amount = parseFloat(tx.amount);

        // Initialize month if not exists
        if (!monthIncome[monthYear]) monthIncome[monthYear] = 0;
        if (!monthExpense[monthYear]) monthExpense[monthYear] = 0;

        if (tx.type === 'income') {
            monthIncome[monthYear] += amount;
        } else {
            monthExpense[monthYear] += amount;
            // Add to pie chart
            categoryData[tx.category] = (categoryData[tx.category] || 0) + amount;
        }
    });

    // 1. Update Monthly Bar Chart
    // Get all unique months, sort them chronologically
    const allMonthsSet = new Set([...Object.keys(monthIncome), ...Object.keys(monthExpense)]);
    const months = Array.from(allMonthsSet).sort((a, b) => new Date(a) - new Date(b));
    const last6Months = months.slice(-6);

    monthlyChart.data.labels = last6Months;
    monthlyChart.data.datasets[0].data = last6Months.map(m => monthIncome[m]); // Income
    monthlyChart.data.datasets[1].data = last6Months.map(m => monthExpense[m]); // Expense
    monthlyChart.update();

    // 2. Update Expense Category Pie Chart
    const categories = Object.keys(categoryData);
    categoryChart.data.labels = categories;
    categoryChart.data.datasets[0].data = categories.map(c => categoryData[c]);
    categoryChart.update();
}
