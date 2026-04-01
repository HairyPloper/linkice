/**
 * js/notifications.js
 * Tab title and favicon badge notifications for desktop,
 * app icon badge for mobile PWA
 * 
 * WORKS FOR ALL URLS - notifies only for messages in YOUR current channel
 */

// ============================================================
// NOTIFICATION MANAGER
// Tracks unread messages and updates tab/icon badges
// Active for ALL channels, notifies only for current channel messages
// ============================================================

class NotificationManager {
  constructor() {
    this.unreadCount = 0;
    this.originalTitle = document.title;
    this.customIconHref = "favicon-v1.png";
    this.isTabVisible = !document.hidden;
    this.lastNotificationTime = 0;
    this.notificationCooldown = 3000; // 3 seconds between notifications
    
    // Get current channel/space from URL (if any)
    const params = new URLSearchParams(window.location.search);
    this.currentSpace = params.get("space") || "main"; // "main" for base URL
    
    console.log(`📢 Notifications enabled for channel: "${this.currentSpace}"`);
    
    this.setupVisibilityListener();
    this.setupMobileBadge();
    this.checkBrowserNotificationSupport();
  }
  
  setupVisibilityListener() {
    document.addEventListener("visibilitychange", () => {
      this.isTabVisible = !document.hidden;
      if (this.isTabVisible) {
        this.clearNotifications();
      }
    });
    
    window.addEventListener("focus", () => {
      this.isTabVisible = true;
      this.clearNotifications();
    });
    
    window.addEventListener("blur", () => {
      this.isTabVisible = false;
    });
  }
  
  setupMobileBadge() {
    if ("setAppBadge" in navigator) {
      console.log("✅ App Badge API supported");
    }
  }
  
  checkBrowserNotificationSupport() {
    if (!("Notification" in window)) {
      console.log("❌ Browser notifications not supported");
      return;
    }
    
    console.log(`🔔 Browser notifications: ${Notification.permission}`);
  }
  
  /**
   * Increment unread count and show notifications
   * @param {Object} options - Message details for notifications
   * @param {string} options.username - Sender's name
   * @param {string} options.text - Message text
   * @param {boolean} options.isSystem - Is this a system message
   */
  incrementUnread(options = {}) {
    if (this.isTabVisible) return; // Don't notify if user is watching
    
    const { username, text, isSystem } = options;
    
    // Don't notify for system messages
    if (isSystem) return;
    
    this.unreadCount++;
    this.updateNotifications();
    
    // Show browser notification (if enabled and not on cooldown)
    const now = Date.now();
    if (username && text && (now - this.lastNotificationTime) > this.notificationCooldown) {
      this.showBrowserNotification(username, text);
      this.lastNotificationTime = now;
    }
  }
  
  updateNotifications() {
    // Tab title
    if (this.unreadCount > 0) {
      document.title = `(${this.unreadCount}) ${this.originalTitle}`;
    } else {
      document.title = this.originalTitle;
    }
    
    this.updateFavicon();
    this.updateMobileBadge();
  }
  
  clearNotifications() {
    if (this.unreadCount === 0) return;
    
    this.unreadCount = 0;
    this.updateNotifications();
    console.log("🔕 Notifications cleared");
  }
  
  updateFavicon() {
    let faviconLink = document.querySelector("link[rel*='icon']");
    
    if (!faviconLink) {
      faviconLink = document.createElement("link");
      faviconLink.rel = "icon";
      faviconLink.type = "image/png";
      document.head.appendChild(faviconLink);
    }
    
    if (this.unreadCount === 0) {
      // Default icon
      if (faviconLink) faviconLink.href = this.customIconHref;
        return;
    }
    
    // If there are messages, draw the badge OVER your icon
    const img = new Image();
    img.src = this.customIconHref;
    
    img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");

        // 1. Draw your original favicon as the background
        ctx.drawImage(img, 0, 0, 64, 64);

        // 2. Draw the red notification badge in the corner
        const badgeSize = 30;
        const badgeX = 48;
        const badgeY = 16;

        ctx.fillStyle = "#ef4444"; // Red
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeSize / 2, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = "#ffffff"; // White text
        ctx.font = "bold 18px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const countText = this.unreadCount > 99 ? "99+" : String(this.unreadCount);
        ctx.fillText(countText, badgeX, badgeY);

        if (faviconLink) faviconLink.href = canvas.toDataURL("image/png");
    };
  }
  
  updateMobileBadge() {
    if (!("setAppBadge" in navigator)) return;
    
    if (this.unreadCount > 0) {
      navigator.setAppBadge(this.unreadCount).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }
  
  /**
   * Request notification permission (call when user joins)
   */
  async requestPermission() {
    if (!("Notification" in window)) return false;
    
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    
    const permission = await Notification.requestPermission();
    console.log(`🔔 Notification permission ${permission}`);
    return permission === "granted";
  }
  
  /**
   * Show browser notification
   */
  showBrowserNotification(username, message) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (this.isTabVisible) return;
    
    const truncatedMessage = message.length > 80 
      ? message.substring(0, 80) + "..." 
      : message;
    
    // Include space/channel info in notification title
    const title = this.currentSpace === "main" 
      ? `${username} u Linkice`
      : `${username} u ${this.currentSpace}`;
    
    const notification = new Notification(title, {
      body: truncatedMessage,
      icon: this.customIconHref,
      badge: this.customIconHref,
      tag: `linkice-${this.currentSpace}`,
      requireInteraction: false,
      silent: false,
    });
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    setTimeout(() => notification.close(), 4000);
  }
}

// ============================================================
// INITIALIZE
// ============================================================
window.notificationManager = new NotificationManager();

// ============================================================
// INTEGRATION HELPER
// Automatically hooks into your existing appendMessage function
// ============================================================
window.setupNotificationIntegration = function() {
  // Hook into appendMessage
  if (window.appendMessage) {
    const originalAppendMessage = window.appendMessage;
    
    window.appendMessage = function(name, text, color, snapshotKey, data) {
      const result = originalAppendMessage.apply(this, arguments);
      
      // Track notification for messages in THIS channel only
      // (Firebase already filters messages by channel, so we only see
      // messages from our current channel here)
      if (data && window.notificationManager) {
        const isMe = data.username === window.myDisplayName;
        const isSystem = name === "Sistem";
        
        // Only notify for messages from other users (not system, not me)
        if (!isMe && !isSystem) {
          window.notificationManager.incrementUnread({
            username: name,
            text: text,
            isSystem: isSystem
          });
        }
      }
      
      return result;
    };
    
    console.log("✅ Notification integration ready");
  }
  
  // Hook into join button to request permission
  const joinBtn = document.getElementById("join-btn");
  if (joinBtn) {
    const originalOnClick = joinBtn.onclick;
    joinBtn.onclick = async function() {
      // Request notification permission first
      if (window.notificationManager) {
        await window.notificationManager.requestPermission();
      }
      // Then call original join handler
      if (originalOnClick) {
        return originalOnClick.apply(this, arguments);
      }
    };
  }
};

// Auto-setup when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(window.setupNotificationIntegration, 500);
  });
} else {
  setTimeout(window.setupNotificationIntegration, 500);
}

console.log("📢 Notification system loaded");
