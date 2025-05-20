// script.js - Updated to work with MongoDB Atlas integration

// You can switch between production and development servers
const socket = io("https://beechat-backend.onrender.com");
// const socket = io("http://localhost:3000");

let username = prompt("Enter your name (Buzz or Bee):");
if (!username) username = "Anonymous" + Math.floor(Math.random() * 1000);

// Function to load chat history when page loads
window.addEventListener("DOMContentLoaded", () => {
  // History will now be loaded automatically from server when socket connects
  
  // Load saved theme
  const savedTheme = localStorage.getItem("chatTheme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("themeToggle").textContent = "☀️";
  }
});

// Function for sending regular text messages
function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  if (message !== "") {
    const data = { user: username, msg: message };
    socket.emit("chat message", data);
    appendMessage(data, "sent");
    input.value = "";
  }
}

// Updated function to send images using chunking
function sendImage() {
  const input = document.getElementById("imageInput");
  const file = input.files[0];
  
  if (file && file.type.startsWith("image/")) {
    // Create loading indicator
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message sent upload-progress";
    loadingDiv.innerHTML = `<strong>${username}:</strong><br>Sending image... <span id="upload-progress">0%</span>`;
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
        loadingDiv.innerHTML = `<strong>${username}:</strong><br>Failed to send image. ${error.message}`;
        loadingDiv.classList.remove("upload-progress");
      }
    };
    
    reader.readAsDataURL(file);
  } else {
    alert("Please select a valid image file.");
  }
}

// Function to send large images by splitting them into chunks
function sendLargeImage(imageData, fileName, fileType, loadingElement) {
  return new Promise((resolve, reject) => {
    // Set chunk size (100KB)
    const chunkSize = 100000;
    
    // Generate a unique ID for this file transfer
    const fileId = 'img_' + Date.now();
    
    // Calculate total chunks
    const totalChunks = Math.ceil(imageData.length / chunkSize);
    
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
    
    const sendNextChunk = () => {
      if (chunkIndex >= totalChunks) {
        resolve();
        return;
      }
      
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, imageData.length);
      const chunk = imageData.slice(start, end);
      
      // Send the chunk
      socket.emit('image-chunk', {
        fileId: fileId,
        chunkIndex: chunkIndex,
        chunk: chunk,
        last: chunkIndex === totalChunks - 1
      });
      
      // Update progress indicator
      const progress = Math.floor((chunkIndex + 1) / totalChunks * 100);
      if (loadingElement) {
        const progressSpan = loadingElement.querySelector("#upload-progress");
        if (progressSpan) {
          progressSpan.textContent = `${progress}%`;
        }
      }
      
      chunkIndex++;
      
      // Use a small delay between chunks
      setTimeout(sendNextChunk, 50);
    };
    
    sendNextChunk();
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
  appendImage({
    user: data.user,
    img: data.imageData
  }, "received");
});

function appendMessage(data, type) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${type}`;
  msgDiv.innerHTML = `<strong>${data.user}:</strong> ${data.msg}`;
  document.getElementById("messages").appendChild(msgDiv);
  msgDiv.scrollIntoView({ behavior: "smooth" });
}

socket.on("chat message", (data) => {
  appendMessage(data, "received");
  if (document.hidden && Notification.permission === "granted") {
    new Notification(`${data.user} says:`, { body: data.msg });
  }
});

if (Notification.permission !== "granted") {
  Notification.requestPermission();
}

// 🔥 Send message on Enter key
document.getElementById("messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

socket.on("user status", (data) => {
  const indicator = document.getElementById("status-indicator");
  const text = document.getElementById("status-text");
  if (data.online) {
    indicator.style.backgroundColor = "green";
    text.innerText = "Someone is online";
  } else {
    indicator.style.backgroundColor = "gray";
    text.innerText = "No one else is online";
  }
});

function saveConversation() {
  const chatBox = document.getElementById("messages");
  // Use html2canvas to capture the entire chat box including all messages (even if it's scrolled)
  html2canvas(chatBox, {
    scrollX: 0, // Ensure scrolling doesn't affect the capture
    scrollY: -window.scrollY, // Adjust for any page scrolling
    useCORS: true, // Enable cross-origin resource sharing to load external images
  }).then((canvas) => {
    const link = document.createElement("a");
    link.download = "chat.png"; // The name of the downloaded image
    link.href = canvas.toDataURL("image/png"); // Convert the canvas to an image URL
    link.click(); // Trigger the download
  });
}

// Theme toggle functionality
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  document.getElementById("themeToggle").textContent = isDark ? "☀️" : "🌙";
  // Store preference
  localStorage.setItem("chatTheme", isDark ? "dark" : "light");
});
