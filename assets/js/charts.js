// Chart instances
let monthlyChart = null;
let categoryChart = null;

// Chart configuration colors to match the premium theme
const chartColors = {
    primary: 'rgba(59, 130, 246, 0.8)',
    primaryBorder: '#3b82f6',
    secondary: 'rgba(139, 92, 246, 0.8)',
    secondaryBorder: '#8b5cf6',
    tertiary: 'rgba(16, 185, 129, 0.8)',
    tertiaryBorder: '#10b981',
    text: '#94a3b8',
    grid: 'rgba(255, 255, 255, 0.05)'
};

const pieColors = [
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#10b981', // green
    '#f59e0b', // yellow
    '#ef4444', // red
    '#ec4899', // pink
    '#06b6d4', // cyan
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
            datasets: [{
                label: 'Expenses (AED)',
                data: [],
                backgroundColor: chartColors.primary,
                borderColor: chartColors.primaryBorder,
                borderWidth: 1,
                borderRadius: 4
            }]
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
                legend: { display: false }
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

    // 1. Process Monthly Data (last 6 months)
    const monthData = {};
    const categoryData = {};

    transactions.forEach(tx => {
        const date = new Date(tx.date);
        const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        const amount = parseFloat(tx.amount);

        // Add to monthly
        monthData[monthYear] = (monthData[monthYear] || 0) + amount;
        
        // Add to category
        categoryData[tx.category] = (categoryData[tx.category] || 0) + amount;
    });

    // Update Monthly Chart
    // Get last 6 months keys sorted
    const months = Object.keys(monthData).sort((a, b) => new Date(a) - new Date(b));
    monthlyChart.data.labels = months.slice(-6); // last 6 months
    monthlyChart.data.datasets[0].data = months.slice(-6).map(m => monthData[m]);
    monthlyChart.update();

    // Update Category Chart
    const categories = Object.keys(categoryData);
    categoryChart.data.labels = categories;
    categoryChart.data.datasets[0].data = categories.map(c => categoryData[c]);
    categoryChart.update();
}
