// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['bookingConfig'], (result) => {
        if (result.bookingConfig) {
            const config = result.bookingConfig;
            document.getElementById('fromCity').value = config.fromCity || '';
            document.getElementById('toCity').value = config.toCity || '';
            document.getElementById('doj').value = config.doj || '';
            document.getElementById('travelClass').value = config.travelClass || 'SHOVAN';
            document.getElementById('trainName').value = config.trainName || '';
            document.getElementById('totalTickets').value = config.totalTickets || 1;
            document.getElementById('autoSeats').checked = config.autoSeats ?? true;
            document.getElementById('autoContinue').checked = config.autoContinue ?? true;
            document.getElementById('fallbackTrain').checked = config.fallbackTrain ?? true;
        }
    });
});

document.getElementById('startBot').addEventListener('click', () => {
    const bookingDetails = {
        fromCity: document.getElementById('fromCity').value.trim(),
        toCity: document.getElementById('toCity').value.trim(),
        doj: document.getElementById('doj').value,
        travelClass: document.getElementById('travelClass').value,
        trainName: document.getElementById('trainName').value.trim(),
        totalTickets: parseInt(document.getElementById('totalTickets').value, 10),
        autoSeats: document.getElementById('autoSeats').checked,
        autoContinue: document.getElementById('autoContinue').checked,
        fallbackTrain: document.getElementById('fallbackTrain').checked
    };

    if (!bookingDetails.fromCity || !bookingDetails.toCity || !bookingDetails.doj) {
        alert('Please fill in From, To, and Date of Journey.');
        return;
    }

    // Save settings for next time
    chrome.storage.local.set({ bookingConfig: bookingDetails });

    // Update UI
    document.getElementById('status').textContent = 'Bot started... Opening website.';
    document.getElementById('startBot').disabled = true;

    // Send to background script
    chrome.runtime.sendMessage({ type: 'START_BOOKING', details: bookingDetails });

    // Close popup after a short delay
    setTimeout(() => window.close(), 1500);
});