const socket = io("http://localhost:3000");
let username = prompt("Enter your name (Buzz or Bee):");

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
function sendImage() {
  const input = document.getElementById("imageInput");
  const file = input.files[0];
  if (file && file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const imageData = {
        user: username,
        img: e.target.result // base64 image
      };
      socket.emit("chat image", imageData);
      appendImage(imageData, "sent");
      input.value = ""; // clear input
    };
    reader.readAsDataURL(file);
  } else {
    alert("Please select a valid image file.");
  }
}

function appendImage(data, type) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${type}`;
  msgDiv.innerHTML = `<strong>${data.user}:</strong><br><img src="${data.img}" class="img-fluid rounded" style="max-width: 200px;" />`;
  document.getElementById("messages").appendChild(msgDiv);
  msgDiv.scrollIntoView({ behavior: "smooth" });
}

// Receive image
socket.on("chat image", (data) => {
  appendImage(data, "received");
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
// Theme toggle
// document.getElementById("themeToggle").addEventListener("click", () => {
//   document.body.classList.toggle("dark-mode");

//   const isDark = document.body.classList.contains("dark-mode");
//   document.getElementById("themeToggle").textContent = isDark ? "☀️" : "🌙";

//   // Optionally store preference
//   localStorage.setItem("chatTheme", isDark ? "dark" : "light");
// });

// // Load saved theme on page load
// window.addEventListener("DOMContentLoaded", () => {
//   const savedTheme = localStorage.getItem("chatTheme");
//   if (savedTheme === "dark") {
//     document.body.classList.add("dark-mode");
//     document.getElementById("themeToggle").textContent = "☀️";
//   }
// });
