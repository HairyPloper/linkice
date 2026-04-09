// sw.js - Keep it simple and separate from your main app logic
self.addEventListener('push', function(event) {
    let payload = {
        title: 'Nova poruka',
        body: 'Neko je poslao poruku na Linkice.'
    };

    if (event.data) {
        try {
            // Try to parse JSON from Vercel/Web-Push
            payload = event.data.json();
        } catch (e) {
            // Fallback if the payload is just a string
            payload.body = event.data.text();
        }
    }

    const options = {
        body: payload.body,
        icon: 'favicon-v1.png', // Relative to the sw.js location
        badge: 'favicon-v1.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1'
        }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});