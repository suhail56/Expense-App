// ==========================================
// MASHREQ BANK EXPENSE PARSER - WEB API
// For Google Apps Script
// ==========================================

// Handle POST requests from the Web Dashboard
function doPost(e) {
  try {
    const ghRepo = e.parameter.ghRepo;
    const ghToken = e.parameter.ghToken;
    let startDate = e.parameter.startDate; // Format expected: YYYY-MM-DD
    
    if (!ghRepo || !ghToken) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Missing GitHub credentials in request.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 1. Fetch current data.json from GitHub
    const apiUrl = `https://api.github.com/repos/${ghRepo}/contents/data.json`;
    const options = {
      method: "get",
      headers: {
        "Authorization": `token ${ghToken}`,
        "Accept": "application/vnd.github.v3+json"
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(apiUrl, options);
    if (response.getResponseCode() !== 200) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Error fetching data.json from GitHub.'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const fileData = JSON.parse(response.getContentText());
    const sha = fileData.sha;
    
    // Decode base64 UTF-8
    const decodedContent = Utilities.newBlob(Utilities.base64Decode(fileData.content)).getDataAsString();
    let appData = JSON.parse(decodedContent);
    
    // Create a Set of existing gmail IDs to prevent duplicates
    const existingIds = new Set();
    if (appData.transactions) {
      appData.transactions.forEach(tx => {
        if (tx.gmailId) existingIds.add(tx.gmailId);
      });
    }

    // 2. Build Gmail Search Query
    let searchQuery = 'from:MashreqAlerts@mashreq.com subject:"Transaction Confirmation on Mashreq Card"';
    if (startDate) {
      // If start date is provided, format it properly (must be YYYY/MM/DD)
      const dateParts = startDate.split('-');
      if (dateParts.length === 3) {
        searchQuery += ` after:${dateParts[0]}/${dateParts[1]}/${dateParts[2]}`;
      } else {
        searchQuery += ` is:unread`; // Fallback
      }
    } else {
      searchQuery += ` is:unread`;
    }

    // 3. Process Emails
    const threads = GmailApp.search(searchQuery, 0, 50); // Get up to 50 threads at a time
    let newTxCount = 0;

    for (let i = 0; i < threads.length; i++) {
      const messages = threads[i].getMessages();
      for (let j = 0; j < messages.length; j++) {
        const msg = messages[j];
        const msgId = msg.getId();
        
        // Skip if we already parsed this exact email
        if (existingIds.has(msgId)) {
          continue; 
        }

        const body = msg.getPlainBody();
        const tx = parseMashreqEmail(body);
        
        if (tx) {
          tx.gmailId = msgId; // Store the ID to prevent duplicates later
          appData.transactions.push(tx);
          newTxCount++;
        }
        
        // Always mark as read if it was unread
        if (msg.isUnread()) {
          msg.markRead();
        }
      }
    }

    // 4. Update GitHub data.json if new transactions were added
    if (newTxCount > 0) {
      const updatedContentStr = JSON.stringify(appData, null, 2);
      const encodedContent = Utilities.base64Encode(Utilities.newBlob(updatedContentStr).getBytes());
      
      const payload = {
        message: `Automated sync: Added ${newTxCount} transactions`,
        content: encodedContent,
        sha: sha
      };
      
      const updateOptions = {
        method: "put",
        headers: {
          "Authorization": `token ${ghToken}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      
      const updateResponse = UrlFetchApp.fetch(apiUrl, updateOptions);
      if (updateResponse.getResponseCode() !== 200 && updateResponse.getResponseCode() !== 201) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Failed to save updated database to GitHub.'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Success Response
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: newTxCount > 0 ? `Successfully synced ${newTxCount} new transactions!` : `Sync completed. No new transactions found.`
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle GET requests so the script URL doesn't just error out if visited in browser
function doGet(e) {
  return ContentService.createTextOutput("Mashreq Expense Sync API is active. Please use POST to sync.");
}

// Keep the old function for backward compatibility with time-driven triggers
// However, the POST webhook method is now highly recommended.
function processBankEmails() {
  Logger.log("This function is deprecated. Use the Web App Webhook POST method instead.");
}

function parseMashreqEmail(body) {
  try {
    const amountRegex = /purchase of AED ([\d,.]+)/i;
    const merchantRegex = /at (.*?) on \d{2}-[A-Z]{3}-\d{4}/i;
    const dateRegex = /on (\d{2}-[A-Z]{3}-\d{4} \d{2}:\d{2} (?:AM|PM))/i;

    const amountMatch = body.match(amountRegex);
    const merchantMatch = body.match(merchantRegex);
    const dateMatch = body.match(dateRegex);

    if (amountMatch && merchantMatch && dateMatch) {
      let amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      let merchant = merchantMatch[1].trim();
      let dateStr = dateMatch[1].trim(); 
      
      const parsedDate = new Date(dateStr);
      const tzOffset = (new Date()).getTimezoneOffset() * 60000; 
      const localISOTime = (new Date(parsedDate - tzOffset)).toISOString().slice(0, 16);

      return {
        id: Date.now().toString() + Math.floor(Math.random() * 1000),
        date: localISOTime,
        merchant: merchant,
        type: 'expense',
        category: 'Other', 
        amount: amount.toFixed(2)
      };
    }
  } catch(e) {
    // silently fail for bad formats
  }
  return null;
}
