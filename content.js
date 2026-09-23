// Bot State Machine
const STATES = {
    IDLE: 'idle',
    FILLING_FORM: 'filling_form',
    SEARCHING: 'searching',
    SCANNING_TRAINS: 'scanning_trains',
    SELECTING_SEATS: 'selecting_seats',
    CONFIRMING: 'confirming',
    COMPLETED: 'completed',
    ERROR: 'error'
};

let botState = STATES.IDLE;
let botConfig = null;

// --- HELPER FUNCTIONS ---

// Wait for element to appear
function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(selector)) return resolve(document.querySelector(selector));
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

// Wait for a button to become enabled (Angular removes 'disabled')
function waitForEnabled(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const check = () => {
            const el = document.querySelector(selector);
            if (el && !el.disabled && !el.hasAttribute('disabled')) {
                resolve(el);
                return true;
            }
            return false;
        };

        if (check()) return;

        const observer = new MutationObserver(() => {
            if (check()) observer.disconnect();
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['disabled'] });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for button to enable: ${selector}`));
        }, timeout);
    });
}

// Set value on Angular readonly input
function setAngularInput(selector, value) {
    return new Promise(async (resolve) => {
        const element = await waitForElement(selector);

        // Temporarily remove readonly to allow setting value
        const wasReadonly = element.hasAttribute('readonly');
        if (wasReadonly) element.removeAttribute('readonly');

        // Set value using native setter to bypass React/Angular shadowing
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(element, value);

        // Dispatch events so Angular's FormControl picks it up
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        // Restore readonly if it was there
        if (wasReadonly) element.setAttribute('readonly', 'readonly');

        resolve();
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- MAIN BOT LOGIC ---

async function runBot() {
    try {
        if (botState === STATES.IDLE) {
            botState = STATES.FILLING_FORM;
        }

        // ==========================================
        // STATE: FILLING_FORM
        // ==========================================
        if (botState === STATES.FILLING_FORM) {
            console.log('Bot: Filling search form...');

            // 1. Fill From Station
            await setAngularInput('#dest_from', botConfig.fromCity);
            await sleep(500);

            // 2. Fill To Station
            await setAngularInput('#dest_to', botConfig.toCity);
            await sleep(500);

            // 3. Fill Date of Journey (Special Handling for jQuery UI Datepicker + Angular)
            console.log('Bot: Setting Date of Journey...');

            const dateObj = new Date(botConfig.doj);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const monthNum = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();

            // Month names array to match the hidden input's format (e.g., "Oct")
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const monthStr = monthNames[dateObj.getMonth()];

            // The visible input needs DD/MM/YYYY (e.g., 02/10/2026)
            const visibleDate = `${day}/${monthNum}/${year}`;

            // The hidden input needs DD-MMM-YYYY (e.g., 02-Oct-2026)
            const hiddenDate = `${day}-${monthStr}-${year}`;

            // Set the visible input (#doj)
            const visibleDateInput = await waitForElement('#doj');
            const wasReadonly = visibleDateInput.hasAttribute('readonly');
            if (wasReadonly) visibleDateInput.removeAttribute('readonly');

            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(visibleDateInput, visibleDate);
            visibleDateInput.dispatchEvent(new Event('input', { bubbles: true }));
            visibleDateInput.dispatchEvent(new Event('change', { bubbles: true }));
            visibleDateInput.dispatchEvent(new Event('blur', { bubbles: true }));

            if (wasReadonly) visibleDateInput.setAttribute('readonly', 'readonly');

            // Set the hidden Angular input (formcontrolname="doj")
            const hiddenDateInput = document.querySelector('input[formcontrolname="doj"]');
            if (hiddenDateInput) {
                nativeInputValueSetter.call(hiddenDateInput, hiddenDate);
                hiddenDateInput.dispatchEvent(new Event('input', { bubbles: true }));
                hiddenDateInput.dispatchEvent(new Event('change', { bubbles: true }));
                hiddenDateInput.dispatchEvent(new Event('blur', { bubbles: true }));
                console.log(`Bot: Date set to ${hiddenDate}`);
            }

            await sleep(500);

            // 4. Select Class
            const classSelect = await waitForElement('#choose_class');
            classSelect.value = botConfig.travelClass;
            classSelect.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(500);

            // 5. Click Search Button (Wait for Angular validation to enable it)
            console.log('Bot: Waiting for Search button to become enabled...');
            const searchBtn = await waitForEnabled('button[type="submit"]');
            searchBtn.click();

            botState = STATES.SCANNING_TRAINS;
            console.log('Bot: Search submitted. Waiting for train list...');
            runBot();
        }

        // ==========================================
        // STATE: SCANNING_TRAINS
        // ==========================================
        if (botState === STATES.SCANNING_TRAINS) {
            console.log(`Bot: Scanning for class ${botConfig.travelClass} with at least ${botConfig.totalTickets} seats...`);

            // Wait for the train list to load
            await waitForElement('app-single-trip, .single-trip-wrapper', 20000);
            await sleep(2000); // Give Angular time to render all trains

            let clicked = false;

            // Helper function to find and click BOOK NOW inside a specific train
            const clickBookNowInTrain = (trainContainer) => {
                const availableWrappers = trainContainer.querySelectorAll('.single-seat-class.seat-available-wrap');

                for (const wrapper of availableWrappers) {
                    const classNameEl = wrapper.querySelector('.seat-class-name');

                    // Check if the class matches what the user requested
                    if (classNameEl && classNameEl.textContent.trim().toUpperCase() === botConfig.travelClass.toUpperCase()) {

                        // NEW: Check the number of available seats
                        const allSeatsEl = wrapper.querySelector('.all-seats');
                        if (allSeatsEl) {
                            const availableCount = parseInt(allSeatsEl.textContent.trim(), 10);

                            if (availableCount >= botConfig.totalTickets) {
                                const btn = wrapper.querySelector('.book-now-btn');
                                if (btn) {
                                    btn.click();
                                    console.log(`Bot: Found ${availableCount} seats. Clicking BOOK NOW.`);
                                    return true;
                                }
                            } else {
                                console.log(`Bot: Skipping ${classNameEl.textContent.trim()} in this train (Only ${availableCount} seats, need ${botConfig.totalTickets}).`);
                            }
                        }
                    }
                }
                return false;
            };

            // 1. Try to find the specific train first (if train name is provided)
            if (botConfig.trainName) {
                console.log(`Bot: Looking for specific train: ${botConfig.trainName}`);
                const trainWrappers = document.querySelectorAll('app-single-trip, .single-trip-wrapper');

                for (const wrapper of trainWrappers) {
                    const trainNameEl = wrapper.querySelector('h2');

                    if (trainNameEl && trainNameEl.textContent.toUpperCase().includes(botConfig.trainName.toUpperCase())) {
                        console.log(`Bot: Found train: ${trainNameEl.textContent.trim()}`);

                        clicked = clickBookNowInTrain(wrapper);

                        if (clicked) break;
                        else console.log(`Bot: Train found, but not enough seats for ${botConfig.travelClass}.`);
                    }
                }
            }

            // 2. Fallback: Scan all trains for the requested class and seat count
            if (!clicked && botConfig.fallbackTrain) {
                console.log('Bot: Scanning all available trains for matching class and seat count...');

                const allAvailableWrappers = document.querySelectorAll('.single-seat-class.seat-available-wrap');

                for (const wrapper of allAvailableWrappers) {
                    const classNameEl = wrapper.querySelector('.seat-class-name');

                    if (classNameEl && classNameEl.textContent.trim().toUpperCase() === botConfig.travelClass.toUpperCase()) {
                        const allSeatsEl = wrapper.querySelector('.all-seats');

                        if (allSeatsEl) {
                            const availableCount = parseInt(allSeatsEl.textContent.trim(), 10);

                            if (availableCount >= botConfig.totalTickets) {
                                const btn = wrapper.querySelector('.book-now-btn');
                                if (btn) {
                                    btn.click();
                                    clicked = true;
                                    console.log(`Bot: Fallback selected ${botConfig.travelClass} with ${availableCount} seats.`);
                                    break; // Stop scanning, we found one!
                                }
                            } else {
                                console.log(`Bot: Skipping option. Only ${availableCount} seats left (need ${botConfig.totalTickets}).`);
                            }
                        }
                    }
                }
            }

            // 3. If still nothing clicked, throw error
            if (!clicked) {
                throw new Error(`No train found with at least ${botConfig.totalTickets} seats in class ${botConfig.travelClass}.`);
            }

            botState = STATES.SELECTING_SEATS;
            console.log('Bot: Clicked BOOK NOW. Waiting for seat map...');
            runBot();
        }

        // ==========================================
        // STATE: SELECTING_SEATS
        // ==========================================
        if (botState === STATES.SELECTING_SEATS) {
            console.log('Bot: Waiting for coach dropdown...');

            // 1. Wait for the coach dropdown to appear
            const coachDropdown = await waitForElement('#select-bogie', 15000);
            await sleep(1000); // Give Angular a moment to populate the options

            let targetCoachValue = null;
            const options = Array.from(coachDropdown.options);

            // 2. Loop through all coaches to find one with enough available seats
            for (const option of options) {
                const text = option.textContent.trim(); // e.g., "JHA - 39 Seat(s)"

                // Skip the default option if it exists
                if (text.includes('Choose') || text === '') continue;

                // Extract the number from the text using Regex
                const match = text.match(/(\d+)\s+Seat\(s\)/);

                if (match && match[1]) {
                    const availableCount = parseInt(match[1], 10);

                    // Check if this coach has enough seats for our tickets
                    if (availableCount >= botConfig.totalTickets) {
                        targetCoachValue = option.value;
                        console.log(`Bot: Found coach "${text}" with ${availableCount} seats. Selecting...`);
                        break; // Stop looking, we found a suitable coach
                    }
                }
            }

            if (!targetCoachValue) {
                throw new Error(`No coach found with at least ${botConfig.totalTickets} available seats.`);
            }

            // 3. Select the coach in the dropdown
            coachDropdown.value = targetCoachValue;
            // Dispatch change event so Angular updates the seat map
            coachDropdown.dispatchEvent(new Event('change', { bubbles: true }));

            console.log('Bot: Coach selected. Waiting for seat map to re-render...');

            // 4. Wait for the available seat buttons to appear
            await waitForElement('.btn-seat.seat-available', 10000);
            await sleep(1000); // Small buffer for Angular to finish rendering

            // ==========================================
            // 5. FIND ADJACENT SEATS (NEW LOGIC)
            // ==========================================
            console.log(`Bot: Searching for ${botConfig.totalTickets} adjacent seats...`);

            const allRows = document.querySelectorAll('.seat-in-row');
            let seatsToClick = [];

            // Helper to extract the numeric part from a seat title (e.g., "JHA-11" -> 11)
            const getSeatNumber = (btn) => {
                const title = btn.getAttribute('title');
                if (!title) return -1;
                const parts = title.split('-');
                return parseInt(parts[parts.length - 1], 10);
            };

            // Loop through each row in the coach
            for (const row of allRows) {
                const availableBtns = Array.from(row.querySelectorAll('.btn-seat.seat-available'));

                // Skip this row if it doesn't have enough available seats
                if (availableBtns.length < botConfig.totalTickets) continue;

                // Look for a sequence of consecutive seats in this row
                for (let i = 0; i <= availableBtns.length - botConfig.totalTickets; i++) {
                    let isConsecutive = true;

                    for (let j = 0; j < botConfig.totalTickets - 1; j++) {
                        const currentNum = getSeatNumber(availableBtns[i + j]);
                        const nextNum = getSeatNumber(availableBtns[i + j + 1]);

                        // If numbers are not consecutive (e.g., 11 and 13), break the sequence check
                        if (nextNum !== currentNum + 1) {
                            isConsecutive = false;
                            break;
                        }
                    }

                    if (isConsecutive) {
                        // Found a consecutive sequence! Store these buttons.
                        for (let k = 0; k < botConfig.totalTickets; k++) {
                            seatsToClick.push(availableBtns[i + k]);
                        }
                        console.log(`Bot: Found adjacent seats starting at ${availableBtns[i].getAttribute('title')}`);
                        break; // Break out of the inner loop
                    }
                }

                // If we found our seats in this row, stop looking in other rows
                if (seatsToClick.length === botConfig.totalTickets) {
                    break;
                }
            }

            // 6. Click the seats
            if (seatsToClick.length === botConfig.totalTickets) {
                console.log(`Bot: Clicking ${botConfig.totalTickets} adjacent seats...`);
                for (const seat of seatsToClick) {
                    seat.click();
                    await sleep(500); // Human-like delay
                }
            } else {
                // Fallback: If no adjacent seats are found, select any available seats
                console.log(`Bot: Warning - Could not find ${botConfig.totalTickets} adjacent seats. Falling back to any available seats.`);
                const fallbackSeats = document.querySelectorAll('.btn-seat.seat-available');

                if (fallbackSeats.length >= botConfig.totalTickets) {
                    for (let i = 0; i < botConfig.totalTickets; i++) {
                        fallbackSeats[i].click();
                        await sleep(500);
                    }
                } else {
                    throw new Error(`Not enough seats available in this coach.`);
                }
            }

            // Proceed to next state
            botState = STATES.CONFIRMING;
            runBot();
        }

        // ==========================================
        // STATE: CONFIRMING
        // ==========================================
        // if (botState === STATES.CONFIRMING) {
        //     console.log('Bot: Proceeding to purchase...');
        //     await sleep(1500); // Wait for the UI to update after seat selection

        //     // Find the "CONTINUE PURCHASE" button
        //     const continueBtn = Array.from(document.querySelectorAll('button')).find(el =>
        //         el.textContent.toUpperCase().includes('CONTINUE PURCHASE')
        //     );

        //     if (continueBtn) {
        //         // Check if it's disabled (sometimes Angular disables it until the exact number of seats is selected)
        //         if (continueBtn.disabled || continueBtn.hasAttribute('disabled')) {
        //             console.log('Bot: Continue button is disabled. Waiting...');
        //             await sleep(2000); // Wait a bit more
        //         }

        //         continueBtn.click();
        //         botState = STATES.COMPLETED;
        //         console.log('Bot: Seats selected and "CONTINUE PURCHASE" clicked. Please complete the payment manually.');
        //     } else {
        //         throw new Error('"CONTINUE PURCHASE" button not found.');
        //     }
        // }

    } catch (error) {
        botState = STATES.ERROR;
        console.error('Bot Error:', error);
        alert(`Bot failed: ${error.message}`);
    }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'PERFORM_BOOKING') {
        botConfig = request.details;
        console.log('Bot: Received configuration:', botConfig);
        runBot();
    }
});