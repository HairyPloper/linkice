/**
 * sw.js - MUST BE IN ROOT DIRECTORY
 * Service Worker for background operations (Push Notifications & Badging)
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    
    // 1. Handle the App Badge (The red bubble on the icon)
    // In Service Workers, we use self.navigator
    if ('setAppBadge' in self.navigator) {
      const count = parseInt(data.unreadCount, 10) || 1;
      event.waitUntil(self.navigator.setAppBadge(count));
    }

    // 2. Handle the Notification Banner
    if (data.title && data.message) {
      const options = {
        body: data.message,
        icon: '/favicon-v1.png',
        badge: '/favicon-v1.png', 
        tag: 'linkice-chat', // New messages replace old ones in the tray
        renotify: true,      // Vibrate/Sound even if replacing an old one
        data: {
          url: '/' // Store the landing page in the notification data
        }
      };

      event.waitUntil(
        self.registration.showNotification(data.title, options)
      );
    }
  } catch (err) {
    console.error('Error processing push event:', err);
  }
});

// Clear badge and open app when clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Clear the bubble
  if ('clearAppBadge' in self.navigator) {
    event.waitUntil(self.navigator.clearAppBadge());
  }
  
  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});