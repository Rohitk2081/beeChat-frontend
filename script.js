// script.js - Updated to work with MongoDB Atlas integration with improved error handling

// You can switch between production and development servers
const socket = io("https://beechat-backend.onrender.com", {
  timeout: 20000, // 20 second timeout
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
// const socket = io("http://localhost:3000");

let username = prompt("Enter your name (Buzz or Bee):");
if (!username) username = "Anonymous" + Math.floor(Math.random() * 1000);
let isConnected = false;

// Connection status handling
socket.on('connect', () => {
  console.log('Connected to server');
  isConnected = true;
  updateConnectionStatus(true);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  isConnected = false;
  updateConnectionStatus(false);
});

socket.on('reconnect', () => {
  console.log('Reconnected to server');
  isConnected = true;
  updateConnectionStatus(true);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  updateConnectionStatus(false);
});

// Function to update connection status in UI
function updateConnectionStatus(connected) {
  const statusElement = document.getElementById('connection-status');
  if (!statusElement) {
    // Create status element if it doesn't exist
    const statusDiv = document.createElement('div');
    statusDiv.id = 'connection-status';
    statusDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(statusDiv);
  }
  
  const statusEl = document.getElementById('connection-status');
  if (connected) {
    statusEl.textContent = '🟢 Connected';
    statusEl.style.backgroundColor = '#d4edda';
    statusEl.style.color = '#155724';
    statusEl.style.border = '1px solid #c3e6cb';
  } else {
    statusEl.textContent = '🔴 Disconnected';
    statusEl.style.backgroundColor = '#f8d7da';
    statusEl.style.color = '#721c24';
    statusEl.style.border = '1px solid #f5c6cb';
  }
}

// Function to load chat history when page loads
window.addEventListener("DOMContentLoaded", () => {
  // History will now be loaded automatically from server when socket connects
  
  // Load saved theme
  const savedTheme = localStorage.getItem("chatTheme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("themeToggle").textContent = "☀️";
  }
  
  // Initialize connection status
  updateConnectionStatus(isConnected);
});

// Function for sending regular text messages
function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  
  if (!isConnected) {
    alert("Not connected to server. Please wait for reconnection.");
    return;
  }
  
  if (message !== "") {
    const data = { user: username, msg: message };
    
    try {
      socket.emit("chat message", data);
      appendMessage(data, "sent");
      input.value = "";
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    }
  }
}

// Updated function to send images using chunking
function sendImage() {
  const input = document.getElementById("imageInput");
  const file = input.files[0];
  
  if (!isConnected) {
    alert("Not connected to server. Please wait for reconnection.");
    return;
  }
  
  if (file && file.type.startsWith("image/")) {
    // Check file size (limit to 5MB to prevent issues)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert("Image is too large. Please select an image smaller than 5MB.");
      return;
    }
    
    // Create loading indicator
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message sent upload-progress";
    loadingDiv.innerHTML = `<strong>${username}:</strong><br>Sending image... <span id="upload-progress-${Date.now()}">0%</span>`;
    document.getElementById("messages").appendChild(loadingDiv);
    loadingDiv.scrollIntoView({ behavior: "smooth" });
    
    const reader = new FileReader();
    reader.onload = async function(e) {
      const imageData = e.target.result; // base64 image
      
      try {
        // Send the image in chunks
        await sendLargeImage(imageData, file.name, file.type, loadingDiv);
        
        // Replace loading indicator with the actual image
        loadingDiv.innerHTML = `<strong>${username}:</strong><br><img src="${imageData}" class="img-fluid rounded" style="max-width: 200px;" />`;
        loadingDiv.classList.remove("upload-progress");
        
        input.value = ""; // clear input
      } catch (error) {
        console.error("Error sending image:", error);
        loadingDiv.innerHTML = `<strong>${username}:</strong><br>❌ Failed to send image: ${error.message}`;
        loadingDiv.classList.remove("upload-progress");
      }
    };
    
    reader.onerror = function() {
      alert("Error reading image file. Please try again.");
    };
    
    reader.readAsDataURL(file);
  } else {
    alert("Please select a valid image file.");
  }
}

// Function to send large images by splitting them into chunks
function sendLargeImage(imageData, fileName, fileType, loadingElement) {
  return new Promise((resolve, reject) => {
    // Set chunk size (50KB - reduced from 100KB for better reliability)
    const chunkSize = 50000;
    
    // Generate a unique ID for this file transfer
    const fileId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Calculate total chunks
    const totalChunks = Math.ceil(imageData.length / chunkSize);
    
    console.log(`Sending image: ${fileName}, Size: ${imageData.length} bytes, Chunks: ${totalChunks}`);
    
    try {
      // Send metadata first
      socket.emit('image-metadata', {
        fileId: fileId,
        fileName: fileName,
        fileType: fileType,
        totalChunks: totalChunks,
        fileSize: imageData.length,
        user: username
      });
      
      // Send each chunk with a small delay to prevent overwhelming the connection
      let chunkIndex = 0;
      let successfulChunks = 0;
      
      const sendNextChunk = () => {
        if (chunkIndex >= totalChunks) {
          if (successfulChunks === totalChunks) {
            console.log(`Image transfer completed: ${successfulChunks}/${totalChunks} chunks`);
            resolve();
          } else {
            reject(new Error(`Transfer incomplete: ${successfulChunks}/${totalChunks} chunks sent`));
          }
          return;
        }
        
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, imageData.length);
        const chunk = imageData.slice(start, end);
        
        try {
          // Send the chunk
          socket.emit('image-chunk', {
            fileId: fileId,
            chunkIndex: chunkIndex,
            chunk: chunk,
            last: chunkIndex === totalChunks - 1
          });
          
          successfulChunks++;
          
          // Update progress indicator
          const progress = Math.floor((chunkIndex + 1) / totalChunks * 100);
          if (loadingElement) {
            const progressSpan = loadingElement.querySelector('[id^="upload-progress"]');
            if (progressSpan) {
              progressSpan.textContent = `${progress}%`;
            }
          }
          
          chunkIndex++;
          
          // Use a small delay between chunks (reduced for faster upload)
          setTimeout(sendNextChunk, 25);
          
        } catch (error) {
          console.error(`Error sending chunk ${chunkIndex}:`, error);
          reject(new Error(`Failed to send chunk ${chunkIndex}: ${error.message}`));
        }
      };
      
      sendNextChunk();
      
    } catch (error) {
      console.error('Error initiating image transfer:', error);
      reject(new Error(`Failed to start image transfer: ${error.message}`));
    }
  });
}

function appendImage(data, type) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${type}`;
  msgDiv.innerHTML = `<strong>${data.user}:</strong><br><img src="${data.img}" class="img-fluid rounded" style="max-width: 200px;" />`;
  document.getElementById("messages").appendChild(msgDiv);
  msgDiv.scrollIntoView({ behavior: "smooth" });
}

// Receive complete image
socket.on("image-complete", (data) => {
  try {
    appendImage({
      user: data.user,
      img: data.imageData
    }, "received");
  } catch (error) {
    console.error('Error displaying received image:', error);
  }
});

function appendMessage(data, type) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${type}`;
  msgDiv.innerHTML = `<strong>${data.user}:</strong> ${data.msg}`;
  document.getElementById("messages").appendChild(msgDiv);
  msgDiv.scrollIntoView({ behavior: "smooth" });
}

socket.on("chat message", (data) => {
  try {
    appendMessage(data, "received");
    if (document.hidden && Notification.permission === "granted") {
      new Notification(`${data.user} says:`, { body: data.msg });
    }
  } catch (error) {
    console.error('Error displaying received message:', error);
  }
});

// Request notification permission
if (Notification.permission !== "granted" && Notification.permission !== "denied") {
  Notification.requestPermission();
}

// 🔥 Send message on Enter key
document.getElementById("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault(); // Prevent form submission
    sendMessage();
  }
});

socket.on("user status", (data) => {
  try {
    const indicator = document.getElementById("status-indicator");
    const text = document.getElementById("status-text");
    if (indicator && text) {
      if (data.online) {
        indicator.style.backgroundColor = "green";
        text.innerText = "Someone is online";
      } else {
        indicator.style.backgroundColor = "gray";
        text.innerText = "No one else is online";
      }
    }
  } catch (error) {
    console.error('Error updating user status:', error);
  }
});

function saveConversation() {
  const chatBox = document.getElementById("messages");
  if (!chatBox) {
    alert("No messages to save.");
    return;
  }
  
  // Check if html2canvas is available
  if (typeof html2canvas === 'undefined') {
    alert("Screenshot feature is not available. Please ensure html2canvas library is loaded.");
    return;
  }
  
  // Use html2canvas to capture the entire chat box including all messages
  html2canvas(chatBox, {
    scrollX: 0,
    scrollY: -window.scrollY,
    useCORS: true,
    allowTaint: true,
    scale: 1,
  }).then((canvas) => {
    const link = document.createElement("a");
    link.download = `chat_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }).catch((error) => {
    console.error('Error saving conversation:', error);
    alert("Failed to save conversation. Please try again.");
  });
}

// Theme toggle functionality
document.getElementById("themeToggle").addEventListener("click", () => {
  try {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    document.getElementById("themeToggle").textContent = isDark ? "☀️" : "🌙";
    // Store preference
    localStorage.setItem("chatTheme", isDark ? "dark" : "light");
  } catch (error) {
    console.error('Error toggling theme:', error);
  }
});

// Add some debugging for the MongoDB issue
socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Handle case where chat history might fail to load
setTimeout(() => {
  const messages = document.getElementById("messages");
  if (messages && messages.children.length === 0 && isConnected) {
    console.log('No chat history loaded, this might indicate a server issue');
    const infoDiv = document.createElement("div");
    infoDiv.className = "message received";
    infoDiv.innerHTML = `<em>📝 Chat history could not be loaded. This might be due to server maintenance.</em>`;
    messages.appendChild(infoDiv);
  }
}, 5000); // Wait 5 seconds before showing this message
