/**
 * js/notifications.js
 */

class NotificationManager {
  constructor() {
    this.unreadCount = 0;
    this.vapidPublicKey = 'BIk7HNsAeC1XBnAxrr7jbDUiblf1ed3EEm7IbBEtnJCGTXIIcrmuvCMjDoQT4kqRkn8G-lCHbBhDhsmAtSPvijs';
    this.originalTitle = document.title;
    this.customIconHref = "favicon-v1.png";
    this.isTabVisible = !document.hidden;
    this.lastNotificationTime = 0;
    this.notificationCooldown = 3000;
    
    const params = new URLSearchParams(window.location.search);
    this.currentSpace = window.CHANNEL || params.get("space") || "Linkice";
    this.deviceId = this.getOrCreateDeviceId();
    
    this.setupVisibilityListener();
    this.setupMobileBadge();
    this.checkBrowserNotificationSupport();
  }

  getOrCreateDeviceId() {
    const key = "pushDeviceId";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }
  
  setupVisibilityListener() {
    document.addEventListener("visibilitychange", () => {
      this.isTabVisible = !document.hidden;
      if (this.isTabVisible) this.clearNotifications();
    });
    window.addEventListener("focus", () => {
      this.isTabVisible = true;
      this.clearNotifications();
    });
  }
  
  setupMobileBadge() {
    if ("setAppBadge" in navigator) console.log("✅ App Badge API supported");
  }
  
  checkBrowserNotificationSupport() {
    if (!("Notification" in window)) return;
    console.log(`🔔 Browser notifications: ${Notification.permission}`);
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async ensurePushSubscription() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (!("Notification" in window)) return false;
  
    try {
      const registration = await navigator.serviceWorker.ready;
  
      // If user blocked notifications, stop here
      if (Notification.permission === "denied") return false;
  
      // Ask only when still default
      if (Notification.permission === "default") {
        const p = await Notification.requestPermission();
        if (p !== "granted") return false;
      }
  
      let sub = await registration.pushManager.getSubscription();
  
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey),
        });
        console.log("✅ New push subscription created");
      } else {
        console.log("ℹ️ Existing push subscription found");
      }
  
      const subData = sub.toJSON();
      const payload = {
        ...subData,
        deviceId: this.deviceId,
        userId: firebase.auth().currentUser?.uid || null,
        username: window.myDisplayName || null,
        space: window.CHANNEL || this.currentSpace,
        updatedAt: Date.now(),
      };
  
      await firebase.database().ref(`push_subscriptions/${this.deviceId}`).set(payload);
      console.log("✅ Push subscription synced to RTDB");
      return true;
    } catch (err) {
      console.error("❌ ensurePushSubscription failed:", err);
      return false;
    }
  }

  /**
   * NEW: Register the Service Worker and subscribe to Push Notifications with FCM
   */
  async registerAndSubscribe() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
    });

    const subData = JSON.parse(JSON.stringify(subscription));
    const currentUserId = firebase.auth().currentUser?.uid || null;
    const payload = {
      ...subData,
      deviceId: this.deviceId,
      userId: currentUserId,
      username: window.myDisplayName || null,
      space: window.CHANNEL || this.currentSpace,
      updatedAt: Date.now()
    };

    // Save to Firebase
    await firebase.database().ref(`push_subscriptions/${this.deviceId}`).set(payload);
    
    console.log(`✅ Push address saved for device: ${this.deviceId}`);
    
  } catch (err) {
    console.error('❌ Handshake failed:', err);
  }
  }

  /**
   * NEW: Send a request to Vercel to trigger a Push for everyone
   */
  async triggerGlobalPush(username, text) {
    try {
      await fetch('https://my-proxy-vercel-kappa.vercel.app/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderUsername: username,
          senderUserId: firebase.auth().currentUser?.uid || null,
          senderDeviceId: this.deviceId,
          space: window.CHANNEL || this.currentSpace,
          title: `Nova poruka od ${username}`,
          message: text
        })
      });
    } catch (err) {
      console.error('❌ Push trigger failed:', err);
    }
  }

  incrementUnread(options = {}) {
    if (this.isTabVisible) return;
    const { username, text, isSystem } = options;
    if (isSystem) return;
    
    this.unreadCount++;
    this.updateNotifications();
    
    const now = Date.now();
    if (username && text && (now - this.lastNotificationTime) > this.notificationCooldown) {
      this.showBrowserNotification(username, text);
      this.lastNotificationTime = now;
    }
  }
  
  updateNotifications() {
    document.title = this.unreadCount > 0 ? `(${this.unreadCount}) ${this.originalTitle}` : this.originalTitle;
    this.updateFavicon();
    this.updateMobileBadge();
  }
  
  clearNotifications() {
    if (this.unreadCount === 0) return;
    this.unreadCount = 0;
    this.updateNotifications();
  }
  
  updateFavicon() {
    let faviconLink = document.querySelector("link[rel*='icon']");
    if (!faviconLink) {
        faviconLink = document.createElement("link");
        faviconLink.rel = "icon";
        document.head.appendChild(faviconLink);
    }
    
    if (this.unreadCount === 0) {
        faviconLink.href = this.customIconHref;
        return;
    }
    
    const img = new Image();
    img.src = this.customIconHref;
    img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 64, 64);
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(48, 16, 15, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.unreadCount > 99 ? "99+" : String(this.unreadCount), 48, 16);
        faviconLink.href = canvas.toDataURL("image/png");
    };
  }
  
  updateMobileBadge() {
    if (!("setAppBadge" in navigator)) return;
    if (this.unreadCount > 0) navigator.setAppBadge(this.unreadCount).catch(() => {});
    else navigator.clearAppBadge().catch(() => {});
  }
  
  async requestPermission() {
    if (!("Notification" in window)) return false;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
        await this.registerAndSubscribe(); // <--- Hook FCM here
    }
    return permission === "granted";
  }
  
  showBrowserNotification(username, message) {
    if (Notification.permission !== "granted" || this.isTabVisible) return;
    const title = this.currentSpace === "main" ? `${username} u Linkice` : `${username} u ${this.currentSpace}`;
    const notification = new Notification(title, {
      body: message.substring(0, 80),
      icon: this.customIconHref,
      badge: this.customIconHref,
      tag: `linkice-${this.currentSpace}`,
    });
    notification.onclick = () => { window.focus(); notification.close(); };
    setTimeout(() => notification.close(), 4000);
  }
}

window.notificationManager = new NotificationManager();

window.setupNotificationIntegration = function() {
  let isInitialLoad = true;
  setTimeout(() => { isInitialLoad = false; }, 3000);

  if (window.appendMessage) {
    const originalAppendMessage = window.appendMessage;
    window.appendMessage = function(name, text, color, snapshotKey, data) {
      const result = originalAppendMessage.apply(this, arguments);
      if (isInitialLoad) return result;
      if (data && window.notificationManager) {
        const currentUserId = firebase.auth().currentUser?.uid || null;
        const sameUsername = data.username === window.myDisplayName;
        const sameUserId = !!(data.senderUserId && currentUserId && data.senderUserId === currentUserId);
        const sameDevice = !!(data.senderDeviceId && data.senderDeviceId === window.notificationManager.deviceId);
        const isMe = sameUsername || sameUserId || sameDevice;
        if (!isMe && name !== "Sistem") {
          window.notificationManager.incrementUnread({ username: name, text: text });
        }
      }
      return result;
    };
  }
  
  const joinBtn = document.getElementById("join-btn");
  if (joinBtn) {
    const originalOnClick = joinBtn.onclick;
    joinBtn.onclick = async function() {
      // Give the app a moment to set the name/UI
      setTimeout(async () => {
        if (window.notificationManager) {
          await window.notificationManager.requestPermission();
        }
      }, 100);

      if (originalOnClick) return originalOnClick.apply(this, arguments);
    };
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(window.setupNotificationIntegration, 500));
} else {
  setTimeout(window.setupNotificationIntegration, 500);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      console.log("✅ SW Registered in scope:", reg.scope);

      if (window.notificationManager) {
        await window.notificationManager.ensurePushSubscription();
      }
    } catch (err) {
      console.error("❌ SW Registration failed:", err);
    }
  });
}