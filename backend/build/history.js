document.addEventListener("DOMContentLoaded", function () {
    const historyTable = document.getElementById("history-table");

    // Load investment history from localStorage
    let investmentHistory = JSON.parse(localStorage.getItem("investmentHistory")) || [];

    function updateHistoryTable() {
        historyTable.innerHTML = ""; // Clear table before updating
        if (investmentHistory.length === 0) {
            historyTable.innerHTML = "<tr><td colspan='5'>No investments found</td></tr>";
            return;
        }

        investmentHistory.forEach(investment => {
            let row = `
                <tr>
                    <td>${investment.plan}</td>
                    <td>$${investment.amount.toFixed(2)}</td>
                    <td>${investment.startDate}</td>
                    <td>${investment.endDate}</td>
                    <td>${investment.status}</td>
                </tr>
            `;
            historyTable.innerHTML += row;
        });
    }

    updateHistoryTable();
});
