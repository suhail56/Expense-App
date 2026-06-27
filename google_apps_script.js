// ==========================================
// MASHREQ BANK EXPENSE PARSER
// For Google Apps Script
// ==========================================

// --- CONFIGURATION ---
const GITHUB_REPO = 'username/repo'; // Replace with your repository
const GITHUB_TOKEN = 'ghp_your_token_here'; // Replace with your PAT
const CATEGORY_DEFAULT = 'Other'; 
// ---------------------

function processBankEmails() {
  const searchQuery = 'from:MashreqAlerts@mashreq.com subject:"Transaction Confirmation on Mashreq Card" is:unread';
  const threads = GmailApp.search(searchQuery, 0, 10);
  
  if (threads.length === 0) {
    Logger.log("No new transactions found.");
    return;
  }

  // 1. Fetch current data.json from GitHub
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/data.json`;
  const options = {
    method: "get",
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(apiUrl, options);
  if (response.getResponseCode() !== 200) {
    Logger.log("Error fetching data.json: " + response.getContentText());
    return;
  }
  
  const fileData = JSON.parse(response.getContentText());
  const sha = fileData.sha;
  
  // Decode base64 UTF-8
  const decodedContent = Utilities.newBlob(Utilities.base64Decode(fileData.content)).getDataAsString();
  let appData = JSON.parse(decodedContent);
  
  let newTransactionsAdded = false;

  // 2. Parse Emails
  for (let i = 0; i < threads.length; i++) {
    const messages = threads[i].getMessages();
    for (let j = 0; j < messages.length; j++) {
      const msg = messages[j];
      if (msg.isUnread()) {
        const body = msg.getPlainBody();
        const tx = parseMashreqEmail(body);
        
        if (tx) {
          appData.transactions.push(tx);
          newTransactionsAdded = true;
          Logger.log(`Parsed Transaction: ${tx.amount} AED at ${tx.merchant}`);
        }
        
        // Mark as read so we don't process it again
        msg.markRead();
      }
    }
  }

  // 3. Update GitHub data.json if new transactions were added
  if (newTransactionsAdded) {
    const updatedContentStr = JSON.stringify(appData, null, 2);
    const encodedContent = Utilities.base64Encode(Utilities.newBlob(updatedContentStr).getBytes());
    
    const payload = {
      message: "Automated entry from Gmail Bank alert",
      content: encodedContent,
      sha: sha
    };
    
    const updateOptions = {
      method: "put",
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const updateResponse = UrlFetchApp.fetch(apiUrl, updateOptions);
    if (updateResponse.getResponseCode() === 200 || updateResponse.getResponseCode() === 201) {
      Logger.log("Successfully updated GitHub data.json");
    } else {
      Logger.log("Failed to update GitHub: " + updateResponse.getContentText());
    }
  }
}

function parseMashreqEmail(body) {
  try {
    // Expected text: "Your Mashreq noon Card ending with 7430 was used for a purchase of AED 19.80 at TAP*Keeta Dubai AE on 27-JUN-2026 09:21 AM."
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
      
      // Convert '27-JUN-2026 09:21 AM' to standard ISO or valid JS date format
      // Note: new Date('27-JUN-2026 09:21 AM') usually works in JS, but we can reformat if needed.
      // Easiest is to format to standard format that html datetime-local expects or just a parsable string.
      // HTML datetime-local expects YYYY-MM-DDThh:mm
      const parsedDate = new Date(dateStr);
      // Constructing YYYY-MM-DDThh:mm
      const tzOffset = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
      const localISOTime = (new Date(parsedDate - tzOffset)).toISOString().slice(0, 16);

      return {
        id: Date.now().toString() + Math.floor(Math.random() * 1000),
        date: localISOTime,
        merchant: merchant,
        category: CATEGORY_DEFAULT, // Can't auto-categorize easily without ML, so we use default
        amount: amount.toFixed(2)
      };
    }
  } catch(e) {
    Logger.log("Failed to parse email body: " + e);
  }
  return null;
}
