chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'START_BOOKING') {
        const bookingDetails = request.details;

        chrome.tabs.create({ url: 'https://eticket.railway.gov.bd/' }, (tab) => {
            const tabId = tab.id;

            const onUpdatedListener = (updatedTabId, changeInfo) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    // Send the booking details to the content script
                    chrome.tabs.sendMessage(tabId, {
                        type: 'PERFORM_BOOKING',
                        details: bookingDetails
                    });
                    chrome.tabs.onUpdated.removeListener(onUpdatedListener);
                }
            };
            chrome.tabs.onUpdated.addListener(onUpdatedListener);
        });
    }
});