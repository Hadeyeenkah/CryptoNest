document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("withdrawForm");
    const paymentMethod = document.getElementById("paymentMethod");
    const cryptoField = document.getElementById("cryptoField");
    const walletAddress = document.getElementById("walletAddress");
    const message = document.getElementById("message");

    // Show/hide crypto wallet input field
    paymentMethod.addEventListener("change", function () {
        cryptoField.style.display = (paymentMethod.value === "crypto") ? "block" : "none";
        walletAddress.required = (paymentMethod.value === "crypto");
    });

    // Handle form submission
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        
        const amount = parseFloat(document.getElementById("amount").value);
        const selectedMethod = paymentMethod.value;
        const wallet = walletAddress.value.trim();

        // Validate minimum withdrawal amount
        if (amount < 10) {
            message.textContent = "Minimum withdrawal is $10.";
            message.style.color = "red";
            return;
        }

        // Validate wallet address if crypto is selected
        if (selectedMethod === "crypto" && wallet === "") {
            message.textContent = "Please enter your wallet address.";
            message.style.color = "red";
            return;
        }

        // Simulate successful withdrawal
        message.textContent = "Withdrawal request submitted successfully!";
        message.style.color = "green";

        // Clear form after submission
        form.reset();
        cryptoField.style.display = "none";
    });
});
