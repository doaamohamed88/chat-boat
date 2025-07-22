class ChatBot {
  constructor() {
    // API Configuration
    this.API_KEY = "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";
    this.API_URL = "https://openrouter.ai/api/v1/chat/completions";
    this.IMAGE_API_URL = "https://openrouter.ai/api/v1/images/generations";
    
    // Available models with fallbacks
    this.MODELS = [
      "deepseek/deepseek-r1-0528:free",
      "meta-llama/llama-3-8b-instruct:free",
      "google/gemma-7b-it:free"
    ];
    
    this.IMAGE_MODELS = [
      "stability-ai/sdxl:free",
      "playgroundai/playground-v2:free"
    ];
    
    // Rate limiting
    this.lastAPICallTime = 0;
    this.minRequestInterval = 1000; // 1 second between requests

    // DOM elements
    this.chatMessages = document.getElementById("chatMessages");
    this.messageInput = document.getElementById("messageInput");
    this.sendButton = document.getElementById("sendButton");
    this.imageButton = document.getElementById("imageButton");
    this.saveHistory = document.getElementById("saveHistory");
    this.loadHistory = document.getElementById("loadHistory");
    this.clearHistory = document.getElementById("clearHistory");
    this.typingIndicator = document.getElementById("typingIndicator");
    this.modelSelect = document.getElementById("modelSelect");
    this.imageModelSelect = document.getElementById("imageModelSelect");

    this.messageHistory = [];
    this.initializeEventListeners();
    this.loadFromLocalStorage();
  }

  initializeEventListeners() {
    this.sendButton.addEventListener("click", () => this.sendMessage());
    this.imageButton.addEventListener("click", () => this.generateImage());
    this.saveHistory.addEventListener("click", () => this.saveToLocalStorage());
    this.loadHistory.addEventListener("click", () => this.loadFromLocalStorage());
    this.clearHistory.addEventListener("click", () => this.clearLocalStorage());
    
    this.messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.sendMessage();
      }
    });
  }

  getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  formatMessage(content) {
    let formatted = content
      .replace(
        /^(\d+)\.\s*\*\*(.*?)\*\*/gm,
        '<div class="section-header"><h3><span class="section-number">$1.</span> $2</h3></div>'
      )
      .replace(/^\*\*(.*?)\*\*$/gm, '<h3 class="bold-header">$1</h3>')
      .replace(
        /^(\s*)-\s*\*\*(.*?)\*\*:\s*(.*$)/gm,
        '<li class="nested-item"><strong>$2</strong>: $3</li>'
      )
      .replace(/^(\s*)-\s*(.*$)/gm, "<li>$2</li>")
      .replace(
        /```(\w+)?\n([\s\S]*?)```/g,
        '<div class="code-block"><pre><code class="language-$1">$2</code></pre></div>'
      )
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      .replace(
        /^>\s*💡\s*\*\*(.*?)\*\*:\s*(.*$)/gm,
        '<div class="tip-block"><i class="fas fa-lightbulb"></i> <strong>$1</strong>: $2</div>'
      )
      .replace(/^>\s*(.*$)/gm, "<blockquote>$1</blockquote>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" class="external-link">$1 <i class="fas fa-external-link-alt"></i></a>'
      )
      .replace(/\*\*(.*?)\*\*/g, '<strong class="highlight">$1</strong>')
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^### (.*$)/gm, "<h4>$1</h4>")
      .replace(/^## (.*$)/gm, "<h3>$1</h3>")
      .replace(/^# (.*$)/gm, "<h2>$1</h2>")
      .replace(
        /✅/g,
        '<span class="text-success"><i class="fas fa-check-circle"></i></span>'
      )
      .replace(
        /❌/g,
        '<span class="text-danger"><i class="fas fa-times-circle"></i></span>'
      )
      .replace(
        /🌞/g,
        '<span class="text-warning"><i class="fas fa-sun"></i></span>'
      )
      .replace(
        /😊/g,
        '<span class="text-primary"><i class="fas fa-smile"></i></span>'
      )
      .replace(/💡/g, '<i class="fas fa-lightbulb text-warning"></i>')
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");

    const lines = formatted.split("<br>");
    let result = [];
    let inList = false;
    let currentList = [];

    for (let line of lines) {
      if (line.trim().startsWith("<li>")) {
        if (!inList) {
          inList = true;
          currentList = [];
        }
        currentList.push(line.trim());
      } else {
        if (inList) {
          result.push(
            '<ul class="formatted-list">' + currentList.join("") + "</ul>"
          );
          currentList = [];
          inList = false;
        }
        if (line.trim()) {
          result.push(line);
        }
      }
    }

    if (inList && currentList.length > 0) {
      result.push(
        '<ul class="formatted-list">' + currentList.join("") + "</ul>"
      );
    }

    formatted = result.join("<br>");

    if (
      !formatted.includes("<p>") &&
      !formatted.includes("<h") &&
      !formatted.includes("<li>") &&
      !formatted.includes("<div>")
    ) {
      formatted = "<p>" + formatted + "</p>";
    }

    formatted = formatted
      .replace(/<br><br>/g, "<br>")
      .replace(/<p><\/p>/g, "")
      .replace(/<p><br>/g, "<p>")
      .replace(/<br><\/p>/g, "</p>")
      .replace(/(<\/[^>]+>)<br>/g, "$1")
      .replace(/<br>(<[^>]+>)/g, "$1");

    return formatted;
  }

  addMessage(content, isUser = false, isImage = false) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isUser ? "user-message" : "bot-message"}`;

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";

    if (isImage) {
      messageContent.innerHTML = `
        <strong>Bot:</strong> Here's your generated image:
        <img src="${content.url}" alt="Generated image" class="image-message">
        <div class="image-prompt">Prompt: ${content.prompt}</div>
      `;
    } else if (isUser) {
      messageContent.innerHTML = `<strong>You:</strong> ${content}`;
    } else {
      const formattedContent = this.formatMessage(content);
      messageContent.innerHTML = `<strong>Bot:</strong> ${formattedContent}`;

      if (window.Prism) {
        setTimeout(() => {
          Prism.highlightAllUnder(messageContent);
        }, 10);
      }
    }

    const messageTime = document.createElement("div");
    messageTime.className = "message-time";
    messageTime.textContent = this.getCurrentTime();

    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(messageTime);
    this.chatMessages.appendChild(messageDiv);

    this.scrollToBottom();
  }

  scrollToBottom() {
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  showTypingIndicator() {
    this.typingIndicator.innerHTML = `
      <i class="fas fa-robot"></i>
      DeepSeek is typing...
      <div class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    this.typingIndicator.style.display = "flex";
  }

  hideTypingIndicator() {
    this.typingIndicator.style.display = "none";
  }

  disableInput() {
    this.messageInput.disabled = true;
    this.sendButton.disabled = true;
    this.imageButton.disabled = true;
    this.saveHistory.disabled = true;
    this.loadHistory.disabled = true;
    this.clearHistory.disabled = true;
    this.modelSelect.disabled = true;
    this.imageModelSelect.disabled = true;
  }

  enableInput() {
    this.messageInput.disabled = false;
    this.sendButton.disabled = false;
    this.imageButton.disabled = false;
    this.saveHistory.disabled = false;
    this.loadHistory.disabled = false;
    this.clearHistory.disabled = false;
    this.modelSelect.disabled = false;
    this.imageModelSelect.disabled = false;
    this.messageInput.focus();
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message) return;

    if (this.API_KEY === "YOUR_API_KEY_HERE") {
      this.addMessage(
        "Please set your OpenRouter API key in the script.js file.",
        false
      );
      return;
    }

    this.addMessage(message, true);
    this.messageHistory.push({ role: "user", content: message });
    this.messageInput.value = "";
    this.disableInput();
    this.showTypingIndicator();

    try {
      const response = await this.callAPI();
      const botResponse = response.choices[0].message.content;

      this.addMessage(botResponse, false);
      this.messageHistory.push({ role: "assistant", content: botResponse });
    } catch (error) {
      console.error("Error calling API:", error);
      this.addMessage(
        `Sorry, I encountered an error: ${error.message}. Please try again.`,
        false
      );
    } finally {
      this.hideTypingIndicator();
      this.enableInput();
    }
  }

  async generateImage() {
    const prompt = this.messageInput.value.trim();
    if (!prompt) {
      this.addMessage("Please enter a prompt for the image", false);
      return;
    }

    this.addMessage(`Generate image: ${prompt}`, true);
    this.messageInput.value = "";
    this.disableInput();
    this.showTypingIndicator();

    try {
      const response = await this.callImageAPI(prompt);
      let imageUrl;
      
      // Handle different response formats
      if (response.data && response.data[0] && response.data[0].url) {
        imageUrl = response.data[0].url;
      } else if (response.images && response.images[0]) {
        imageUrl = response.images[0];
      } else {
        throw new Error("Unexpected response format from image API");
      }
      
      this.addMessage({ url: imageUrl, prompt: prompt }, false, true);
      this.messageHistory.push({ 
        role: "assistant", 
        content: `Generated image with prompt: ${prompt}`,
        imageUrl: imageUrl
      });
    } catch (error) {
      console.error("Error generating image:", error);
      this.addMessage(
        `Failed to generate image. ${error.message}. Try a simpler prompt.`,
        false
      );
    } finally {
      this.hideTypingIndicator();
      this.enableInput();
    }
  }

  async callAPI(retryCount = 0) {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastAPICallTime < this.minRequestInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minRequestInterval - (now - this.lastAPICallTime))
      );
    }
    this.lastAPICallTime = Date.now();

    try {
      const currentModel = this.modelSelect.value;
      const response = await fetch(this.API_URL, {
        method: "POST",
headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${this.API_KEY}`,
  "HTTP-Referer": window.location.href, // More specific than origin
  "X-Title": "DeepSeek Chatbot",
  // OpenRouter often requires these additional headers:
  "Accept": "application/json",
  "User-Agent": "Your-App-Name/1.0"
},

        body: JSON.stringify({
          model: currentModel,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful AI assistant. Provide clear, concise, and helpful responses. Format your responses with proper markdown when appropriate.",
            },
            ...this.messageHistory,
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // Try next model if available
        if (retryCount < this.MODELS.length - 1) {
          this.modelSelect.selectedIndex = (this.modelSelect.selectedIndex + 1) % this.MODELS.length;
          return this.callAPI(retryCount + 1);
        }
        
        throw new Error(
          `API Error: ${response.status} - ${
            errorData.error?.message || "Unknown error"
          }`
        );
      }

      return await response.json();
    } catch (error) {
      console.error("API call failed:", error);
      
      // Try next model if available
      if (retryCount < this.MODELS.length - 1) {
        this.modelSelect.selectedIndex = (this.modelSelect.selectedIndex + 1) % this.MODELS.length;
        return this.callAPI(retryCount + 1);
      }
      
      throw error;
    }
  }

  async callImageAPI(prompt, retryCount = 0) {
    try {
      const currentModel = this.imageModelSelect.value;
      const response = await fetch(this.IMAGE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.API_KEY}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "DeepSeek Chatbot",
        },
        body: JSON.stringify({
          model: currentModel,
          prompt: prompt,
          n: 1,
          size: "512x512",
          steps: 20,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // Try next image model if available
        if (retryCount < this.IMAGE_MODELS.length - 1) {
          this.imageModelSelect.selectedIndex = (this.imageModelSelect.selectedIndex + 1) % this.IMAGE_MODELS.length;
          return this.callImageAPI(prompt, retryCount + 1);
        }
        
        throw new Error(
          `API Error: ${response.status} - ${
            errorData.error?.message || "Unknown error"
          }`
        );
      }

      const data = await response.json();
      
      // Handle different response formats
      if (data.data?.[0]?.url) {
        return data;
      } else if (data.images?.[0]) {
        return { data: [{ url: data.images[0] }] };
      }
      throw new Error("Unexpected response format");
      
    } catch (error) {
      console.error("Image API call failed:", error);
      
      // Try next image model if available
      if (retryCount < this.IMAGE_MODELS.length - 1) {
        this.imageModelSelect.selectedIndex = (this.imageModelSelect.selectedIndex + 1) % this.IMAGE_MODELS.length;
        return this.callImageAPI(prompt, retryCount + 1);
      }
      
      throw error;
    }
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem("chatHistory", JSON.stringify(this.messageHistory));
      this.addMessage("Chat history saved successfully.", false);
    } catch (e) {
      console.error("Error saving to localStorage:", e);
      this.addMessage("Failed to save chat history. Storage might be full.", false);
    }
  }

  loadFromLocalStorage() {
    try {
      const savedHistory = localStorage.getItem("chatHistory");
      if (savedHistory) {
        this.messageHistory = JSON.parse(savedHistory);
        this.chatMessages.innerHTML = "";
        
        this.messageHistory.forEach(msg => {
          if (msg.imageUrl) {
            this.addMessage(
              { url: msg.imageUrl, prompt: msg.content.replace("Generated image with prompt: ", "") }, 
              false, 
              true
            );
          } else {
            this.addMessage(msg.content, msg.role === "user");
          }
        });
        
        this.addMessage("Chat history loaded successfully.", false);
      } else {
        this.addMessage("No saved chat history found.", false);
      }
    } catch (e) {
      console.error("Error loading from localStorage:", e);
      this.addMessage("Failed to load chat history. Data might be corrupted.", false);
    }
  }

  clearLocalStorage() {
    try {
      localStorage.removeItem("chatHistory");
      this.messageHistory = [];
      this.chatMessages.innerHTML = `
        <div class="message bot-message">
          <div class="message-content">
            <strong>Bot:</strong> Hello! I'm DeepSeek, your AI assistant. How
            can I help you today? You can ask me anything or generate images for free!
          </div>
          <div class="message-time"></div>
        </div>
      `;
      this.addMessage("Chat history cleared.", false);
    } catch (e) {
      console.error("Error clearing localStorage:", e);
      this.addMessage("Failed to clear chat history.", false);
    }
  }

  async checkAPIStatus() {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/status");
      const data = await response.json();
      console.log("API Status:", data);
      return data.available || false;
    } catch (error) {
      console.error("Status check failed:", error);
      return false;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const chatbot = new ChatBot();
  
  // Initial API status check
  chatbot.checkAPIStatus().then(available => {
    if (!available) {
      chatbot.addMessage("Warning: The API service may be experiencing issues. Responses may be delayed.", false);
    }
  });
});