document.addEventListener("DOMContentLoaded", () => {
    console.log("Admin page loaded, fetching transactions...");
    fetchTransactions();
    setupSocketListeners();
});
const API_URL = "http://localhost:5000/api/get-transactions"; // Adjust if needed

// Fetch transactions from API
async function fetchTransactions() {
    const tableBody = document.querySelector("#transactions-table tbody");
    if (!tableBody) {
        console.warn("Error: transactions-table tbody element not found!");
        return;
    }
    tableBody.innerHTML = "<tr><td colspan='5'>Loading transactions...</td></tr>";

    try {
        const response = await fetch("http://localhost:5000/api/get-transactions");
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid transactions data received.");

        displayTransactions(data);
    } catch (error) {
        console.error("Error fetching transactions:", error);
        tableBody.innerHTML = "<tr><td colspan='5' class='error-msg'>Failed to load transactions.</td></tr>";
    }
}

// Display transactions in the table
function displayTransactions(transactions) {
    const tableBody = document.querySelector("#transactions-table tbody");
    tableBody.innerHTML = ""; // Clear previous data

    if (!transactions.length) {
        tableBody.innerHTML = "<tr><td colspan='5'>No transactions found.</td></tr>";
        return;
    }

    transactions.forEach(transaction => {
        addTransactionRow(transaction);
    });
}

// Add a row for a transaction
function addTransactionRow(transaction) {
    const tableBody = document.querySelector("#transactions-table tbody");
    if (!tableBody) {
        console.error("Error: transactions-table tbody not found!");
        return;
    }

    // Check if the transaction already exists to avoid duplicates
    let existingRow = document.getElementById(`transaction-${transaction._id}`);
    if (existingRow) {
        updateTransactionRow(existingRow, transaction);
        return;
    }

    const row = document.createElement("tr");
    row.setAttribute("id", `transaction-${transaction._id}`);
    row.innerHTML = `
        <td>${transaction.user || "N/A"}</td>
        <td>${transaction.plan || "N/A"}</td>
        <td>$${Number(transaction.amount || 0).toFixed(2)}</td>
        <td id="status-${transaction._id}">${transaction.status || "Pending"}</td>
        <td>
            <button class="approve-btn" data-id="${transaction._id}">Approve</button>
            <button class="reject-btn" data-id="${transaction._id}">Reject</button>
        </td>
    `;
    tableBody.appendChild(row);
    attachEventListeners(row, transaction._id);
}


// Update an existing transaction row (used for WebSocket updates)
function updateTransactionRow(row, transaction) {
    row.querySelector(`#status-${transaction._id}`).innerText = transaction.status;
}

// Attach event listeners for approve/reject buttons
function attachEventListeners(row, transactionId) {
    const approveBtn = row.querySelector(".approve-btn");
    const rejectBtn = row.querySelector(".reject-btn");

    approveBtn.addEventListener("click", () => updateStatus(transactionId, "Approved", approveBtn, rejectBtn));
    rejectBtn.addEventListener("click", () => updateStatus(transactionId, "Rejected", approveBtn, rejectBtn));
}

// Update transaction status
async function updateStatus(transactionId, newStatus, approveBtn, rejectBtn) {
    const statusCell = document.getElementById(`status-${transactionId}`);
    if (!statusCell) return;

    // Disable buttons while processing
    approveBtn.disabled = true;
    rejectBtn.disabled = true;
    statusCell.innerText = "Processing...";

    try {
        const response = await fetch(`http://localhost:5000/api/update-status/${transactionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        statusCell.innerText = newStatus;
        alert(`Transaction ${newStatus}!`);
    } catch (error) {
        console.error("Error updating status:", error);
        alert("Error updating transaction.");
        statusCell.innerText = "Error";
    } finally {
        // Re-enable buttons
        approveBtn.disabled = false;
        rejectBtn.disabled = false;
    }
}

// WebSocket Setup
function setupSocketListeners() {
    if (typeof io !== "function") {
        console.error("Socket.IO not found! Ensure it's included in your HTML.");
        return;
    }

    const socket = io("http://localhost:5000");

    socket.on("connect", () => console.log("Connected to WebSocket server"));
    socket.on("connect_error", (err) => console.warn("Failed to connect to WebSocket server:", err));
    socket.on("disconnect", () => console.warn("Disconnected from WebSocket server"));

    // Listen for new transactions and prevent duplicates
    socket.on("newTransaction", (transaction) => {
        console.log("New transaction received:", transaction);
        addTransactionRow(transaction);
    });

    // Listen for transaction status updates
    socket.on("updateTransactionStatus", ({ transactionId, status }) => {
        console.log(`Transaction ${transactionId} updated to ${status}`);
        const statusCell = document.getElementById(`status-${transactionId}`);
        if (statusCell) statusCell.innerText = status;
    });
}
