const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp({
    projectId: "cedar-carving-377410"
});

// Gen 1 Syntax: functions.storage.object().onFinalize
exports.moderateImage = functions.storage.bucket("cedar-carving-377410.firebasestorage.app").object().onFinalize(async (object) => {
    console.log("Create Trigger Fired!");
    console.log("Object Metadata:", JSON.stringify(object));
    console.log("Bucket Name:", object.bucket);

    // 1. Check if image
    if (!object.contentType.startsWith("image/")) {
        console.log("Not an image:", object.contentType);
        return null;
    }

    const docId = object.name.split('/').pop().split('.')[0];
    console.log(`Processing document ID: ${docId}`);

    try {
        const bucket = admin.storage().bucket(object.bucket);
        const file = bucket.file(object.name);

        let detections = {};

        console.log("Attempting REAL Cloud Vision API call (REST Mode)...");

        // 1. Get Access Token from Admin Credentials (ADC)
        // This uses the credentials already logged into your system/emulator
        const tokenObj = await admin.credential.applicationDefault().getAccessToken();
        const accessToken = tokenObj.access_token;

        // 2. Download and encode file
        console.log("Downloading file content...");
        const [fileContent] = await file.download();
        const base64Image = fileContent.toString('base64');

        // 3. Call Vision API directly via Fetch
        // We explicitly set 'x-goog-user-project' to ensure quota is billed to the real project
        const response = await fetch(`https://vision.googleapis.com/v1/images:annotate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'x-goog-user-project': 'cedar-carving-377410'
            },
            body: JSON.stringify({
                requests: [{
                    image: { content: base64Image },
                    features: [{ type: 'SAFE_SEARCH_DETECTION' }]
                }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Vision API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const result = data.responses[0];
        detections = result.safeSearchAnnotation || {};

        console.log("✅ Real API Call Successful (REST)!", detections);

        console.log(`🔎 Scan Result for ${docId}:`, detections);

        // 2. STRICTER RULES (User's Logic)
        const isUnsafe =
            detections.adult === "LIKELY" || detections.adult === "VERY_LIKELY" || detections.adult === "POSSIBLE" ||
            detections.violence === "LIKELY" || detections.violence === "VERY_LIKELY" || detections.violence === "POSSIBLE" ||
            detections.racy === "LIKELY" || detections.racy === "VERY_LIKELY";

        if (isUnsafe) {
            console.log(`🛑 BLOCKED: ${docId} (NSFW or Violence detected)`);
            await file.delete();
            await admin.firestore().collection("items").doc(docId).set({
                status: "rejected",
                reason: "Content flagged as unsafe"
            }, { merge: true });
        } else {
            console.log(`✅ APPROVED: ${docId}`);

            // Emulator Fallback for Signed URL
            let publicUrl;
            try {
                // Determine if we are running in emulator
                const isEmulator = process.env.FUNCTIONS_EMULATOR;

                if (isEmulator) {
                    throw new Error("Force emulator fallback");
                }

                const urls = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' });
                publicUrl = urls[0];
            } catch (signError) {
                console.warn("Using Emulator Public URL fallback");
                publicUrl = `http://127.0.0.1:9199/v0/b/${object.bucket}/o/${encodeURIComponent(object.name)}?alt=media`;
            }

            await admin.firestore().collection("items").doc(docId).set({
                status: "approved",
                publicUrl: publicUrl
            }, { merge: true });
        }

    } catch (error) {
        console.error("Error analyzing image:", error);
        try {
            await admin.firestore().collection("items").doc(docId).set({
                status: "failed",
                error: error.message
            }, { merge: true });
        } catch (e) {
            console.error("Failed to write error to Firestore", e);
        }
    }
});
