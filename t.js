// api/notify.js
import admin from "firebase-admin";
import webpush from "web-push";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL, // You need this to read the tokens
  });
}

// Set up your VAPID keys (The ones you generated in Firebase)
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT, // mailto:your@email.com
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

export default async function handler(req, res) {
  // 1. ADD CORS HEADERS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "https://hairyploper.github.io"); // Your domain
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
  );

  // 2. HANDLE PREFLIGHT (OPTIONS request)
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { title, message } = req.body;

  try {
    // 1. Get all browser "addresses" from your Realtime Database
    const db = admin.database();
    const snapshot = await db.ref("push_subscriptions").once("value");
    const subscriptions = snapshot.val();

    if (!subscriptions) {
      return res.status(200).json({ success: true, message: "No subscribers" });
    }

    // 2. Loop through every user and send the push
    const pushPromises = Object.values(subscriptions).map((sub) => {
      // sub is the JSON object we saved from the frontend
      return webpush
        .sendNotification(
          sub,
          JSON.stringify({
            title: title || "Nova poruka",
            body: message || "Neko je poslao poruku na Linkice.",
          }),
        )
        .catch((err) => {
          // If a token is expired, delete it from the database
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Optional: logic to remove dead tokens
          }
          console.error("Push error for one user:", err.message);
        });
    });

    await Promise.all(pushPromises);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("General Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
